// The kinds of patch cord, described once: what they carry, how stiff they
// are, whether they kink, their connector, their colour; and the lengths
// they come in. What is asked of a cord's kind is asked here, not of its name.

/** OS2 / OM4: optical fibre; CU: copper (RJ45); PWR: a power cord (C13 / C14) */
export type CordType = 'OS2' | 'OM4' | 'CU' | 'PWR';

/** the connector at the ends of a cord */
export type CordPlug = 'lc' | 'rj45' | 'c13';

interface CordKind {
  /** fibre and copper are not run in the same supports (readability) */
  family: 'fibre' | 'copper' | 'power';
  /** bending stiffness of the cord for the solver */
  stiffness: number;
  /** a sharp bend breaks it (a fibre): a kinked cord is no tidy cord */
  kinks: boolean;
  /** the connector at its ends: an LC plug, an RJ45, a C13 */
  plug: CordPlug;
  /** its jacket: yellow single-mode, aqua multimode, blue copper (the usual codes) */
  color: string;
  /** cords of this kind may take their service's colour (copper patch cords) */
  takesServiceColor: boolean;
}

/** patch cords are springy: copper about twice as stiff as a fibre jumper */
export const CORD_KINDS: Record<CordType, CordKind> = {
  OS2: { family: 'fibre', stiffness: 6, kinks: true, plug: 'lc', color: '#f2c12e', takesServiceColor: false },
  OM4: { family: 'fibre', stiffness: 6, kinks: true, plug: 'lc', color: '#3cc9cf', takesServiceColor: false },
  CU: { family: 'copper', stiffness: 12, kinks: false, plug: 'rj45', color: '#3d7fe0', takesServiceColor: true },
  // a power cord: thick, stiff, black
  PWR: { family: 'power', stiffness: 22, kinks: false, plug: 'c13', color: '#1c1d1f', takesServiceColor: false },
};

/** standard patch cord lengths (m) */
export const CATALOGUE = [0.15, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5];
