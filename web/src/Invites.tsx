import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { InvitationCard, ProfileCardAction, Sheet, naira } from './ui';

/** Mirrors `ActivityInfo` / `InvitationView` in `crates/common` (spec Screens 10 and 11). */
export type Activity = { id: string; label: string; description: string; icon: string; cost: number; venue: string };
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
export type Invitation = {
  id: string; activity: string; label: string; icon: string; cost: number;
  from_player_id: string; from_name: string; target_id: string; target_name: string; outgoing: boolean;
  status: InviteStatus; expires_at: string; created_at: string;
  date_id?: string | null; date_status?: 'active' | 'completed' | 'left' | null; room_id?: string | null; note?: string | null; encounter_id?: string | null;
};

/**
 * Spec 10: a compact sheet, not a new section. Every option says what it is and what it costs before sending.
 * "Keep chatting" is the first option and simply closes the sheet.
 */
export function SuggestSheet({
  name, activities, openTo, money, initial, sending, onSend, onClose,
}: {
  name: string; activities: Activity[]; openTo?: string[]; money?: number; initial?: string; sending: boolean;
  onSend: (activity: string) => void; onClose: () => void;
}) {
  const blocked = (a: Activity) => openTo !== undefined && !openTo.includes(a.id);
  const short = (a: Activity) => money !== undefined && money < a.cost;
  const firstOk = activities.find((a) => a.id === initial && !blocked(a) && !short(a))?.id;
  const [picked, setPicked] = useState<string | undefined>(firstOk);
  const choice = activities.find((a) => a.id === picked);
  return <Sheet title="Make plans" subtitle={`with ${name}`} onClose={onClose}>
    <div className="activity-list" role="radiogroup" aria-label="Activities">
      <button className="activity-option keep" onClick={onClose}>
        <span className="activity-icon"><MessageCircle size={20} strokeWidth={2.4} /></span>
        <span className="activity-text"><b>Keep chatting</b><small>No plans yet. That's fine too.</small></span>
      </button>
      {activities.map((a) => {
        const reason = blocked(a) ? `${name} isn't open to this` : short(a) ? `You need ${naira(a.cost)}` : undefined;
        return <button key={a.id} role="radio" aria-checked={picked === a.id} disabled={!!reason}
          className={`activity-option ${picked === a.id ? 'picked' : ''}`} onClick={() => setPicked(a.id)}>
          <span className="activity-icon" aria-hidden="true">{a.icon}</span>
          <span className="activity-text"><b>{a.label}</b><small>{reason ?? a.description}</small></span>
          <span className="activity-cost">{naira(a.cost)}</span>
        </button>;
      })}
    </div>
    <p className="deck-hint">You pay only if {name} accepts. They can say no, and either of you can cancel or leave at any time.</p>
    <button className="cta" disabled={!choice || sending} onClick={() => choice && onSend(choice.id)}>
      {sending ? 'Sending…' : choice ? `Send invitation · ${choice.label}` : 'Pick an activity'}
    </button>
  </Sheet>;
}

function expiresIn(iso: string) {
  const mins = Math.ceil((new Date(iso).getTime() - Date.now()) / 60000);
  return mins <= 1 ? 'expires in a minute' : `expires in ${mins} min`;
}

/** Spec 11: the invitation lives in the chat as a card. A pending invitation never blocks the conversation. */
export function InviteCard({
  inv, busy, onRespond, onJoinDate, onEnterRoom,
}: {
  inv: Invitation; busy: boolean;
  onRespond: (inv: Invitation, action: 'accept' | 'decline' | 'cancel') => void;
  onJoinDate: (inv: Invitation) => void; onEnterRoom: (inv: Invitation) => void;
}) {
  const other = inv.outgoing ? inv.target_name : inv.from_name;
  const who = inv.outgoing ? `You invited ${other}` : `${inv.from_name} invited you`;
  let detail: string;
  let actions: ProfileCardAction[] = [];
  switch (inv.status) {
    case 'pending':
      detail = inv.outgoing
        ? `Waiting for ${other}. Keep chatting meanwhile. You pay ${naira(inv.cost)} if they accept · ${expiresIn(inv.expires_at)}.`
        : `${inv.from_name} covers ${naira(inv.cost)}. You can say no; nothing starts unless you accept · ${expiresIn(inv.expires_at)}.`;
      actions = inv.outgoing
        ? [{ label: 'Cancel invitation', variant: 'ghost', disabled: busy, onClick: () => onRespond(inv, 'cancel') }]
        : [{ label: 'Accept', disabled: busy, onClick: () => onRespond(inv, 'accept') }, { label: 'Decline', variant: 'ghost', disabled: busy, onClick: () => onRespond(inv, 'decline') }];
      break;
    case 'accepted':
      if (inv.room_id) {
        detail = 'Accepted. A private room is ready for the two of you. Either of you can leave at any time.';
        actions = [{ label: 'Go to the private room', onClick: () => onEnterRoom(inv) }];
      } else if (inv.date_status === 'active') {
        detail = `Accepted. ${other} is ${inv.outgoing ? 'in' : 'heading over'}. Leave whenever you like.`;
        actions = [{ label: 'Join the date', onClick: () => onJoinDate(inv) }];
      } else {
        detail = inv.date_status === 'completed' ? 'Date done. Look at you two.' : 'The date ended early. No hard feelings.';
      }
      break;
    case 'declined':
      detail = inv.outgoing ? `${other} passed this time. The chat's still open.` : 'You declined. The chat is still open.';
      break;
    case 'expired':
      detail = 'This invitation expired. No answer needed.';
      break;
    default:
      detail = inv.outgoing ? 'You cancelled this invitation.' : `${inv.from_name} cancelled this invitation.`;
  }
  return <div className={`invite-row ${inv.outgoing ? 'out' : 'in'}`}>
    <InvitationCard title={`${inv.icon} ${inv.label}`} state={inv.status} kicker={who} detail={detail} actions={actions} />
  </div>;
}
