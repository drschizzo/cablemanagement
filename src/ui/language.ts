// The language the game speaks to the player. Every text of the interface is
// written in each language where it is used, as Words ({ fr, en }): a text
// missing a language does not compile. tr() picks the one being spoken.

export type Language = 'fr' | 'en';

/** the languages offered, in the order of the settings, with their own name */
export const LANGUAGES: { id: Language; name: string }[] = [
  { id: 'fr', name: 'Français' },
  { id: 'en', name: 'English' },
];

/** a text in every language the game speaks */
export type Words<T = string> = Record<Language, T>;

let current: Language = 'fr';
const listeners: (() => void)[] = [];

export function language(): Language {
  return current;
}

/** the words in the language being spoken */
export function tr<T>(words: Words<T>): T {
  return words[current];
}

/** speaks another language; what shows text once (a panel, a button) is told, to write it again */
export function setLanguage(lang: Language): void {
  if (lang === current) return;
  current = lang;
  for (const l of listeners) l();
}

/** `rewrite` runs whenever the language changes, until the function returned is called */
export function onLanguageChange(rewrite: () => void): () => void {
  listeners.push(rewrite);
  return () => {
    const i = listeners.indexOf(rewrite);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/** the language a browser prefers, among those the game speaks (English when it speaks none of them) */
export function preferredLanguage(browserLanguages: readonly string[]): Language {
  for (const tag of browserLanguages) {
    const lang = tag.slice(0, 2).toLowerCase();
    if (LANGUAGES.some((l) => l.id === lang)) return lang as Language;
  }
  return 'en';
}
