// What the game keeps in the browser (localStorage). Each entry declares its
// key, its default and its validation: a value that is missing, unreadable or
// of another shape reads as the default. Any read or write may throw (private
// browsing, storage full or blocked): the game then simply forgets. Keys and
// formats are those of earlier versions, so players keep their progress.

import { AUTO_QUALITY, QUALITY, type QualityChoice } from '../render/quality';
import { LANGUAGES, preferredLanguage, type Language } from './language';

/** best result per level id: stars (1..3), time (s), readability note (0..100), and the time challenges won */
export interface Progress {
  stars: Record<string, number>;
  times: Record<string, number>;
  challenges: Record<string, boolean>;
  notes: Record<string, number>;
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
    fallback: (): Progress => ({ stars: {}, times: {}, challenges: {}, notes: {} }),
    // older saves may lack the times, the challenges and the notes
    parse: (raw: string): Progress => ({ times: {}, challenges: {}, notes: {}, ...JSON.parse(raw) }),
    format: (v: Progress) => JSON.stringify(v),
    valid: (v: Progress) => isRecord(v.stars) && isRecord(v.times) && isRecord(v.challenges) && isRecord(v.notes),
  } satisfies Entry<Progress>,
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
