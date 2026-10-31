// What the tools and the feedback of a level share with the Controller that
// runs it: the tools depend on this, not on the Controller itself.

import type { Stage } from '../render/stage';
import type { RackView } from '../render/rackView';
import type { CableView } from '../render/cableView';
import type { World } from '../game/world';
import type { Evaluation } from '../game/evaluation';
import type { Port, UnitSpec } from '../game/rack';
import type { FindId } from '../game/finds';
import type { Pointer } from './pointer';
import type { CordPick, CordPicker } from './picking';
import type { CordInfo, Hint, HoverNote, PhysicsStats, Toast } from './notices';
import type { CircuitIndex } from '../game/cables';
import type { UndoHistory } from './undoHistory';
import type { PortHint } from './feedback/portHint';
import type { HoldView } from './feedback/holdView';

/** the hand, the route (a way drawn over the guides, the cord laid along it), the supports, the velcro, the cable tester */
export type Tool = 'hand' | 'route' | 'supports' | 'velcro' | 'tester';

/** what the Controller tells the interface (app/app.ts wires it to the HUD) */
export interface ControllerEvents {
  onEval(ev: Evaluation): void;
  onInventory(): void;
  /** the cord under the pointer and the notes on it (null: none), at the pointer (px of the page) */
  onHover(cord: CordInfo | null, notes: HoverNote[], x: number, y: number): void;
  onToast(toast: Toast): void;
  /** the debug line: what the physics costs */
  onStats(stats: PhysicsStats): void;
  /** a hint for what the player is doing now (null: back to the tool's) */
  onHint(hint: Hint | null): void;
  /** a dialog of the interface is open: the keys are its own, not the level's */
  isDialogOpen(): boolean;
  /** what the face plate of a unit says (the interface knows the words) */
  unitLabel(unit: UnitSpec): string;
  /** the player picked up the find the cabinet hid */
  onFind(find: FindId): void;
}

/** what the player did, for the tutorial */
export interface GestureCounters {
  hovered: number;
  /** metres the hand has travelled carrying a cord */
  dragged: number;
  unplugged: number;
  orbited: number;
  deposited: number;
  handedOver: number;
}

export interface PlayContext {
  readonly world: World;
  readonly stage: Stage;
  readonly rackView: RackView;
  /** rebuilt with the cords (another length, a new cord): read it here every time */
  readonly cableView: CableView;
  readonly events: ControllerEvents;
  readonly pointer: Pointer;
  readonly picker: CordPicker;
  readonly counters: GestureCounters;
  readonly history: UndoHistory;
  readonly portHint: PortHint;
  readonly holdView: HoldView;
  readonly tool: Tool;
  /** seconds since the level opened, preparation and pauses included (animations) */
  readonly clock: number;
  readonly lastEval: Evaluation;
  /** scores the cabinet now, and shows it */
  reevaluate(): void;
  /** the highlights of the cords follow the hover, the hand and the focused line again */
  refreshHighlights(): void;
  /** production links just cut by the player: a toast with what they cost */
  announceCut(links: CircuitIndex[]): void;
  /** a line of the schedule through this port is connected (as of the last evaluation) */
  isLineConnectedAt(port: Port): boolean;
}

/**
 * One tool of the toolbar. The pointer events go to every tool, so that a
 * gesture begun with one tool ends properly even if the player switched tools
 * meanwhile: a tool answers true only while a gesture of its own is under way.
 */
export interface ToolHandler {
  /** the cursor over the view while it is chosen */
  readonly cursor: string;
  /** it works on the cords (hover, Tab through the cords under the pointer), not on the rack */
  readonly worksOnCords: boolean;
  /** usable during the preparation, while the cords stand still */
  readonly worksWhilePreparing: boolean;
  /** the cord under the pointer changed: what the tool shows of it (cursor, pinches…) */
  hoverChanged?(pick: CordPick | null): void;
  /** what the tooltip of the cord under the pointer adds for this tool */
  hoverNotes?(pick: CordPick): HoverNote[];
  /** the left button went down with this tool chosen: false when it took nothing (the view pans instead) */
  pointerDown(e: PointerEvent): boolean;
  /** the pointer moved: true when it was this tool's gesture */
  pointerMove(e: PointerEvent): boolean;
  /** the button went up: true when it ended this tool's gesture */
  pointerUp(e: PointerEvent): boolean;
  /** the tool is put down: a gesture under way is dropped */
  cancel(): void;
  dispose(): void;
}
