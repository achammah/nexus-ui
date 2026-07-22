/* Builds a synthetic .pptx that looks like a FOREIGN export (Google Slides /
   PowerPoint), exercising the parts our own export never produces:
   theme colours (schemeClr), a grouped shape with its own child coordinate
   space, a bulleted placeholder, an embedded PNG, rotation, and speaker notes.
   Used by the import journeys so fidelity is measured against something we did
   not author ourselves. */
import JSZip from "jszip";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const out = join(dirname(fileURLToPath(import.meta.url)), "fixture-foreign.pptx");
const zip = new JSZip();

const rel = (id, type, target) =>
  `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;

zip.file(
  "[Content_Types].xml",
  `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
</Types>`,
);

zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel("rId1", "officeDocument", "ppt/presentation.xml")}</Relationships>`);

/* deliberately declare slide2 BEFORE slide1 in the id list, so the importer is
   forced to honour presentation order rather than file names */
zip.file(
  "ppt/presentation.xml",
  `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst>
<p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
);
zip.file(
  "ppt/_rels/presentation.xml.rels",
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel("rId1", "slide", "slides/slide1.xml")}${rel("rId2", "slide", "slides/slide2.xml")}</Relationships>`,
);

const HEAD = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;

/* slide1 (second in presentation order): grouped shapes + a rotated ellipse + a picture */
zip.file(
  "ppt/slides/slide1.xml",
  `<?xml version="1.0"?><p:sld ${HEAD}><p:cSld><p:spTree>
<p:grpSp>
  <p:grpSpPr><a:xfrm><a:off x="1000000" y="2000000"/><a:ext cx="4000000" cy="2000000"/><a:chOff x="0" y="0"/><a:chExt cx="2000000" cy="1000000"/></a:xfrm></p:grpSpPr>
  <p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="500000"/></a:xfrm><a:prstGeom prst="roundRect"/><a:solidFill><a:srgbClr val="FF8800"/></a:solidFill></p:spPr>
    <p:txBody><a:bodyPr/><a:p><a:r><a:rPr b="1" sz="2400"/><a:t>In a group</a:t></a:r></a:p></p:txBody></p:sp>
  <p:sp><p:spPr><a:xfrm><a:off x="1000000" y="500000"/><a:ext cx="1000000" cy="500000"/></a:xfrm><a:prstGeom prst="ellipse"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr>
    <p:txBody><a:bodyPr/><a:p><a:r><a:rPr/><a:t>Theme colour</a:t></a:r></a:p></p:txBody></p:sp>
</p:grpSp>
<p:sp><p:spPr><a:xfrm rot="2700000"><a:off x="7000000" y="1500000"/><a:ext cx="2000000" cy="2000000"/></a:xfrm><a:prstGeom prst="star5"/><a:solidFill><a:srgbClr val="3366CC"/></a:solidFill><a:ln w="38100"><a:solidFill><a:srgbClr val="112233"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr/><a:p/></p:txBody></p:sp>
<p:pic><p:nvPicPr><p:cNvPr id="9" name="pic" descr="A red dot"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
  <p:blipFill><a:blip r:embed="rId9"/></p:blipFill>
  <p:spPr><a:xfrm><a:off x="600000" y="500000"/><a:ext cx="900000" cy="900000"/></a:xfrm></p:spPr></p:pic>
</p:spTree></p:cSld></p:sld>`,
);

/* a 1x1 red PNG */
const RED_DOT =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
zip.file("ppt/media/image1.png", RED_DOT, { base64: true });
zip.file(
  "ppt/slides/_rels/slide1.xml.rels",
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel("rId9", "image", "../media/image1.png")}</Relationships>`,
);

/* slide2 (FIRST in presentation order): a title + a bulleted body + notes */
zip.file(
  "ppt/slides/slide2.xml",
  `<?xml version="1.0"?><p:sld ${HEAD}><p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="900000" y="800000"/><a:ext cx="10000000" cy="1200000"/></a:xfrm><a:prstGeom prst="rect"/><a:noFill/></p:spPr>
  <p:txBody><a:bodyPr/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="4400" b="1"><a:solidFill><a:srgbClr val="223344"/></a:solidFill></a:rPr><a:t>Foreign Deck Title</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:spPr><a:xfrm><a:off x="900000" y="2600000"/><a:ext cx="10000000" cy="3000000"/></a:xfrm><a:prstGeom prst="rect"/><a:noFill/></p:spPr>
  <p:txBody><a:bodyPr/>
    <a:p><a:pPr><a:buChar char="&#8226;"/></a:pPr><a:r><a:rPr sz="2000"/><a:t>First bullet</a:t></a:r></a:p>
    <a:p><a:pPr><a:buChar char="&#8226;"/></a:pPr><a:r><a:rPr sz="2000" i="1"/><a:t>Second, italic</a:t></a:r></a:p>
    <a:p><a:r><a:rPr sz="2000"/><a:t>A plain paragraph</a:t></a:r></a:p>
  </p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`,
);
zip.file(
  "ppt/slides/_rels/slide2.xml.rels",
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel("rId3", "notesSlide", "../notesSlides/notesSlide1.xml")}</Relationships>`,
);
zip.file(
  "ppt/notesSlides/notesSlide1.xml",
  `<?xml version="1.0"?><p:notes ${HEAD}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Imported speaker notes survive.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
);

const buf = await zip.generateAsync({ type: "nodebuffer" });
writeFileSync(out, buf);
console.log("wrote", out, buf.length, "bytes");
