// HID usage tables (USB HID Usage Tables 1.4) for keyboard (page 0x07)
// and consumer controls (page 0x0C). Used for key assignments and macros.

export interface KeyDef {
  usage: number;
  label: string;
  code?: string; // KeyboardEvent.code
}

const letters: KeyDef[] = Array.from({ length: 26 }, (_, i) => {
  const ch = String.fromCharCode(65 + i);
  return { usage: 0x04 + i, label: ch, code: `Key${ch}` };
});

const digits: KeyDef[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d, i) => ({
  usage: 0x1e + i,
  label: d,
  code: `Digit${d}`,
}));

const fkeys: KeyDef[] = Array.from({ length: 12 }, (_, i) => ({
  usage: 0x3a + i,
  label: `F${i + 1}`,
  code: `F${i + 1}`,
}));

const fkeysHigh: KeyDef[] = Array.from({ length: 12 }, (_, i) => ({
  usage: 0x68 + i,
  label: `F${i + 13}`,
  code: `F${i + 13}`,
}));

export const KEYBOARD_KEYS: KeyDef[] = [
  ...letters,
  ...digits,
  { usage: 0x28, label: 'Enter', code: 'Enter' },
  { usage: 0x29, label: 'Esc', code: 'Escape' },
  { usage: 0x2a, label: 'Backspace', code: 'Backspace' },
  { usage: 0x2b, label: 'Tab', code: 'Tab' },
  { usage: 0x2c, label: 'Space', code: 'Space' },
  { usage: 0x2d, label: '-', code: 'Minus' },
  { usage: 0x2e, label: '=', code: 'Equal' },
  { usage: 0x2f, label: '[', code: 'BracketLeft' },
  { usage: 0x30, label: ']', code: 'BracketRight' },
  { usage: 0x31, label: '\\', code: 'Backslash' },
  { usage: 0x33, label: ';', code: 'Semicolon' },
  { usage: 0x34, label: "'", code: 'Quote' },
  { usage: 0x35, label: '`', code: 'Backquote' },
  { usage: 0x36, label: ',', code: 'Comma' },
  { usage: 0x37, label: '.', code: 'Period' },
  { usage: 0x38, label: '/', code: 'Slash' },
  { usage: 0x39, label: 'Caps Lock', code: 'CapsLock' },
  ...fkeys,
  { usage: 0x46, label: 'Print Screen', code: 'PrintScreen' },
  { usage: 0x47, label: 'Scroll Lock', code: 'ScrollLock' },
  { usage: 0x48, label: 'Pause', code: 'Pause' },
  { usage: 0x49, label: 'Insert', code: 'Insert' },
  { usage: 0x4a, label: 'Home', code: 'Home' },
  { usage: 0x4b, label: 'Page Up', code: 'PageUp' },
  { usage: 0x4c, label: 'Delete', code: 'Delete' },
  { usage: 0x4d, label: 'End', code: 'End' },
  { usage: 0x4e, label: 'Page Down', code: 'PageDown' },
  { usage: 0x4f, label: '→', code: 'ArrowRight' },
  { usage: 0x50, label: '←', code: 'ArrowLeft' },
  { usage: 0x51, label: '↓', code: 'ArrowDown' },
  { usage: 0x52, label: '↑', code: 'ArrowUp' },
  { usage: 0x53, label: 'Num Lock', code: 'NumLock' },
  { usage: 0x54, label: 'Num /', code: 'NumpadDivide' },
  { usage: 0x55, label: 'Num *', code: 'NumpadMultiply' },
  { usage: 0x56, label: 'Num -', code: 'NumpadSubtract' },
  { usage: 0x57, label: 'Num +', code: 'NumpadAdd' },
  { usage: 0x58, label: 'Num Enter', code: 'NumpadEnter' },
  ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d, i) => ({
    usage: 0x59 + i,
    label: `Num ${d}`,
    code: `Numpad${d}`,
  })),
  { usage: 0x63, label: 'Num .', code: 'NumpadDecimal' },
  { usage: 0x65, label: 'Menu', code: 'ContextMenu' },
  ...fkeysHigh,
  { usage: 0xe0, label: 'Left Ctrl', code: 'ControlLeft' },
  { usage: 0xe1, label: 'Left Shift', code: 'ShiftLeft' },
  { usage: 0xe2, label: 'Left Alt', code: 'AltLeft' },
  { usage: 0xe3, label: 'Left Win', code: 'MetaLeft' },
  { usage: 0xe4, label: 'Right Ctrl', code: 'ControlRight' },
  { usage: 0xe5, label: 'Right Shift', code: 'ShiftRight' },
  { usage: 0xe6, label: 'Right Alt', code: 'AltRight' },
  { usage: 0xe7, label: 'Right Win', code: 'MetaRight' },
];

export const MEDIA_KEYS: KeyDef[] = [
  { usage: 0xcd, label: 'Play / Pause' },
  { usage: 0xb7, label: 'Stop' },
  { usage: 0xb5, label: 'Next Track' },
  { usage: 0xb6, label: 'Previous Track' },
  { usage: 0xe9, label: 'Volume Up' },
  { usage: 0xea, label: 'Volume Down' },
  { usage: 0xe2, label: 'Mute' },
  { usage: 0x183, label: 'Media Player' },
  { usage: 0x18a, label: 'Mail' },
  { usage: 0x192, label: 'Calculator' },
  { usage: 0x194, label: 'My Computer' },
  { usage: 0x223, label: 'Browser Home' },
  { usage: 0x224, label: 'Browser Back' },
  { usage: 0x225, label: 'Browser Forward' },
  { usage: 0x227, label: 'Browser Refresh' },
  { usage: 0x221, label: 'Browser Search' },
];

/** Modifier bit flags as used in the HID boot keyboard report. */
export const MODIFIERS = [
  { bit: 0x01, label: 'Ctrl' },
  { bit: 0x02, label: 'Shift' },
  { bit: 0x04, label: 'Alt' },
  { bit: 0x08, label: 'Win' },
] as const;

const byCode = new Map(KEYBOARD_KEYS.filter((k) => k.code).map((k) => [k.code!, k]));
const byUsage = new Map(KEYBOARD_KEYS.map((k) => [k.usage, k]));
const mediaByUsage = new Map(MEDIA_KEYS.map((k) => [k.usage, k]));

export function usageFromCode(code: string): number | undefined {
  return byCode.get(code)?.usage;
}

export function keyLabel(usage: number): string {
  return byUsage.get(usage)?.label ?? `0x${usage.toString(16).padStart(2, '0')}`;
}

export function mediaLabel(usage: number): string {
  return mediaByUsage.get(usage)?.label ?? `Consumer 0x${usage.toString(16)}`;
}

export function modifierLabel(mods: number): string {
  return MODIFIERS.filter((m) => mods & m.bit)
    .map((m) => m.label)
    .join('+');
}
