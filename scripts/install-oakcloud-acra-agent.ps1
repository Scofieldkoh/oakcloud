# OakCloud ACRA Local Agent - attended browser pilot installer
# Run on the staff Windows PC with Node.js 24 installed.
param([Parameter(Mandatory=$true)][string]$OakCloudUrl)
$ErrorActionPreference = 'Stop'
$oakCloudOrigin = ([Uri]$OakCloudUrl).GetLeftPart([System.UriPartial]::Authority)
if (-not $oakCloudOrigin.StartsWith('https://')) { throw 'OakCloudUrl must use HTTPS.' }
$tokenBytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($tokenBytes) } finally { $rng.Dispose() }
$pairingToken = ([BitConverter]::ToString($tokenBytes) -replace '-', '').ToLowerInvariant()
$nodeVersion = (& node --version)
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24[.]') { throw 'Node.js 24 is required.' }
$installDir = Join-Path $env:LOCALAPPDATA 'OakCloud\ACRA-Agent'
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
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
  if (req.method === 'OPTIONS' && (req.url === '/health' || req.url === '/launch-remote' || req.url === '/poc-fill')) {
    if (req.headers.origin !== ORIGIN) { res.writeHead(403).end(); return; }
    res.writeHead(204, {'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-OakCloud-Agent-Token','Access-Control-Allow-Private-Network':'true','Vary':'Origin'}).end(); return;
  }
  if (req.url === '/health' || req.url === '/launch-remote' || req.url === '/poc-fill') {
    if (req.headers.origin !== ORIGIN || !tokenMatches(req.headers['x-oakcloud-agent-token'])) { res.writeHead(403).end('Forbidden'); return; }
    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    res.setHeader('Vary','Origin');
    if (req.method === 'GET' && req.url === '/health') { res.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify({ok:true,version:'0.2.0'})); return; }
    if (req.method === 'POST' && req.url === '/poc-fill') {
      if (!activePage || activePage.isClosed() || busy) { res.writeHead(409).end('No active browser or agent busy'); return; }
      busy = true;
      try {
        if (new URL(activePage.url()).hostname !== 'www.bizfile.gov.sg') throw new Error('Not on Bizfile');
        const add = activePage.getByText('Add position holder', {exact:true});
        if (await add.count() !== 1) throw new Error('Add position holder control ambiguous');
        await add.click();
        const position = activePage.getByText('Select position', {exact:true});
        if (await position.count() !== 1) throw new Error('Position control ambiguous');
        await position.click();
        const director = activePage.getByText('Director', {exact:true});
        if (await director.count() !== 1) throw new Error('Director option ambiguous');
        await director.click();
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
Write-Host "Pairing token (keep private, enter in OakCloud): $pairingToken"
