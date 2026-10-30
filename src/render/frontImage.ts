// An image of the cabinet from the front, framed in the space the panels
// leave free (the before/after of the result screen).

import type * as THREE from 'three/webgpu';
import type { Stage } from './stage';

/** `hidden`: overlays left out of the image (their visibility is restored after) */
export function captureFront(stage: Stage, hidden: THREE.Object3D[]): string {
  const cam = stage.camera, ctl = stage.controls;
  const pos = cam.position.clone(), target = ctl.target.clone();
  const wasVisible = hidden.map((o) => o.visible);
  for (const o of hidden) o.visible = false;
  stage.resetView();
  stage.render();
  const src = stage.renderer.domElement;
  const k = src.width / Math.max(1, src.clientWidth);
  const ins = stage.panelMargins;
  const sx = ins.left * k, sy = ins.top * k;
  const sw = Math.max(1, src.width - (ins.left + ins.right) * k), sh = Math.max(1, src.height - (ins.top + ins.bottom) * k);
  const out = document.createElement('canvas');
  const scale = Math.min(1, 420 / sh);
  out.width = Math.round(sw * scale);
  out.height = Math.round(sh * scale);
  out.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  cam.position.copy(pos);
  ctl.target.copy(target);
  ctl.update();
  hidden.forEach((o, i) => { o.visible = wasVisible[i]; });
  stage.render();
  return out.toDataURL('image/jpeg', 0.85);
}
