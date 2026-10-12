import React from 'react';
import { ChevronRight } from 'lucide-react';
import { EmptyState, ErrorState } from './ui';

/** Mirrors `FeedItem` / `FeedResponse` in `crates/common` (spec Screen 16). */
export type FeedItem = {
  id: string; kind: 'match' | 'invitation' | 'date' | 'encounter' | 'achievement' | 'level' | 'feedback' | 'npc' | 'venue';
  icon: string; title: string; body: string; at: string;
  action_label?: string | null; action?: string | null; new: boolean;
};
export type Feed = { items: FeedItem[]; unseen_count: number };

function ago(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const WORLD = new Set(['npc', 'venue']);

/** Module-level so rows keep their identity across polls (no remount, no replayed entrance animation). */
function FeedRow({ item, onAction }: { item: FeedItem; onAction: (action: string) => void }) {
  return <button
    className={`feed-row kind-${item.kind} ${item.new ? 'new' : ''}`}
    disabled={!item.action}
    onClick={() => item.action && onAction(item.action)}
  >
    <span className="feed-icon" aria-hidden="true">{item.icon}</span>
    <span className="feed-main">
      <strong>{item.title}</strong>
      <span>{item.body}</span>
      <small>{WORLD.has(item.kind) ? 'Tonight in Lagos' : ago(item.at)}{item.action_label && <> · <b>{item.action_label}</b></>}</small>
    </span>
    {item.action && <ChevronRight size={18} strokeWidth={2.6} className="feed-go" />}
  </button>;
}

/**
 * Spec 16: a lightweight view of game-world activity. Personal items (only things you took part in) plus a
 * couple of world posts from locals and venues. Every item links straight to where it happened.
 */
export function FeedPanel({
  feed, loading, error, onRetry, onAction, onExplore,
}: {
  feed?: Feed; loading: boolean; error?: string; onRetry: () => void;
  onAction: (action: string) => void; onExplore: () => void;
}) {
  const personal = feed?.items.filter((i) => !WORLD.has(i.kind)) ?? [];
  const world = feed?.items.filter((i) => WORLD.has(i.kind)) ?? [];
  const fresh = personal.filter((i) => i.new);
  const earlier = personal.filter((i) => !i.new);

  return <div className="tab-panel feed-panel">
    <header className="tab-panel-head row"><div className="title-wrap"><h2>Feed</h2><span className="sticker">what's good 🔥</span></div></header>
    {loading && !feed && <div className="state-block"><div className="state-icon">✨</div><strong>Loading your feed…</strong></div>}
    {error && !feed && <ErrorState body={error} onAction={onRetry} />}
    {feed && <>
      {world.length > 0 && <section className="feed-section" aria-label="Around Lagos">
        <h3 className="subhead">Around Lagos</h3>
        <div className="feed-list world">{world.map((i) => <FeedRow key={i.id} item={i} onAction={onAction} />)}</div>
      </section>}
      {personal.length === 0
        ? <EmptyState icon="✨" title="Your story starts here" body="Matches, invitations, dates and achievements show up here as you play. Only you see your feed." actionLabel="Explore Lagos" onAction={onExplore} />
        : <>
          {fresh.length > 0 && <section className="feed-section" aria-label="New">
            <h3 className="subhead">New</h3>
            <div className="feed-list">{fresh.map((i) => <FeedRow key={i.id} item={i} onAction={onAction} />)}</div>
          </section>}
          {earlier.length > 0 && <section className="feed-section" aria-label="Earlier">
            <h3 className="subhead">Earlier</h3>
            <div className="feed-list">{earlier.map((i) => <FeedRow key={i.id} item={i} onAction={onAction} />)}</div>
          </section>}
          <p className="stat-note feed-note">Only you can see your feed. Nobody else sees your dates, encounters or achievements here.</p>
        </>}
    </>}
  </div>;
}
