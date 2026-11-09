// Device database for Bloody (A4Tech) mice.
//
// Capabilities are taken from public product specifications and are
// approximate. USB product IDs differ between hardware revisions and are not
// hard-coded: devices are matched by the A4Tech vendor ID and then identified
// by product name, with a manual model picker as fallback.

export const A4TECH_VENDOR_ID = 0x09da;

export type LightingMode = 'off' | 'static' | 'breathing' | 'neon' | 'spectrum' | 'wave' | 'reactive';

export interface ButtonSlot {
  index: number;
  name: string;
  /** Position on the mouse diagram (0-100 percent of the SVG box). */
  x: number;
  y: number;
}

export interface MouseModel {
  id: string;
  name: string;
  /** Substrings matched (case-insensitively) against HIDDevice.productName. */
  match: string[];
  sensor: string;
  maxCpi: number;
  minCpi: number;
  cpiStep: number;
  cpiLevels: number;
  reportRates: number[];
  buttons: ButtonSlot[];
  memorySlots: number;
  macroMemoryBytes: number;
  lighting: LightingMode[];
  rgb: boolean;
  wireless: boolean;
  /** Supports the Light Strike (LK) optical switch response-time setting. */
  lightStrike: boolean;
  liftOff: boolean;
  angleSnapping: boolean;
  /** Max Core mode supported (Core 3/4 normally need activation in the vendor tool). */
  maxCore: 1 | 2 | 3 | 4;
  notes?: string;
}

const STD_8_BUTTONS: ButtonSlot[] = [
  { index: 0, name: 'Left', x: 34, y: 20 },
  { index: 1, name: 'Right', x: 66, y: 20 },
  { index: 2, name: 'Wheel click', x: 50, y: 18 },
  { index: 3, name: 'Side back', x: 14, y: 52 },
  { index: 4, name: 'Side forward', x: 14, y: 40 },
  { index: 5, name: 'CPI +', x: 50, y: 34 },
  { index: 6, name: 'CPI −', x: 50, y: 42 },
  { index: 7, name: 'Fire / Sniper', x: 20, y: 31 },
];

const STD_6_BUTTONS = STD_8_BUTTONS.slice(0, 6).map((b) =>
  b.index === 5 ? { ...b, name: 'CPI switch' } : b,
);

const base = {
  minCpi: 100,
  cpiStep: 100,
  cpiLevels: 5,
  reportRates: [125, 250, 500, 1000],
  memorySlots: 5,
  macroMemoryBytes: 16 * 1024,
  rgb: false,
  wireless: false,
  lightStrike: true,
  liftOff: true,
  angleSnapping: true,
  maxCore: 4 as const,
};

export const MODELS: MouseModel[] = [
  {
    ...base,
    id: 'a70',
    name: 'Bloody A70 Light Strike',
    match: ['a70'],
    sensor: 'Avago A3050 (optical)',
    maxCpi: 4000,
    buttons: STD_8_BUTTONS,
    lighting: ['off', 'static', 'breathing', 'neon'],
  },
  {
    ...base,
    id: 'a70x',
    name: 'Bloody A70X / A70 Pro',
    match: ['a70x', 'a70 x', 'a70a', 'a70 pro'],
    sensor: 'BC3332 / PMW3325 class (optical)',
    maxCpi: 12000,
    buttons: STD_8_BUTTONS,
    lighting: ['off', 'static', 'breathing', 'neon', 'spectrum'],
    rgb: true,
  },
  {
    ...base,
    id: 'a60',
    name: 'Bloody A60',
    match: ['a60'],
    sensor: 'Avago A3050 (optical)',
    maxCpi: 4000,
    buttons: STD_8_BUTTONS,
    lighting: ['off', 'static', 'breathing', 'neon'],
  },
  {
    ...base,
    id: 'a90',
    name: 'Bloody A90 / A91',
    match: ['a90', 'a91'],
    sensor: 'Avago A3050 (optical)',
    maxCpi: 4000,
    buttons: STD_8_BUTTONS,
    lighting: ['off', 'static', 'breathing', 'neon', 'spectrum'],
    rgb: true,
  },
  {
    ...base,
    id: 'a9',
    name: 'Bloody A9 Blazing',
    match: ['a9 ', 'a9'],
    sensor: 'Optical',
    maxCpi: 4000,
    buttons: STD_6_BUTTONS,
    lighting: ['off', 'static', 'breathing', 'neon'],
  },
  {
    ...base,
    id: 'j95',
    name: 'Bloody J95 / J95s',
    match: ['j95'],
    sensor: 'BC3332 (optical)',
    maxCpi: 8000,
    buttons: STD_8_BUTTONS,
    lighting: ['off', 'static', 'breathing', 'neon', 'spectrum', 'wave'],
    rgb: true,
  },
  {
    ...base,
    id: 'v7',
    name: 'Bloody V7 / V7M',
    match: ['v7'],
    sensor: 'Optical',
    maxCpi: 3200,
    buttons: STD_8_BUTTONS,
    lighting: ['off', 'static'],
    lightStrike: false,
  },
  {
    ...base,
    id: 'v8',
    name: 'Bloody V8 / V8M',
    match: ['v8'],
    sensor: 'Optical',
    maxCpi: 3200,
    buttons: STD_8_BUTTONS,
    lighting: ['off', 'static'],
    lightStrike: false,
  },
  {
    ...base,
    id: 'es9pro',
    name: 'Bloody ES9 Pro',
    match: ['es9'],
    sensor: 'PixArt PMW3389',
    maxCpi: 16000,
    cpiStep: 50,
    buttons: STD_6_BUTTONS,
    lighting: ['off', 'static', 'breathing', 'spectrum', 'wave', 'reactive'],
    rgb: true,
  },
  {
    ...base,
    id: 'w70max',
    name: 'Bloody W70 Max',
    match: ['w70'],
    sensor: 'BC3332-A',
    maxCpi: 10000,
    buttons: STD_8_BUTTONS,
    lighting: ['off', 'static', 'breathing', 'neon', 'spectrum', 'wave'],
    rgb: true,
  },
  {
    ...base,
    id: 'w90max',
    name: 'Bloody W90 Max',
    match: ['w90'],
    sensor: 'BC3332-A',
    maxCpi: 10000,
    buttons: [
      ...STD_8_BUTTONS,
      { index: 8, name: 'Side 3', x: 14, y: 64 },
      { index: 9, name: 'Side 4', x: 14, y: 76 },
    ],
    lighting: ['off', 'static', 'breathing', 'neon', 'spectrum', 'wave'],
    rgb: true,
  },
  {
    ...base,
    id: 'r70',
    name: 'Bloody R70 / R90 (wireless)',
    match: ['r70', 'r90', 'r8'],
    sensor: 'Optical',
    maxCpi: 4000,
    reportRates: [125, 250, 500],
    buttons: STD_8_BUTTONS,
    lighting: ['off', 'static', 'breathing'],
    wireless: true,
  },
  {
    ...base,
    id: 'generic',
    name: 'Generic Bloody mouse',
    match: [],
    sensor: 'Unknown',
    maxCpi: 6200,
    buttons: STD_8_BUTTONS,
    lighting: ['off', 'static', 'breathing', 'neon', 'spectrum'],
    rgb: true,
    notes: 'Fallback profile with common capabilities. Pick your exact model if listed.',
  },
];

export function getModel(id: string): MouseModel {
  return MODELS.find((m) => m.id === id) ?? MODELS[MODELS.length - 1];
}

/** Best-effort identification from the USB product string. Longest match wins. */
export function identifyModel(productName: string | undefined): MouseModel | undefined {
  if (!productName) return undefined;
  const name = productName.toLowerCase();
  let best: { model: MouseModel; len: number } | undefined;
  for (const model of MODELS) {
    for (const m of model.match) {
      if (name.includes(m.trim()) && (!best || m.length > best.len)) {
        best = { model, len: m.length };
      }
    }
  }
  return best?.model;
}
