import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { aiCleanText, aiEnabled, aiTranscribeImage, aiTranscribePdf } from "./ai";

export type ExtractResult = {
  name: string;
  text: string;
  method: string;
  warnings: string[];
};

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

/** Pull paragraphs of text out of a PowerPoint slide / notes XML. */
function paragraphsFromPptXml(xml: string): string[] {
  const paras: string[] = [];
  const paraRe = /<a:p[ >][\s\S]*?<\/a:p>/g;
  const m = xml.match(paraRe) || [];
  for (const p of m) {
    const parts: string[] = [];
    const tokenRe = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\s*\/>|<a:tab\s*\/>/g;
    let t: RegExpExecArray | null;
    while ((t = tokenRe.exec(p))) {
      if (t[0].startsWith("<a:br")) parts.push("\n");
      else if (t[0].startsWith("<a:tab")) parts.push("\t");
      else parts.push(decodeEntities(t[1]));
    }
    const line = parts.join("").trim();
    if (line) {
      const isBullet = /<a:buChar|<a:buAutoNum/.test(p);
      paras.push(isBullet ? `- ${line}` : line);
    }
  }
  return paras;
}

async function extractPptx(buf: Buffer): Promise<{ text: string; warnings: string[] }> {
  const zip = await JSZip.loadAsync(buf);
  const num = (path: string) => parseInt(path.match(/(\d+)\.xml$/)?.[1] || "0", 10);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => num(a) - num(b));

  const out: string[] = [];
  for (const path of slidePaths) {
    const n = num(path);
    const xml = await zip.files[path].async("string");
    const lines = paragraphsFromPptXml(xml);
    let block = `## Slide ${n}\n\n${lines.join("\n") || "[No text on this slide]"}`;

    const notesFile = zip.files[`ppt/notesSlides/notesSlide${n}.xml`];
    if (notesFile) {
      const notes = paragraphsFromPptXml(await notesFile.async("string"))
        // the notes page also contains the slide number placeholder, drop bare numbers
        .filter((l) => !/^\d+$/.test(l));
      if (notes.length) block += `\n\n### Speaker notes\n\n${notes.join("\n")}`;
    }
    out.push(block);
  }
  const warnings: string[] = [];
  if (!slidePaths.length) warnings.push("No slides found in this file.");
  else warnings.push("Text inside pictures on slides is not read unless you export those slides as images.");
  return { text: out.join("\n\n"), warnings };
}

async function extractPdf(buf: Buffer): Promise<{ text: string; pages: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const body = pages
    .map((t, i) => `## Page ${i + 1}\n\n${t.replace(/[ \t]+\n/g, "\n").trim() || "[No text on this page]"}`)
    .join("\n\n");
  const chars = pages.join("").replace(/\s/g, "").length;
  return { text: chars ? body : "", pages: totalPages };
}

export async function extractFile(file: File, useAi: boolean): Promise<ExtractResult> {
  const name = file.name;
  const e = ext(name);
  const buf = Buffer.from(await file.arrayBuffer());
  const warnings: string[] = [];
  const ai = useAi && aiEnabled();
  let text = "";
  let method = "";

  if (e === "pdf") {
    const { text: t, pages } = await extractPdf(buf);
    text = t;
    method = "PDF text extraction";
    const sparse = t.replace(/\s/g, "").length < pages * 30;
    if (sparse) {
      if (ai) {
        text = await aiTranscribePdf(buf, name);
        method = "AI vision (scanned PDF)";
      } else {
        warnings.push(
          "This PDF has little or no selectable text (it looks scanned). Turn on AI and add an API key to read it."
        );
      }
    }
  } else if (e === "pptx") {
    const r = await extractPptx(buf);
    text = r.text;
    warnings.push(...r.warnings);
    method = "PowerPoint extraction";
  } else if (e === "docx") {
    const r = await mammoth.extractRawText({ buffer: buf });
    text = r.value.trim();
    method = "Word extraction";
  } else if (["txt", "md", "csv", "log", "json", "xml", "html", "htm", "rtf"].includes(e)) {
    text = buf.toString("utf8").trim();
    if (e === "html" || e === "htm") {
      text = decodeEntities(
        text
          .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
          .replace(/<\/(p|div|h\d|li|tr|br)>/gi, "\n")
          .replace(/<[^>]+>/g, "")
      )
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    method = "Plain text";
  } else if (IMAGE_MIME[e]) {
    if (!ai) {
      throw new Error("Images need AI. Add OPENAI_API_KEY to .env and tick “Use AI”.");
    }
    text = await aiTranscribeImage(buf, IMAGE_MIME[e]);
    method = "AI vision (image)";
  } else if (e === "doc" || e === "ppt") {
    throw new Error(`Old .${e} files are not supported. Save as .${e}x (or PDF) and upload again.`);
  } else {
    throw new Error(`Unsupported file type “.${e || "?"}”.`);
  }

  if (!text.trim()) {
    warnings.push("No text could be extracted from this file.");
  } else if (ai && method.indexOf("AI vision") === -1) {
    // Retype with AI for clean formatting
    try {
      text = await aiCleanText(text);
      method += " + AI retype";
    } catch (err) {
      warnings.push(
        `AI cleanup failed (${err instanceof Error ? err.message : "unknown error"}); showing raw extracted text.`
      );
    }
  }

  return { name, text, method, warnings };
}
