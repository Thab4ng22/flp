import OpenAI from "openai";

/**
 * Optional AI layer. Everything in the app works WITHOUT an API key
 * (plain text extraction). When OPENAI_API_KEY is set, the AI can:
 *   1. "Retype" extracted text into clean, well-structured text.
 *   2. Read scanned PDFs and images (OCR / vision).
 *
 * Works with any OpenAI-compatible provider via OPENAI_BASE_URL.
 */

export function aiEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function model(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }
  return _client;
}

const FORMAT_RULES = `Formatting rules for your output:
- Use "# " for the main title, "## " for sections / slides / pages, "### " for sub-headings.
- Use "- " for bullet points.
- Write tables as rows with cells separated by " | ".
- Use plain paragraphs for body text. Do not use code fences.
- Output ONLY the document text. No commentary, no preamble.`;

const CLEAN_PROMPT = `You are a meticulous transcription assistant. You will be given raw text that was automatically extracted from a document (PDF, slides, or Word file). Retype it as clean, well-organised text.

Strict rules:
- Keep EVERY piece of information. Do not summarise, shorten, omit, or add anything.
- Keep the original order.
- Fix extraction artefacts only: broken line wraps, hyphenation across lines, stray page numbers/headers repeated on every page, duplicated whitespace, garbled bullet characters.
- Do not translate. Keep the original language.

${FORMAT_RULES}`;

const VISION_PROMPT = `You are a meticulous transcription assistant. Transcribe ALL the text and information in the provided document exactly as it appears, in reading order. Describe charts, diagrams or images briefly in square brackets, e.g. [Chart: sales by quarter, Q1 10, Q2 14]. Do not summarise, skip, or invent anything. Do not translate.

${FORMAT_RULES}`;

function splitIntoChunks(text: string, maxLen = 7000): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (p.length > maxLen) {
      // very long paragraph: hard split on line breaks / sentences
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < p.length; i += maxLen) chunks.push(p.slice(i, i + maxLen));
      continue;
    }
    if ((current + "\n\n" + p).length > maxLen && current) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Retype extracted text into clean, structured text using the AI. */
export async function aiCleanText(text: string): Promise<string> {
  const chunks = splitIntoChunks(text);
  const out = await mapLimit(chunks, 3, async (chunk) => {
    const res = await client().chat.completions.create({
      model: model(),
      temperature: 0,
      messages: [
        { role: "system", content: CLEAN_PROMPT },
        { role: "user", content: chunk },
      ],
    });
    return res.choices[0]?.message?.content?.trim() || chunk;
  });
  return out.join("\n\n");
}

/** Transcribe an image (photo of a page, screenshot of a slide, ...). */
export async function aiTranscribeImage(buf: Buffer, mime: string): Promise<string> {
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  const res = await client().chat.completions.create({
    model: model(),
    temperature: 0,
    messages: [
      { role: "system", content: VISION_PROMPT },
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: dataUrl, detail: "high" } }],
      },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || "";
}

/** Transcribe a scanned / image-only PDF by sending the PDF itself to the model. */
export async function aiTranscribePdf(buf: Buffer, filename: string): Promise<string> {
  const res = await client().responses.create({
    model: model(),
    instructions: VISION_PROMPT,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "Transcribe this document." },
          {
            type: "input_file",
            filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
            file_data: `data:application/pdf;base64,${buf.toString("base64")}`,
          },
        ],
      },
    ],
  });
  return (res.output_text || "").trim();
}
