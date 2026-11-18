// Type for Vite's import.meta.glob, which Vitest supports. Used by the
// boundary test to read source files as text without adding @types/node.
interface ImportMeta {
  glob<T = unknown>(
    pattern: string | string[],
    options: { query: "?raw"; import: "default"; eager: true }
  ): Record<string, T>
}
