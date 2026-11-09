import { A4TECH_VENDOR_ID } from './devices';
import { toHex, type Packet, type ProtocolDefinition } from './protocol';

export interface LogEntry {
  id: number;
  time: number;
  dir: 'out' | 'in' | 'info' | 'error';
  kind?: 'feature' | 'output' | 'input';
  reportId?: number;
  hex?: string;
  text: string;
}

export interface CollectionInfo {
  usagePage: number;
  usage: number;
  inputReports: number[];
  outputReports: number[];
  featureReports: number[];
}

export interface Transport {
  readonly name: string;
  readonly productName: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly simulated: boolean;
  collections(): CollectionInfo[];
  sendFeature(reportId: number, data: Uint8Array): Promise<void>;
  receiveFeature(reportId: number): Promise<Uint8Array>;
  sendOutput(reportId: number, data: Uint8Array): Promise<void>;
  onInput(cb: (reportId: number, data: Uint8Array) => void): () => void;
  close(): Promise<void>;
}

let logId = 0;
type LogListener = (e: LogEntry) => void;
const listeners = new Set<LogListener>();

export function log(entry: Omit<LogEntry, 'id' | 'time'>): void {
  const e = { ...entry, id: ++logId, time: Date.now() };
  listeners.forEach((l) => l(e));
}

export function subscribeLog(l: LogListener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function webHidSupported(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator;
}

function describeCollections(device: HIDDevice): CollectionInfo[] {
  return (device.collections ?? []).map((c) => ({
    usagePage: c.usagePage ?? 0,
    usage: c.usage ?? 0,
    inputReports: (c.inputReports ?? []).map((r) => r.reportId ?? 0),
    outputReports: (c.outputReports ?? []).map((r) => r.reportId ?? 0),
    featureReports: (c.featureReports ?? []).map((r) => r.reportId ?? 0),
  }));
}

/** A vendor-defined collection (usage page 0xFF00–0xFFFF) is where configuration traffic lives. */
export function isConfigInterface(device: HIDDevice): boolean {
  return describeCollections(device).some(
    (c) => c.usagePage >= 0xff00 && (c.featureReports.length > 0 || c.outputReports.length > 0),
  );
}

export class WebHidTransport implements Transport {
  readonly simulated = false;
  constructor(private device: HIDDevice) {}

  get name() {
    return this.device.productName || 'Bloody mouse';
  }
  get productName() {
    return this.device.productName;
  }
  get vendorId() {
    return this.device.vendorId;
  }
  get productId() {
    return this.device.productId;
  }

  collections() {
    return describeCollections(this.device);
  }

  async open() {
    if (!this.device.opened) await this.device.open();
    log({ dir: 'info', text: `Opened ${this.name} (${hex4(this.vendorId)}:${hex4(this.productId)})` });
  }

  async sendFeature(reportId: number, data: Uint8Array) {
    log({ dir: 'out', kind: 'feature', reportId, hex: toHex(data), text: 'SET_FEATURE' });
    await this.device.sendFeatureReport(reportId, data as Uint8Array<ArrayBuffer>);
  }

  async receiveFeature(reportId: number) {
    const view = await this.device.receiveFeatureReport(reportId);
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    // Chrome includes the report ID as the first byte on some platforms.
    const data = bytes[0] === reportId && reportId !== 0 ? bytes.slice(1) : bytes.slice();
    log({ dir: 'in', kind: 'feature', reportId, hex: toHex(data), text: 'GET_FEATURE' });
    return data;
  }

  async sendOutput(reportId: number, data: Uint8Array) {
    log({ dir: 'out', kind: 'output', reportId, hex: toHex(data), text: 'OUTPUT' });
    await this.device.sendReport(reportId, data as Uint8Array<ArrayBuffer>);
  }

  onInput(cb: (reportId: number, data: Uint8Array) => void) {
    const handler = (e: HIDInputReportEvent) => {
      const data = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength).slice();
      log({ dir: 'in', kind: 'input', reportId: e.reportId, hex: toHex(data), text: 'INPUT' });
      cb(e.reportId, data);
    };
    this.device.addEventListener('inputreport', handler);
    return () => this.device.removeEventListener('inputreport', handler);
  }

  async close() {
    if (this.device.opened) await this.device.close();
    log({ dir: 'info', text: `Closed ${this.name}` });
  }
}

export function hex4(n: number): string {
  return n.toString(16).padStart(4, '0');
}

/**
 * Ask the browser for a Bloody mouse. A mouse exposes several HID interfaces;
 * we pick the one with a vendor-defined collection.
 */
export async function requestBloodyDevice(): Promise<WebHidTransport | undefined> {
  if (!webHidSupported()) throw new Error('WebHID is not available. Use Chrome, Edge or Opera on desktop.');
  const devices = await navigator.hid.requestDevice({
    filters: [{ vendorId: A4TECH_VENDOR_ID, usagePage: 0xff00 }, { vendorId: A4TECH_VENDOR_ID }],
  });
  return pickTransport(devices);
}

export async function reconnectKnownDevice(): Promise<WebHidTransport | undefined> {
  if (!webHidSupported()) return undefined;
  const devices = (await navigator.hid.getDevices()).filter((d) => d.vendorId === A4TECH_VENDOR_ID);
  return pickTransport(devices);
}

async function pickTransport(devices: HIDDevice[]): Promise<WebHidTransport | undefined> {
  if (!devices.length) return undefined;
  const device = devices.find(isConfigInterface) ?? devices[0];
  if (!isConfigInterface(device)) {
    log({
      dir: 'error',
      text: 'No vendor-defined HID collection found. The browser may only expose the pointer interface; configuration may not work.',
    });
  }
  const t = new WebHidTransport(device);
  await t.open();
  return t;
}

export async function sendPacket(t: Transport, def: ProtocolDefinition, p: Packet): Promise<void> {
  if (def.transport === 'feature') await t.sendFeature(p.reportId, p.data);
  else await t.sendOutput(p.reportId, p.data);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendPackets(
  t: Transport,
  def: ProtocolDefinition,
  packets: Packet[],
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<void> {
  for (let i = 0; i < packets.length; i++) {
    onProgress?.(i, packets.length, packets[i].label);
    await sendPacket(t, def, packets[i]);
    if (def.interPacketDelayMs) await sleep(def.interPacketDelayMs);
  }
  onProgress?.(packets.length, packets.length, 'Done');
}
