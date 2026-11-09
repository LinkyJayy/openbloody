import type { LightingMode, MouseModel } from '../hid/devices';

export type CoreMode = 1 | 2 | 3 | 4;

export type MouseButtonFn =
  | 'left'
  | 'right'
  | 'middle'
  | 'back'
  | 'forward'
  | 'scrollUp'
  | 'scrollDown'
  | 'tiltLeft'
  | 'tiltRight';

export type ButtonAction =
  | { kind: 'mouse'; button: MouseButtonFn }
  | { kind: 'key'; usage: number; modifiers: number }
  | { kind: 'media'; usage: number }
  | { kind: 'macro'; macroId: string; repeat: 'once' | 'hold' | 'toggle' | 'count'; count: number }
  | { kind: 'fire'; pattern: 'double' | 'triple' | 'rapid'; intervalMs: number }
  | { kind: 'cpi'; op: 'up' | 'down' | 'cycle' | 'sniper' | 'set'; level: number }
  | { kind: 'profile'; op: 'next' | 'prev' | 'set'; slot: number }
  | { kind: 'core'; op: 'cycle' | 'set'; core: CoreMode }
  | { kind: 'disabled' };

export type MacroEvent =
  | { t: 'keyDown'; usage: number }
  | { t: 'keyUp'; usage: number }
  | { t: 'mouseDown'; button: MouseButtonFn }
  | { t: 'mouseUp'; button: MouseButtonFn }
  | { t: 'move'; dx: number; dy: number }
  | { t: 'wheel'; delta: number }
  | { t: 'delay'; ms: number }
  | { t: 'loopStart'; count: number }
  | { t: 'loopEnd' };

export interface Macro {
  id: string;
  name: string;
  events: MacroEvent[];
}

export interface CpiLevel {
  x: number;
  y: number;
  enabled: boolean;
  color: string;
}

export interface Lighting {
  mode: LightingMode;
  color: string;
  brightness: number; // 0-100
  speed: number; // 1-10
  cpiIndicator: boolean;
}

export interface Profile {
  id: string;
  name: string;
  modelId: string;
  core: CoreMode;
  cpi: {
    levels: CpiLevel[];
    active: number;
    linkXY: boolean;
    sniper: number;
  };
  reportRate: number;
  /** Key response time in ms (Light Strike models support 0.2 ms steps; stored ×10). */
  keyResponseTenthsMs: number;
  debounceMs: number;
  liftOff: 1 | 2 | 3;
  angleSnapping: boolean;
  lighting: Lighting;
  buttons: ButtonAction[];
  macros: Macro[];
  updatedAt: number;
}

export const CORE_INFO: Record<CoreMode, { title: string; summary: string; features: string[] }> = {
  1: {
    title: 'Core 1 — Standard',
    summary: 'Plain remapping: mouse, keyboard and media functions on every button.',
    features: ['Button remapping', 'CPI levels', 'Report rate', 'Lighting'],
  },
  2: {
    title: 'Core 2 — Fire modes',
    summary: 'Adds firmware fire modes: double-shot, triple-shot burst and rapid fire.',
    features: ['Everything in Core 1', '2-shot / 3-shot burst', 'Rapid fire with interval'],
  },
  3: {
    title: 'Core 3 — Macros',
    summary: 'Adds on-board macros with keyboard, mouse buttons, wheel, movement and loops.',
    features: ['Everything in Core 2', 'Macro editor and recorder', 'Movement-pattern macros'],
  },
  4: {
    title: 'Core 4 — Precision',
    summary: 'Adds the sniper (temporary CPI) button and precision tuning.',
    features: ['Everything in Core 3', 'Sniper CPI', 'Angle snapping', 'Lift-off tuning'],
  },
};

export function actionAllowed(action: ButtonAction, core: CoreMode): boolean {
  switch (action.kind) {
    case 'fire':
      return core >= 2;
    case 'macro':
      return core >= 3;
    case 'cpi':
      return action.op !== 'sniper' || core >= 4;
    default:
      return true;
  }
}

const CPI_COLORS = ['#ff3b3b', '#ffb020', '#3bd16f', '#38a8ff', '#c46bff'];

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function defaultButtons(model: MouseModel): ButtonAction[] {
  return model.buttons.map((b): ButtonAction => {
    switch (b.index) {
      case 0:
        return { kind: 'mouse', button: 'left' };
      case 1:
        return { kind: 'mouse', button: 'right' };
      case 2:
        return { kind: 'mouse', button: 'middle' };
      case 3:
        return { kind: 'mouse', button: 'back' };
      case 4:
        return { kind: 'mouse', button: 'forward' };
      case 5:
        return { kind: 'cpi', op: model.buttons.length <= 6 ? 'cycle' : 'up', level: 0 };
      case 6:
        return { kind: 'cpi', op: 'down', level: 0 };
      case 7:
        return { kind: 'fire', pattern: 'triple', intervalMs: 60 };
      default:
        return { kind: 'disabled' };
    }
  });
}

export function defaultProfile(model: MouseModel, name = 'Default'): Profile {
  const presets = [400, 800, 1600, 3200, 6400].map((v) => Math.min(v, model.maxCpi));
  return {
    id: uid(),
    name,
    modelId: model.id,
    core: 1,
    cpi: {
      levels: Array.from({ length: model.cpiLevels }, (_, i) => ({
        x: presets[i] ?? model.maxCpi,
        y: presets[i] ?? model.maxCpi,
        enabled: true,
        color: CPI_COLORS[i % CPI_COLORS.length],
      })),
      active: 1,
      linkXY: true,
      sniper: Math.min(400, model.maxCpi),
    },
    reportRate: model.reportRates.includes(1000) ? 1000 : model.reportRates[model.reportRates.length - 1],
    keyResponseTenthsMs: model.lightStrike ? 2 : 40,
    debounceMs: 4,
    liftOff: 2,
    angleSnapping: false,
    lighting: {
      mode: model.lighting.includes('neon') ? 'neon' : model.lighting[1] ?? 'off',
      color: '#ff1e1e',
      brightness: 80,
      speed: 5,
      cpiIndicator: true,
    },
    buttons: defaultButtons(model),
    macros: [],
    updatedAt: Date.now(),
  };
}

/** Clamp/repair a profile so it fits the capabilities of `model`. */
export function fitProfileToModel(p: Profile, model: MouseModel): Profile {
  const clampCpi = (v: number) =>
    Math.max(model.minCpi, Math.min(model.maxCpi, Math.round(v / model.cpiStep) * model.cpiStep));
  const fresh = defaultProfile(model);
  const levels = fresh.cpi.levels.map((d, i) => {
    const l = p.cpi.levels[i] ?? d;
    return { ...l, x: clampCpi(l.x), y: clampCpi(l.y) };
  });
  return {
    ...p,
    modelId: model.id,
    core: Math.min(p.core, model.maxCore) as CoreMode,
    cpi: {
      ...p.cpi,
      levels,
      active: Math.min(p.cpi.active, levels.length - 1),
      sniper: clampCpi(p.cpi.sniper),
    },
    reportRate: model.reportRates.includes(p.reportRate) ? p.reportRate : fresh.reportRate,
    lighting: model.lighting.includes(p.lighting.mode) ? p.lighting : { ...p.lighting, mode: fresh.lighting.mode },
    buttons: model.buttons.map((_, i) => p.buttons[i] ?? fresh.buttons[i]),
  };
}
