import { describe, expect, it } from 'vitest';
import {
  applyChecksum,
  buildPacket,
  buildProfilePackets,
  DRAFT_PROTOCOL,
  fillTemplate,
  parseHex,
  TemplateError,
  toHex,
  validateDefinition,
} from '../src/hid/protocol';
import { getModel, identifyModel } from '../src/hid/devices';
import { defaultProfile, fitProfileToModel, uid } from '../src/model/types';
import { SimulatedTransport } from '../src/hid/simulator';
import { sendPackets } from '../src/hid/transport';

describe('templates', () => {
  it('fills literal bytes and typed fields', () => {
    const out = fillTemplate('0D {level} {x:u16le} {y:u16be} {d:s8} {b:bytes}', {
      level: 2,
      x: 0x1234,
      y: 0x1234,
      d: -1,
      b: Uint8Array.of(9, 8),
    });
    expect(out).toEqual([0x0d, 2, 0x34, 0x12, 0x12, 0x34, 0xff, 9, 8]);
  });

  it('rejects bad tokens and missing fields', () => {
    expect(() => fillTemplate('0G', {})).toThrow(TemplateError);
    expect(() => fillTemplate('{nope}', {})).toThrow(/Missing field/);
  });

  it('pads packets to the report length', () => {
    const p = buildPacket(DRAFT_PROTOCOL, 'setReportRate', { rate: 1 });
    expect(p.data.length).toBe(DRAFT_PROTOCOL.reportLength);
    expect(p.reportId).toBe(DRAFT_PROTOCOL.reportId);
    expect(Array.from(p.data.slice(0, 3))).toEqual([0x10, 1, 0]);
  });

  it('computes checksums', () => {
    const def = { ...DRAFT_PROTOCOL, reportLength: 4, checksum: { type: 'sum8' as const, index: 3, from: 0, to: 2 } };
    const d = Uint8Array.of(0xff, 0x02, 0x00, 0x00);
    applyChecksum(d, def);
    expect(d[3]).toBe(0x01);
    const x = Uint8Array.of(0x0f, 0xf0, 0x00, 0x00);
    applyChecksum(x, { ...def, checksum: { ...def.checksum, type: 'xor8' } });
    expect(x[3]).toBe(0xff);
    const t = Uint8Array.of(0x01, 0x00, 0x00, 0x00);
    applyChecksum(t, { ...def, checksum: { ...def.checksum, type: 'twos8' } });
    expect(t[3]).toBe(0xff);
  });

  it('parses and formats hex', () => {
    expect(Array.from(parseHex('07 0d,0x10 ff'))).toEqual([7, 13, 16, 255]);
    expect(Array.from(parseHex('070d10'))).toEqual([7, 13, 16]);
    expect(toHex([1, 171])).toBe('01 ab');
  });

  it('validates definitions', () => {
    expect(validateDefinition({ id: 'x', commands: { setCore: '0B {core}' } }).commands.setCore).toBe('0B {core}');
    expect(() => validateDefinition({ id: 'x', commands: { setCore: 'zz' } })).toThrow(/bad token/);
    expect(() => validateDefinition({ id: 'x', reportId: 300 })).toThrow(/reportId/);
  });
});

describe('models', () => {
  it('identifies models by product name, preferring the longest match', () => {
    expect(identifyModel('Bloody A70X Gaming Mouse')?.id).toBe('a70x');
    expect(identifyModel('BLOODY A70')?.id).toBe('a70');
    expect(identifyModel('A90 Blazing')?.id).toBe('a90');
    expect(identifyModel('Some other mouse')).toBeUndefined();
  });

  it('fits a profile to a smaller model', () => {
    const big = defaultProfile(getModel('es9pro'));
    big.cpi.levels[4].x = 16000;
    big.reportRate = 1000;
    const small = fitProfileToModel(big, getModel('r70'));
    expect(small.cpi.levels[4].x).toBe(4000);
    expect(small.reportRate).toBe(500);
    expect(small.buttons.length).toBe(getModel('r70').buttons.length);
  });
});

describe('profile packets + simulator', () => {
  it('builds a full write sequence and the simulator accepts it', async () => {
    const model = getModel('a70');
    const p = defaultProfile(model);
    p.core = 4;
    const macroId = uid();
    p.macros = [
      { id: macroId, name: 'm', events: Array.from({ length: 40 }, () => ({ t: 'move' as const, dx: 1, dy: 1 })) },
      { id: uid(), name: 'unused', events: [{ t: 'delay', ms: 5 }] },
    ];
    p.buttons[7] = { kind: 'macro', macroId, repeat: 'hold', count: 1 };

    const packets = buildProfilePackets(p, model, DRAFT_PROTOCOL, { slot: 2, save: true });
    const labels = packets.map((x) => x.label);
    expect(labels[0]).toMatch(/slot 3/);
    expect(labels.at(-1)).toMatch(/flash/);
    expect(labels.some((l) => l.startsWith('Sniper'))).toBe(true);
    // 40 moves * 3 bytes + END = 121 bytes => 3 chunks of 48
    expect(labels.filter((l) => l.startsWith('Macro')).length).toBe(3);
    expect(labels.some((l) => l.includes('unused'))).toBe(false);

    const sim = new SimulatedTransport(model);
    await sendPackets(sim, { ...DRAFT_PROTOCOL, interPacketDelayMs: 0 }, packets);
    expect(sim.slot).toBe(2);
    expect(sim.saves).toBe(1);
    expect(sim.memory.get('2:setCore')?.[1]).toBe(4);
    const info = await sim.receiveFeature(DRAFT_PROTOCOL.reportId);
    expect(info[0]).toBe(0x03);
  });

  it('refuses macros larger than device memory', () => {
    const model = { ...getModel('a70'), macroMemoryBytes: 10 };
    const p = defaultProfile(model);
    const id = uid();
    p.macros = [{ id, name: 'big', events: Array.from({ length: 10 }, () => ({ t: 'delay' as const, ms: 1 })) }];
    p.buttons[3] = { kind: 'macro', macroId: id, repeat: 'once', count: 1 };
    expect(() => buildProfilePackets(p, model, DRAFT_PROTOCOL, { slot: 0, save: false })).toThrow(/bytes/);
  });
});
