/* Minimal ambient types for `mammoth` (the lib ships no .d.ts). We use only
   convertToHtml on the browser build (resolved via mammoth's `browser` field). */
declare module "mammoth" {
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: Record<string, unknown>,
  ): Promise<{ value: string; messages: Array<{ type: string; message: string }> }>;
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
  const _default: { convertToHtml: typeof convertToHtml; extractRawText: typeof extractRawText };
  export default _default;
}
