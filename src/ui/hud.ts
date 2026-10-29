import type { Controller, Tool } from '../play/controller';
import { CATALOGUE, FIBRE_NAMES } from '../game/cordTypes';
import { LEVELS } from '../game/levels/campaign';
import { SERVICES } from '../game/services';
import { UNLOCK_STARS, type LevelDef } from '../game/levels/levelDef';
import { formatCost, formatTime } from '../format';
import { STRAIN_LABELS, cleanliness, type Evaluation } from '../game/evaluation';
import { FIBRE_COLORS } from '../render/cableView';
import { isMuted, setMuted, sfx } from '../audio/sfx';
import { load, save } from '../storage';
import { iconFingerManager, iconHand, iconRoute, iconStock, iconVelcro } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const TOOLS: { tool: Tool; key: string; name: string; icon: string; help: string }[] = [
  { tool: 'hand', key: '1', name: 'Main', icon: iconHand(), help: 'Saisir, tirer, débrancher et brancher ; un connecteur lâché en l\'air y reste accroché (Alt en lâchant : il pend). Survol d\'un câble : <b>T</b> le trace, <b>Suppr</b> le jette au bac. Maj : profondeur ; Espace : pincer un coude ; E : l\'autre main. Glisser dans le vide : déplacer la vue.' },
  { tool: 'route', key: 'c', name: 'Chemin', icon: iconRoute(), help: 'Partez d\'un câble et tracez son chemin par-dessus les guides, dans l\'ordre où il doit les traverser ; finissez sur un port libre pour l\'y brancher. Relâchez : le câble est posé le long du chemin, par l\'ouverture de chaque guide.' },
  { tool: 'supports', key: '2', name: 'Supports', icon: iconFingerManager(), help: 'Cliquez une unité vide : un guide-câbles. Un couloir latéral : une goulotte (Maj : un anneau). Cliquez un support posé pour le retirer.' },
  { tool: 'velcro', key: '3', name: 'Velcro', icon: iconVelcro(), help: 'Tracez un trait <b>en travers</b> des câbles à serrer : ceux qu\'il croise s\'allument, et le velcro les serre là où le trait les croise. Il se place là où le plus de câbles passent côte à côte ; un seul service par faisceau, c\'est plus lisible. Cliquez sur un velcro pour l\'enlever.' },
];

const fmtLen = (m: number) => (m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(m % 1 ? 2 : 0).replace('.', ',')} m`);

export class Hud {
  ctl: Controller | null = null;
  level: LevelDef | null = null;
  progress = load('progress');
  private planRows: HTMLTableRowElement[] = [];
  private toastTimer = 0;

  constructor(private start: (level: LevelDef) => void) {
    this.buildToolbar();
    $('#btn-menu').onclick = () => this.showMenu();
    $('#btn-restart').onclick = () => this.level && this.start(this.level);
    $('#btn-view').onclick = () => this.ctl?.stage.resetView();
    $('#btn-sound').onclick = () => this.toggleSound();
    $('#btn-help').onclick = () => this.level && this.showBrief(this.level);
    $('#btn-validate').onclick = () => this.validate();
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  // ------------------------------------------------------------- menus

  showMenu(): void {
    const box = $('#menu-levels');
    box.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const unlocked = i === 0 || (this.progress.stars[LEVELS[i - 1].id] ?? 0) >= UNLOCK_STARS || (this.progress.stars[lv.id] ?? 0) > 0;
      const stars = this.progress.stars[lv.id] ?? 0;
      const card = document.createElement('button');
      card.className = 'level-card' + (unlocked ? '' : ' locked');
      const best = this.progress.times[lv.id];
      card.innerHTML = `<div class="num">${i + 1}</div><div class="t">${lv.title}</div>
        <div class="meta">${lv.cables} câbles${lv.labels ? ' · étiquettes' : ''}</div>
        <div class="stars">${starsHtml(stars)}${this.progress.challenges[lv.id] ? '<span class="par" title="Défi chrono réussi">⏱</span>' : ''}</div>${best ? `<div class="best">${formatTime(best)}</div>` : ''}
        ${unlocked ? '' : `<div class="lock">${'★'.repeat(UNLOCK_STARS)} au niveau ${i} pour l'ouvrir</div>`}`;
      if (unlocked) card.onclick = () => { this.hide('#menu'); this.start(lv); };
      box.appendChild(card);
    });
    this.show('#menu');
  }

  showBrief(level: LevelDef): void {
    $('#brief-title').textContent = level.title;
    $('#brief-text').textContent = level.brief;
    const tips = [...(level.tips ?? [])];
    if (level.par) tips.push(`<b>Défi chrono</b> : ★★★ en moins de ${formatTime(level.par)}.`);
    tips.push('<b>Ni tendu ni plié</b> : un cordon bien plus court que son chemin rangé, ou une fibre pliée en angle vif, ne vaut pas ★★★.');
    if (level.downtime !== undefined) {
      const used = [...new Set(this.ctl?.world.circuits.map((c) => c.service) ?? [])].sort((a, b) => SERVICES[b].weight - SERVICES[a].weight);
      tips.unshift(`<b>Fenêtre de maintenance</b> : les liaisons ⚡ sont en production. Chaque seconde où l'une est coupée coûte le poids de son service sur un budget de <b>${level.downtime} pts</b> : ${used.map((i) => `<span class="svc-chip" style="--c:${SERVICES[i].color}" title="${SERVICES[i].what}">${SERVICES[i].name} ×${formatCost(SERVICES[i].weight).replace(/ pts?/, '')}</span>`).join(' ')}. Budget dépassé : incident, plus de ★★★.`
        + (level.bypass ? ` Vous avez <b>${level.bypass} dérivation${level.bypass > 1 ? 's' : ''}</b> : posée sur une liaison (cliquez son ⚡ dans le plan), elle porte son trafic pendant qu'on la recâble.` : ''));
    }
    tips.push('Les voyants des ports : vert = liaison conforme au plan, orange = mauvais port.');
    $('#brief-tips').innerHTML = tips.map((t) => `<li>${t}</li>`).join('');
    const inv = level.inventory;
    const parts = [
      inv.hmgr ? `${inv.hmgr} guide-câbles` : '', inv.duct ? `${inv.duct} goulottes` : '',
      inv.vring ? `${inv.vring} anneaux` : '', inv.velcro ? `${inv.velcro} velcros` : '',
    ].filter(Boolean);
    const cords = (level.cords ?? []).map(([L, n]) => `${n} × ${fmtLen(L)}`);
    if (cords.length) parts.push(`cordons neufs : ${cords.join(', ')}`);
    $('#brief-inv').textContent = parts.length ? `Matériel : ${parts.join(', ')}.` : '';
    // the clock waits for the player to read
    if (this.ctl) this.ctl.running = false;
    $('#brief-go').onclick = () => {
      this.hide('#brief');
      const ctl = this.ctl;
      if (!ctl) return;
      // a first reading of a level with supports to place: the preparation
      if (!this.prepared && !level.tutorial && (['hmgr', 'duct', 'vring'] as const).some((k) => (level.inventory[k] ?? 0) > 0)) this.prepare();
      else if (!ctl.preparing) ctl.running = true;
      this.prepared = true;
    };
    this.show('#brief');
  }

  /** the preparation was offered for this level already */
  private prepared = false;

  /** the cabinet stands still and the clock waits while the supports are placed */
  private prepare(): void {
    const ctl = this.ctl!;
    ctl.preparing = true;
    ctl.running = false;
    this.selectTool('supports');
    $('#prep').classList.add('on');
    $('#prep-go').onclick = () => {
      ctl.startWork();
      $('#prep').classList.remove('on');
      this.selectTool('hand');
    };
  }

  attach(ctl: Controller, level: LevelDef): void {
    this.prepared = false;
    $('#prep').classList.remove('on');
    this.ctl = ctl;
    this.level = level;
    $('#level-title').textContent = level.title;
    this.hide('#result');
    this.clean = -1;
    this.buildPlan();
    this.refreshInventory();
    this.selectTool('hand');
    this.onEval(ctl.lastEval);
  }

  // ----------------------------------------------------------- toolbar

  private buildToolbar(): void {
    const bar = $('#toolbar');
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = t.tool;
      b.title = `${t.name} (${t.key}) — ${t.help}`;
      b.innerHTML = `${t.icon}<span class="name">${t.name}</span><span class="key">${t.key}</span>${t.tool === 'supports' || t.tool === 'velcro' ? '<span class="count"></span>' : ''}`;
      b.onclick = () => this.selectTool(t.tool);
      bar.appendChild(b);
    }
    const stock = document.createElement('button');
    stock.className = 'tool stock';
    stock.title = 'Stock (0) — prendre un cordon neuf, il arrive dans le bac au sol';
    stock.innerHTML = `${iconStock()}<span class="name">Stock</span><span class="key">0</span>`;
    stock.onclick = () => this.showStock();
    bar.appendChild(stock);
    // menus close on a click elsewhere
    window.addEventListener('pointerdown', (e) => {
      for (const id of ['stock-menu']) {
        const m = document.getElementById(id);
        if (m && m.classList.contains('on') && !m.contains(e.target as Node) && !(e.target as HTMLElement).closest('.stock')) m.classList.remove('on');
      }
    }, true);
  }

  /** new cords from the stock */
  private showStock(): void {
    const ctl = this.ctl, lv = this.level;
    if (!ctl || !lv) return;
    const m = $('#stock-menu');
    const types = [...new Set(ctl.world.circuits.map((c) => c.type))];
    let type = types[0];
    let color: string | undefined = lv.colorByService ? SERVICES[0].color : undefined;
    const render = () => {
      const stock = ctl.world.cordStock;
      const bypass = ctl.world.inventory.bypass;
      m.innerHTML = `<div class="h">Stock de cordons neufs<span>Ils arrivent enroulés dans le bac, au sol. Remplacer un cordon branché coupe sa liaison le temps de changer.</span></div>
        ${types.length > 1 ? `<div class="types">${types.map((t) => `<button data-t="${t}" class="${t === type ? 'cur' : ''}"><i style="background:${FIBRE_COLORS[t]}"></i>${FIBRE_NAMES[t]}</button>`).join('')}</div>` : ''}
        ${type === 'CU' && lv.colorByService ? `<div class="colors">${SERVICES.slice(0, Math.max(1, lv.services)).map((sv) => `<button data-c="${sv.color}" class="${sv.color === color ? 'cur' : ''}" style="background:${sv.color}" title="${sv.name}"></button>`).join('')}</div>` : ''}
        <div class="grid">${CATALOGUE.map((L) => `<button data-l="${L}" ${(stock.get(L) ?? 0) > 0 ? '' : 'disabled'}>${fmtLen(L)}<small>×${stock.get(L) ?? 0}</small></button>`).join('')}</div>
        ${lv.bypass ? `<div class="h foot">Dérivations : <b>${bypass}</b><span>Cliquez le ⚡ d'une liaison du plan.</span></div>` : ''}`;
      m.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => { b.onclick = () => { type = b.dataset.t as typeof type; render(); }; });
      m.querySelectorAll<HTMLButtonElement>('[data-c]').forEach((b) => { b.onclick = () => { color = b.dataset.c; render(); }; });
      m.querySelectorAll<HTMLButtonElement>('[data-l]').forEach((b) => {
        b.onclick = () => {
          if (!ctl.newCord(type, Number(b.dataset.l), type === 'CU' ? color : undefined)) return;
          this.toast(`Cordon ${FIBRE_NAMES[type]} de ${fmtLen(Number(b.dataset.l))} dans le bac.`);
          render();
        };
      });
    };
    render();
    const r = document.querySelector('.tool.stock')!.getBoundingClientRect();
    m.style.left = `${r.right + 10}px`;
    m.style.top = `${Math.min(r.top, window.innerHeight - 260)}px`;
    m.classList.toggle('on');
  }

  selectTool(t: Tool): void {
    this.ctl?.setTool(t);
    document.querySelectorAll<HTMLElement>('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    $('#hint').innerHTML = TOOLS.find((x) => x.tool === t)!.help;
  }

  refreshInventory(): void {
    const inv = this.ctl?.world.inventory;
    if (!inv) return;
    const sup = $('.tool[data-tool="supports"]'), vel = $('.tool[data-tool="velcro"]');
    const parts = ([['hmgr', 'guide-câbles'], ['duct', 'goulottes'], ['vring', 'anneaux']] as const).filter(([k]) => (this.level!.inventory[k] ?? 0) > 0);
    sup.querySelector('.count')!.textContent = parts.map(([k]) => inv[k]).join('·');
    sup.title = `Supports (2) — en stock : ${parts.map(([k, n]) => `${inv[k]} ${n}`).join(', ') || 'aucun'}. ${TOOLS.find((t) => t.tool === 'supports')!.help}`;
    const removable = this.ctl!.world.rack.items.some((i) => !i.locked);
    sup.classList.toggle('empty', parts.every(([k]) => inv[k] <= 0) && !removable);
    sup.style.display = parts.length || removable ? '' : 'none';
    vel.querySelector('.count')!.textContent = String(inv.velcro);
    vel.classList.toggle('empty', inv.velcro <= 0);
    vel.style.display = (this.level!.inventory.velcro ?? 0) > 0 ? '' : 'none';
  }

  // -------------------------------------------------------------- plan

  private buildPlan(): void {
    const w = this.ctl!.world;
    const tb = $('#plan tbody');
    tb.innerHTML = '';
    const windowed = this.level!.downtime !== undefined;
    this.planRows = w.circuits.map((c, i) => {
      const tr = document.createElement('tr');
      const svc = SERVICES[c.service];
      const live = windowed && w.live.has(i);
      const prodTip = `En production : chaque seconde coupée coûte ${formatCost(svc.weight)}`;
      const prod = !live ? '' : this.level!.bypass
        ? `<button class="prod bypass" title="${prodTip}. Cliquez pour lui poser une dérivation : le trafic passe par un chemin provisoire pendant que vous la recâblez (re-cliquez pour la retirer).">⚡</button>`
        : `<span class="prod" title="${prodTip}">⚡</span>`;
      tr.innerHTML = `<td class="n">${i + 1}${prod}</td><td class="ports">${c.a} <span class="arrow">↔</span> ${c.b}</td>
        <td><span class="chip" style="background:${FIBRE_COLORS[c.type]}" title="${FIBRE_NAMES[c.type]}">${c.type}</span></td>
        <td class="svc" title="${svc.name} : ${svc.what}${windowed ? ` — coupée, ${formatCost(svc.weight)} par seconde` : ''}"><span class="dot" style="background:${svc.color}"></span>${svc.name}</td>
        <td class="st"><i class="s-conn" title="Branchée"></i><i class="s-route" title="Rangée"></i><i class="s-clear" title="Façade dégagée"></i><i class="s-relax" title="Ni tendu ni plié"></i></td>`;
      tr.onmouseenter = () => this.ctl?.focus(i);
      tr.onmouseleave = () => this.ctl?.focus(-1);
      tr.title = 'Cliquez : son bout libre sort du tas et s\'accroche sous son port';
      tr.onclick = () => this.ctl?.fetchEnd(i);
      tr.querySelector<HTMLButtonElement>('.bypass')?.addEventListener('click', (e) => { e.stopPropagation(); this.ctl?.toggleBypass(i); });
      tb.appendChild(tr);
      return tr;
    });
  }

  onEval(ev: Evaluation): void {
    ev.circuits.forEach((s, i) => {
      const tr = this.planRows[i];
      if (!tr) return;
      tr.querySelector('.s-conn')!.className = 's-conn' + (s.connected ? ' ok' : '');
      tr.querySelector('.s-route')!.className = 's-route' + (s.routed ? ' ok' : '');
      tr.querySelector('.s-clear')!.className = 's-clear' + (s.clear ? ' ok' : '');
      tr.querySelector('.s-relax')!.className = 's-relax' + (s.relaxed ? ' ok' : '');
      tr.querySelector('.s-relax')!.setAttribute('title', s.cable >= 0 && ev.cableStrain[s.cable] ? `Cordon ${STRAIN_LABELS[ev.cableStrain[s.cable]!]}` : 'Ni tendu ni plié');
      tr.classList.toggle('done', s.connected && s.routed && s.clear && s.relaxed);
      const w = this.ctl?.world;
      tr.classList.toggle('cut', !!w && this.level!.downtime !== undefined && w.live.has(i) && !w.circuitUp(i));
      tr.classList.toggle('bypassed', !!w?.bypassed.has(i));
    });
    const n = ev.total;
    this.showDowntime(ev);
    setBar('#bar-conn', ev.connected, n);
    setBar('#bar-route', ev.routed, n);
    setBar('#bar-clear', ev.clear, n);
    setBar('#bar-relax', ev.relaxed, n);
    setBar('#bar-bundle', Math.min(ev.bundles, ev.bundlesNeeded), ev.bundlesNeeded);
    $('#bar-bundle').style.display = ev.bundlesNeeded ? '' : 'none';
    this.showClean(cleanliness(ev));
    $('#note').innerHTML = `Lisibilité <b>${ev.readability.note}</b>`;
    $('#note').title = ev.readability.parts.map((p) => `${p.name} : ${Math.round(p.value * 100)} % (${p.tip})`).join('\n');
    $('#live-stars').innerHTML = starsHtml(ev.stars);
    const v = $<HTMLButtonElement>('#btn-validate');
    v.disabled = ev.stars < 1;
    v.classList.toggle('ready', ev.stars >= 1);
    v.textContent = ev.stars < 1 ? `Branchez les ${n} liaisons du plan` : ev.stars < UNLOCK_STARS ? 'Valider (rangez pour ★★)' : 'Valider la baie';
  }

  /** the downtime budget: spent, and how fast it goes now */
  private showDowntime(ev: Evaluation): void {
    const el = $('#cuts'), w = this.ctl?.world;
    el.style.display = this.level?.downtime === undefined ? 'none' : '';
    if (!w || this.level?.downtime === undefined) return;
    const rate = [...w.live].reduce((a, i) => a + (w.circuitUp(i) ? 0 : w.cutCost(i)), 0);
    const pct = Math.min(100, (100 * ev.downtime) / ev.budget);
    el.innerHTML = `⚡ Interruption <b>${Math.round(ev.downtime)}/${ev.budget}</b>${rate > 0 ? ` <em>+${formatCost(rate)}/s</em>` : ''}<div class="bar"><div class="fill" style="width:${pct}%"></div></div>`;
    el.className = ev.downtime > ev.budget ? 'full' : rate > 0 ? 'some' : '';
    el.title = ev.downtime > ev.budget
      ? 'Incident : le budget d\'interruption est dépassé, ★★★ n\'est plus possible.'
      : 'Budget d\'interruption : chaque seconde où une liaison ⚡ est coupée coûte le poids de son service (survolez un service du plan). Au-delà du budget, plus de ★★★.';
  }

  private clean = -1;
  private cleanTimer = 0;

  /** the overall gauge; it flashes when it goes up */
  private showClean(v: number): void {
    const el = $('#clean');
    const pct = Math.round(v * 100);
    el.querySelector('b')!.textContent = `${pct} %`;
    (el.querySelector('.fill') as HTMLElement).style.width = `${pct}%`;
    if (this.clean >= 0 && pct > this.clean) {
      el.classList.add('bump');
      clearTimeout(this.cleanTimer);
      this.cleanTimer = window.setTimeout(() => el.classList.remove('bump'), 700);
    }
    this.clean = pct;
  }

  private validate(): void {
    const ctl = this.ctl, lv = this.level;
    if (!ctl || !lv) return;
    const ev = ctl.world.evaluate();
    if (ev.stars < 1) return;
    ctl.running = false;
    const t = ctl.elapsed;
    const prev = this.progress.stars[lv.id] ?? 0;
    this.progress.stars[lv.id] = Math.max(prev, ev.stars);
    if (!this.progress.times[lv.id] || t < this.progress.times[lv.id]) this.progress.times[lv.id] = t;
    const note = ev.readability.note, bestNote = this.progress.notes[lv.id];
    this.progress.notes[lv.id] = Math.max(bestNote ?? 0, note);
    const parWon = !!lv.par && ev.stars === 3 && t <= lv.par;
    if (parWon) this.progress.challenges[lv.id] = true;
    save('progress', this.progress);
    sfx.win();
    $('#result-stars').innerHTML = starsHtml(ev.stars, true);
    $('#result-time').textContent = `Temps : ${formatTime(t)}`;
    $<HTMLImageElement>('#ba-before').src = ctl.before ?? '';
    $<HTMLImageElement>('#ba-after').src = ctl.capture();
    const lines = [
      `Liaisons branchées : ${ev.connected}/${ev.total}`,
      `Liaisons rangées : ${ev.routed}/${ev.total}`,
      `Façade dégagée : ${ev.clear}/${ev.total}`,
      `Ni tendus ni pliés : ${ev.relaxed}/${ev.total}`,
    ];
    if (ev.bundlesNeeded) lines.push(`Faisceaux : ${Math.min(ev.bundles, ev.bundlesNeeded)}/${ev.bundlesNeeded}`);
    if (lv.downtime !== undefined) lines.push(ev.downtime > ev.budget ? `<span class="bad">Incident : ${Math.round(ev.downtime)} pts d'interruption pour un budget de ${ev.budget}.</span>` : `Interruption : ${Math.round(ev.downtime)} pts sur ${ev.budget}.`);
    if (ev.stars < 3) lines.push(ev.stars === 1 ? '★★ : rangez au moins 70 % des liaisons, façade dégagée à 85 %.' : '★★★ : tout rangé, façade entièrement dégagée, aucun cordon tendu ni plié' + (ev.bundlesNeeded ? `, ${ev.bundlesNeeded} faisceaux` : '') + (lv.downtime !== undefined ? ', budget d\'interruption tenu' : '') + '.');
    if (lv.par) lines.push(parWon ? `⏱ Défi chrono réussi : ★★★ en moins de ${formatTime(lv.par)} !` : `⏱ Défi chrono : ★★★ en moins de ${formatTime(lv.par)}${this.progress.challenges[lv.id] ? ' (déjà réussi)' : ''}.`);
    $('#result-lines').innerHTML = lines.map((l) => `<li>${l}</li>`).join('');
    $('#result-note').innerHTML = `<div class="grade"><s>${ctl.startNote}</s><span class="to">→</span><b>${note}</b><span>Lisibilité${bestNote !== undefined ? ` · record ${Math.max(bestNote, note)}${note > bestNote ? ' — nouveau record !' : ''}` : ''}</span></div>`
      + ev.readability.parts.map((p) => `<div class="part"><span>${p.name}</span><div class="bar"><div class="fill" style="width:${Math.round(p.value * 100)}%"></div></div><i>${p.tip}</i></div>`).join('');
    const idx = LEVELS.findIndex((l) => l.id === lv.id);
    const next = idx >= 0 && idx + 1 < LEVELS.length ? LEVELS[idx + 1] : null;
    const nb = $<HTMLButtonElement>('#result-next');
    nb.style.display = next ? '' : 'none';
    // the next level opens on a tidy cabinet, not on a merely connected one
    const open = Math.max(prev, ev.stars) >= UNLOCK_STARS;
    nb.disabled = !open;
    nb.textContent = open ? 'Niveau suivant →' : `${'★'.repeat(UNLOCK_STARS)} pour le niveau suivant`;
    if (next && open) nb.onclick = () => { this.hide('#result'); this.start(next); };
    $('#result-again').onclick = () => { this.hide('#result'); ctl.running = true; };
    $('#result-menu').onclick = () => { this.hide('#result'); this.showMenu(); };
    this.show('#result');
  }

  // ------------------------------------------------------------ others

  /** a hint for the current action, or back to the tool's help */
  hint(text: string | null): void {
    const t = TOOLS.find((x) => x.tool === this.ctl?.tool);
    $('#hint').innerHTML = text ?? t?.help ?? '';
    $('#hint').classList.toggle('live', !!text);
  }

  onHover(text: string | null, x: number, y: number): void {
    const tip = $('#tooltip');
    if (!text) { tip.style.display = 'none'; return; }
    tip.innerHTML = text;
    tip.style.display = 'block';
    tip.style.left = `${x + 16}px`;
    tip.style.top = `${y + 14}px`;
  }

  toast(text: string): void {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('on'), 2200);
  }

  stats(text: string): void {
    $('#stats').textContent = text;
  }

  tick(): void {
    if (this.ctl) $('#timer').textContent = formatTime(this.ctl.elapsed);
  }

  private toggleSound(): void {
    setMuted(!isMuted());
    $('#btn-sound').classList.toggle('off', isMuted());
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.ctl || document.querySelector('.overlay.on')) return;
    const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
    if (t) { this.selectTool(t.tool); return; }
    if (e.key === '0') { this.showStock(); return; }
    if (e.key === 'Escape') this.selectTool('hand');
    else if (e.key === 'r' || e.key === 'R') this.ctl.stage.resetView();
    else if (e.key === 'm' || e.key === 'M') this.toggleSound();
    else if (e.key === 'F3' || e.key === '`') {
      e.preventDefault();
      this.ctl.debug = !this.ctl.debug;
      $('#stats').style.display = this.ctl.debug ? 'block' : 'none';
    }
  }

  private show(sel: string): void { $(sel).classList.add('on'); }
  private hide(sel: string): void { $(sel).classList.remove('on'); }
}

function setBar(sel: string, v: number, n: number): void {
  const el = $(sel);
  (el.querySelector('.fill') as HTMLElement).style.width = `${n ? (100 * v) / n : 0}%`;
  el.querySelector('.val')!.textContent = `${v}/${n}`;
  el.classList.toggle('full', v === n);
}

function starsHtml(n: number, big = false): string {
  let s = '';
  for (let i = 0; i < 3; i++) s += `<span class="star${i < n ? ' on' : ''}${big ? ' big' : ''}">★</span>`;
  return s;
}
