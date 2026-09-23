const SUPERDOC_POC_FRAME = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/superdoc@2.16.0/dist-cdn/superdoc.min.css" />
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; max-width: 100vw; min-height: 100%; overflow: hidden; background: #f8f9fb; color: #1a1d23; }
    button, input, select { font: inherit; }
    .shell { width: 100%; max-width: 100vw; min-width: 0; min-height: 100vh; display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }
    .topbar { background: #fff; border-bottom: 1px solid #e2e4e9; padding: 12px 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .title { font-size: 15px; font-weight: 700; margin-right: auto; }
    .badge { display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border-radius: 999px; font-size: 12px; background: #eef5f3; color: #294d44; border: 1px solid #cdded9; }
    .upload { display: inline-flex; align-items: center; gap: 8px; border: 1px solid #d0d3d9; border-radius: 7px; height: 34px; padding: 0 10px; background: #fff; cursor: pointer; }
    .upload:hover { background: #f7f8fa; }
    .upload input { display: none; }
    .action { height: 34px; padding: 0 12px; border-radius: 7px; border: 1px solid #d0d3d9; background: #fff; cursor: pointer; }
    .action:hover:not(:disabled) { background: #f5f7f7; }
    .action.primary { background: #294d44; border-color: #294d44; color: #fff; }
    .action.primary:hover:not(:disabled) { background: #23423a; }
    .action:disabled { opacity: .5; cursor: not-allowed; }
    .workspace { width: 100%; max-width: 100%; min-width: 0; min-height: 0; display: grid; grid-template-columns: 280px minmax(0, 1fr); overflow: hidden; }
    .sidebar { min-width: 0; background: #fff; border-right: 1px solid #e2e4e9; padding: 14px; overflow: auto; }
    .section { margin-bottom: 18px; }
    .section h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #7d838f; }
    .help { margin: 0 0 10px; font-size: 12px; line-height: 1.45; color: #5c6370; }
    .search, .company { width: 100%; height: 34px; padding: 0 9px; border: 1px solid #d0d3d9; border-radius: 7px; background: #fff; color: #1a1d23; }
    .field-list { display: grid; gap: 6px; margin-top: 8px; }
    .field { width: 100%; text-align: left; border: 1px solid #e2e4e9; border-radius: 7px; background: #fff; padding: 8px 9px; cursor: pointer; }
    .field:hover:not(:disabled) { border-color: #9ab6af; background: #f7fbfa; }
    .field:disabled { opacity: .45; cursor: not-allowed; }
    .field-label { display: block; font-size: 13px; font-weight: 600; }
    .field-tag { display: block; margin-top: 2px; color: #7d838f; font-size: 11px; word-break: break-all; }
    .status { margin-top: 10px; border-radius: 7px; padding: 9px 10px; font-size: 12px; line-height: 1.4; background: #f1f3f5; color: #5c6370; }
    .status.ok { background: #eef7f1; color: #275b39; }
    .status.error { background: #fff1f1; color: #9b2c2c; }
    .editor-shell { width: 100%; max-width: 100%; min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; contain: inline-size; }
    #superdoc-toolbar { width: 100%; max-width: 100%; min-width: 0; min-height: 42px; overflow: hidden; background: #fff; border-bottom: 1px solid #e2e4e9; contain: inline-size; }
    #editor-wrap { width: 100%; max-width: 100%; min-width: 0; min-height: 0; position: relative; overflow: hidden; background: #eceff1; contain: inline-size; }
    #editor { width: 100%; max-width: 100%; min-width: 0; height: calc(100vh - 99px); overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
    .empty { position: absolute; inset: 24px; display: grid; place-items: center; pointer-events: none; }
    .empty-card { max-width: 520px; background: #fff; border: 1px dashed #c7cbd1; border-radius: 12px; padding: 26px; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,.04); }
    .empty-card strong { display: block; font-size: 16px; margin-bottom: 8px; }
    .empty-card span { color: #5c6370; font-size: 13px; line-height: 1.5; }
    .meta { margin-top: 8px; font-size: 11px; color: #7d838f; }
    @media (max-width: 900px) { .workspace { grid-template-columns: 230px minmax(0, 1fr); } }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="title">SuperDoc DOCX template POC</div>
      <span class="badge">Isolated experiment</span>
      <label class="upload"><span>Import Word .docx</span><input id="file" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></label>
      <button id="resolve" class="action" disabled>Resolve fields</button>
      <button id="export" class="action primary" disabled>Export DOCX</button>
    </header>
    <main class="workspace">
      <aside class="sidebar">
        <section class="section">
          <h2>Company context</h2>
          <p class="help">Choose a real Oakcloud company. Resolve fields updates every matching DOCX content-control tag.</p>
          <select id="company" class="company"><option value="">Select company...</option></select>
        </section>
        <section class="section">
          <h2>Template fields</h2>
          <p class="help">Place the caret, or select existing text, then click a field. Oakcloud inserts its familiar {{field}} token directly into the DOCX.</p>
          <input id="field-search" class="search" placeholder="Search fields..." />
          <div id="fields" class="field-list"></div>
          <div id="status" class="status">Import a DOCX to begin.</div>
          <div id="meta" class="meta"></div>
        </section>
      </aside>
      <section class="editor-shell">
        <div id="superdoc-toolbar"></div>
        <div id="editor-wrap">
          <div id="editor"></div>
          <div id="empty" class="empty"><div class="empty-card"><strong>Import an existing Microsoft Word document</strong><span>The DOCX remains the source document. This POC tests editing, Oakcloud field tagging, value resolution, and DOCX export.</span></div></div>
        </div>
      </section>
    </main>
  </div>
  <script type="module">
    import { SuperDoc } from 'https://esm.sh/superdoc@2.16.0?bundle';

    const fileInput = document.getElementById('file');
    const companySelect = document.getElementById('company');
    const resolveButton = document.getElementById('resolve');
    const exportButton = document.getElementById('export');
    const fieldsContainer = document.getElementById('fields');
    const fieldSearch = document.getElementById('field-search');
    const status = document.getElementById('status');
    const meta = document.getElementById('meta');
    const empty = document.getElementById('empty');

    const fieldDefinitions = [
      { tag: 'company.name', label: 'Company name', source: 'company', key: 'name' },
      { tag: 'company.uen', label: 'UEN', source: 'company', key: 'uen' },
      { tag: 'company.registeredAddress', label: 'Registered address', source: 'company', key: 'registeredAddress' },
      { tag: 'company.incorporationDate', label: 'Incorporation date', source: 'company', key: 'incorporationDate' },
      { tag: 'company.primarySsicDescription', label: 'Primary business activity', source: 'company', key: 'primarySsicDescription' },
      { tag: 'company.homeCurrency', label: 'Home currency', source: 'company', key: 'homeCurrency' },
      { tag: 'system.currentDate', label: 'Current date', source: 'system', key: 'currentDate' }
    ];

    let superdoc = null;
    let companyById = new Map();
    let currentFileName = 'oakcloud-template.docx';

    function setStatus(message, kind) {
      status.textContent = message;
      status.className = 'status' + (kind ? ' ' + kind : '');
    }

    function formatDate(value) {
      if (!value) return '';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return String(value);
      return new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
    }

    function fieldValue(field, company) {
      if (field.source === 'system') return formatDate(new Date());
      const value = company ? company[field.key] : null;
      if (field.key === 'incorporationDate') return formatDate(value);
      return value == null ? '' : String(value);
    }

    function activeDoc() {
      return superdoc && superdoc.activeEditor ? superdoc.activeEditor.doc : null;
    }

    function renderFields() {
      const query = fieldSearch.value.trim().toLowerCase();
      const visible = fieldDefinitions.filter((field) =>
        !query || field.label.toLowerCase().includes(query) || field.tag.toLowerCase().includes(query)
      );
      fieldsContainer.innerHTML = '';
      for (const field of visible) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'field';
        button.disabled = !activeDoc();
        const label = document.createElement('span');
        label.className = 'field-label';
        label.textContent = field.label;
        const tag = document.createElement('span');
        tag.className = 'field-tag';
        tag.textContent = field.tag;
        button.append(label, tag);
        button.addEventListener('pointerdown', (event) => event.preventDefault());
        button.addEventListener('click', () => void insertField(field));
        fieldsContainer.appendChild(button);
      }
    }

    async function insertField(field) {
      const doc = activeDoc();
      if (!doc) return setStatus('Import a DOCX first.', 'error');

      try {
        const selection = await doc.selection.current({ includeText: true });
        const target = selection.selectionTarget;
        if (!target) {
          return setStatus('Place the caret in the document or select text first.', 'error');
        }

        const token = '{{' + field.tag + '}}';
        const receipt = selection.empty
          ? await doc.insert({ target, value: token })
          : await doc.replace({ target, text: token });

        if (!receipt || receipt.success === false) {
          throw new Error(receipt && receipt.failure ? receipt.failure.message : 'SuperDoc could not insert the field.');
        }

        setStatus(
          selection.empty
            ? 'Inserted ' + token + ' at the caret.'
            : 'Converted the selected text to ' + token + '.',
          'ok'
        );
        await refreshMetadata();
      } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : 'Could not insert the field.', 'error');
      }
    }

    async function resolveFields() {
      const doc = activeDoc();
      if (!doc) return;
      const company = companyById.get(companySelect.value) || null;
      if (!company) return setStatus('Select a company before resolving fields.', 'error');

      resolveButton.disabled = true;
      let updated = 0;
      let matched = 0;
      const failures = [];

      try {
        for (const field of fieldDefinitions) {
          const value = fieldValue(field, company);
          const token = '{{' + field.tag + '}}';

          // Resolve native Word/SuperDoc content controls when the imported
          // document already contains them.
          try {
            const tagged = await doc.contentControls.selectByTag({ tag: field.tag });
            const controls = Array.isArray(tagged && tagged.items) ? tagged.items : [];
            matched += controls.length;

            for (const control of controls) {
              try {
                if (control.controlType !== 'text') {
                  failures.push(
                    field.tag + ': content control type "' + control.controlType + '" is not a text field'
                  );
                  continue;
                }

                const receipt = await doc.contentControls.text.setValue({
                  target: control.target,
                  value
                });

                if (receipt && receipt.success) updated += 1;
                else if (receipt?.failure?.code !== 'NO_OP') {
                  failures.push(field.tag + ': ' + (receipt?.failure?.message || 'content-control update failed'));
                }
              } catch (error) {
                failures.push(field.tag + ': ' + (error instanceof Error ? error.message : 'content-control update failed'));
              }
            }
          } catch (error) {
            // A DOCX does not need content controls to be a valid Oakcloud
            // template, so continue with {{field}} tokens.
            console.debug('Content-control lookup skipped for', field.tag, error);
          }

          // Resolve Oakcloud's existing placeholder notation. Re-query after
          // every mutation because Document API targets belong to a specific
          // document revision.
          if (value !== token) {
            for (let occurrence = 0; occurrence < 200; occurrence += 1) {
              const query = await doc.query.match({
                select: {
                  type: 'text',
                  pattern: token,
                  mode: 'contains',
                  caseSensitive: true
                },
                require: 'any',
                limit: 1
              });
              const item = Array.isArray(query.items) ? query.items[0] : null;
              if (!item || item.matchKind !== 'text') break;

              matched += 1;
              const receipt = await doc.replace(
                { target: item.target, text: value },
                { expectedRevision: query.evaluatedRevision }
              );
              if (!receipt || receipt.success === false) {
                failures.push(field.tag + ': ' + (receipt?.failure?.message || 'placeholder update failed'));
                break;
              }
              updated += 1;
            }
          }
        }

        if (matched === 0) {
          setStatus('No Oakcloud placeholders or matching Word content controls were found.', 'error');
        } else if (failures.length) {
          setStatus('Resolved ' + updated + ' of ' + matched + ' field occurrences. ' + failures[0], 'error');
        } else {
          setStatus('Resolved all ' + updated + ' field occurrences from ' + company.name + '.', 'ok');
        }
        await refreshMetadata();
      } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : 'Field resolution failed.', 'error');
      } finally {
        resolveButton.disabled = !activeDoc() || !companySelect.value;
      }
    }

    async function refreshMetadata() {
      const doc = activeDoc();
      if (!doc) return void (meta.textContent = '');
      try {
        const controls = await doc.contentControls.list({});
        const count = Array.isArray(controls && controls.items) ? controls.items.length : 0;
        meta.textContent = 'DOCX content controls: ' + count;
      } catch {
        meta.textContent = '';
      }
    }

    async function loadDocument(file) {
      if (!file || !file.name.toLowerCase().endsWith('.docx')) {
        return setStatus('Please choose a .docx Microsoft Word document.', 'error');
      }
      if (superdoc) {
        superdoc.destroy();
        superdoc = null;
      }
      currentFileName = file.name;
      exportButton.disabled = true;
      resolveButton.disabled = true;
      setStatus('Opening ' + file.name + '...');
      empty.style.display = 'none';
      document.getElementById('editor').innerHTML = '';
      document.getElementById('superdoc-toolbar').innerHTML = '';

      try {
        superdoc = new SuperDoc({
          selector: '#editor',
          document: file,
          documentMode: 'editing',
          contained: true,
          workerUrls: {
            document: '/api/document-templates/render-test?superdocPocWorker=document',
            collaboration: '/api/document-templates/render-test?superdocPocWorker=collaboration',
            reviewIndex: '/api/document-templates/render-test?superdocPocWorker=reviewIndex'
          },
          ui: {
            toolbar: { container: '#superdoc-toolbar', responsiveToContainer: true },
            search: true,
            ruler: true,
            contentControls: { chrome: 'default' }
          },
          onReady: async ({ superdoc: ready }) => {
            ready.setDocumentMode('editing');
            ready.setZoomMode('fit-width');
            exportButton.disabled = false;
            resolveButton.disabled = !companySelect.value;
            setStatus('DOCX loaded. Place the caret or select text, then insert an Oakcloud field.', 'ok');
            renderFields();
            await refreshMetadata();
          },
          onContentControlClick: ({ target }) => {
            const label = target?.alias || target?.tag || target?.id || 'content control';
            setStatus('Selected DOCX field: ' + label + (target?.tag ? ' (' + target.tag + ')' : ''), 'ok');
          },
          onException: ({ error }) => {
            console.error('SuperDoc exception', error);
            setStatus(error instanceof Error ? error.message : 'SuperDoc reported a document error.', 'error');
          }
        });
      } catch (error) {
        console.error(error);
        empty.style.display = 'grid';
        setStatus(error instanceof Error ? error.message : 'SuperDoc could not open the DOCX.', 'error');
        renderFields();
      }
    }

    async function exportDocument() {
      if (!superdoc) return;
      exportButton.disabled = true;
      try {
        const blob = await superdoc.export({ exportType: ['docx'], triggerDownload: false });
        if (!(blob instanceof Blob)) throw new Error('SuperDoc did not return a DOCX file.');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = currentFileName.replace(/\.docx$/i, '') + '-superdoc-poc.docx';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus('Exported edited DOCX. Open it in Microsoft Word to check fidelity.', 'ok');
      } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : 'DOCX export failed.', 'error');
      } finally {
        exportButton.disabled = !superdoc;
      }
    }

    async function loadCompanies() {
      try {
        const response = await fetch('/api/companies/options?limit=50', { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Could not load Oakcloud companies.');
        const payload = await response.json();
        const companies = Array.isArray(payload && payload.options) ? payload.options : [];
        companyById = new Map(companies.map((company) => [company.id, company]));
        for (const company of companies) {
          const option = document.createElement('option');
          option.value = company.id;
          option.textContent = company.name + (company.uen ? ' · ' + company.uen : '');
          companySelect.appendChild(option);
        }
      } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : 'Could not load companies.', 'error');
      }
    }

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) void loadDocument(file);
    });
    companySelect.addEventListener('change', () => {
      resolveButton.disabled = !activeDoc() || !companySelect.value;
    });
    fieldSearch.addEventListener('input', renderFields);
    resolveButton.addEventListener('click', () => void resolveFields());
    exportButton.addEventListener('click', () => void exportDocument());
    window.addEventListener('beforeunload', () => superdoc?.destroy());

    renderFields();
    void loadCompanies();
  </script>
</body>
</html>`;

export function SuperDocPoc() {
  return (
    <div className="h-[calc(100vh-1rem)] min-h-[720px] overflow-hidden bg-background-primary p-2">
      <iframe
        title="SuperDoc DOCX template proof of concept"
        srcDoc={SUPERDOC_POC_FRAME}
        className="h-full w-full rounded-lg border border-border-primary bg-white"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
