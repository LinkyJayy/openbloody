import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Notice, Segmented, Toggle } from '../components/ui';
import { DRAFT_PROTOCOL, parseHex, toHex, validateDefinition, type Packet } from '../hid/protocol';
import { diffCaptures, parseCapture } from '../hid/capture';
import { log } from '../hid/transport';
import { download } from '../model/storage';

export function ProtocolLab() {
  return (
    <div className="grid lab">
      <RawConsole />
      <TrafficLog />
      <WritePreview />
      <DefinitionEditor />
      <CaptureDiff />
    </div>
  );
}

function RawConsole() {
  const { transport, state } = useStore();
  const [kind, setKind] = useState<'feature' | 'output'>(state.protocol.transport);
  const [reportId, setReportId] = useState(state.protocol.reportId.toString(16).padStart(2, '0'));
  const [payload, setPayload] = useState('03 00');
  const [pad, setPad] = useState(true);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!transport || !listening) return;
    return transport.onInput(() => undefined); // logging happens in the transport
  }, [transport, listening]);

  const send = async () => {
    if (!transport) return;
    try {
      const id = parseInt(reportId, 16) || 0;
      let data = parseHex(payload);
      if (pad && data.length < state.protocol.reportLength) {
        const p = new Uint8Array(state.protocol.reportLength);
        p.set(data);
        data = p;
      }
      if (kind === 'feature') await transport.sendFeature(id, data);
      else await transport.sendOutput(id, data);
    } catch (e) {
      log({ dir: 'error', text: (e as Error).message });
    }
  };

  const get = async () => {
    if (!transport) return;
    try {
      await transport.receiveFeature(parseInt(reportId, 16) || 0);
    } catch (e) {
      log({ dir: 'error', text: (e as Error).message });
    }
  };

  return (
    <Card title="Raw HID console">
      <Notice kind="warn">Sends exactly the bytes you type to the connected device. Unknown commands can change or erase on-board settings.</Notice>
      {!transport && <p className="muted">Connect a mouse or the simulator first.</p>}
      <div className="row wrap">
        <Segmented
          ariaLabel="Report type"
          value={kind}
          options={[
            { value: 'feature', label: 'Feature' },
            { value: 'output', label: 'Output' },
          ]}
          onChange={setKind}
        />
        <label className="inline">
          Report ID 0x
          <input className="mono narrow" value={reportId} onChange={(e) => setReportId(e.target.value)} aria-label="Report ID (hex)" />
        </label>
        <Toggle checked={pad} onChange={setPad} label={`Zero-pad to ${state.protocol.reportLength} bytes`} />
      </div>
      <Field label="Payload (hex)">
        <textarea className="mono" rows={3} value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} />
      </Field>
      <div className="row wrap">
        <button className="btn primary" disabled={!transport} onClick={send}>
          Send
        </button>
        <button className="btn" disabled={!transport} onClick={get}>
          Get feature report
        </button>
        <Toggle checked={listening} onChange={setListening} label="Log input reports" />
      </div>
    </Card>
  );
}

function TrafficLog() {
  const { logs, clearLogs } = useStore();
  const [filter, setFilter] = useState<'all' | 'io' | 'errors'>('all');
  const shown = logs.filter((l) => filter === 'all' || (filter === 'io' ? l.dir === 'in' || l.dir === 'out' : l.dir === 'error')).slice(-200);
  return (
    <Card
      title="Traffic log"
      actions={
        <>
          <Segmented
            ariaLabel="Log filter"
            value={filter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'io', label: 'I/O' },
              { value: 'errors', label: 'Errors' },
            ]}
            onChange={setFilter}
          />
          <button className="btn ghost" onClick={() => download(new Blob([logs.map((l) => `${new Date(l.time).toISOString()} ${l.dir} ${l.kind ?? ''} ${l.reportId ?? ''} ${l.text} ${l.hex ?? ''}`).join('\n')], { type: 'text/plain' }), 'openbloody-log.txt')}>
            Save
          </button>
          <button className="btn ghost" onClick={clearLogs}>
            Clear
          </button>
        </>
      }
    >
      <div className="log" role="log">
        {shown.length === 0 && <p className="muted">Nothing yet.</p>}
        {shown.map((l) => (
          <div key={l.id} className={`log-line log-${l.dir}`}>
            <span className="log-time">{new Date(l.time).toLocaleTimeString()}</span>
            <span className="log-dir">{l.dir === 'out' ? '→' : l.dir === 'in' ? '←' : l.dir === 'error' ? '!' : 'i'}</span>
            <span className="log-text">
              {l.text}
              {l.reportId !== undefined && ` #${l.reportId.toString(16).padStart(2, '0')}`}
            </span>
            {l.hex && <code className="log-hex">{l.hex}</code>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function WritePreview() {
  const { previewPackets, state } = useStore();
  const [open, setOpen] = useState(false);
  let packets: Packet[] = [];
  let error = '';
  if (open) {
    try {
      packets = previewPackets(state.activeSlot);
    } catch (e) {
      error = (e as Error).message;
    }
  }
  return (
    <Card title="Write preview" actions={<button className="btn" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show packets'}</button>}>
      <p className="muted">Exactly what “Write to mouse” sends for the current profile, one row per report.</p>
      {error && <p className="warn-text">{error}</p>}
      {open && (
        <table className="packets">
          <thead>
            <tr>
              <th>#</th>
              <th>Step</th>
              <th>Bytes</th>
            </tr>
          </thead>
          <tbody>
            {packets.map((p, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{p.label}</td>
                <td className="mono small">
                  {p.reportId.toString(16).padStart(2, '0')} | {toHex(trimZeros(p.data))}
                  {trimZeros(p.data).length < p.data.length && ' …'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function trimZeros(d: Uint8Array): Uint8Array {
  let end = d.length;
  while (end > 1 && d[end - 1] === 0) end--;
  return d.slice(0, end);
}

function DefinitionEditor() {
  const { state, setState, toast } = useStore();
  const [text, setText] = useState(() => JSON.stringify(state.protocol, null, 2));
  const [error, setError] = useState('');

  const save = () => {
    try {
      const def = validateDefinition(JSON.parse(text));
      setState((s) => ({ ...s, protocol: def }));
      setText(JSON.stringify(def, null, 2));
      setError('');
      toast(`Protocol "${def.name}" saved`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Card
      title="Protocol definition"
      actions={
        <>
          <button className="btn ghost" onClick={() => download(new Blob([text], { type: 'application/json' }), `${state.protocol.id}.json`)}>
            Download
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setText(JSON.stringify(DRAFT_PROTOCOL, null, 2));
              setState((s) => ({ ...s, protocol: DRAFT_PROTOCOL }));
            }}
          >
            Reset to draft
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <p className="muted">
        Each setting maps to a command template, e.g. <code>"setCpiLevel": "0D {'{level}'} {'{x:u16le}'} {'{y:u16le}'}"</code>. Field types:
        u8 (default), s8, u16le, u16be, bytes. Set <code>"verified": true</code> once the templates match captured traffic from your model.
      </p>
      {state.protocol.verified ? (
        <Notice kind="info">This definition is marked verified. Writes to real hardware are enabled.</Notice>
      ) : (
        <Notice kind="warn">This definition is unverified. Writes to real hardware stay blocked unless you allow them in Settings.</Notice>
      )}
      <textarea className="mono code-edit" rows={18} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Protocol definition JSON" />
      {error && <p className="warn-text">{error}</p>}
    </Card>
  );
}

function CaptureDiff() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const diff = useMemo(() => diffCaptures(parseCapture(a), parseCapture(b)), [a, b]);
  const changedPackets = diff.filter((d) => d.changed.length);

  return (
    <Card title="Capture diff">
      <p className="muted">
        Record BloodyWorkshop with USBPcap + Wireshark twice, changing one setting in between (e.g. CPI 800 → 1600). Paste each capture's
        data bytes (one report per line, or a hex dump) below. Bytes that differ show which positions encode that setting.
      </p>
      <div className="row stretch">
        <Field label={`Capture A (${parseCapture(a).length} packets)`}>
          <textarea className="mono" rows={6} value={a} onChange={(e) => setA(e.target.value)} spellCheck={false} />
        </Field>
        <Field label={`Capture B (${parseCapture(b).length} packets)`}>
          <textarea className="mono" rows={6} value={b} onChange={(e) => setB(e.target.value)} spellCheck={false} />
        </Field>
      </div>
      {(a || b) && (
        <>
          <p className="small">
            {changedPackets.length} of {diff.length} packets differ.
          </p>
          <div className="diff">
            {changedPackets.slice(0, 50).map((d) => (
              <div key={d.index} className="diff-row">
                <span className="muted">#{d.index + 1}</span>
                <DiffBytes bytes={d.a} changed={d.changed} label="A" />
                <DiffBytes bytes={d.b} changed={d.changed} label="B" />
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function DiffBytes({ bytes, changed, label }: { bytes?: Uint8Array; changed: number[]; label: string }) {
  const set = new Set(changed);
  return (
    <code className="diff-bytes">
      <span className="muted">{label} </span>
      {bytes
        ? Array.from(bytes).map((v, i) => (
            <span key={i} className={set.has(i) ? 'hl' : ''} title={`offset ${i}`}>
              {v.toString(16).padStart(2, '0')}{' '}
            </span>
          ))
        : '(missing)'}
    </code>
  );
}
