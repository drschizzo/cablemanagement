// The default of a switch over a union that has covered every case: if a case
// is added to the union, the switches that forget it no longer compile.

export function assertNever(value: never): never {
  throw new Error(`unexpected case: ${String(value)}`);
}
