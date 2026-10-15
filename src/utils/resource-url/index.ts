// Beyond this the (entry, resource) unique index cannot store the URL.
const MAX_RESOURCE_URL_LENGTH = 2048;

/** Storable and requestable as written: short, no whitespace, control or formatting characters. */
export const isStorableUrl = (value: string) =>
  value.length <= MAX_RESOURCE_URL_LENGTH && !/[\s\p{Cc}\p{Cf}]/u.test(value);

/** The same resource however it is spelled: host case, default port, fragment. Null if not a URL. */
export function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}
