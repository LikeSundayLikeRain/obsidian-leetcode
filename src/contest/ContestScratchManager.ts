// src/contest/ContestScratchManager.ts
// Manages ephemeral scratch .md files for contest code editing.
// Files live in the vault at a hidden path so Obsidian can open them in
// its native MarkdownView with full syntax highlighting.
// On contest end, all scratch files are deleted.

import type { App, TFile } from 'obsidian';
import type { ContestProblemState } from './types';
import { htmlToMarkdown } from '../notes/htmlToMarkdown';

const SCRATCH_FOLDER = '_leetcode-contest';

function langToFenceTag(slug: string): string {
  const map: Record<string, string> = {
    python3: 'python', python: 'python', java: 'java',
    cpp: 'cpp', c: 'c', javascript: 'javascript', typescript: 'typescript',
    golang: 'go', ruby: 'ruby', swift: 'swift', kotlin: 'kotlin',
    rust: 'rust', scala: 'scala', csharp: 'csharp',
  };
  return map[slug] ?? slug;
}

function buildScratchContent(problem: ContestProblemState, contentMd?: string): string {
  const fenceTag = langToFenceTag(problem.language);
  const lines: string[] = [];
  lines.push('---');
  lines.push(`lc-slug: ${problem.slug}`);
  lines.push(`lc-language: ${problem.language}`);
  lines.push('---');
  lines.push('');
  lines.push('## Problem');
  lines.push('');
  if (contentMd) {
    lines.push(contentMd);
  }
  lines.push('');
  lines.push('## Code');
  lines.push('');
  lines.push('```' + fenceTag);
  lines.push(problem.code || '');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

export function extractCodeFromScratch(content: string): string | null {
  const match = content.match(/^## Code\s*\n+```[^\n]*\n([\s\S]*?)^```/m);
  return match ? match[1]!.trimEnd() : null;
}

export class ContestScratchManager {
  private app: App;
  private problemsFolder: string;

  constructor(app: App, problemsFolder: string) {
    this.app = app;
    this.problemsFolder = problemsFolder;
  }

  private get folder(): string {
    return `${this.problemsFolder}/${SCRATCH_FOLDER}`;
  }

  private scratchPath(slug: string): string {
    return `${this.folder}/${slug}.md`;
  }

  async ensureFolder(): Promise<void> {
    const { vault } = this.app;
    if (!vault.getAbstractFileByPath(this.folder)) {
      await vault.createFolder(this.folder);
    }
  }

  async createOrUpdate(problem: ContestProblemState, contentHtml?: string): Promise<TFile> {
    await this.ensureFolder();
    const path = this.scratchPath(problem.slug);
    const contentMd = contentHtml ? htmlToMarkdown(contentHtml) : undefined;
    const content = buildScratchContent(problem, contentMd);
    const existing = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    if (existing) {
      await this.app.vault.process(existing, () => content);
      return existing;
    }
    try {
      return await this.app.vault.create(path, content);
    } catch {
      const file = this.app.vault.getAbstractFileByPath(path) as TFile;
      if (file) {
        await this.app.vault.process(file, () => content);
        return file;
      }
      throw new Error(`Failed to create scratch file: ${path}`);
    }
  }

  async readCode(slug: string): Promise<string | null> {
    const path = this.scratchPath(slug);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return null;
    const content = await this.app.vault.read(file as TFile);
    return extractCodeFromScratch(content);
  }

  async cleanupAll(): Promise<void> {
    const { vault } = this.app;
    const folder = vault.getAbstractFileByPath(this.folder);
    if (!folder) return;
    const files = vault.getFiles().filter(f => f.path.startsWith(this.folder + '/'));
    for (const f of files) {
      await vault.delete(f);
    }
    // Remove the folder itself
    const folderAbstract = vault.getAbstractFileByPath(this.folder);
    if (folderAbstract) {
      await vault.delete(folderAbstract, true);
    }
  }

  getFile(slug: string): TFile | null {
    const path = this.scratchPath(slug);
    const f = this.app.vault.getAbstractFileByPath(path);
    return f ? (f as TFile) : null;
  }
}
