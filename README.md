# Doc Retyper

Upload PDFs, PowerPoint slides, Word documents (and images) and get **all the text retyped into a Word (.docx) or plain text (.txt) file**.

- Works **without any API key** for PDF, PPTX, DOCX, TXT, MD, HTML.
- Add an OpenAI key to turn on **AI mode**: cleans up broken line wraps, structures headings/bullets, and reads **scanned PDFs and images** (OCR).
- Edit the result in the browser before downloading. Download one file at a time or all combined.
- No database, no accounts. Your files are processed in memory and never stored.

## Run it from GitHub

```bash
git clone https://github.com/<your-username>/<this-repo>.git
cd <this-repo>
npm install
cp .env.example .env     # optional: put your OPENAI_API_KEY in it
npm run dev
```

Open http://localhost:3000, drop in your files, and click **Retype**.

For a production build: `npm run build && npm start`.

### Run in GitHub Codespaces (no install on your machine)

Open the repo on GitHub → **Code → Codespaces → Create codespace**, then run `npm install && npm run dev`. Codespaces forwards port 3000 for you.

## AI settings (optional)

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables AI retype + scanned PDF/image reading |
| `OPENAI_MODEL` | Model to use (default `gpt-4o-mini`) |
| `OPENAI_BASE_URL` | Point to any OpenAI-compatible API |

## Supported files

| Type | Notes |
| --- | --- |
| `.pdf` | Text PDFs work offline. Scanned PDFs need AI mode. |
| `.pptx` | Slide text, bullets, tables and speaker notes. |
| `.docx` | Full text. |
| `.txt .md .csv .html` | Read as text. |
| `.png .jpg .webp .gif` | Needs AI mode. |
| `.ppt` / `.doc` | Old formats: save as `.pptx` / `.docx` or PDF first. |

## Stack

Next.js (App Router) · Tailwind · `unpdf` · `mammoth` · `jszip` · `docx` · `openai`
