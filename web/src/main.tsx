import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Login, Room, SceneNpc, SceneView } from './SceneView';
import { Creator, Identity } from './Creator';
import { Life, NpcChat, Thread } from './Hud';
import { BottomNav, ConfirmDialog, DialogSpec, EmptyState, ProfileCard, Sheet, Tab, TierMeter, ToastView, TopBar, naira } from './ui';
import { api, ApiError } from './api';
import { DEFAULT_LOOK, Look } from './look';
import { DEFAULT_PREFERENCES, INTENTS, INVITATION_TYPES, labelOf, Preferences, RELATIONSHIP_STYLES, SHOW_ME } from './prefs';
import { LegalDoc, LegalSheet, Welcome } from './Welcome';
import { Discover, Match, MatchMoment } from './Discover';
import { Conversation, DmChat, DmThread, Inbox, MessagesPanel } from './Messages';
import './style.css';

type Step = 'welcome' | 'auth' | 'create' | 'world';
type Session = { player_id: string; display_name: string; token: string; has_avatar: boolean };
type AvatarConfig = { display_name: string; gender: string; likes: string[]; look: Look; match_code: string; bio?: string; intent?: string; preferences?: Partial<Preferences> };
type RoomJoinTicket = { ticket: string };
type NpcPresence = { x: number; z: number; look: Look; tagline: string };
type Profile = { id: string; display_name: string; kind: 'npc' | 'player'; looking_for: string; compatibility: number; social_rating: number; npc?: NpcPresence; bio?: string; interests?: string[]; relationship_style?: string | null; open_to?: string[] };
type PrivateRoomResult = { consent_state: string; room: Room };
type IncomingRequest = { room_id: string; from_player_id: string; from_display_name: string };
type Stats = { attraction: number; trust: number; reputation: number; affinity: number };
type PlayerState = { avatar?: AvatarConfig | null; relationships: { target_id: string; stats: Stats }[] };
type Outgoing = { room: Room; targetId: string; targetName: string };
type ActionInfo = { id: string; label: string; venues: string[] };
type ChatReply = { reply: string; score_delta: number; relationship: Thread['relationship']; life: Life; tier_changed: boolean };

const TIER_LABELS = ['Stranger', 'Acquaintance', 'Friendly', 'Friend', 'Close Friend', 'Best Friend', 'Partner'];
const TIER_MIN = [0, 10, 25, 40, 60, 78, 92];
const tierFor = (a: number) => { let i = 0; TIER_MIN.forEach((m, idx) => { if (a >= m) i = idx; }); return TIER_LABELS[i]; };

function usePolling(fn: () => void, ms: number, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    fn();
    const id = window.setInterval(fn, ms);
    return () => window.clearInterval(id);
  }, [fn, ms, enabled]);
}

function App() {
  const [step, setStep] = useState<Step>('welcome');
  const [legal, setLegal] = useState<LegalDoc>();
  const [authError, setAuthError] = useState<string>();
  const [creatorAt, setCreatorAt] = useState<{ step: number; mode: 'onboarding' | 'edit' }>({ step: 1, mode: 'onboarding' });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');
  const [alias, setAlias] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [restoring, setRestoring] = useState(true);

  const [identity, setIdentity] = useState<Identity>({ alias: '', gender: 'male', likes: [], look: DEFAULT_LOOK, match_code: '', bio: '', intent: 'socialize', preferences: DEFAULT_PREFERENCES });
  const [player, setPlayer] = useState<Login>();
  const [room, setRoom] = useState<Room>();
  const [joinTicket, setJoinTicket] = useState<string>();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState>();
  const [life, setLife] = useState<Life>();
  const [actions, setActions] = useState<ActionInfo[]>([]);

  const [thread, setThread] = useState<Thread>();
  const [typingNpc, setTypingNpc] = useState<string>();
  const [outgoing, setOutgoing] = useState<Outgoing>();
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'error' | 'good' }>();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('world');
  const [sheet, setSheet] = useState<'nearby' | 'actions' | null>(null);
  const [dialog, setDialog] = useState<DialogSpec>();
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchShown, setMatchShown] = useState<Match>();
  const [inbox, setInbox] = useState<Inbox>();
  const [inboxError, setInboxError] = useState<string>();
  const [dmThread, setDmThread] = useState<DmThread>();
  const [dmSending, setDmSending] = useState(false);

  const notify = (text: string, tone: 'info' | 'error' | 'good' = 'info') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast((t) => (t?.text === text ? undefined : t)), 4200);
  };
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Something went wrong', 'error');
    }
  };

  const venueKind = room?.kind ?? 'city';
  const inPrivate = venueKind === 'private_room';
  const sceneNpcs: SceneNpc[] = useMemo(
    () => profiles.filter((p) => p.kind === 'npc' && p.npc).map((p) => ({ id: p.id.replace('npc:', ''), name: p.display_name, x: p.npc!.x, z: p.npc!.z, look: p.npc!.look })),
    [profiles],
  );

  // ---------- Data ----------
  const discover = useCallback(async (playerId = player?.player_id, roomId = room?.id) => {
    if (!playerId || !roomId || roomId.startsWith('private-')) { setProfiles([]); return; }
    setProfiles((await api.get<{ profiles: Profile[] }>('/v1/discovery', { player_id: playerId, room_id: roomId })).profiles);
  }, [player?.player_id, room?.id]);

  const refreshPlayerState = useCallback(async () => {
    if (player) setPlayerState(await api.get<PlayerState>(`/v1/player/${player.player_id}/state`));
  }, [player]);

  const refreshLife = useCallback(async () => {
    if (player) setLife(await api.get<Life>(`/v1/player/${player.player_id}/life`));
  }, [player]);

  async function joinRoom(target: Room) {
    if (!player) return;
    const ticket = await api.post<RoomJoinTicket>('/v1/rooms/join-ticket', { player_id: player.player_id, room_id: target.id });
    setThread(undefined);
    setDmThread(undefined);
    setRoom(target);
    setJoinTicket(ticket.ticket);
  }

  const goTo = (kind: string) => guard(async () => {
    if (!player || loading) return;
    setLoading(true);
    try {
      const joined = await api.post<Room>('/v1/matchmaking/join', { player_id: player.player_id, preferred_room: kind });
      await joinRoom(joined);
      setStep('world');
      await discover(player.player_id, joined.id);
    } finally {
      setLoading(false);
    }
  });

  // ---------- Account ----------
  async function startSession(session: Session) {
    localStorage.setItem('sidepiece_token', session.token);
    const login = { player_id: session.player_id, display_name: session.display_name, token: session.token };
    setPlayer(login);
    const state = await api.get<PlayerState>(`/v1/player/${session.player_id}/state`);
    setPlayerState(state);
    if (state.avatar?.likes?.length) {
      setIdentity({ alias: state.avatar.display_name, gender: state.avatar.gender || 'male', likes: state.avatar.likes, look: { ...DEFAULT_LOOK, ...state.avatar.look }, match_code: state.avatar.match_code, bio: state.avatar.bio ?? '', intent: state.avatar.intent ?? 'socialize', preferences: { ...DEFAULT_PREFERENCES, ...state.avatar.preferences } });
      // Returning players go straight back to the city.
      const joined = await api.post<Room>('/v1/matchmaking/join', { player_id: session.player_id, preferred_room: 'city' });
      const ticket = await api.post<RoomJoinTicket>('/v1/rooms/join-ticket', { player_id: session.player_id, room_id: joined.id });
      setRoom(joined);
      setJoinTicket(ticket.ticket);
      setStep('world');
    } else {
      setIdentity((i) => ({ ...i, alias: session.display_name }));
      setStep('create');
    }
  }

  useEffect(() => {
    api.get<ActionInfo[]>('/v1/life/actions').then(setActions).catch(() => {});
    const token = localStorage.getItem('sidepiece_token');
    if (!token) { setRestoring(false); return; }
    (async () => {
      try {
        const v = await api.get<{ player_id: string; display_name: string }>('/v1/auth/verify');
        await startSession({ ...v, token, has_avatar: true });
      } catch {
        localStorage.removeItem('sidepiece_token');
      } finally {
        setRestoring(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitAuth = (e: React.FormEvent) => {
    e.preventDefault();
    (async () => {
      setLoading(true);
      setAuthError(undefined);
      try {
        const session = authMode === 'register'
          ? await api.post<Session>('/v1/auth/register', { email, password, display_name: alias, date_of_birth: dob, accept_terms: acceptTerms })
          : await api.post<Session>('/v1/auth/login', { email, password });
        setPassword('');
        await startSession(session);
      } catch (err) {
        // Inline error (spec 02); everything typed stays in the form.
        setAuthError(err instanceof ApiError ? err.message : "Couldn't reach Side Piece. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    })();
  };

  const openCreator = (at: number, mode: 'onboarding' | 'edit') => { setCreatorAt({ step: at, mode }); setStep('create'); };
  const backToWorld = () => goTo(room && room.kind !== 'private_room' ? room.kind : 'city');

  const signOut = () => { localStorage.removeItem('sidepiece_token'); window.location.reload(); };

  const completeIdentity = (id: Identity) => guard(async () => {
    if (!player) return;
    setLoading(true);
    try {
      await api.post('/v1/avatar', {
        player_id: player.player_id,
        avatar: { display_name: id.alias, gender: id.gender, likes: id.likes, look: id.look, match_code: id.match_code, bio: id.bio, intent: id.intent, preferences: id.preferences },
      });
      setIdentity(id);
      setLoading(false);
      if (creatorAt.mode === 'edit') {
        await backToWorld();
        notify('Profile saved', 'good');
      } else {
        await goTo('city');
        notify('Welcome to Lekki Phase 1. Walk up to a glowing door to go inside.', 'good');
      }
    } finally {
      setLoading(false);
    }
  });

  // ---------- NPC conversation ----------
  const openChat = (npcId: string) => guard(async () => {
    if (!player) return;
    setDmThread(undefined);
    setThread(await api.get<Thread>(`/v1/npc/${npcId}/chat`, { player_id: player.player_id }));
  });

  const sendChat = (text: string) => guard(async () => {
    if (!player || !thread) return;
    const npcId = thread.npc_id;
    setThread((t) => t && { ...t, messages: [...t.messages, { role: 'player', content: text, score_delta: 0 }] });
    setTypingNpc(npcId);
    try {
      const reply = await api.post<ChatReply>(`/v1/npc/${npcId}/chat`, { player_id: player.player_id, message: text });
      setThread((t) => {
        if (!t || t.npc_id !== npcId) return t;
        const msgs = [...t.messages];
        msgs[msgs.length - 1] = { role: 'player', content: text, score_delta: reply.score_delta };
        return { ...t, messages: [...msgs, { role: 'npc', content: reply.reply, score_delta: 0 }], relationship: reply.relationship };
      });
      setLife(reply.life);
      if (reply.tier_changed) notify(`${thread.npc_name} now sees you as: ${reply.relationship.tier_label}`, reply.score_delta >= 0 ? 'good' : 'error');
      refreshPlayerState().catch(() => {});
    } finally {
      setTypingNpc(undefined);
    }
  });

  // ---------- Social ----------
  const expressInterest = (targetId: string, targetName: string) => guard(async () => {
    if (!player) return;
    const r = await api.post<{ matched: boolean; match_info?: Match }>('/v1/social/interest', { player_id: player.player_id, target_id: targetId, intent: 'flirt' });
    if (r.matched && r.match_info) setMatchShown(r.match_info);
    else notify(`${targetName} noticed your interest`);
  });

  // ---------- Matches (spec 08) ----------
  const refreshMatches = useCallback(async () => {
    if (!player) return;
    const list = await api.get<Match[]>('/v1/social/matches', { player_id: player.player_id });
    setMatches(list);
    // Someone liked you back while you were away: show their match moment once.
    setMatchShown((cur) => cur ?? list.find((m) => m.is_new));
  }, [player]);

  const closeMatch = (then?: (m: Match) => void) => {
    const m = matchShown;
    setMatchShown(undefined);
    if (!m || !player) return;
    if (m.is_new) api.post('/v1/social/matches/seen', { player_id: player.player_id, target_id: m.target_id }).then(() => refreshMatches()).catch(() => {});
    else refreshMatches().catch(() => {});
    then?.(m);
  };

  const startChatWith = (m: Match) => {
    setDiscoverOpen(false);
    if (m.kind === 'npc') { setTab('world'); openChat(m.target_id.replace('npc:', '')); }
    else { setTab('messages'); openDm(m.target_id); }
  };

  // ---------- Direct messages (spec 09/17) ----------
  const refreshInbox = useCallback(async () => {
    if (!player) return;
    try {
      setInbox(await api.get<Inbox>('/v1/messages/inbox', { player_id: player.player_id }));
      setInboxError(undefined);
    } catch (err) {
      setInboxError(err instanceof ApiError ? err.message : 'Could not load messages');
    }
  }, [player]);

  const openDm = (targetId: string) => guard(async () => {
    if (!player) return;
    const t = await api.get<DmThread>('/v1/messages/thread', { player_id: player.player_id, target_id: targetId });
    setDmThread(t);
    setTab('messages');
    api.post('/v1/messages/read', { player_id: player.player_id, target_id: targetId }).then(() => refreshInbox()).catch(() => {});
  });

  const sendDm = (text: string) => guard(async () => {
    if (!player || !dmThread) return;
    const targetId = dmThread.target_id;
    setDmSending(true);
    try {
      const msg = await api.post<DmThread['messages'][number]>('/v1/messages/send', { player_id: player.player_id, target_id: targetId, message: text });
      setDmThread((t) => t && t.target_id === targetId ? { ...t, ended: false, messages: [...t.messages, msg] } : t);
      refreshInbox().catch(() => {});
    } finally {
      setDmSending(false);
    }
  });

  const conversationControl = (targetId: string, action: 'mute' | 'unmute' | 'end') => guard(async () => {
    if (!player) return;
    await api.post('/v1/messages/control', { player_id: player.player_id, target_id: targetId, action });
    if (action === 'end') { setDmThread(undefined); notify('Conversation ended. New messages can reopen it.'); }
    else notify(action === 'mute' ? 'Muted for now' : 'Unmuted');
    await refreshInbox();
  });

  const requestPrivateRoom = (targetId: string, targetName: string) => guard(async () => {
    if (!player) return;
    const result = await api.post<PrivateRoomResult>('/v1/social/private-room', { player_id: player.player_id, target_id: targetId });
    setOutgoing({ room: result.room, targetId, targetName });
    setThread(undefined);
  });

  const resolveNpcConsent = () => guard(async () => {
    if (!player || !outgoing) return;
    const result = await api.post<PrivateRoomResult>(`/v1/social/private-room/${outgoing.room.id}/consent`, { player_id: player.player_id, action: 'accept' });
    setOutgoing(undefined);
    await joinRoom(result.room);
    notify(`You and ${outgoing.targetName} stepped somewhere private`, 'good');
  });

  const cancelOutgoing = () => guard(async () => {
    if (!player || !outgoing) return;
    await api.post(`/v1/social/private-room/${outgoing.room.id}/consent`, { player_id: player.player_id, action: 'cancel' });
    setOutgoing(undefined);
  });

  const respondIncoming = (req: IncomingRequest, action: 'accept' | 'decline') => guard(async () => {
    if (!player) return;
    const result = await api.post<PrivateRoomResult>(`/v1/social/private-room/${req.room_id}/consent`, { player_id: player.player_id, action });
    setIncoming((l) => l.filter((r) => r.room_id !== req.room_id));
    if (action === 'accept') { await joinRoom(result.room); notify(`You joined ${req.from_display_name} somewhere private`, 'good'); }
  });

  const block = (targetId: string, targetName: string) => setDialog({
    title: `Block ${targetName}?`,
    body: `They'll be hidden from you and can't see you. You can unblock them later in Settings.`,
    confirmLabel: 'Block', tone: 'danger',
    onConfirm: () => { setDialog(undefined); guard(async () => {
      if (!player) return;
      await api.post('/v1/moderation/block', { blocker_id: player.player_id, target_id: targetId });
      setThread(undefined);
      setDmThread(undefined);
      refreshInbox().catch(() => {});
      notify(`${targetName} is blocked`);
      await discover();
    }); },
  });

  const report = (targetId: string, targetName: string) => setDialog({
    title: `Report ${targetName}`,
    body: 'Tell us what happened. Reporting is always available.',
    confirmLabel: 'Send report', tone: 'danger',
    input: { placeholder: 'What happened?', initial: 'inappropriate behaviour' },
    onConfirm: (reason) => { setDialog(undefined); if (!reason) return; guard(async () => {
      if (!player) return;
      await api.post('/v1/moderation/report', { reporter_id: player.player_id, target_id: targetId, reason, details: null });
      notify('Report sent. Thank you.');
    }); },
  });

  const doAction = (action: ActionInfo) => guard(async () => {
    if (!player) return;
    const r = await api.post<{ message: string; life: Life }>(`/v1/player/${player.player_id}/life/action`, { action: action.id, venue: venueKind });
    setLife(r.life);
    notify(r.message, 'good');
  });

  // ---------- Polling ----------
  const inWorld = step === 'world' && !!player;
  usePolling(useCallback(() => { discover().catch(() => {}); }, [discover]), 6000, inWorld && !inPrivate);
  usePolling(useCallback(() => { refreshLife().catch(() => {}); }, [refreshLife]), 10000, inWorld);
  usePolling(useCallback(() => {
    if (!player) return;
    api.get<{ requests: IncomingRequest[] }>('/v1/social/private-room/incoming', { player_id: player.player_id }).then((r) => setIncoming(r.requests)).catch(() => {});
  }, [player]), 4000, inWorld);
  usePolling(useCallback(() => {
    if (!player || !outgoing || outgoing.targetId.startsWith('npc:')) return;
    api.get<PrivateRoomResult>(`/v1/social/private-room/${outgoing.room.id}`, { player_id: player.player_id }).then(async (r) => {
      if (r.consent_state === 'accepted') { setOutgoing(undefined); await joinRoom(r.room); notify(`${outgoing.targetName} accepted`, 'good'); }
      else if (r.consent_state !== 'requested') { setOutgoing(undefined); notify(`${outgoing.targetName} declined`, 'error'); }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, outgoing]), 3000, inWorld && !!outgoing);
  useEffect(() => { if (inWorld) refreshPlayerState().catch(() => {}); }, [inWorld, refreshPlayerState]);
  usePolling(useCallback(() => { refreshMatches().catch(() => {}); }, [refreshMatches]), 5000, inWorld);
  usePolling(useCallback(() => { refreshInbox().catch(() => {}); }, [refreshInbox]), 5000, inWorld);
  usePolling(useCallback(() => {
    if (!player || !dmThread) return;
    api.get<DmThread>('/v1/messages/thread', { player_id: player.player_id, target_id: dmThread.target_id }).then((t) => {
      setDmThread(t);
      api.post('/v1/messages/read', { player_id: player.player_id, target_id: t.target_id }).then(() => refreshInbox()).catch(() => {});
    }).catch(() => {});
  }, [player, dmThread, refreshInbox]), 3000, inWorld && !!dmThread);

  const relationships = (playerState?.relationships ?? []).filter((r) => r.stats.affinity > 0).sort((a, b) => b.stats.affinity - a.stats.affinity);
  const nameFor = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? id.replace(/^(npc|player):/, '').replace(/^\w/, (c) => c.toUpperCase());
  const venueActions = actions.filter((a) => a.venues.includes(venueKind));

  // ---------- Render ----------
  const name = identity.alias || player?.display_name || 'You';
  const fullScreen = inPrivate; // hide shell chrome in immersive scenes
  const incomingCount = incoming.length;
  const messageBadge = incomingCount + matches.filter((m) => m.is_new).length + (inbox?.unread_count ?? 0);

  if (step === 'create') {
    return <main className="fullscreen">
      <Creator initial={identity} saving={loading} onComplete={completeIdentity} initialStep={creatorAt.step} mode={creatorAt.mode} onCancel={backToWorld} />
      {toast && <div className={`notice floating ${toast.tone}`}>{toast.text}</div>}
    </main>;
  }

  if (step === 'welcome') {
    return <main className="auth-screen welcome-screen">
      {restoring
        ? <div className="auth-brand"><h1 className="brand-logo">Side<span>piece</span></h1><p className="empty">Restoring your session…</p></div>
        : <Welcome onCreate={() => { setAuthMode('register'); setStep('auth'); }} onSignIn={() => { setAuthMode('login'); setStep('auth'); }} onLegal={setLegal} />}
      {legal && <LegalSheet doc={legal} onClose={() => setLegal(undefined)} />}
    </main>;
  }

  if (step === 'auth') {
    return <main className="auth-screen">
      <button className="auth-back ghost" onClick={() => { setAuthError(undefined); setStep('welcome'); }}>← Back</button>
      <div className="auth-brand">
        <div className="brand-kicker">Same people. New options.</div>
        <h1 className="brand-logo">Side<span>piece</span></h1>
        <p>Better choices, bigger stories.</p>
      </div>
      {restoring
        ? <div className="auth-card"><p className="empty">Restoring your session…</p></div>
        : <form className="auth-card" onSubmit={submitAuth}>
          <div className="auth-tabs">
            <button type="button" className={authMode === 'register' ? 'selected' : 'ghost'} onClick={() => setAuthMode('register')}>Create account</button>
            <button type="button" className={authMode === 'login' ? 'selected' : 'ghost'} onClick={() => setAuthMode('login')}>Sign in</button>
          </div>
          <label>Email</label>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Password</label>
          <input type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={authMode === 'register' ? 10 : undefined} required />
          {authMode === 'register' && <>
            <label>Alias</label>
            <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g., Jay123" minLength={2} maxLength={24} required />
            <label>Date of birth</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
            <label className="checkbox">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
              <span>I am 18 or older and agree to the <a href="#terms" onClick={(e) => { e.preventDefault(); setLegal('terms'); }}>Terms</a>, <a href="#privacy" onClick={(e) => { e.preventDefault(); setLegal('privacy'); }}>Privacy</a> and <a href="#rules" onClick={(e) => { e.preventDefault(); setLegal('rules'); }}>Community rules</a>: consent first, no harassment, respect blocks.</span>
            </label>
          </>}
          {authError && <p className="field-error" role="alert">{authError}</p>}
          <button type="submit" disabled={loading || (authMode === 'register' && !acceptTerms)}>{loading ? 'Please wait…' : authMode === 'register' ? 'Create account' : 'Sign in'}</button>
        </form>}
      {toast && <ToastView toast={toast} />}
      {legal && <LegalSheet doc={legal} onClose={() => setLegal(undefined)} />}
    </main>;
  }

  // ---------- World shell ----------
  const nearbyActions = (p: Profile): React.ComponentProps<typeof ProfileCard>['actions'] => [
    p.kind === 'npc'
      ? { label: 'Chat', onClick: () => { openChat(p.id.replace('npc:', '')); setSheet(null); } }
      : (p.open_to ?? []).includes('private_location')
        ? { label: 'Invite', disabled: !!outgoing, onClick: () => { requestPrivateRoom(p.id, p.display_name); setSheet(null); } }
        : { label: 'No invites', disabled: true, onClick: () => {} },
    { label: 'Interest', variant: 'ghost', onClick: () => expressInterest(p.id, p.display_name) },
    { label: 'Block', variant: 'danger', onClick: () => block(p.id, p.display_name) },
    { label: 'Report', variant: 'danger', onClick: () => report(p.id, p.display_name) },
  ];

  return <main className="shell">
    <SceneView
      room={room}
      player={player}
      joinTicket={joinTicket}
      look={identity.look}
      npcs={inPrivate ? [] : sceneNpcs}
      typingNpcId={typingNpc}
      onInteractNpc={openChat}
      onPortal={goTo}
    >
      {tab === 'world' && thread && <NpcChat
        thread={thread}
        typing={typingNpc === thread.npc_id}
        onSend={sendChat}
        onClose={() => setThread(undefined)}
        onInterest={() => expressInterest(`npc:${thread.npc_id}`, thread.npc_name)}
        onPrivate={() => requestPrivateRoom(`npc:${thread.npc_id}`, thread.npc_name)}
      />}
    </SceneView>

    {!fullScreen && <TopBar name={name} life={life} onProfile={() => setTab('profile')} />}

    {tab === 'world' && !fullScreen && !thread && !discoverOpen && <div className="world-dock">
      {venueKind !== 'city' && <button className="dock-btn" aria-label="Back to Lekki" disabled={loading} onClick={() => goTo('city')}>←<span className="dock-label"> Lekki</span></button>}
      {venueActions.length > 0 && <button className="dock-btn" aria-label="Things to do" onClick={() => setSheet('actions')}>✨<span className="dock-label"> Do</span></button>}
      {!inPrivate && <button className="dock-btn" aria-label="Nearby" onClick={() => setSheet('nearby')}>👥<span className="dock-label"> Nearby</span>{profiles.length ? ` ${profiles.length}` : ''}</button>}
      <button className="dock-btn primary" onClick={() => setDiscoverOpen(true)}>💘 Discover</button>
    </div>}

    {tab === 'messages' && (dmThread
      ? <DmChat
        thread={dmThread}
        sending={dmSending}
        onBack={() => { setDmThread(undefined); refreshInbox().catch(() => {}); }}
        onSend={sendDm}
        onProfile={() => notify(`${dmThread.display_name} · ${dmThread.online ? dmThread.location : 'Offline'}`)}
        onSuggest={() => notify('Activity suggestions land in the next milestone. Chatting never starts an activity by itself.')}
        onMore={() => setDialog({
          title: `${dmThread.display_name}`,
          body: 'Conversation controls are private. Muting only affects notifications. Ending hides this thread until a new message arrives. Blocking hides both ways.',
          confirmLabel: dmThread.muted ? 'Unmute' : 'Mute',
          onConfirm: () => { setDialog(undefined); conversationControl(dmThread.target_id, dmThread.muted ? 'unmute' : 'mute'); },
          extraActions: [
            { label: 'End conversation', tone: 'danger', onClick: () => { setDialog(undefined); conversationControl(dmThread.target_id, 'end'); } },
            { label: 'Block', tone: 'danger', onClick: () => { setDialog(undefined); block(dmThread.target_id, dmThread.display_name); } },
            { label: 'Report', tone: 'danger', onClick: () => { setDialog(undefined); report(dmThread.target_id, dmThread.display_name); } },
          ],
        })}
      />
      : <MessagesPanel
        inbox={inbox}
        loading={!inbox && !inboxError}
        error={inboxError}
        onRetry={() => refreshInbox()}
        onRefresh={() => refreshInbox()}
        onDiscover={() => setDiscoverOpen(true)}
        onOpen={(c) => openDm(c.target_id)}
        onOpenNpc={(id) => { setTab('world'); openChat(id); }}
      />)}

    {tab === 'feed' && <div className="tab-panel">
      <header className="tab-panel-head"><h2>Feed</h2></header>
      <EmptyState icon="✨" title="Your story starts here" body="Matches, invitations and achievements will show up in your feed as you play." actionLabel="Explore Lagos" onAction={() => setTab('world')} />
    </div>}

    {tab === 'profile' && <div className="tab-panel">
      <header className="tab-panel-head"><h2>Profile</h2></header>
      <section className="profile-hero">
        <div className="avatar-orb you" style={{ width: 72, height: 72, fontSize: 30 }}>{name[0]?.toUpperCase()}</div>
        <div>
          <strong>{name}</strong>
          {life && <span>Lv {life.level} · {naira(life.money)}</span>}
        </div>
      </section>
      {identity.bio ? <p className="profile-bio">{identity.bio}</p> : <button className="link-btn" onClick={() => openCreator(5, 'edit')}>+ Add a bio</button>}
      <div className="pill-row">
        {identity.likes.map((l) => <span key={l} className="pill">{l}</span>)}
        {identity.match_code && <span className="pill code">{identity.match_code}</span>}
      </div>
      <dl className="pref-list">
        <dt>Here to</dt><dd>{labelOf(INTENTS, identity.intent)} <em>private</em></dd>
        <dt>Style</dt><dd>{identity.preferences.relationship_style ? labelOf(RELATIONSHIP_STYLES, identity.preferences.relationship_style) : 'Not set'} <em>{identity.preferences.public_relationship_style ? 'public' : 'private'}</em></dd>
        <dt>Interests</dt><dd>{identity.preferences.interests.join(', ') || 'None yet'} <em>{identity.preferences.public_interests ? 'public' : 'private'}</em></dd>
        <dt>Boundaries</dt><dd>{identity.preferences.boundaries.map((b) => labelOf(INVITATION_TYPES, b)).join(', ') || 'None'} <em>private</em></dd>
        <dt>Show me</dt><dd>{identity.preferences.show_me.map((g) => labelOf(SHOW_ME, g)).join(', ') || 'Everyone'}</dd>
        <dt>Nearby</dt><dd>{identity.preferences.discoverable ? 'Discoverable' : 'Hidden'}</dd>
      </dl>
      <div className="profile-buttons three">
        <button className="ghost" onClick={() => openCreator(1, 'edit')}>Edit character</button>
        <button className="ghost" onClick={() => openCreator(4, 'edit')}>Edit preferences</button>
        <button className="ghost" onClick={() => openCreator(5, 'edit')}>Preview profile</button>
      </div>
      <button className="ghost signout" onClick={signOut}>Sign out</button>
      <h3 className="subhead">Relationships</h3>
      {relationships.length === 0
        ? <EmptyState icon="🤝" title="No relationships yet" body="Chat with locals and players to build connections." actionLabel="Meet someone" onAction={() => setTab('world')} />
        : relationships.map((r) => <div key={r.target_id} className="relationship-row">
          <strong>{nameFor(r.target_id)} <em>{tierFor(r.stats.affinity)}</em></strong>
          <TierMeter value={r.stats.affinity} />
        </div>)}
    </div>}

    {sheet === 'nearby' && <Sheet title="Nearby" subtitle={`${profiles.length} in ${room?.display_name ?? 'Lagos'}`} onClose={() => setSheet(null)}>
      {profiles.length === 0
        ? <EmptyState icon="🌃" title={venueKind === 'city' ? 'The street is quiet' : 'No one nearby yet'} body={venueKind === 'city' ? 'Head into a venue to meet people.' : 'Give it a moment, or try another venue.'} />
        : profiles.map((p) => <ProfileCard key={p.id} data={p} actions={nearbyActions(p)} />)}
    </Sheet>}

    {sheet === 'actions' && <Sheet title="Things to do" subtitle={room?.display_name} onClose={() => setSheet(null)}>
      <div className="action-list">{venueActions.map((a) => <button key={a.id} className="ghost" onClick={() => { doAction(a); }}>{a.label}</button>)}</div>
    </Sheet>}

    {discoverOpen && player && <Discover
      playerId={player.player_id}
      myInterests={identity.preferences.interests}
      onClose={() => setDiscoverOpen(false)}
      onMatch={setMatchShown}
      notify={notify}
      onBroaden={() => { setDiscoverOpen(false); openCreator(4, 'edit'); }}
      onChangeLocation={() => { setDiscoverOpen(false); setTab('world'); goTo(venueKind === 'rooftop_party' ? 'neon_lounge' : 'rooftop_party'); }}
      onMeetNpc={() => { setDiscoverOpen(false); setTab('world'); goTo('neon_lounge').then(() => setSheet('nearby')); }}
    />}

    {matchShown && <MatchMoment
      match={matchShown}
      myLook={identity.look}
      onStartChat={() => closeMatch(startChatWith)}
      onKeepExploring={() => closeMatch()}
    />}

    {dialog && <ConfirmDialog spec={dialog} onCancel={() => setDialog(undefined)} />}

    {!fullScreen && <BottomNav tab={tab} onTab={(t) => { setTab(t); setSheet(null); setDiscoverOpen(false); if (t !== 'messages') setDmThread(undefined); }} badges={{ messages: messageBadge || undefined }} />}
    {fullScreen && <button className="exit-scene" disabled={loading} onClick={() => goTo('city')}>← Leave</button>}

    <div className="toast-stack">
      {outgoing && <div className="consent-toast">
        <strong>Private room requested with {outgoing.targetName}</strong>
        {outgoing.targetId.startsWith('npc:')
          ? <><span>Both sides must agree before anyone enters.</span>
            <div><button onClick={resolveNpcConsent}>{outgoing.targetName} agrees — enter</button><button className="ghost" onClick={cancelOutgoing}>Cancel</button></div></>
          : <><span className="waiting">Waiting for {outgoing.targetName} to accept…</span>
            <div><button className="ghost" onClick={cancelOutgoing}>Cancel request</button></div></>}
      </div>}
      {incoming.map((req) => <div key={req.room_id} className="consent-toast incoming">
        <strong>{req.from_display_name} invited you somewhere private</strong>
        <span>You can say no. Nothing happens without your consent.</span>
        <div><button onClick={() => respondIncoming(req, 'accept')}>Accept</button><button className="ghost" onClick={() => respondIncoming(req, 'decline')}>Decline</button></div>
      </div>)}
      {toast && <ToastView toast={toast} />}
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
