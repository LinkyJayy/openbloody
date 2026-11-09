import { useState } from 'react';
import { KEYBOARD_KEYS, MEDIA_KEYS, MODIFIERS, keyLabel, mediaLabel, modifierLabel, usageFromCode } from '../model/keys';
import { actionAllowed, type ButtonAction, type CoreMode, type Macro, type MouseButtonFn } from '../model/types';
import { Field, Slider } from './ui';

const KIND_LABELS: Record<ButtonAction['kind'], string> = {
  mouse: 'Mouse function',
  key: 'Keyboard key',
  media: 'Media / system',
  fire: 'Fire mode (Core 2+)',
  macro: 'Macro (Core 3+)',
  cpi: 'CPI control',
  profile: 'Profile switch',
  core: 'Core switch',
  disabled: 'Disabled',
};

const MOUSE_FNS: { v: MouseButtonFn; l: string }[] = [
  { v: 'left', l: 'Left click' },
  { v: 'right', l: 'Right click' },
  { v: 'middle', l: 'Middle click' },
  { v: 'back', l: 'Back' },
  { v: 'forward', l: 'Forward' },
  { v: 'scrollUp', l: 'Scroll up' },
  { v: 'scrollDown', l: 'Scroll down' },
  { v: 'tiltLeft', l: 'Tilt left' },
  { v: 'tiltRight', l: 'Tilt right' },
];

export function describeAction(a: ButtonAction, macros: Macro[]): string {
  switch (a.kind) {
    case 'mouse':
      return MOUSE_FNS.find((m) => m.v === a.button)?.l ?? a.button;
    case 'key':
      return [modifierLabel(a.modifiers), keyLabel(a.usage)].filter(Boolean).join('+');
    case 'media':
      return mediaLabel(a.usage);
    case 'fire':
      return a.pattern === 'rapid' ? `Rapid fire (${a.intervalMs} ms)` : `${a.pattern === 'double' ? '2' : '3'}-shot burst`;
    case 'macro': {
      const m = macros.find((x) => x.id === a.macroId);
      return `Macro: ${m?.name ?? '(missing)'}`;
    }
    case 'cpi':
      return a.op === 'set' ? `CPI level ${a.level + 1}` : { up: 'CPI +', down: 'CPI −', cycle: 'CPI cycle', sniper: 'Sniper (hold)' }[a.op];
    case 'profile':
      return a.op === 'set' ? `Profile slot ${a.slot + 1}` : a.op === 'next' ? 'Next profile' : 'Previous profile';
    case 'core':
      return a.op === 'cycle' ? 'Cycle Core mode' : `Core ${a.core}`;
    case 'disabled':
      return 'Disabled';
  }
}

function defaultFor(kind: ButtonAction['kind'], macros: Macro[]): ButtonAction {
  switch (kind) {
    case 'mouse':
      return { kind, button: 'left' };
    case 'key':
      return { kind, usage: 0x04, modifiers: 0 };
    case 'media':
      return { kind, usage: 0xcd };
    case 'fire':
      return { kind, pattern: 'triple', intervalMs: 60 };
    case 'macro':
      return { kind, macroId: macros[0]?.id ?? '', repeat: 'once', count: 1 };
    case 'cpi':
      return { kind, op: 'up', level: 0 };
    case 'profile':
      return { kind, op: 'next', slot: 0 };
    case 'core':
      return { kind, op: 'cycle', core: 1 };
    case 'disabled':
      return { kind };
  }
}

export function ActionEditor({
  action,
  onChange,
  core,
  macros,
  cpiLevels,
  slots,
}: {
  action: ButtonAction;
  onChange: (a: ButtonAction) => void;
  core: CoreMode;
  macros: Macro[];
  cpiLevels: number;
  slots: number;
}) {
  const [capturing, setCapturing] = useState(false);
  const allowed = actionAllowed(action, core);

  return (
    <div className="action-editor">
      <Field label="Function">
        <select value={action.kind} onChange={(e) => onChange(defaultFor(e.target.value as ButtonAction['kind'], macros))}>
          {Object.entries(KIND_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>

      {!allowed && <p className="warn-text">This function needs a higher Core mode. Change it on the Overview page.</p>}

      {action.kind === 'mouse' && (
        <Field label="Mouse function">
          <select value={action.button} onChange={(e) => onChange({ ...action, button: e.target.value as MouseButtonFn })}>
            {MOUSE_FNS.map((m) => (
              <option key={m.v} value={m.v}>
                {m.l}
              </option>
            ))}
          </select>
        </Field>
      )}

      {action.kind === 'key' && (
        <>
          <Field label="Key" hint="Pick from the list or press “Capture” and hit a key.">
            <div className="row">
              <select value={action.usage} onChange={(e) => onChange({ ...action, usage: Number(e.target.value) })}>
                {KEYBOARD_KEYS.map((k) => (
                  <option key={k.usage} value={k.usage}>
                    {k.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={capturing ? 'btn primary' : 'btn'}
                onKeyDown={(e) => {
                  if (!capturing) return;
                  e.preventDefault();
                  const u = usageFromCode(e.code);
                  if (u !== undefined) {
                    onChange({ ...action, usage: u });
                    setCapturing(false);
                  }
                }}
                onBlur={() => setCapturing(false)}
                onClick={() => setCapturing((c) => !c)}
              >
                {capturing ? 'Press a key…' : 'Capture'}
              </button>
            </div>
          </Field>
          <div className="row wrap">
            {MODIFIERS.map((m) => (
              <label key={m.bit} className="chip-check">
                <input
                  type="checkbox"
                  checked={(action.modifiers & m.bit) !== 0}
                  onChange={(e) => onChange({ ...action, modifiers: e.target.checked ? action.modifiers | m.bit : action.modifiers & ~m.bit })}
                />
                {m.label}
              </label>
            ))}
          </div>
        </>
      )}

      {action.kind === 'media' && (
        <Field label="Media / system key">
          <select value={action.usage} onChange={(e) => onChange({ ...action, usage: Number(e.target.value) })}>
            {MEDIA_KEYS.map((k) => (
              <option key={k.usage} value={k.usage}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      {action.kind === 'fire' && (
        <>
          <Field label="Pattern">
            <select value={action.pattern} onChange={(e) => onChange({ ...action, pattern: e.target.value as 'double' | 'triple' | 'rapid' })}>
              <option value="double">2-shot burst</option>
              <option value="triple">3-shot burst</option>
              <option value="rapid">Rapid fire while held</option>
            </select>
          </Field>
          <Field label="Click interval">
            <Slider min={10} max={500} step={5} value={action.intervalMs} onChange={(v) => onChange({ ...action, intervalMs: v })} format={(v) => `${v} ms`} />
          </Field>
        </>
      )}

      {action.kind === 'macro' && (
        <>
          {macros.length === 0 ? (
            <p className="muted">No macros yet. Create one on the Macros page.</p>
          ) : (
            <Field label="Macro">
              <select value={action.macroId} onChange={(e) => onChange({ ...action, macroId: e.target.value })}>
                {macros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Playback">
            <select value={action.repeat} onChange={(e) => onChange({ ...action, repeat: e.target.value as 'once' | 'hold' | 'toggle' | 'count' })}>
              <option value="once">Play once per press</option>
              <option value="hold">Repeat while held</option>
              <option value="toggle">Toggle on/off</option>
              <option value="count">Repeat N times</option>
            </select>
          </Field>
          {action.repeat === 'count' && (
            <Field label="Repeat count">
              <input type="number" min={1} max={255} value={action.count} onChange={(e) => onChange({ ...action, count: Math.max(1, Math.min(255, Number(e.target.value))) })} />
            </Field>
          )}
        </>
      )}

      {action.kind === 'cpi' && (
        <>
          <Field label="CPI action">
            <select value={action.op} onChange={(e) => onChange({ ...action, op: e.target.value as 'up' | 'down' | 'cycle' | 'sniper' | 'set' })}>
              <option value="up">CPI up</option>
              <option value="down">CPI down</option>
              <option value="cycle">Cycle levels</option>
              <option value="set">Jump to level</option>
              <option value="sniper">Sniper — hold for sniper CPI (Core 4)</option>
            </select>
          </Field>
          {action.op === 'set' && (
            <Field label="Level">
              <select value={action.level} onChange={(e) => onChange({ ...action, level: Number(e.target.value) })}>
                {Array.from({ length: cpiLevels }, (_, i) => (
                  <option key={i} value={i}>
                    Level {i + 1}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </>
      )}

      {action.kind === 'profile' && (
        <>
          <Field label="Profile action">
            <select value={action.op} onChange={(e) => onChange({ ...action, op: e.target.value as 'next' | 'prev' | 'set' })}>
              <option value="next">Next memory slot</option>
              <option value="prev">Previous memory slot</option>
              <option value="set">Jump to slot</option>
            </select>
          </Field>
          {action.op === 'set' && (
            <Field label="Slot">
              <select value={action.slot} onChange={(e) => onChange({ ...action, slot: Number(e.target.value) })}>
                {Array.from({ length: slots }, (_, i) => (
                  <option key={i} value={i}>
                    Slot {i + 1}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </>
      )}

      {action.kind === 'core' && (
        <Field label="Core action">
          <select
            value={action.op === 'cycle' ? 'cycle' : String(action.core)}
            onChange={(e) =>
              onChange(e.target.value === 'cycle' ? { kind: 'core', op: 'cycle', core: 1 } : { kind: 'core', op: 'set', core: Number(e.target.value) as CoreMode })
            }
          >
            <option value="cycle">Cycle Core 1→4</option>
            {[1, 2, 3, 4].map((c) => (
              <option key={c} value={c}>
                Switch to Core {c}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}
