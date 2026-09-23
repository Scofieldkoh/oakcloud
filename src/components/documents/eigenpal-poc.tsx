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
    button, input, select { font: inherit; }
    .lab-shell { width: 100%; height: 100%; display: grid; grid-template-rows: auto minmax(0,1fr); overflow: hidden; }
    .lab-topbar { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #fff; border-bottom: 1px solid #e2e4e9; }
    .lab-title { min-width: 0; margin-right: auto; font-weight: 700; font-size: 14px; }
    .lab-badge { border: 1px solid #cadbd6; background: #edf5f2; color: #294d44; border-radius: 999px; padding: 4px 8px; font-size: 11px; white-space: nowrap; }
    .lab-upload { display: inline-flex; align-items: center; height: 34px; padding: 0 10px; border: 1px solid #cfd3d9; border-radius: 7px; background: #fff; cursor: pointer; white-space: nowrap; }
    .lab-upload:hover { background: #f7f8fa; }
    .lab-upload input { display: none; }
    .lab-button { height: 34px; border-radius: 7px; border: 1px solid #294d44; background: #294d44; color: #fff; padding: 0 12px; cursor: pointer; white-space: nowrap; }
    .lab-button.secondary { border-color: #cfd3d9; background: #fff; color: #26302d; }
    .lab-button.secondary:hover:not(:disabled) { background: #f7f8fa; }
    .lab-button:disabled { opacity: .45; cursor: not-allowed; }
    .lab-body { min-width: 0; min-height: 0; display: grid; grid-template-columns: 300px minmax(0,1fr); overflow: hidden; }
    .lab-sidebar { min-width: 0; overflow: auto; padding: 14px; border-right: 1px solid #e2e4e9; background: #fff; }
    .lab-section { margin-bottom: 18px; }
    .lab-sidebar h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #777f8d; }
    .lab-sidebar p { margin: 0 0 10px; font-size: 12px; line-height: 1.5; color: #5d6572; }
    .lab-select, .lab-search { width: 100%; height: 34px; border: 1px solid #cfd3d9; border-radius: 7px; background: #fff; color: #1a1d23; padding: 0 9px; }
    .lab-search { margin-bottom: 8px; }
    .lab-selection { border-radius: 7px; border: 1px solid #e0e3e8; background: #f8f9fb; padding: 8px 9px; font-size: 12px; line-height: 1.4; color: #4f5763; min-height: 48px; word-break: break-word; }
    .lab-selection strong { display: block; margin-bottom: 3px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #7b838f; }
    .lab-fields { display: grid; gap: 6px; margin-top: 8px; }
    .lab-field { width: 100%; border: 1px solid #e0e3e8; border-radius: 7px; background: #fff; padding: 8px 9px; text-align: left; cursor: pointer; }
    .lab-field:hover:not(:disabled) { border-color: #92afa6; background: #f5faf8; }
    .lab-field:disabled { opacity: .45; cursor: not-allowed; }
    .lab-field-label { display: block; font-size: 12px; font-weight: 650; color: #26302d; }
    .lab-field-tag { display: block; margin-top: 2px; font-size: 10px; color: #7b838f; word-break: break-all; }
    .lab-meta { display: grid; gap: 5px; margin-top: 9px; font-size: 11px; color: #68717e; }
    .lab-tags { line-height: 1.45; word-break: break-word; }
    .lab-status { border-radius: 7px; padding: 9px 10px; background: #f1f3f5; color: #5d6572; font-size: 12px; line-height: 1.45; word-break: break-word; }
    .lab-status.ok { background: #eef7f1; color: #275b39; }
    .lab-status.error { background: #fff1f1; color: #9b2c2c; }
    .lab-editor-wrap { min-width: 0; min-height: 0; overflow: hidden; position: relative; contain: inline-size; }
    .lab-editor-host { width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
    .lab-empty { position: absolute; inset: 24px; display: grid; place-items: center; pointer-events: none; }
    .lab-empty-card { max-width: 520px; padding: 28px; border: 1px dashed #c8ccd2; border-radius: 12px; background: #fff; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,.04); }
    .lab-empty-card strong { display: block; margin-bottom: 8px; }
    .lab-empty-card span { font-size: 13px; color: #626a76; line-height: 1.5; }
    @media (max-width: 980px) { .lab-body { grid-template-columns: 250px minmax(0,1fr); } }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import React, { useEffect, useMemo, useRef, useState } from 'https://esm.sh/react@19.0.0';
    import { createRoot } from 'https://esm.sh/react-dom@19.0.0/client';
    import { DocxEditor } from 'https://esm.sh/@docx-editor.dev/react@2.21.1?bundle&deps=react@19.0.0,react-dom@19.0.0';
    import { unzipSync, zipSync, strFromU8, strToU8 } from 'https://esm.sh/fflate@0.8.2?bundle';

    const h = React.createElement;
    const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const XML_NS = 'http://www.w3.org/XML/1998/namespace';
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const FIELD_DEFINITIONS = [
      { tag: 'company.name', label: 'Company name' },
      { tag: 'company.uen', label: 'UEN' },
      { tag: 'company.registeredAddress', label: 'Registered address' },
      { tag: 'company.incorporationDate', label: 'Incorporation date' },
      { tag: 'company.primarySsicDescription', label: 'Primary business activity' },
      { tag: 'company.homeCurrency', label: 'Home currency' },
      { tag: 'system.currentDate', label: 'Current date' }
    ];

    function parseXml(bytes) {
      const parser = new DOMParser();
      const xml = parser.parseFromString(strFromU8(bytes), 'application/xml');
      if (xml.getElementsByTagName('parsererror').length) throw new Error('OakDoc could not parse WordprocessingML.');
      return xml;
    }

    function serializeXml(xml) {
      return strToU8(new XMLSerializer().serializeToString(xml));
    }

    function isWordElement(node, localName) {
      return Boolean(node && node.nodeType === Node.ELEMENT_NODE && node.namespaceURI === W_NS && node.localName === localName);
    }

    function wordChildren(node) {
      return Array.from(node.childNodes || []).filter((child) => child.nodeType === Node.ELEMENT_NODE);
    }

    function getWordVal(element) {
      return element ? (element.getAttributeNS(W_NS, 'val') || element.getAttribute('w:val') || '') : '';
    }

    function setWordVal(element, value) {
      element.setAttributeNS(W_NS, 'w:val', value);
    }

    function setTextValue(textElement, value) {
      textElement.textContent = value;
      if (/^\s|\s$/.test(value)) textElement.setAttributeNS(XML_NS, 'xml:space', 'preserve');
      else textElement.removeAttributeNS(XML_NS, 'space');
    }

    function runText(run) {
      return Array.from(run.getElementsByTagNameNS(W_NS, 't')).map((node) => node.textContent || '').join('');
    }

    function isSimpleTextRun(run) {
      if (!isWordElement(run, 'r')) return false;
      const children = wordChildren(run);
      return children.every((child) => isWordElement(child, 'rPr') || isWordElement(child, 't'));
    }

    function cloneRunWithText(run, value, xml) {
      const clone = run.cloneNode(false);
      const rPr = wordChildren(run).find((child) => isWordElement(child, 'rPr'));
      if (rPr) clone.appendChild(rPr.cloneNode(true));
      const text = xml.createElementNS(W_NS, 'w:t');
      setTextValue(text, value);
      clone.appendChild(text);
      return clone;
    }

    function paragraphRunGroups(paragraph) {
      const groups = [];
      let current = [];
      const flush = () => {
        if (current.length) groups.push(current);
        current = [];
      };
      for (const child of wordChildren(paragraph)) {
        if (isSimpleTextRun(child)) current.push(child);
        else flush();
      }
      flush();
      return groups;
    }

    function locateUniqueSimpleTextRange(xml, selectedText) {
      const matches = [];
      const paragraphs = Array.from(xml.getElementsByTagNameNS(W_NS, 'p'));
      for (const paragraph of paragraphs) {
        for (const runs of paragraphRunGroups(paragraph)) {
          const segments = [];
          let cursor = 0;
          let combined = '';
          for (const run of runs) {
            const text = runText(run);
            const start = cursor;
            cursor += text.length;
            combined += text;
            segments.push({ run, text, start, end: cursor });
          }
          if (!combined || combined.length < selectedText.length) continue;
          let from = 0;
          while (from <= combined.length - selectedText.length) {
            const index = combined.indexOf(selectedText, from);
            if (index < 0) break;
            matches.push({ paragraph, segments, start: index, end: index + selectedText.length });
            from = index + Math.max(1, selectedText.length);
          }
        }
      }
      if (matches.length === 0) throw new Error('The selected text was not found as a simple Word text range. Try a single paragraph without fields, hyperlinks, or drawings.');
      if (matches.length > 1) throw new Error('That exact text occurs ' + matches.length + ' times. Select a longer unique phrase before assigning the field.');
      return matches[0];
    }

    function nextSdtId(xml) {
      const used = new Set(
        Array.from(xml.getElementsByTagNameNS(W_NS, 'id'))
          .map((element) => Number(getWordVal(element)))
          .filter((value) => Number.isFinite(value))
      );
      let candidate = Math.floor(Math.random() * 1800000000) + 1000000;
      while (used.has(candidate)) candidate += 1;
      return String(candidate);
    }

    function createContentControl(xml, field, selectedRuns) {
      const sdt = xml.createElementNS(W_NS, 'w:sdt');
      const properties = xml.createElementNS(W_NS, 'w:sdtPr');
      const alias = xml.createElementNS(W_NS, 'w:alias');
      const tag = xml.createElementNS(W_NS, 'w:tag');
      const id = xml.createElementNS(W_NS, 'w:id');
      setWordVal(alias, field.label);
      setWordVal(tag, field.tag);
      setWordVal(id, nextSdtId(xml));
      properties.append(alias, tag, id);
      const content = xml.createElementNS(W_NS, 'w:sdtContent');
      for (const run of selectedRuns) content.appendChild(run);
      sdt.append(properties, content);
      return sdt;
    }

    function wrapSelectionInDocumentXml(bytes, selectedText, field) {
      const xml = parseXml(bytes);
      const match = locateUniqueSimpleTextRange(xml, selectedText);
      const segments = match.segments;
      let startIndex = -1;
      let endIndex = -1;
      let startOffset = 0;
      let endOffset = 0;

      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (startIndex < 0 && match.start >= segment.start && match.start < segment.end) {
          startIndex = index;
          startOffset = match.start - segment.start;
        }
        if (match.end > segment.start && match.end <= segment.end) {
          endIndex = index;
          endOffset = match.end - segment.start;
          break;
        }
      }

      if (startIndex < 0 || endIndex < 0) throw new Error('OakDoc could not map the selected text back to Word runs.');

      const selectedRuns = [];
      for (let index = startIndex; index <= endIndex; index += 1) {
        const segment = segments[index];
        const from = index === startIndex ? startOffset : 0;
        const to = index === endIndex ? endOffset : segment.text.length;
        const selected = segment.text.slice(from, to);
        if (selected) selectedRuns.push(cloneRunWithText(segment.run, selected, xml));
      }
      if (!selectedRuns.length) throw new Error('The selected range is empty.');

      const startRun = segments[startIndex].run;
      const endRun = segments[endIndex].run;
      const beforeText = segments[startIndex].text.slice(0, startOffset);
      const afterText = segments[endIndex].text.slice(endOffset);
      const parent = startRun.parentNode;
      if (!parent || parent !== endRun.parentNode) throw new Error('The selected range crosses an unsupported Word structure.');

      if (beforeText) parent.insertBefore(cloneRunWithText(startRun, beforeText, xml), startRun);
      parent.insertBefore(createContentControl(xml, field, selectedRuns), startRun);
      if (afterText) parent.insertBefore(cloneRunWithText(endRun, afterText, xml), startRun);

      for (let index = startIndex; index <= endIndex; index += 1) {
        const run = segments[index].run;
        if (run.parentNode === parent) parent.removeChild(run);
      }

      return serializeXml(xml);
    }

    function wordXmlPartNames(files) {
      return Object.keys(files).filter((name) =>
        name === 'word/document.xml' || /^word\/(header|footer)\d+\.xml$/i.test(name)
      );
    }

    function tagOfContentControl(sdt) {
      const properties = wordChildren(sdt).find((child) => isWordElement(child, 'sdtPr'));
      if (!properties) return '';
      const tag = wordChildren(properties).find((child) => isWordElement(child, 'tag'));
      return getWordVal(tag);
    }

    function seedEmptyFieldTokens(docxBytes, field) {
      const files = unzipSync(docxBytes);
      let updated = 0;
      const token = '{{' + field.tag + '}}';

      for (const name of wordXmlPartNames(files)) {
        const xml = parseXml(files[name]);
        let changed = false;

        for (const sdt of Array.from(xml.getElementsByTagNameNS(W_NS, 'sdt'))) {
          if (tagOfContentControl(sdt) !== field.tag) continue;

          const properties = wordChildren(sdt).find((child) => isWordElement(child, 'sdtPr'));
          const showingPlaceholder = properties
            ? wordChildren(properties).find((child) => isWordElement(child, 'showingPlcHdr'))
            : null;
          if (!showingPlaceholder) continue;

          const content = wordChildren(sdt).find((child) => isWordElement(child, 'sdtContent'));
          if (!content) continue;
          const textNodes = Array.from(content.getElementsByTagNameNS(W_NS, 't'));
          if (!textNodes.length) continue;

          setTextValue(textNodes[0], token);
          for (let index = 1; index < textNodes.length; index += 1) setTextValue(textNodes[index], '');
          properties.removeChild(showingPlaceholder);

          updated += 1;
          changed = true;
        }

        if (changed) files[name] = serializeXml(xml);
      }

      return {
        bytes: updated ? zipSync(files, { level: 6 }) : docxBytes,
        updated
      };
    }

    function inspectNativeFields(docxBytes) {
      const files = unzipSync(docxBytes);
      const tags = [];
      for (const name of wordXmlPartNames(files)) {
        const xml = parseXml(files[name]);
        for (const sdt of Array.from(xml.getElementsByTagNameNS(W_NS, 'sdt'))) {
          const tag = tagOfContentControl(sdt);
          if (tag) tags.push(tag);
        }
      }
      return { count: tags.length, tags: Array.from(new Set(tags)) };
    }

    function wrapSelectedTextAsField(docxBytes, selectedText, field) {
      const files = unzipSync(docxBytes);
      const documentPart = files['word/document.xml'];
      if (!documentPart) throw new Error('This DOCX has no word/document.xml part.');
      files['word/document.xml'] = wrapSelectionInDocumentXml(documentPart, selectedText, field);
      return zipSync(files, { level: 6 });
    }

    function resolveNativeFields(docxBytes, values) {
      const files = unzipSync(docxBytes);
      let updated = 0;
      for (const name of wordXmlPartNames(files)) {
        const xml = parseXml(files[name]);
        let changed = false;
        const controls = Array.from(xml.getElementsByTagNameNS(W_NS, 'sdt'));
        for (const sdt of controls) {
          const tag = tagOfContentControl(sdt);
          if (!tag || !Object.prototype.hasOwnProperty.call(values, tag)) continue;
          const content = wordChildren(sdt).find((child) => isWordElement(child, 'sdtContent'));
          if (!content) continue;
          const textNodes = Array.from(content.getElementsByTagNameNS(W_NS, 't'));
          if (!textNodes.length) continue;
          setTextValue(textNodes[0], values[tag] == null ? '' : String(values[tag]));
          for (let index = 1; index < textNodes.length; index += 1) setTextValue(textNodes[index], '');
          updated += 1;
          changed = true;
        }
        if (changed) files[name] = serializeXml(xml);
      }
      if (!updated) throw new Error('No matching native Oakcloud content controls were found in the DOCX.');
      return { bytes: zipSync(files, { level: 6 }), updated };
    }

    function normalizeSelectedText(value) {
      return String(value || '').replace(/\u00a0/g, ' ').trim();
    }

    function isSelectionInsideEditor(selection) {
      const node = selection && selection.anchorNode;
      const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
      return Boolean(element && element.closest && element.closest('.docx-editor'));
    }

    function formatDate(value) {
      if (!value) return '';
      const parsed = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(parsed.getTime())) return String(value);
      return new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
    }

    function companyRegisteredAddress(company) {
      if (!company) return '';
      if (company.registeredAddress) return String(company.registeredAddress);
      const addresses = Array.isArray(company.addresses) ? company.addresses : [];
      const registered = addresses.find((address) =>
        String(address.addressType || '').toLowerCase().includes('registered')
      );
      return String((registered && registered.fullAddress) || (addresses[0] && addresses[0].fullAddress) || '');
    }

    function companyValues(company) {
      return {
        'company.name': company && company.name ? String(company.name) : '',
        'company.uen': company && company.uen ? String(company.uen) : '',
        'company.registeredAddress': companyRegisteredAddress(company),
        'company.incorporationDate': formatDate(company && company.incorporationDate),
        'company.primarySsicDescription': company && company.primarySsicDescription ? String(company.primarySsicDescription) : '',
        'company.homeCurrency': company && company.homeCurrency ? String(company.homeCurrency) : '',
        'system.currentDate': formatDate(new Date())
      };
    }

    function App() {
      const editorRef = useRef(null);
      const readyMessageRef = useRef('');
      const [documentBytes, setDocumentBytes] = useState(null);
      const [documentVersion, setDocumentVersion] = useState(0);
      const [fileName, setFileName] = useState('');
      const [title, setTitle] = useState('OakDoc Lab document');
      const [status, setStatus] = useState('Import a DOCX to begin.');
      const [statusKind, setStatusKind] = useState('');
      const [busy, setBusy] = useState(false);
      const [companies, setCompanies] = useState([]);
      const [companyId, setCompanyId] = useState('');
      const [companyLoading, setCompanyLoading] = useState(false);
      const [fieldSearch, setFieldSearch] = useState('');
      const [fieldSummary, setFieldSummary] = useState({ count: 0, tags: [] });

      const visibleFields = useMemo(() => {
        const query = fieldSearch.trim().toLowerCase();
        return FIELD_DEFINITIONS.filter((field) =>
          !query || field.label.toLowerCase().includes(query) || field.tag.toLowerCase().includes(query)
        );
      }, [fieldSearch]);

      useEffect(() => {
        let cancelled = false;
        async function loadCompanies() {
          setCompanyLoading(true);
          try {
            const response = await fetch('/api/companies/options?limit=50', { credentials: 'same-origin' });
            if (!response.ok) throw new Error('Could not load Oakcloud companies.');
            const payload = await response.json();
            if (!cancelled) setCompanies(Array.isArray(payload && payload.options) ? payload.options : []);
          } catch (error) {
            console.error(error);
            if (!cancelled) {
              setStatus(error instanceof Error ? error.message : 'Could not load companies.');
              setStatusKind('error');
            }
          } finally {
            if (!cancelled) setCompanyLoading(false);
          }
        }
        void loadCompanies();
        return () => { cancelled = true; };
      }, []);


      function refreshFieldSummary(bytes) {
        try {
          setFieldSummary(inspectNativeFields(bytes));
        } catch (error) {
          console.error(error);
          setFieldSummary({ count: 0, tags: [] });
        }
      }

      function replaceDocument(bytes, message) {
        readyMessageRef.current = message;
        setDocumentBytes(bytes);
        setDocumentVersion((version) => version + 1);
        refreshFieldSummary(bytes);
      }

      async function currentDocxBytes() {
        const editor = editorRef.current;
        if (!editor || typeof editor.save !== 'function') throw new Error('The document editor is not ready.');
        const buffer = await editor.save();
        if (!buffer) throw new Error('The editor did not return a DOCX file.');
        return new Uint8Array(buffer);
      }

      async function loadFile(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.docx')) {
          setStatus('Please choose a Microsoft Word .docx file.');
          setStatusKind('error');
          return;
        }
        setBusy(true);
        try {
          const buffer = new Uint8Array(await file.arrayBuffer());
          setFileName(file.name);
          setTitle(file.name.replace(/\.docx$/i, ''));
          readyMessageRef.current = 'DOCX loaded. Select text or place the caret, then assign an Oakcloud field from the left.';
          setDocumentBytes(buffer);
          setDocumentVersion((version) => version + 1);
          refreshFieldSummary(buffer);
          setStatus('Opening ' + file.name + '...');
          setStatusKind('');
        } catch (error) {
          console.error(error);
          setStatus(error instanceof Error ? error.message : 'Could not read the DOCX file.');
          setStatusKind('error');
        } finally {
          setBusy(false);
        }
      }

      async function assignField(field) {
        const editorHandle = editorRef.current;
        const editor = editorHandle && typeof editorHandle.getEditor === 'function'
          ? editorHandle.getEditor()
          : null;
        if (!editor) {
          setStatus('The document editor is not ready.');
          setStatusKind('error');
          return;
        }

        const command = {
          type: 'insertContentControl',
          subtype: 'plainText',
          tag: field.tag,
          title: field.label
        };

        setBusy(true);
        try {
          const allowed = typeof editor.can === 'function' ? editor.can(command) : null;
          if (allowed && allowed.ok === false) {
            throw new Error(allowed.reason || allowed.message || 'The current selection cannot be wrapped in a content control.');
          }

          const result = editor.exec(command);
          if (result && result.ok === false) {
            throw new Error(result.reason || result.message || 'EigenPal could not create the content control.');
          }

          const bytes = await currentDocxBytes();
          const seeded = seedEmptyFieldTokens(bytes, field);

          if (seeded.updated > 0) {
            replaceDocument(
              seeded.bytes,
              'Created native Word field ' + field.tag + '. Empty fields now display {{' + field.tag + '}} until resolved.'
            );
            setStatus('Preparing Oakcloud field token...', '');
          } else {
            refreshFieldSummary(bytes);
            setStatus(
              'Created native Word field ' + field.tag + ' around the selected text.',
              'ok'
            );
          }
        } catch (error) {
          console.error(error);
          setStatus(error instanceof Error ? error.message : 'Could not create the Word content control.');
          setStatusKind('error');
        } finally {
          setBusy(false);
        }
      }

      async function resolveFields() {
        if (!companyId) {
          setStatus('Select a company before resolving fields.');
          setStatusKind('error');
          return;
        }
        setBusy(true);
        try {
          const companyResponse = await fetch('/api/companies/' + encodeURIComponent(companyId), { credentials: 'same-origin' });
          if (!companyResponse.ok) throw new Error('Could not load the selected company.');
          const company = await companyResponse.json();
          const bytes = await currentDocxBytes();
          const resolved = resolveNativeFields(bytes, companyValues(company));
          replaceDocument(
            resolved.bytes,
            'Resolved ' + resolved.updated + ' native Word field' + (resolved.updated === 1 ? '' : 's') + ' from ' + company.name + '.'
          );
          setStatus('Resolving native Word fields...');
          setStatusKind('');
        } catch (error) {
          console.error(error);
          setStatus(error instanceof Error ? error.message : 'Field resolution failed.');
          setStatusKind('error');
        } finally {
          setBusy(false);
        }
      }

      async function exportDocx() {
        setBusy(true);
        try {
          const bytes = await currentDocxBytes();
          const blob = new Blob([bytes], { type: DOCX_MIME });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = (fileName || 'oakdoc-lab.docx').replace(/\.docx$/i, '') + '-oakdoc-fields.docx';
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          setStatus('Exported DOCX with native Word content controls. Re-open it in Word to verify the field survives.');
          setStatusKind('ok');
        } catch (error) {
          console.error(error);
          setStatus(error instanceof Error ? error.message : 'DOCX export failed.');
          setStatusKind('error');
        } finally {
          setBusy(false);
        }
      }

      const editor = documentBytes
        ? h(DocxEditor, {
            key: documentVersion,
            ref: editorRef,
            document: documentBytes,
            title,
            onTitleChange: setTitle,
            mode: 'edit',
            colorMode: 'light',
            onReady: () => {
              const message = readyMessageRef.current || 'DOCX ready.';
              readyMessageRef.current = '';
              setStatus(message);
              setStatusKind('ok');
            },
            onChange: () => {
              if (!readyMessageRef.current) {
                setStatus('Document changed. Native field tags remain in the DOCX package.');
                setStatusKind('');
              }
            },
            onSave: exportDocx
          })
        : null;

      return h('div', { className: 'lab-shell' },
        h('header', { className: 'lab-topbar' },
          h('div', { className: 'lab-title' }, 'OakDoc Lab · Native Word fields'),
          h('span', { className: 'lab-badge' }, 'EigenPal Apache 2.0 core + OakDoc OOXML field adapter'),
          h('label', { className: 'lab-upload' },
            'Import Word .docx',
            h('input', {
              type: 'file',
              accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              onChange: loadFile
            })
          ),
          h('button', {
            className: 'lab-button secondary',
            disabled: !documentBytes || !companyId || busy || fieldSummary.count === 0,
            onClick: resolveFields
          }, busy ? 'Working...' : 'Resolve fields'),
          h('button', {
            className: 'lab-button',
            disabled: !documentBytes || busy,
            onClick: exportDocx
          }, busy ? 'Working...' : 'Export DOCX')
        ),
        h('main', { className: 'lab-body' },
          h('aside', { className: 'lab-sidebar' },
            h('section', { className: 'lab-section' },
              h('h2', null, 'Company context'),
              h('p', null, 'Choose the Oakcloud company whose values should populate native Word content controls.'),
              h('select', {
                className: 'lab-select',
                value: companyId,
                disabled: companyLoading,
                onChange: (event) => setCompanyId(event.target.value)
              },
                h('option', { value: '' }, companyLoading ? 'Loading companies...' : 'Select company...'),
                ...companies.map((company) => h('option', { key: company.id, value: company.id },
                  company.name + (company.uen ? ' · ' + company.uen : '')
                ))
              )
            ),
            h('section', { className: 'lab-section' },
              h('h2', null, 'Field target'),
              h('p', null, 'Use EigenPal\'s own document selection: highlight existing text to wrap it, or leave the caret where you want an empty Word field inserted.'),
              h('div', { className: 'lab-selection' },
                h('strong', null, 'Current EigenPal selection'),
                'The field buttons now act directly on the editor selection; no browser DOM selection capture is required.'
              )
            ),
            h('section', { className: 'lab-section' },
              h('h2', null, 'Oakcloud fields'),
              h('input', {
                className: 'lab-search',
                value: fieldSearch,
                placeholder: 'Search fields...',
                onChange: (event) => setFieldSearch(event.target.value)
              }),
              h('div', { className: 'lab-fields' },
                ...visibleFields.map((field) =>
                  h('button', {
                    key: field.tag,
                    type: 'button',
                    className: 'lab-field',
                    disabled: !documentBytes || busy,
                    onPointerDown: (event) => event.preventDefault(),
                    onClick: () => void assignField(field)
                  },
                    h('span', { className: 'lab-field-label' }, field.label),
                    h('span', { className: 'lab-field-tag' }, field.tag)
                  )
                )
              ),
              h('div', { className: 'lab-meta' },
                h('span', null, 'Native Word fields: ' + fieldSummary.count),
                fieldSummary.tags.length
                  ? h('span', { className: 'lab-tags' }, fieldSummary.tags.join(', '))
                  : h('span', null, 'No tagged content controls yet.')
              )
            ),
            h('div', { className: 'lab-status' + (statusKind ? ' ' + statusKind : '') }, status)
          ),
          h('section', { className: 'lab-editor-wrap' },
            h('div', { className: 'lab-editor-host' }, editor),
            !documentBytes ? h('div', { className: 'lab-empty' },
              h('div', { className: 'lab-empty-card' },
                h('strong', null, 'Import an existing Microsoft Word template'),
                h('span', null, 'Then select existing text and assign an Oakcloud field. This phase creates real WordprocessingML content controls rather than visible placeholder tokens.')
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
