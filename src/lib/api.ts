// Thin wrapper around window.api (exposed by electron/preload.ts).
// Every page imports from here rather than touching window.api directly,
// so there is exactly one place that would need to change if the bridge
// were ever mocked for tests.

function requireApi(): Window['api'] {
  if (!window.api) {
    throw new Error(
      'window.api is missing — this page must be opened inside the Electron app, not a plain browser.'
    );
  }
  return window.api;
}

export const api: Window['api'] = new Proxy({} as Window['api'], {
  get(_target, prop: string) {
    return requireApi()[prop as keyof Window['api']];
  },
});
