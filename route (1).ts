import { extractFile } from "@/lib/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const useAi = form.get("useAi") === "true";

  if (!files.length) {
    return Response.json({ error: "No files uploaded." }, { status: 400 });
  }

  const results = [];
  for (const file of files) {
    try {
      const r = await extractFile(file, useAi);
      results.push({ ok: true as const, ...r });
    } catch (err) {
      results.push({
        ok: false as const,
        name: file.name,
        error: err instanceof Error ? err.message : "Failed to read file.",
      });
    }
  }
  return Response.json({ results });
}
