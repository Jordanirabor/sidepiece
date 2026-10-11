import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { Preview } from './Creator';
import { DEFAULT_LOOK, Look } from './look';
import { labelOf, RELATIONSHIP_STYLES } from './prefs';
import { Heart, Info, X } from 'lucide-react';
import { EmptyState, ErrorState } from './ui';

/** Mirrors `DiscoverableProfile` (crates/common). */
export type Card = {
  id: string; display_name: string; kind: 'npc' | 'player'; location: string; looking_for: string;
  compatibility: number; social_rating: number; bio?: string; interests?: string[];
  relationship_style?: string | null; open_to?: string[]; look?: Look; online?: boolean;
};
/** Mirrors `MatchView`. */
export type Match = {
  target_id: string; display_name: string; kind: 'npc' | 'player'; look?: Look; matched_at: string;
  is_new: boolean; online: boolean; location: string; venue: string;
};
type LikeResult = { matched: boolean; match_info?: Match };

const SWIPE = 90;

function where(c: Card) {
  if (c.kind === 'npc') return `Local · ${c.location}`;
  return c.online ? `● Online · ${c.location}` : 'Offline';
}

function CardFace({ card, myInterests, big }: { card: Card; myInterests: string[]; big?: boolean }) {
  const shared = (card.interests ?? []).filter((i) => myInterests.includes(i));
  return <>
    <div className={`card-portrait ${card.kind}`}>
      <Preview look={card.look ?? DEFAULT_LOOK} framing={big ? 'full' : 'face'} interactive={false} />
      <span className="card-match">{card.compatibility}% match</span>
    </div>
    <div className="card-info">
      <h3>{card.display_name} <em className={`kind-badge ${card.kind}`}>{card.kind === 'npc' ? 'local' : 'player'}</em></h3>
      <span className={`card-where ${card.online ? 'on' : ''}`}>{where(card)}</span>
      {card.bio && <p className="card-bio-big">{card.kind === 'player' ? `“${card.bio}”` : card.bio}</p>}
      <div className="pill-row tight">
        {card.relationship_style && <span className="pill">{labelOf(RELATIONSHIP_STYLES, card.relationship_style)}</span>}
        {(card.interests ?? []).map((i) => <span key={i} className={`pill ${shared.includes(i) ? 'shared' : ''}`}>{i}</span>)}
      </div>
      {big && <div className="why-match">
        <h4>Why you might click</h4>
        <p>{card.looking_for}</p>
        {shared.length > 0 && <p>You're both into <b>{shared.join(', ')}</b>.</p>}
        {card.kind === 'npc' && <p>Locals warm up as you talk. Get to <b>Friendly</b> in chat and they'll like you back.</p>}
      </div>}
    </div>
  </>;
}

type Props = {
  playerId: string;
  myInterests: string[];
  onClose: () => void;
  onMatch: (m: Match) => void;
  notify: (text: string, tone?: 'info' | 'error' | 'good') => void;
  onBroaden: () => void;
  onChangeLocation: () => void;
  onMeetNpc: () => void;
};

/** Spec Screens 07 (deck) and 07A (profile detail). Like/Pass are instant; no confirmations. */
export function Discover({ playerId, myInterests, onClose, onMatch, notify, onBroaden, onChangeLocation, onMeetNpc }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fallback, setFallback] = useState(false);
  const [detail, setDetail] = useState(false);
  const [drag, setDrag] = useState(0);
  const [busy, setBusy] = useState(false);
  const startX = useRef<number | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const deck = await api.get<{ profiles: Card[]; fallback: boolean }>('/v1/discover', { player_id: playerId, limit: '10' });
      // Cards already on screen (not yet acted on) may come back; keep each once.
      const fresh = deck.profiles.filter((p) => !seen.current.has(p.id));
      fresh.forEach((p) => seen.current.add(p.id));
      setCards((c) => [...c, ...fresh]);
      setFallback(deck.fallback);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [playerId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (state === 'ready' && cards.length === 2) load(); }, [cards.length, state, load]);

  const top = cards[0];
  const next = () => { setCards((c) => c.slice(1)); setDetail(false); setDrag(0); };

  const act = useCallback(async (kind: 'like' | 'pass') => {
    if (!top || busy) return;
    setBusy(true);
    const card = top;
    next(); // optimistic: the deck moves on immediately
    try {
      if (kind === 'pass') {
        await api.post('/v1/social/pass', { player_id: playerId, target_id: card.id });
      } else {
        const r = await api.post<LikeResult>('/v1/social/interest', { player_id: playerId, target_id: card.id, intent: 'like' });
        if (r.matched && r.match_info) onMatch(r.match_info);
        else if (card.kind === 'npc') notify(`${card.display_name} noticed. Chat at ${card.location} to get closer.`);
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(false);
    }
  }, [top, busy, playerId, onMatch, notify]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') act('like');
      else if (e.key === 'ArrowLeft') act('pass');
      else if (e.key === 'Escape') { if (detail) setDetail(false); else onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, detail, onClose]);

  const pointer = {
    onPointerDown: (e: React.PointerEvent) => { startX.current = e.clientX; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); },
    onPointerMove: (e: React.PointerEvent) => { if (startX.current !== null) setDrag(e.clientX - startX.current); },
    onPointerUp: () => {
      const d = drag;
      startX.current = null;
      if (d > SWIPE) act('like');
      else if (d < -SWIPE) act('pass');
      else { if (Math.abs(d) < 6) setDetail(true); setDrag(0); }
    },
    onPointerCancel: () => { startX.current = null; setDrag(0); },
  };

  return <div className="tab-panel discover">
    <header className="tab-panel-head discover-head">
      <div>
        <h2>{detail ? 'Profile' : 'Discover'}</h2>
        {!detail && <span>{fallback ? 'No players left nearby. Meet the locals.' : 'Players first. Like or pass, no pressure.'}</span>}
      </div>
      <button className="icon-btn" aria-label={detail ? 'Back' : 'Close'} onClick={() => (detail ? setDetail(false) : onClose())}>{detail ? '‹' : '×'}</button>
    </header>

    {state === 'loading' && <div className="state-block"><div className="state-icon">💘</div><strong>Finding people…</strong></div>}
    {state === 'error' && <ErrorState body="We couldn't load profiles." onAction={() => { setState('loading'); load(); }} />}
    {state === 'ready' && !top && <EmptyState icon="🌃" title="You've seen everyone for now" body="Passed profiles come back tomorrow. Meanwhile:" />}
    {state === 'ready' && !top && <div className="empty-actions">
      <button className="pill-btn" onClick={onBroaden}>Broaden preferences</button>
      <button className="pill-btn ghost" onClick={onChangeLocation}>Change location</button>
      <button className="pill-btn ghost" onClick={onMeetNpc}>Meet a local</button>
    </div>}

    {top && !detail && <div className="deck">
      <div className="deck-stack">
      {cards[1] && <div className="deck-card under" aria-hidden="true" />}
      <article
        key={top.id}
        className="deck-card"
        style={{ transform: `translateX(${drag}px) rotate(${drag / 18}deg)` }}
        {...pointer}
      >
        <CardFace card={top} myInterests={myInterests} />
        {drag > 30 && <span className="stamp like">LIKE</span>}
        {drag < -30 && <span className="stamp pass">PASS</span>}
      </article>
      </div>
      <div className="deck-actions">
        <button className="round pass" aria-label="Pass" disabled={busy} onClick={() => act('pass')}><X size={26} strokeWidth={3} /></button>
        <button className="round info ghost" aria-label="View profile" onClick={() => setDetail(true)}><Info size={20} strokeWidth={2.5} /></button>
        <button className="round like" aria-label="Like" disabled={busy} onClick={() => act('like')}><Heart size={30} strokeWidth={0} fill="currentColor" /></button>
      </div>
      <p className="deck-hint">Tap the card for their profile · swipe or use ← → keys</p>
    </div>}

    {top && detail && <div className="profile-detail">
      <CardFace card={top} myInterests={myInterests} big />
      <div className="detail-actions">
        <button className="ghost" onClick={() => act('pass')}>Pass</button>
        <button onClick={() => act('like')}>♥ Express interest</button>
      </div>
      <p className="deck-hint">Only what {top.display_name} chose to share is shown. Boundaries and private details stay private.</p>
    </div>}
  </div>;
}

/** Spec Screen 08: short, skippable match moment. */
export function MatchMoment({ match, myLook, onStartChat, onKeepExploring }: { match: Match; myLook: Look; onStartChat: () => void; onKeepExploring: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onKeepExploring(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKeepExploring]);
  return <div className="match-scrim" role="dialog" aria-label={`You matched with ${match.display_name}`}>
    <div className="match-card">
      <div className="match-faces">
        <div className="match-face me"><Preview look={myLook} framing="face" interactive={false} /></div>
        <div className="match-heart">♥</div>
        <div className="match-face them"><Preview look={match.look ?? DEFAULT_LOOK} framing="face" interactive={false} /></div>
      </div>
      <h2>It's a match</h2>
      <p>You and {match.display_name} like each other.{match.online && match.location ? ` They're at ${match.location}.` : ''}</p>
      <button className="hero" onClick={onStartChat}>Start chat</button>
      <button className="ghost hero" onClick={onKeepExploring}>Keep exploring</button>
    </div>
  </div>;
}
