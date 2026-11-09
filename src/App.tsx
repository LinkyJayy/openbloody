import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Overview } from './pages/Overview';
import { Buttons } from './pages/Buttons';
import { Sensor } from './pages/Sensor';
import { Performance } from './pages/Performance';
import { Lighting } from './pages/Lighting';
import { Macros } from './pages/Macros';
import { Profiles } from './pages/Profiles';
import { ProtocolLab } from './pages/ProtocolLab';
import { Settings } from './pages/Settings';
import { webHidSupported } from './hid/transport';

const PAGES = [
  { id: 'overview', label: 'Overview', icon: '◎', el: Overview },
  { id: 'buttons', label: 'Buttons', icon: '⌘', el: Buttons },
  { id: 'sensor', label: 'Sensor & CPI', icon: '◉', el: Sensor },
  { id: 'performance', label: 'Performance', icon: '⚡', el: Performance },
  { id: 'lighting', label: 'Lighting', icon: '✦', el: Lighting },
  { id: 'macros', label: 'Macros', icon: '⏺', el: Macros },
  { id: 'profiles', label: 'Profiles', icon: '☰', el: Profiles },
  { id: 'lab', label: 'Protocol Lab', icon: '⌬', el: ProtocolLab },
  { id: 'settings', label: 'Settings', icon: '⚙', el: Settings },
] as const;

type PageId = (typeof PAGES)[number]['id'];

function usePage(): PageId {
  const read = () => {
    const h = location.hash.replace('#/', '') as PageId;
    return PAGES.some((p) => p.id === h) ? h : 'overview';
  };
  const [page, setPage] = useState<PageId>(read);
  useEffect(() => {
    const h = () => setPage(read());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return page;
}

export function App() {
  const store = useStore();
  const { state, model, profile, transport, progress, dirty, canWrite, connect, connectSimulator, disconnect, writeToMouse, toasts, selectProfile } = store;
  const page = usePage();
  const [navOpen, setNavOpen] = useState(false);
  const Page = PAGES.find((p) => p.id === page)!.el;

  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.theme);
  }, [state.theme]);

  const writeTitle = !transport
    ? 'Connect a mouse first'
    : !canWrite
      ? 'Writes are blocked for an unverified protocol definition (see Settings)'
      : `Write "${profile.name}" to on-board slot ${state.activeSlot + 1}`;

  return (
    <div className={`app ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <img src="/icons/icon.svg" alt="" width={28} height={28} />
          <span>
            Open<b>Bloody</b>
          </span>
        </div>
        <nav aria-label="Sections">
          {PAGES.map((p) => (
            <a
              key={p.id}
              href={`#/${p.id}`}
              className={page === p.id ? 'active' : ''}
              aria-current={page === p.id ? 'page' : undefined}
              onClick={() => setNavOpen(false)}
            >
              <span className="nav-icon" aria-hidden>
                {p.icon}
              </span>
              {p.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot muted small">{model.name}</div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="btn ghost menu-btn" aria-label="Menu" onClick={() => setNavOpen((o) => !o)}>
            ☰
          </button>
          <div className={`status ${transport ? 'on' : ''}`}>
            <span className="dot" />
            <span className="status-text">{transport ? transport.name : 'Not connected'}</span>
          </div>
          <select className="profile-select" value={profile.id} onChange={(e) => selectProfile(e.target.value)} aria-label="Profile">
            {state.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="spacer" />
          {transport ? (
            <button className="btn ghost" onClick={disconnect}>
              Disconnect
            </button>
          ) : (
            <>
              <button className="btn ghost hide-sm" onClick={connectSimulator}>
                Simulator
              </button>
              <button className="btn" onClick={connect} disabled={!webHidSupported()} title={webHidSupported() ? '' : 'WebHID not supported in this browser'}>
                Connect
              </button>
            </>
          )}
          <button
            className={`btn primary ${dirty && transport ? 'pulse' : ''}`}
            disabled={!transport || !canWrite || !!progress}
            title={writeTitle}
            onClick={() => void writeToMouse()}
          >
            Write to mouse
          </button>
        </header>

        {progress && (
          <div className="progress" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
            <div style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            <span>
              {progress.label} ({progress.done}/{progress.total})
            </span>
          </div>
        )}

        {!webHidSupported() && (
          <div className="banner">
            This browser has no WebHID, so it can't talk to the mouse. You can still build profiles and macros, export them, and use the simulator.
            Use desktop Chrome, Edge or Opera to configure hardware.
          </div>
        )}

        <main className="content">
          <h1 className="page-title">{PAGES.find((p) => p.id === page)!.label}</h1>
          <Page />
        </main>
      </div>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
