import React, { useEffect } from 'react';
import type { Life, Needs } from './Hud';
import { RELATIONSHIP_STYLES } from './prefs';

const STYLE_LABELS: Record<string, string> = Object.fromEntries(RELATIONSHIP_STYLES.map((r) => [r.id, r.label]));

// ---------------------------------------------------------------------------
// Side Piece component library (M1). Mobile-first shell primitives.
// Every component here uses design-system tokens only (see docs/product/design-system.md).
// ---------------------------------------------------------------------------

const NEEDS: { key: keyof Needs; icon: string; label: string }[] = [
  { key: 'energy', icon: '⚡', label: 'Energy' },
  { key: 'hunger', icon: '🍴', label: 'Hunger' },
  { key: 'mood', icon: '🙂', label: 'Mood' },
  { key: 'social', icon: '💬', label: 'Social' },
  { key: 'love', icon: '💗', label: 'Love' },
];

export const needColor = (v: number) => (v >= 60 ? 'var(--success)' : v >= 30 ? 'var(--warning)' : 'var(--danger)');

// ₦ money formatting (server is authoritative; this is presentation only).
export const naira = (n: number) => {
  const v = Math.round(n);
  return `${v < 0 ? '-' : ''}₦${String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

export function NeedBar({ value, color }: { value: number; color?: string }) {
  return <span className="mini-bar"><i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color ?? needColor(value) }} /></span>;
}

export function ScoreDelta({ value }: { value: number }) {
  const tone = value > 0 ? 'up' : value < 0 ? 'down' : '';
  return <span className={`delta ${tone}`}>({value > 0 ? '+' : ''}{value})</span>;
}

export function TierMeter({ value, label }: { value: number; label?: string }) {
  return <div className="tier-meter">
    {label && <div className="tier-meter-head"><span>{label}</span><span>{Math.round(value)}</span></div>}
    <div className="tier-meter-track"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
  </div>;
}

export function AvatarPortrait({ name, kind = 'you', size = 40 }: { name: string; kind?: 'you' | 'player' | 'npc'; size?: number }) {
  return <div className={`avatar-orb ${kind}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>{(name || '?')[0].toUpperCase()}</div>;
}

export type TopBarProps = { name: string; life?: Life; onProfile?: () => void };

export function TopBar({ name, life, onProfile }: TopBarProps) {
  return <div className="topbar">
    <button className="topbar-id" onClick={onProfile} aria-label="Open profile">
      <AvatarPortrait name={name} kind="you" size={34} />
      <div className="topbar-id-text">
        <strong>{name}</strong>
        <span>{life ? `Lv ${life.level} · ${naira(life.money)}` : '—'}</span>
      </div>
    </button>
    {life && <div className="topbar-needs">
      {NEEDS.map((n) => <span key={n.key} className="topbar-need" title={`${n.label} ${Math.round(life.needs[n.key])}`}>
        <span className="need-icon">{n.icon}</span>
        <NeedBar value={life.needs[n.key]} />
      </span>)}
    </div>}
    {life && <div className="topbar-clock" title={life.clock.label}>{life.clock.is_night ? '🌙' : '☀️'} <b>{life.clock.label.split(' · ')[0]}</b><span className="clock-date"> · {life.clock.label.split(' · ').slice(1).join(' · ')}</span></div>}
  </div>;
}

export type Tab = 'world' | 'messages' | 'feed' | 'profile';
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'world', icon: '🌆', label: 'World' },
  { id: 'messages', icon: '💬', label: 'Messages' },
  { id: 'feed', icon: '✨', label: 'Feed' },
  { id: 'profile', icon: '👤', label: 'Profile' },
];

export function BottomNav({ tab, onTab, badges }: { tab: Tab; onTab: (t: Tab) => void; badges?: Partial<Record<Tab, number>> }) {
  return <nav className="bottom-nav">
    {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => onTab(t.id)}>
      <span className="nav-icon">{t.icon}{badges?.[t.id] ? <i className="nav-badge">{badges[t.id]}</i> : null}</span>
      <span className="nav-label">{t.label}</span>
    </button>)}
  </nav>;
}

export function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="sheet-scrim" onClick={onClose}>
    <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
      <header className="sheet-head">
        <div><h2>{title}</h2>{subtitle && <span>{subtitle}</span>}</div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="sheet-body">{children}</div>
    </div>
  </div>;
}

export function EmptyState({ icon = '🫥', title, body, actionLabel, onAction }: { icon?: string; title: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="state-block">
    <div className="state-icon">{icon}</div>
    <strong>{title}</strong>
    {body && <p>{body}</p>}
    {actionLabel && onAction && <button className="pill-btn" onClick={onAction}>{actionLabel}</button>}
  </div>;
}

export function ErrorState({ title = 'Something went wrong', body, actionLabel = 'Try again', onAction }: { title?: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="state-block error">
    <div className="state-icon">⚠️</div>
    <strong>{title}</strong>
    {body && <p>{body}</p>}
    {onAction && <button className="pill-btn" onClick={onAction}>{actionLabel}</button>}
  </div>;
}

export type DialogSpec = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  input?: { placeholder: string; initial?: string };
  onConfirm: (value?: string) => void;
  extraActions?: { label: string; tone?: 'default' | 'danger'; onClick: () => void }[];
};

export function ConfirmDialog({ spec, onCancel }: { spec: DialogSpec; onCancel: () => void }) {
  const [value, setValue] = React.useState(spec.input?.initial ?? '');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const confirm = () => { spec.onConfirm(spec.input ? value : undefined); };
  return <div className="dialog-scrim" onClick={onCancel}>
    <div className="dialog" role="alertdialog" aria-label={spec.title} onClick={(e) => e.stopPropagation()}>
      <strong>{spec.title}</strong>
      {spec.body && <p>{spec.body}</p>}
      {spec.input && <input autoFocus value={value} placeholder={spec.input.placeholder} onChange={(e) => setValue(e.target.value)} />}
      {spec.extraActions?.length ? <div className="dialog-extra-actions">
        {spec.extraActions.map((a) => <button key={a.label} className={a.tone === 'danger' ? 'ghost danger-text' : 'ghost'} onClick={a.onClick}>{a.label}</button>)}
      </div> : null}
      <div className="dialog-actions">
        <button className="ghost" onClick={onCancel}>{spec.cancelLabel ?? 'Cancel'}</button>
        <button className={spec.tone === 'danger' ? 'danger' : ''} disabled={!!spec.input && !value.trim()} onClick={confirm}>{spec.confirmLabel ?? 'Confirm'}</button>
      </div>
    </div>
  </div>;
}

export type Toast = { text: string; tone: 'info' | 'error' | 'good' };
export function ToastView({ toast }: { toast: Toast }) {
  return <div className={`notice ${toast.tone}`}>{toast.text}</div>;
}

export type ProfileCardData = { id: string; display_name: string; kind: 'npc' | 'player'; looking_for: string; compatibility: number; social_rating: number; bio?: string; interests?: string[]; relationship_style?: string | null };
export type ProfileCardAction = { label: string; onClick: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean };

export function ProfileCard({ data, actions }: { data: ProfileCardData; actions: ProfileCardAction[] }) {
  return <article className={`profile-card ${data.kind}`}>
    <AvatarPortrait name={data.display_name} kind={data.kind} size={54} />
    <div className="profile-card-main">
      <strong>{data.display_name} <em className={`kind-badge ${data.kind}`}>{data.kind === 'npc' ? 'local' : 'player'}</em></strong>
      <span>{data.compatibility}% match · rating {data.social_rating.toFixed(1)}</span>
      {data.kind === 'player' && data.bio && <p className="card-bio">“{data.bio}”</p>}
      <p>{data.looking_for}</p>
      {data.kind === 'player' && (!!data.interests?.length || data.relationship_style) && <div className="pill-row tight">
        {data.relationship_style && <span className="pill">{STYLE_LABELS[data.relationship_style] ?? data.relationship_style}</span>}
        {data.interests?.map((i) => <span key={i} className="pill">{i}</span>)}
      </div>}
      <div className="card-actions">
        {actions.map((a) => <button key={a.label} className={a.variant === 'ghost' ? 'ghost' : a.variant === 'danger' ? 'ghost danger-text' : ''} disabled={a.disabled} onClick={a.onClick}>{a.label}</button>)}
      </div>
    </div>
  </article>;
}

// Minimal presentational invitation card. Full lifecycle lands in M6.
export type InvitationState = 'draft' | 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
export function InvitationCard({ title, state, detail, actions }: { title: string; state: InvitationState; detail?: string; actions?: ProfileCardAction[] }) {
  return <div className={`invitation-card ${state}`}>
    <div className="invitation-head"><strong>{title}</strong><span className={`state-pill ${state}`}>{state}</span></div>
    {detail && <p>{detail}</p>}
    {actions && actions.length > 0 && <div className="invitation-actions">
      {actions.map((a) => <button key={a.label} className={a.variant === 'ghost' ? 'ghost' : ''} disabled={a.disabled} onClick={a.onClick}>{a.label}</button>)}
    </div>}
  </div>;
}
