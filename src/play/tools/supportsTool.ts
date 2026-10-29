// The supports: in an empty unit, a finger manager; in a side channel, a duct
// (a ring with Shift, or when no duct is left); on an item already there, take
// it off. A ghost shows what a click would do.

import * as THREE from 'three';
import { sfx } from '../../audio/sfx';
import { buildItem, ghostBadMat, ghostMat } from '../../render/rackView';
import { disposeTree } from '../../render/dispose';
import { COLUMN_X, U, WALL_X, type Item, type ItemKind } from '../../game/rack';
import type { PlayContext, ToolHandler } from '../context';

const ITEM_NAMES: Record<ItemKind, string> = { hmgr: 'guide-câbles', duct: 'goulotte', vring: 'anneau' };

/** what a click would do: put an item of this kind there, or take off the one there */
interface Slot {
  kind: ItemKind;
  unit: number;
  side: number;
  existing?: Item;
}

export class SupportsTool implements ToolHandler {
  private ghost: THREE.Group | null = null;
  /** what the ghost shows, to rebuild it only when that changes */
  private ghostKey = '';
  /** Shift held: a ring rather than a duct */
  private shift = false;

  constructor(private ctx: PlayContext) {}

  pointerDown(): boolean {
    this.apply();
    return true;
  }

  pointerMove(): boolean {
    return false;
  }

  pointerUp(): boolean {
    return false;
  }

  cancel(): void {}

  dispose(): void {
    this.removeGhost();
  }

  /** Shift pressed or released */
  setShift(down: boolean): void {
    if (down === this.shift) return;
    this.shift = down;
    this.updateGhost(true);
  }

  /** what a click would do under the pointer, or null */
  private slotUnderPointer(): Slot | null {
    const ctx = this.ctx;
    const p = ctx.pointer.ray().intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.03), new THREE.Vector3());
    if (!p) return null;
    const r = ctx.world.rack;
    const unit = Math.floor((r.topY - p.y) / U);
    if (unit < 0 || unit >= r.units.length) return null;
    if (Math.abs(p.x) < COLUMN_X) {
      const existing = r.itemAt('hmgr', unit, 0);
      return { kind: 'hmgr', unit, side: 0, existing };
    }
    if (Math.abs(p.x) < COLUMN_X - 0.03 || Math.abs(p.x) > WALL_X + 0.04) return null;
    const side = Math.sign(p.x);
    const existing = r.itemAt('duct', unit, side);
    if (existing) return { kind: existing.kind, unit, side, existing };
    const kind: ItemKind = this.shift || ctx.world.inventory.duct <= 0 ? 'vring' : 'duct';
    return { kind, unit, side };
  }

  private apply(): void {
    const s = this.slotUnderPointer(), ctx = this.ctx;
    if (!s) return;
    const w = ctx.world;
    if (s.existing) {
      if (s.existing.locked) { ctx.events.onToast('Cet élément est fixé à la baie.'); sfx.error(); return; }
      w.removeItem(s.existing);
      sfx.remove();
    } else {
      if (w.inventory[s.kind] <= 0) { ctx.events.onToast(`Plus de ${ITEM_NAMES[s.kind]} en stock.`); sfx.error(); return; }
      if (!w.placeItem(s.kind, s.unit, s.side)) { ctx.events.onToast(s.kind === 'hmgr' ? 'Un guide-câbles se pose dans une unité vide.' : 'Emplacement occupé.'); sfx.error(); return; }
      sfx.place();
    }
    this.updateGhost(true);
    ctx.events.onInventory();
  }

  /** the ghost follows the pointer while this tool is chosen (`force`: rebuilt even if in the same place) */
  updateGhost(force = false): void {
    const ctx = this.ctx;
    const s = ctx.tool === 'supports' ? this.slotUnderPointer() : null;
    const key = s ? `${s.kind}:${s.unit}:${s.side}:${ctx.world.itemsVersion}` : '';
    if (key === this.ghostKey && !force) return;
    this.ghostKey = key;
    this.removeGhost();
    if (!s) return;
    const rack = ctx.world.rack, k = s.kind;
    const ok = s.existing ? !s.existing.locked : rack.canPlace(k, s.unit, s.side) && ctx.world.inventory[k] > 0;
    const it: Item = s.existing ?? { id: -99, kind: k, unit: k === 'duct' ? rack.ductStart(s.unit) : s.unit, side: s.side, span: k === 'duct' ? 4 : 1, locked: false };
    this.ghost = buildItem(rack, { ...it, id: -99 }, null, s.existing || !ok ? ghostBadMat : ghostMat);
    ctx.stage.scene.add(this.ghost);
  }

  private removeGhost(): void {
    if (!this.ghost) return;
    this.ctx.stage.scene.remove(this.ghost);
    disposeTree(this.ghost);
    this.ghost = null;
  }
}
