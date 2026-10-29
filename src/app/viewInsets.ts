// Frames the cabinet in the space the panels of the interface leave free
// (hidden panels leave it all).

import type { Stage } from '../render/stage';
import { $ } from '../lib/page';

/** height kept free under the view for the tutorial's panel (px) */
const TUTORIAL_PANEL = 230;
/** height kept free under the view in a level (px) */
const BOTTOM_MARGIN = 50;

export function measureInsets(stage: Stage): void {
  const visible = (id: string) => {
    const el = $('#' + id);
    return getComputedStyle(el).display !== 'none' ? el.getBoundingClientRect() : null;
  };
  const toolbar = visible('toolbar'), side = visible('side'), topbar = visible('topbar');
  const tutorial = $('#tuto').classList.contains('on');
  const titleScreen = document.body.classList.contains('demo');
  // the title slides into place: its resting top, not where it is in its slide
  const title = $('#title');
  const titleTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--title-top'));
  stage.setInsets({
    left: toolbar ? toolbar.right : 0,
    right: side ? Math.max(0, window.innerWidth - side.left) : 0,
    top: titleScreen ? titleTop + title.offsetHeight : topbar ? topbar.bottom : 0,
    bottom: tutorial ? TUTORIAL_PANEL : titleScreen ? $('#showcase').getBoundingClientRect().height + 24 : BOTTOM_MARGIN,
  });
}

/** keeps the framing right when the window or the side panel changes size */
export function followInsets(stage: Stage): void {
  const measure = () => measureInsets(stage);
  window.addEventListener('resize', measure);
  new ResizeObserver(measure).observe($('#side'));
}
