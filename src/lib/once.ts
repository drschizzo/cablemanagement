// A value made on first use and kept: a texture drawn, a light, nodes of a
// shader, the same object for every caller after the first.

/** `make`, run on the first call only: every later call gets what it made */
export function once<T>(make: () => T): () => T {
  let made = false, value: T;
  return () => {
    if (!made) { value = make(); made = true; }
    return value;
  };
}
