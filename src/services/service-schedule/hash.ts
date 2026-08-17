import { createHash } from 'node:crypto';

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

function canonicalize(value: unknown, seen: Set<unknown>): JsonLike | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value instanceof Date) return value.toISOString();

  if (seen.has(value)) throw new TypeError('Cannot hash a cyclic configuration');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      // Array order is intentionally preserved. Schedule entry order is part
      // of the configuration identity even when object keys are reordered.
      return value.map((entry) => {
        const normalized = canonicalize(entry, seen);
        return normalized === undefined ? null : normalized;
      });
    }

    if (value instanceof Set) {
      return [...value].map((entry) => {
        const normalized = canonicalize(entry, seen);
        return normalized === undefined ? null : normalized;
      });
    }

    if (value instanceof Map) {
      const object: Record<string, JsonLike> = {};
      for (const [key, entry] of [...value.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)))) {
        const normalized = canonicalize(entry, seen);
        if (normalized !== undefined) object[String(key)] = normalized;
      }
      return object;
    }

    if (typeof value === 'object') {
      const object: Record<string, JsonLike> = {};
      for (const key of Object.keys(value as object).sort()) {
        const normalized = canonicalize((value as Record<string, unknown>)[key], seen);
        if (normalized !== undefined) object[key] = normalized;
      }
      return object;
    }
  } finally {
    seen.delete(value);
  }
  return undefined;
}

export function canonicalizeConfiguration(value: unknown): JsonLike | undefined {
  return canonicalize(value, new Set());
}

export function canonicalJson(value: unknown): string {
  const normalized = canonicalizeConfiguration(value);
  return JSON.stringify(normalized) ?? 'null';
}

export function hashConfiguration(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
