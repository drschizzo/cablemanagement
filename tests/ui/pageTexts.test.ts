// Every text of index.html (data-i18n) has its words in PAGE_TEXTS, and
// every one of PAGE_TEXTS is on the page.
import { describe, expect, it } from 'vitest';
import { PAGE_TEXTS } from '../../src/ui/pageTexts';

// (Node's own module, untyped here: the project has no Node types)
const node = (m: string) => import(m);

interface Fs {
  readFileSync(path: string, encoding: 'utf8'): string;
}

describe('the texts of the page', () => {
  it('names only texts it has, and every text it has is used', async () => {
    const { readFileSync }: Fs = await node('node:fs');
    const html = readFileSync('index.html', 'utf8');
    const keys = new Set([...html.matchAll(/data-i18n(?:-\w+)?="([\w.]+)"/g)].map((m) => m[1]));
    expect([...keys].filter((k) => !(k in PAGE_TEXTS))).toEqual([]);
    expect(Object.keys(PAGE_TEXTS).filter((k) => !keys.has(k))).toEqual([]);
  });
});
