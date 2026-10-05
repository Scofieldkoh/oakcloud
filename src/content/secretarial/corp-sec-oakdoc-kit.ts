import { oakDocFieldTitle } from '@/lib/document-editor/oakdoc-field-case';
import { writeOakDocRepeaterSections } from '@/lib/document-editor/oakdoc-custom-fields';
import {
  oakDocContactListSlug,
  oakDocContactsRepeaterTag,
} from '@/lib/document-editor/oakdoc-repeater-definitions';
import type { PlaceholderDefinition } from '@/lib/validations/document-template';
import {
  ARIAL_10,
  ControlIds,
  packageOakDoc,
  repeatingSection,
  wordWriter,
  type PageMargins,
  type ParagraphFormat,
  type RunFormat,
  type Typeface,
  type WordWriter,
} from '@/content/resolution/resolution-oakdoc-xml';

/**
 * A small kit for writing the corporate secretarial starters (resolution
 * partials, letters, notices, minutes and share documents) as sentences:
 * text and fields in order, with the custom fields and named sections each
 * document uses collected into its placeholders as it is built.
 */

/** A field control in a sentence. */
export interface FieldRef {
  tag: string;
  /** The Word title (alias), with any text case or date format suffix. */
  title: string;
  sample: string;
  format?: RunFormat;
  /** The custom field's definition, for `custom.<key>` fields. */
  definition?: PlaceholderDefinition;
}

/** Text printed in a format of its own (bold, underlined). */
export interface StyledText {
  text: string;
  format: RunFormat;
}

export type Segment = string | FieldRef | StyledText;

/** A tab, for "a)<tab>text" and "•<tab>text" items. */
export const TAB = '\t';

export interface FieldOptions {
  /** Print the value in capitals (the field's Text case, not Word's All caps). */
  upper?: boolean;
  /** Word date pattern the value prints in, e.g. "d MMMM yyyy". */
  dateFormat?: string;
  bold?: boolean;
}

function title(label: string, options: FieldOptions): string {
  return oakDocFieldTitle(label, options.upper ? 'upper' : null, options.dateFormat ?? null);
}

/** A registered field (company, repeating person, picker). */
export function field(tag: string, label: string, sample: string, options: FieldOptions = {}): FieldRef {
  return { tag, title: title(label, options), sample, ...(options.bold ? { format: { bold: true } } : {}) };
}

export type CustomFieldType = 'text' | 'textarea' | 'date' | 'number' | 'currency';

/**
 * A custom field asked on Configure. Dropdown choices make it a dropdown;
 * fields are required unless said otherwise.
 */
export function custom(
  key: string,
  label: string,
  type: CustomFieldType,
  sample: string,
  options: FieldOptions & { choices?: readonly string[]; required?: boolean } = {},
): FieldRef {
  const tag = `custom.${key}`;
  return {
    ...field(tag, label, sample, options),
    definition: {
      key: tag,
      path: tag,
      type,
      label,
      source: 'custom',
      category: 'custom',
      required: options.required ?? true,
      ...(options.choices ? { options: [...options.choices] } : {}),
    },
  };
}

/** The same field printed differently (bold, capitals, another date format). */
export function as(ref: FieldRef, options: FieldOptions): FieldRef {
  const label = ref.title.split(' · ')[0];
  return {
    ...ref,
    title: title(label, options),
    format: { ...ref.format, ...(options.bold ? { bold: true } : {}) },
  };
}

export function bold(text: string): StyledText {
  return { text, format: { bold: true } };
}

/** Sentence segments from a template literal: `t\`the transfer of ${shares} shares\``. */
export function t(strings: TemplateStringsArray, ...values: Array<Segment | Segment[]>): Segment[] {
  const segments: Segment[] = [];
  strings.forEach((text, index) => {
    if (text) segments.push(text);
    if (index < values.length) {
      const value = values[index];
      if (Array.isArray(value)) segments.push(...value);
      else segments.push(value);
    }
  });
  return segments;
}

const BOX = ['top', 'left', 'bottom', 'right']
  .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`)
  .join('');

function isField(segment: Segment): segment is FieldRef {
  return typeof segment === 'object' && 'tag' in segment;
}

/** Writes one document, remembering the custom fields and section names it uses. */
export class DocumentWriter {
  readonly ids: ControlIds;
  readonly w: WordWriter;
  private readonly definitions = new Map<string, PlaceholderDefinition>();
  private readonly names: Record<string, string> = {};
  private readonly present = new Set<string>();

  constructor(readonly typeface: Typeface = ARIAL_10, idStart = 9100) {
    this.ids = new ControlIds(idStart);
    this.w = wordWriter(typeface);
  }

  runs(segments: Segment[] | string, base: RunFormat = {}): string {
    const list = typeof segments === 'string' ? [segments] : segments;
    return list.map((segment) => {
      if (segment === TAB) return this.w.tabRun();
      if (typeof segment === 'string') return this.w.run(segment, base);
      if (!isField(segment)) return this.w.run(segment.text, { ...base, ...segment.format });
      if (segment.definition && !this.definitions.has(segment.definition.key)) {
        this.definitions.set(segment.definition.key, segment.definition);
      }
      if (segment.tag.startsWith('selectedDirector.')) this.present.add('selectedDirector');
      if (segment.tag.startsWith('selectedShareholder.')) this.present.add('selectedShareholder');
      return this.w.field(this.ids, segment.tag, segment.title, segment.sample, { ...base, ...segment.format });
    }).join('');
  }

  p(segments: Segment[] | string, format: ParagraphFormat = {}, base: RunFormat = {}): string {
    return this.w.paragraph(this.runs(segments, base), format);
  }

  /** An empty paragraph, for spacing. */
  gap(after = 200): string {
    return this.w.paragraph('', { after });
  }

  /** A table cell holding these blocks (paragraphs). */
  cell(width: number, blocks: string | string[], options: { borders?: boolean; vAlign?: 'top' | 'center' | 'bottom' } = {}): string {
    const content = Array.isArray(blocks) ? blocks.join('') : blocks;
    return [
      '<w:tc><w:tcPr>',
      `<w:tcW w:w="${width}" w:type="dxa"/>`,
      options.borders ? `<w:tcBorders>${BOX}</w:tcBorders>` : '',
      `<w:vAlign w:val="${options.vAlign ?? 'top'}"/>`,
      '</w:tcPr>',
      content || this.w.paragraph('', { after: 0 }),
      '</w:tc>',
    ].join('');
  }

  row(cells: string[], options: { header?: boolean; cantSplit?: boolean } = {}): string {
    const properties = [options.header ? '<w:tblHeader/>' : '', options.cantSplit ? '<w:cantSplit/>' : ''].join('');
    return `<w:tr>${properties ? `<w:trPr>${properties}</w:trPr>` : ''}${cells.join('')}</w:tr>`;
  }

  /** A fixed-width table of rows (some may be repeating sections of rows). */
  table(widths: number[], rows: string[], options: { borders?: boolean } = {}): string {
    const borders = options.borders
      ? `<w:tblBorders>${BOX}<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tblBorders>`
      : '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
    return [
      '<w:tbl><w:tblPr>',
      `<w:tblW w:w="${widths.reduce((sum, width) => sum + width, 0)}" w:type="dxa"/>`,
      borders,
      '<w:tblLayout w:type="fixed"/>',
      '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>',
      '</w:tblPr>',
      `<w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`,
      rows.join(''),
      '</w:tbl>',
    ].join('');
  }

  /** A repeating section; a name titles its picker on Configure. */
  repeat(tag: string, content: string, name?: string): string {
    this.present.add(tag);
    if (name) this.names[tag] = name;
    return repeatingSection(this.ids, tag, name ?? tag, content);
  }

  /** A named contacts list: its own picker on Configure, shared by name across a batch. */
  contacts(name: string, content: string): string {
    return this.repeat(oakDocContactsRepeaterTag(oakDocContactListSlug(name)), content, name);
  }

  /** Titles a single-person picker on Configure ("Chairman of the meeting"). */
  namePicker(key: 'selectedDirector' | 'selectedShareholder', name: string): void {
    this.present.add(key);
    this.names[key] = name;
  }

  /** The custom fields, section names and per-person setting to store on the template or partial. */
  placeholders(perPersonTag?: string): PlaceholderDefinition[] {
    return writeOakDocRepeaterSections(
      [...this.definitions.values()],
      { names: this.names, shortlists: {}, perPersonTag: perPersonTag ?? null },
      [...this.present],
    ) as PlaceholderDefinition[];
  }

  package(body: string[], margins?: PageMargins, extraStyles?: string): Uint8Array {
    return packageOakDoc(body.join('\n    '), { typeface: this.typeface, margins, extraStyles });
  }
}

/** A built document and what to store with it. */
export interface BuiltDocument {
  bytes: Uint8Array;
  placeholders: PlaceholderDefinition[];
}
