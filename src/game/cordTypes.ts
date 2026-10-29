// The kinds of patch cord, and the lengths they come in.

/** OS2 / OM4: optical fibre; CU: copper (RJ45) */
export type FibreType = 'OS2' | 'OM4' | 'CU';

/** the colour of each cord type's jacket: yellow single-mode, aqua multimode, blue copper (the usual codes) */
export const FIBRE_COLORS: Record<FibreType, string> = { OS2: '#f2c12e', OM4: '#3cc9cf', CU: '#3d7fe0' };

/** standard patch cord lengths (m) */
export const CATALOGUE = [0.15, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5];
