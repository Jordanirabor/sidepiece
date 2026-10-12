import React, { useState } from 'react';
import { Award, Heart, MessageCircleHeart, Sparkles, Star, Wallet } from 'lucide-react';
import { naira } from './ui';

/** Mirrors `ActivityOutcome` in `crates/common` (spec Screen 14). */
export type ActivityOutcome = {
  source_id: string; kind: 'date' | 'encounter'; label: string; summary: string;
  partner_id: string; partner_name: string;
  money: number; xp: number; affinity: number; reputation_delta: number; objective_met: boolean;
  repeat: boolean; achievements: string[];
  my_feedback?: string[] | null; their_feedback?: string[] | null;
};

/** Mirrors `FEEDBACK_TAGS`: positive only, optional, and never tied to rewards. */
export const FEEDBACK_TAGS = ['Great vibe', 'Respectful', 'Funny', 'Good listener', 'Would meet again'];
const MAX_TAGS = 3;

/**
 * Spec 14: a concise summary after an activity. What you earned, how the relationship and your reputation
 * moved, optional feedback (skip has no penalty), then Continue.
 */
export function OutcomeCard({
  outcome, kicker, sending, onFeedback, onContinue, continueLabel = 'Continue', onStats,
}: {
  outcome: ActivityOutcome; kicker: string; sending: boolean;
  onFeedback: (tags: string[]) => void; onContinue: () => void; continueLabel?: string; onStats?: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [skipped, setSkipped] = useState(false);
  const toggle = (t: string) => setPicked((p) => p.includes(t) ? p.filter((x) => x !== t) : p.length < MAX_TAGS ? [...p, t] : p);
  const rep = Math.round(outcome.reputation_delta * 10) / 10;
  return <div className="date-outcome outcome-card">
    <span className="date-kicker">{kicker}</span>
    <h3>{outcome.label}</h3>
    <p>{outcome.summary}</p>
    <div className="reward-row" aria-label="Rewards">
      {outcome.money > 0 && <span className="reward cash"><Wallet size={15} strokeWidth={2.4} /><b>+{naira(outcome.money)}</b></span>}
      {outcome.xp > 0 && <span className="reward xp"><Star size={15} strokeWidth={2.4} /><b>+{outcome.xp} XP</b></span>}
      {rep > 0 && <span className="reward rep"><Sparkles size={15} strokeWidth={2.4} /><b>+{rep.toFixed(1)} rep</b></span>}
      {outcome.affinity > 0 && <span className="reward bond"><Heart size={15} strokeWidth={2.4} /><b>+{outcome.affinity} with {outcome.partner_name}</b></span>}
    </div>
    {outcome.achievements.length > 0 && <div className="achievement-toast">
      {outcome.achievements.map((a) => <span key={a}><Award size={15} strokeWidth={2.4} /> Achievement unlocked · <b>{a}</b></span>)}
    </div>}

    {outcome.their_feedback && outcome.their_feedback.length > 0 && <div className="feedback-received">
      <MessageCircleHeart size={16} strokeWidth={2.4} />
      <span><b>{outcome.partner_name}</b> said: {outcome.their_feedback.join(' · ')}</span>
    </div>}

    {outcome.my_feedback
      ? <p className="feedback-done">You said: {outcome.my_feedback.join(' · ')}. Thanks.</p>
      : !skipped && <div className="feedback-box">
        <span className="feedback-q">How was {outcome.partner_name}? <small>Optional. It doesn't change anyone's rewards.</small></span>
        <div className="feedback-tags" role="group" aria-label="Feedback">
          {FEEDBACK_TAGS.map((t) => <button key={t} type="button" aria-pressed={picked.includes(t)} className={`feedback-tag ${picked.includes(t) ? 'on' : ''}`} onClick={() => toggle(t)}>{t}</button>)}
        </div>
        <div className="feedback-actions">
          <button className="ghost" onClick={() => setSkipped(true)}>Skip</button>
          <button disabled={picked.length === 0 || sending} onClick={() => onFeedback(picked)}>{sending ? 'Sending…' : 'Send feedback'}</button>
        </div>
      </div>}

    <button className="cta" onClick={onContinue}>{continueLabel}</button>
    {onStats && <button className="link-btn outcome-stats" onClick={onStats}>See your stats</button>}
  </div>;
}
