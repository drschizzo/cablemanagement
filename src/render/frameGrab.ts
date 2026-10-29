// The image just drawn, cropped to the cabinet (the panels' margins off),
// copied onto another canvas: an image of the timelapse. It must be taken
// right after the render, in the same task: the canvas is cleared once the
// page shows it.

import type { Stage } from './stage';

/** the image on screen now onto `out`, at most `maxHeight` px high, without the parts the panels cover */
export function grabFrame(stage: Stage, out: HTMLCanvasElement, maxHeight: number): void {
  const src = stage.renderer.domElement;
  const k = src.width / Math.max(1, src.clientWidth);
  const ins = stage.panelMargins;
  const sx = ins.left * k, sy = ins.top * k;
  const sw = Math.max(1, src.width - (ins.left + ins.right) * k), sh = Math.max(1, src.height - (ins.top + ins.bottom) * k);
  const scale = Math.min(1, maxHeight / sh);
  // (even sizes: the video encoders want them)
  const w = 2 * Math.round((sw * scale) / 2), h = 2 * Math.round((sh * scale) / 2);
  if (out.width !== w || out.height !== h) {
    out.width = w;
    out.height = h;
  }
  out.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
}
