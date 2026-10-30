// The work played again (see replay.ts): the cords of the keys drawn by
// a cord view of their own (one per set of cords), the rack items and the
// LEDs of the cabinet's view set as they were. It stands in for the cabinet's
// cords while it plays; disposed, the cabinet shows as it is again.

import type * as THREE from 'three/webgpu';
import { CableView, type CordsSource } from '../render/cableView';
import { disposeTree } from '../render/dispose';
import type { RackView } from '../render/rackView';
import { Rack } from '../game/rack';
import type { CableEnd, CableIndex, EndIndex, NodeIndex, ReadonlyCable } from '../game/cables';
import type { World } from '../game/world';
import { keyAt, keyTimes, nodesBetween, type CordLayout, type ReplayKey } from './replay';

/** one set of cords, as a cord view reads them: their nodes and ends are set for each image */
class ReplayCords implements CordsSource {
  readonly x: Float64Array;
  readonly cables: (ReadonlyCable & { ends: [CableEnd, CableEnd] })[];
  straps: { nodes: readonly NodeIndex[] }[] = [];
  readonly sim: CordsSource['sim'];

  constructor(layout: CordLayout, readonly seg: number, readonly radius: number) {
    this.x = new Float64Array(3 * layout.cableOf.length);
    this.cables = layout.cables.map((cb) => ({ ...cb, ends: [{ port: null, label: null }, { port: null, label: null }] }));
    this.sim = {
      x: this.x,
      // never asleep: they move every image
      cables: layout.cables.map((cb) => ({ start: cb.start, count: cb.count, asleep: false })),
      pinches: [],
      cableOf: layout.cableOf,
      segOK: layout.segOK,
      radius: layout.radius,
    };
  }

  endNodes(c: CableIndex, e: EndIndex): [NodeIndex, NodeIndex] {
    const cb = this.cables[c];
    return e === 0 ? [cb.start, cb.start + 1] : [cb.start + cb.count - 1, cb.start + cb.count - 2];
  }

  /** the plugs, labels and velcros of a key */
  setKey(k: ReplayKey): void {
    k.ends.forEach((ends, c) => ends.forEach((e, i) => { this.cables[c].ends[i].port = e.port; this.cables[c].ends[i].label = e.label; }));
    this.straps = k.straps.map((nodes) => ({ nodes }));
  }
}

export class ReplayView {
  private times: number[];
  private views = new Map<CordLayout, { cords: ReplayCords; view: CableView }>();
  private shown: CableView | null = null;
  /** the rack the items of the keys are set on (the cabinet's own stays as it is) */
  private rack: Rack;
  private itemsShown = -1;

  constructor(private keys: readonly ReplayKey[], private scene: THREE.Scene, private rackView: RackView, private world: World, private velcro: string) {
    this.times = keyTimes(keys);
    this.rack = new Rack(world.level.units, { open: world.level.open });
  }

  /** the work at `u`: 0, the cabinet as it was found; 1, signed off */
  show(u: number): void {
    if (!this.keys.length) return;
    const { i, f } = keyAt(this.times, u);
    const a = this.keys[i], b = this.keys[Math.min(this.keys.length - 1, i + 1)];
    // what changes at once (a plug, a label, an item, an LED) changes halfway
    const k = f < 0.5 ? a : b;
    const v = this.viewOf(k.layout);
    if (a.layout === b.layout) nodesBetween(this.keys, i, f, v.cords.x);
    else v.cords.x.set(k.x);
    v.cords.setKey(k);
    if (this.shown !== v.view) {
      if (this.shown) this.shown.group.visible = false;
      v.view.group.visible = true;
      this.shown = v.view;
    }
    v.view.update(true);
    if (k.items.version !== this.itemsShown) {
      this.itemsShown = k.items.version;
      this.rack.clearItems();
      for (const s of k.items.slots) this.rack.addItem(s.kind, s.unit, s.side, s.locked);
      this.rackView.syncItems(`replay ${k.items.version}`, this.rack);
    }
    this.rackView.showLedStates(k.leds);
  }

  private viewOf(layout: CordLayout): { cords: ReplayCords; view: CableView } {
    let v = this.views.get(layout);
    if (!v) {
      const cords = new ReplayCords(layout, this.world.seg, this.world.radius);
      const view = new CableView(cords, this.velcro);
      view.lightBy(this.rackView.glow);
      view.group.visible = false;
      this.scene.add(view.group);
      v = { cords, view };
      this.views.set(layout, v);
    }
    return v;
  }

  /** off the scene, freed on the GPU */
  dispose(): void {
    for (const { view } of this.views.values()) {
      this.scene.remove(view.group);
      disposeTree(view.group);
    }
    this.views.clear();
  }
}
