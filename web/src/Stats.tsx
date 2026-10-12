import React from 'react';
import { Award, ChevronRight, Eye, EyeOff, Flame, Heart, Lock, Sparkles, Users, Wallet } from 'lucide-react';
import { EmptyState, Sheet, Toggle, naira } from './ui';

/** Mirrors `StatVisibility`, `PublicStats` and `PlayerStats` in `crates/common` (spec Screens 15 and 15A). */
export type StatVisibility = { level: boolean; reputation: boolean; achievements: boolean; body_count: boolean; encounters: boolean };
export type PublicStats = {
  level?: number | null; level_title?: string | null; reputation?: number | null;
  achievements?: number | null; body_count?: number | null; encounters?: number | null;
};
export type Achievement = { id: string; label: string; description: string; icon: string; reward: number; unlocked_at?: string | null };
export type PlayerStats = {
  level: number; level_title: string; next_title?: string | null; xp: number; xp_into_level: number; xp_for_next: number;
  money: number; cash_earned: number; cash_spent: number;
  reputation: number; reputation_parts: { label: string; value: number; max: number }[];
  body_count: number; total_encounters: number; dates_completed: number; matches: number; connections: number;
  achievements: Achievement[];
  feedback: { from_name: string; activity: string; tags: string[]; created_at: string }[];
  visibility: StatVisibility;
};

const Vis = ({ on }: { on: boolean }) => <em className={`vis ${on ? 'on' : ''}`} title={on ? 'Others can see this' : 'Only you can see this'}>
  {on ? <Eye size={11} strokeWidth={2.6} /> : <EyeOff size={11} strokeWidth={2.6} />}{on ? 'public' : 'private'}
</em>;

/**
 * Spec 15: the profile as a record of your journey. Level and title, reputation, body count (unique partners),
 * cash and total encounters, each marked public or private. Cash is always private.
 */
export function StatsHero({ stats, onDetails, onExplore }: { stats?: PlayerStats; onDetails: () => void; onExplore: () => void }) {
  if (!stats) return <div className="stats-hero loading" aria-busy="true"><span className="skeleton" /><span className="skeleton" /></div>;
  const v = stats.visibility;
  const fresh = stats.dates_completed + stats.total_encounters === 0;
  const unlocked = stats.achievements.filter((a) => a.unlocked_at).length;
  return <section className="stats-hero" aria-label="Your stats">
    <div className="stats-title">
      <span>Level {stats.level} · <b>{stats.level_title}</b></span>
      <span className="rep-badge"><Sparkles size={14} strokeWidth={2.6} />{stats.reputation.toFixed(1)}<small>/10</small></span>
    </div>
    <div className="stats-grid">
      <div className="stat body"><span className="stat-label">Body count <Vis on={v.body_count} /></span><b>{stats.body_count}</b><small>Unique partners</small></div>
      <div className="stat cash"><span className="stat-label">Game cash <Vis on={false} /></span><b>{naira(stats.money)}</b><small>Available balance</small></div>
      <div className="stat rep"><span className="stat-label">Social rating <Vis on={v.reputation} /></span><b>{stats.reputation.toFixed(1)}/10</b><small>Reputation</small></div>
      <div className="stat enc"><span className="stat-label">Encounters <Vis on={v.encounters} /></span><b>{stats.total_encounters}</b><small>Total, repeats included</small></div>
    </div>
    {fresh && <p className="stats-fresh">Your story starts here. Dates, encounters and feedback all show up on this card. <button className="link-btn" onClick={onExplore}>Explore the world</button></p>}
    <button className="stats-more" onClick={onDetails}>
      <Award size={18} strokeWidth={2.4} />
      <span><b>Detailed stats</b><small>{unlocked}/{stats.achievements.length} achievements · choose what others see</small></span>
      <ChevronRight size={18} strokeWidth={2.6} />
    </button>
  </section>;
}

/** What other players see of someone: only what they made public. Renders nothing if it's all private. */
export function PublicStatsRow({ stats }: { stats?: PublicStats | null }) {
  if (!stats) return null;
  const items: { key: string; icon: React.ReactNode; text: string }[] = [];
  if (stats.level != null) items.push({ key: 'lvl', icon: <Flame size={13} strokeWidth={2.6} />, text: `Lv ${stats.level}${stats.level_title ? ` · ${stats.level_title}` : ''}` });
  if (stats.reputation != null) items.push({ key: 'rep', icon: <Sparkles size={13} strokeWidth={2.6} />, text: `${stats.reputation.toFixed(1)}/10` });
  if (stats.achievements != null) items.push({ key: 'ach', icon: <Award size={13} strokeWidth={2.6} />, text: `${stats.achievements} achievements` });
  if (stats.body_count != null) items.push({ key: 'bc', icon: <Users size={13} strokeWidth={2.6} />, text: `Body count ${stats.body_count}` });
  if (stats.encounters != null) items.push({ key: 'enc', icon: <Heart size={13} strokeWidth={2.6} />, text: `${stats.encounters} encounters` });
  if (!items.length) return null;
  return <div className="public-stats" aria-label="Public stats">{items.map((i) => <span key={i.key} className="pill">{i.icon}{i.text}</span>)}</div>;
}

const VIS_ROWS: { key: keyof StatVisibility; label: string; hint: string }[] = [
  { key: 'level', label: 'Level and title', hint: 'e.g. Lv 8 · Rising Star' },
  { key: 'reputation', label: 'Social rating', hint: 'Your reputation out of 10' },
  { key: 'achievements', label: 'Achievements', hint: 'How many you have unlocked' },
  { key: 'body_count', label: 'Body count', hint: 'Unique partners. Private unless you share it.' },
  { key: 'encounters', label: 'Total encounters', hint: 'Private unless you share it.' },
];

/** Spec 15A: optional detail. Clear definitions, how reputation is made, achievements, rating history, visibility. */
export function StatsSheet({
  stats, saving, onVisibility, onClose,
}: { stats: PlayerStats; saving: boolean; onVisibility: (v: StatVisibility) => void; onClose: () => void }) {
  const pct = Math.min(100, (stats.xp_into_level / Math.max(1, stats.xp_for_next)) * 100);
  return <Sheet title="Detailed stats" subtitle={`Level ${stats.level} · ${stats.level_title}`} onClose={onClose}>
    <div className="stats-detail">
      <div className="level-progress">
        <div><b>{stats.xp_into_level}</b> / {stats.xp_for_next} XP to level {stats.level + 1}{stats.next_title && <> · next title <b>{stats.next_title}</b></>}</div>
        <span className="xp-bar"><i style={{ width: `${pct}%` }} /></span>
      </div>

      <h3 className="subhead">Your record</h3>
      <dl className="stat-list">
        <div><dt>Unique partners (body count)</dt><dd>{stats.body_count}</dd></div>
        <div><dt>Total encounters</dt><dd>{stats.total_encounters}</dd></div>
        <div><dt>Dates finished</dt><dd>{stats.dates_completed}</dd></div>
        <div><dt>Matches</dt><dd>{stats.matches}</dd></div>
        <div><dt>Friends (Friend tier or above)</dt><dd>{stats.connections}</dd></div>
      </dl>
      <p className="stat-note">Body count is the number of different people you've completed a private encounter with. Three encounters with the same person count once. It's a record, not a rating, and you never need it to progress.</p>

      <h3 className="subhead">Cash</h3>
      <dl className="stat-list">
        <div><dt><Wallet size={14} strokeWidth={2.4} /> Balance</dt><dd>{naira(stats.money)}</dd></div>
        <div><dt>Earned</dt><dd className="up">+{naira(stats.cash_earned)}</dd></div>
        <div><dt>Spent</dt><dd className="down">-{naira(stats.cash_spent)}</dd></div>
      </dl>

      <h3 className="subhead">Reputation · {stats.reputation.toFixed(1)}/10</h3>
      <div className="rep-parts">
        <div className="rep-part"><span>Everyone starts at</span><b>5.0</b></div>
        {stats.reputation_parts.map((p) => <div key={p.label} className="rep-part">
          <span>{p.label}</span><b>+{p.value.toFixed(1)}<small> / {p.max.toFixed(1)}</small></b>
          <span className="xp-bar"><i style={{ width: `${(p.value / Math.max(0.1, p.max)) * 100}%` }} /></span>
        </div>)}
      </div>
      <p className="stat-note">Leaving, declining or skipping never lowers it.</p>

      <h3 className="subhead">Achievements</h3>
      <div className="achievement-grid">
        {stats.achievements.map((a) => <div key={a.id} className={`achievement ${a.unlocked_at ? 'got' : 'locked'}`}>
          <span className="ach-icon" aria-hidden="true">{a.unlocked_at ? a.icon : <Lock size={16} strokeWidth={2.4} />}</span>
          <b>{a.label}</b><small>{a.description}</small><em>{a.unlocked_at ? 'Unlocked' : `+${naira(a.reward)}`}</em>
        </div>)}
      </div>

      <h3 className="subhead">Rating history</h3>
      {stats.feedback.length === 0
        ? <EmptyState icon="💬" title="No feedback yet" body="After a date or encounter, partners can leave a few kind words. It's always optional." />
        : <ul className="feedback-list">{stats.feedback.map((f, i) => <li key={i}>
          <b>{f.from_name}</b><span className="muted"> · {f.activity}</span>
          <div className="pill-row tight">{f.tags.map((t) => <span key={t} className="pill good">{t}</span>)}</div>
        </li>)}</ul>}

      <h3 className="subhead">What others can see</h3>
      <div className="vis-list">
        {VIS_ROWS.map((r) => <Toggle key={r.key} label={r.label} hint={r.hint} checked={stats.visibility[r.key]}
          onChange={(on) => !saving && onVisibility({ ...stats.visibility, [r.key]: on })} />)}
        <p className="stat-note">Your cash balance is always private.</p>
      </div>
    </div>
  </Sheet>;
}
