// Builds the starting mess of a level: the patching schedule (which port
// goes to which), the cords (type, length) and the tangled paths they start
// in. The physics then lets them fall into place.

import { CONNECTOR, Rack, SEG as DEFAULT_SEG, type Port } from './rack';
import type { FibreType, LevelDef } from './levels';

export interface Circuit {
  a: string;
  b: string;
  type: FibreType;
  service: number;
}

export interface CableStart {
  type: FibreType;
  /** port of each end at the start (null = hanging loose) */
  ends: [string | null, string | null];
  points: number[];
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(a: T[], r: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeSchedule(level: LevelDef, rack: Rack, r: () => number): Circuit[] {
  const links = level.links ?? [];
  const reserved = new Set(links.flatMap((l) => [l.a, l.b]));
  const panelUnits = rack.units.map((u, k) => (u.kind === 'panel' ? k : -1)).filter((k) => k >= 0);
  // panel cords go to the access switches (not to the firewall or the router)
  const switchPorts = shuffle(rack.ports.filter((p) => {
    const u = rack.units[p.unit];
    return u.kind === 'switch' && (u.style ?? 'switch') === 'switch' && !reserved.has(p.id);
  }), r);
  // spread the cords over the panels, then over the ports of each panel
  const panelPorts = panelUnits.map((u) => shuffle(rack.ports.filter((p) => p.unit === u && !reserved.has(p.id)), r));
  const out: Circuit[] = [];
  // one-to-one patching: a panel right above a switch goes port i to port i
  const below = (k: number) => (level.pairing && rack.units[k + 1]?.kind === 'switch' ? rack.ports.filter((p) => p.unit === k + 1) : null);
  const taken = new Set<string>();
  for (let c = 0; c < level.cables; c++) {
    const pi = c % panelUnits.length;
    const sw = below(panelUnits[pi]);
    let a: Port, b: Port;
    if (sw) {
      const k = panelPorts[pi].findIndex((p) => sw[p.index] && !reserved.has(sw[p.index].id) && !taken.has(sw[p.index].id));
      a = panelPorts[pi].splice(k, 1)[0];
      b = sw[a.index];
    } else {
      a = panelPorts[pi].pop()!;
      do { b = switchPorts.pop()!; } while (taken.has(b.id));
    }
    taken.add(b.id);
    // copper panels take copper cords; fibre: one type per panel, or alternating
    const fibres = level.types.filter((t) => t !== 'CU');
    const ti = panelUnits.length > 1 ? pi : c;
    const type: FibreType = rack.units[a.unit].style === 'copper' ? 'CU' : fibres[ti % Math.max(1, fibres.length)] ?? 'OS2';
    out.push({ a: a.id, b: b.id, type, service: Math.floor(r() * level.services) });
  }
  // the schedule reads best sorted by panel port
  out.sort((p, q) => rack.ports.indexOf(rack.port(p.a)) - rack.ports.indexOf(rack.port(q.a)));
  // then the links between equipment: uplinks, firewall, router, servers
  for (const l of links) out.push({ a: l.a, b: l.b, type: 'CU', service: l.service ?? 3 });
  return out;
}

export function makeCables(level: LevelDef, rack: Rack, circuits: Circuit[], r: () => number, lengths?: number[]): CableStart[] {
  const n = circuits.length;
  const ends: [string | null, string | null][] = circuits.map((c) => [c.a, c.b]);
  // wrong ports: move one end to a free port of the same equipment kind
  const used = new Set<string>(circuits.flatMap((c) => [c.a, c.b]));
  const order = shuffle([...Array(n).keys()], r);
  let k = 0;
  for (let w = 0; w < level.wrong && k < order.length; w++, k++) {
    const c = order[k];
    const side = r() < 0.6 ? 1 : 0;
    const cur = rack.port(ends[c][side]!);
    const kind = rack.units[cur.unit].kind;
    const free = rack.ports.filter((p) => rack.units[p.unit].kind === kind && !used.has(p.id));
    if (r() < 0.5 && w + 1 < level.wrong && k + 1 < order.length) {
      // swap with another cord: two errors at once
      const d = order[++k];
      const tmp = ends[c][side];
      ends[c][side] = ends[d][side];
      ends[d][side] = tmp;
      w++;
    } else if (free.length) {
      const p = free[Math.floor(r() * free.length)];
      used.add(p.id);
      ends[c][side] = p.id;
    }
  }
  for (let l = 0; l < level.loose && k < order.length; l++, k++) {
    ends[order[k]][r() < 0.7 ? 1 : 0] = null;
  }

  const layers = shuffle([...Array(n).keys()], r);
  return circuits.map((c, i) => {
    const pa = rack.port(c.a), pb = rack.port(c.b);
    const ml = level.messLength;
    const length = lengths?.[i] ?? (ml ? ml[0] + r() * (ml[1] - ml[0]) : rack.idealRoute(pa, pb) + level.slack[0] + r() * (level.slack[1] - level.slack[0]));
    const z = 0.02 + ((layers[i] + 0.5) / n) * 0.12;
    const points = tangledPath(rack, ends[i], length, z, level, r);
    return { type: c.type, ends: ends[i], points };
  });
}

type V3 = [number, number, number];

/** the two pinned nodes and the start of the cord, for a plugged or a loose end */
function endFrame(rack: Rack, port: Port | null, r: () => number, SEG: number): { pin: [V3, V3]; tail: V3 } {
  if (port) {
    const p0: V3 = [port.x, port.y, CONNECTOR];
    const p1: V3 = [port.x, port.y, CONNECTOR + SEG];
    return { pin: [p0, p1], tail: [port.x, port.y - 0.035, CONNECTOR + SEG + 0.035] };
  }
  const x = (r() - 0.5) * 0.6;
  const y = rack.floorY + 0.08 + r() * (rack.topY * 0.5);
  const z = 0.04 + r() * 0.1;
  return { pin: [[x, y, z], [x, y + SEG, z]], tail: [x, y + SEG + 0.04, z] };
}

function tangledPath(rack: Rack, ends: [string | null, string | null], length: number, z: number, level: LevelDef, r: () => number): number[] {
  const SEG = level.seg ?? DEFAULT_SEG;
  const mess = level.mess;
  const spread = level.messSpread;
  const A = endFrame(rack, ends[0] ? rack.port(ends[0]) : null, r, SEG);
  const Bf = endFrame(rack, ends[1] ? rack.port(ends[1]) : null, r, SEG);
  const target = length - 2 * SEG;
  const hx = spread?.x ?? 0.36;
  const lo: V3 = [-hx, rack.floorY + 0.05, 0];
  const hi: V3 = [hx, rack.topY - 0.01, 0];
  // each detour at its own depth (wild mess), or every cord in its own layer
  const zAt = () => (spread ? spread.z[0] + r() * (spread.z[1] - spread.z[0]) : z + (r() - 0.5) * 0.01);
  let wps: V3[] = [];
  let ctrl: V3[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const k = Math.max(1, mess + Math.floor(attempt / 2));
    wps = [];
    for (let i = 0; i < k; i++) {
      wps.push([lo[0] + r() * (hi[0] - lo[0]), lo[1] + Math.pow(r(), spread?.fall ?? 1) * (hi[1] - lo[1]), zAt()]);
    }
    const make = (t: number): V3[] => {
      const pts: V3[] = [A.pin[1], A.tail];
      wps.forEach((w, i) => {
        const u = (i + 1) / (wps.length + 1);
        const s: V3 = [
          A.tail[0] + (Bf.tail[0] - A.tail[0]) * u,
          A.tail[1] + (Bf.tail[1] - A.tail[1]) * u - 0.05,
          z,
        ];
        pts.push([s[0] + (w[0] - s[0]) * t, s[1] + (w[1] - s[1]) * t, s[2] + (w[2] - s[2]) * t]);
      });
      pts.push(Bf.tail, Bf.pin[1]);
      return pts;
    };
    if (splineLength(make(1)) < target && attempt < 11) continue;
    // blend between a direct route and the detours until the length fits
    let a = 0, b = 1;
    if (splineLength(make(0)) > target) { ctrl = make(0); break; }
    for (let it = 0; it < 24; it++) {
      const m = (a + b) / 2;
      if (splineLength(make(m)) < target) a = m; else b = m;
    }
    ctrl = make((a + b) / 2);
    break;
  }
  const fine = sampleSpline(ctrl, 40);
  // resample by arc length into segments of about SEG
  const cum = [0];
  for (let i = 1; i < fine.length; i++) cum.push(cum[i - 1] + dist(fine[i], fine[i - 1]));
  const total = cum[cum.length - 1];
  const nseg = Math.max(2, Math.round(total / SEG));
  const out: number[] = [...A.pin[0]];
  let j = 1;
  for (let s = 0; s <= nseg; s++) {
    const d = (total * s) / nseg;
    while (j < fine.length - 1 && cum[j] < d) j++;
    const t = (d - cum[j - 1]) / Math.max(1e-12, cum[j] - cum[j - 1]);
    const p = fine[j - 1], q = fine[j];
    out.push(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
  }
  out.push(...Bf.pin[0]);
  return out;
}

function dist(a: V3, b: V3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function splineLength(ctrl: V3[]): number {
  const f = sampleSpline(ctrl, 12);
  let L = 0;
  for (let i = 1; i < f.length; i++) L += dist(f[i], f[i - 1]);
  return L;
}

/** centripetal-ish Catmull-Rom through the control points */
function sampleSpline(ctrl: V3[], per: number): V3[] {
  const out: V3[] = [];
  for (let k = 0; k < ctrl.length - 1; k++) {
    const p0 = ctrl[Math.max(0, k - 1)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(ctrl.length - 1, k + 2)];
    for (let i = 0; i < per; i++) {
      const u = i / per, u2 = u * u, u3 = u2 * u;
      out.push([0, 1, 2].map((d) =>
        0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u3),
      ) as V3);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}
