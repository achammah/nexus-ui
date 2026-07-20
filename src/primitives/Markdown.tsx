import * as React from "react";
import "./markdown.css";

/* renderMarkdown — a small, dependency-free Markdown → React renderer for AI/agent
   replies and short rich text. Handles inline (**bold**, *italic*, `code`) and block
   level (headings, paragraphs, ordered/unordered lists, blockquotes, fenced code,
   tables, horizontal rules). Presentation is tokenized in markdown.css; the caller
   wraps the output however it likes (see the Markdown component below). */

/* inline: **bold**, *italic*, `code` */
function inlineMd(s: string): React.ReactNode {
  const tokens = s.split(/(\*\*[^*]+\*\*|`[^`]+`|(?<!\*)\*(?!\*)[^*]+\*(?!\*))/g).filter((t) => t !== "");
  return tokens.map((t, i) => {
    if (/^\*\*[\s\S]+\*\*$/.test(t)) return <b key={i}>{t.slice(2, -2)}</b>;
    if (/^`[\s\S]+`$/.test(t)) return <code key={i} className="md-icode">{t.slice(1, -1)}</code>;
    if (/^\*[\s\S]+\*$/.test(t)) return <i key={i}>{t.slice(1, -1)}</i>;
    return <React.Fragment key={i}>{t}</React.Fragment>;
  });
}

/* block-level markdown: headers, paragraphs, ordered/unordered lists, blockquotes,
   fenced code, tables, horizontal rules */
export function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let para: string[] = [], items: { ord: boolean; t: string }[] = [], quote: string[] = [];
  const fp = () => { if (para.length) { out.push(<p key={out.length} className="md-p">{inlineMd(para.join(" "))}</p>); para = []; } };
  const fl = () => { if (items.length) { const O = items[0].ord; const kids = items.map((li, k) => <li key={k}>{inlineMd(li.t)}</li>); out.push(O ? <ol key={out.length} className="md-ol">{kids}</ol> : <ul key={out.length} className="md-ul">{kids}</ul>); items = []; } };
  const fq = () => { if (quote.length) { out.push(<blockquote key={out.length} className="md-quote">{inlineMd(quote.join(" "))}</blockquote>); quote = []; } };
  const fa = () => { fp(); fl(); fq(); };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\s*```/.test(ln)) { fa(); const code: string[] = []; i++; while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++; } out.push(<pre key={out.length} className="md-code"><code>{code.join("\n")}</code></pre>); continue; }
    // table: | header | header | + |---|---| separator + body rows
    if (/^\s*\|.*\|\s*$/.test(ln) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      fa();
      const cells = (r: string) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const header = cells(ln);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { body.push(cells(lines[i])); i++; }
      i--;
      out.push(
        <div key={out.length} className="md-tablewrap">
          <table className="md-table">
            <thead><tr>{header.map((h, k) => <th key={k}>{inlineMd(h)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri}>{header.map((_, ci) => <td key={ci}>{inlineMd(r[ci] ?? "")}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const h = /^(#{1,6})\s+(.*)/.exec(ln);
    if (h) { fa(); const l = Math.min(h[1].length, 4); out.push(<div key={out.length} className={`md-h md-h${l}`}>{inlineMd(h[2])}</div>); continue; }
    const li = /^\s*(\d+\.|[-*+])\s+(.*)/.exec(ln);
    if (li) { fp(); fq(); items.push({ ord: /\d/.test(li[1]), t: li[2] }); continue; }
    if (/^\s*>\s?/.test(ln)) { fp(); fl(); quote.push(ln.replace(/^\s*>\s?/, "")); continue; }
    if (/^\s*([-_*])\1{2,}\s*$/.test(ln)) { fa(); out.push(<hr key={out.length} className="md-hr" />); continue; }
    if (ln.trim() === "") { fa(); continue; }
    para.push(ln);
  }
  fa();
  return out;
}

/* Markdown — a thin wrapper element around renderMarkdown for when a container is
   wanted (a scoped class for the styles). Callers can also use renderMarkdown() raw. */
export function Markdown({ text, className, ...rest }: React.HTMLAttributes<HTMLDivElement> & { text: string }) {
  return (
    <div className={["nxMd", className].filter(Boolean).join(" ")} {...rest}>
      {renderMarkdown(text)}
    </div>
  );
}
