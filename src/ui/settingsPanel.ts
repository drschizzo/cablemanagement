// The settings, from the title screen or the pause menu: the quality of the
// image (adapted to the GPU, or held at a preset or as set in detail) and the
// sound. The quality chosen is kept in the browser (storage.ts).

import { AUTO_QUALITY, QUALITY, drawAlike, type QualityChoice, type QualitySettings } from '../render/quality';
import { save } from './storage';
import { hide, show } from './dom';
import { $ } from '../lib/page';

/** what the panel sees of the stage */
export interface QualityControl {
  readonly quality: QualityChoice;
  /** the image as it is drawn now */
  readonly qualitySettings: QualitySettings;
  setQuality(choice: QualityChoice): void;
}

export interface SoundControl {
  isOn(): boolean;
  toggle(): void;
}

/** the image held at a level of QUALITY, offered besides auto */
const PRESETS = [
  { name: 'Maximale', level: 0 },
  { name: 'Élevée', level: 2 },
  { name: 'Moyenne', level: 4 },
  { name: 'Basse', level: 6 },
];

const AUTO_NAME = 'Auto';

/** the values the details offer: those the levels of QUALITY use */
const RATIOS = [...new Set(QUALITY.map((q) => q.ratio))];
const SHADOWS = [...new Set(QUALITY.map((q) => q.shadow))];

export class SettingsPanel {
  private back = () => {};
  /** Auto, then the presets */
  private choiceButtons: { name: string; button: HTMLButtonElement }[] = [];
  private ratio = $<HTMLSelectElement>('#q-ratio');
  private shadow = $<HTMLSelectElement>('#q-shadow');
  private ao = $<HTMLInputElement>('#q-ao');
  private ssr = $<HTMLInputElement>('#q-ssr');
  private soundBox = $<HTMLInputElement>('#set-sound');

  constructor(private quality: QualityControl, private sound: SoundControl) {
    this.buildPresets();
    this.ratio.innerHTML = RATIOS.map((r) => `<option value="${r}">${ratioText(r)}</option>`).join('');
    this.shadow.innerHTML = SHADOWS.map((px) => `<option value="${px}">${px} px</option>`).join('');
    for (const input of [this.ratio, this.shadow, this.ao, this.ssr]) {
      input.onchange = () => this.choose({ kind: 'fixed', settings: this.detailSettings() });
    }
    $('#q-reset').onclick = () => this.choose(AUTO_QUALITY);
    this.soundBox.onchange = () => { sound.toggle(); this.render(); };
    $('#settings-back').onclick = () => { hide('#settings'); this.back(); };
  }

  /** `back`: where the Back button returns */
  show(back: () => void): void {
    this.back = back;
    this.render();
    show('#settings');
  }

  /** auto stepped the image down: the level is kept for the next visit */
  qualityLowered(choice: QualityChoice): void {
    save('quality', choice);
    this.render();
  }

  private buildPresets(): void {
    const box = $('#q-presets');
    const offer = (name: string, pick: () => void) => {
      const button = document.createElement('button');
      button.textContent = name;
      button.onclick = pick;
      box.appendChild(button);
      this.choiceButtons.push({ name, button });
    };
    // auto chosen again keeps the level it had stepped down to (Reset starts it over)
    offer(AUTO_NAME, () => { if (this.quality.quality.kind !== 'auto') this.choose(AUTO_QUALITY); });
    for (const p of PRESETS) offer(p.name, () => this.choose({ kind: 'fixed', settings: QUALITY[p.level] }));
  }

  private choose(choice: QualityChoice): void {
    this.quality.setQuality(choice);
    save('quality', choice);
    this.render();
  }

  private detailSettings(): QualitySettings {
    return { ratio: Number(this.ratio.value), shadow: Number(this.shadow.value), ao: this.ao.checked, ssr: this.ssr.checked };
  }

  private render(): void {
    const choice = this.quality.quality;
    const settings = this.quality.qualitySettings;
    const preset = presetOf(choice);
    const current = choice.kind === 'auto' ? AUTO_NAME : preset?.name;
    for (const { name, button } of this.choiceButtons) {
      const on = name === current;
      button.classList.toggle('cur', on);
      button.setAttribute('aria-pressed', String(on));
    }
    $('#q-status').textContent = qualityStatus(choice, preset?.name, settings);
    $('#q-reset').style.display = choice.kind === 'auto' && choice.level > 0 ? '' : 'none';
    this.ratio.value = String(settings.ratio);
    this.shadow.value = String(settings.shadow);
    this.ao.checked = settings.ao;
    this.ssr.checked = settings.ssr;
    this.soundBox.checked = this.sound.isOn();
  }
}

/** the preset a fixed choice is exactly, if any */
function presetOf(choice: QualityChoice): (typeof PRESETS)[number] | undefined {
  if (choice.kind === 'auto') return undefined;
  return PRESETS.find((p) => drawAlike(QUALITY[p.level], choice.settings, Infinity));
}

function ratioText(ratio: number): string {
  const text = `×${String(ratio).replace('.', ',')}`;
  return ratio > window.devicePixelRatio ? `${text} (cet écran : ${ratioText(window.devicePixelRatio)})` : text;
}

/** what the image is, and who chose it */
function qualityStatus(choice: QualityChoice, presetName: string | undefined, s: QualitySettings): string {
  const drawn = [
    `définition ${ratioText(Math.min(s.ratio, window.devicePixelRatio))}`,
    `ombres ${s.shadow} px`,
    s.ao ? 'occlusion ambiante' : 'sans occlusion',
    s.ssr ? 'reflets' : 'sans reflets',
  ].join(' · ');
  if (choice.kind === 'auto') {
    return choice.level === 0
      ? `Ajustée à la carte graphique : la meilleure image tant qu'elle reste fluide. Actuellement ${drawn}.`
      : `Abaissée automatiquement pour rester fluide. Actuellement ${drawn}.`;
  }
  return `${presetName ?? 'Personnalisée'}, sans ajustement automatique : ${drawn}.`;
}
