import { format } from 'winston';

// Fields whose values must never reach the logs. express-zod-api logs the
// full request input as `payload` on any 5xx, and these inputs carry them.
const SECRET_KEYS = new Set(['rpcProviderApiKey', 'token']);
const REDACTED = '[REDACTED]';
const CIRCULAR = '[Circular]';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Returns a redacted copy, so the caller's objects (e.g. live request input)
// are never mutated.
function redact(value: unknown, ancestors: WeakSet<object>): unknown {
  if (!Array.isArray(value) && !isPlainObject(value)) return value;
  if (ancestors.has(value)) return CIRCULAR;
  ancestors.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => redact(item, ancestors))
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          SECRET_KEYS.has(key) ? REDACTED : redact(item, ancestors),
        ])
      );
  ancestors.delete(value);
  return result;
}

// Winston needs the info object itself (it holds Symbol keys), so only its
// own string keys are replaced.
export const redactSecrets = format((info) => {
  const ancestors = new WeakSet<object>();
  for (const key of Object.keys(info)) {
    info[key] = SECRET_KEYS.has(key) ? REDACTED : redact(info[key], ancestors);
  }
  return info;
});
