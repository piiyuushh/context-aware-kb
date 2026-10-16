'use client'

import { useEffect, useRef } from 'react'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup } from 'codemirror'

/**
 * CodeMirror needs its theme as a JS object rather than classes. It only
 * references the `@theme` tokens from globals.css, so the palette stays in one
 * place. `Prec.highest` makes these win over `oneDark`'s own background.
 */
const tokenTheme = Prec.highest(
  EditorView.theme(
    {
      '&': {
        height: '100%',
        color: 'var(--color-ink)',
        backgroundColor: 'var(--color-surface)',
        fontSize: '0.875rem',
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        lineHeight: '1.6',
      },
      '.cm-content': {
        padding: '0.75rem 0',
        caretColor: 'var(--color-accent)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-ink-subtle)',
        border: 'none',
        borderRight: '1px solid var(--color-line)',
      },
      '.cm-activeLine': { backgroundColor: 'var(--color-surface-raised)' },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--color-surface-raised)',
        color: 'var(--color-ink-muted)',
      },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-accent)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'var(--color-line-strong)',
      },
      '.cm-selectionMatch': { backgroundColor: 'var(--color-line)' },
    },
    { dark: true },
  ),
)

type CodeMirrorEditorProps = {
  value: string
  onChange: (value: string) => void
  /** Bound to Mod-s for an immediate save. */
  onSave?: () => void
  ariaLabel: string
  placeholder?: string
}

/**
 * Thin CodeMirror 6 wrapper: one `EditorView` per mount, created from a ref so
 * no extra React binding library is needed. External value changes are applied
 * as a transaction instead of rebuilding the view, and the view is destroyed on
 * cleanup so StrictMode's double mount cannot leave a second editor behind.
 */
export function CodeMirrorEditor({
  value,
  onChange,
  onSave,
  ariaLabel,
  placeholder,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const ariaLabelRef = useRef(ariaLabel)
  const placeholderRef = useRef(placeholder)

  // Keep the handlers and the labels fresh without recreating the view.
  useEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
    onSaveRef.current = onSave
    ariaLabelRef.current = ariaLabel
    placeholderRef.current = placeholder
  })

  useEffect(() => {
    const parent = containerRef.current
    if (parent === null) return

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          basicSetup,
          // `codeLanguages` turns fenced code blocks into real languages, so
          // they highlight inside the editor as well as in the preview.
          markdown({ codeLanguages: languages }),
          EditorView.lineWrapping,
          oneDark,
          tokenTheme,
          placeholderExtension(placeholderRef.current ?? ''),
          EditorView.contentAttributes.of({
            'aria-label': ariaLabelRef.current,
            'aria-multiline': 'true',
          }),
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                onSaveRef.current?.()
                return true
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // Apply edits that came from outside (loading another note, a reset).
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return <div ref={containerRef} className="h-full" />
}
