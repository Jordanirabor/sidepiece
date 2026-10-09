import React, { useEffect, useRef, useState } from 'react';

export type Needs = { energy: number; hunger: number; mood: number; social: number; love: number };
export type Life = { money: number; xp: number; level: number; xp_into_level: number; xp_for_next: number; needs: Needs; clock: { label: string; hour: number; minute: number; is_night: boolean } };

const NEEDS: { key: keyof Needs; icon: string; label: string }[] = [
  { key: 'energy', icon: '⚡', label: 'Energy' },
  { key: 'hunger', icon: '🍴', label: 'Hunger' },
  { key: 'mood', icon: '🙂', label: 'Mood' },
  { key: 'social', icon: '💬', label: 'Social' },
  { key: 'love', icon: '💗', label: 'Love' },
];

const needColor = (v: number) => (v >= 60 ? '#3fdc6f' : v >= 30 ? '#e8b021' : '#ff4d5e');

export function TopHud({ life }: { life?: Life }) {
  if (!life) return null;
  return <div className="top-hud">
    <div className="hud-group">
      <span className="hud-stat" title="Money">🪙 <b>${life.money}</b></span>
      <span className="hud-stat" title={`XP ${life.xp_into_level}/${life.xp_for_next}`}>⭐ <b>Lv {life.level}</b>
        <span className="mini-bar"><i style={{ width: `${(life.xp_into_level / life.xp_for_next) * 100}%`, background: '#e8b021' }} /></span>
      </span>
    </div>
    <div className="hud-group">
      {NEEDS.map((n) => <span key={n.key} className="hud-need" title={`${n.label} ${Math.round(life.needs[n.key])}`}>
        {n.icon}
        <span className="mini-bar"><i style={{ width: `${life.needs[n.key]}%`, background: needColor(life.needs[n.key]) }} /></span>
      </span>)}
    </div>
    <div className="hud-group clock">{life.clock.is_night ? '🌙' : '☀️'} <b>{life.clock.label}</b></div>
  </div>;
}

export type ChatMessage = { role: 'player' | 'npc'; content: string; score_delta: number };
export type RelationshipView = { affinity: number; tier_index: number; tier_count: number; tier_label: string };
export type Thread = { npc_id: string; npc_name: string; tagline: string; messages: ChatMessage[]; relationship: RelationshipView };

type ChatProps = {
  thread: Thread;
  typing: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
  onInterest: () => void;
  onPrivate: () => void;
};

export function NpcChat({ thread, typing, onSend, onClose, onInterest, onPrivate }: ChatProps) {
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [thread.messages.length, typing]);
  const r = thread.relationship;
  const canGoPrivate = r.tier_index >= 4;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || typing) return;
    onSend(text);
    setDraft('');
  };

  return <div className="npc-chat">
    <header>
      <div className="npc-title"><b>{thread.npc_name}</b> <span>| {r.tier_label}</span></div>
      <div className="affinity" title={`Affinity ${r.affinity}/100`}>
        <span>☹️</span>
        <span className="affinity-bar"><i style={{ width: `${r.affinity}%` }} /></span>
        <span>😊</span>
      </div>
      <span className="tier-count" title="Relationship tier">{r.tier_index}/{r.tier_count}</span>
      <button className="close" onClick={onClose} aria-label="Close">×</button>
    </header>
    <div className="npc-log" ref={logRef}>
      {thread.messages.map((m, i) => <p key={i} className={`npc-msg ${m.role}`}>
        {m.role === 'player' && <span className={`delta ${m.score_delta > 0 ? 'up' : m.score_delta < 0 ? 'down' : ''}`}>({m.score_delta > 0 ? '+' : ''}{m.score_delta})</span>}
        {m.content}
      </p>)}
      {typing && <p className="npc-msg npc typing"><i /><i /><i /></p>}
    </div>
    <form onSubmit={submit}>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Enter text…" maxLength={400} autoFocus />
      <button type="submit" disabled={!draft.trim() || typing} aria-label="Send">➤</button>
    </form>
    <div className="npc-actions">
      <button className="ghost" onClick={onInterest}>Show interest</button>
      <button className="ghost" disabled={!canGoPrivate} title={canGoPrivate ? '' : 'Become friends first'} onClick={onPrivate}>Somewhere private</button>
    </div>
  </div>;
}
