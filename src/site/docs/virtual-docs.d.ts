// The module src/site/docs/build/plugin.ts generates from docs/site.json and the Markdown it lists.
declare module 'virtual:pier-docs' {
  export const sections: import('./types').DocsSection[]
  export const bodies: Record<string, import('./types').DocsBody>
}
