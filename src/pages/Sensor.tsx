import { useStore } from '../store';
import { Card, Field, Segmented, Slider, Toggle } from '../components/ui';

export function Sensor() {
  const { model, profile, updateProfile } = useStore();
  const { cpi } = profile;
  const fmt = (v: number) => `${v.toLocaleString()} CPI`;

  const setLevel = (i: number, patch: Partial<(typeof cpi.levels)[number]>) =>
    updateProfile((p) => ({
      ...p,
      cpi: { ...p.cpi, levels: p.cpi.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) },
    }));

  return (
    <div className="grid">
      <Card
        title="CPI levels"
        actions={<Toggle checked={cpi.linkXY} onChange={(v) => updateProfile((p) => ({ ...p, cpi: { ...p.cpi, linkXY: v } }))} label="Link X/Y" />}
      >
        <p className="muted">
          {model.sensor}. Range {model.minCpi}–{model.maxCpi.toLocaleString()} in steps of {model.cpiStep}. Click a level to make it the active one.
        </p>
        <div className="cpi-levels">
          {cpi.levels.map((l, i) => (
            <div key={i} className={`cpi-level ${cpi.active === i ? 'active' : ''} ${l.enabled ? '' : 'off'}`}>
              <div className="cpi-head">
                <button
                  className="cpi-dot"
                  style={{ background: l.color }}
                  aria-label={`Make level ${i + 1} active`}
                  onClick={() => updateProfile((p) => ({ ...p, cpi: { ...p.cpi, active: i } }))}
                />
                <strong>Level {i + 1}</strong>
                {cpi.active === i && <span className="pill">active</span>}
                <span className="spacer" />
                <input type="color" value={l.color} aria-label={`Level ${i + 1} colour`} onChange={(e) => setLevel(i, { color: e.target.value })} />
                <Toggle checked={l.enabled} disabled={cpi.active === i} onChange={(v) => setLevel(i, { enabled: v })} label="On" />
              </div>
              <Field label={cpi.linkXY ? 'X / Y' : 'X'}>
                <Slider
                  ariaLabel={`Level ${i + 1} X`}
                  min={model.minCpi}
                  max={model.maxCpi}
                  step={model.cpiStep}
                  value={l.x}
                  format={fmt}
                  onChange={(v) => setLevel(i, cpi.linkXY ? { x: v, y: v } : { x: v })}
                />
              </Field>
              {!cpi.linkXY && (
                <Field label="Y">
                  <Slider ariaLabel={`Level ${i + 1} Y`} min={model.minCpi} max={model.maxCpi} step={model.cpiStep} value={l.y} format={fmt} onChange={(v) => setLevel(i, { y: v })} />
                </Field>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Sniper CPI">
        <p className="muted">While a button assigned to “Sniper” is held, the sensor drops to this CPI (Core 4).</p>
        <Slider
          ariaLabel="Sniper CPI"
          min={model.minCpi}
          max={model.maxCpi}
          step={model.cpiStep}
          value={cpi.sniper}
          format={fmt}
          disabled={profile.core < 4}
          onChange={(v) => updateProfile((p) => ({ ...p, cpi: { ...p.cpi, sniper: v } }))}
        />
        {profile.core < 4 && <p className="muted small">Switch to Core 4 to use the sniper button.</p>}
      </Card>

      <Card title="Report rate">
        <p className="muted">How often the mouse reports to the PC. Higher is smoother but uses more CPU.</p>
        <Segmented
          ariaLabel="Report rate"
          value={profile.reportRate}
          options={[125, 250, 500, 1000].map((r) => ({ value: r, label: `${r} Hz`, disabled: !model.reportRates.includes(r) }))}
          onChange={(v) => updateProfile((p) => ({ ...p, reportRate: v }))}
        />
        <p className="muted small">{(1000 / profile.reportRate).toFixed(profile.reportRate > 500 ? 0 : 1)} ms between reports.</p>
      </Card>
    </div>
  );
}
