/* Wizard — shared shapes. A Q describes one step; kind picks its renderer from the
   registry (Wizard.tsx). `required` (select/text/long only) drives the built-in
   canNext gate — list/sources are never required, they can ship empty. */

export type Kind = "select" | "text" | "long" | "list" | "sources";

export interface Q {
  key: string;
  label: string;
  hint?: string;
  kind: Kind;
  options?: string[];
  placeholder?: string;
  suggest?: string[];
  required?: boolean;
}

export interface SourceDoc {
  name: string;
  text: string;
}

export interface Sources {
  urls: string[];
  docs: SourceDoc[];
}

export type Ans = Record<string, string | string[] | Sources>;

export const asList = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

export const asSources = (v: unknown): Sources =>
  v && typeof v === "object" && "urls" in (v as object) ? (v as Sources) : { urls: [], docs: [] };
