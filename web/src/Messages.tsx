import React, { useEffect, useRef, useState } from 'react';
import { CalendarHeart, ChevronLeft, Ellipsis, Heart, SendHorizontal } from 'lucide-react';
import { EmptyState, ErrorState, Sheet } from './ui';
import { DEFAULT_LOOK, Look } from './look';
import { Preview } from './Creator';
import { InviteCard, Invitation } from './Invites';
import { PublicStats, PublicStatsRow } from './Stats';

export type Conversation = {
  target_id: string; display_name: string; kind: 'player' | 'npc'; look?: Look; last_message: string;
  updated_at: string; unread_count: number; online: boolean; location: string; venue: string; muted: boolean; ended: boolean;
  pending_invite?: string | null;
};
export type Inbox = { conversations: Conversation[]; unread_count: number; invite_count?: number };
export type DmMessage = { id: string; sender_id: string; recipient_id: string; content: string; created_at: string; read_at?: string | null; outgoing: boolean };
export type DmThread = {
  target_id: string; display_name: string; look?: Look; online: boolean; location: string; venue: string;
  muted: boolean; ended: boolean; messages: DmMessage[]; open_to?: string[]; invitations?: Invitation[];
  stats?: PublicStats;
};

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function Bubble({ msg }: { msg: DmMessage }) {
  return <div className={`dm-bubble ${msg.outgoing ? 'out' : 'in'}`}>
    <p>{msg.content}</p>
    <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{msg.outgoing ? msg.read_at ? ' · read' : ' · sent' : ''}</span>
  </div>;
}

export function MessagesPanel({
  inbox, loading, error, onRetry, onDiscover, onOpen, onOpenNpc, onRefresh,
}: {
  inbox?: Inbox; loading: boolean; error?: string; onRetry: () => void; onDiscover: () => void;
  onOpen: (c: Conversation) => void; onOpenNpc: (id: string) => void; onRefresh: () => void;
}) {
  return <div className="tab-panel messages-panel">
    <header className="tab-panel-head row"><div className="title-wrap"><h2>Messages</h2><span className="sticker">slide in 💌</span></div><button className="pill-btn with-icon" onClick={onDiscover}><Heart size={16} strokeWidth={2.5} fill="currentColor" /> Discover</button></header>
    {loading && !inbox && <div className="state-block"><div className="state-icon">💬</div><strong>Loading conversations…</strong></div>}
    {error && <ErrorState body={error} onAction={onRetry} />}
    {inbox && inbox.conversations.length === 0 && <EmptyState icon="💘" title="No conversations yet" body="Like people in Discover. When they like you back, your chat starts here." actionLabel="Open Discover" onAction={onDiscover} />}
    {inbox && inbox.conversations.length > 0 && <>
      <div className="story-row" aria-label="Your people">
        {inbox.conversations.slice(0, 12).map((c) => <button key={c.target_id} className={`story ${c.unread_count ? 'hot' : ''} ${c.kind}`} onClick={() => c.kind === 'npc' ? onOpenNpc(c.target_id.replace('npc:', '')) : onOpen(c)}>
          <span className="story-ring"><span className="story-face">{c.display_name[0]?.toUpperCase()}</span>{c.online && c.kind === 'player' && <i className="online-dot" />}</span>
          <small>{c.display_name}</small>
        </button>)}
      </div>
      <div className="inbox-toolbar"><span>{inbox.unread_count ? `${inbox.unread_count} unread` : 'All caught up'}</span><button className="link-btn" onClick={onRefresh}>Refresh</button></div>
      <div className="inbox-list">
        {inbox.conversations.map((c) => <button key={c.target_id} className={`inbox-row ${c.unread_count ? 'unread' : ''}`} onClick={() => c.kind === 'npc' ? onOpenNpc(c.target_id.replace('npc:', '')) : onOpen(c)}>
          <div className={`avatar-orb ${c.kind}`} style={{ width: 52, height: 52, fontSize: 21 }}>{c.display_name[0]?.toUpperCase()}</div>
          <div className="inbox-main">
            <strong>{c.display_name} {c.muted && <em className="muted-pill">muted</em>}</strong>
            {c.pending_invite ? <span className="invite-note">📩 Invited you: {c.pending_invite}</span> : <span>{c.last_message}</span>}
          </div>
          <div className="inbox-meta">
            <span>{timeAgo(c.updated_at)}</span>
            {(c.unread_count > 0 || c.pending_invite) && <b>{c.unread_count + (c.pending_invite ? 1 : 0)}</b>}
            <small className={c.online ? 'on' : ''}>{c.kind === 'npc' ? 'Local' : c.online ? '●' : '○'}</small>
          </div>
        </button>)}
      </div>
    </>}
  </div>;
}

type Timeline = { at: string; key: string; msg?: DmMessage; inv?: Invitation };

export function DmChat({
  thread, sending, inviteBusy, onBack, onSend, onMore, onProfile, onSuggest, onRespond, onJoinDate, onEnterRoom,
}: {
  thread: DmThread; sending: boolean; inviteBusy: boolean; onBack: () => void; onSend: (text: string) => void; onMore: () => void;
  onProfile: () => void; onSuggest: (activity?: string) => void;
} & Omit<React.ComponentProps<typeof InviteCard>, 'inv' | 'busy'>) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const invitations = thread.invitations ?? [];
  // Messages and invitation cards share one timeline (spec 11: the card appears within the chat).
  const timeline: Timeline[] = [
    ...thread.messages.map((m) => ({ at: m.created_at, key: `m-${m.id}`, msg: m })),
    ...invitations.map((i) => ({ at: i.created_at, key: `i-${i.id}`, inv: i })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const pendingOut = invitations.some((i) => i.outgoing && i.status === 'pending');
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [timeline.length]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || sending) return;
    setText('');
    onSend(msg);
  };
  return <div className="dm-screen">
    <header className="dm-head">
      <button className="icon-btn" aria-label="Back to inbox" onClick={onBack}><ChevronLeft size={20} strokeWidth={2.5} /></button>
      <button className="dm-person" onClick={onProfile}>
        <div className="avatar-orb player" style={{ width: 42, height: 42, fontSize: 18 }}>{thread.display_name[0]?.toUpperCase()}</div>
        <span><strong>{thread.display_name}</strong><em className={thread.online ? 'on' : ''}>{thread.online ? `● ${thread.location}` : 'Offline'}</em></span>
      </button>
      <button className="icon-btn" aria-label="Conversation controls" onClick={onMore}><Ellipsis size={20} strokeWidth={2.5} /></button>
    </header>
    <div className="quick-actions">
      <button className="pill-btn ghost with-icon" disabled={pendingOut} title={pendingOut ? 'Your invitation is still waiting' : ''} onClick={() => onSuggest()}><CalendarHeart size={15} strokeWidth={2.5} /> Make plans</button>
      <button className="pill-btn ghost" disabled={pendingOut} onClick={() => onSuggest('public_date')}>Date</button>
      <button className="pill-btn ghost" disabled={pendingOut} onClick={() => onSuggest('venue_visit')}>Venue</button>
    </div>
    <div className="dm-log">
      {timeline.length === 0 && <div className="state-block compact"><strong>You matched.</strong><span>Say hello — no activities start until both people agree.</span></div>}
      {timeline.map((t) => t.msg
        ? <Bubble key={t.key} msg={t.msg} />
        : <InviteCard key={t.key} inv={t.inv!} busy={inviteBusy} onRespond={onRespond} onJoinDate={onJoinDate} onEnterRoom={onEnterRoom} />)}
      <div ref={endRef} />
    </div>
    <form className="dm-compose" onSubmit={submit}>
      <input aria-label="Message" placeholder="Message…" maxLength={400} value={text} onChange={(e) => setText(e.target.value)} />
      <button disabled={sending || !text.trim()}>{sending ? '…' : <><SendHorizontal size={16} strokeWidth={2.5} /> Send</>}</button>
    </form>
  </div>;
}

/** Header profile shortcut (spec 09): the same avatar, presence, and a way to meet in the world. */
export function DmProfileSheet({
  thread, onClose, onMeet, onMore,
}: { thread: DmThread; onClose: () => void; onMeet: (venue: string) => void; onMore: () => void }) {
  const canMeet = thread.online && !!thread.venue;
  return <Sheet title={thread.display_name} subtitle={thread.online ? `● ${thread.location}` : 'Offline'} onClose={onClose}>
    <div className="dm-profile">
      <div className="card-portrait player"><Preview look={thread.look ?? DEFAULT_LOOK} framing="full" interactive={false} /></div>
      <PublicStatsRow stats={thread.stats} />
      <p className="deck-hint">You matched. Only what {thread.display_name} chose to share is shown.</p>
      <div className="dm-profile-actions">
        <button disabled={!canMeet} onClick={() => onMeet(thread.venue)}>{canMeet ? `Meet at ${thread.location}` : thread.online ? 'Busy right now' : 'Offline right now'}</button>
        <button className="ghost" onClick={onMore}>Conversation controls</button>
      </div>
    </div>
  </Sheet>;
}
