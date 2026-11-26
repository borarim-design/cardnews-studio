import type { ReactNode } from 'react';

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <div className="section-title">{title}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value?: string | number;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {value !== undefined && <b>{value}</b>}
      </div>
      {children}
      {hint && <div className="hint" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        <b>
          {Math.round(value * 100) / 100}
          {suffix}
        </b>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <button type="button" className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span style={{ textAlign: 'left' }}>
        {label}
        {hint && <span className="hint" style={{ display: 'block' }}>{hint}</span>}
      </span>
      <span className="knob" />
    </button>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
      </div>
      <label className="color-field">
        <input type="color" value={value.length === 7 ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} />
        <span>{value}</span>
      </label>
    </div>
  );
}

export function PositionGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: 'top-left' | 'top-center' | 'top-right' | 'mid-left' | 'mid-center' | 'mid-right' | 'bottom-left' | 'bottom-center' | 'bottom-right') => void;
}) {
  const positions: Array<'top-left' | 'top-center' | 'top-right' | 'mid-left' | 'mid-center' | 'mid-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'> = [
    'top-left',
    'top-center',
    'top-right',
    'mid-left',
    'mid-center',
    'mid-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ];
  return (
    <div className="pos-grid">
      {positions.map((p) => (
        <button key={p} type="button" className={value === p ? 'active' : ''} aria-label={p} onClick={() => onChange(p)} />
      ))}
    </div>
  );
}
