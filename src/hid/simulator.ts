import { A4TECH_VENDOR_ID, type MouseModel } from './devices';
import { DRAFT_PROTOCOL, toHex, type CommandName, type ProtocolDefinition } from './protocol';
import { log, type CollectionInfo, type Transport } from './transport';

/**
 * A virtual Bloody mouse that understands the bundled draft protocol. It lets
 * the whole UI and write pipeline be exercised without hardware, and is what
 * the test suite uses.
 */
export class SimulatedTransport implements Transport {
  readonly simulated = true;
  readonly vendorId = A4TECH_VENDOR_ID;
  readonly productId = 0x7fff;
  readonly name: string;
  readonly productName: string;
  /** Last packet received per command, per memory slot. */
  readonly memory = new Map<string, Uint8Array>();
  slot = 0;
  saves = 0;
  private inputListeners = new Set<(id: number, d: Uint8Array) => void>();
  private opcodeToCommand = new Map<number, CommandName>();

  constructor(
    public model: MouseModel,
    private def: ProtocolDefinition = DRAFT_PROTOCOL,
  ) {
    this.name = `${model.name} (simulated)`;
    this.productName = this.name;
    for (const [cmd, tpl] of Object.entries(def.commands) as [CommandName, string][]) {
      const first = tpl.trim().split(/\s+/)[0];
      if (/^[0-9a-f]{2}$/i.test(first)) this.opcodeToCommand.set(parseInt(first, 16), cmd);
    }
    log({ dir: 'info', text: `Simulator started for ${model.name}` });
  }

  collections(): CollectionInfo[] {
    return [
      { usagePage: 0x01, usage: 0x02, inputReports: [1], outputReports: [], featureReports: [] },
      {
        usagePage: 0xff00,
        usage: 0x01,
        inputReports: [this.def.reportId],
        outputReports: [this.def.reportId],
        featureReports: [this.def.reportId],
      },
    ];
  }

  private handle(reportId: number, data: Uint8Array) {
    if (reportId !== this.def.reportId) throw new Error(`Simulator: unexpected report ID ${reportId}`);
    const cmd = this.opcodeToCommand.get(data[0]);
    if (!cmd) throw new Error(`Simulator: unknown opcode 0x${data[0].toString(16)}`);
    if (cmd === 'selectSlot') this.slot = data[1];
    if (cmd === 'saveToFlash') this.saves++;
    if (cmd === 'factoryReset') this.memory.clear();
    const key =
      cmd === 'setCpiLevel' || cmd === 'setButton' || cmd === 'writeMacro'
        ? `${this.slot}:${cmd}:${data[1]}:${cmd === 'writeMacro' ? data[2] | (data[3] << 8) : ''}`
        : `${this.slot}:${cmd}`;
    this.memory.set(key, data.slice());
  }

  async sendFeature(reportId: number, data: Uint8Array) {
    log({ dir: 'out', kind: 'feature', reportId, hex: toHex(data), text: 'SET_FEATURE (sim)' });
    this.handle(reportId, data);
  }

  async sendOutput(reportId: number, data: Uint8Array) {
    log({ dir: 'out', kind: 'output', reportId, hex: toHex(data), text: 'OUTPUT (sim)' });
    this.handle(reportId, data);
  }

  async receiveFeature(reportId: number) {
    const data = new Uint8Array(this.def.reportLength);
    // [opcode, fw major, fw minor, active slot, slots, maxCpi/100 u16le]
    data.set([0x03, 1, 7, this.slot, this.model.memorySlots, (this.model.maxCpi / 100) & 0xff, (this.model.maxCpi / 100) >> 8]);
    log({ dir: 'in', kind: 'feature', reportId, hex: toHex(data), text: 'GET_FEATURE (sim)' });
    return data;
  }

  onInput(cb: (reportId: number, data: Uint8Array) => void) {
    this.inputListeners.add(cb);
    return () => this.inputListeners.delete(cb);
  }

  async close() {
    log({ dir: 'info', text: 'Simulator stopped' });
  }
}
