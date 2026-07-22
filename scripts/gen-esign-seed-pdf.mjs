// Generates the demo contract PDF embedded in src/blocks/esign/seed-pdf.ts.
// Run: node scripts/gen-esign-seed-pdf.mjs  (regenerate only when the demo
// contract copy changes; the base64 constant is committed so the seed stays sync).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync } from "node:fs";

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const W = 612, H = 792, M = 64;
const ink = rgb(0.13, 0.15, 0.19);
const soft = rgb(0.42, 0.45, 0.5);

function page() {
  const p = doc.addPage([W, H]);
  return p;
}
function para(p, text, y, size = 10.5, f = font, color = ink, lh = 15, width = W - 2 * M) {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (f.widthOfTextAtSize(t, size) > width) {
      p.drawText(line, { x: M, y, size, font: f, color });
      y -= lh;
      line = w;
    } else line = t;
  }
  if (line) { p.drawText(line, { x: M, y, size, font: f, color }); y -= lh; }
  return y;
}

const p1 = page();
p1.drawText("MASTER SERVICES AGREEMENT", { x: M, y: H - 88, size: 19, font: bold, color: ink });
p1.drawText("Agreement No. MSA-2026-0142", { x: M, y: H - 110, size: 10, font, color: soft });
p1.drawLine({ start: { x: M, y: H - 124 }, end: { x: W - M, y: H - 124 }, thickness: 1, color: rgb(0.85, 0.86, 0.88) });
let y = H - 152;
y = para(p1, "This Master Services Agreement (the “Agreement”) is entered into as of the Effective Date by and between Meridian Analytics Ltd., a company registered in Ireland with offices at 4 Harbour Square, Dublin (“Provider”), and Northwind Retail Group BV, with offices at Keizersgracht 220, Amsterdam (“Client”).", y);
y -= 10;
p1.drawText("1. Services", { x: M, y, size: 12, font: bold, color: ink }); y -= 18;
y = para(p1, "Provider shall deliver the analytics platform implementation and managed reporting services described in Statement of Work #1, including data pipeline configuration, dashboard delivery, and quarterly business reviews.", y);
y -= 10;
p1.drawText("2. Term", { x: M, y, size: 12, font: bold, color: ink }); y -= 18;
y = para(p1, "The initial term is twenty-four (24) months from the Effective Date, renewing automatically for successive twelve (12) month periods unless either party gives ninety (90) days written notice of non-renewal.", y);
y -= 10;
p1.drawText("3. Fees and Payment", { x: M, y, size: 12, font: bold, color: ink }); y -= 18;
y = para(p1, "Client shall pay the fees set out in Exhibit B. Invoices are issued monthly in arrears and are payable within thirty (30) days. Late amounts accrue interest at 1% per month or the maximum permitted by law, whichever is lower.", y);
y -= 10;
p1.drawText("4. Confidentiality", { x: M, y, size: 12, font: bold, color: ink }); y -= 18;
y = para(p1, "Each party shall protect the other party's Confidential Information with at least the same degree of care it uses for its own, and no less than reasonable care, and shall use it solely to perform under this Agreement.", y);
y -= 10;
p1.drawText("5. Data Protection", { x: M, y, size: 12, font: bold, color: ink }); y -= 18;
y = para(p1, "The parties shall comply with the Data Processing Addendum in Exhibit C. Provider acts as processor for Client personal data and shall implement the technical and organisational measures described therein.", y);
p1.drawText("Page 1 of 2", { x: W / 2 - 26, y: 40, size: 9, font, color: soft });

const p2 = page();
let y2 = H - 88;
p2.drawText("6. Limitation of Liability", { x: M, y: y2, size: 12, font: bold, color: ink }); y2 -= 18;
y2 = para(p2, "Except for breaches of confidentiality or amounts owed, neither party's aggregate liability shall exceed the fees paid or payable in the twelve (12) months preceding the claim. Neither party is liable for indirect or consequential damages.", y2);
y2 -= 10;
p2.drawText("7. Governing Law", { x: M, y: y2, size: 12, font: bold, color: ink }); y2 -= 18;
y2 = para(p2, "This Agreement is governed by the laws of Ireland. The courts of Dublin have exclusive jurisdiction, without regard to conflict of law principles.", y2);
y2 -= 24;
y2 = para(p2, "IN WITNESS WHEREOF, the parties have executed this Agreement by their duly authorised representatives as of the Effective Date.", y2);
y2 -= 26;

// signature wells (fields land on top of these in the seed)
function well(px, label, name, title) {
  p2.drawLine({ start: { x: px, y: 300 }, end: { x: px + 200, y: 300 }, thickness: 1, color: rgb(0.6, 0.62, 0.66) });
  p2.drawText(label, { x: px, y: 286, size: 9, font: bold, color: soft });
  p2.drawText(name, { x: px, y: 268, size: 10, font, color: ink });
  p2.drawText(title, { x: px, y: 254, size: 9, font, color: soft });
  p2.drawText("Date:", { x: px, y: 216, size: 9, font: bold, color: soft });
  p2.drawLine({ start: { x: px + 34, y: 214 }, end: { x: px + 160, y: 214 }, thickness: 1, color: rgb(0.6, 0.62, 0.66) });
  p2.drawText("Initials:", { x: px, y: 186, size: 9, font: bold, color: soft });
  p2.drawLine({ start: { x: px + 42, y: 184 }, end: { x: px + 100, y: 184 }, thickness: 1, color: rgb(0.6, 0.62, 0.66) });
}
well(M, "PROVIDER", "Elena Vasquez", "VP Commercial, Meridian Analytics Ltd.");
well(W - M - 200, "CLIENT", "Jonas de Vries", "Chief Operating Officer, Northwind Retail Group BV");
p2.drawText("Purchase order reference (if any):", { x: M, y: 140, size: 9, font: bold, color: soft });
p2.drawLine({ start: { x: M + 170, y: 138 }, end: { x: M + 380, y: 138 }, thickness: 1, color: rgb(0.6, 0.62, 0.66) });
p2.drawText("Page 2 of 2", { x: W / 2 - 26, y: 40, size: 9, font, color: soft });

const bytes = await doc.save();
const b64 = Buffer.from(bytes).toString("base64");
const ts = `// GENERATED by scripts/gen-esign-seed-pdf.mjs — the demo contract embedded in seedEnvelope().
// A real 2-page PDF (pdf-lib generated) so the seed exercises the true intake->render path.
export const SEED_CONTRACT_PDF_BASE64 =
${JSON.stringify(b64).replace(/(.{100})/g, "$1\" +\n  \"").replace(/\+\n  ""$/, "")};
export const SEED_CONTRACT_NAME = "Master Services Agreement — Meridian x Northwind.pdf";
`;
writeFileSync("src/blocks/esign/seed-pdf.ts", ts);
console.log("wrote seed-pdf.ts", b64.length, "b64 chars,", bytes.length, "bytes");
