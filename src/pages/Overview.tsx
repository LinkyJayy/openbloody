import { MODELS } from '../hid/devices';
import { hex4 } from '../hid/transport';
import { toHex } from '../hid/protocol';
import { useStore } from '../store';
import { CORE_INFO, type CoreMode } from '../model/types';
import { Card, Field, Notice } from '../components/ui';

export function Overview() {
  const { state, model, profile, transport, deviceInfo, updateProfile, setModel, setState, connect, connectSimulator, readInfo } = useStore();

  return (
    <div className="grid">
      <Card title="Device">
        {transport ? (
          <dl className="kv">
            <dt>Connected</dt>
            <dd>{transport.name}</dd>
            <dt>USB ID</dt>
            <dd className="mono">
              {hex4(transport.vendorId)}:{hex4(transport.productId)}
            </dd>
            <dt>Interfaces</dt>
            <dd className="mono small">
              {transport
                .collections()
                .map((c) => `page ${hex4(c.usagePage)} usage ${hex4(c.usage)} (feat ${c.featureReports.join(',') || '–'})`)
                .join(' · ')}
            </dd>
            <dt>Info report</dt>
            <dd className="mono small">{deviceInfo ? toHex(deviceInfo.slice(0, 16)) : 'not read'}</dd>
          </dl>
        ) : (
          <div className="empty">
            <p>No mouse connected. Plug in your Bloody mouse and connect over WebHID, or try the simulator.</p>
            <div className="row">
              <button className="btn primary" onClick={connect}>
                Connect mouse
              </button>
              <button className="btn" onClick={connectSimulator}>
                Use simulator
              </button>
            </div>
          </div>
        )}
        <Field label="Model" hint={model.notes ?? `${model.sensor} · up to ${model.maxCpi.toLocaleString()} CPI · ${model.buttons.length} buttons · ${model.memorySlots} memory slots`}>
          <select value={model.id} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        {transport && (
          <button className="btn ghost" onClick={readInfo}>
            Re-read device info
          </button>
        )}
      </Card>

      <Card title="Core mode">
        <p className="muted">Core modes unlock firmware features in steps, like the vendor software. Each mode is stored with the profile.</p>
        <div className="core-grid">
          {([1, 2, 3, 4] as CoreMode[]).map((c) => (
            <button
              key={c}
              className={`core-tile ${profile.core === c ? 'active' : ''}`}
              disabled={c > model.maxCore}
              onClick={() => updateProfile((p) => ({ ...p, core: c }))}
              aria-pressed={profile.core === c}
            >
              <strong>{CORE_INFO[c].title}</strong>
              <span>{CORE_INFO[c].summary}</span>
            </button>
          ))}
        </div>
        {profile.core >= 3 && (
          <Notice kind="warn">
            On genuine hardware, Core 3 and Core 4 may need to be activated in A4Tech's software before the firmware accepts them.
            OpenBloody does not bypass activation.
          </Notice>
        )}
      </Card>

      <Card title="Active profile">
        <dl className="kv">
          <dt>Profile</dt>
          <dd>{profile.name}</dd>
          <dt>CPI</dt>
          <dd>
            {profile.cpi.levels
              .filter((l) => l.enabled)
              .map((l) => (l.x === l.y ? l.x : `${l.x}×${l.y}`))
              .join(' / ')}
          </dd>
          <dt>Report rate</dt>
          <dd>{profile.reportRate} Hz</dd>
          <dt>Lighting</dt>
          <dd>{profile.lighting.mode}</dd>
          <dt>Macros</dt>
          <dd>{profile.macros.length}</dd>
        </dl>
      </Card>

      <Card title="On-board memory">
        <p className="muted">Pick the slot that “Write to mouse” targets. Settings in a slot stay on the mouse and work on any PC without software.</p>
        <div className="slots">
          {state.slots.map((pid, i) => {
            const p = state.profiles.find((x) => x.id === pid);
            return (
              <button
                key={i}
                className={`slot ${state.activeSlot === i ? 'active' : ''}`}
                onClick={() => setState((s) => ({ ...s, activeSlot: i }))}
                aria-pressed={state.activeSlot === i}
              >
                <span className="slot-n">{i + 1}</span>
                <span className="slot-name">{p ? p.name : 'Empty / unknown'}</span>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
