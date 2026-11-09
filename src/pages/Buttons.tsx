import { useState } from 'react';
import { useStore } from '../store';
import { ActionEditor, describeAction } from '../components/ActionEditor';
import { MouseDiagram } from '../components/MouseDiagram';
import { Card } from '../components/ui';
import { actionAllowed, defaultButtons } from '../model/types';

export function Buttons() {
  const { model, profile, updateProfile, state } = useStore();
  const [sel, setSel] = useState(0);
  const action = profile.buttons[sel];

  return (
    <div className="grid two">
      <Card
        title="Buttons"
        actions={
          <button className="btn ghost" onClick={() => updateProfile((p) => ({ ...p, buttons: defaultButtons(model) }))}>
            Reset all
          </button>
        }
      >
        <div className="buttons-layout">
          <MouseDiagram model={model} selected={sel} onSelect={setSel} />
          <ol className="button-list">
            {model.buttons.map((b) => {
              const a = profile.buttons[b.index];
              return (
                <li key={b.index}>
                  <button className={`list-item ${sel === b.index ? 'active' : ''}`} onClick={() => setSel(b.index)}>
                    <span className="badge">{b.index + 1}</span>
                    <span className="li-main">
                      <strong>{b.name}</strong>
                      <span className={actionAllowed(a, profile.core) ? 'muted' : 'warn-text'}>{describeAction(a, profile.macros)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </Card>
      <Card title={`Button ${sel + 1}: ${model.buttons[sel]?.name ?? ''}`}>
        {sel === 0 && action.kind !== 'mouse' && (
          <p className="warn-text">Careful: remapping the left button can leave you without a primary click until you change it back.</p>
        )}
        {action && (
          <ActionEditor
            action={action}
            core={profile.core}
            macros={profile.macros}
            cpiLevels={profile.cpi.levels.length}
            slots={state.slots.length}
            onChange={(a) => updateProfile((p) => ({ ...p, buttons: p.buttons.map((x, i) => (i === sel ? a : x)) }))}
          />
        )}
      </Card>
    </div>
  );
}
