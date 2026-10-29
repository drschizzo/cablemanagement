// The cabinet: a 19" rack seen from the front, with its equipment (fibre
// patch panels, switches), its cable managers and the static collision
// geometry the cables rest on.
//
// Frame: metres, x to the right, y up, z towards the player. The front faces
// of the equipment are at z = 0; everything lives at z > 0 in front of them,
// and in the two side channels (x beyond ±0.25) which go 6 cm deeper.

import type { StaticBox, StaticCapsule } from '@drschizzo/avbd-cables';
import type { RackShape } from './physics/rackCableSim';

export const U = 0.04445;
export const COLUMN_X = 0.25; // half width of the equipment column (with its ears)
export const SIDE_IN = 0.258; // inner edge of the side channels
export const SIDE_OUT = 0.378; // outer edge (duct wall)
export const WALL_X = 0.392; // cabinet side walls
export const SIDE_BACK = -0.06; // back of the side channels
export const RING_DEPTH = 0.072; // how far the rings stand out of the managers
export const CONNECTOR = 0.034; // LC connector + start of the boot, out of the port face
export const SEG = 0.025; // cable segment length
export const FRONT_Z = 0.25; // front edge of the cabinet
export const ROOM_FLOOR = (r: { floorY: number }) => r.floorY - 0.03;
export const CABLE_R = 0.0022; // 3 mm jacket, a bit thicker for legibility

export type UnitKind = 'panel' | 'switch' | 'hmgr' | 'blank' | 'server';

export interface UnitSpec {
  kind: UnitKind;
  /** port count (panel, switch) */
  ports?: number;
  /** port name prefix: 'A' gives A1, A2… */
  name?: string;
  label?: string;
  /** look of the front: copper patch panel, firewall, router, server, UPS… */
  style?: 'fibre' | 'copper' | 'switch' | 'firewall' | 'router' | 'server' | 'ups';
  /** explicit port positions (x, m), e.g. the two NICs of a server */
  portsAt?: number[];
}

export interface Port {
  id: string;
  unit: number;
  index: number;
  x: number;
  y: number;
  /** cable end plugged in: cable * 2 + end, or −1 */
  plug: number;
}

export type ItemKind = 'hmgr' | 'duct' | 'vring';

export interface Item {
  id: number;
  kind: ItemKind;
  /** top unit it occupies */
  unit: number;
  /** −1 left, +1 right (duct, vring) */
  side: number;
  /** units covered (duct) */
  span: number;
  locked: boolean;
}

/** a volume where a cable counts as held by the management (scoring) */
export interface SupportBox {
  min: [number, number, number];
  max: [number, number, number];
  item: number;
}

/** a point inside a box (bounds included) */
export function insideBox(b: { min: [number, number, number]; max: [number, number, number] }, x: number, y: number, z: number): boolean {
  return x >= b.min[0] && x <= b.max[0] && y >= b.min[1] && y <= b.max[1] && z >= b.min[2] && z <= b.max[2];
}

export const DUCT_SPAN = 4;
/** finger radius of the guides */
export const FINGER_R = 0.003;
/** height of the upturned tips of a manager's bottom fingers */
export const HMGR_TIP = 0.016;
/** front bar of a ring, and the gap left open at its outer end (and above its outer post) */
export const RING_FRONT = 0.065;
export const RING_GAP = 0.024;
/** front of a duct, the pitch of its fingers, the middle of its front slit (|x|) and half its width */
export const DUCT_FRONT = 0.07;
export const DUCT_PITCH = 0.022;
export const DUCT_SLIT_X = (SIDE_IN + SIDE_OUT) / 2;
export const DUCT_SLIT = 0.011;

type Box3 = { min: [number, number, number]; max: [number, number, number] };

/** a cable guide: the room a cord lies in inside it, and where the pointer counts as over it */
export interface Guide {
  item: number;
  kind: ItemKind;
  room: Box3;
  reach: Box3;
}

export class Rack {
  units: UnitSpec[];
  ports: Port[] = [];
  items: Item[] = [];
  topY: number;
  floorY: number;
  private nextItem = 1;

  /** an open two-post rack: no walls, no cabinet floor, the room floor just below */
  open: boolean;

  constructor(units: UnitSpec[], opts: { open?: boolean } = {}) {
    this.units = units;
    this.open = !!opts.open;
    this.topY = units.length * U;
    this.floorY = this.open ? -0.06 : -0.16;
    units.forEach((u, k) => {
      if ((u.kind === 'panel' || u.kind === 'switch' || u.kind === 'server') && (u.ports || u.portsAt)) {
        const n = u.portsAt?.length ?? u.ports!;
        const span = n <= 12 ? 0.3 : 0.38;
        for (let i = 0; i < n; i++) {
          const x = u.portsAt ? u.portsAt[i] : n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
          this.ports.push({ id: `${u.name}${i + 1}`, unit: k, index: i, x, y: this.unitY(k), plug: -1 });
        }
      }
    });
  }

  /** centre height of unit k (0 = top) */
  unitY(k: number): number {
    return this.topY - (k + 0.5) * U;
  }

  unitBottom(k: number): number {
    return this.topY - (k + 1) * U;
  }

  port(id: string): Port {
    const p = this.ports.find((q) => q.id === id);
    if (!p) throw new Error(`no port ${id}`);
    return p;
  }

  portPitch(p: Port): number {
    if (this.units[p.unit].portsAt) return 0.025;
    const n = this.units[p.unit].ports ?? 1;
    return (n <= 12 ? 0.3 : 0.38) / Math.max(1, n - 1);
  }

  // ------------------------------------------------------------- items

  addItem(kind: ItemKind, unit: number, side: number, locked = false): Item | null {
    if (!this.canPlace(kind, unit, side)) return null;
    const it: Item = { id: this.nextItem++, kind, unit, side, span: kind === 'duct' ? DUCT_SPAN : 1, locked };
    if (kind === 'duct') it.unit = this.ductStart(unit);
    this.items.push(it);
    return it;
  }

  removeItem(id: number): boolean {
    const i = this.items.findIndex((it) => it.id === id && !it.locked);
    if (i < 0) return false;
    this.items.splice(i, 1);
    return true;
  }

  ductStart(unit: number): number {
    return Math.max(0, Math.min(this.units.length - DUCT_SPAN, unit - 1));
  }

  canPlace(kind: ItemKind, unit: number, side: number): boolean {
    if (unit < 0 || unit >= this.units.length) return false;
    if (kind === 'hmgr') {
      return this.units[unit].kind === 'blank' && !this.items.some((it) => it.kind === 'hmgr' && it.unit === unit);
    }
    const sideItems = this.items.filter((it) => it.kind !== 'hmgr' && it.side === side);
    if (kind === 'duct') {
      const u0 = this.ductStart(unit);
      return !sideItems.some((it) => it.unit < u0 + DUCT_SPAN && u0 < it.unit + it.span);
    }
    return !sideItems.some((it) => unit >= it.unit && unit < it.unit + it.span);
  }

  /** the item covering a slot (for removal) */
  itemAt(kind: ItemKind, unit: number, side: number): Item | undefined {
    if (kind === 'hmgr') return this.items.find((it) => it.kind === 'hmgr' && it.unit === unit);
    return this.items.find((it) => it.kind !== 'hmgr' && it.side === side && unit >= it.unit && unit < it.unit + it.span);
  }

  // ---------------------------------------------------- collision shapes

  statics(): RackShape[] {
    const S: RackShape[] = [];
    const top = this.topY, bottom = 0;
    // equipment column (every unit, the blank ones have a blanking plate)
    S.push({ kind: 'box', min: [-COLUMN_X, bottom - 0.02, -0.5], max: [COLUMN_X, top + 0.02, 0] });
    // backs of the side channels and the cabinet walls
    for (const sx of [-1, 1]) {
      S.push(box(sx, COLUMN_X, WALL_X, this.floorY, top + 0.12, -0.5, SIDE_BACK));
      if (!this.open) S.push(box(sx, WALL_X, WALL_X + 0.03, this.floorY - 0.05, top + 0.15, -0.5, FRONT_Z));
    }
    if (this.open) {
      // the room floor all around, nothing else: cords spill out freely
      S.push({ kind: 'box', min: [-1.2, this.floorY - 0.05, -0.5], max: [1.2, this.floorY, 1.2] });
      S.push({ kind: 'box', min: [-COLUMN_X, this.floorY, -0.5], max: [COLUMN_X, bottom - 0.02, 0] });
      for (const it of this.items) this.itemStatics(it, S);
      return S;
    }
    // floor of the cabinet and roof
    S.push({ kind: 'box', min: [-0.45, this.floorY - 0.05, -0.5], max: [0.45, this.floorY, FRONT_Z] });
    // a low lip at the front of the cabinet floor keeps fallen cords inside
    // (the hand lifts a cord over it)
    S.push({ kind: 'capsule', ax: -WALL_X, ay: this.floorY + 0.012, az: FRONT_Z - 0.008, bx: WALL_X, by: this.floorY + 0.012, bz: FRONT_Z - 0.008, r: 0.007 });
    // the room floor in front of the cabinet: whatever falls out lies there, in view
    S.push({ kind: 'box', min: [-0.8, ROOM_FLOOR(this) - 0.05, FRONT_Z], max: [0.8, ROOM_FLOOR(this), 0.85] });
    // the crate where unplugged cords are thrown (and the spares wait)
    const c = this.crate();
    const t = 0.008;
    S.push({ kind: 'box', min: [c.min[0], c.min[1], c.min[2]], max: [c.min[0] + t, c.max[1], c.max[2]] });
    S.push({ kind: 'box', min: [c.max[0] - t, c.min[1], c.min[2]], max: [c.max[0], c.max[1], c.max[2]] });
    S.push({ kind: 'box', min: [c.min[0], c.min[1], c.min[2]], max: [c.max[0], c.max[1], c.min[2] + t] });
    S.push({ kind: 'box', min: [c.min[0], c.min[1], c.max[2] - t], max: [c.max[0], c.max[1], c.max[2]] });
    S.push({ kind: 'box', min: [-0.45, top + 0.12, -0.5], max: [0.45, top + 0.16, 0.3] });
    // the part of the column below the first unit (cabinet plinth)
    S.push({ kind: 'box', min: [-COLUMN_X, this.floorY, -0.5], max: [COLUMN_X, bottom - 0.02, 0] });
    for (const it of this.items) this.itemStatics(it, S);
    return S;
  }

  // Nothing lets a cord through: each guide has an opening a cord plugged at
  // both ends can be slid in by (see `guide`).
  private itemStatics(it: Item, S: RackShape[]): void {
    const r = FINGER_R;
    if (it.kind === 'hmgr') {
      // finger manager: rows of fingers above and below the channel. Cords
      // from the equipment pass between them; a cord laid in the channel
      // rests on the bottom fingers, kept in by their upturned tips (a cord
      // goes in over them, under the top row)
      const y0 = this.unitBottom(it.unit) + 0.004, y1 = this.unitBottom(it.unit) + U - 0.004;
      const xs = hmgrFingers();
      for (const x of xs) {
        S.push(cap(x, y0, 0.004, x, y0, RING_DEPTH, r, it.id));
        S.push(cap(x, y0, RING_DEPTH, x, y0 + HMGR_TIP, RING_DEPTH, r, it.id));
        S.push(cap(x, y1, 0.004, x, y1, RING_DEPTH, r, it.id));
      }
      // the trough between the finger rows keeps a cord let go in it: it no
      // longer slips out through the slots or over the tips, dragged by its
      // hanging tail
      S.push({ kind: 'keeper', min: [xs[0] - r, y0 + r, 0.002], max: [xs[xs.length - 1] + r, y1 - r, RING_DEPTH - r], owner: it.id });
    } else if (it.kind === 'vring') {
      // a hook: open at its front outer corner, where a cord slips in
      const y = this.unitY(it.unit);
      const s = it.side;
      const xi = s * (SIDE_IN + 0.004), xo = s * (SIDE_OUT - 0.004);
      S.push(cap(xi, y, SIDE_BACK, xi, y, RING_FRONT, r, it.id));
      S.push(cap(xi, y, RING_FRONT, xo - s * RING_GAP, y, RING_FRONT, r, it.id));
      S.push(cap(xo, y, SIDE_BACK, xo, y, RING_FRONT - RING_GAP, r, it.id));
    } else {
      const yTop = this.topY - it.unit * U - 0.004;
      const yBot = this.topY - (it.unit + it.span) * U + 0.004;
      const s = it.side;
      const xm = s * DUCT_SLIT_X;
      // slotted inner wall (cords from the managers pass between its
      // fingers), and two lips in front, either side of a slit a cord slips in by
      const n = Math.max(2, Math.round((yTop - yBot) / DUCT_PITCH));
      for (let k = 0; k <= n; k++) {
        const y = yBot + ((yTop - yBot) * k) / n;
        S.push(cap(s * SIDE_IN, y, SIDE_BACK, s * SIDE_IN, y, DUCT_FRONT, r, it.id));
        S.push(cap(s * SIDE_IN, y, DUCT_FRONT, xm - s * DUCT_SLIT, y, DUCT_FRONT, r, it.id));
        S.push(cap(xm + s * DUCT_SLIT, y, DUCT_FRONT, s * SIDE_OUT, y, DUCT_FRONT, r, it.id));
      }
      S.push(box(s, SIDE_OUT, SIDE_OUT + 0.006, yBot, yTop, SIDE_BACK, DUCT_FRONT, it.id));
    }
  }

  /** every guide of the cabinet */
  guides(): Guide[] {
    return this.items.map((it) => this.guide(it));
  }

  guide(it: Item): Guide {
    const r = FINGER_R;
    const side = (s: number, a: number, b: number): [number, number] => (s > 0 ? [a, b] : [-b, -a]);
    if (it.kind === 'hmgr') {
      const y0 = this.unitBottom(it.unit) + 0.004, y1 = this.unitBottom(it.unit) + U - 0.004;
      const xs = hmgrFingers();
      return {
        item: it.id, kind: it.kind,
        room: { min: [xs[0] - r, y0 + r, 0.004], max: [xs[xs.length - 1] + r, y1 - r, RING_DEPTH - r] },
        reach: { min: [-COLUMN_X, y0 - 0.006, 0], max: [COLUMN_X, y1 + 0.006, RING_DEPTH + 0.012] },
      };
    }
    const s = it.side;
    const [rx0, rx1] = side(s, SIDE_IN - 0.006, SIDE_OUT + 0.006);
    if (it.kind === 'vring') {
      const y = this.unitY(it.unit);
      const [x0, x1] = side(s, SIDE_IN + 0.004 + r, SIDE_OUT - 0.004 - r);
      return {
        item: it.id, kind: it.kind,
        room: { min: [x0, y - 0.004, SIDE_BACK], max: [x1, y + 0.004, RING_FRONT - r] },
        reach: { min: [rx0, y - 0.035, SIDE_BACK], max: [rx1, y + 0.035, 0.08] },
      };
    }
    const yTop = this.topY - it.unit * U - 0.004;
    const yBot = this.topY - (it.unit + it.span) * U + 0.004;
    const [x0, x1] = side(s, SIDE_IN + r, SIDE_OUT);
    return {
      item: it.id, kind: it.kind,
      room: { min: [x0, yBot, SIDE_BACK], max: [x1, yTop, DUCT_FRONT - r] },
      reach: { min: [rx0, yBot, SIDE_BACK], max: [rx1, yTop, 0.08] },
    };
  }

  /** the crate on the floor, right of the cabinet front (closed cabinets only) */
  crate(): { min: [number, number, number]; max: [number, number, number] } {
    const y = ROOM_FLOOR(this);
    return { min: [0.46, y, 0.3], max: [0.76, y + 0.12, 0.6] };
  }

  /** where a cable counts as held by the management */
  supports(): SupportBox[] {
    const out: SupportBox[] = [];
    for (const it of this.items) {
      if (it.kind === 'hmgr') {
        const y0 = this.unitBottom(it.unit);
        out.push({ min: [-0.25, y0 - 0.01, -0.01], max: [0.25, y0 + U + 0.004, RING_DEPTH + 0.004], item: it.id });
      } else if (it.kind === 'vring') {
        const y = this.unitY(it.unit);
        const [a, b] = it.side > 0 ? [SIDE_IN - 0.01, SIDE_OUT + 0.004] : [-SIDE_OUT - 0.004, -SIDE_IN + 0.01];
        out.push({ min: [a, y - 0.05, SIDE_BACK - 0.01], max: [b, y + 0.05, 0.072], item: it.id });
      } else {
        const yTop = this.topY - it.unit * U, yBot = this.topY - (it.unit + it.span) * U;
        const [a, b] = it.side > 0 ? [SIDE_IN - 0.01, SIDE_OUT + 0.004] : [-SIDE_OUT - 0.004, -SIDE_IN + 0.01];
        out.push({ min: [a, yBot - 0.02, SIDE_BACK - 0.01], max: [b, yTop + 0.02, 0.078], item: it.id });
      }
    }
    return out;
  }

  /** length of a tidy route between two ports, for sizing the cords */
  idealRoute(a: Port, b: Port): number {
    const dy = Math.abs(a.y - b.y);
    if (a.unit === b.unit) return Math.abs(a.x - b.x) + 0.2;
    // down to a manager, to the side channel, along it, back in
    const side = (a.x + b.x) / 2 < 0 ? -0.3 : 0.3;
    return 0.05 + Math.abs(side - a.x) + dy + Math.abs(side - b.x) + 0.05 + 2 * CONNECTOR;
  }
}

export function hmgrFingers(): number[] {
  const out: number[] = [];
  for (let x = -0.22; x <= 0.2201; x += 0.022) out.push(x);
  return out;
}

function cap(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, owner: number): StaticCapsule {
  return { kind: 'capsule', ax, ay, az, bx, by, bz, r, owner };
}

function box(side: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, owner = -1): StaticBox {
  const a = side * x0, b = side * x1;
  return { kind: 'box', min: [Math.min(a, b), y0, z0], max: [Math.max(a, b), y1, z1], owner };
}
