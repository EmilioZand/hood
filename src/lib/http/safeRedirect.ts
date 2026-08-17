/**
 * Normalizes an untrusted `redirectTo`/`back` value into a path that can only ever stay
 * on this origin, falling back to `fallback` when it can't.
 *
 * These values arrive from query strings and hidden form fields, then get handed to
 * `redirect()` / `NextResponse.redirect()` / `<Link href>`. Next's `redirect()` accepts
 * absolute URLs, so an unvalidated value there is an open redirect — and a
 * post-authentication one is a credential-phishing primitive: the victim signs in on the
 * real site, then gets bounced to a lookalike that asks them to "sign in again".
 *
 * Returns the *sanitized* string rather than a boolean on purpose. A predicate invites
 * validating one value and then using the original, which is exactly how the control-
 * character bypass below survives.
 */
export function safeRedirectPath(
  input: string | null | undefined,
  fallback = "/",
): string {
  if (!input) return fallback;

  // The URL parser strips tab/LF/CR from anywhere in a URL *before* parsing, so
  // "/\t/evil.com" is resolved by the browser as "//evil.com" — protocol-relative, i.e.
  // a different host. Strip them first so we test what will actually be navigated to.
  const path = input.replace(/[\t\n\r]/g, "");

  // Require exactly one leading slash: a rooted path, and not "//host" (protocol-relative)
  // or "/\host" (which several parsers normalize to "//host"). Anything without a leading
  // slash — "https://evil.com", "javascript:…", " //evil.com" after leading-space
  // stripping — is rejected too.
  if (!/^\/(?![/\\])/.test(path)) return fallback;

  return path;
}
