import React, { useState } from 'react';
import { BellRing, ChevronRight, Eye, EyeOff, FileText, HeartHandshake, LifeBuoy, LockKeyhole, LogOut, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, UserX } from 'lucide-react';
import { EmptyState, ErrorState, Sheet, Toggle } from './ui';
import type { LegalDoc } from './Welcome';
import type { Preferences } from './prefs';

/** Mirrors `NotificationPrefs`, `BlockedEntry` and `SettingsResponse` in `crates/common` (spec Screen 18). */
export type NotificationPrefs = { messages: boolean; matches: boolean; invitations: boolean; feed: boolean };
export type BlockedEntry = { target_id: string; display_name: string; kind: 'player' | 'npc'; blocked_at: string };
export type Settings = { email?: string | null; member_since: string; notifications: NotificationPrefs; blocked: BlockedEntry[] };
export const DEFAULT_ALERTS: NotificationPrefs = { messages: true, matches: true, invitations: true, feed: true };

const ALERT_ROWS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: 'messages', label: 'New messages', hint: 'Unread chats count on the Messages badge.' },
  { key: 'matches', label: 'New matches', hint: 'Pop up the match moment when someone likes you back.' },
  { key: 'invitations', label: 'Invitations', hint: 'Badge and toasts when plans are sent, accepted or declined.' },
  { key: 'feed', label: 'Feed activity', hint: 'Badge on Feed when something new involves you.' },
];

type Props = {
  settings?: Settings;
  error?: string;
  onRetry: () => void;
  prefs: Preferences;
  saving: boolean;
  onPrefs: (patch: Partial<Preferences>) => void;
  onDiscoveryPrefs: () => void;
  onStatVisibility: () => void;
  onAlerts: (n: NotificationPrefs) => void;
  onUnblock: (b: BlockedEntry) => void;
  onLegal: (doc: LegalDoc) => void;
  onSignOut: () => void;
  onChangePassword: (current: string, next: string) => Promise<boolean>;
  onDelete: (password: string) => Promise<void>;
  onClose: () => void;
};

const Row = ({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) =>
  <button className="stats-more settings-row" onClick={onClick}>
    {icon}
    <span><b>{label}</b><small>{hint}</small></span>
    <ChevronRight size={18} strokeWidth={2.6} />
  </button>;

/**
 * Spec 18: account, character visibility, discovery, alerts, blocked players, privacy, help, sign out and delete.
 * Every toggle says what it changes.
 */
export function SettingsSheet(p: Props) {
  const [pwOpen, setPwOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delPassword, setDelPassword] = useState('');
  const [delWord, setDelWord] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [show, setShow] = useState(false);

  const s = p.settings;
  if (!s) {
    return <Sheet title="Settings & privacy" onClose={p.onClose}>
      {p.error
        ? <ErrorState title="Couldn't load settings" body={p.error} onAction={p.onRetry} />
        : <div className="stats-hero loading" aria-busy="true"><span className="skeleton" /><span className="skeleton" /></div>}
    </Sheet>;
  }
  const hasEmail = !!s.email;
  const since = new Date(s.member_since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwBusy(true);
    try {
      if (await p.onChangePassword(current, next)) { setCurrent(''); setNext(''); setPwOpen(false); }
    } finally {
      setPwBusy(false);
    }
  };
  const submitDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setDelBusy(true);
    try {
      await p.onDelete(delPassword);
    } finally {
      setDelBusy(false);
    }
  };

  return <Sheet title="Settings & privacy" subtitle="What others see, alerts and your account" onClose={p.onClose}>
    <div className="settings">
      <h3 className="subhead">Account</h3>
      <dl className="stat-list">
        <div><dt>Email</dt><dd className="settings-value">{s.email ?? 'None (dev login)'}</dd></div>
        <div><dt>Member since</dt><dd className="settings-value">{since}</dd></div>
      </dl>
      {hasEmail && (pwOpen
        ? <form className="settings-form" onSubmit={submitPassword}>
          <label>Current password<input type={show ? 'text' : 'password'} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
          <label>New password<input type={show ? 'text' : 'password'} autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required /></label>
          <p className="stat-note">At least 10 characters. You stay signed in on this device.</p>
          <div className="settings-actions">
            <button type="button" className="ghost" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide passwords' : 'Show passwords'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            <button type="button" className="ghost" onClick={() => { setPwOpen(false); setCurrent(''); setNext(''); }}>Cancel</button>
            <button type="submit" disabled={pwBusy || !current || next.length < 10}>{pwBusy ? 'Saving…' : 'Change password'}</button>
          </div>
        </form>
        : <Row icon={<LockKeyhole size={18} strokeWidth={2.4} />} label="Change password" hint="Needs your current password" onClick={() => setPwOpen(true)} />)}

      <h3 className="subhead">Character visibility</h3>
      <div className="vis-list">
        <Toggle label="Show me in Nearby and Discover" hint="Off: you're hidden from other players' lists and decks. Matches and chats you already have keep working."
          checked={p.prefs.discoverable} onChange={(on) => !p.saving && p.onPrefs({ discoverable: on })} />
        <Toggle label="Interests on my profile" hint="Others see your interests on your card. Compatibility uses them either way."
          checked={p.prefs.public_interests} onChange={(on) => !p.saving && p.onPrefs({ public_interests: on })} />
        <Toggle label="Relationship style on my profile" hint="Others see what you're open to, like casual or long-term."
          checked={p.prefs.public_relationship_style} onChange={(on) => !p.saving && p.onPrefs({ public_relationship_style: on })} />
      </div>
      <Row icon={<Sparkles size={18} strokeWidth={2.4} />} label="Which stats others see" hint="Level, reputation, body count, encounters" onClick={p.onStatVisibility} />

      <h3 className="subhead">Discovery</h3>
      <Row icon={<SlidersHorizontal size={18} strokeWidth={2.4} />} label="Discovery preferences" hint="Who you want to see, intent, interests and boundaries" onClick={p.onDiscoveryPrefs} />

      <h3 className="subhead">Notifications</h3>
      <div className="vis-list">
        {ALERT_ROWS.map((r) => <Toggle key={r.key} label={r.label} hint={r.hint} checked={s.notifications[r.key]}
          onChange={(on) => p.onAlerts({ ...s.notifications, [r.key]: on })} />)}
        <p className="stat-note"><BellRing size={12} strokeWidth={2.4} /> These are in-app alerts. Private-room requests always show, since they need your answer. Push and email aren't available yet.</p>
      </div>

      <h3 className="subhead">Blocked · {s.blocked.length}</h3>
      {s.blocked.length === 0
        ? <EmptyState icon="🛡️" title="No one blocked" body="Block anyone from their profile or chat. They'll be hidden from you and won't see you." />
        : <ul className="blocked-list">{s.blocked.map((b) => <li key={b.target_id}>
          <UserX size={18} strokeWidth={2.4} />
          <span><b>{b.display_name}</b><small>{b.kind === 'npc' ? 'Local' : 'Player'} · blocked {new Date(b.blocked_at).toLocaleDateString()}</small></span>
          <button className="ghost" onClick={() => p.onUnblock(b)}>Unblock</button>
        </li>)}</ul>}

      <h3 className="subhead">Privacy & help</h3>
      <Row icon={<ShieldCheck size={18} strokeWidth={2.4} />} label="Privacy" hint="What we keep and what others can see" onClick={() => p.onLegal('privacy')} />
      <Row icon={<HeartHandshake size={18} strokeWidth={2.4} />} label="Community rules" hint="Consent first, no harassment, respect blocks" onClick={() => p.onLegal('rules')} />
      <Row icon={<FileText size={18} strokeWidth={2.4} />} label="Terms" hint="Adults 18+ only" onClick={() => p.onLegal('terms')} />
      <p className="stat-note settings-help"><LifeBuoy size={12} strokeWidth={2.4} /> Something wrong with someone? Use Report on their profile or chat. It's always there, and they aren't told who reported them.</p>

      <button className="link-btn signout" onClick={p.onSignOut}><LogOut size={15} strokeWidth={2.4} /> Sign out</button>

      <section className="danger-zone">
        {delOpen
          ? <form className="settings-form" onSubmit={submitDelete}>
            <strong>Delete your account for good?</strong>
            <p className="stat-note">Your character, chats, matches, invitations, stats and ₦ are erased and can't be recovered. People you met keep their own history, and reports about past behaviour are kept for safety.</p>
            {hasEmail && <label>Password<input type="password" autoComplete="current-password" value={delPassword} onChange={(e) => setDelPassword(e.target.value)} required /></label>}
            <label>Type DELETE to confirm<input value={delWord} onChange={(e) => setDelWord(e.target.value)} autoCapitalize="characters" required /></label>
            <div className="settings-actions">
              <button type="button" className="ghost" onClick={() => { setDelOpen(false); setDelPassword(''); setDelWord(''); }}>Keep my account</button>
              <button type="submit" className="danger" disabled={delBusy || delWord !== 'DELETE' || (hasEmail && !delPassword)}>{delBusy ? 'Deleting…' : 'Delete account'}</button>
            </div>
          </form>
          : <button className="ghost danger-text delete-account" onClick={() => setDelOpen(true)}><Trash2 size={15} strokeWidth={2.4} /> Delete account</button>}
      </section>
    </div>
  </Sheet>;
}
