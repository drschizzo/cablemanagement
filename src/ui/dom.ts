// Small helpers shared by the panels of the interface.

import { $ } from '../lib/page';

/** an overlay or panel: shown, or hidden */
export function show(selector: string): void {
  $(selector).classList.add('on');
}

export function hide(selector: string): void {
  $(selector).classList.remove('on');
}

/** a dialog is open (brief, result, menu…): it takes the keys */
export function isDialogOpen(): boolean {
  return !!document.querySelector('.overlay.on');
}

/** three stars, the first `count` lit */
export function starsHtml(count: number, big = false): string {
  let html = '';
  for (let i = 0; i < 3; i++) html += `<span class="star${i < count ? ' on' : ''}${big ? ' big' : ''}">★</span>`;
  return html;
}
