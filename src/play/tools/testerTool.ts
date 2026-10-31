// The cable tester: a click on a cord sends light (or a signal) down it and
// says whether it comes out at the other end. A cord broken inside is found
// before it is plugged; once tested, its tooltip says what it is.

import { sfx } from '../../audio/sfx';
import type { CableIndex } from '../../game/cables';
import type { CordPick } from '../picking';
import type { HoverNote } from '../notices';
import type { PlayContext, ToolHandler } from '../context';

export class TesterTool implements ToolHandler {
  readonly cursor = 'help';
  readonly worksOnCords = true;
  readonly worksWhilePreparing = false;
  /** the cords tested so far, and whether each is broken */
  private results = new Map<CableIndex, boolean>();

  constructor(private ctx: PlayContext) {}

  hoverNotes(pick: CordPick): HoverNote[] {
    const faulty = this.results.get(pick.cable);
    return faulty === undefined ? [{ kind: 'testIt' }] : [{ kind: 'tested', faulty }];
  }

  pointerDown(): boolean {
    const p = this.ctx.picker.pick();
    if (!p) return false;
    const faulty = this.ctx.world.isFaulty(p.cable);
    this.results.set(p.cable, faulty);
    this.ctx.events.onToast({ kind: 'cordTested', faulty });
    if (faulty) sfx.error();
    else sfx.label();
    return true;
  }

  pointerMove(): boolean {
    return false;
  }

  pointerUp(): boolean {
    return false;
  }

  cancel(): void {}

  dispose(): void {}
}
