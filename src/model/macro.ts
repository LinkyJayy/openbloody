import type { Macro, MacroEvent, MouseButtonFn } from './types';
import { keyLabel } from './keys';

// Compact on-board macro bytecode. Each event is one opcode followed by its
// operands. The layout is defined here (not by A4Tech) and is what the
// draft protocol uploads; it is easy to change once real captures exist.
export const OP = {
  END: 0x00,
  KEY_DOWN: 0x01,
  KEY_UP: 0x02,
  MOUSE_DOWN: 0x03,
  MOUSE_UP: 0x04,
  MOVE: 0x05, // int8 dx, int8 dy
  WHEEL: 0x06, // int8
  DELAY: 0x07, // u16le ms
  LOOP_START: 0x08, // u8 count (0 = infinite while held)
  LOOP_END: 0x09,
} as const;

export const MOUSE_BUTTON_CODES: Record<MouseButtonFn, number> = {
  left: 1,
  right: 2,
  middle: 3,
  back: 4,
  forward: 5,
  scrollUp: 6,
  scrollDown: 7,
  tiltLeft: 8,
  tiltRight: 9,
};

const clamp8 = (v: number) => Math.max(-127, Math.min(127, Math.round(v)));

export function encodeMacro(events: MacroEvent[]): Uint8Array {
  const out: number[] = [];
  for (const e of events) {
    switch (e.t) {
      case 'keyDown':
        out.push(OP.KEY_DOWN, e.usage & 0xff);
        break;
      case 'keyUp':
        out.push(OP.KEY_UP, e.usage & 0xff);
        break;
      case 'mouseDown':
        out.push(OP.MOUSE_DOWN, MOUSE_BUTTON_CODES[e.button]);
        break;
      case 'mouseUp':
        out.push(OP.MOUSE_UP, MOUSE_BUTTON_CODES[e.button]);
        break;
      case 'move': {
        // Large moves are split into several int8 steps.
        let dx = Math.round(e.dx);
        let dy = Math.round(e.dy);
        do {
          const sx = clamp8(dx);
          const sy = clamp8(dy);
          out.push(OP.MOVE, sx & 0xff, sy & 0xff);
          dx -= sx;
          dy -= sy;
        } while (dx !== 0 || dy !== 0);
        break;
      }
      case 'wheel':
        out.push(OP.WHEEL, clamp8(e.delta) & 0xff);
        break;
      case 'delay': {
        let ms = Math.max(0, Math.round(e.ms));
        do {
          const chunk = Math.min(ms, 0xffff);
          out.push(OP.DELAY, chunk & 0xff, chunk >> 8);
          ms -= chunk;
        } while (ms > 0);
        break;
      }
      case 'loopStart':
        out.push(OP.LOOP_START, Math.max(0, Math.min(255, e.count)));
        break;
      case 'loopEnd':
        out.push(OP.LOOP_END);
        break;
    }
  }
  out.push(OP.END);
  return Uint8Array.from(out);
}

export function decodeMacro(bytes: Uint8Array): MacroEvent[] {
  const codeToButton = Object.fromEntries(
    Object.entries(MOUSE_BUTTON_CODES).map(([k, v]) => [v, k as MouseButtonFn]),
  );
  const s8 = (b: number) => (b > 127 ? b - 256 : b);
  const events: MacroEvent[] = [];
  let i = 0;
  while (i < bytes.length) {
    const op = bytes[i++];
    switch (op) {
      case OP.END:
        return events;
      case OP.KEY_DOWN:
        events.push({ t: 'keyDown', usage: bytes[i++] });
        break;
      case OP.KEY_UP:
        events.push({ t: 'keyUp', usage: bytes[i++] });
        break;
      case OP.MOUSE_DOWN:
        events.push({ t: 'mouseDown', button: codeToButton[bytes[i++]] });
        break;
      case OP.MOUSE_UP:
        events.push({ t: 'mouseUp', button: codeToButton[bytes[i++]] });
        break;
      case OP.MOVE:
        events.push({ t: 'move', dx: s8(bytes[i]), dy: s8(bytes[i + 1]) });
        i += 2;
        break;
      case OP.WHEEL:
        events.push({ t: 'wheel', delta: s8(bytes[i++]) });
        break;
      case OP.DELAY:
        events.push({ t: 'delay', ms: bytes[i] | (bytes[i + 1] << 8) });
        i += 2;
        break;
      case OP.LOOP_START:
        events.push({ t: 'loopStart', count: bytes[i++] });
        break;
      case OP.LOOP_END:
        events.push({ t: 'loopEnd' });
        break;
      default:
        throw new Error(`Unknown macro opcode 0x${op.toString(16)} at ${i - 1}`);
    }
  }
  return events;
}

export function macroProblems(m: Macro): string[] {
  const problems: string[] = [];
  let depth = 0;
  const held = new Set<string>();
  for (const e of m.events) {
    if (e.t === 'loopStart') depth++;
    if (e.t === 'loopEnd') {
      depth--;
      if (depth < 0) problems.push('Loop end without a matching loop start.');
    }
    if (e.t === 'keyDown') held.add(`k${e.usage}`);
    if (e.t === 'keyUp') held.delete(`k${e.usage}`);
    if (e.t === 'mouseDown') held.add(`m${e.button}`);
    if (e.t === 'mouseUp') held.delete(`m${e.button}`);
  }
  if (depth > 0) problems.push('Loop start without a matching loop end.');
  if (held.size) problems.push(`${held.size} key/button press(es) are never released.`);
  return problems;
}

export function macroDurationMs(events: MacroEvent[]): number {
  let total = 0;
  const stack: { count: number; start: number }[] = [];
  for (const e of events) {
    if (e.t === 'delay') total += e.ms;
    if (e.t === 'loopStart') stack.push({ count: e.count || 1, start: total });
    if (e.t === 'loopEnd') {
      const l = stack.pop();
      if (l) total = l.start + (total - l.start) * l.count;
    }
  }
  return total;
}

export function describeEvent(e: MacroEvent): string {
  switch (e.t) {
    case 'keyDown':
      return `Key ↓ ${keyLabel(e.usage)}`;
    case 'keyUp':
      return `Key ↑ ${keyLabel(e.usage)}`;
    case 'mouseDown':
      return `Mouse ↓ ${e.button}`;
    case 'mouseUp':
      return `Mouse ↑ ${e.button}`;
    case 'move':
      return `Move ${e.dx >= 0 ? '+' : ''}${e.dx}, ${e.dy >= 0 ? '+' : ''}${e.dy}`;
    case 'wheel':
      return `Wheel ${e.delta > 0 ? 'up' : 'down'} ${Math.abs(e.delta)}`;
    case 'delay':
      return `Delay ${e.ms} ms`;
    case 'loopStart':
      return e.count === 0 ? 'Loop (while held)' : `Loop ×${e.count}`;
    case 'loopEnd':
      return 'End loop';
  }
}

/**
 * Turn a drawn path (absolute points sampled over time) into a movement
 * macro: relative moves with delays. `scale` maps canvas pixels to counts.
 */
export function pathToMoves(
  points: { x: number; y: number; t: number }[],
  scale = 1,
  minStepMs = 8,
): MacroEvent[] {
  const events: MacroEvent[] = [];
  if (points.length < 2) return events;
  let last = points[0];
  let lastEmitT = points[0].t;
  let accX = 0;
  let accY = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    accX += (p.x - last.x) * scale;
    accY += (p.y - last.y) * scale;
    const dt = p.t - lastEmitT;
    if (dt >= minStepMs || i === points.length - 1) {
      const dx = Math.round(accX);
      const dy = Math.round(accY);
      if (dx || dy) events.push({ t: 'move', dx, dy });
      accX -= dx;
      accY -= dy;
      events.push({ t: 'delay', ms: Math.max(1, Math.round(dt)) });
      lastEmitT = p.t;
    }
    last = p;
  }
  return normalizeEvents(events);
}

/** Remove consecutive delays and merge them; drop zero delays. */
export function normalizeEvents(events: MacroEvent[]): MacroEvent[] {
  const out: MacroEvent[] = [];
  for (const e of events) {
    const prev = out[out.length - 1];
    if (e.t === 'delay') {
      if (e.ms <= 0) continue;
      if (prev?.t === 'delay') {
        out[out.length - 1] = { t: 'delay', ms: prev.ms + e.ms };
        continue;
      }
    }
    out.push(e);
  }
  return out;
}
