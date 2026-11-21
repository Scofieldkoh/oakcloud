# OakCloud ACRA Local Agent - attended browser pilot installer
# Run on the staff Windows PC with Node.js 24 installed.
param([Parameter(Mandatory=$true)][string]$OakCloudUrl)
$ErrorActionPreference = 'Stop'
$oakCloudOrigin = ([Uri]$OakCloudUrl).GetLeftPart([System.UriPartial]::Authority)
if (-not $oakCloudOrigin.StartsWith('https://')) { throw 'OakCloudUrl must use HTTPS.' }
$installDir = Join-Path $env:LOCALAPPDATA 'OakCloud\ACRA-Agent'
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$agentPath = Join-Path $installDir 'agent.cjs'
$pairingToken = $null
if (Test-Path $agentPath) {
  $existingAgent = Get-Content -Raw -Path $agentPath
  if ($existingAgent -match "const TOKEN = '([a-f0-9]{64})';") {
    $pairingToken = $Matches[1]
  }
}
if (-not $pairingToken) {
  $tokenBytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($tokenBytes) } finally { $rng.Dispose() }
  $pairingToken = ([BitConverter]::ToString($tokenBytes) -replace '-', '').ToLowerInvariant()
}
$nodeVersion = (& node --version)
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24[.]') { throw 'Node.js 24 is required.' }
@'
{
  "name": "oakcloud-acra-local-agent",
  "version": "0.1.0",
  "private": true,
  "description": "Attended local ACRA browser pilot",
  "dependencies": {
    "playwright": "1.61.1"
  }
}
'@ | Set-Content -Encoding UTF8 (Join-Path $installDir 'package.json')
@'
'use strict';
const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const ORIGIN = '__OAKCLOUD_ORIGIN__';
const TOKEN = '__PAIRING_TOKEN__';
const tokenMatches = (provided) => typeof provided === 'string' && provided.length === TOKEN.length && timingSafeEqual(Buffer.from(provided), Buffer.from(TOKEN));
const { chromium } = require('playwright');
const HOST = '127.0.0.1';
const PORT = 48731;
const TARGET = 'https://www.bizfile.gov.sg/';
let browser = null;
let activePage = null;
let busy = false;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>OakCloud ACRA Local Agent</title><style>body{font:16px system-ui;max-width:640px;margin:60px auto;line-height:1.6;color:#222}button{padding:12px 20px;background:#165d43;color:white;border:0;border-radius:8px;cursor:pointer}small{color:#666}</style></head><body><h1>OakCloud ACRA Local Agent</h1><p>Attended browser pilot. Launches a separate visible Chromium browser for ACRA Bizfile.</p><form method="POST" action="/launch"><button type="submit">Open ACRA Bizfile</button></form><p><small>Sign in manually. This pilot does not populate forms, submit filings, store passwords, or connect to the OakCloud server.</small></p></body></html>`;
const server = http.createServer(async (req, res) => {
  if (req.headers.host !== HOST + ':' + PORT || req.headers.origin && req.headers.origin !== 'http://' + HOST + ':' + PORT && req.headers.origin !== ORIGIN) {
    res.writeHead(403).end('Forbidden'); return;
  }
  if (req.method === 'OPTIONS' && (req.url === '/health' || req.url === '/launch-remote' || req.url === '/poc-fill' || req.url === '/research-snapshot' || req.url === '/research-explore')) {
    if (req.headers.origin !== ORIGIN) { res.writeHead(403).end(); return; }
    res.writeHead(204, {'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-OakCloud-Agent-Token','Access-Control-Allow-Private-Network':'true','Vary':'Origin'}).end(); return;
  }
  if (req.url === '/health' || req.url === '/launch-remote' || req.url === '/poc-fill' || req.url === '/research-snapshot' || req.url === '/research-explore') {
    if (req.headers.origin !== ORIGIN || !tokenMatches(req.headers['x-oakcloud-agent-token'])) { res.writeHead(403).end('Forbidden'); return; }
    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    res.setHeader('Vary','Origin');
    if (req.method === 'GET' && req.url === '/health') { res.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify({ok:true,version:'0.2.0'})); return; }
    if (req.method === 'POST' && req.url === '/research-explore') {
      if (!browser || !browser.isConnected() || busy) { res.writeHead(409).end('No active browser or agent busy'); return; }
      busy = true;
      try {
        const pages = browser.contexts().flatMap(context => context.pages()).filter(p => !p.isClosed() && new URL(p.url()).hostname === 'www.bizfile.gov.sg');
        if (pages.length !== 1) throw new Error('Expected exactly one Bizfile page');
        const page = pages[0];
        const startUrl = page.url();
        const diagnostics = [];
        const branches = [];
        const maxTests = 35;
        const maxDepth = 3;
        let tests = 0;
        const forbidden = /save|submit|confirm|payment|delete|withdraw|remove|cancel|proceed|review|logout|sign|declar|upload|purchase/i;
        const scan = () => page.evaluate(() => {
          const clean = v => String(v || '').trim().slice(0,90);
          return Array.from(document.querySelectorAll('input,select,textarea,[role="combobox"],[role="radio"],[role="checkbox"]'))
            .filter(el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
            .slice(0,200).map(el => {
              const id = el.getAttribute('id');
              const label = id ? document.querySelector('label[for="' + CSS.escape(id) + '"]') : null;
              return {tag:el.tagName.toLowerCase(),type:clean(el.getAttribute('type')),role:clean(el.getAttribute('role')),
                label:clean(label?.textContent || el.closest('label')?.textContent || el.getAttribute('aria-label')),
                placeholder:clean(el.getAttribute('placeholder')),required:el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
                disabled:el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'};
            });
        });
        const discover = () => page.evaluate(() => {
          const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
          const clean = v => String(v || '').trim().slice(0,90);
          return Array.from(document.querySelectorAll('input[type="radio"],select,[role="combobox"],input[placeholder*="Select"],input[placeholder*="select"]'))
            .filter(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true')
            .slice(0,40).map((el,index) => {
              const id = el.getAttribute('id');
              const label = id ? document.querySelector('label[for="' + CSS.escape(id) + '"]') : null;
              return {index,kind:el.matches('input[type="radio"]')?'radio':el.tagName === 'SELECT'?'select':'custom',
                label:clean(label?.textContent || el.closest('label')?.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder')),
                checked:el.checked === true,selected:el.tagName === 'SELECT' ? el.selectedIndex : null,
                options:el.tagName === 'SELECT' ? Array.from(el.options).slice(0,15).map((o,i) => ({index:i,label:clean(o.textContent),empty:!o.value})) : []};
            });
        });
        const controlLocator = index => page.locator('input[type="radio"],select,[role="combobox"],input[placeholder*="Select"],input[placeholder*="select"]').filter({visible:true}).nth(index);
        const baseline = await scan();
        if (!baseline.length) {
          const add = page.getByText('Add position holder',{exact:true});
          if (await add.count() === 1 && await add.isVisible()) {
            await add.click({timeout:3000});
            diagnostics.push('Opened Add position holder form');
            await page.waitForTimeout(350);
          }
        }
        const initial = await scan();
        const signature = fields => fields.map(f => JSON.stringify(f)).sort();
        const diff = (before,after) => {
          const a = new Set(signature(before)), b = new Set(signature(after));
          return {appeared:after.filter(f => !a.has(JSON.stringify(f))),disappeared:before.filter(f => !b.has(JSON.stringify(f)))};
        };
        const seen = new Set();
        const explore = async (depth,trail) => {
          if (depth >= maxDepth || tests >= maxTests) return;
          const controls = await discover();
          for (const control of controls) {
            if (tests >= maxTests) break;
            if (forbidden.test(control.label)) { diagnostics.push('Skipped restricted control: ' + control.label); continue; }
            const key = trail.join('/') + ':' + control.kind + ':' + control.index;
            if (seen.has(key)) continue;
            seen.add(key);
            const before = await scan();
            if (control.kind === 'radio') {
              if (control.checked) continue;
              const locator = controlLocator(control.index);
              try {
                await locator.check({timeout:2000});
                await page.waitForTimeout(300);
                tests++;
                if (page.url() !== startUrl) throw new Error('Navigation detected');
                const after = await scan();
                branches.push({trail,depth,control:control.label,choice:control.label,...diff(before,after)});
                if (depth + 1 < maxDepth && tests < maxTests) await explore(depth+1,[...trail,control.label]);
              } catch(e) { diagnostics.push('Radio ' + control.label + ': ' + String(e.message).slice(0,90)); }
              finally { diagnostics.push('Radio selection may remain changed; verify manually'); }
            } else if (control.kind === 'select') {
              for (const option of control.options) {
                if (tests >= maxTests) break;
                if (option.empty || option.index === control.selected || forbidden.test(option.label)) continue;
                try {
                  await controlLocator(control.index).selectOption({index:option.index},{timeout:2000});
                  await page.waitForTimeout(300);
                  tests++;
                  if (page.url() !== startUrl) throw new Error('Navigation detected');
                  const after = await scan();
                  branches.push({trail,depth,control:control.label,choice:option.label,...diff(before,after)});
                  if (depth+1 < maxDepth && tests < maxTests) await explore(depth+1,[...trail,option.label]);
                } catch(e) { diagnostics.push('Select ' + control.label + ': ' + String(e.message).slice(0,90)); }
                finally { try { await controlLocator(control.index).selectOption({index:control.selected},{timeout:1500}); } catch { diagnostics.push('Could not restore ' + control.label); } }
              }
            } else {
              try {
                await controlLocator(control.index).click({timeout:2000});
                const options = page.getByRole('option');
                const count = Math.min(await options.count(),12);
                if (!count) { diagnostics.push('No ARIA options for ' + control.label); await page.keyboard.press('Escape'); continue; }
                const labels = [];
                for (let i=0;i<count;i++) labels.push((await options.nth(i).innerText()).trim().slice(0,80));
                await page.keyboard.press('Escape');
                for (const choice of labels) {
                  if (tests >= maxTests) break;
                  if (!choice || forbidden.test(choice)) continue;
                  try {
                    await controlLocator(control.index).click({timeout:2000});
                    const option = page.getByRole('option',{name:choice,exact:true});
                    if (await option.count() !== 1) { diagnostics.push('Ambiguous option: ' + choice); await page.keyboard.press('Escape'); continue; }
                    await option.click({timeout:2000});
                    await page.waitForTimeout(300);
                    tests++;
                    if (page.url() !== startUrl) throw new Error('Navigation detected');
                    const after = await scan();
                    branches.push({trail,depth,control:control.label,choice,...diff(before,after)});
                    if (depth+1 < maxDepth && tests < maxTests) await explore(depth+1,[...trail,choice]);
                  } catch(e) { diagnostics.push('Custom ' + choice + ': ' + String(e.message).slice(0,90)); }
                }
                diagnostics.push('Custom dropdown ' + control.label + ' may remain changed; verify manually');
              } catch(e) { diagnostics.push('Custom ' + control.label + ': ' + String(e.message).slice(0,90)); }
            }
          }
        };
        await explore(0,[]);
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({ok:true,research:{schemaVersion:2,capturedAt:new Date().toISOString(),path:new URL(startUrl).pathname,baseline,initial,branches,optionsTested:tests,diagnostics:diagnostics.slice(0,100),limits:{maxTests,maxDepth},warning:'Exploration may change selections and trigger server effects. Inspect form and discard test filing. No save or submit action is invoked.'}}));
      } catch(error) {
        console.error('Research exploration failed:',error);
        res.writeHead(422,{'Content-Type':'application/json'}).end(JSON.stringify({ok:false,message:String(error.message).slice(0,180)}));
      } finally { busy = false; }
      return;
    }
    if (req.method === 'GET' && req.url === '/research-snapshot') {
      if (!browser || !browser.isConnected() || busy) { res.writeHead(409).end('No active browser or agent busy'); return; }
      busy = true;
      try {
        const pages = browser.contexts().flatMap(context => context.pages()).filter(page => !page.isClosed() && new URL(page.url()).hostname === 'www.bizfile.gov.sg');
        if (pages.length !== 1) throw new Error('Expected one open Bizfile page; found ' + pages.length);
        const page = pages[0];
        const snapshot = await page.evaluate(() => {
          const clean = value => String(value || '').trim().slice(0, 120);
          const fields = Array.from(document.querySelectorAll('input,select,textarea,[role="combobox"],[role="checkbox"],[role="radio"]')).slice(0, 300).map(el => {
            const id = el.getAttribute('id');
            const label = id ? Array.from(document.querySelectorAll('label')).find(item => item.getAttribute('for') === id) : null;
            const parentLabel = el.closest('label');
            return {
              tag: el.tagName.toLowerCase(),
              type: clean(el.getAttribute('type')),
              role: clean(el.getAttribute('role')),
              label: clean(label?.textContent || parentLabel?.textContent || el.getAttribute('aria-label')),
              placeholder: clean(el.getAttribute('placeholder')),
              required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
              disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
              visible: !!el.getClientRects().length,
              options: el.tagName === 'SELECT' ? Array.from(el.options).slice(0, 40).map(option => clean(option.textContent)) : []
            };
          });
          const buttons = Array.from(document.querySelectorAll('button,[role="button"]')).slice(0, 150).map(el => ({
            label: clean(el.getAttribute('aria-label') || el.textContent),
            disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
            visible: !!el.getClientRects().length
          }));
          const headings = Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 40).map(el => clean(el.textContent));
          return {title:clean(document.title),headings,fields,buttons};
        });
        const url = new URL(page.url());
        const payload = {schemaVersion:1,capturedAt:new Date().toISOString(),host:url.hostname,path:url.pathname,...snapshot};
        res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({ok:true,snapshot:payload}));
      } catch (error) {
        console.error('Research snapshot failed:', error);
        res.writeHead(422, {'Content-Type':'application/json'}).end(JSON.stringify({ok:false,message:String(error.message).slice(0,180)}));
      } finally { busy = false; }
      return;
    }
    if (req.method === 'POST' && req.url === '/poc-fill') {
      if (!activePage || activePage.isClosed() || busy) { res.writeHead(409).end('No active browser or agent busy'); return; }
      busy = true;
      try {
        if (new URL(activePage.url()).hostname !== 'www.bizfile.gov.sg') throw new Error('Not on Bizfile');
        const add = activePage.getByText('Add position holder', {exact:true});
        if (await add.count() !== 1) throw new Error('Add position holder control ambiguous');
        await add.click();
        const position = activePage.getByRole('combobox', {name:/position held/i});
        const labeled = activePage.getByLabel(/position held/i);
        const placeholder = activePage.getByPlaceholder(/select position/i);
        const choices = [
          ['named combobox', position],
          ['labeled field', labeled],
          ['placeholder field', placeholder]
        ];
        const counts = [];
        let selected = null;
        for (const [name, locator] of choices) {
          const count = await locator.count();
          counts.push(name + '=' + count);
          if (!selected && count === 1) selected = locator;
        }
        if (!selected) throw new Error('Position field not uniquely identified (' + counts.join(', ') + ')');
        await selected.click();
        const director = activePage.getByRole('option', {name:'Director',exact:true});
        const directorText = activePage.getByText('Director', {exact:true});
        const optionCount = await director.count();
        const textCount = await directorText.count();
        if (optionCount === 1) await director.click();
        else if (textCount === 1) await directorText.click();
        else throw new Error('Director option ambiguous (role options=' + optionCount + ', exact text=' + textCount + ')');
        res.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify({ok:true,message:'Director selected. Review manually; nothing saved.'}));
      } catch(e) {
        console.error('POC failed:', e);
        res.writeHead(422, {'Content-Type':'application/json'}).end(JSON.stringify({ok:false,message:'POC stopped. Check agent console.'}));
      } finally { busy = false; }
      return;
    }
    if (req.method !== 'POST' || req.url !== '/launch-remote') { res.writeHead(405).end(); return; }
    req.url = '/launch';
  }
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(html);
    return;
  }
  if (req.method === 'POST' && req.url === '/launch') {
    if (busy) { res.writeHead(409).end('Browser is already starting.'); return; }
    busy = true;
    try {
      if (browser && browser.isConnected()) {
        res.writeHead(200, {'Content-Type':'text/plain'}).end('Browser already running. Switch to the Chromium window.');
      } else {
        browser = await chromium.launch({headless:false});
        const page = await browser.newPage();
        activePage = page;
        await page.goto(TARGET, {waitUntil:'domcontentloaded',timeout:45000});
        res.writeHead(200, {'Content-Type':'text/plain'}).end('ACRA Bizfile browser opened. You may return to this window.');
        browser.on('disconnected', () => { browser = null; activePage = null; });
      }
    } catch(e) {
      console.error(e);
      res.writeHead(500, {'Content-Type':'text/plain'}).end('Browser launch failed. Check the agent console.');
    } finally { busy = false; }
    return;
  }
  res.writeHead(404).end('Not found');
});
server.listen(PORT, HOST, () => {
  console.log('OakCloud ACRA Agent running at http://' + HOST + ':' + PORT);
  console.log('Keep this window open while using the pilot. Press Ctrl+C to stop.');
});
process.on('SIGINT', async () => { if (browser) await browser.close(); server.close(); process.exit(0); });
'@ | ForEach-Object { $_.Replace('__OAKCLOUD_ORIGIN__', $oakCloudOrigin).Replace('__PAIRING_TOKEN__', $pairingToken) } | Set-Content -Encoding UTF8 (Join-Path $installDir 'agent.cjs')
Push-Location $installDir
try {
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
  npx playwright install chromium
  if ($LASTEXITCODE -ne 0) { throw 'Chromium install failed' }
} finally { Pop-Location }
$launcher = Join-Path $installDir 'Start-OakCloud-Agent.cmd'
@'
@echo off
cd /d "%LOCALAPPDATA%\OakCloud\ACRA-Agent"
echo Open http://127.0.0.1:48731/ in your browser after the agent starts.
node agent.cjs
pause
'@ | Set-Content -Encoding ASCII $launcher
Write-Host "Installed to $installDir"
Write-Host "Run $launcher to start the pilot."

Write-Host "OakCloud allowed origin: $oakCloudOrigin"
Write-Host "Pairing token (unchanged on reinstall; keep private): $pairingToken"
