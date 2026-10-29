// What leaves the page to be shared: the game's address, the link of a
// cabinet of the editor, and the files the page makes (a video, an image)
// offered to the player to save.

import { encodeSpec, type CustomSpec } from '../game/levels/customLevel';

/** where the game is played */
export const GAME_URL = 'https://drschizzo.github.io/cablemanagement/';

/** the link that opens a cabinet of the editor (?rack=CODE) */
export function customLink(spec: CustomSpec): string {
  return `${GAME_URL}?rack=${encodeSpec(spec)}`;
}

/** offers a file the page made to the player: the browser saves it under `filename` */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // the browser has taken it once the click is handled
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
