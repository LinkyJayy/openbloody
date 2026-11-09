import { useRef } from 'react';
import { useStore } from '../store';
import { Card } from '../components/ui';
import { download, exportProfile, importProfile } from '../model/storage';
import { fitProfileToModel } from '../model/types';

export function Profiles() {
  const { state, model, profile, selectProfile, newProfile, duplicateProfile, deleteProfile, addProfile, updateProfile, toast, transport, canWrite, writeToMouse } =
    useStore();
  const file = useRef<HTMLInputElement>(null);

  return (
    <div className="grid two">
      <Card
        title="Profile library"
        actions={
          <>
            <button className="btn" onClick={() => file.current?.click()}>
              Import…
            </button>
            <button className="btn primary" onClick={() => newProfile()}>
              New profile
            </button>
          </>
        }
      >
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const p = fitProfileToModel(importProfile(await f.text()), model);
              addProfile(p);
              toast(`Imported "${p.name}"`);
            } catch (err) {
              toast((err as Error).message, 'error');
            }
          }}
        />
        <ul className="profile-list">
          {state.profiles.map((p) => {
            const inSlots = state.slots.map((s, i) => (s === p.id ? i + 1 : 0)).filter(Boolean);
            return (
              <li key={p.id} className={p.id === profile.id ? 'active' : ''}>
                <button className="list-item" onClick={() => selectProfile(p.id)}>
                  <span className="li-main">
                    <strong>{p.name}</strong>
                    <span className="muted small">
                      Core {p.core} · {p.reportRate} Hz · {p.macros.length} macros
                      {inSlots.length ? ` · on-board slot ${inSlots.join(', ')}` : ''}
                    </span>
                  </span>
                </button>
                <div className="row">
                  <button className="btn ghost small" onClick={() => duplicateProfile(p.id)}>
                    Duplicate
                  </button>
                  <button className="btn ghost small" onClick={() => download(exportProfile(p), `${p.name.replace(/[^\w-]+/g, '_')}.openbloody.json`)}>
                    Export
                  </button>
                  <button
                    className="btn danger small"
                    disabled={state.profiles.length <= 1}
                    onClick={() => confirm(`Delete profile "${p.name}"?`) && deleteProfile(p.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Edit profile">
        <label className="field">
          <span className="field-label">Name</span>
          <input value={profile.name} onChange={(e) => updateProfile((p) => ({ ...p, name: e.target.value }))} />
        </label>
        <p className="muted">Write this profile into any on-board memory slot:</p>
        <div className="slots">
          {state.slots.map((pid, i) => (
            <button
              key={i}
              className="slot"
              disabled={!transport || !canWrite}
              onClick={() => writeToMouse(i)}
              title={!transport ? 'Connect a mouse first' : undefined}
            >
              <span className="slot-n">{i + 1}</span>
              <span className="slot-name">{state.profiles.find((x) => x.id === pid)?.name ?? 'Empty / unknown'}</span>
            </button>
          ))}
        </div>
        <p className="muted small">The library is stored in this browser. Export profiles to back them up or share them.</p>
      </Card>
    </div>
  );
}
