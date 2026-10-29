// The kinds of patch cord, and the lengths they come in.

/** OS2 / OM4: optical fibre; CU: copper (RJ45) */
export type FibreType = 'OS2' | 'OM4' | 'CU';

/** what the player reads for each cord type */
export const FIBRE_NAMES: Record<FibreType, string> = { OS2: 'Monomode OS2', OM4: 'Multimode OM4', CU: 'Cuivre RJ45' };

/** standard patch cord lengths (m) */
export const CATALOGUE = [0.15, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5];
