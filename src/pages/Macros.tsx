import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore } from '../store';
import { Card, Field, Notice, Toggle } from '../components/ui';
import { KEYBOARD_KEYS, usageFromCode } from '../model/keys';
import { describeEvent, encodeMacro, macroDurationMs, macroProblems, normalizeEvents, pathToMoves } from '../model/macro';
import { uid, type Macro, type MacroEvent, type MouseButtonFn } from '../model/types';

const BTN_FROM_DOM: MouseButtonFn[] = ['left', 'middle', 'right', 'back', 'forward'];

export function Macros() {
  const { profile, updateProfile, model } = useStore();
  const [selId, setSelId] = useState<string | null>(profile.macros[0]?.id ?? null);
  const macro = profile.macros.find((m) => m.id === selId) ?? null;

  const setMacros = (fn: (ms: Macro[]) => Macro[]) => updateProfile((p) => ({ ...p, macros: fn(p.macros) }));
  const setMacro = (fn: (m: Macro) => Macro) => setMacros((ms) => ms.map((m) => (m.id === selId ? fn(m) : m)));

  const create = () => {
    const m: Macro = { id: uid(), name: `Macro ${profile.macros.length + 1}`, events: [] };
    setMacros((ms) => [...ms, m]);
    setSelId(m.id);
  };

  const totalBytes = profile.macros.reduce((n, m) => n + encodeMacro(m.events).length, 0);

  return (
    <div className="grid macros">
      <Card
        title="Macro library"
        actions={
          <button className="btn primary" onClick={create}>
            New macro
          </button>
        }
      >
        {profile.core < 3 && <Notice kind="warn">Macros run on the mouse in Core 3 and above. You can still build them now.</Notice>}
        {profile.macros.length === 0 && <p className="muted">No macros yet.</p>}
        <ul className="macro-list">
          {profile.macros.map((m) => (
            <li key={m.id}>
              <button className={`list-item ${m.id === selId ? 'active' : ''}`} onClick={() => setSelId(m.id)}>
                <span className="li-main">
                  <strong>{m.name}</strong>
                  <span className="muted small">
                    {m.events.length} events · {macroDurationMs(m.events)} ms
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Memory: {totalBytes.toLocaleString()} / {model.macroMemoryBytes.toLocaleString()} bytes
        </p>
        <div className="meter">
          <div style={{ width: `${Math.min(100, (totalBytes / model.macroMemoryBytes) * 100)}%` }} />
        </div>
      </Card>

      {macro ? (
        <MacroEditor
          key={macro.id}
          macro={macro}
          onChange={setMacro}
          onDelete={() => {
            setMacros((ms) => ms.filter((m) => m.id !== macro.id));
            updateProfile((p) => ({
              ...p,
              buttons: p.buttons.map((b) => (b.kind === 'macro' && b.macroId === macro.id ? { kind: 'disabled' } : b)),
            }));
            setSelId(null);
          }}
          onDuplicate={() => {
            const copy = { ...structuredClone(macro), id: uid(), name: `${macro.name} copy` };
            setMacros((ms) => [...ms, copy]);
            setSelId(copy.id);
          }}
        />
      ) : (
        <Card title="Editor">
          <p className="muted">Select or create a macro.</p>
        </Card>
      )}
    </div>
  );
}

function MacroEditor({
  macro,
  onChange,
  onDelete,
  onDuplicate,
}: {
  macro: Macro;
  onChange: (fn: (m: Macro) => Macro) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [sel, setSel] = useState<number>(-1);
  const [recording, setRecording] = useState(false);
  const [recordDelays, setRecordDelays] = useState(true);
  const [fixedDelay, setFixedDelay] = useState(20);
  const [captureMoves, setCaptureMoves] = useState(false);
  const [newKey, setNewKey] = useState(0x04);
  const lastT = useRef(0);
  const padRef = useRef<HTMLDivElement>(null);
  const problems = macroProblems(macro);

  const setEvents = (fn: (e: MacroEvent[]) => MacroEvent[]) => onChange((m) => ({ ...m, events: fn(m.events) }));
  const insert = (evs: MacroEvent[]) => {
    setEvents((list) => {
      const at = sel >= 0 ? sel + 1 : list.length;
      return [...list.slice(0, at), ...evs, ...list.slice(at)];
    });
    setSel((s) => (s >= 0 ? s + evs.length : -1));
  };

  // Recorder: keyboard is captured window-wide, mouse inside the pad.
  const push = (e: MacroEvent) => {
    const now = performance.now();
    const delay = recordDelays ? Math.round(now - lastT.current) : fixedDelay;
    lastT.current = now;
    setEvents((list) => normalizeEvents(list.length ? [...list, { t: 'delay', ms: delay }, e] : [...list, e]));
  };
  const pushRef = useRef(push);
  pushRef.current = push;

  useEffect(() => {
    if (!recording) return;
    lastT.current = performance.now();
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Escape' && e.shiftKey) return setRecording(false);
      const u = usageFromCode(e.code);
      if (u === undefined) return;
      e.preventDefault();
      pushRef.current({ t: 'keyDown', usage: u });
    };
    const up = (e: KeyboardEvent) => {
      const u = usageFromCode(e.code);
      if (u === undefined) return;
      e.preventDefault();
      pushRef.current({ t: 'keyUp', usage: u });
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, [recording]);

  // Accumulate pointer-lock movement into ~10 ms steps to keep macros compact.
  const moveAcc = useRef({ dx: 0, dy: 0, t: 0 });
  const onPadMove = (e: React.MouseEvent) => {
    if (!recording || !captureMoves || document.pointerLockElement !== padRef.current) return;
    const a = moveAcc.current;
    a.dx += e.movementX;
    a.dy += e.movementY;
    const now = performance.now();
    if (now - a.t > 10 && (a.dx || a.dy)) {
      pushRef.current({ t: 'move', dx: a.dx, dy: a.dy });
      moveAcc.current = { dx: 0, dy: 0, t: now };
    }
  };

  const ev = sel >= 0 ? macro.events[sel] : undefined;

  return (
    <Card
      title={
        <input className="title-input" value={macro.name} aria-label="Macro name" onChange={(e) => onChange((m) => ({ ...m, name: e.target.value }))} />
      }
      actions={
        <>
          <button className="btn ghost" onClick={onDuplicate}>
            Duplicate
          </button>
          <button className="btn danger" onClick={onDelete}>
            Delete
          </button>
        </>
      }
    >
      <div className="recorder">
        <div className="row wrap">
          <button className={`btn ${recording ? 'danger' : 'primary'}`} onClick={() => setRecording((r) => !r)}>
            {recording ? '■ Stop recording' : '● Record'}
          </button>
          <Toggle checked={recordDelays} onChange={setRecordDelays} label="Record real delays" />
          {!recordDelays && (
            <label className="inline">
              Fixed delay
              <input type="number" min={0} max={65535} value={fixedDelay} onChange={(e) => setFixedDelay(Number(e.target.value))} /> ms
            </label>
          )}
          <Toggle checked={captureMoves} onChange={setCaptureMoves} label="Record mouse movement" />
        </div>
        <div
          ref={padRef}
          className={`record-pad ${recording ? 'live' : ''}`}
          onMouseDown={(e) => {
            if (!recording) return;
            e.preventDefault();
            if (captureMoves && document.pointerLockElement !== padRef.current) {
              padRef.current?.requestPointerLock();
              return;
            }
            pushRef.current({ t: 'mouseDown', button: BTN_FROM_DOM[e.button] ?? 'left' });
          }}
          onMouseUp={(e) => {
            if (!recording || (captureMoves && document.pointerLockElement !== padRef.current)) return;
            pushRef.current({ t: 'mouseUp', button: BTN_FROM_DOM[e.button] ?? 'left' });
          }}
          onWheel={(e) => recording && pushRef.current({ t: 'wheel', delta: e.deltaY < 0 ? 1 : -1 })}
          onMouseMove={onPadMove}
          onContextMenu={(e) => e.preventDefault()}
        >
          {recording
            ? captureMoves
              ? 'Click to lock the pointer, then move/click. Esc unlocks, Shift+Esc stops.'
              : 'Recording keys anywhere and clicks/wheel in this box…'
            : 'Press Record, then type or click here.'}
        </div>
      </div>

      <div className="macro-body">
        <ol className="event-list" aria-label="Macro events">
          {macro.events.length === 0 && <li className="muted">Empty. Record, or add steps with the buttons below.</li>}
          {macro.events.map((e, i) => (
            <li key={i}>
              <button className={`event ev-${e.t} ${sel === i ? 'active' : ''}`} onClick={() => setSel(i === sel ? -1 : i)}>
                <span className="ev-n">{i + 1}</span>
                {describeEvent(e)}
              </button>
            </li>
          ))}
        </ol>

        <div className="event-tools">
          <Field label="Insert after selection">
            <div className="row wrap">
              <select value={newKey} onChange={(e) => setNewKey(Number(e.target.value))} aria-label="Key to insert">
                {KEYBOARD_KEYS.map((k) => (
                  <option key={k.usage} value={k.usage}>
                    {k.label}
                  </option>
                ))}
              </select>
              <button className="btn" onClick={() => insert([{ t: 'keyDown', usage: newKey }, { t: 'delay', ms: 30 }, { t: 'keyUp', usage: newKey }])}>
                Key press
              </button>
              <button className="btn" onClick={() => insert([{ t: 'keyDown', usage: newKey }])}>
                Key ↓
              </button>
              <button className="btn" onClick={() => insert([{ t: 'keyUp', usage: newKey }])}>
                Key ↑
              </button>
            </div>
          </Field>
          <div className="row wrap">
            <button className="btn" onClick={() => insert([{ t: 'mouseDown', button: 'left' }, { t: 'delay', ms: 30 }, { t: 'mouseUp', button: 'left' }])}>
              Left click
            </button>
            <button className="btn" onClick={() => insert([{ t: 'mouseDown', button: 'right' }, { t: 'delay', ms: 30 }, { t: 'mouseUp', button: 'right' }])}>
              Right click
            </button>
            <button className="btn" onClick={() => insert([{ t: 'delay', ms: 50 }])}>
              Delay
            </button>
            <button className="btn" onClick={() => insert([{ t: 'move', dx: 0, dy: 5 }])}>
              Move
            </button>
            <button className="btn" onClick={() => insert([{ t: 'wheel', delta: 1 }])}>
              Wheel
            </button>
            <button className="btn" onClick={() => insert([{ t: 'loopStart', count: 3 }, { t: 'loopEnd' }])}>
              Loop
            </button>
          </div>

          {ev && (
            <div className="event-props">
              <strong>Step {sel + 1}</strong>
              <EventProps
                event={ev}
                onChange={(n) => setEvents((list) => list.map((x, i) => (i === sel ? n : x)))}
              />
              <div className="row">
                <button
                  className="btn ghost"
                  disabled={sel === 0}
                  onClick={() => {
                    setEvents((l) => {
                      const c = l.slice();
                      [c[sel - 1], c[sel]] = [c[sel], c[sel - 1]];
                      return c;
                    });
                    setSel(sel - 1);
                  }}
                >
                  ↑ Up
                </button>
                <button
                  className="btn ghost"
                  disabled={sel === macro.events.length - 1}
                  onClick={() => {
                    setEvents((l) => {
                      const c = l.slice();
                      [c[sel + 1], c[sel]] = [c[sel], c[sel + 1]];
                      return c;
                    });
                    setSel(sel + 1);
                  }}
                >
                  ↓ Down
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    setEvents((l) => l.filter((_, i) => i !== sel));
                    setSel(-1);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          <div className="row wrap">
            <button className="btn ghost" onClick={() => setEvents((l) => normalizeEvents(l))}>
              Merge delays
            </button>
            <button className="btn ghost" onClick={() => setEvents((l) => l.map((e) => (e.t === 'delay' ? { ...e, ms: fixedDelay } : e)))}>
              Set all delays to {fixedDelay} ms
            </button>
            <button className="btn ghost" onClick={() => setEvents(() => [])}>
              Clear
            </button>
          </div>

          <p className="muted small">
            {macro.events.length} events · {macroDurationMs(macro.events)} ms · {encodeMacro(macro.events).length} bytes on the mouse
          </p>
          {problems.map((p) => (
            <p key={p} className="warn-text small">
              ⚠ {p}
            </p>
          ))}
        </div>
      </div>

      <PathDrawer onGenerate={(evs) => insert(evs)} />
    </Card>
  );
}

function EventProps({ event, onChange }: { event: MacroEvent; onChange: (e: MacroEvent) => void }) {
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
  switch (event.t) {
    case 'delay':
      return (
        <Field label="Delay (ms)">
          <input type="number" min={0} max={65535} value={event.ms} onChange={(e) => onChange({ ...event, ms: num(e.target.value, 0, 600000) })} />
        </Field>
      );
    case 'move':
      return (
        <div className="row">
          <Field label="ΔX">
            <input type="number" value={event.dx} onChange={(e) => onChange({ ...event, dx: num(e.target.value, -2000, 2000) })} />
          </Field>
          <Field label="ΔY">
            <input type="number" value={event.dy} onChange={(e) => onChange({ ...event, dy: num(e.target.value, -2000, 2000) })} />
          </Field>
        </div>
      );
    case 'wheel':
      return (
        <Field label="Wheel notches (+ up, − down)">
          <input type="number" min={-127} max={127} value={event.delta} onChange={(e) => onChange({ ...event, delta: num(e.target.value, -127, 127) })} />
        </Field>
      );
    case 'loopStart':
      return (
        <Field label="Repeat count (0 = while held)">
          <input type="number" min={0} max={255} value={event.count} onChange={(e) => onChange({ ...event, count: num(e.target.value, 0, 255) })} />
        </Field>
      );
    case 'keyDown':
    case 'keyUp':
      return (
        <Field label="Key">
          <select value={event.usage} onChange={(e) => onChange({ ...event, usage: Number(e.target.value) })}>
            {KEYBOARD_KEYS.map((k) => (
              <option key={k.usage} value={k.usage}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
      );
    case 'mouseDown':
    case 'mouseUp':
      return (
        <Field label="Button">
          <select value={event.button} onChange={(e) => onChange({ ...event, button: e.target.value as MouseButtonFn })}>
            {(['left', 'right', 'middle', 'back', 'forward'] as const).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
      );
    default:
      return null;
  }
}

/** Draw a movement path; it is converted to relative move + delay steps. */
function PathDrawer({ onGenerate }: { onGenerate: (e: MacroEvent[]) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pts = useRef<{ x: number; y: number; t: number }[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [scale, setScale] = useState(1);
  const [count, setCount] = useState(0);

  const redraw = () => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = getComputedStyle(c).getPropertyValue('--accent') || '#e53935';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.current.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  };

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.current!.width,
      y: ((e.clientY - r.top) / r.height) * canvas.current!.height,
      t: performance.now(),
    };
  };

  return (
    <details className="path-drawer">
      <summary>Movement pattern tool</summary>
      <p className="muted small">
        Draw a path while holding the pointer down. Speed is preserved: it becomes relative cursor moves with delays. Useful for drawing
        gestures or repeatable movement in creative and productivity apps.
      </p>
      <canvas
        ref={canvas}
        width={480}
        height={240}
        className="path-canvas"
        style={{ touchAction: 'none' } as CSSProperties}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          pts.current = [pos(e)];
          setDrawing(true);
          redraw();
        }}
        onPointerMove={(e) => {
          if (!drawing) return;
          pts.current.push(pos(e));
          redraw();
        }}
        onPointerUp={() => {
          setDrawing(false);
          setCount(pts.current.length);
        }}
      />
      <div className="row wrap">
        <label className="inline">
          Scale
          <input type="number" min={0.1} max={10} step={0.1} value={scale} onChange={(e) => setScale(Number(e.target.value) || 1)} />×
        </label>
        <button className="btn primary" disabled={count < 2} onClick={() => onGenerate(pathToMoves(pts.current, scale))}>
          Insert as moves ({count} points)
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            pts.current = [];
            setCount(0);
            redraw();
          }}
        >
          Clear
        </button>
      </div>
    </details>
  );
}
