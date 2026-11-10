import { format } from 'winston';

// Fields whose values must never reach the logs, matched in any case.
// express-zod-api logs the full request input as `payload` on any 5xx, and
// these inputs carry them.
const SECRET_KEYS = new Set(['rpcproviderapikey', 'token']);
const REDACTED = '[REDACTED]';
const CIRCULAR = '[Circular]';

// Error text can embed a secret as `key: "value"` (Prisma validation errors
// print their call arguments like this). Only quoted values are matched.
// `\\?` before a quote also covers JSON that was stringified twice; a value
// with no closing quote (truncated text) is redacted to the end.
const SECRET_IN_TEXT =
  /\b(rpcProviderApiKey|token)(\\?["']?\s*[:=]\s*)(\\?["'])(?:\\.|[^\\])*?(\3|$)/gi;

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
function redact(value: unknown, ancestors: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return value.replace(SECRET_IN_TEXT, `$1$2$3${REDACTED}$4`);
  }
  const isError = value instanceof Error;
  if (!isError && !Array.isArray(value) && !isPlainObject(value)) return value;
  if (ancestors.has(value)) return CIRCULAR;
  ancestors.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => redact(item, ancestors))
    : Object.fromEntries(
        Object.entries(isError ? errorEntries(value) : value).map(
          ([key, item]) => [
            key,
            isSecretKey(key) ? REDACTED : redact(item, ancestors),
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
    info[key] = isSecretKey(key) ? REDACTED : redact(info[key], ancestors);
  }
  return info;
});
