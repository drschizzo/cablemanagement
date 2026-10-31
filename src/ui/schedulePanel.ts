// The side panel: the patching schedule (one row per link: plugged, tidy),
// the downtime budget, the three stars with what each asks and how far along
// it is, the stars won, and the Validate button.

import type { Controller } from '../play/controller';
import { CORD_KINDS } from '../game/cordTypes';
import { SERVICES } from '../game/services';
import { isGoalMet, starGoals, type CircuitStatus, type Evaluation, type Strain } from '../game/evaluation';
import { starGoalText, strainLabel } from './messages';
import { UNLOCK_STARS } from '../game/levels/training';
import type { LevelDef } from '../game/levels/levelDef';
import { formatCost } from './format';
import { starsHtml } from './dom';
import { $ } from '../lib/page';
import { cordTypeName, serviceName, serviceWhat } from './names';
import { tr } from './language';

export class SchedulePanel {
  private rows: HTMLTableRowElement[] = [];

  /** one row per link of the level's schedule; hovering a row focuses it, a click fetches its loose end */
  build(ctl: Controller, level: LevelDef): void {
    const w = ctl.world;
    const body = $('#plan tbody');
    body.innerHTML = '';
    const windowed = level.downtime !== undefined;
    this.rows = w.circuits.map((c, i) => {
      const row = document.createElement('tr');
      const service = SERVICES[c.service];
      const live = windowed && w.maintenance.live.has(i);
      const cost = formatCost(service.weight);
      const prodTip = tr({ fr: `En production : chaque seconde coupée coûte ${cost}`, en: `In production: every second cut costs ${cost}` });
      const bypassTip = tr({
        fr: 'Cliquez pour lui poser une dérivation : le trafic passe par un chemin provisoire pendant que vous la recâblez (re-cliquez pour la retirer).',
        en: 'Click to give it a bypass: the traffic takes a temporary path while you recable it (click again to take it off).',
      });
      const prod = !live ? '' : level.bypass
        ? `<button class="prod bypass" title="${prodTip}. ${bypassTip}">⚡</button>`
        : `<span class="prod" title="${prodTip}">⚡</span>`;
      const cutTip = windowed ? tr({ fr: ` — coupée, ${cost} par seconde`, en: ` — cut, ${cost} per second` }) : '';
      row.innerHTML = `<td class="n">${i + 1}${prod}</td><td class="ports">${c.a} <span class="arrow">↔</span> ${c.b}</td>
        <td><span class="chip" data-family="${CORD_KINDS[c.type].family}" style="background:${CORD_KINDS[c.type].color}" title="${cordTypeName(c.type)}">${c.type}</span></td>
        <td class="svc" title="${serviceName(c.service)}${tr({ fr: ' : ', en: ': ' })}${serviceWhat(c.service)}${cutTip}"><span class="dot" style="background:${service.color}"></span>${serviceName(c.service)}</td>
        <td class="st"><i class="s-conn" title="${tr({ fr: 'Branchée', en: 'Plugged' })}"></i><i class="s-tidy"></i></td>`;
      // the row takes its service's colour, as its cord and the light of its port do
      row.style.setProperty('--svc', service.color);
      row.onmouseenter = () => ctl.focus(i);
      row.onmouseleave = () => ctl.focus(-1);
      row.title = tr({ fr: 'Cliquez : son bout libre sort du tas et s\'accroche sous son port', en: 'Click: its loose end comes out of the heap and hooks under its port' });
      row.onclick = () => ctl.fetchEnd(i);
      row.querySelector<HTMLButtonElement>('.bypass')?.addEventListener('click', (e) => { e.stopPropagation(); ctl.toggleBypass(i); });
      body.appendChild(row);
      return row;
    });
  }

  /** the cabinet was scored: every row, bar and gauge follows */
  show(ev: Evaluation, ctl: Controller | null, level: LevelDef | null): void {
    const w = ctl?.world;
    const windowed = level?.downtime !== undefined;
    ev.circuits.forEach((s, i) => {
      const row = this.rows[i];
      if (!row) return;
      row.querySelector('.s-conn')!.className = 's-conn' + (s.connected ? ' ok' : '');
      const tidy = row.querySelector('.s-tidy')!;
      tidy.className = 's-tidy' + (s.tidy ? ' ok' : '');
      tidy.setAttribute('title', tidyTip(s, s.cable >= 0 ? ev.cableStrain[s.cable] : null));
      row.classList.toggle('linked', s.connected);
      row.classList.toggle('done', s.tidy);
      row.classList.toggle('cut', !!w && windowed && w.maintenance.isDown(i));
      row.classList.toggle('bypassed', !!w?.maintenance.bypassed.has(i));
      row.classList.toggle('called', w?.incidents.call?.link === i);
    });
    const n = ev.total;
    this.showDowntime(ev, ctl, level);
    this.showGoals(ev);
    $('#live-stars').innerHTML = starsHtml(ev.stars);
    const validate = $<HTMLButtonElement>('#btn-validate');
    validate.disabled = ev.stars < 1;
    validate.classList.toggle('ready', ev.stars >= 1);
    validate.textContent = ev.stars < 1 ? tr({ fr: `Branchez les ${n} liaisons du plan`, en: `Plug the ${n} links of the schedule` })
      : ev.stars < UNLOCK_STARS ? tr({ fr: 'Valider · ★ (tout ranger pour ★★)', en: 'Sign off · ★ (tidy everything for ★★)' })
      : tr({ fr: 'Valider la baie', en: 'Sign off the cabinet' });
  }

  /** the downtime budget: spent, and how fast it goes now */
  private showDowntime(ev: Evaluation, ctl: Controller | null, level: LevelDef | null): void {
    const el = $('#cuts'), w = ctl?.world;
    el.style.display = level?.downtime === undefined ? 'none' : '';
    if (!w || level?.downtime === undefined) return;
    const rate = [...w.maintenance.live].reduce((sum, i) => sum + (w.circuitUp(i) ? 0 : w.maintenance.cutCost(i)), 0);
    const percent = Math.min(100, (100 * ev.downtime) / ev.budget);
    el.innerHTML = `⚡ ${tr({ fr: 'Interruption', en: 'Downtime' })} <b>${Math.round(ev.downtime)}/${ev.budget}</b>${rate > 0 ? ` <em>+${formatCost(rate)}/s</em>` : ''}<div class="bar"><div class="fill" style="width:${percent}%"></div></div>`;
    el.className = ev.downtime > ev.budget ? 'full' : rate > 0 ? 'some' : '';
    el.title = ev.downtime > ev.budget
      ? tr({ fr: 'Incident : le budget d\'interruption est dépassé, ★★★ n\'est plus possible.', en: 'Incident: the downtime budget is overrun, ★★★ is out of reach.' })
      : tr({
        fr: 'Budget d\'interruption : chaque seconde où une liaison ⚡ est coupée coûte le poids de son service (survolez un service du plan). Au-delà du budget, plus de ★★★.',
        en: 'Downtime budget: every second a ⚡ link is cut costs its service\'s weight (hover a service on the schedule). Beyond the budget, no more ★★★.',
      });
  }

  /** the three stars: each goal, reached or not, with what is still wrong */
  private showGoals(ev: Evaluation): void {
    const goals = starGoals(ev);
    const line = (stars: number, cls: string, label: string, progress = '', detail = '', title = '') =>
      `<li class="${cls}"${title ? ` title="${title}"` : ''}><span class="s">${'★'.repeat(stars)}</span><span class="l">${label}</span><span class="p">${progress}</span>${detail ? `<span class="d">${detail}</span>` : ''}</li>`;
    const items = goals.map((g) => {
      const text = starGoalText(g);
      const cls = isGoalMet(g) ? 'met' : g.kind === 'budget' ? 'lost' : '';
      const title = g.kind === 'tidy' ? tr({ fr: 'Un câble rangé ne pend nulle part de plus de 20 cm hors des supports, ne passe devant aucun autre port, et n\'est ni tendu ni plié.', en: 'A tidy cord hangs nowhere more than 20 cm out of the supports, crosses no other port, and is neither taut nor kinked.' }) : '';
      return line(g.stars, cls, text.label, text.progress, text.detail, title);
    });
    if (!goals.some((g) => g.stars === 3)) items.push(line(3, 'none', tr({ fr: 'Aucune consigne de plus : ★★★ vient avec ★★', en: 'Nothing more asked: ★★★ comes with ★★' })));
    $('#goal-list').innerHTML = items.join('');
  }
}

/** a link's tidy check: tidy, or what its cord still lacks */
function tidyTip(s: CircuitStatus, strain: Strain | null): string {
  if (!s.connected) return tr({ fr: 'Pas encore branchée', en: 'Not plugged yet' });
  if (s.tidy) return tr({ fr: 'Câble rangé', en: 'Cord tidy' });
  const why = [
    s.routed ? '' : tr({ fr: 'pend hors des supports', en: 'hangs out of the supports' }),
    s.clear ? '' : tr({ fr: 'passe devant un port', en: 'crosses a port' }),
    strain ? strainLabel(strain) : '',
  ].filter(Boolean).join(', ');
  return tr({ fr: `Câble pas encore rangé : ${why}`, en: `Cord not tidy yet: ${why}` });
}

