import { defineConfig } from 'vite-plus'

export default defineConfig({
  lint: {
    ignorePatterns: ['.agents/skills/**'],
    plugins: ['typescript'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ['apps/web/**'],
        plugins: ['react'],
        env: { browser: true },
      },
      {
        files: ['apps/api/**', 'packages/**', 'tools/**'],
        env: { node: true },
      },
    ],
  },
  fmt: {
    singleQuote: true,
    semi: false,
    printWidth: 100,
    trailingComma: 'all',
    ignorePatterns: ['apps/web/src/routeTree.gen.ts', '.agents/skills/**'],
  },
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
  },
})
