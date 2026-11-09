import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Card, Notice, Segmented, Toggle } from '../components/ui';
import { webHidSupported } from '../hid/transport';
import { initialState } from '../model/storage';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function Settings() {
  const { state, setState, transport, canWrite, factoryReset, toast } = useStore();
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  return (
    <div className="grid">
      <Card title="Appearance">
        <Segmented
          ariaLabel="Theme"
          value={state.theme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
          onChange={(theme) => setState((s) => ({ ...s, theme }))}
        />
      </Card>

      <Card title="Install app">
        <p className="muted">OpenBloody is a Progressive Web App: install it to get its own window and use it offline.</p>
        <button className="btn primary" disabled={!installEvt} onClick={() => installEvt?.prompt().then(() => setInstallEvt(null))}>
          {installEvt ? 'Install OpenBloody' : 'Installed, or use the browser menu to install'}
        </button>
      </Card>

      <Card title="Hardware writes">
        <Notice kind="warn">
          A4Tech has not published the Bloody configuration protocol. The bundled protocol definition is a draft and has not been verified
          on real mice. Writing unverified commands can leave settings in an odd state; a factory reset from A4Tech's software fixes that.
        </Notice>
        <Toggle
          checked={state.allowUnverifiedWrites}
          onChange={(v) => {
            if (v && !confirm('Allow writing with an unverified protocol definition to real hardware? You accept the risk.')) return;
            setState((s) => ({ ...s, allowUnverifiedWrites: v }));
          }}
          label="Allow writes and queries with an unverified protocol definition"
        />
        <p className="muted small">The simulator is always writable.</p>
        <button
          className="btn danger"
          disabled={!transport || !canWrite}
          onClick={() => confirm('Send factory reset to the connected mouse?') && factoryReset()}
        >
          Factory reset mouse
        </button>
      </Card>

      <Card title="Browser support">
        <ul className="checks">
          <li className={webHidSupported() ? 'ok' : 'bad'}>WebHID {webHidSupported() ? 'available' : 'not available — use desktop Chrome, Edge or Opera'}</li>
          <li className={window.isSecureContext ? 'ok' : 'bad'}>Secure context (HTTPS) {window.isSecureContext ? 'yes' : 'no — WebHID needs HTTPS'}</li>
          <li className={'serviceWorker' in navigator ? 'ok' : 'bad'}>Service worker (offline) {'serviceWorker' in navigator ? 'yes' : 'no'}</li>
        </ul>
        <p className="muted small">
          Linux: grant your user access to the hidraw node, e.g. a udev rule{' '}
          <code>SUBSYSTEM=="hidraw", ATTRS{'{idVendor}'}=="09da", MODE="0660", TAG+="uaccess"</code>.
        </p>
      </Card>

      <Card title="Data">
        <p className="muted">Profiles, macros and the protocol definition are stored only in this browser.</p>
        <button
          className="btn danger"
          onClick={() => {
            if (!confirm('Erase all OpenBloody data in this browser?')) return;
            setState(() => initialState());
            toast('Local data reset');
          }}
        >
          Reset local data
        </button>
      </Card>

      <Card title="About">
        <p>
          OpenBloody {__APP_VERSION__} — an open-source, browser-based configurator for Bloody mice. Not affiliated with A4Tech. “Bloody” and
          “BloodyWorkshop” are trademarks of their owners.
        </p>
      </Card>
    </div>
  );
}
