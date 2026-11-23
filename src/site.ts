// Single place for site-wide constants. The CSP string must stay identical to public/_headers
// (minus frame-ancestors, which is header-only) and to every page that still carries it by hand.
export const SITE_NAME = "Aadil Varshani";

// Posts keep declaring the old origin until the nulltheory.dev cutover (docs/MIGRATION.md, Phase 3).
export const CANONICAL_ORIGIN = "https://aadilvarshani.github.io";

export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src https://formspree.io; form-action https://formspree.io; base-uri 'self'; object-src 'none'; upgrade-insecure-requests;";
