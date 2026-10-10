import React, { useEffect, useRef, useState } from 'react';
import { EmptyState, ErrorState } from './ui';
import { Look } from './look';

export type Conversation = {
  target_id: string; display_name: string; kind: 'player' | 'npc'; look?: Look; last_message: string;
  updated_at: string; unread_count: number; online: boolean; location: string; venue: string; muted: boolean; ended: boolean;
};
export type Inbox = { conversations: Conversation[]; unread_count: number };
export type DmMessage = { id: string; sender_id: string; recipient_id: string; content: string; created_at: string; read_at?: string | null; outgoing: boolean };
export type DmThread = {
  target_id: string; display_name: string; look?: Look; online: boolean; location: string; venue: string;
  muted: boolean; ended: boolean; messages: DmMessage[];
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
    <header className="tab-panel-head row"><h2>Messages</h2><button className="pill-btn" onClick={onDiscover}>💘 Discover</button></header>
    {loading && !inbox && <div className="state-block"><div className="state-icon">💬</div><strong>Loading conversations…</strong></div>}
    {error && <ErrorState body={error} onAction={onRetry} />}
    {inbox && inbox.conversations.length === 0 && <EmptyState icon="💘" title="No conversations yet" body="Like people in Discover. When they like you back, your chat starts here." actionLabel="Open Discover" onAction={onDiscover} />}
    {inbox && inbox.conversations.length > 0 && <>
      <div className="inbox-toolbar"><span>{inbox.unread_count ? `${inbox.unread_count} unread` : 'All caught up'}</span><button className="link-btn" onClick={onRefresh}>Refresh</button></div>
      <div className="inbox-list">
        {inbox.conversations.map((c) => <button key={c.target_id} className={`inbox-row ${c.unread_count ? 'unread' : ''}`} onClick={() => c.kind === 'npc' ? onOpenNpc(c.target_id.replace('npc:', '')) : onOpen(c)}>
          <div className={`avatar-orb ${c.kind}`} style={{ width: 48, height: 48, fontSize: 20 }}>{c.display_name[0]?.toUpperCase()}</div>
          <div className="inbox-main">
            <strong>{c.display_name} {c.muted && <em className="muted-pill">muted</em>}</strong>
            <span>{c.last_message}</span>
          </div>
          <div className="inbox-meta">
            <span>{timeAgo(c.updated_at)}</span>
            {c.unread_count > 0 && <b>{c.unread_count}</b>}
            <small className={c.online ? 'on' : ''}>{c.kind === 'npc' ? 'Local' : c.online ? '●' : '○'}</small>
          </div>
        </button>)}
      </div>
    </>}
  </div>;
}

export function DmChat({
  thread, sending, onBack, onSend, onMore, onProfile, onSuggest,
}: {
  thread: DmThread; sending: boolean; onBack: () => void; onSend: (text: string) => void; onMore: () => void;
  onProfile: () => void; onSuggest: () => void;
}) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread.messages.length]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || sending) return;
    setText('');
    onSend(msg);
  };
  return <div className="dm-screen">
    <header className="dm-head">
      <button className="icon-btn" aria-label="Back to inbox" onClick={onBack}>‹</button>
      <button className="dm-person" onClick={onProfile}>
        <div className="avatar-orb player" style={{ width: 42, height: 42, fontSize: 18 }}>{thread.display_name[0]?.toUpperCase()}</div>
        <span><strong>{thread.display_name}</strong><em className={thread.online ? 'on' : ''}>{thread.online ? `● ${thread.location}` : 'Offline'}</em></span>
      </button>
      <button className="icon-btn" aria-label="Conversation controls" onClick={onMore}>⋯</button>
    </header>
    <div className="quick-actions">
      <button className="pill-btn ghost" onClick={onSuggest}>Suggest date</button>
      <button className="pill-btn ghost" onClick={onSuggest}>Suggest venue</button>
    </div>
    <div className="dm-log">
      {thread.messages.length === 0 && <div className="state-block compact"><strong>You matched.</strong><span>Say hello — no activities start until both people agree.</span></div>}
      {thread.messages.map((m) => <Bubble key={m.id} msg={m} />)}
      <div ref={endRef} />
    </div>
    <form className="dm-compose" onSubmit={submit}>
      <input aria-label="Message" placeholder="Message…" maxLength={400} value={text} onChange={(e) => setText(e.target.value)} />
      <button disabled={sending || !text.trim()}>{sending ? '…' : 'Send'}</button>
    </form>
  </div>;
}
