/*
 * OakCloud Filing Assistant: value formats. Filing details keep dates as YYYY-MM-DD; each screen
 * map records the format the screen wants (live Bizfile uses "DD MMM YYYY").
 * Defines globalThis.OakFormats.
 */
(function (root) {
  'use strict';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /** Date formats tried, in this order, when learning or correcting a date field. */
  const DATE_FORMATS = ['DD MMM YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'D MMM YYYY', 'DD-MM-YYYY', 'DD MMMM YYYY', 'DDMMYYYY'];

  const TEXT_FORMATS = ['upper', 'digits'];

  function pad(number) {
    return String(number).padStart(2, '0');
  }

  /** Parses YYYY-MM-DD into its parts, or returns null when it is not a real date. */
  function parseIsoDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { year, month, day };
  }

  function formatDate(iso, format) {
    const parts = parseIsoDate(iso);
    if (!parts) return null;
    const { year, month, day } = parts;
    switch (format) {
      case 'DD MMM YYYY':
        return pad(day) + ' ' + MONTHS[month - 1] + ' ' + year;
      case 'D MMM YYYY':
        return day + ' ' + MONTHS[month - 1] + ' ' + year;
      case 'DD MMMM YYYY':
        return pad(day) + ' ' + LONG_MONTHS[month - 1] + ' ' + year;
      case 'DD/MM/YYYY':
        return pad(day) + '/' + pad(month) + '/' + year;
      case 'DD-MM-YYYY':
        return pad(day) + '-' + pad(month) + '-' + year;
      case 'YYYY-MM-DD':
        return year + '-' + pad(month) + '-' + pad(day);
      case 'DDMMYYYY':
        return pad(day) + pad(month) + year;
      default:
        return null;
    }
  }

  function normaliseText(value) {
    return String(value == null ? '' : value)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function digits(value) {
    return String(value == null ? '' : value).replace(/\D/g, '');
  }

  /** The date format that turns iso into what was typed, or null when none does. */
  function detectDateFormat(typed, iso) {
    const wanted = normaliseText(typed);
    return DATE_FORMATS.find((format) => normaliseText(formatDate(iso, format)) === wanted) || null;
  }

  /** The text to put into a field for a filing-details value. */
  function applyFormat(value, format) {
    if (value == null) return '';
    if (DATE_FORMATS.includes(format)) return formatDate(value, format) || String(value);
    if (format === 'upper') return String(value).toUpperCase();
    if (format === 'digits') return digits(value);
    return String(value);
  }

  /**
   * Whether a value seen on the page is the filing-details value, and in which format. Used when
   * learning by demonstration.
   */
  function matchValue(observed, value, type) {
    const seen = normaliseText(observed);
    if (!seen || value == null || value === '') return { match: false };
    if (type === 'date') {
      const format = detectDateFormat(observed, value);
      return format ? { match: true, format } : { match: false };
    }
    const wanted = normaliseText(value);
    if (seen === wanted) {
      // Staff (or the page) typed it in capitals although the filing details are mixed case.
      const upper = /[a-z]/.test(String(value)) && String(observed).trim() === String(value).trim().toUpperCase();
      return { match: true, format: upper ? 'upper' : null };
    }
    if (type === 'phone' && digits(observed) && digits(observed) === digits(value)) return { match: true, format: 'digits' };
    return { match: false };
  }

  root.OakFormats = { DATE_FORMATS, TEXT_FORMATS, parseIsoDate, formatDate, detectDateFormat, applyFormat, matchValue, digits, normaliseText };
})(globalThis);
