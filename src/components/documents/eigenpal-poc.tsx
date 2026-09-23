'use client';

const EIGENPAL_LAB_FRAME = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@docx-editor.dev/core@2.21.1/dist/editor.css" />
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    html, body, #root { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #f5f6f8; color: #1a1d23; }
    button, input { font: inherit; }
    .lab-shell { width: 100%; height: 100%; display: grid; grid-template-rows: auto minmax(0,1fr); overflow: hidden; }
    .lab-topbar { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #fff; border-bottom: 1px solid #e2e4e9; }
    .lab-title { min-width: 0; margin-right: auto; font-weight: 700; font-size: 14px; }
    .lab-badge { border: 1px solid #cadbd6; background: #edf5f2; color: #294d44; border-radius: 999px; padding: 4px 8px; font-size: 11px; white-space: nowrap; }
    .lab-upload { display: inline-flex; align-items: center; height: 34px; padding: 0 10px; border: 1px solid #cfd3d9; border-radius: 7px; background: #fff; cursor: pointer; white-space: nowrap; }
    .lab-upload:hover { background: #f7f8fa; }
    .lab-upload input { display: none; }
    .lab-button { height: 34px; border-radius: 7px; border: 1px solid #294d44; background: #294d44; color: #fff; padding: 0 12px; cursor: pointer; }
    .lab-button:disabled { opacity: .45; cursor: not-allowed; }
    .lab-body { min-width: 0; min-height: 0; display: grid; grid-template-columns: 260px minmax(0,1fr); overflow: hidden; }
    .lab-sidebar { min-width: 0; overflow: auto; padding: 14px; border-right: 1px solid #e2e4e9; background: #fff; }
    .lab-sidebar h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #777f8d; }
    .lab-sidebar p { margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: #5d6572; }
    .lab-check { display: grid; gap: 7px; margin: 12px 0 18px; }
    .lab-check span { font-size: 12px; color: #3d4551; }
    .lab-status { border-radius: 7px; padding: 9px 10px; background: #f1f3f5; color: #5d6572; font-size: 12px; line-height: 1.45; word-break: break-word; }
    .lab-status.ok { background: #eef7f1; color: #275b39; }
    .lab-status.error { background: #fff1f1; color: #9b2c2c; }
    .lab-editor-wrap { min-width: 0; min-height: 0; overflow: hidden; position: relative; contain: inline-size; }
    .lab-editor-host { width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
    .lab-empty { position: absolute; inset: 24px; display: grid; place-items: center; pointer-events: none; }
    .lab-empty-card { max-width: 520px; padding: 28px; border: 1px dashed #c8ccd2; border-radius: 12px; background: #fff; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,.04); }
    .lab-empty-card strong { display: block; margin-bottom: 8px; }
    .lab-empty-card span { font-size: 13px; color: #626a76; line-height: 1.5; }
    @media (max-width: 900px) { .lab-body { grid-template-columns: 220px minmax(0,1fr); } }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import React, { useRef, useState } from 'https://esm.sh/react@19.0.0';
    import { createRoot } from 'https://esm.sh/react-dom@19.0.0/client';
    import { DocxEditor } from 'https://esm.sh/@docx-editor.dev/react@2.21.1?bundle&deps=react@19.0.0,react-dom@19.0.0';

    const h = React.createElement;

    function App() {
      const editorRef = useRef(null);
      const [documentBytes, setDocumentBytes] = useState(null);
      const [fileName, setFileName] = useState('');
      const [title, setTitle] = useState('OakDoc Lab document');
      const [status, setStatus] = useState('Import a DOCX to begin.');
      const [statusKind, setStatusKind] = useState('');
      const [saving, setSaving] = useState(false);

      async function loadFile(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.docx')) {
          setStatus('Please choose a Microsoft Word .docx file.');
          setStatusKind('error');
          return;
        }
        try {
          const buffer = await file.arrayBuffer();
          setDocumentBytes(new Uint8Array(buffer));
          setFileName(file.name);
          setTitle(file.name.replace(/\\.docx$/i, ''));
          setStatus('Opening ' + file.name + ' with the Apache-licensed EigenPal editor...');
          setStatusKind('');
        } catch (error) {
          console.error(error);
          setStatus(error instanceof Error ? error.message : 'Could not read the DOCX file.');
          setStatusKind('error');
        }
      }

      async function exportDocx() {
        const editor = editorRef.current;
        if (!editor || typeof editor.save !== 'function') return;
        setSaving(true);
        try {
          const buffer = await editor.save();
          if (!buffer) throw new Error('The editor did not return a DOCX file.');
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = (fileName || 'oakdoc-lab.docx').replace(/\\.docx$/i, '') + '-eigenpal-lab.docx';
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          setStatus('Exported DOCX. Re-open it in Microsoft Word and compare it with the original.');
          setStatusKind('ok');
        } catch (error) {
          console.error(error);
          setStatus(error instanceof Error ? error.message : 'DOCX export failed.');
          setStatusKind('error');
        } finally {
          setSaving(false);
        }
      }

      const editor = documentBytes
        ? h(DocxEditor, {
            ref: editorRef,
            document: documentBytes,
            title,
            onTitleChange: setTitle,
            mode: 'edit',
            colorMode: 'light',
            onReady: () => {
              setStatus('DOCX loaded. First test fidelity, then make a small edit and export it.');
              setStatusKind('ok');
            },
            onChange: () => {
              setStatus('Document changed. Export it when ready for the round-trip check.');
              setStatusKind('');
            },
            onSave: exportDocx
          })
        : null;

      return h('div', { className: 'lab-shell' },
        h('header', { className: 'lab-topbar' },
          h('div', { className: 'lab-title' }, 'OakDoc Lab · EigenPal open-core evaluation'),
          h('span', { className: 'lab-badge' }, 'Apache 2.0 packages only'),
          h('label', { className: 'lab-upload' },
            'Import Word .docx',
            h('input', { type: 'file', accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', onChange: loadFile })
          ),
          h('button', { className: 'lab-button', disabled: !documentBytes || saving, onClick: exportDocx }, saving ? 'Exporting…' : 'Export DOCX')
        ),
        h('main', { className: 'lab-body' },
          h('aside', { className: 'lab-sidebar' },
            h('h2', null, 'Round-trip gate'),
            h('p', null, 'This lab intentionally tests DOCX fidelity before Oakcloud placeholders. If no-edit round-trip is not reliable, we reject the engine before integrating fields.'),
            h('div', { className: 'lab-check' },
              h('span', null, '1. Import an existing Oakcloud Word template'),
              h('span', null, '2. Compare page count, tables, lists and headers'),
              h('span', null, '3. Export without editing and compare in Word'),
              h('span', null, '4. Make one small text edit and export again')
            ),
            h('h2', null, 'Next gate'),
            h('p', null, 'If fidelity passes, the next iteration adds Oakcloud w:sdt content-control fields through our own OakDoc adapter, without the EigenPal Pro editor-api package.'),
            h('div', { className: 'lab-status' + (statusKind ? ' ' + statusKind : '') }, status)
          ),
          h('section', { className: 'lab-editor-wrap' },
            h('div', { className: 'lab-editor-host' }, editor),
            !documentBytes ? h('div', { className: 'lab-empty' },
              h('div', { className: 'lab-empty-card' },
                h('strong', null, 'Import an existing Microsoft Word template'),
                h('span', null, 'OakDoc Lab is isolated from the current A4Editor and SuperDoc POC. The first decision gate is whether this engine can round-trip your actual DOCX files cleanly.')
              )
            ) : null
          )
        )
      );
    }

    createRoot(document.getElementById('root')).render(h(App));
  </script>
</body>
</html>`;

export function EigenPalPoc() {
  return (
    <div className="h-[calc(100vh-1rem)] min-h-[720px] overflow-hidden bg-background-primary p-2">
      <iframe
        title="OakDoc Lab EigenPal proof of concept"
        srcDoc={EIGENPAL_LAB_FRAME}
        className="h-full w-full rounded-lg border border-border-primary bg-white"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
