// The free port a carried connector (or the end of a drawn way) would plug
// into: its marker lit yellow.

import type * as THREE from 'three';
import type { RackView } from '../../render/rackView';
import type { Port } from '../../game/rack';

const HINT_COLOR = '#ffe066';
const MARKER_COLOR = '#7ee0ff';

export class PortHint {
  current: Port | null = null;

  /** `onCleared`: the hint went out (the markers of the focused line come back) */
  constructor(private rackView: RackView, private onCleared: () => void) {}

  set(port: Port | null): void {
    if (this.current === port) return;
    if (this.current) {
      const m = this.rackView.marker(this.current.id);
      m.visible = false;
      (m.material as THREE.MeshBasicMaterial).color.set(MARKER_COLOR);
    }
    this.current = port;
    if (port) {
      const m = this.rackView.marker(port.id);
      m.visible = true;
      (m.material as THREE.MeshBasicMaterial).color.set(HINT_COLOR);
    }
    if (!port) this.onCleared();
  }
}
