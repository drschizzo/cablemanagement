// A cabinet as the player leaves it, to find it again on the next visit (the
// career): its equipment, its supports, its schedule, and every cord still
// plugged somewhere, where it lies, with its labels and its straps. The cords
// lying loose in the crate are thrown away between two visits.

import type { World } from './world';
import type { UnitSpec } from './rack';
import type { ItemKind } from './supplies';
import type { Circuit } from './schedule';
import type { CableStart, StrapStart } from './cables';

export interface CabinetState {
  units: UnitSpec[];
  items: { kind: ItemKind; unit: number; side: number }[];
  circuits: Circuit[];
  cords: CableStart[];
  straps: StrapStart[];
}

/** mm: the positions of the cords are kept to this (they settle again at once) */
const KEPT_MM = 0.1;

/** the cabinet as it stands now */
export function cabinetOf(w: World): CabinetState {
  // a cord kept: plugged at one end at least; the others are in the crate, or on the floor
  const kept = w.cables.map((cb, c) => ({ cb, c })).filter(({ cb }) => cb.ends.some((e) => e.port));
  const newIndex = new Map(kept.map(({ c }, k) => [c, k]));
  const round = (v: number) => Math.round(v / (KEPT_MM / 1000)) * (KEPT_MM / 1000);
  const cords: CableStart[] = kept.map(({ cb }) => ({
    type: cb.type,
    ends: [cb.ends[0].port, cb.ends[1].port],
    labels: [cb.ends[0].label, cb.ends[1].label],
    color: cb.color,
    points: Array.from(w.sim.x.subarray(3 * cb.start, 3 * (cb.start + cb.count)), round),
  }));
  const straps: StrapStart[] = [];
  for (const st of w.straps) {
    const cables = st.nodes.map((i) => w.sim.cableOf[i]);
    if (!cables.every((c) => newIndex.has(c))) continue;
    straps.push({
      cords: cables.map((c) => newIndex.get(c)!),
      at: st.nodes.map((i, k) => (i - w.cables[cables[k]].start) / (w.cables[cables[k]].count - 1)),
    });
  }
  return {
    units: w.rack.units.map((u) => ({ ...u })),
    items: w.rack.items.map((it) => w.rack.slotOf(it)),
    circuits: w.circuits.map((c) => ({ ...c })),
    cords,
    straps,
  };
}
