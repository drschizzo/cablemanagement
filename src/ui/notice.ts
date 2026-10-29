// A notice at the bottom of the screen, until the player closes it: what to
// do when the browser draws the game too slowly (render/gpu.ts finds out).

import type { GpuAdvice } from '../render/gpu';
import { assertNever } from '../lib/assertNever';

const NOTICE_ID = 'gpu-notice';

function adviceText(advice: GpuAdvice): string {
  switch (advice) {
    case 'enableHardwareAcceleration':
      return 'Le jeu est dessiné par le processeur, sans carte graphique : il sera très lent. '
        + 'Activez l’accélération matérielle du navigateur (Chrome : Paramètres › Système › « Utiliser l’accélération graphique »), puis relancez-le.';
    case 'useDedicatedGpu':
      return 'Le navigateur utilise la puce graphique intégrée au processeur. Si l’ordinateur a aussi une carte graphique dédiée, '
        + 'choisissez « Hautes performances » pour le navigateur dans Paramètres Windows › Affichage › Graphiques, puis relancez-le.';
    default: return assertNever(advice);
  }
}

/** shows the advice, once (a notice already up stays as it is) */
export function showGpuNotice(advice: GpuAdvice): void {
  if (document.getElementById(NOTICE_ID)) return;
  const notice = document.createElement('div');
  notice.id = NOTICE_ID;
  const text = document.createElement('p');
  text.textContent = adviceText(advice);
  const close = document.createElement('button');
  close.className = 'link';
  close.title = 'Fermer';
  close.textContent = '✕';
  close.onclick = () => notice.remove();
  notice.append(text, close);
  document.body.appendChild(notice);
}
