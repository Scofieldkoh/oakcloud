// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  SENTROWEB_COUNTRIES,
  SENTROWEB_COUNTRY_ALIASES,
  SENTROWEB_COUNTRY_ALPHA3,
  isSentrowebCountry,
  mapToSentrowebCountry,
  normaliseCountryText,
} from '@/lib/sentroweb/countries';

describe('Sentroweb country list and nationality mapping', () => {
  it('has the recorded option list (250 named options, unique names)', () => {
    expect(SENTROWEB_COUNTRIES).toHaveLength(250);
    expect(new Set(SENTROWEB_COUNTRIES.map((c) => c.name)).size).toBe(250);
    expect(isSentrowebCountry('Singapore')).toBe(true);
    expect(isSentrowebCountry('Unspecified')).toBe(false);
    expect(isSentrowebCountry('Unknown or unspecified')).toBe(false);
  });

  it('every alias and three-letter code points at an exact option, and every alias key is normalised', () => {
    for (const [key, target] of Object.entries(SENTROWEB_COUNTRY_ALIASES)) {
      expect(normaliseCountryText(key), key).toBe(key);
      expect(isSentrowebCountry(target), `${key} -> ${target}`).toBe(true);
    }
    for (const [code, target] of Object.entries(SENTROWEB_COUNTRY_ALPHA3)) {
      expect(code).toMatch(/^[A-Z]{3}$/);
      expect(isSentrowebCountry(target), `${code} -> ${target}`).toBe(true);
    }
  });

  it('an alias never shadows an exact option name for a different country', () => {
    const names = new Map(SENTROWEB_COUNTRIES.map((c) => [normaliseCountryText(c.name), c.name]));
    for (const [key, target] of Object.entries(SENTROWEB_COUNTRY_ALIASES)) {
      const exact = names.get(key);
      if (exact) expect(exact, key).toBe(target);
    }
  });

  it.each([
    ['Singaporean', 'Singapore'],
    ['singaporean', 'Singapore'],
    ['  SINGAPORE  ', 'Singapore'],
    ['Singapore', 'Singapore'],
    ['SG', 'Singapore'],
    ['SGP', 'Singapore'],
    ['Malaysian', 'Malaysia'],
    ['MY', 'Malaysia'],
    ['Indian', 'India'],
    ['IN', 'India'],
    ['Chinese', 'China'],
    ['British', 'United Kingdom'],
    ['UK', 'United Kingdom'],
    ['American', 'United States'],
    ['Cote d’Ivoire'.replace('’', "'"), "Cote d'Ivoire"],
    ['Côte d\'Ivoire', "Cote d'Ivoire"],
    ['Åland Islands', 'Åland Islands'],
    ['Hong Kong', 'Hong Kong (HKSAR)'],
    ['hong kong (hksar)', 'Hong Kong (HKSAR)'],
    ['Russian', 'Russia'],
    ['Republic of Korea', 'South Korea'],
    ['Vietnamese', 'Vietnam'],
    ['Filipino', 'Philippines'],
  ])('maps %j to %j', (input, expected) => {
    expect(mapToSentrowebCountry(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['   '],
    ['Dominican'], // Dominica or the Dominican Republic
    ['Guinean'], // Guinea, Guinea-Bissau or Equatorial Guinea
    ['Congolese'], // two Congos
    ['Korean'], // north or south
    ['in'], // a word, not the code
    ['Atlantis'],
    ['Singapore PR'],
    ['Singaporean / Malaysian'],
    ['SX'], // a code the page has no option for
    ['Unspecified'],
    ['Unknown or unspecified'],
    ['constructor'],
    ['__proto__'],
    ['toString'],
    ['123'],
  ])('leaves %j blank', (input) => {
    expect(mapToSentrowebCountry(input as string | null | undefined)).toBeNull();
  });

  it('never returns anything that is not exactly one option of the list', () => {
    const inputs = [...Object.keys(SENTROWEB_COUNTRY_ALIASES), ...Object.keys(SENTROWEB_COUNTRY_ALPHA3), ...SENTROWEB_COUNTRIES.map((c) => c.name), 'ZZ', 'x'];
    for (const input of inputs) {
      const mapped = mapToSentrowebCountry(input);
      if (mapped !== null) expect(isSentrowebCountry(mapped), input).toBe(true);
    }
  });
});
