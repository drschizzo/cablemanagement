// The player's own touches to the picture: the colour of the velcros, the
// tint of the light round the cabinet. Opened in the notebook (progression/notebook.ts), they
// change nothing of the rules, nor the colours that carry meaning (cords,
// labels, LEDs).

export interface Look {
  /** the jacket of the velcro straps */
  velcro: string;
  /** the fill light, from the side: the tint of the room round the cabinet */
  accent: string;
}

export const DEFAULT_LOOK: Look = { velcro: '#1b2a4a', accent: '#a9c4e8' };
