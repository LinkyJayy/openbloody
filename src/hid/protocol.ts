// Data-driven protocol layer.
//
// A4Tech has not published the Bloody configuration protocol. Rather than
// hard-coding guessed bytes, OpenBloody describes every firmware command as a
// small text template inside a ProtocolDefinition. The bundled definition is
// an UNVERIFIED DRAFT: it drives the simulator and documents the shape of
// every command, and writes to real hardware are blocked until the user
// either marks a definition as verified or explicitly accepts the risk.
// Definitions can be edited and imported in the Protocol Lab, so captured
// BloodyWorkshop traffic can be turned into a working definition.
//
// Template syntax (whitespace separated tokens):
//   07          a literal hex byte
//   {name}      a u8 field
//   {name:u16le} / {name:u16be}   16-bit field
//   {name:s8}   signed 8-bit field
//   {name:bytes}  a byte array field, spliced in

import type { ButtonAction, Profile } from '../model/types';
import type { MouseModel } from './devices';
import { encodeMacro, MOUSE_BUTTON_CODES } from '../model/macro';

export type CommandName =
  | 'getInfo'
  | 'selectSlot'
  | 'setCore'
  | 'setCpiLevel'
  | 'setActiveCpi'
  | 'setSniperCpi'
  | 'setReportRate'
  | 'setKeyResponse'
  | 'setDebounce'
  | 'setLiftOff'
  | 'setAngleSnap'
  | 'setLighting'
  | 'setButton'
  | 'writeMacro'
  | 'saveToFlash'
  | 'factoryReset';

export interface ProtocolDefinition {
  id: string;
  name: string;
  version: number;
  verified: boolean;
  description?: string;
  /** Report ID used for configuration traffic. */
  reportId: number;
  /** Payload length (bytes after the report ID). Packets are zero-padded. */
  reportLength: number;
  transport: 'feature' | 'output';
  checksum: { type: 'none' | 'sum8' | 'xor8' | 'twos8'; index: number; from: number; to: number };
  /** Delay between packets; flash writes on cheap MCUs need breathing room. */
  interPacketDelayMs: number;
  macroChunkSize: number;
  reportRateCodes: Record<string, number>;
  liftOffCodes: Record<string, number>;
  lightingModeCodes: Record<string, number>;
  commands: Record<CommandName, string>;
}

export const DRAFT_PROTOCOL: ProtocolDefinition = {
  id: 'bloody-draft-v1',
  name: 'Bloody draft protocol (unverified)',
  version: 1,
  verified: false,
  description:
    'Placeholder command layout used by the simulator. The byte values are NOT confirmed against real ' +
    'Bloody firmware. Capture BloodyWorkshop traffic (USBPcap + Wireshark) and update these templates ' +
    'in the Protocol Lab before writing to a real mouse.',
  reportId: 0x07,
  reportLength: 63,
  transport: 'feature',
  checksum: { type: 'none', index: 62, from: 0, to: 61 },
  interPacketDelayMs: 8,
  macroChunkSize: 48,
  reportRateCodes: { '125': 8, '250': 4, '500': 2, '1000': 1 },
  liftOffCodes: { '1': 1, '2': 2, '3': 3 },
  lightingModeCodes: { off: 0, static: 1, breathing: 2, neon: 3, spectrum: 4, wave: 5, reactive: 6 },
  commands: {
    getInfo: '03 00',
    selectSlot: '50 {slot}',
    setCore: '0B {core}',
    setCpiLevel: '0D {level} {x:u16le} {y:u16le} {enabled} {r} {g} {b}',
    setActiveCpi: '0E {level}',
    setSniperCpi: '0F {cpi:u16le}',
    setReportRate: '10 {rate}',
    setKeyResponse: '12 {tenths}',
    setDebounce: '15 {ms}',
    setLiftOff: '13 {lod}',
    setAngleSnap: '14 {on}',
    setLighting: '20 {mode} {r} {g} {b} {brightness} {speed} {cpiIndicator}',
    setButton: '30 {button} {action:bytes}',
    writeMacro: '40 {macro} {offset:u16le} {len} {chunk:bytes}',
    saveToFlash: '5A A5',
    factoryReset: 'FF 00 FF',
  },
};

export type FieldValue = number | Uint8Array;

export interface Packet {
  label: string;
  reportId: number;
  data: Uint8Array;
}

export class TemplateError extends Error {}

export function parseHex(text: string): Uint8Array {
  const clean = text.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, ' ').trim();
  if (!clean) return new Uint8Array();
  const tokens = clean.split(/\s+/).flatMap((t) => (t.length > 2 ? t.match(/.{1,2}/g) ?? [] : [t]));
  return Uint8Array.from(tokens.map((t) => parseInt(t, 16)));
}

export function toHex(bytes: Uint8Array | number[], sep = ' '): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(sep);
}

export function fillTemplate(template: string, fields: Record<string, FieldValue>): number[] {
  const out: number[] = [];
  for (const token of template.trim().split(/\s+/).filter(Boolean)) {
    const m = token.match(/^\{(\w+)(?::(u8|s8|u16le|u16be|bytes))?\}$/);
    if (!m) {
      if (!/^[0-9a-fA-F]{2}$/.test(token)) throw new TemplateError(`Bad template token "${token}"`);
      out.push(parseInt(token, 16));
      continue;
    }
    const [, name, type = 'u8'] = m;
    const v = fields[name];
    if (v === undefined) throw new TemplateError(`Missing field "${name}"`);
    if (type === 'bytes') {
      if (!(v instanceof Uint8Array)) throw new TemplateError(`Field "${name}" must be bytes`);
      out.push(...v);
      continue;
    }
    if (typeof v !== 'number') throw new TemplateError(`Field "${name}" must be a number`);
    const n = Math.round(v);
    if (type === 'u16le') out.push(n & 0xff, (n >> 8) & 0xff);
    else if (type === 'u16be') out.push((n >> 8) & 0xff, n & 0xff);
    else out.push(n & 0xff);
  }
  return out;
}

export function applyChecksum(data: Uint8Array, def: ProtocolDefinition): void {
  const { type, index, from, to } = def.checksum;
  if (type === 'none') return;
  let acc = 0;
  for (let i = from; i <= to && i < data.length; i++) {
    acc = type === 'xor8' ? acc ^ data[i] : (acc + data[i]) & 0xff;
  }
  if (type === 'twos8') acc = (0x100 - acc) & 0xff;
  data[index] = acc;
}

export function buildPacket(
  def: ProtocolDefinition,
  cmd: CommandName,
  fields: Record<string, FieldValue> = {},
  label: string = cmd,
): Packet {
  const template = def.commands[cmd];
  if (template === undefined || template.trim() === '') {
    throw new TemplateError(`Command "${cmd}" is not defined in protocol "${def.id}"`);
  }
  const bytes = fillTemplate(template, fields);
  if (bytes.length > def.reportLength) {
    throw new TemplateError(`Command "${cmd}" is ${bytes.length} bytes; report length is ${def.reportLength}`);
  }
  const data = new Uint8Array(def.reportLength);
  data.set(bytes);
  applyChecksum(data, def);
  return { label, reportId: def.reportId, data };
}

function rgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.replace('#', ''), 16) || 0;
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** 4-byte action encoding: [type, a, b, c]. */
export function encodeAction(a: ButtonAction, macroIndex: (id: string) => number): Uint8Array {
  switch (a.kind) {
    case 'mouse':
      return Uint8Array.of(0x01, MOUSE_BUTTON_CODES[a.button], 0, 0);
    case 'key':
      return Uint8Array.of(0x02, a.usage & 0xff, a.modifiers & 0xff, 0);
    case 'media':
      return Uint8Array.of(0x03, a.usage & 0xff, (a.usage >> 8) & 0xff, 0);
    case 'macro': {
      const mode = { once: 0, hold: 1, toggle: 2, count: 3 }[a.repeat];
      return Uint8Array.of(0x04, macroIndex(a.macroId) & 0xff, mode, Math.min(255, a.count));
    }
    case 'fire': {
      const pattern = { double: 2, triple: 3, rapid: 0 }[a.pattern];
      return Uint8Array.of(0x05, pattern, a.intervalMs & 0xff, (a.intervalMs >> 8) & 0xff);
    }
    case 'cpi': {
      const op = { up: 1, down: 2, cycle: 3, sniper: 4, set: 5 }[a.op];
      return Uint8Array.of(0x06, op, a.level, 0);
    }
    case 'profile': {
      const op = { next: 1, prev: 2, set: 3 }[a.op];
      return Uint8Array.of(0x07, op, a.slot, 0);
    }
    case 'core':
      return Uint8Array.of(0x08, a.op === 'cycle' ? 1 : 2, a.core, 0);
    case 'disabled':
      return Uint8Array.of(0x00, 0, 0, 0);
  }
}

export interface BuildOptions {
  slot: number;
  save: boolean;
}

/** Translate a whole profile into the ordered packet list written to the mouse. */
export function buildProfilePackets(
  profile: Profile,
  model: MouseModel,
  def: ProtocolDefinition,
  opts: BuildOptions,
): Packet[] {
  const p: Packet[] = [];
  p.push(buildPacket(def, 'selectSlot', { slot: opts.slot }, `Select memory slot ${opts.slot + 1}`));
  p.push(buildPacket(def, 'setCore', { core: profile.core }, `Core ${profile.core}`));

  profile.cpi.levels.forEach((l, i) => {
    const c = rgb(l.color);
    p.push(
      buildPacket(
        def,
        'setCpiLevel',
        { level: i, x: l.x / model.cpiStep, y: l.y / model.cpiStep, enabled: l.enabled ? 1 : 0, ...c },
        `CPI level ${i + 1}: ${l.x}×${l.y}${l.enabled ? '' : ' (off)'}`,
      ),
    );
  });
  p.push(buildPacket(def, 'setActiveCpi', { level: profile.cpi.active }, `Active CPI level ${profile.cpi.active + 1}`));
  if (profile.core >= 4) {
    p.push(buildPacket(def, 'setSniperCpi', { cpi: profile.cpi.sniper / model.cpiStep }, `Sniper CPI ${profile.cpi.sniper}`));
  }

  const rate = def.reportRateCodes[String(profile.reportRate)];
  if (rate === undefined) throw new TemplateError(`No report-rate code for ${profile.reportRate} Hz`);
  p.push(buildPacket(def, 'setReportRate', { rate }, `Report rate ${profile.reportRate} Hz`));

  p.push(
    buildPacket(def, 'setKeyResponse', { tenths: profile.keyResponseTenthsMs }, `Key response ${profile.keyResponseTenthsMs / 10} ms`),
  );
  if (!model.lightStrike) {
    p.push(buildPacket(def, 'setDebounce', { ms: profile.debounceMs }, `Debounce ${profile.debounceMs} ms`));
  }
  if (model.liftOff) {
    p.push(buildPacket(def, 'setLiftOff', { lod: def.liftOffCodes[String(profile.liftOff)] ?? profile.liftOff }, `Lift-off level ${profile.liftOff}`));
  }
  if (model.angleSnapping) {
    p.push(buildPacket(def, 'setAngleSnap', { on: profile.angleSnapping ? 1 : 0 }, `Angle snapping ${profile.angleSnapping ? 'on' : 'off'}`));
  }

  const light = profile.lighting;
  const lc = rgb(light.color);
  p.push(
    buildPacket(
      def,
      'setLighting',
      {
        mode: def.lightingModeCodes[light.mode] ?? 0,
        ...lc,
        brightness: Math.round((light.brightness / 100) * 255),
        speed: light.speed,
        cpiIndicator: light.cpiIndicator ? 1 : 0,
      },
      `Lighting: ${light.mode}`,
    ),
  );

  // Only macros actually referenced by buttons are uploaded, in a stable order.
  const used = profile.macros.filter((m) =>
    profile.buttons.some((b) => b.kind === 'macro' && b.macroId === m.id),
  );
  const macroIndex = (id: string) => Math.max(0, used.findIndex((m) => m.id === id));

  profile.buttons.forEach((action, i) => {
    const name = model.buttons[i]?.name ?? `Button ${i + 1}`;
    p.push(buildPacket(def, 'setButton', { button: i, action: encodeAction(action, macroIndex) }, `Button: ${name}`));
  });

  let totalMacroBytes = 0;
  used.forEach((m, mi) => {
    const bytes = encodeMacro(m.events);
    totalMacroBytes += bytes.length;
    for (let off = 0; off < bytes.length; off += def.macroChunkSize) {
      const chunk = bytes.slice(off, off + def.macroChunkSize);
      p.push(
        buildPacket(def, 'writeMacro', { macro: mi, offset: off, len: chunk.length, chunk }, `Macro "${m.name}" bytes ${off}–${off + chunk.length - 1}`),
      );
    }
  });
  if (totalMacroBytes > model.macroMemoryBytes) {
    throw new TemplateError(`Macros need ${totalMacroBytes} bytes; ${model.name} has ${model.macroMemoryBytes}.`);
  }

  if (opts.save) p.push(buildPacket(def, 'saveToFlash', {}, 'Save to on-board flash'));
  return p;
}

export function validateDefinition(raw: unknown): ProtocolDefinition {
  if (!raw || typeof raw !== 'object') throw new Error('Definition must be a JSON object');
  const d = { ...DRAFT_PROTOCOL, ...(raw as Partial<ProtocolDefinition>) };
  d.commands = { ...DRAFT_PROTOCOL.commands, ...((raw as Partial<ProtocolDefinition>).commands ?? {}) };
  d.checksum = { ...DRAFT_PROTOCOL.checksum, ...((raw as Partial<ProtocolDefinition>).checksum ?? {}) };
  if (typeof d.id !== 'string' || !d.id) throw new Error('"id" is required');
  if (!Number.isInteger(d.reportId) || d.reportId < 0 || d.reportId > 255) throw new Error('"reportId" must be 0–255');
  if (!Number.isInteger(d.reportLength) || d.reportLength < 2 || d.reportLength > 1024)
    throw new Error('"reportLength" must be 2–1024');
  if (!['feature', 'output'].includes(d.transport)) throw new Error('"transport" must be feature or output');
  // Dry-run every template so syntax errors surface immediately.
  for (const [name, t] of Object.entries(d.commands)) {
    if (!t) continue;
    for (const token of t.trim().split(/\s+/)) {
      if (!/^[0-9a-fA-F]{2}$/.test(token) && !/^\{\w+(?::(u8|s8|u16le|u16be|bytes))?\}$/.test(token)) {
        throw new Error(`Command "${name}": bad token "${token}"`);
      }
    }
  }
  return d;
}
