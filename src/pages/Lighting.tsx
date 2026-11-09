import { useStore } from '../store';
import type { LightingMode } from '../hid/devices';
import { Card, Field, Segmented, Slider, Toggle } from '../components/ui';

const LABELS: Record<LightingMode, string> = {
  off: 'Off',
  static: 'Static',
  breathing: 'Breathing',
  neon: 'Neon',
  spectrum: 'Spectrum',
  wave: 'Wave',
  reactive: 'Reactive',
};

const SWATCHES = ['#ff1e1e', '#ff7a00', '#ffd400', '#2bd96b', '#00c8ff', '#2f6bff', '#a64dff', '#ffffff'];

export function Lighting() {
  const { model, profile, updateProfile } = useStore();
  const l = profile.lighting;
  const set = (patch: Partial<typeof l>) => updateProfile((p) => ({ ...p, lighting: { ...p.lighting, ...patch } }));
  const usesColor = l.mode === 'static' || l.mode === 'breathing' || l.mode === 'reactive';
  const animated = l.mode !== 'off' && l.mode !== 'static';

  return (
    <div className="grid two">
      <Card title="Lighting effect">
        <Segmented ariaLabel="Lighting effect" value={l.mode} options={model.lighting.map((m) => ({ value: m, label: LABELS[m] }))} onChange={(mode) => set({ mode })} />
        {usesColor && model.rgb && (
          <Field label="Colour">
            <div className="row wrap">
              {SWATCHES.map((c) => (
                <button key={c} className={`swatch ${l.color === c ? 'active' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => set({ color: c })} />
              ))}
              <input type="color" value={l.color} aria-label="Custom colour" onChange={(e) => set({ color: e.target.value })} />
            </div>
          </Field>
        )}
        {usesColor && !model.rgb && <p className="muted small">This model has fixed-colour LEDs; only the effect and brightness apply.</p>}
        <Field label="Brightness">
          <Slider ariaLabel="Brightness" min={0} max={100} step={5} value={l.brightness} disabled={l.mode === 'off'} format={(v) => `${v}%`} onChange={(brightness) => set({ brightness })} />
        </Field>
        <Field label="Speed">
          <Slider ariaLabel="Speed" min={1} max={10} value={l.speed} disabled={!animated} onChange={(speed) => set({ speed })} />
        </Field>
        <Toggle checked={l.cpiIndicator} onChange={(cpiIndicator) => set({ cpiIndicator })} label="Flash the CPI level colour when switching" />
      </Card>
      <Card title="Preview">
        <div
          className={`light-preview mode-${l.mode}`}
          style={
            {
              '--light': model.rgb || !usesColor ? l.color : '#ff1e1e',
              '--light-opacity': String(l.brightness / 100),
              '--light-speed': `${11 - l.speed}s`,
            } as React.CSSProperties
          }
        >
          <div className="light-mouse" />
        </div>
        <p className="muted small">Approximate preview; the real LEDs differ per model.</p>
      </Card>
    </div>
  );
}
