import { API_PREFIX } from '@kb/shared'

const features = [
  {
    name: 'Docs, snippets and notes',
    description:
      'Store markdown documents, reusable code snippets and quick notes in one place, organised with tags and folders.',
  },
  {
    name: 'Auto-linking',
    description:
      'Related items link themselves: explicit [[wiki links]] are extracted on save, and suggested links come from shared tags and text similarity.',
  },
  {
    name: 'Knowledge graph',
    description:
      'Explore how your knowledge connects. The graph is rendered on canvas and supports zoom, pan and filtering by tag or note type.',
  },
  {
    name: 'Fast search',
    description:
      'Full-text search backed by Postgres tsvector ranking, targeting sub-200 ms results across ten thousand notes.',
  },
  {
    name: 'GitHub sync',
    description:
      'Import gists and selected repositories, then keep them in sync while you keep working. One-way import first, two-way later.',
  },
  {
    name: 'Live updates',
    description:
      'Notes and sync events stream to the browser, so the graph and search results stay current across tabs and devices.',
  },
] as const

const pipeline = [
  'A note is saved in the editor.',
  'A background job parses the markdown: headings, tags and wiki links.',
  'Explicit links become edges; suggested links are scored from tag overlap and similarity.',
  'The graph and search index update, and the browser is notified over SSE.',
] as const

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-16 px-6 py-10 sm:py-14">
      <a
        href="#main-content"
        className="bg-accent text-accent-ink focus:ring-accent rounded-md px-4 py-2 text-sm font-semibold focus:ring-2 focus:ring-offset-2 focus:ring-offset-canvas sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50"
      >
        Skip to main content
      </a>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-ink font-semibold tracking-tight">Context-Aware Knowledge Base</p>
        <nav aria-label="Page sections">
          <ul className="text-ink-muted flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <li>
              <a className="hover:text-ink underline-offset-4 hover:underline" href="#features">
                Features
              </a>
            </li>
            <li>
              <a className="hover:text-ink underline-offset-4 hover:underline" href="#pipeline">
                How it works
              </a>
            </li>
            <li>
              <a className="hover:text-ink underline-offset-4 hover:underline" href="#status">
                Status
              </a>
            </li>
          </ul>
        </nav>
      </header>

      <main id="main-content" className="flex flex-col gap-16">
        <section aria-labelledby="intro-heading" className="flex flex-col gap-6">
          <h1
            id="intro-heading"
            className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
          >
            Your developer knowledge, linked without the busywork.
          </h1>
          <p className="text-ink-muted max-w-2xl text-lg text-pretty">
            A personal knowledge base for developers. Keep docs, snippets and notes together, let
            the system connect the ones that belong together, and see the whole thing as a graph.
          </p>
          <p className="text-ink-muted max-w-2xl text-sm">
            Everything is served by the Express API under{' '}
            <code className="bg-surface-raised border-line text-accent rounded border px-1.5 py-0.5 font-mono text-[0.85em]">
              {API_PREFIX}
            </code>
            . This page is the Phase 0 shell and does not call the API yet.
          </p>
        </section>

        <section aria-labelledby="features-heading" className="flex flex-col gap-6">
          <h2 id="features-heading" className="text-2xl font-semibold tracking-tight">
            What it does
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <li
                key={feature.name}
                className="bg-surface border-line flex flex-col gap-2 rounded-lg border p-5"
              >
                <h3 className="text-base font-semibold">{feature.name}</h3>
                <p className="text-ink-muted text-sm">{feature.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="pipeline-heading" className="flex flex-col gap-6">
          <h2 id="pipeline-heading" className="text-2xl font-semibold tracking-tight">
            How a note links itself
          </h2>
          <ol className="text-ink-muted flex flex-col gap-3 text-sm">
            {pipeline.map((step, position) => (
              <li key={step} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="bg-surface-raised border-line text-ink mt-px flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs"
                >
                  {position + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="status-heading" className="flex flex-col gap-4">
          <h2 id="status-heading" className="text-2xl font-semibold tracking-tight">
            Status
          </h2>
          <p className="text-ink-muted max-w-2xl text-sm">
            Phase 0 delivers the Next.js App Router shell: shared types from{' '}
            <code className="font-mono text-[0.9em]">@kb/shared</code>, Tailwind v4 theming and the
            page you are reading. Auth, the editor, search and the canvas graph arrive in later
            phases.
          </p>
          <p className="text-ink-subtle text-sm">
            Keyboard and screen-reader support are first-class goals across the app, including the
            markdown editor and the graph view.
          </p>
        </section>
      </main>

      <footer className="border-line text-ink-subtle mt-auto border-t pt-6 text-sm">
        <p>Built for solo developers. One account, your notes, no collaboration surface in v1.</p>
      </footer>
    </div>
  )
}
