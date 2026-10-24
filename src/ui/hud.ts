import type { Controller, Tool } from '../game/controller';
import { FIBRE_NAMES, LEVELS, SERVICES, UNLOCK_STARS, type LevelDef } from '../game/levels';
import type { Evaluation } from '../game/world';
import { FIBRE_COLORS } from '../render/cableView';
import { isMuted, setMuted, sfx } from '../audio/sfx';
import { load, save } from '../storage';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const TOOLS: { tool: Tool; key: string; name: string; icon: string; stock?: 'hmgr' | 'duct' | 'vring' | 'velcro'; help: string }[] = [
  { tool: 'hand', key: '1', name: 'Main', icon: iconHand(), help: 'Saisir, tirer, débrancher et brancher les câbles (Maj en tirant : profondeur). Glisser dans le vide : déplacer la vue.' },
  { tool: 'hmgr', key: '2', name: 'Guide-câbles 1U', icon: iconHmgr(), stock: 'hmgr', help: 'Panneau à anneaux, dans une unité vide de la baie. Cliquez à nouveau pour le retirer.' },
  { tool: 'duct', key: '3', name: 'Goulotte', icon: iconDuct(), stock: 'duct', help: 'Goulotte verticale de 4U dans un couloir latéral. Cliquez à nouveau pour la retirer.' },
  { tool: 'vring', key: '4', name: 'Anneau', icon: iconRing(), stock: 'vring', help: 'Anneau de passage vertical dans un couloir latéral.' },
  { tool: 'velcro', key: '5', name: 'Velcro', icon: iconVelcro(), stock: 'velcro', help: 'Cliquez sur des câbles qui se touchent pour les attacher en faisceau. Cliquez sur un velcro pour l\'enlever.' },
  { tool: 'label', key: '6', name: 'Étiquette', icon: iconLabel(), help: 'Auto : cliquez un cordon branché sur sa liaison, ses deux bouts prennent la couleur de son service. Ou choisissez une couleur et cliquez près d\'un connecteur (re-cliquez pour l\'enlever).' },
  { tool: 'length', key: '7', name: 'Longueur', icon: iconRuler(), help: 'Cliquez sur un cordon pour le remplacer par un cordon d\'une autre longueur, sans le débrancher.' },
  { tool: 'trace', key: '8', name: 'Traceur', icon: iconTrace(), help: 'Cliquez sur un câble : il clignote en rouge et ses deux ports s\'entourent, pour savoir où il va vraiment.' },
  { tool: 'deposit', key: '9', name: 'Déposer', icon: iconBin(), help: 'Cliquez sur un câble : il est débranché, enroulé et jeté dans le bac au sol. Reprenez-le à la main quand vous voulez.' },
];

/** standard patch cord lengths (m) */
const CATALOGUE = [0.15, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5];
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
        <div class="stars">${starsHtml(stars)}${this.progress.challenges[lv.id] ? '<span class="par" title="Défi chrono réussi">⏱</span>' : ''}</div>${best ? `<div class="best">${fmtTime(best)}</div>` : ''}
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
    if (level.labels) tips.push('Étiquettes obligatoires : la couleur du service, aux deux extrémités de chaque liaison (l\'étiquette Auto le fait en un clic sur un cordon bien branché).');
    if (level.par) tips.push(`<b>Défi chrono</b> : ★★★ en moins de ${fmtTime(level.par)}.`);
    if (level.maxCuts !== undefined) tips.unshift(`<b>Fenêtre de maintenance</b> : les liaisons ⚡ sont en production. Au plus ${level.maxCuts} coupée${level.maxCuts > 1 ? 's' : ''} en même temps : recâblez-les une par une.`);
    tips.push('Les voyants des ports : vert = liaison conforme au plan, orange = mauvais port.');
    $('#brief-tips').innerHTML = tips.map((t) => `<li>${t}</li>`).join('');
    const inv = level.inventory;
    const parts = [
      inv.hmgr ? `${inv.hmgr} guide-câbles` : '', inv.duct ? `${inv.duct} goulottes` : '',
      inv.vring ? `${inv.vring} anneaux` : '', inv.velcro ? `${inv.velcro} velcros` : '',
    ].filter(Boolean);
    $('#brief-inv').textContent = parts.length ? `Matériel : ${parts.join(', ')}.` : '';
    // the clock waits for the player to read
    if (this.ctl) this.ctl.running = false;
    $('#brief-go').onclick = () => { this.hide('#brief'); if (this.ctl) this.ctl.running = true; };
    this.show('#brief');
  }

  attach(ctl: Controller, level: LevelDef): void {
    this.ctl = ctl;
    this.level = level;
    $('#level-title').textContent = level.title;
    this.hide('#result');
    this.clean = -1;
    this.buildPlan();
    this.buildSwatches();
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
      b.innerHTML = `${t.icon}<span class="name">${t.name}</span><span class="key">${t.key}</span>${t.stock ? '<span class="count"></span>' : ''}`;
      b.onclick = () => this.selectTool(t.tool);
      bar.appendChild(b);
    }
    const sw = document.createElement('div');
    sw.id = 'swatches';
    bar.appendChild(sw);
    const stock = document.createElement('button');
    stock.className = 'tool stock';
    stock.title = 'Stock (0) — prendre un cordon neuf, il arrive dans le bac au sol';
    stock.innerHTML = `${iconStock()}<span class="name">Stock</span><span class="key">0</span>`;
    stock.onclick = () => this.showStock();
    bar.appendChild(stock);
    // menus close on a click elsewhere
    window.addEventListener('pointerdown', (e) => {
      for (const id of ['length-menu', 'stock-menu']) {
        const m = document.getElementById(id);
        if (m && m.classList.contains('on') && !m.contains(e.target as Node) && !(e.target as HTMLElement).closest('.stock')) m.classList.remove('on');
      }
    }, true);
  }

  /** the cord catalogue, for the cord picked with the length tool */
  showLengthMenu(c: number, x: number, y: number): void {
    const ctl = this.ctl;
    if (!ctl) return;
    const cur = ctl.world.cableLength(c), min = ctl.world.minCableLength(c);
    const fit = ctl.world.tidyLength(c);
    const m = $('#length-menu');
    m.innerHTML = `<div class="h">Cordon actuel : <b>${fmtLen(cur)}</b><span>minimum pour relier ses deux bouts : ${fmtLen(min)}</span></div>
      ${fit !== null && fit >= min ? `<button class="fit" data-l="${fit}" title="La longueur de sa route rangée, par les guide-câbles et les goulottes posés">Ajuster au rangement : <b>${fmtLen(fit)}</b></button>` : ''}
      <div class="grid">${CATALOGUE.map((L) => `<button data-l="${L}" ${L < min ? 'disabled' : ''} class="${Math.abs(L - cur) < 0.03 ? 'cur' : ''}">${fmtLen(L)}</button>`).join('')}</div>
      <div class="fine"><button data-d="-0.05">− 5 cm</button><button data-d="0.05">+ 5 cm</button></div>`;
    m.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => {
        const L = b.dataset.l ? Number(b.dataset.l) : cur + Number(b.dataset.d);
        if (ctl.setLength(c, L)) m.classList.remove('on');
      };
    });
    m.style.left = `${Math.min(x + 12, window.innerWidth - 260)}px`;
    m.style.top = `${Math.min(y + 12, window.innerHeight - 200)}px`;
    m.classList.add('on');
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
      m.innerHTML = `<div class="h">Stock de cordons neufs<span>Ils arrivent enroulés dans le bac, au sol.</span></div>
        ${types.length > 1 ? `<div class="types">${types.map((t) => `<button data-t="${t}" class="${t === type ? 'cur' : ''}"><i style="background:${FIBRE_COLORS[t]}"></i>${FIBRE_NAMES[t]}</button>`).join('')}</div>` : ''}
        ${type === 'CU' && lv.colorByService ? `<div class="colors">${SERVICES.slice(0, Math.max(1, lv.services)).map((sv) => `<button data-c="${sv.color}" class="${sv.color === color ? 'cur' : ''}" style="background:${sv.color}" title="${sv.name}"></button>`).join('')}</div>` : ''}
        <div class="grid">${CATALOGUE.map((L) => `<button data-l="${L}">${fmtLen(L)}</button>`).join('')}</div>`;
      m.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => { b.onclick = () => { type = b.dataset.t as typeof type; render(); }; });
      m.querySelectorAll<HTMLButtonElement>('[data-c]').forEach((b) => { b.onclick = () => { color = b.dataset.c; render(); }; });
      m.querySelectorAll<HTMLButtonElement>('[data-l]').forEach((b) => {
        b.onclick = () => { ctl.newCord(type, Number(b.dataset.l), type === 'CU' ? color : undefined); this.toast(`Cordon ${FIBRE_NAMES[type]} de ${fmtLen(Number(b.dataset.l))} dans le bac.`); };
      });
    };
    render();
    const r = document.querySelector('.tool.stock')!.getBoundingClientRect();
    m.style.left = `${r.right + 10}px`;
    m.style.top = `${Math.min(r.top, window.innerHeight - 260)}px`;
    m.classList.toggle('on');
  }

  private buildSwatches(): void {
    const sw = $('#swatches');
    sw.innerHTML = '';
    const pick = (i: number) => { this.ctl!.labelColor = i; this.selectTool('label'); this.markSwatch(); };
    const auto = document.createElement('button');
    auto.className = 'swatch auto';
    auto.textContent = 'A';
    auto.title = 'Auto : la couleur du service de la liaison, aux deux bouts';
    auto.onclick = () => pick(-1);
    sw.appendChild(auto);
    const n = Math.max(1, this.level!.services);
    for (let i = 0; i < n; i++) {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = SERVICES[i].color;
      b.title = SERVICES[i].name;
      b.onclick = () => pick(i);
      sw.appendChild(b);
    }
    this.ctl!.labelColor = -1;
    this.markSwatch();
  }

  private markSwatch(): void {
    // the first swatch is Auto (−1)
    [...$('#swatches').children].forEach((c, i) => c.classList.toggle('on', i - 1 === this.ctl!.labelColor));
  }

  selectTool(t: Tool): void {
    this.ctl?.setTool(t);
    document.querySelectorAll<HTMLElement>('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    $('#swatches').classList.toggle('open', t === 'label');
    const info = TOOLS.find((x) => x.tool === t)!;
    $('#hint').textContent = info.help;
  }

  refreshInventory(): void {
    const inv = this.ctl?.world.inventory;
    if (!inv) return;
    document.querySelectorAll<HTMLElement>('.tool').forEach((b) => {
      const t = TOOLS.find((x) => x.tool === b.dataset.tool);
      if (!t?.stock) return;
      const n = inv[t.stock];
      const total = this.level!.inventory[t.stock] ?? 0;
      b.querySelector('.count')!.textContent = String(n);
      b.classList.toggle('empty', n <= 0);
      b.style.display = total > 0 || t.stock === 'hmgr' && this.ctl!.world.rack.items.some((i) => i.kind === 'hmgr' && !i.locked) ? '' : 'none';
    });
  }

  // -------------------------------------------------------------- plan

  private buildPlan(): void {
    const w = this.ctl!.world;
    const tb = $('#plan tbody');
    tb.innerHTML = '';
    $('#plan-label-h').style.display = this.level!.labels ? '' : 'none';
    this.planRows = w.circuits.map((c, i) => {
      const tr = document.createElement('tr');
      const svc = SERVICES[c.service];
      const prod = w.live.has(i) ? '<span class="prod" title="En production : ne pas la couper trop longtemps">⚡</span>' : '';
      tr.innerHTML = `<td class="n">${i + 1}${prod}</td><td class="ports">${c.a} <span class="arrow">↔</span> ${c.b}</td>
        <td><span class="chip" style="background:${FIBRE_COLORS[c.type]}" title="${FIBRE_NAMES[c.type]}">${c.type}</span></td>
        <td class="svc" style="${this.level!.labels ? '' : 'display:none'}"><span class="dot" style="background:${svc.color}"></span>${svc.name}</td>
        <td class="st"><i class="s-conn" title="Branchée"></i><i class="s-route" title="Rangée"></i><i class="s-clear" title="Façade dégagée"></i>${this.level!.labels ? '<i class="s-label" title="Étiquetée"></i>' : ''}</td>`;
      tr.onmouseenter = () => this.ctl?.focus(i);
      tr.onmouseleave = () => this.ctl?.focus(-1);
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
      const l = tr.querySelector('.s-label');
      if (l) l.className = 's-label' + (s.labelled ? ' ok' : '');
      tr.classList.toggle('done', s.connected && s.routed && s.clear && (s.labelled || !this.level!.labels));
      tr.classList.toggle('cut', !!this.ctl?.world.live.has(i) && !s.connected);
    });
    const n = ev.total;
    const cuts = $('#cuts');
    cuts.style.display = ev.maxCuts === undefined ? 'none' : '';
    cuts.innerHTML = `⚡ Coupures <b>${ev.liveDown}/${ev.maxCuts}</b>`;
    cuts.className = ev.maxCuts !== undefined && ev.liveDown >= ev.maxCuts ? 'full' : ev.liveDown > 0 ? 'some' : '';
    setBar('#bar-conn', ev.connected, n);
    setBar('#bar-route', ev.routed, n);
    setBar('#bar-clear', ev.clear, n);
    setBar('#bar-label', ev.labelled, n);
    $('#bar-label').style.display = this.level?.labels ? '' : 'none';
    setBar('#bar-bundle', Math.min(ev.bundles, ev.bundlesNeeded), ev.bundlesNeeded);
    $('#bar-bundle').style.display = ev.bundlesNeeded ? '' : 'none';
    this.showClean(cleanliness(ev, !!this.level?.labels));
    $('#live-stars').innerHTML = starsHtml(ev.stars);
    const v = $<HTMLButtonElement>('#btn-validate');
    v.disabled = ev.stars < 1;
    v.classList.toggle('ready', ev.stars >= 1);
    v.textContent = ev.stars < 1 ? `Branchez les ${n} liaisons du plan` : ev.stars < UNLOCK_STARS ? 'Valider (rangez pour ★★)' : 'Valider la baie';
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
    const parWon = !!lv.par && ev.stars === 3 && t <= lv.par;
    if (parWon) this.progress.challenges[lv.id] = true;
    save('progress', this.progress);
    sfx.win();
    $('#result-stars').innerHTML = starsHtml(ev.stars, true);
    $('#result-time').textContent = `Temps : ${fmtTime(t)}`;
    $<HTMLImageElement>('#ba-before').src = ctl.before ?? '';
    $<HTMLImageElement>('#ba-after').src = ctl.capture();
    const lines = [
      `Liaisons branchées : ${ev.connected}/${ev.total}`,
      `Liaisons rangées : ${ev.routed}/${ev.total}`,
      `Façade dégagée : ${ev.clear}/${ev.total}`,
    ];
    if (lv.labels) lines.push(`Étiquetées : ${ev.labelled}/${ev.total}`);
    if (ev.bundlesNeeded) lines.push(`Faisceaux : ${Math.min(ev.bundles, ev.bundlesNeeded)}/${ev.bundlesNeeded}`);
    if (ev.stars < 3) lines.push(ev.stars === 1 ? '★★ : rangez au moins 70 % des liaisons, façade dégagée à 85 %.' : '★★★ : tout rangé, façade entièrement dégagée' + (lv.labels ? ', tout étiqueté' : '') + (ev.bundlesNeeded ? `, ${ev.bundlesNeeded} faisceaux` : '') + '.');
    if (lv.par) lines.push(parWon ? `⏱ Défi chrono réussi : ★★★ en moins de ${fmtTime(lv.par)} !` : `⏱ Défi chrono : ★★★ en moins de ${fmtTime(lv.par)}${this.progress.challenges[lv.id] ? ' (déjà réussi)' : ''}.`);
    $('#result-lines').innerHTML = lines.map((l) => `<li>${l}</li>`).join('');
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
    if (this.ctl) $('#timer').textContent = fmtTime(this.ctl.elapsed);
  }

  private toggleSound(): void {
    setMuted(!isMuted());
    $('#btn-sound').classList.toggle('off', isMuted());
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.ctl || document.querySelector('.overlay.on')) return;
    const t = TOOLS.find((x) => x.key === e.key);
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

/** how tidy the cabinet is overall (0..1): the four criteria, plugging counting double */
export function cleanliness(ev: Evaluation, labels: boolean): number {
  const n = Math.max(1, ev.total);
  const bundles = ev.bundlesNeeded ? [n * Math.min(1, ev.bundles / ev.bundlesNeeded)] : [];
  const parts = [ev.connected * 2, ev.routed, ev.clear, ...(labels ? [ev.labelled] : []), ...bundles];
  return parts.reduce((a, b) => a + b, 0) / (n * (parts.length + 1));
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

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function svg(body: string): string {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
function iconHand(): string { return svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V12m0-4.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.9-2.6L4.3 14a1.6 1.6 0 0 1 2.6-1.8L8 13.5"/>'); }
function iconHmgr(): string { return svg('<rect x="2" y="9" width="20" height="6" rx="1"/><path d="M5 9V6h3v3M10.5 9V6h3v3M16 9V6h3v3"/>'); }
function iconDuct(): string { return svg('<path d="M7 2v20M17 2v20"/><path d="M7 5h4M7 9h4M7 13h4M7 17h4M13 5h4M13 9h4M13 13h4M13 17h4"/>'); }
function iconRing(): string { return svg('<path d="M6 4v9a6 6 0 0 0 12 0V4"/><path d="M4 4h4M16 4h4"/>'); }
function iconVelcro(): string { return svg('<path d="M4 8c3-3 13-3 16 0M4 16c3 3 13 3 16 0"/><path d="M4 8v8M20 8v8"/><path d="M9 10.5v3M12 10v4M15 10.5v3"/>'); }
function iconLabel(): string { return svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>'); }
function iconRuler(): string { return svg('<rect x="2" y="8" width="20" height="8" rx="1" transform="rotate(-30 12 12)"/><path d="M8 7.5l1 1.7M11 5.8l1.5 2.6M14 4.1l1 1.7"/>'); }
function iconTrace(): string { return svg('<path d="M3 21l6-6"/><path d="M9 15l2-6 6-6 4 4-6 6-6 2z"/><path d="M17 3l4 4"/><circle cx="20" cy="20" r="1.5"/>'); }
function iconBin(): string { return svg('<path d="M3 8h18l-2 12H5z"/><ellipse cx="12" cy="8" rx="5" ry="2"/><path d="M8 13c2 1.5 6 1.5 8 0"/>'); }
function iconStock(): string { return svg('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'); }
