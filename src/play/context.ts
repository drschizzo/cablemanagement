// What the tools and the feedback of a level share with the Controller that
// runs it: the tools depend on this, not on the Controller itself.

import type { Stage } from '../render/stage';
import type { RackView } from '../render/rackView';
import type { CableView } from '../render/cableView';
import type { Evaluation, World } from '../game/world';
import type { Port } from '../game/rack';
import type { Pointer } from './pointer';
import type { CordPicker } from './picking';
import type { UndoHistory } from './undoHistory';
import type { PortHint } from './feedback/portHint';
import type { HoldView } from './feedback/holdView';

/** the hand, the route (a way drawn over the guides, the cord laid along it), the supports, the velcro */
export type Tool = 'hand' | 'route' | 'supports' | 'velcro';

/** what the Controller tells the interface (main.ts wires it to the HUD) */
export interface ControllerEvents {
  onEval(ev: Evaluation): void;
  onInventory(): void;
  onHover(text: string | null, x: number, y: number): void;
  onToast(text: string): void;
  onStats(text: string): void;
  /** a hint for what the player is doing now (null: back to the tool's) */
  onHint(text: string | null): void;
}

/** what the player did, for the tutorial */
export interface GestureCounters {
  hovered: number;
  /** metres the hand has travelled carrying a cord */
  dragged: number;
  plugged: number;
  unplugged: number;
  orbited: number;
  deposited: number;
  pinched: number;
  handedOver: number;
  routed: number;
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
  announceCut(links: number[]): void;
  /** a line of the schedule through this port is connected (as of the last evaluation) */
  isLineConnectedAt(port: Port): boolean;
}

/**
 * One tool of the toolbar. The pointer events go to every tool, so that a
 * gesture begun with one tool ends properly even if the player switched tools
 * meanwhile: a tool answers true only while a gesture of its own is under way.
 */
export interface ToolHandler {
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
