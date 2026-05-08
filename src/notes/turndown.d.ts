// src/notes/turndown.d.ts
// Minimal local type shim for turndown 7.2.4 — the package ships no bundled
// d.ts and we prefer not to add @types/turndown as a new devDependency.
// Covers only the surface htmlToMarkdown.ts actually uses. If Phase 5 polish
// or a future phase needs more of the API, extend here or swap in @types/turndown.

declare module 'turndown' {
  export interface TurndownOptions {
    headingStyle?: 'setext' | 'atx';
    hr?: string;
    bulletListMarker?: '-' | '+' | '*';
    codeBlockStyle?: 'indented' | 'fenced';
    fence?: string;
    emDelimiter?: '_' | '*';
    strongDelimiter?: '__' | '**';
    linkStyle?: 'inlined' | 'referenced';
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut';
    br?: string;
    preformattedCode?: boolean;
    blankReplacement?: (content: string, node: Node) => string;
    keepReplacement?: (content: string, node: Node) => string;
    defaultReplacement?: (content: string, node: Node) => string;
  }

  export type Filter = string | string[] | ((node: Node, options: TurndownOptions) => boolean);

  export interface Rule {
    filter: Filter;
    replacement?: (content: string, node: Node, options: TurndownOptions) => string;
  }

  export default class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(html: string): string;
    addRule(key: string, rule: Rule): this;
    keep(filter: Filter): this;
    remove(filter: Filter): this;
    use(plugin: unknown): this;
    escape: (text: string) => string;
  }
}
