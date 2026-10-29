// The side panel: the patching schedule (one row per link, with its four
// checks), the score bars, the downtime budget, the overall gauge, the
// readability note, the stars, and the Validate button.

import type { Controller } from '../play/controller';
import { FIBRE_COLORS } from '../game/cordTypes';
import { SERVICES } from '../game/services';
import { cleanliness, type Evaluation } from '../game/evaluation';
import { readabilityText, strainLabel } from './messages';
import { UNLOCK_STARS } from '../game/levels/campaign';
import type { LevelDef } from '../game/levels/levelDef';
import { formatCost } from './format';
import { starsHtml } from './dom';
import { $ } from '../lib/page';
import { fibreName, serviceName, serviceWhat } from './names';
import { tr } from './language';

/** how long the overall gauge flashes when it goes up (ms) */
const GAUGE_FLASH_MS = 700;

export class SchedulePanel {
  private rows: HTMLTableRowElement[] = [];
  /** the overall gauge as last shown (%), −1 before the first evaluation */
  private gaugePercent = -1;
  private gaugeTimer = 0;

  /** one row per link of the level's schedule; hovering a row focuses it, a click fetches its loose end */
  build(ctl: Controller, level: LevelDef): void {
    const w = ctl.world;
    const body = $('#plan tbody');
    body.innerHTML = '';
    this.gaugePercent = -1;
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
        <td><span class="chip" style="background:${FIBRE_COLORS[c.type]}" title="${fibreName(c.type)}">${c.type}</span></td>
        <td class="svc" title="${serviceName(c.service)}${tr({ fr: ' : ', en: ': ' })}${serviceWhat(c.service)}${cutTip}"><span class="dot" style="background:${service.color}"></span>${serviceName(c.service)}</td>
        <td class="st"><i class="s-conn" title="${tr({ fr: 'Branchée', en: 'Plugged' })}"></i><i class="s-route" title="${tr({ fr: 'Rangée', en: 'Routed' })}"></i><i class="s-clear" title="${tr({ fr: 'Façade dégagée', en: 'Front clear' })}"></i><i class="s-relax" title="${relaxedTip()}"></i></td>`;
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
      row.querySelector('.s-route')!.className = 's-route' + (s.routed ? ' ok' : '');
      row.querySelector('.s-clear')!.className = 's-clear' + (s.clear ? ' ok' : '');
      row.querySelector('.s-relax')!.className = 's-relax' + (s.relaxed ? ' ok' : '');
      const strain = s.cable >= 0 ? ev.cableStrain[s.cable] : null;
      row.querySelector('.s-relax')!.setAttribute('title', strain ? tr({ fr: `Cordon ${strainLabel(strain)}`, en: `Cord ${strainLabel(strain)}` }) : relaxedTip());
      row.classList.toggle('done', s.connected && s.routed && s.clear && s.relaxed);
      row.classList.toggle('cut', !!w && windowed && w.maintenance.isDown(i));
      row.classList.toggle('bypassed', !!w?.maintenance.bypassed.has(i));
      row.classList.toggle('called', w?.incidents.call?.link === i);
    });
    const n = ev.total;
    this.showDowntime(ev, ctl, level);
    setBar('#bar-conn', ev.connected, n);
    setBar('#bar-route', ev.routed, n);
    setBar('#bar-clear', ev.clear, n);
    setBar('#bar-relax', ev.relaxed, n);
    setBar('#bar-bundle', Math.min(ev.bundles, ev.bundlesNeeded), ev.bundlesNeeded);
    $('#bar-bundle').style.display = ev.bundlesNeeded ? '' : 'none';
    this.showGauge(cleanliness(ev));
    $('#note').innerHTML = `${tr({ fr: 'Lisibilité', en: 'Readability' })} <b>${ev.readability.note}</b>`;
    $('#note').title = ev.readability.parts.map((p) => { const t = readabilityText(p); return tr({ fr: `${t.name} : ${Math.round(p.value * 100)} % (${t.tip})`, en: `${t.name}: ${Math.round(p.value * 100)}% (${t.tip})` }); }).join('\n');
    $('#live-stars').innerHTML = starsHtml(ev.stars);
    const validate = $<HTMLButtonElement>('#btn-validate');
    validate.disabled = ev.stars < 1;
    validate.classList.toggle('ready', ev.stars >= 1);
    validate.textContent = ev.stars < 1 ? tr({ fr: `Branchez les ${n} liaisons du plan`, en: `Plug the ${n} links of the schedule` })
      : ev.stars < UNLOCK_STARS ? tr({ fr: 'Valider (rangez pour ★★)', en: 'Sign off (tidy up for ★★)' })
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

  /** the overall gauge (0..1); it flashes when it goes up */
  private showGauge(value: number): void {
    const el = $('#clean');
    const percent = Math.round(value * 100);
    el.querySelector('b')!.textContent = tr({ fr: `${percent} %`, en: `${percent}%` });
    (el.querySelector('.fill') as HTMLElement).style.width = `${percent}%`;
    if (this.gaugePercent >= 0 && percent > this.gaugePercent) {
      el.classList.add('bump');
      clearTimeout(this.gaugeTimer);
      this.gaugeTimer = window.setTimeout(() => el.classList.remove('bump'), GAUGE_FLASH_MS);
    }
    this.gaugePercent = percent;
  }
}

function relaxedTip(): string {
  return tr({ fr: 'Ni tendu ni plié', en: 'Neither taut nor kinked' });
}

/** a score bar: `value` of `total` */
function setBar(selector: string, value: number, total: number): void {
  const el = $(selector);
  (el.querySelector('.fill') as HTMLElement).style.width = `${total ? (100 * value) / total : 0}%`;
  el.querySelector('.val')!.textContent = `${value}/${total}`;
  el.classList.toggle('full', value === total);
}
