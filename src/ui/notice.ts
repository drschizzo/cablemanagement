// A notice at the bottom of the screen, until the player closes it: what to
// do when the browser draws the game too slowly (render/gpu.ts finds out).

import type { GpuAdvice } from '../render/gpu';
import { assertNever } from '../lib/assertNever';
import { tr } from './language';

const NOTICE_ID = 'gpu-notice';

function adviceText(advice: GpuAdvice): string {
  switch (advice) {
    case 'enableHardwareAcceleration':
      return tr({
        fr: 'Le jeu est dessiné par le processeur, sans carte graphique : il sera très lent. '
          + 'Activez l’accélération matérielle du navigateur (Chrome : Paramètres › Système › « Utiliser l’accélération graphique »), puis relancez-le.',
        en: 'The game is drawn by the processor, without a graphics card: it will be very slow. '
          + 'Turn on the browser\'s hardware acceleration (Chrome: Settings › System › “Use graphics acceleration”), then restart it.',
      });
    case 'useDedicatedGpu':
      return tr({
        fr: 'Le navigateur utilise la puce graphique intégrée au processeur. Si l’ordinateur a aussi une carte graphique dédiée, '
          + 'choisissez « Hautes performances » pour le navigateur dans Paramètres Windows › Affichage › Graphiques, puis relancez-le.',
        en: 'The browser uses the graphics chip built into the processor. If the computer also has a dedicated graphics card, '
          + 'choose “High performance” for the browser in Windows Settings › Display › Graphics, then restart it.',
      });
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
  close.title = tr({ fr: 'Fermer', en: 'Close' });
  close.textContent = '✕';
  close.onclick = () => notice.remove();
  notice.append(text, close);
  document.body.appendChild(notice);
}
