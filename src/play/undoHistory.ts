// The states to go back to with Ctrl+Z, the latest last.

import type { Snapshot, World } from '../game/world';

const MAX_STATES = 30;

export class UndoHistory {
  private states: Snapshot[] = [];

  constructor(private world: World) {}

  /** remembers the cabinet before a gesture */
  remember(): void {
    this.states.push(this.world.snapshot());
    if (this.states.length > MAX_STATES) this.states.shift();
  }

  /** the gesture just remembered came to nothing (a mere click): forget it */
  forgetLast(): void {
    this.states.pop();
  }

  /** the state before the last gesture, taken off the history */
  takeLast(): Snapshot | undefined {
    return this.states.pop();
  }

  clear(): void {
    this.states = [];
  }
}
