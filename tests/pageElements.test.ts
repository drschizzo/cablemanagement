// The code finds the elements of the page by their id; index.html must have
// every one. A renamed id would otherwise only break when its button is
// clicked: here, it breaks the tests.
import { describe, expect, it } from 'vitest';
import { PAGE_TEXTS } from '../src/ui/pageTexts';

// (Node's own module, untyped here: the project has no Node types)
const node = (m: string) => import(m);

interface Fs {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string, options: { recursive: true }): string[];
}

/** ids asked for: $('#x…'), querySelector('#x…'), getElementById('x'), and the app's byId / visible helpers */
const ASKED = /(?:\$|querySelector(?:All)?(?:<\w+>)?)\(\s*'#([\w-]+)|(?:getElementById|byId|visible)\(\s*'([\w-]+)'/g;
/** ids the code gives to elements it creates */
const CREATED = /\.id = '([\w-]+)'/g;

describe('the page', () => {
  it('has every element the code asks for by id', async () => {
    const { readFileSync, readdirSync }: Fs = await node('node:fs');
    const html = readFileSync('index.html', 'utf8');
    const onPage = new Set([...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
    const missing: string[] = [];
    for (const file of readdirSync('src', { recursive: true }).filter((f) => f.endsWith('.ts'))) {
      const code = readFileSync(`src/${file}`, 'utf8');
      const created = new Set([...code.matchAll(CREATED)].map((m) => m[1]));
      for (const m of code.matchAll(ASKED)) {
        const id = m[1] ?? m[2];
        if (!onPage.has(id) && !created.has(id)) missing.push(`${file}: #${id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('names only texts it has, and every text it has is used', async () => {
    const { readFileSync }: Fs = await node('node:fs');
    const html = readFileSync('index.html', 'utf8');
    const keys = new Set([...html.matchAll(/data-i18n(?:-\w+)?="([\w.]+)"/g)].map((m) => m[1]));
    expect([...keys].filter((k) => !(k in PAGE_TEXTS))).toEqual([]);
    expect(Object.keys(PAGE_TEXTS).filter((k) => !keys.has(k))).toEqual([]);
  });
});
