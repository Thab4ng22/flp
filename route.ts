import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function runs(line: string): TextRun[] {
  // support **bold** inline
  return line
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**")
        ? new TextRun({ text: part.slice(2, -2), bold: true })
        : new TextRun({ text: part })
    );
}

function toParagraphs(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][
        h[1].length - 1
      ];
      out.push(new Paragraph({ heading: level, children: runs(h[2]), spacing: { before: 240, after: 120 } }));
      continue;
    }
    const b = line.match(/^\s*[-*•]\s+(.*)$/);
    if (b) {
      out.push(new Paragraph({ bullet: { level: 0 }, children: runs(b[1]) }));
      continue;
    }
    out.push(new Paragraph({ children: runs(line), spacing: { after: 120 } }));
  }
  return out;
}

export async function POST(req: Request) {
  const { text, title } = (await req.json()) as { text?: string; title?: string };
  if (typeof text !== "string" || !text.trim()) {
    return Response.json({ error: "Nothing to export." }, { status: 400 });
  }
  const doc = new Document({
    title: title || "Document",
    creator: "Doc Retyper",
    sections: [{ children: toParagraphs(text) }],
  });
  const buf = await Packer.toBuffer(doc);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="document.docx"',
    },
  });
}
