// How much of the screen the panels of the interface cover, from each edge:
// the stage frames the cabinet in the rest (Stage.setPanelMargins). Hidden
// panels cover nothing.

import type { ScreenMargins } from '../render/stage';
import { $ } from '../lib/page';

/** height kept free under the view for the tutorial's panel (px) */
const TUTORIAL_PANEL = 230;
/** height kept free under the view in a level (px) */
const BOTTOM_MARGIN = 50;

export function panelMargins(): ScreenMargins {
  const visible = (id: string) => {
    const el = $('#' + id);
    return getComputedStyle(el).display !== 'none' ? el.getBoundingClientRect() : null;
  };
  const toolbar = visible('toolbar'), side = visible('side'), topbar = visible('topbar');
  const tutorial = $('#tuto').classList.contains('on');
  const titleScreen = document.body.classList.contains('demo');
  // the title slides into place: its resting top, not where it is in its slide
  const titleTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--title-top'));
  return {
    left: toolbar ? toolbar.right : 0,
    right: side ? Math.max(0, window.innerWidth - side.left) : 0,
    top: titleScreen ? titleTop + $('#title').offsetHeight : topbar ? topbar.bottom : 0,
    bottom: tutorial ? TUTORIAL_PANEL : titleScreen ? $('#showcase').getBoundingClientRect().height + 24 : BOTTOM_MARGIN,
  };
}

/** calls `changed` when the window or the side panel changes size */
export function onPanelsResized(changed: () => void): void {
  window.addEventListener('resize', changed);
  new ResizeObserver(changed).observe($('#side'));
}
