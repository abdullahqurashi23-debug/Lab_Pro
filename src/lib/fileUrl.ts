// Converts a raw filesystem path (as stored in the database, e.g. the clinic
// logo path) into a URL that Chromium's <img src> will actually load.
//
// On Windows, paths use backslashes and drive letters (C:\Users\...), which
// is not a valid file:// URL on its own — naively doing `file://${path}`
// produces something like `file://C:\Users\...`, which fails to load. This
// normalizes separators and ensures the correct number of leading slashes
// for both Windows and POSIX paths.
export function toFileUrl(rawPath: string | null | undefined): string {
  if (!rawPath) return '';
  const normalized = rawPath.replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(withLeadingSlash)}`;
}
