import { parseHex } from './protocol';

/**
 * Parse captured USB traffic pasted as text. Accepts:
 *  - one packet per line of hex (`tshark -T fields -e usb.data_fragment`,
 *    `-e usbhid.data`, or "07 0d 00 ..." style)
 *  - Wireshark "Copy as Hex Dump" blocks ("0000  07 0d 00 ...  ascii"),
 *    separated by blank lines.
 */
export function parseCapture(text: string): Uint8Array[] {
  const packets: Uint8Array[] = [];
  let dump: number[] | null = null;
  const flush = () => {
    if (dump && dump.length) packets.push(Uint8Array.from(dump));
    dump = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      flush();
      continue;
    }
    const m = line.match(/^([0-9a-f]{4,8})\s{1,3}((?:[0-9a-f]{2}(?:\s|$)){1,16})/i);
    if (m) {
      const offset = parseInt(m[1], 16);
      if (offset === 0) flush();
      dump ??= [];
      dump.push(...parseHex(m[2]));
      continue;
    }
    flush();
    const bytes = parseHex(line.replace(/[:,]/g, ' '));
    if (bytes.length) packets.push(bytes);
  }
  flush();
  return packets;
}

export interface PacketDiff {
  index: number;
  a?: Uint8Array;
  b?: Uint8Array;
  changed: number[];
}

/** Pairwise diff of two captures, used to locate which bytes encode a setting. */
export function diffCaptures(a: Uint8Array[], b: Uint8Array[]): PacketDiff[] {
  const n = Math.max(a.length, b.length);
  const out: PacketDiff[] = [];
  for (let i = 0; i < n; i++) {
    const pa = a[i];
    const pb = b[i];
    const len = Math.max(pa?.length ?? 0, pb?.length ?? 0);
    const changed: number[] = [];
    for (let j = 0; j < len; j++) if (pa?.[j] !== pb?.[j]) changed.push(j);
    out.push({ index: i, a: pa, b: pb, changed });
  }
  return out;
}
