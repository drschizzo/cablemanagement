// What the game keeps in the browser (localStorage). Each entry declares its
// key, its default and its validation: a value that is missing, unreadable or
// of another shape reads as the default. Any read or write may throw (private
// browsing, storage full or blocked): the game then simply forgets.

import { AUTO_QUALITY, QUALITY, type QualityChoice } from '../render/quality';
import { LANGUAGES, preferredLanguage, type Language } from './language';
import type { CabinetState } from '../game/cabinetState';
import type { FindId } from '../game/finds';
import type { Look } from '../render/look';
import { RULES, type Rule } from '../game/levels/levelRules';
import { GESTURES, type Gesture } from '../game/levels/levelGestures';

/** the best result of one cabinet of the day */
export interface DailyResult {
  stars: number;
  /** s of play */
  time: number;
  /** downtime points spent, and the budget (0: none) */
  downtime: number;
  budget: number;
  /** each line of the schedule: 2 tidy, 1 plugged only, 0 not plugged (the shared grid) */
  lines: number[];
}

/** the career: tickets done, the client's cabinet as the last one left it, the best stars of each */
export interface Career {
  done: number;
  cabinet: CabinetState | null;
  stars: number[];
}

/** the workshop: the look equipped in each slot, and the finds picked up */
export interface Workshop {
  /** the look equipped in each slot, by slot (ui/shop.ts) */
  equipped: Partial<Record<keyof Look, string>>;
  /** ids of the finds picked up (game/finds.ts) */
  finds: FindId[];
}

/** best result per level id: stars (1..3), time (s), and the challenges won */
export interface Progress {
  stars: Record<string, number>;
  times: Record<string, number>;
  challenges: Record<string, boolean>;
}

interface Entry<T> {
  key: string;
  fallback: () => T;
  parse: (raw: string) => T;
  format: (v: T) => string;
  valid?: (v: T) => boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** a level of QUALITY, or settings of the same shape as its levels */
function isQualityChoice(v: QualityChoice): boolean {
  if (!isRecord(v)) return false;
  if (v.kind === 'auto') return Number.isInteger(v.level) && v.level >= 0 && v.level < QUALITY.length;
  if (v.kind !== 'fixed' || !isRecord(v.settings)) return false;
  const { ratio, ao, ssr, shadow } = v.settings;
  return ratio > 0 && typeof ao === 'boolean' && typeof ssr === 'boolean' && shadow > 0;
}

const ENTRIES = {
  progress: {
    key: 'cable.progress',
    fallback: (): Progress => ({ stars: {}, times: {}, challenges: {} }),
    parse: (raw: string): Progress => JSON.parse(raw),
    format: (v: Progress) => JSON.stringify(v),
    valid: (v: Progress) => isRecord(v.stars) && isRecord(v.times) && isRecord(v.challenges),
  } satisfies Entry<Progress>,
  /** the cabinets of the day signed off, by date (YYYY-MM-DD) */
  daily: {
    key: 'cable.daily',
    fallback: (): Record<string, DailyResult> => ({}),
    // a day of another shape is left out; the others, and the run of days, stay
    parse: (raw: string): Record<string, DailyResult> => {
      const v: unknown = JSON.parse(raw);
      if (!isRecord(v)) return v as Record<string, DailyResult>;
      return Object.fromEntries(Object.entries(v).filter(([, r]) => isRecord(r) && typeof r.stars === 'number' && Array.isArray(r.lines))) as Record<string, DailyResult>;
    },
    format: (v: Record<string, DailyResult>) => JSON.stringify(v),
    valid: isRecord,
  } satisfies Entry<Record<string, DailyResult>>,
  /** the career, and the client's cabinet as the player left it */
  career: {
    key: 'cable.career',
    fallback: (): Career => ({ done: 0, cabinet: null, stars: [] }),
    parse: (raw: string): Career => JSON.parse(raw),
    format: (v: Career) => JSON.stringify(v),
    valid: (v: Career) => Number.isInteger(v.done) && v.done >= 0 && Array.isArray(v.stars) && (v.cabinet === null || (isRecord(v.cabinet) && Array.isArray(v.cabinet.cords))),
  } satisfies Entry<Career>,
  /** the looks equipped and the finds */
  workshop: {
    key: 'cable.workshop',
    fallback: (): Workshop => ({ equipped: {}, finds: [] }),
    parse: (raw: string): Workshop => JSON.parse(raw),
    format: (v: Workshop) => JSON.stringify(v),
    valid: (v: Workshop) => isRecord(v.equipped) && Array.isArray(v.finds),
  } satisfies Entry<Workshop>,
  /** the code of the last cabinet composed in the editor ('' : none yet) */
  editorDraft: {
    key: 'cable.editor',
    fallback: (): string => '',
    parse: (raw: string) => raw,
    format: (v: string) => v,
  } satisfies Entry<string>,
  /** the rules met in a cabinet signed off: a brief only recalls them (game/levels/levelRules.ts) */
  rules: {
    key: 'cable.rules',
    fallback: (): Rule[] => [],
    // a name that is not a rule is left out
    parse: (raw: string): Rule[] => {
      const v: unknown = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((r): r is Rule => (RULES as readonly unknown[]).includes(r)) : [];
    },
    format: (v: Rule[]) => JSON.stringify(v),
  } satisfies Entry<Rule[]>,
  /** the gestures a brief has explained in a cabinet signed off (game/levels/levelGestures.ts) */
  gestures: {
    key: 'cable.gestures',
    fallback: (): Gesture[] => [],
    parse: (raw: string): Gesture[] => {
      const v: unknown = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((g): g is Gesture => (GESTURES as readonly unknown[]).includes(g)) : [];
    },
    format: (v: Gesture[]) => JSON.stringify(v),
  } satisfies Entry<Gesture[]>,
  /** the tutorial was finished or skipped once */
  tutorialDone: {
    key: 'cable.tutorial',
    fallback: (): boolean => false,
    parse: (raw: string) => raw === 'done',
    format: () => 'done',
  } satisfies Entry<boolean>,
  /** the quality of the image: chosen in the settings, or the level auto has stepped down to */
  quality: {
    key: 'cable.quality',
    fallback: (): QualityChoice => AUTO_QUALITY,
    parse: (raw: string): QualityChoice => JSON.parse(raw),
    format: (v: QualityChoice) => JSON.stringify(v),
    valid: isQualityChoice,
  } satisfies Entry<QualityChoice>,
  /** the language chosen in the settings; the browser's, until then */
  language: {
    key: 'cable.language',
    fallback: (): Language => preferredLanguage(navigator.languages ?? [navigator.language]),
    parse: (raw: string) => raw as Language,
    format: (v: Language) => v,
    valid: (v: Language) => LANGUAGES.some((l) => l.id === v),
  } satisfies Entry<Language>,
  /** the ambient music of the zen mode is turned off */
  musicOff: {
    key: 'cable.music-off',
    fallback: (): boolean => false,
    parse: (raw: string) => raw === 'on',
    format: () => 'on',
  } satisfies Entry<boolean>,
  /** the sound is off */
  muted: {
    key: 'cable.muted',
    fallback: (): boolean => false,
    parse: (raw: string) => raw === 'on',
    format: () => 'on',
  } satisfies Entry<boolean>,
};

type Name = keyof typeof ENTRIES;
type Value<K extends Name> = ReturnType<(typeof ENTRIES)[K]['fallback']>;

const entry = <K extends Name>(name: K) => ENTRIES[name] as unknown as Entry<Value<K>>;

export function load<K extends Name>(name: K): Value<K> {
  const e = entry(name);
  try {
    const raw = localStorage.getItem(e.key);
    if (raw === null) return e.fallback();
    const v = e.parse(raw);
    return !e.valid || e.valid(v) ? v : e.fallback();
  } catch {
    return e.fallback();
  }
}

/** saves a value; null or false removes the entry */
export function save<K extends Name>(name: K, value: Value<K> | null): void {
  const e = entry(name);
  try {
    if (value === null || value === false) localStorage.removeItem(e.key);
    else localStorage.setItem(e.key, e.format(value));
  } catch {}
}
