// The cabinet before and after, side by side in one image to share: the two
// views of the result screen, the level, the stars.

import { tr } from './language';
import { GAME_URL, downloadBlob } from './share';

/** px: the height of each view, the margins, the band of text above and below */
const VIEW_H = 420;
const PAD = 24;
const HEAD = 84;
const FOOT = 40;
const INK = '#e6ebe7', DIM = '#7d847f', ACCENT = '#8be3b4', BACKGROUND = '#0d0f0e';

/** what the image says beside the two views */
export interface BeforeAfterCaption {
  title: string;
  stars: number;
}

function loaded(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/** the two views (image URLs) side by side, captioned, saved as a PNG under `filename` */
export async function saveBeforeAfter(before: string, after: string, caption: BeforeAfterCaption, filename: string): Promise<void> {
  const [a, b] = await Promise.all([loaded(before), loaded(after)]);
  const w = Math.round((a.width / a.height) * VIEW_H);
  const canvas = document.createElement('canvas');
  canvas.width = 2 * w + 3 * PAD;
  canvas.height = HEAD + VIEW_H + FOOT + PAD;
  const g = canvas.getContext('2d')!;
  g.fillStyle = BACKGROUND;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(a, PAD, HEAD, w, VIEW_H);
  g.drawImage(b, 2 * PAD + w, HEAD, w, VIEW_H);
  g.textBaseline = 'middle';
  g.fillStyle = INK;
  g.font = '600 26px "IBM Plex Sans", system-ui, sans-serif';
  g.fillText(caption.title, PAD, HEAD / 2 - 8);
  g.fillStyle = ACCENT;
  g.textAlign = 'right';
  g.fillText('★'.repeat(caption.stars) + '☆'.repeat(3 - caption.stars), canvas.width - PAD, HEAD / 2);
  g.font = '15px "IBM Plex Mono", monospace';
  g.fillStyle = DIM;
  g.textAlign = 'left';
  const label = (text: string, x: number) => g.fillText(text, x, HEAD + VIEW_H + FOOT / 2);
  label(tr({ fr: 'Avant', en: 'Before' }), PAD);
  label(tr({ fr: 'Après', en: 'After' }), 2 * PAD + w);
  g.fillText(GAME_URL.replace('https://', ''), PAD, HEAD / 2 + 20);
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (png) downloadBlob(png, filename);
}
