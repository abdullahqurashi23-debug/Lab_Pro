// jsbarcode doesn't ship its own TypeScript types and we don't need the
// whole surface — just enough to call it the one way this app does.
declare module 'jsbarcode' {
  interface JsBarcodeOptions {
    format?: string;
    width?: number;
    height?: number;
    displayValue?: boolean;
    fontSize?: number;
    margin?: number;
  }
  function JsBarcode(
    element: SVGElement | HTMLElement,
    value: string,
    options?: JsBarcodeOptions
  ): void;
  export default JsBarcode;
}
