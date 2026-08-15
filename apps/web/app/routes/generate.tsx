import { Link } from "react-router";

export default function Generate() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm">
        <Link to="/" className="text-[var(--color-accent)]">
          Casa
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Generate</h1>
      <p className="mt-3 text-[var(--color-muted)]">
        Placeholder page. Scene generation, edits, prompt history, and voice
        input are not wired yet. The working implementations still live in
        <code> apps/canvas</code>.
      </p>

      <section className="mt-10 rounded-lg border border-[var(--color-muted)]/30 p-5">
        <h2 className="text-lg font-medium">Prompt</h2>
        <textarea
          disabled
          rows={4}
          placeholder="Describe the room you want to generate"
          className="mt-3 w-full resize-y rounded-md border border-[var(--color-muted)]/40 bg-transparent px-3 py-2 text-[var(--color-ink)] placeholder:text-[var(--color-muted)] disabled:opacity-60"
        />
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          TODO: prompt history. Persist recent prompts and let the user reuse
          them. Seam: <code>POST/GET /api/prompt-history</code>.
        </p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          TODO: voice prompt. Record audio and send it to{" "}
          <code>POST /api/transcribe</code>, then fill this field.
        </p>
        <button
          type="button"
          disabled
          className="mt-5 rounded-md bg-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-page)] disabled:opacity-50"
        >
          Generate (not implemented)
        </button>
      </section>

      <ul className="mt-8 list-disc space-y-2 pl-5 text-sm text-[var(--color-muted)]">
        <li>
          TODO: generate-scene. Call <code>POST /api/generate-scene</code> with
          images + prompt. Port from <code>apps/canvas/app/api/generate-scene</code>.
        </li>
        <li>
          TODO: edit-scene. Call <code>POST /api/edit-scene</code> for masked
          edits. Port from <code>apps/canvas/app/api/edit-scene</code>.
        </li>
      </ul>
    </main>
  );
}
