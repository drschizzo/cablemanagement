// The page the game runs in (index.html): its elements, found by selector.

/**
 * The element matching a CSS selector. The page must have it: a missing one
 * fails here, with its name, rather than as "null" somewhere later
 * (tests/pageElements.test.ts checks every id the code asks for).
 */
export function $<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`index.html has no ${selector}`);
  return el;
}
