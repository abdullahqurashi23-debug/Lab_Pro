// Shared by every screen and print template that shows a money amount, so
// a future currency change (e.g. making the "Af" symbol configurable from
// Settings) has one place to happen instead of several hand-copied
// formatters that can silently drift apart.
export function formatCurrency(n: number): string {
  return `Af ${Number(n).toLocaleString()}`;
}
