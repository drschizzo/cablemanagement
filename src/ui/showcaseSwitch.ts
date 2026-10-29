// The Before / After switch of the title screen, its caption, and the
// "another room" button. The aisle (showcase/) says when its state changes;
// this shows it.

import { $ } from '../lib/page';

type AisleState = 'before' | 'after' | 'moving';

export class ShowcaseSwitch {
  private el = $('#showcase');

  constructor(actions: { toggle(): void; another(): void; state(): AisleState }) {
    $('#sc-before').onclick = () => { if (actions.state() === 'after') actions.toggle(); };
    $('#sc-after').onclick = () => { if (actions.state() === 'before') actions.toggle(); };
    $('#sc-new').onclick = () => actions.another();
  }

  show(): void {
    document.body.classList.add('demo');
    this.el.classList.add('on');
  }

  hide(): void {
    this.el.classList.remove('on');
    document.body.classList.remove('demo');
    delete document.body.dataset.sc;
  }

  /** the switch and its caption; while the aisle moves, the switch is already on its way to `to` */
  render(state: AisleState, to: 'before' | 'after' | undefined, bays: number): void {
    // the title screen follows the state too (its LEDs, its play button)
    document.body.dataset.sc = state;
    $('#sc-switch').className = state === 'moving' ? `to-${to}` : state;
    for (const side of ['before', 'after'] as const) {
      const button = $<HTMLButtonElement>(`#sc-${side}`);
      button.disabled = state !== (side === 'before' ? 'after' : 'before');
      button.setAttribute('aria-pressed', String(state === side || to === side));
    }
    const what = bays > 1 ? `${bays} baies` : 'Une baie';
    $('#sc-caption').textContent =
      state === 'before' ? `${what}, et le technicien précédent est passé par là.`
      : state === 'after' ? 'Chaque cordon à sa longueur, rangé, étiqueté.'
      : to === 'after' ? 'Rangement en cours…' : 'Retour au désordre…';
  }
}
