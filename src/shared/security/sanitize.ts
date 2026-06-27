/**
 * Input sanitization helpers.
 *
 * The API only ever emits JSON (never server-rendered HTML), so the primary
 * threat is STORED content: a malicious string saved now and rendered later by
 * some other client/admin UI (stored XSS), plus log/terminal injection via
 * control characters. These helpers neutralize user-provided text at the trust
 * boundary (during request validation) so nothing dangerous is persisted.
 *
 * They are intentionally conservative and composable — callers opt into the
 * behavior they need via `sanitizeText(...)` options.
 */

/**
 * Remove non-printable control characters (e.g. NUL, backspace, escape) that
 * can corrupt logs, terminals, or downstream parsers. Normal whitespace
 * (tab \x09, newline \x0A, carriage return \x0D) is preserved.
 */
export function stripControlCharacters(input: string): string {
  // C0 controls \x00-\x1F except \t \n \r, plus DEL \x7F.
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * HTML-escape the five significant characters so the string is inert if ever
 * interpolated into markup. Use this at any future HTML render site.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Remove HTML tags entirely. Used for free-text we store and may echo back,
 * where we'd rather drop markup than keep (escaped) tag soup.
 */
export function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

export interface SanitizeTextOptions {
  /** Trim leading/trailing whitespace (default: true). */
  trim?: boolean;
  /** Strip HTML tags from the value (default: true). */
  stripHtml?: boolean;
  /** Collapse runs of internal whitespace into a single space (default: false). */
  collapseWhitespace?: boolean;
  /** Hard cap on length after sanitization (characters). */
  maxLength?: number;
}

/**
 * General-purpose text sanitizer for user-provided strings. Always strips
 * control characters; other transforms are configurable.
 */
export function sanitizeText(
  input: string,
  options: SanitizeTextOptions = {}
): string {
  const {
    trim = true,
    stripHtml = true,
    collapseWhitespace = false,
    maxLength,
  } = options;

  let value = stripControlCharacters(input);

  if (stripHtml) {
    value = stripHtmlTags(value);
  }

  if (collapseWhitespace) {
    value = value.replace(/\s+/g, " ");
  }

  if (trim) {
    value = value.trim();
  }

  if (typeof maxLength === "number" && value.length > maxLength) {
    value = value.slice(0, maxLength);
  }

  return value;
}
