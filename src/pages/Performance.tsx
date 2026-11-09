import { useStore } from '../store';
import { Card, Segmented, Slider, Toggle } from '../components/ui';

export function Performance() {
  const { model, profile, updateProfile } = useStore();
  return (
    <div className="grid">
      <Card title={model.lightStrike ? 'Key response (Light Strike)' : 'Key response'}>
        <p className="muted">
          {model.lightStrike
            ? 'Optical Light Strike switches have no bounce, so the response time can go as low as 0.2 ms.'
            : 'Delay before a click registers. Lower is faster; raise it if you see double clicks.'}
        </p>
        <Slider
          ariaLabel="Key response time"
          min={model.lightStrike ? 2 : 10}
          max={model.lightStrike ? 40 : 160}
          step={model.lightStrike ? 1 : 10}
          value={profile.keyResponseTenthsMs}
          format={(v) => `${(v / 10).toFixed(1)} ms`}
          onChange={(v) => updateProfile((p) => ({ ...p, keyResponseTenthsMs: v }))}
        />
      </Card>

      {!model.lightStrike && (
        <Card title="Debounce">
          <p className="muted">Mechanical switch debounce window.</p>
          <Slider ariaLabel="Debounce" min={1} max={24} value={profile.debounceMs} format={(v) => `${v} ms`} onChange={(v) => updateProfile((p) => ({ ...p, debounceMs: v }))} />
        </Card>
      )}

      {model.liftOff && (
        <Card title="Lift-off distance">
          <p className="muted">How high the mouse can be lifted before the sensor stops tracking. Low suits low-sense players who reposition often.</p>
          <Segmented
            ariaLabel="Lift-off distance"
            value={profile.liftOff}
            options={[
              { value: 1, label: 'Low' },
              { value: 2, label: 'Medium' },
              { value: 3, label: 'High' },
            ]}
            onChange={(v) => updateProfile((p) => ({ ...p, liftOff: v }))}
          />
        </Card>
      )}

      {model.angleSnapping && (
        <Card title="Angle snapping">
          <p className="muted">Straightens near-horizontal and near-vertical movement. Usually off for gaming.</p>
          <Toggle checked={profile.angleSnapping} onChange={(v) => updateProfile((p) => ({ ...p, angleSnapping: v }))} label="Enable angle snapping" />
        </Card>
      )}

      <Card title="Operating-system settings">
        <p className="muted">
          Pointer speed, acceleration, scroll lines and double-click speed are OS settings, not firmware settings. Change them in Windows
          Settings → Bluetooth &amp; devices → Mouse, macOS System Settings → Mouse, or your desktop environment.
        </p>
      </Card>
    </div>
  );
}
