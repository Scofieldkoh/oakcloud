/**
 * A local fake Sentroweb for browser tests of the client. It serves pages built from the
 * recorded fixtures (login form, confirm modal, export modal, result accordions) plus the three
 * XHR endpoints the real app uses, and it records every request and every click on a control
 * the client must never touch (Manage Ongoing Monitoring, false match, Save, Cancel on a result).
 *
 * The page header (Balance) is synthetic and lives here, not in the fixtures.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { cloneFixtureJson, fixtureText, type FixtureCase } from './sentroweb-fixtures';

export const FAKE_ACCOUNT_ID = 'ACCT-FAKE-4242';
export const FAKE_USERNAME = 'fake.user@example.invalid';
export const FAKE_PASSWORD = 'fake-Pa55-w0rd-XYZ';
/** A filename shaped like Sentroweb's, containing the (fake) account id. */
export const FAKE_PDF_FILENAME = `report_${FAKE_ACCOUNT_ID}_77.pdf`;

export interface FakeOptions {
  balance: number;
  /** Credits the confirm modal claims per search. */
  modalCost: number;
  /** The authenticate endpoint answers 2xx but the page asks for a one-time code. */
  requireOtp: boolean;
  /** The main page loads without the search form (an unexpected post-login page). */
  unexpectedLanding: boolean;
  /**
   * The real header shows "Balance: 0" until the page's initializeApp call answers (then the real
   * number). `initDelayMs` is how long that call takes; `initStatus` is its status (non-200 leaves
   * the placeholder in place).
   */
  initDelayMs: number;
  initStatus: number;
  /** Delay before the search endpoint answers. */
  searchDelayMs: number;
  /** Status of the PDF download endpoint. */
  pdfStatus: number;
  /** Delay before the PDF download starts answering. */
  pdfDelayMs: number;
  /** Status of the search endpoint. */
  searchStatus: number;
  /** Remove the accordion titles from the page after the search. */
  omitResultTitles: boolean;
  /** Serve the login page instead of the search page for the Nth main-page request (1-based). */
  expireSessionOnMainRequest: number | null;
  /** Maps a search to the fixture that answers it. */
  resolveCase: (name: string, searchType: 'INDIVIDUAL' | 'ENTITY') => FixtureCase;
}

const DEFAULTS: FakeOptions = {
  balance: 372,
  modalCost: 1,
  requireOtp: false,
  unexpectedLanding: false,
  searchDelayMs: 0,
  initDelayMs: 400,
  initStatus: 200,
  pdfStatus: 200,
  pdfDelayMs: 0,
  searchStatus: 200,
  omitResultTitles: false,
  expireSessionOnMainRequest: null,
  resolveCase: (name, searchType) => {
    const lower = name.toLowerCase();
    if (lower.includes('putin')) return 'individual-match';
    if (lower.includes('rosneft')) return 'entity-match';
    return searchType === 'ENTITY' ? 'entity-clear' : 'individual-clear';
  },
};

export interface FakeEvent {
  type:
    | 'authenticate'
    | 'checkquota'
    | 'search'
    | 'download'
    | 'logout'
    | 'cancel-clicked'
    | 'forbidden-click'
    | 'main-page';
  detail?: string;
}

export interface FakeSentroweb {
  baseUrl: string;
  options: FakeOptions;
  events: FakeEvent[];
  /** Search requests the endpoint received: `{ name, searchEntity, searchIndividual, fuzzy }`. */
  searches: Array<{ name: string; searchEntity: boolean; searchIndividual: boolean; fuzzy: boolean }>;
  count(type: FakeEvent['type']): number;
  close(): Promise<void>;
}

const PAGE_STYLE = `
  body { font-family: sans-serif; }
  .modal { border: 1px solid #888; padding: 12px; margin: 12px; width: 420px; background: #fff; }
  .checkbox label { cursor: pointer; padding: 4px; display: inline-block; }
  .checkbox.checked label { font-weight: bold; }
  i.icon { display: inline-block; width: 24px; height: 24px; background: #ccc; }
  button { padding: 6px 12px; }
  .menu .item { display: block; padding: 4px; }
`;

function loginPage(): string {
  return `<!doctype html><html><head><title>Fake Sentroweb login</title><style>${PAGE_STYLE}</style></head><body>
${fixtureText('login-form.html')}
<p id="message"></p>
<script>
  const button = document.querySelector('button');
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    const value = (name) => document.querySelector('input[name=' + name + ']').value;
    const response = await fetch('/sentroweb-service/auth/private/authenticate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: value('accountId'), username: value('username'), password: value('password') }),
    });
    if (!response.ok) { document.getElementById('message').textContent = 'Login failed'; return; }
    const body = await response.json();
    if (body.otp) { document.getElementById('message').textContent = 'Enter the verification code we sent you'; return; }
    window.location.href = '/SentroWeb/main?tab=search';
  });
</script></body></html>`;
}

function mainPage(options: FakeOptions): string {
  if (options.unexpectedLanding) {
    return '<!doctype html><html><body><h1>Welcome to the new Sentroweb</h1><p>Our new dashboard is here.</p></body></html>';
  }
  const checkbox = (label: string) =>
    `<div class="field"><div class="ui checkbox cdd-checkbox pink-checkbox"><input class="hidden" readonly="" tabindex="0" type="checkbox" value=""><label>${label}</label></div></div>`;
  return `<!doctype html><html><head><title>Fake Sentroweb</title><style>${PAGE_STYLE}</style></head><body>
<div id="header">
  <i class="bars icon" id="burger"></i>
  <span id="balance">Balance: 0</span>
  <div class="ui menu" id="menu" style="display:none">
    <a class="item" id="menu-cdd">CDD Dashboard</a>
    <a class="item" id="menu-manage">Manage Ongoing Monitoring</a>
    <a class="item" id="menu-logout">Logout</a>
  </div>
</div>
<form class="ui large error form" onsubmit="return false">
  <div class="required field"><label>Search name</label><div class="ui input"><input placeholder="Search name" type="text" value=""></div></div>
  <div class="fields">${checkbox('Individual')}${checkbox('Entity')}</div>
  <div class="fields">${checkbox('Male')}${checkbox('Female')}</div>
  <div class="field"><label>Date of birth</label><input name="birthDate" placeholder="YYYY-MM-DD" type="text" value=""></div>
  <div class="fields">${checkbox('Fuzzy Search')}<button class="ui large disabled button search-button" disabled="" type="submit" tabindex="-1">SEARCH</button></div>
  <div class="fields"><button class="ui large button right-export-button" type="button">EXPORT</button></div>
</form>
<div class="twelve wide column"><div id="result"></div></div>
<div id="modal-host"></div>
<script>
  const form = document.querySelector('form');
  const nameInput = form.querySelector('input[placeholder="Search name"]');
  const submit = form.querySelector('button.search-button');
  const boxes = Array.from(form.querySelectorAll('.checkbox'));
  const labelOf = (box) => box.querySelector('label').textContent.trim();
  const box = (label) => boxes.find((b) => labelOf(b) === label);
  const isChecked = (label) => box(label).classList.contains('checked');
  function refresh() {
    const ready = nameInput.value.trim() !== '' && (isChecked('Individual') || isChecked('Entity'));
    submit.disabled = !ready;
    submit.classList.toggle('disabled', !ready);
  }
  boxes.forEach((b) => b.addEventListener('click', () => {
    const label = labelOf(b);
    b.classList.toggle('checked');
    if (b.classList.contains('checked') && label === 'Individual') box('Entity').classList.remove('checked');
    if (b.classList.contains('checked') && label === 'Entity') box('Individual').classList.remove('checked');
    refresh();
  }));
  nameInput.addEventListener('input', refresh);

  fetch('/sentroweb-service/account/private/initializeApp', { method: 'POST' }).then(async (response) => {
    if (!response.ok) return;
    const body = await response.json();
    document.getElementById('balance').textContent = 'Balance: ' + body.balance;
  });

  const menu = document.getElementById('menu');
  document.getElementById('burger').addEventListener('click', () => { menu.style.display = menu.style.display === 'none' ? 'block' : 'none'; });
  document.getElementById('menu-manage').addEventListener('click', () => fetch('/__forbidden?what=manage-ongoing-monitoring'));
  document.getElementById('menu-logout').addEventListener('click', async () => {
    await fetch('/sentroweb-service/auth/private/logout', { method: 'POST' });
    window.location.href = '/SentroWeb/login';
  });

  const host = document.getElementById('modal-host');
  const query = () => ({ queries: [{
    country: '', fuzzy: isChecked('Fuzzy Search'), name: nameInput.value, dateOfBirth: '',
    searchEntity: isChecked('Entity'), searchIndividual: isChecked('Individual'), gender: null }] });

  submit.addEventListener('click', async (event) => {
    event.preventDefault();
    const response = await fetch('/sentroweb-service/account/private/checkquota', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(query()) });
    const quota = await response.json();
    host.innerHTML = quota.modalHtml;
    host.querySelector('button.negative').addEventListener('click', () => {
      fetch('/__event?type=cancel-clicked'); host.innerHTML = '';
    });
    host.querySelector('button.positive').addEventListener('click', async () => {
      host.innerHTML = '';
      const search = await fetch('/sentroweb-service/screening/private/search', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(query()) });
      if (!search.ok) return;
      await search.json();
      const html = await (await fetch('/__result-html?name=' + encodeURIComponent(nameInput.value) +
        '&entity=' + isChecked('Entity'))).text();
      document.getElementById('result').innerHTML = html;
      for (const [selector, what] of [['.screening-result-save-button', 'save'], ['.screening-result-cancel-button', 'result-cancel'],
        ['.cdd-checkbox label', 'false-match']]) {
        document.querySelectorAll('#result ' + selector).forEach((el) =>
          el.addEventListener('click', () => fetch('/__forbidden?what=' + what)));
      }
    });
  });

  form.querySelector('.right-export-button').addEventListener('click', async () => {
    host.innerHTML = await (await fetch('/__export-modal')).text();
  });
</script></body></html>`;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function startFakeSentroweb(overrides: Partial<FakeOptions> = {}): Promise<FakeSentroweb> {
  const options: FakeOptions = { ...DEFAULTS, ...overrides };
  const events: FakeEvent[] = [];
  const searches: FakeSentroweb['searches'] = [];
  let mainRequests = 0;

  const hasSession = (request: IncomingMessage) => /(?:^|;\s*)sw_session=ok/.test(request.headers.cookie ?? '');
  const html = (response: ServerResponse, body: string, status = 200) => {
    response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
    response.end(body);
  };
  const json = (response: ServerResponse, body: unknown, status = 200, headers: Record<string, string> = {}) => {
    response.writeHead(status, { 'content-type': 'application/json', ...headers });
    response.end(JSON.stringify(body));
  };

  const server: Server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://fake.local');
    const route = `${request.method} ${url.pathname}`;
    try {
      if (route === 'GET /SentroWeb/login') return html(response, loginPage());

      if (route === 'GET /SentroWeb/main') {
        mainRequests += 1;
        events.push({ type: 'main-page' });
        const expired = options.expireSessionOnMainRequest === mainRequests;
        if (!hasSession(request) || expired) {
          response.writeHead(302, {
            location: '/SentroWeb/login',
            ...(expired ? { 'set-cookie': 'sw_session=; Path=/; Max-Age=0' } : {}),
          });
          return response.end();
        }
        return html(response, mainPage(options));
      }

      if (route === 'POST /sentroweb-service/auth/private/authenticate') {
        const body = JSON.parse((await readBody(request)) || '{}') as Record<string, string>;
        events.push({ type: 'authenticate' });
        const ok = body.accountId === FAKE_ACCOUNT_ID && body.username === FAKE_USERNAME && body.password === FAKE_PASSWORD;
        if (!ok) return json(response, { error: 'bad credentials' }, 401);
        return json(response, { otp: options.requireOtp }, 200, {
          'set-cookie': options.requireOtp ? 'sw_pending=1; Path=/' : 'sw_session=ok; Path=/; HttpOnly',
        });
      }

      if (route === 'POST /sentroweb-service/auth/private/logout') {
        events.push({ type: 'logout' });
        return json(response, {}, 200, { 'set-cookie': 'sw_session=; Path=/; Max-Age=0' });
      }

      if (!hasSession(request) && url.pathname.startsWith('/sentroweb-service/')) return json(response, {}, 401);

      if (route === 'POST /sentroweb-service/account/private/initializeApp') {
        await sleep(options.initDelayMs);
        if (options.initStatus !== 200) return json(response, { error: 'init failed' }, options.initStatus);
        return json(response, { balance: options.balance });
      }

      if (route === 'POST /sentroweb-service/account/private/checkquota') {
        await readBody(request);
        events.push({ type: 'checkquota' });
        const modalHtml = fixtureText('confirm-modal.html').replace('1 credit(s)', `${options.modalCost} credit(s)`);
        return json(response, { deductCredit: true, currentBalance: options.balance, uniqueNames: [], modalHtml });
      }

      if (route === 'POST /sentroweb-service/screening/private/search') {
        const body = JSON.parse(await readBody(request)) as { queries: Array<Record<string, unknown>> };
        const query = body.queries[0];
        const name = String(query.name);
        const searchType = query.searchEntity === true ? 'ENTITY' : 'INDIVIDUAL';
        searches.push({
          name,
          searchEntity: query.searchEntity === true,
          searchIndividual: query.searchIndividual === true,
          fuzzy: query.fuzzy === true,
        });
        events.push({ type: 'search', detail: name });
        if (options.searchDelayMs > 0) await sleep(options.searchDelayMs);
        if (options.searchStatus !== 200) return json(response, { error: 'boom' }, options.searchStatus);
        const payload = cloneFixtureJson<Array<Record<string, unknown>>>(
          `search-${options.resolveCase(name, searchType)}.json`,
        );
        payload[0].name = name;
        payload[0].searchEntity = searchType === 'ENTITY';
        payload[0].searchIndividual = searchType === 'INDIVIDUAL';
        return json(response, payload);
      }

      if (route === 'GET /__result-html') {
        const name = url.searchParams.get('name') ?? '';
        const searchType = url.searchParams.get('entity') === 'true' ? 'ENTITY' : 'INDIVIDUAL';
        if (options.omitResultTitles) return html(response, '<div class="accordion ui"></div>');
        return html(response, fixtureText(`result-${options.resolveCase(name, searchType)}.html`));
      }

      if (route === 'GET /__export-modal') return html(response, fixtureText('export-modal.html'));

      if (route === 'GET /sentroweb-service/report/private/download') {
        events.push({ type: 'download' });
        if (options.pdfDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, options.pdfDelayMs));
        if (options.pdfStatus !== 200) return json(response, { error: 'no report' }, options.pdfStatus);
        const pdf = Buffer.from(`%PDF-1.4\n% fake report\n${'x'.repeat(2000)}\n%%EOF\n`, 'latin1');
        response.writeHead(200, {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${FAKE_PDF_FILENAME}"`,
          'content-length': String(pdf.length),
        });
        return response.end(pdf);
      }

      if (route === 'GET /__forbidden') {
        events.push({ type: 'forbidden-click', detail: url.searchParams.get('what') ?? '' });
        return json(response, {});
      }
      if (route === 'GET /__event') {
        events.push({ type: url.searchParams.get('type') as FakeEvent['type'] });
        return json(response, {});
      }

      response.writeHead(404);
      response.end('not found');
    } catch {
      response.writeHead(500);
      response.end('fake server error');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    options,
    events,
    searches,
    count: (type) => events.filter((event) => event.type === type).length,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
