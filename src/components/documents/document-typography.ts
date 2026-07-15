export const DOCUMENT_FONT_OPTIONS = [
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { value: "'Courier New', Courier, monospace", label: 'Courier New' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet MS' },
  { value: "'Lucida Console', Monaco, monospace", label: 'Lucida Console' },
] as const;

export const DOCUMENT_FONT_SIZE_OPTIONS = [
  '8pt', '9pt', '10pt', '11pt', '12pt', '14pt',
  '16pt', '18pt', '20pt', '24pt', '28pt', '36pt',
] as const;

export const DEFAULT_DOCUMENT_FONT_FAMILY = DOCUMENT_FONT_OPTIONS[0].value;
export const DEFAULT_DOCUMENT_FONT_SIZE = '11pt';
