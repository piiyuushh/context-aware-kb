import js from '@eslint/js'
import next from '@next/eslint-plugin-next'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/out/**',
      '**/coverage/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'smart'],
      'no-console': 'off',
    },
  },
  {
    // Official Next.js rules. Applied repo-wide on purpose: `next build`
    // detects the plugin by resolving the config for its own files, so a
    // `files: ['apps/web/**']` filter would hide it. The rules are inert for
    // non-React files.
    ...next.flatConfig.coreWebVitals,
    settings: {
      next: { rootDir: 'apps/web' },
    },
    rules: {
      ...next.flatConfig.coreWebVitals.rules,
      // Pages Router only. apps/web uses the App Router, so the rule can only
      // print a "pages directory not found" notice here.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
)
