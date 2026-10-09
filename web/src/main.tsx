import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Login, Room, SceneNpc, SceneView } from './SceneView';
import { Creator, Identity } from './Creator';
import { Life, NpcChat, Thread, TopHud } from './Hud';
import { api, ApiError } from './api';
import { DEFAULT_LOOK, Look } from './look';
import './style.css';

type Step = 'auth' | 'create' | 'world';
type Session = { player_id: string; display_name: string; token: string; has_avatar: boolean };
type AvatarConfig = { display_name: string; gender: string; likes: string[]; look: Look; match_code: string };
type RoomJoinTicket = { ticket: string };
type NpcPresence = { x: number; z: number; look: Look; tagline: string };
type Profile = { id: string; display_name: string; kind: 'npc' | 'player'; looking_for: string; compatibility: number; social_rating: number; npc?: NpcPresence };
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
  const [step, setStep] = useState<Step>('auth');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');
  const [alias, setAlias] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [restoring, setRestoring] = useState(true);

  const [identity, setIdentity] = useState<Identity>({ alias: '', gender: 'male', likes: [], look: DEFAULT_LOOK, match_code: '' });
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
      setIdentity({ alias: state.avatar.display_name, gender: state.avatar.gender || 'male', likes: state.avatar.likes, look: { ...DEFAULT_LOOK, ...state.avatar.look }, match_code: state.avatar.match_code });
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
    guard(async () => {
      setLoading(true);
      try {
        const session = authMode === 'register'
          ? await api.post<Session>('/v1/auth/register', { email, password, display_name: alias, date_of_birth: dob, accept_terms: acceptTerms })
          : await api.post<Session>('/v1/auth/login', { email, password });
        setPassword('');
        await startSession(session);
      } finally {
        setLoading(false);
      }
    });
  };

  const signOut = () => { localStorage.removeItem('sidepiece_token'); window.location.reload(); };

  const completeIdentity = (id: Identity) => guard(async () => {
    if (!player) return;
    setLoading(true);
    try {
      await api.post('/v1/avatar', {
        player_id: player.player_id,
        avatar: { display_name: id.alias, gender: id.gender, likes: id.likes, look: id.look, match_code: id.match_code },
      });
      setIdentity(id);
      setLoading(false);
      await goTo('city');
      notify('Welcome to the city. Walk up to a glowing door to go inside.', 'good');
    } finally {
      setLoading(false);
    }
  });

  // ---------- NPC conversation ----------
  const openChat = (npcId: string) => guard(async () => {
    if (!player) return;
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
    await api.post('/v1/social/interest', { player_id: player.player_id, target_id: targetId, intent: 'flirt' });
    notify(`${targetName} noticed your interest`);
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

  const block = (targetId: string, targetName: string) => guard(async () => {
    if (!player || !window.confirm(`Block ${targetName}? They'll be hidden from you and can't see you.`)) return;
    await api.post('/v1/moderation/block', { blocker_id: player.player_id, target_id: targetId });
    setThread(undefined);
    notify(`${targetName} is blocked`);
    await discover();
  });

  const report = (targetId: string, targetName: string) => guard(async () => {
    if (!player) return;
    const reason = window.prompt(`Why are you reporting ${targetName}?`, 'inappropriate behaviour');
    if (!reason) return;
    await api.post('/v1/moderation/report', { reporter_id: player.player_id, target_id: targetId, reason, details: null });
    notify('Report sent. Thank you.');
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

  const relationships = (playerState?.relationships ?? []).filter((r) => r.stats.affinity > 0).sort((a, b) => b.stats.affinity - a.stats.affinity);
  const nameFor = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? id.replace(/^(npc|player):/, '').replace(/^\w/, (c) => c.toUpperCase());
  const venueActions = actions.filter((a) => a.venues.includes(venueKind));

  // ---------- Render ----------
  if (step === 'create') {
    return <main className="fullscreen">
      <Creator initial={identity} saving={loading} onComplete={completeIdentity} />
      {toast && <div className={`notice floating ${toast.tone}`}>{toast.text}</div>}
    </main>;
  }

  return <main>
    <aside className="control-panel">
      <header className="brand-card">
        <div className="brand-kicker">Same people. New options.</div>
        <h1>Side Piece</h1>
        <p>Better choices, bigger stories.</p>
      </header>

      {step === 'auth' && (restoring
        ? <section className="panel-card"><p className="empty">Restoring your session…</p></section>
        : <form className="panel-card profile-setup" onSubmit={submitAuth}>
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
              <span>I am 18 or older and agree to the community rules: consent first, no harassment, respect blocks.</span>
            </label>
          </>}
          <button type="submit" disabled={loading || (authMode === 'register' && !acceptTerms)}>{loading ? 'Please wait…' : authMode === 'register' ? 'Create account' : 'Sign in'}</button>
        </form>)}

      {step === 'world' && <>
        <section className="panel-card identity-mini">
          <div className="section-title"><h2>{identity.alias || player?.display_name}</h2><span><a href="#" onClick={(e) => { e.preventDefault(); setStep('create'); }}>Edit look</a> · <a href="#" onClick={(e) => { e.preventDefault(); signOut(); }}>Sign out</a></span></div>
          <div className="pill-row">
            {identity.likes.map((l) => <span key={l} className="pill">{l}</span>)}
            <span className="pill code">{identity.match_code}</span>
          </div>
          {venueKind !== 'city' && <button className="ghost back-city" disabled={loading} onClick={() => goTo('city')}>← Back to the city</button>}
        </section>

        {venueActions.length > 0 && <section className="panel-card">
          <div className="section-title"><h2>Things to do</h2><span>{room?.display_name}</span></div>
          <div className="action-list">{venueActions.map((a) => <button key={a.id} className="ghost" onClick={() => doAction(a)}>{a.label}</button>)}</div>
        </section>}

        {!inPrivate && <section className="panel-card profiles">
          <div className="section-title"><h2>Nearby</h2><span>{profiles.length} here</span></div>
          {profiles.length === 0 && <p className="empty">{venueKind === 'city' ? 'The street is quiet. Head into a venue to meet people.' : 'No one nearby yet.'}</p>}
          {profiles.map((p) => <article key={p.id} className={`profile-card featured ${p.kind}`}>
            <div className="avatar-orb">{p.display_name[0]}</div>
            <div>
              <strong>{p.display_name} <em className={`kind-badge ${p.kind}`}>{p.kind === 'npc' ? 'local' : 'player'}</em></strong>
              <span>{p.compatibility}% match · rating {p.social_rating.toFixed(1)}</span>
              <p>{p.looking_for}</p>
              <div className="card-actions">
                {p.kind === 'npc'
                  ? <button onClick={() => openChat(p.id.replace('npc:', ''))}>Chat</button>
                  : <button disabled={!!outgoing} onClick={() => requestPrivateRoom(p.id, p.display_name)}>Invite</button>}
                <button className="ghost" onClick={() => expressInterest(p.id, p.display_name)}>Interest</button>
                <button className="ghost danger-text" onClick={() => block(p.id, p.display_name)}>Block</button>
                <button className="ghost danger-text" onClick={() => report(p.id, p.display_name)}>Report</button>
              </div>
            </div>
          </article>)}
        </section>}

        {relationships.length > 0 && <section className="panel-card">
          <div className="section-title"><h2>Relationships</h2><span>{relationships.length}</span></div>
          {relationships.map((r) => <div key={r.target_id} className="relationship-row">
            <strong>{nameFor(r.target_id)} <em>{tierFor(r.stats.affinity)}</em></strong>
            <div className="meter"><label>Affinity</label><div><i style={{ width: `${r.stats.affinity}%` }} /></div></div>
          </div>)}
        </section>}
      </>}
    </aside>

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
      {step === 'world' && <TopHud life={life} />}
      {thread && <NpcChat
        thread={thread}
        typing={typingNpc === thread.npc_id}
        onSend={sendChat}
        onClose={() => setThread(undefined)}
        onInterest={() => expressInterest(`npc:${thread.npc_id}`, thread.npc_name)}
        onPrivate={() => requestPrivateRoom(`npc:${thread.npc_id}`, thread.npc_name)}
      />}
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
        {toast && <div className={`notice ${toast.tone}`}>{toast.text}</div>}
      </div>
    </SceneView>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
