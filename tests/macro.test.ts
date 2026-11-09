import { describe, expect, it } from 'vitest';
import { decodeMacro, encodeMacro, macroDurationMs, macroProblems, normalizeEvents, pathToMoves } from '../src/model/macro';
import { parseCapture, diffCaptures } from '../src/hid/capture';
import type { MacroEvent } from '../src/model/types';

describe('macro bytecode', () => {
  it('round-trips events', () => {
    const ev: MacroEvent[] = [
      { t: 'loopStart', count: 3 },
      { t: 'keyDown', usage: 0x04 },
      { t: 'delay', ms: 300 },
      { t: 'keyUp', usage: 0x04 },
      { t: 'mouseDown', button: 'left' },
      { t: 'mouseUp', button: 'left' },
      { t: 'move', dx: -5, dy: 7 },
      { t: 'wheel', delta: -1 },
      { t: 'loopEnd' },
    ];
    expect(decodeMacro(encodeMacro(ev))).toEqual(ev);
  });

  it('splits large moves and delays', () => {
    const dec = decodeMacro(encodeMacro([{ t: 'move', dx: 300, dy: 0 }, { t: 'delay', ms: 70000 }]));
    expect(dec.filter((e) => e.t === 'move').reduce((s, e) => s + (e.t === 'move' ? e.dx : 0), 0)).toBe(300);
    expect(dec.filter((e) => e.t === 'delay').reduce((s, e) => s + (e.t === 'delay' ? e.ms : 0), 0)).toBe(70000);
  });

  it('reports structural problems and duration', () => {
    expect(macroProblems({ id: 'a', name: 'a', events: [{ t: 'keyDown', usage: 4 }, { t: 'loopStart', count: 2 }] })).toHaveLength(2);
    expect(macroDurationMs([{ t: 'loopStart', count: 3 }, { t: 'delay', ms: 10 }, { t: 'loopEnd' }, { t: 'delay', ms: 5 }])).toBe(35);
  });

  it('merges delays', () => {
    expect(normalizeEvents([{ t: 'delay', ms: 5 }, { t: 'delay', ms: 0 }, { t: 'delay', ms: 7 }])).toEqual([{ t: 'delay', ms: 12 }]);
  });

  it('turns a drawn path into relative moves preserving total distance and time', () => {
    const pts = Array.from({ length: 21 }, (_, i) => ({ x: i * 2, y: i, t: i * 4 }));
    const ev = pathToMoves(pts, 1, 8);
    const dx = ev.reduce((s, e) => s + (e.t === 'move' ? e.dx : 0), 0);
    const dy = ev.reduce((s, e) => s + (e.t === 'move' ? e.dy : 0), 0);
    expect([dx, dy]).toEqual([40, 20]);
    expect(macroDurationMs(ev)).toBe(80);
  });
});

describe('capture parsing', () => {
  it('parses per-line hex and hex dumps', () => {
    const text = '070d0010\n07 0e 01\n\n0000  07 0d 00 20 00 00 00 00 00 00 00 00 00 00 00 00   ................\n0010  aa bb\n';
    const pk = parseCapture(text);
    expect(pk).toHaveLength(3);
    expect(pk[2].length).toBe(18);
    expect(pk[2][16]).toBe(0xaa);
  });

  it('diffs captures', () => {
    const d = diffCaptures([Uint8Array.of(1, 2, 3)], [Uint8Array.of(1, 9, 3), Uint8Array.of(4)]);
    expect(d[0].changed).toEqual([1]);
    expect(d[1].changed).toEqual([0]);
  });
});
