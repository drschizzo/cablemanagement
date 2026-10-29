// A small copy of the image just drawn, cropped to the cabinet (the panels'
// margins off): a frame of the timelapse. It must be taken right after the
// render, in the same task: the canvas is cleared once the page shows it.

import type { Stage } from './stage';

/** the image on screen now, `height` px high, without the parts the panels cover */
export function grabFrame(stage: Stage, height: number): HTMLCanvasElement {
  const src = stage.renderer.domElement;
  const k = src.width / Math.max(1, src.clientWidth);
  const ins = stage.panelMargins;
  const sx = ins.left * k, sy = ins.top * k;
  const sw = Math.max(1, src.width - (ins.left + ins.right) * k), sh = Math.max(1, src.height - (ins.top + ins.bottom) * k);
  const out = document.createElement('canvas');
  const scale = height / sh;
  out.width = Math.round(sw * scale);
  out.height = Math.round(height);
  out.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}
