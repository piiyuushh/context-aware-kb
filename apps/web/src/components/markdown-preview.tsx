'use client'

import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

import 'highlight.js/styles/github-dark-dimmed.css'

/**
 * `rehype-sanitize`'s default schema drops the class names that
 * `rehype-highlight` adds, so they are allowed back explicitly: `hljs` on the
 * `<code>` element and `hljs-*` on the token spans. Raw HTML stays disabled, so
 * nothing else widening the schema can reach the DOM as markup.
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ['className', 'hljs']],
    span: [...(defaultSchema.attributes?.span ?? []), ['className', /^hljs-/]],
  },
}

/**
 * Tailwind's child-selector variants style the rendered markdown. The `!`
 * (important) modifiers on the fenced-code rules are there to beat
 * highlight.js's own `pre code.hljs` declarations, which set their own padding
 * and an inner scroll container.
 */
const prose =
  'text-ink text-sm leading-relaxed ' +
  '[&_a]:text-link [&_a]:underline [&_a]:underline-offset-2 [&_a]:break-words ' +
  '[&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-4 [&_blockquote]:text-ink-muted ' +
  '[&_code]:rounded [&_code]:bg-surface-raised [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] ' +
  '[&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold ' +
  '[&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold ' +
  '[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold ' +
  '[&_hr]:my-6 [&_hr]:border-line ' +
  '[&_img]:max-w-full [&_img]:rounded-md ' +
  '[&_li]:mb-1 ' +
  '[&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 ' +
  '[&_p]:mb-4 ' +
  '[&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line [&_pre]:p-4 ' +
  '[&_pre_code]:bg-transparent! [&_pre_code]:p-0! [&_pre_code]:overflow-visible! [&_pre_code]:text-[0.8rem] ' +
  '[&_strong]:font-semibold ' +
  '[&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left ' +
  '[&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-1.5 ' +
  '[&_th]:border [&_th]:border-line [&_th]:px-3 [&_th]:py-1.5 [&_th]:font-semibold ' +
  '[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6'

/** Sanitized GitHub-flavoured markdown with syntax-highlighted code blocks. */
export function MarkdownPreview({ content }: { content: string }) {
  if (content.trim().length === 0) {
    return <p className="text-ink-subtle text-sm">Nothing to preview yet — start typing.</p>
  }

  return (
    <div className={prose}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, [rehypeSanitize, sanitizeSchema]]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
