// Local module declaration for turndown-plugin-gfm — the package ships no
// .d.ts and DefinitelyTyped has no @types/turndown-plugin-gfm.
// Only the named exports we actually use are declared.
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';

  export type Plugin = (service: TurndownService) => void;

  export const tables: Plugin;
  export const strikethrough: Plugin;
  export const taskListItems: Plugin;
  export const gfm: Plugin;
}
