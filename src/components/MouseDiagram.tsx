import type { MouseModel } from '../hid/devices';

/** Generic top-down mouse outline with numbered, clickable button hotspots. */
export function MouseDiagram({
  model,
  selected,
  onSelect,
  accent = 'var(--accent)',
}: {
  model: MouseModel;
  selected: number;
  onSelect: (i: number) => void;
  accent?: string;
}) {
  return (
    <svg className="mouse-diagram" viewBox="0 0 100 120" role="group" aria-label={`${model.name} buttons`}>
      <defs>
        <linearGradient id="shell" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--surface-3)" />
          <stop offset="1" stopColor="var(--surface-2)" />
        </linearGradient>
      </defs>
      <path
        d="M50 4 C76 4 86 24 86 52 C86 88 74 116 50 116 C26 116 14 88 14 52 C14 24 24 4 50 4 Z"
        fill="url(#shell)"
        stroke="var(--border-strong)"
        strokeWidth="1"
      />
      <path d="M50 4 L50 46" stroke="var(--border-strong)" strokeWidth="0.8" />
      <rect x="46" y="12" width="8" height="16" rx="4" fill="var(--surface-1)" stroke="var(--border-strong)" strokeWidth="0.8" />
      <path d="M38 96 Q50 104 62 96" stroke={accent} strokeWidth="1.6" fill="none" opacity="0.8" />
      {model.buttons.map((b) => {
        const active = b.index === selected;
        return (
          <g
            key={b.index}
            className="hotspot"
            role="button"
            tabIndex={0}
            aria-label={`${b.name} (button ${b.index + 1})`}
            aria-pressed={active}
            onClick={() => onSelect(b.index)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(b.index);
              }
            }}
          >
            <circle cx={b.x} cy={b.y} r="5" fill={active ? accent : 'var(--surface-1)'} stroke={active ? accent : 'var(--text-muted)'} strokeWidth="0.8" />
            <text x={b.x} y={b.y + 1.8} textAnchor="middle" fontSize="5" fontWeight="700" fill={active ? '#fff' : 'var(--text)'}>
              {b.index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
