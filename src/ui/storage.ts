// What the game keeps in the browser (localStorage). Each entry declares its
// key, its default and its validation: a value that is missing, unreadable or
// of another shape reads as the default. Any read or write may throw (private
// browsing, storage full or blocked): the game then simply forgets. Keys and
// formats are those of earlier versions, so players keep their progress.

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
