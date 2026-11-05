import Retyper from "@/components/Retyper";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-12">
      <header className="mb-8 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-indigo-600">Doc Retyper</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Turn any document into editable text
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">
          Upload PDFs, PowerPoint slides, Word files or images. Get every word retyped into a Word (.docx) or
          plain text (.txt) file.
        </p>
      </header>
      <Retyper />
    </main>
  );
}
