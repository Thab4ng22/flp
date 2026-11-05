"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Item =
  | { ok: true; name: string; text: string; method: string; warnings: string[] }
  | { ok: false; name: string; error: string };

const ACCEPT = ".pdf,.pptx,.docx,.txt,.md,.csv,.html,.htm,.png,.jpg,.jpeg,.webp,.gif";

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

function toPlainText(md: string) {
  return md
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function Retyper() {
  const [files, setFiles] = useState<File[]>([]);
  const [useAi, setUseAi] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [format, setFormat] = useState<"docx" | "txt">("docx");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        setAiAvailable(Boolean(d.ai));
        setUseAi(Boolean(d.ai));
      })
      .catch(() => {});
  }, []);

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list);
    setFiles((prev) => {
      const key = (f: File) => `${f.name}:${f.size}`;
      const seen = new Set(prev.map(key));
      return [...prev, ...incoming.filter((f) => !seen.has(key(f)))];
    });
  }, []);

  async function run() {
    if (!files.length) return;
    setBusy(true);
    setError("");
    setItems([]);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("useAi", String(useAi));
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setItems(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function download(text: string, title: string) {
    if (format === "txt") {
      saveBlob(new Blob([toPlainText(text)], { type: "text/plain;charset=utf-8" }), `${title}.txt`);
      return;
    }
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, title }),
    });
    if (!res.ok) {
      setError("Could not create the Word file.");
      return;
    }
    saveBlob(await res.blob(), `${title}.docx`);
  }

  function updateText(index: number, text: string) {
    setItems((prev) => prev.map((it, i) => (i === index && it.ok ? { ...it, text } : it)));
  }

  const okItems = items.filter((i): i is Extract<Item, { ok: true }> => i.ok);

  function combined() {
    return okItems.map((i) => `# ${i.name}\n\n${i.text}`).join("\n\n");
  }

  return (
    <div className="space-y-6">
      {/* Upload */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${
          dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="text-4xl">📄</div>
        <p className="mt-2 font-semibold text-slate-800">Drop files here or click to browse</p>
        <p className="mt-1 text-sm text-slate-500">PDF · PPTX · DOCX · TXT · MD · HTML · PNG/JPG (AI)</p>
      </div>

      {files.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-2xl bg-white shadow-sm">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="truncate font-medium text-slate-800">{f.name}</span>
              <span className="ml-4 flex shrink-0 items-center gap-4 text-slate-500">
                {(f.size / 1024 / 1024).toFixed(2)} MB
                <button
                  onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                  className="text-slate-400 hover:text-red-600"
                  aria-label={`Remove ${f.name}`}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Options */}
      <div className="grid gap-4 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Save as</p>
          <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
            {(["docx", "txt"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`rounded-md px-4 py-1.5 font-medium ${
                  format === f ? "bg-white text-indigo-700 shadow" : "text-slate-600"
                }`}
              >
                {f === "docx" ? "Word (.docx)" : "Text (.txt)"}
              </button>
            ))}
          </div>
        </div>
        <label className={`flex items-start gap-3 text-sm ${aiAvailable ? "" : "opacity-60"}`}>
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={useAi}
            disabled={!aiAvailable}
            onChange={(e) => setUseAi(e.target.checked)}
          />
          <span>
            <span className="font-semibold text-slate-700">Use AI to retype &amp; clean up</span>
            <span className="block text-slate-500">
              {aiAvailable
                ? "Fixes line breaks, structures headings and reads scanned PDFs & images."
                : "Add OPENAI_API_KEY to your .env file to enable. Plain extraction works without it."}
            </span>
          </span>
        </label>
      </div>

      <button
        onClick={run}
        disabled={!files.length || busy}
        className="w-full rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white shadow transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {busy ? "Reading your documents…" : `Retype ${files.length || ""} ${files.length === 1 ? "file" : "files"}`}
      </button>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Results */}
      {items.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">Results</h2>
            {okItems.length > 1 && (
              <button
                onClick={() => download(combined(), "combined-documents")}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Download all as one {format === "docx" ? ".docx" : ".txt"}
              </button>
            )}
          </div>

          {items.map((it, i) =>
            it.ok ? (
              <article key={i} className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-slate-900">{it.name}</h3>
                    <p className="text-xs text-slate-500">
                      {it.method} · {it.text.split(/\s+/).filter(Boolean).length.toLocaleString()} words
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(toPlainText(it.text))}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Copy
                    </button>
                    <button
                      disabled={!it.text.trim()}
                      onClick={() => download(`# ${baseName(it.name)}\n\n${it.text}`, baseName(it.name))}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                    >
                      Download .{format}
                    </button>
                  </div>
                </div>
                {it.warnings.map((w, k) => (
                  <p key={k} className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {w}
                  </p>
                ))}
                <textarea
                  value={it.text}
                  onChange={(e) => updateText(i, e.target.value)}
                  spellCheck={false}
                  className="h-72 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
                />
              </article>
            ) : (
              <article key={i} className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <h3 className="font-semibold text-red-800">{it.name}</h3>
                <p className="text-sm text-red-700">{it.error}</p>
              </article>
            )
          )}
        </section>
      )}
    </div>
  );
}
