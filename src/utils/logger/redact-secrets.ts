import { format } from 'winston';

// Fields whose values must never reach the logs, matched in any case.
// express-zod-api logs the full request input as `payload` on any 5xx, and
// these inputs carry them.
const SECRET_KEYS = new Set(['rpcproviderapikey', 'token']);
const REDACTED = '[REDACTED]';
const CIRCULAR = '[Circular]';
const TRUNCATED = '[Truncated]';
// Objects nested deeper than this are cut. Request input can be nested
// thousands of levels, which overflows the call stack while logging.
const MAX_DEPTH = 100;

// Error text can embed a secret as `key: "value"` (Prisma validation errors
// print their call arguments like this). Only quoted values are matched.
// - Up to 7 backslashes before a quote cover an object stringified up to 4
//   times, or text with quotes stringified up to 3 times. The bound keeps the
//   match linear: each step compares a few characters.
// - The key may follow an escape such as `\n`, where `\b` does not hold.
// - For an encoded (backslash) quote, `\\\\(?=\\)\3` keeps an escaped quote
//   of the value inside the value. Raw quotes skip it, so `"a\\"` ends there.
// - The value ends at the first matching quote, even on a later line; with no
//   closing quote (truncated text) it runs to the end. Both fail safe: they
//   can redact extra text, never less.
const SECRET_IN_TEXT =
  /(?:\b|(?<=\\[A-Za-z]))(rpcProviderApiKey|token)(\\{0,7}["'`]?\s*[:=]\s*)(\\{0,7}["'`])(?:\\\\(?=\\)\3|\\[\s\S]|[^\\])*?(\3|\\?$)/gi;

function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key.toLowerCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Errors keep message, stack and cause off the enumerable own properties.
function errorEntries(error: Error): Record<string, unknown> {
  return {
    ...error,
    message: error.message,
    stack: error.stack,
    ...('cause' in error ? { cause: error.cause } : {}),
  };
}

// Returns a redacted copy, so nested caller objects (e.g. live request input)
// are not mutated. Only the top-level info object is changed in place.
function redact(
  value: unknown,
  ancestors: WeakSet<object>,
  depth: number
): unknown {
  if (typeof value === 'string') {
    try {
      return value.replace(SECRET_IN_TEXT, `$1$2$3${REDACTED}$4`);
    } catch {
      // Huge inputs (tens of MB) can overflow the regex stack. Fail safe.
      return REDACTED;
    }
  }
  const isError = value instanceof Error;
  if (!isError && !Array.isArray(value) && !isPlainObject(value)) return value;
  if (ancestors.has(value)) return CIRCULAR;
  if (depth >= MAX_DEPTH) return TRUNCATED;
  ancestors.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => redact(item, ancestors, depth + 1))
    : Object.fromEntries(
        Object.entries(isError ? errorEntries(value) : value).map(
          ([key, item]) => [
            key,
            isSecretKey(key) ? REDACTED : redact(item, ancestors, depth + 1),
          ]
        )
      );
  ancestors.delete(value);
  return result;
}

// Winston needs the info object itself (it holds Symbol keys), so only its
// own string keys are replaced.
export const redactSecrets = format((info) => {
  const ancestors = new WeakSet<object>();
  for (const key of Object.keys(info)) {
    info[key] = isSecretKey(key) ? REDACTED : redact(info[key], ancestors, 0);
  }
  return info;
});
