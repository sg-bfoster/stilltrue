import type { Compare, CompareFn } from './config.ts';

/**
 * 'contains-all': expected is a list of marker strings, actual is a text
 * corpus. Case-insensitive. The drift signal used by the original
 * school-board check: a curated name/fact vanishing from the live pages.
 */
function containsAll(expected: unknown, actual: unknown): string[] {
  if (!Array.isArray(expected)) {
    throw new TypeError(`contains-all: expected must be string[], got ${typeof expected}`);
  }
  if (typeof actual !== 'string') {
    throw new TypeError(`contains-all: actual must be a string corpus, got ${typeof actual}`);
  }
  const corpus = actual.toLowerCase();
  return expected
    .filter((marker) => !corpus.includes(String(marker).toLowerCase()))
    .map((marker) => `marker no longer present in source: "${marker}"`);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Structural deep-equal with pathed mismatch messages. */
function deepEqual(expected: unknown, actual: unknown, path = '$'): string[] {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const messages: string[] = [];
    if (expected.length !== actual.length) {
      messages.push(`${path}: length ${expected.length} → ${actual.length}`);
    }
    const len = Math.min(expected.length, actual.length);
    for (let i = 0; i < len; i++) {
      messages.push(...deepEqual(expected[i], actual[i], `${path}[${i}]`));
    }
    return messages;
  }
  if (isPlainObject(expected) && isPlainObject(actual)) {
    const messages: string[] = [];
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      if (!(key in actual)) messages.push(`${path}.${key}: missing from source`);
      else if (!(key in expected)) messages.push(`${path}.${key}: unexpected new value ${JSON.stringify(actual[key])}`);
      else messages.push(...deepEqual(expected[key], actual[key], `${path}.${key}`));
    }
    return messages;
  }
  if (expected !== actual) {
    return [`${path}: expected ${JSON.stringify(expected)}, source has ${JSON.stringify(actual)}`];
  }
  return [];
}

export function resolveCompare<E, A>(compare: Compare<E, A> | undefined): CompareFn<E, A> {
  if (compare === undefined || compare === 'deep-equal') return (e, a) => deepEqual(e, a);
  if (compare === 'contains-all') return (e, a) => containsAll(e, a);
  return compare;
}
