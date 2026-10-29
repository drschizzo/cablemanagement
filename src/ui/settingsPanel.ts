// The settings, from the title screen or the pause menu: the language, the
// quality of the image (adapted to the GPU, or held at a preset or as set in
// detail) and the sound. The choices are kept in the browser (storage.ts).

import { AUTO_QUALITY, QUALITY, drawAlike, type QualityChoice, type QualitySettings } from '../render/quality';
import { save } from './storage';
import { hide, show } from './dom';
import { LANGUAGES, language, onLanguageChange, setLanguage, tr, type Words } from './language';
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
const PRESETS: { name: Words; level: number }[] = [
  { name: { fr: 'Maximale', en: 'Highest' }, level: 0 },
  { name: { fr: 'Élevée', en: 'High' }, level: 2 },
  { name: { fr: 'Moyenne', en: 'Medium' }, level: 4 },
  { name: { fr: 'Basse', en: 'Low' }, level: 6 },
];

const AUTO_NAME: Words = { fr: 'Auto', en: 'Auto' };

/** the values the details offer: those the levels of QUALITY use */
const RATIOS = [...new Set(QUALITY.map((q) => q.ratio))];
const SHADOWS = [...new Set(QUALITY.map((q) => q.shadow))];

export class SettingsPanel {
  private back = () => {};
  /** Auto, then the presets */
  private choiceButtons: { name: Words; button: HTMLButtonElement }[] = [];
  private languageButtons: { id: string; button: HTMLButtonElement }[] = [];
  private ratio = $<HTMLSelectElement>('#q-ratio');
  private shadow = $<HTMLSelectElement>('#q-shadow');
  private ao = $<HTMLInputElement>('#q-ao');
  private ssr = $<HTMLInputElement>('#q-ssr');
  private soundBox = $<HTMLInputElement>('#set-sound');

  constructor(private quality: QualityControl, private sound: SoundControl) {
    this.buildLanguages();
    this.buildPresets();
    this.writeOptions();
    onLanguageChange(() => { this.writeOptions(); this.render(); });
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

  private buildLanguages(): void {
    const box = $('#lang-choices');
    for (const lang of LANGUAGES) {
      const button = document.createElement('button');
      button.textContent = lang.name;
      button.onclick = () => { save('language', lang.id); setLanguage(lang.id); };
      box.appendChild(button);
      this.languageButtons.push({ id: lang.id, button });
    }
  }

  /** the choices of the details, in the language spoken */
  private writeOptions(): void {
    this.ratio.innerHTML = RATIOS.map((r) => `<option value="${r}">${ratioText(r)}</option>`).join('');
    for (const { name, button } of this.choiceButtons) button.textContent = tr(name);
  }

  private buildPresets(): void {
    const box = $('#q-presets');
    const offer = (name: Words, pick: () => void) => {
      const button = document.createElement('button');
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
    for (const { id, button } of this.languageButtons) {
      button.classList.toggle('cur', id === language());
      button.setAttribute('aria-pressed', String(id === language()));
    }
    $('#q-status').textContent = qualityStatus(choice, preset && tr(preset.name), settings);
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
  const text = `×${tr({ fr: String(ratio).replace('.', ','), en: String(ratio) })}`;
  return ratio > window.devicePixelRatio ? tr({ fr: `${text} (cet écran : ${ratioText(window.devicePixelRatio)})`, en: `${text} (this screen: ${ratioText(window.devicePixelRatio)})` }) : text;
}

/** what the image is, and who chose it */
function qualityStatus(choice: QualityChoice, presetName: string | undefined, s: QualitySettings): string {
  const ratio = ratioText(Math.min(s.ratio, window.devicePixelRatio));
  const drawn = [
    tr({ fr: `définition ${ratio}`, en: `resolution ${ratio}` }),
    tr({ fr: `ombres ${s.shadow} px`, en: `shadows ${s.shadow} px` }),
    s.ao ? tr({ fr: 'occlusion ambiante', en: 'ambient occlusion' }) : tr({ fr: 'sans occlusion', en: 'no occlusion' }),
    s.ssr ? tr({ fr: 'reflets', en: 'reflections' }) : tr({ fr: 'sans reflets', en: 'no reflections' }),
  ].join(' · ');
  if (choice.kind === 'auto') {
    return choice.level === 0
      ? tr({ fr: `Ajustée à la carte graphique : la meilleure image tant qu'elle reste fluide. Actuellement ${drawn}.`, en: `Fitted to the graphics card: the best image while it stays smooth. Now ${drawn}.` })
      : tr({ fr: `Abaissée automatiquement pour rester fluide. Actuellement ${drawn}.`, en: `Lowered automatically to stay smooth. Now ${drawn}.` });
  }
  const name = presetName ?? tr({ fr: 'Personnalisée', en: 'Custom' });
  return tr({ fr: `${name}, sans ajustement automatique : ${drawn}.`, en: `${name}, without automatic adjustment: ${drawn}.` });
}
