import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Login, Room, SceneNpc, SceneView, Speed, SPEEDS } from './SceneView';
import { Creator, Identity, Preview } from './Creator';
import { Life, NpcChat, Thread } from './Hud';
import { BottomNav, BrandLogo, ConfirmDialog, DialogSpec, EmptyState, Field, ProfileCard, Sheet, Tab, TierMeter, ToastView, TopBar, naira } from './ui';
import { ArrowLeft, ArrowRight, AtSign, CarTaxiFront, Cake, Eye, EyeOff, Footprints, Heart, LockKeyhole, LogOut, Mail, MapPin, Settings as SettingsIcon, Shirt, SlidersHorizontal, Sparkles, Users, Wind, Zap } from 'lucide-react';
import { api, ApiError } from './api';
import { DEFAULT_LOOK, Look } from './look';
import { DEFAULT_PREFERENCES, INTENTS, INVITATION_TYPES, labelOf, Preferences, RELATIONSHIP_STYLES, SHOW_ME } from './prefs';
import { Backdrop, LegalDoc, LegalPopup, Welcome } from './Welcome';
import { Discover, Match, MatchMoment } from './Discover';
import { DmChat, DmProfileSheet, DmThread, Inbox, MessagesPanel } from './Messages';
import { Activity, Invitation, SuggestSheet } from './Invites';
import { DateScene, DateView } from './DateScene';
import { EncounterScene, EncounterView } from './Encounter';
import { ActivityOutcome } from './Outcome';
import { PlayerStats, PublicStats, StatVisibility, StatsHero, StatsSheet } from './Stats';
import { Feed, FeedPanel } from './Feed';
import { BlockedEntry, DEFAULT_ALERTS, NotificationPrefs, Settings, SettingsSheet } from './Settings';
import { prefetchCharacters } from './avatar3d';
import { CLUBS } from './venues';


// Start the big 3D downloads while the player signs in, so the world and its people appear without a pop-in.
prefetchCharacters();
['/world/kit.glb', '/world/lagos.glb', '/world/venues.glb'].forEach((u) => fetch(u).catch(() => {}));
// Self-hosted, OFL-licensed fonts (design-system.md → Typography). Bundled by Vite; no font CDN at runtime.
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/caveat';
import './style.css';

type Step = 'welcome' | 'auth' | 'create' | 'world';
type Session = { player_id: string; display_name: string; token: string; has_avatar: boolean };
type AvatarConfig = { display_name: string; gender: string; likes: string[]; look: Look; match_code: string; bio?: string; intent?: string; preferences?: Partial<Preferences> };
type RoomJoinTicket = { ticket: string };
type NpcPresence = { x: number; z: number; look: Look; tagline: string };
type Profile = { id: string; display_name: string; kind: 'npc' | 'player'; looking_for: string; compatibility: number; social_rating: number; npc?: NpcPresence; bio?: string; interests?: string[]; relationship_style?: string | null; open_to?: string[]; stats?: PublicStats };
type PrivateRoomResult = { consent_state: string; room: Room; encounter_id?: string | null };
type IncomingRequest = { room_id: string; from_player_id: string; from_display_name: string };
type Stats = { attraction: number; trust: number; reputation: number; affinity: number };
type PlayerState = { avatar?: AvatarConfig | null; relationships: { target_id: string; stats: Stats }[] };
type Outgoing = { room: Room; targetId: string; targetName: string };
type ActionInfo = { id: string; label: string; venues: string[] };
type ChatReply = { reply: string; score_delta: number; relationship: Thread['relationship']; life: Life; tier_changed: boolean };

const TIER_LABELS = ['Stranger', 'Acquaintance', 'Friendly', 'Friend', 'Close Friend', 'Best Friend', 'Partner'];
const TIER_MIN = [0, 10, 25, 40, 60, 78, 92];
/** Whole years from an ISO date of birth to today, or undefined if the date isn't usable. */
const ageFrom = (dob: string) => {
  const d = new Date(dob);
  if (!dob || Number.isNaN(d.getTime())) return undefined;
  const now = new Date();
  const age = now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
  return age >= 0 && age < 120 ? age : undefined;
};
/** 0-3 for the password meter. The server only enforces 10+ characters; this is encouragement, not a rule. */
const passwordScore = (p: string) => p.length < 10 ? 0 : 1 + Number(/[a-z]/.test(p) && /[A-Z0-9]/.test(p)) + Number(p.length >= 14 || /[^A-Za-z0-9]/.test(p));
const PASSWORD_WORDS = ['10+ characters', 'Okay', 'Strong', 'Unbreakable'];

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
  const [showPassword, setShowPassword] = useState(false);
  const [restoring, setRestoring] = useState(true);

  const [identity, setIdentity] = useState<Identity>({ alias: '', gender: 'male', likes: [], look: DEFAULT_LOOK, match_code: '', bio: '', intent: 'socialize', preferences: DEFAULT_PREFERENCES });
  const [player, setPlayer] = useState<Login>();
  const [room, setRoom] = useState<Room>();
  const [joinTicket, setJoinTicket] = useState<string>();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState>();
  const [life, setLife] = useState<Life>();
  // Movement pace, remembered on this device (a per-viewer convenience, not game state).
  const [speed, setSpeed] = useState<Speed>(() => {
    try { const v = localStorage.getItem('sidepiece_speed'); return SPEEDS.includes(v as Speed) ? (v as Speed) : 'run'; } catch { return 'run'; }
  });
  const cycleSpeed = () => setSpeed((cur) => {
    const next = SPEEDS[(SPEEDS.indexOf(cur) + 1) % SPEEDS.length];
    try { localStorage.setItem('sidepiece_speed', next); } catch { /* private mode */ }
    return next;
  });
  const [actions, setActions] = useState<ActionInfo[]>([]);

  const [thread, setThread] = useState<Thread>();
  const [typingNpc, setTypingNpc] = useState<string>();
  const [outgoing, setOutgoing] = useState<Outgoing>();
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'error' | 'good' }>();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('world');
  const [walkRequest, setWalkRequest] = useState<{ kind: string; seq: number }>();
  const [sheet, setSheet] = useState<'nearby' | 'actions' | 'places' | 'dm-profile' | 'stats' | 'settings' | null>(null);
  const [dialog, setDialog] = useState<DialogSpec>();
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchShown, setMatchShown] = useState<Match>();
  const [inbox, setInbox] = useState<Inbox>();
  const [inboxError, setInboxError] = useState<string>();
  const [dmThread, setDmThread] = useState<DmThread>();
  const [dmSending, setDmSending] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [suggest, setSuggest] = useState<{ targetId: string; name: string; openTo?: string[]; initial?: string }>();
  const [inviteBusy, setInviteBusy] = useState(false);
  const [date, setDate] = useState<DateView>();
  const [dateBusy, setDateBusy] = useState(false);
  const [encounter, setEncounter] = useState<EncounterView>();
  const [encounterBusy, setEncounterBusy] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [stats, setStats] = useState<PlayerStats>();
  const [visSaving, setVisSaving] = useState(false);
  const [feed, setFeed] = useState<Feed>();
  const [feedError, setFeedError] = useState<string>();
  const [settings, setSettings] = useState<Settings>();
  const [settingsError, setSettingsError] = useState<string>();
  const [prefsSaving, setPrefsSaving] = useState(false);
  // In-app alert preferences (spec 18); the server stores them, the shell honours them.
  const alerts: NotificationPrefs = settings?.notifications ?? DEFAULT_ALERTS;
  const inviteStatus = useRef(new Map<string, string>());

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

  const refreshStats = useCallback(async () => {
    if (player) setStats(await api.get<PlayerStats>(`/v1/player/${player.player_id}/stats`));
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
    api.get<Activity[]>('/v1/activities').then(setActivities).catch(() => {});
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
    if (alerts.matches) setMatchShown((cur) => cur ?? list.find((m) => m.is_new));
  }, [player, alerts.matches]);

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

  // Spec 09A: every control is explained; destructive ones (end, block, report) confirm first.
  const openDmControls = (t: DmThread) => setDialog({
    title: t.display_name,
    body: `Mute pauses unread alerts for 8 hours. End conversation hides this thread until a new message arrives. Block hides you from each other everywhere. Report tells moderation what happened. ${t.display_name} isn't told about any of these.`,
    confirmLabel: t.muted ? 'Unmute' : 'Mute notifications',
    onConfirm: () => { setDialog(undefined); conversationControl(t.target_id, t.muted ? 'unmute' : 'mute'); },
    extraActions: [
      { label: 'End conversation', tone: 'danger', onClick: () => setDialog({
        title: `End conversation with ${t.display_name}?`,
        body: 'The thread leaves your inbox. Your match stays, and a new message from either of you reopens it.',
        confirmLabel: 'End conversation',
        tone: 'danger',
        onConfirm: () => { setDialog(undefined); conversationControl(t.target_id, 'end'); },
      }) },
      { label: 'Block', tone: 'danger', onClick: () => { setDialog(undefined); block(t.target_id, t.display_name); } },
      { label: 'Report', tone: 'danger', onClick: () => { setDialog(undefined); report(t.target_id, t.display_name); } },
    ],
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
    await enterPrivateRoom(result);
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
    if (action === 'accept') await enterPrivateRoom(result);
  });

  // ---------- Invitations & dates (spec 10/11/12) ----------
  const openSuggest = (targetId: string, name: string, openTo?: string[], initial?: string) => setSuggest({ targetId, name, openTo, initial });

  // ---------- Private encounters (spec 13) ----------
  const openEncounter = async (id: string) => {
    if (!player) return;
    setSheet(null);
    setEncounter(await api.get<EncounterView>(`/v1/encounters/${id}`, { player_id: player.player_id }));
  };

  /** Every accepted private room holds an encounter: join the room for presence, then open the moment. */
  async function enterPrivateRoom(r: PrivateRoomResult) {
    setTab('world');
    await joinRoom(r.room);
    if (r.encounter_id) await openEncounter(r.encounter_id);
  }

  const enterPrivate = (roomId: string) => guard(async () => {
    if (!player) return;
    await enterPrivateRoom(await api.get<PrivateRoomResult>(`/v1/social/private-room/${roomId}`, { player_id: player.player_id }));
  });

  const encounterAction = (action: 'confirm' | 'complete' | 'leave') => guard(async () => {
    if (!player || !encounter) return;
    setEncounterBusy(true);
    try {
      const next = await api.post<EncounterView>(`/v1/encounters/${encounter.id}/${action}`, { player_id: player.player_id });
      setEncounter((cur) => (cur && cur.id === next.id ? next : cur));
      if (action === 'complete') { refreshLife().catch(() => {}); refreshStats().catch(() => {}); }
    } finally {
      setEncounterBusy(false);
    }
  });

  const leaveEncounter = (e: EncounterView) => setDialog({
    title: e.status === 'playing' ? 'Stop here?' : 'Not tonight?',
    body: `${e.partner_name} will see that you called it a night. That's always okay, and there's no penalty for either of you.`,
    confirmLabel: 'Leave',
    cancelLabel: 'Stay',
    onConfirm: () => { setDialog(undefined); encounterAction('leave'); },
  });

  const finishEncounter = (then?: () => void) => {
    setEncounter(undefined);
    refreshLife().catch(() => {});
    refreshStats().catch(() => {});
    refreshPlayerState().catch(() => {});
    goTo('city').then(then);
  };

  // ---------- Outcomes & stats (spec 14/15/15A) ----------
  const sendFeedback = (o: ActivityOutcome, tags: string[]) => guard(async () => {
    if (!player) return;
    setFeedbackBusy(true);
    try {
      const next = await api.post<ActivityOutcome>(`/v1/outcomes/${o.source_id}/feedback`, { player_id: player.player_id, tags });
      setDate((d) => (d && d.id === next.source_id ? { ...d, outcome: next } : d));
      setEncounter((e) => (e && e.id === next.source_id ? { ...e, outcome: next } : e));
      notify('Thanks. Feedback sent.', 'good');
    } finally {
      setFeedbackBusy(false);
    }
  });

  // ---------- Feed (spec 16) ----------
  const refreshFeed = useCallback(async () => {
    if (!player) return;
    try {
      setFeed(await api.get<Feed>('/v1/feed', { player_id: player.player_id }));
      setFeedError(undefined);
    } catch (err) {
      setFeedError(err instanceof ApiError ? err.message : 'Could not load your feed');
    }
  }, [player]);

  /** Every feed item links to where it happened. */
  const feedAction = (action: string) => {
    const [kind, ...rest] = action.split(':');
    const arg = rest.join(':');
    if (kind === 'chat') openDm(arg);
    else if (kind === 'npc') { setTab('world'); openChat(arg); }
    else if (kind === 'stats') openStats();
    else if (kind === 'venue') { setTab('world'); goTo(arg); }
  };

  const openStats = () => { setTab('profile'); setSheet('stats'); refreshStats().catch(() => {}); };

  const saveVisibility = (v: StatVisibility) => guard(async () => {
    if (!player) return;
    setVisSaving(true);
    setStats((st) => st && { ...st, visibility: v });
    try {
      await api.post(`/v1/player/${player.player_id}/stats/visibility`, { player_id: player.player_id, visibility: v });
    } catch (err) {
      refreshStats().catch(() => {});
      throw err;
    } finally {
      setVisSaving(false);
    }
  });

  // ---------- Settings & privacy (spec 18) ----------
  const refreshSettings = useCallback(async () => {
    if (!player) return;
    try {
      setSettings(await api.get<Settings>(`/v1/player/${player.player_id}/settings`));
      setSettingsError(undefined);
    } catch (err) {
      setSettingsError(err instanceof ApiError ? err.message : 'Could not load your settings');
    }
  }, [player]);
  const openSettings = () => { setTab('profile'); setSheet('settings'); refreshSettings(); };

  const saveAlerts = (n: NotificationPrefs) => guard(async () => {
    if (!player) return;
    setSettings((st) => st && { ...st, notifications: n });
    try {
      await api.post(`/v1/player/${player.player_id}/settings/notifications`, { player_id: player.player_id, notifications: n });
    } catch (err) {
      refreshSettings();
      throw err;
    }
  });

  /** Visibility toggles are avatar preferences: save the whole avatar with the change. */
  const savePrefs = (patch: Partial<Preferences>) => guard(async () => {
    if (!player) return;
    const before = identity;
    const id = { ...identity, preferences: { ...identity.preferences, ...patch } };
    setIdentity(id);
    setPrefsSaving(true);
    try {
      await api.post('/v1/avatar', {
        player_id: player.player_id,
        avatar: { display_name: id.alias, gender: id.gender, likes: id.likes, look: id.look, match_code: id.match_code, bio: id.bio, intent: id.intent, preferences: id.preferences },
      });
    } catch (err) {
      setIdentity(before);
      throw err;
    } finally {
      setPrefsSaving(false);
    }
  });

  const unblock = (b: BlockedEntry) => setDialog({
    title: `Unblock ${b.display_name}?`,
    body: "You'll be able to see each other again. Matches and chats that ended stay ended, so you'd need to reconnect.",
    confirmLabel: 'Unblock',
    onConfirm: () => { setDialog(undefined); guard(async () => {
      if (!player) return;
      await api.post('/v1/moderation/unblock', { blocker_id: player.player_id, target_id: b.target_id });
      setSettings((st) => st && { ...st, blocked: st.blocked.filter((x) => x.target_id !== b.target_id) });
      notify(`${b.display_name} is unblocked`);
      discover().catch(() => {});
    }); },
  });

  const changePassword = async (current: string, next: string) => {
    if (!player) return false;
    try {
      await api.post('/v1/account/password', { player_id: player.player_id, current_password: current, new_password: next });
      notify('Password changed', 'good');
      return true;
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Something went wrong', 'error');
      return false;
    }
  };

  const deleteAccount = async (password: string) => {
    if (!player) return;
    try {
      await api.post('/v1/account/delete', { player_id: player.player_id, password: password || null, confirm: 'DELETE' });
      signOut();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Something went wrong', 'error');
    }
  };

  const openDate = (dateId: string) => guard(async () => {
    if (!player) return;
    setSheet(null);
    setDate(await api.get<DateView>(`/v1/dates/${dateId}`, { player_id: player.player_id }));
  });

  const sendInvite = (activity: string) => guard(async () => {
    if (!player || !suggest) return;
    const { targetId, name } = suggest;
    setInviteBusy(true);
    try {
      const inv = await api.post<Invitation>('/v1/invitations', { player_id: player.player_id, target_id: targetId, activity });
      setSuggest(undefined);
      if (targetId.startsWith('npc:')) {
        // NPCs answer straight away from the relationship (simulated consent, ADR 0003).
        if (inv.status !== 'accepted') { notify(inv.note ?? `${name} said not yet.`); return; }
        setThread(undefined);
        refreshLife().catch(() => {});
        if (inv.date_id) await openDate(inv.date_id);
        else if (inv.room_id) await enterPrivate(inv.room_id);
        return;
      }
      inviteStatus.current.set(inv.id, inv.status);
      setDmThread((t) => t && t.target_id === targetId ? { ...t, invitations: [...(t.invitations ?? []).filter((i) => i.id !== inv.id), inv] } : t);
      notify(`Invitation sent. ${name} can accept or decline.`, 'good');
    } finally {
      setInviteBusy(false);
    }
  });

  const respondInvite = (inv: Invitation, action: 'accept' | 'decline' | 'cancel') => guard(async () => {
    if (!player) return;
    setInviteBusy(true);
    try {
      const next = await api.post<Invitation>(`/v1/invitations/${inv.id}/respond`, { player_id: player.player_id, action });
      inviteStatus.current.set(next.id, next.status);
      setDmThread((t) => t && { ...t, invitations: (t.invitations ?? []).map((i) => (i.id === next.id ? next : i)) });
      refreshInbox().catch(() => {});
      if (action === 'accept' && next.date_id) await openDate(next.date_id);
      else if (action === 'accept' && next.room_id) await enterPrivate(next.room_id);
      else if (action === 'decline') notify('Declined. The chat stays open.');
    } catch (err) {
      // The card may be stale (expired, cancelled meanwhile): refresh it, then show why.
      if (dmThread) openDm(dmThread.target_id);
      throw err;
    } finally {
      setInviteBusy(false);
    }
  });

  const chooseInDate = (choice: number) => guard(async () => {
    if (!player || !date) return;
    setDateBusy(true);
    try {
      setDate(await api.post<DateView>(`/v1/dates/${date.id}/choose`, { player_id: player.player_id, beat: date.beat, choice }));
    } finally {
      setDateBusy(false);
    }
  });

  const finishDate = (d: DateView) => {
    setDate(undefined);
    refreshLife().catch(() => {});
    refreshStats().catch(() => {});
    refreshPlayerState().catch(() => {});
    if (d.partner_kind === 'player') openDm(d.partner_id);
    else setTab('world');
  };

  const leaveDate = (d: DateView) => setDialog({
    title: 'Leave the date?',
    body: `${d.partner_name} will see that you headed out. No penalty for either of you${d.partner_kind === 'player' ? ', and the chat stays open' : ''}.`,
    confirmLabel: 'Leave',
    cancelLabel: 'Stay',
    onConfirm: () => { setDialog(undefined); guard(async () => {
      if (!player) return;
      await api.post(`/v1/dates/${d.id}/leave`, { player_id: player.player_id });
      finishDate(d);
    }); },
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
      setDate((d) => (d?.partner_id === targetId ? undefined : d));
      if (encounter?.partner_id === targetId) finishEncounter();
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
      if (r.consent_state === 'accepted') { setOutgoing(undefined); notify(`${outgoing.targetName} accepted`, 'good'); await enterPrivateRoom(r); }
      else if (r.consent_state !== 'requested') { setOutgoing(undefined); notify(`${outgoing.targetName} declined`, 'error'); }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, outgoing]), 3000, inWorld && !!outgoing);
  useEffect(() => { if (inWorld) refreshPlayerState().catch(() => {}); }, [inWorld, refreshPlayerState]);
  usePolling(useCallback(() => { refreshMatches().catch(() => {}); }, [refreshMatches]), 5000, inWorld);
  usePolling(useCallback(() => { refreshInbox().catch(() => {}); }, [refreshInbox]), 5000, inWorld);
  const dmTarget = dmThread?.target_id;
  usePolling(useCallback(() => {
    if (!player || !dmTarget) return;
    api.get<DmThread>('/v1/messages/thread', { player_id: player.player_id, target_id: dmTarget }).then((t) => {
      // A poll that lands after Back (or after switching threads) must not reopen the old thread.
      setDmThread((cur) => (cur && cur.target_id === t.target_id ? t : cur));
      api.post('/v1/messages/read', { player_id: player.player_id, target_id: t.target_id }).then(() => refreshInbox()).catch(() => {});
    }).catch(() => {});
    // Keyed on the thread id, not the thread object: each response replaces the object, which used to refetch at once.
  }, [player, dmTarget, refreshInbox]), 3000, inWorld && !!dmTarget);

  usePolling(useCallback(() => {
    if (!player || !date) return;
    api.get<DateView>(`/v1/dates/${date.id}`, { player_id: player.player_id })
      .then((d) => setDate((cur) => (cur && cur.id === d.id ? d : cur)))
      .catch((err) => { if (err instanceof ApiError && err.status === 404) setDate(undefined); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, date?.id]), 2000, inWorld && !!date && (date.status === 'active' || (date.status === 'completed' && !date.outcome)));

  usePolling(useCallback(() => {
    if (!player || !encounter) return;
    api.get<EncounterView>(`/v1/encounters/${encounter.id}`, { player_id: player.player_id })
      .then((e) => setEncounter((cur) => (cur && cur.id === e.id ? e : cur)))
      .catch((err) => { if (err instanceof ApiError && err.status === 404) setEncounter(undefined); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, encounter?.id]), 2000, inWorld && !!encounter && (encounter.status === 'waiting' || encounter.status === 'playing' || (encounter.status === 'completed' && !encounter.outcome)));
  useEffect(() => { if (inWorld) refreshStats().catch(() => {}); }, [inWorld, refreshStats]);
  useEffect(() => { if (inWorld) refreshSettings(); }, [inWorld, refreshSettings]);
  usePolling(useCallback(() => { refreshFeed(); }, [refreshFeed]), 15000, inWorld);
  // Opening the feed clears its badge; the "New" markers stay for this visit.
  useEffect(() => {
    if (!inWorld || tab !== 'feed' || !player) return;
    refreshFeed().then(() => api.post('/v1/feed/seen', { player_id: player.player_id })).then(() => setFeed((f) => f && { ...f, unseen_count: 0 })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, inWorld]);

  // A finished date/encounter can be read a moment before its rewards are written: the polls above keep going
  // until the outcome arrives.

  // Spec 11 → 12: when the other side accepts while you're in the thread, take the sender to the date.
  useEffect(() => {
    for (const inv of dmThread?.invitations ?? []) {
      const before = inviteStatus.current.get(inv.id);
      inviteStatus.current.set(inv.id, inv.status);
      if (before === 'pending' && inv.status === 'accepted' && inv.outgoing) {
        // Joining the date isn't an alert: the sender is taken there either way.
        if (inv.date_id && inv.date_status === 'active') { if (alerts.invitations) notify(`${inv.target_name} accepted. See you there.`, 'good'); openDate(inv.date_id); }
        else if (inv.room_id && alerts.invitations) notify(`${inv.target_name} accepted. The private room is ready when you are.`, 'good');
      } else if (alerts.invitations && before === 'pending' && inv.outgoing && (inv.status === 'declined' || inv.status === 'expired')) {
        notify(inv.status === 'declined' ? `${inv.target_name} passed this time.` : 'Your invitation expired.');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmThread?.invitations]);

  const relationships = (playerState?.relationships ?? []).filter((r) => r.stats.affinity > 0).sort((a, b) => b.stats.affinity - a.stats.affinity);
  const nameFor = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? id.replace(/^(npc|player):/, '').replace(/^\w/, (c) => c.toUpperCase());
  const venueActions = actions.filter((a) => a.venues.includes(venueKind));

  // ---------- Render ----------
  const name = identity.alias || player?.display_name || 'You';
  const fullScreen = inPrivate || !!date || !!encounter; // hide shell chrome in immersive scenes
  const incomingCount = incoming.length;
  const messageBadge = incomingCount
    + (alerts.matches ? matches.filter((m) => m.is_new).length : 0)
    + (alerts.messages ? inbox?.unread_count ?? 0 : 0)
    + (alerts.invitations ? inbox?.invite_count ?? 0 : 0);

  if (step === 'create') {
    return <main className="fullscreen creator-screen">
      <Backdrop />
      <div className="welcome-shade" />
      <Creator initial={identity} saving={loading} onComplete={completeIdentity} initialStep={creatorAt.step} mode={creatorAt.mode} onCancel={backToWorld} />
      {toast && <div className={`notice floating ${toast.tone}`}>{toast.text}</div>}
    </main>;
  }

  if (step === 'welcome') {
    return <main className="auth-screen welcome-screen">
      {restoring
        ? <div className="auth-brand"><BrandLogo /><p className="empty">Restoring your session…</p></div>
        : <Welcome onCreate={() => { setAuthMode('register'); setStep('auth'); }} onSignIn={() => { setAuthMode('login'); setStep('auth'); }} onLegal={setLegal} />}
      {legal && <LegalPopup doc={legal} onClose={() => setLegal(undefined)} />}
    </main>;
  }

  if (step === 'auth') {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const pwScore = passwordScore(password);
    const aliasOk = alias.trim().length >= 2;
    const age = ageFrom(dob);
    const passDone = [emailOk, pwScore > 0, aliasOk, age !== undefined && age >= 18, acceptTerms].filter(Boolean).length;
    return <main className="auth-screen auth-v2">
      <Backdrop />
      <div className="welcome-shade" />
      <button className="auth-back ghost" onClick={() => { setAuthError(undefined); setStep('welcome'); }}><ArrowLeft size={16} strokeWidth={2.6} /> Back</button>
      <div className="auth-brand">
        <BrandLogo />
        <h2 className="auth-hello">{authMode === 'register' ? "Let's get you in" : 'Welcome back'}<span>{authMode === 'register' ? 'two minutes, then Lagos is yours' : 'they missed you'}</span></h2>
      </div>
      {restoring
        ? <div className="auth-card"><p className="empty">Restoring your session…</p></div>
        : <form className={`auth-card pass ${authMode}`} onSubmit={submitAuth}>
          <div className="pass-main">
            <div className={`auth-tabs ${authMode}`} role="tablist">
              <i className="auth-tabs-pill" aria-hidden="true" />
              <button type="button" className={authMode === 'register' ? 'selected' : 'ghost'} onClick={() => setAuthMode('register')}>Create account</button>
              <button type="button" className={authMode === 'login' ? 'selected' : 'ghost'} onClick={() => setAuthMode('login')}>Sign in</button>
            </div>
            {authMode === 'register' && <div className="pass-meter" aria-label={`Guest pass ${passDone} of 5 ready`}>
              <span>Guest pass</span>
              <span className="pass-dots">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < passDone ? 'on' : ''} />)}</span>
            </div>}
            <Field icon={Mail} label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} valid={emailOk} required />
            <Field
              icon={LockKeyhole} label="Password" type={showPassword ? 'text' : 'password'}
              autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)}
              minLength={authMode === 'register' ? 10 : undefined} required valid={authMode === 'register' ? pwScore > 0 : password.length > 0}
              trailing={<button type="button" className="field-action" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((v) => !v)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>}
              hint={authMode === 'register' && password && <span className="pw-meter" data-score={pwScore}><span className="pw-bars"><i /><i /><i /></span>{PASSWORD_WORDS[pwScore]}{pwScore === 0 && ` (${password.length}/10)`}</span>}
            />
            {authMode === 'register' && <div className="register-extra">
              <Field
                icon={AtSign} label="Alias" prefix="@" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Jay123"
                minLength={2} maxLength={24} required valid={aliasOk}
                hint={aliasOk ? <>Lagos will know you as <b>@{alias}</b></> : 'What people call you in the city'} hintTone={aliasOk ? 'good' : undefined}
              />
              <Field
                icon={Cake} label="Date of birth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required valid={age !== undefined && age >= 18}
                max={new Date().toISOString().slice(0, 10)}
                hint={age === undefined ? 'Adults only. We just check, we never show it.' : age >= 18 ? <><b>{age}</b>, you're on the list</> : 'Side Piece is 18+ only'}
                hintTone={age === undefined ? undefined : age >= 18 ? 'good' : 'bad'}
              />
            </div>}
          </div>
          <div className="pass-stub">
            <div className="pass-stub-head"><span>Admit one · Lagos</span><b className="age-chip">18+</b></div>
            {authMode === 'register' && <label className={`consent-card ${acceptTerms ? 'on' : ''}`}>
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
              <span className="consent-box" aria-hidden="true"><Heart size={16} fill={acceptTerms ? 'currentColor' : 'none'} strokeWidth={2.4} /></span>
              <span>I'm 18 or older and agree to the <a href="#terms" onClick={(e) => { e.preventDefault(); setLegal('terms'); }}>Terms</a>, <a href="#privacy" onClick={(e) => { e.preventDefault(); setLegal('privacy'); }}>Privacy</a> and <a href="#rules" onClick={(e) => { e.preventDefault(); setLegal('rules'); }}>Community rules</a>: consent first, no harassment, respect blocks.</span>
            </label>}
            {authError && <p className="field-error" role="alert">{authError}</p>}
            <button type="submit" disabled={loading || (authMode === 'register' && !acceptTerms)}>{loading ? 'Please wait…' : <>{authMode === 'register' ? 'Create account' : 'Sign in'} <ArrowRight size={20} strokeWidth={2.8} /></>}</button>
          </div>
        </form>}
      {toast && <ToastView toast={toast} />}
      {legal && <LegalPopup doc={legal} onClose={() => setLegal(undefined)} />}
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
      paused={!!date || !!encounter}
      speed={speed}
      walkRequest={walkRequest}
      hour={life ? life.clock.hour + Math.floor(life.clock.minute / 15) / 4 : undefined}
    >
      {tab === 'world' && thread && <NpcChat
        thread={thread}
        typing={typingNpc === thread.npc_id}
        onSend={sendChat}
        onClose={() => setThread(undefined)}
        onInterest={() => expressInterest(`npc:${thread.npc_id}`, thread.npc_name)}
        onPlans={() => openSuggest(`npc:${thread.npc_id}`, thread.npc_name)}
      />}
    </SceneView>

    {!fullScreen && <TopBar name={name} life={life} onProfile={() => setTab('profile')} />}

    {tab === 'world' && !fullScreen && !thread && !discoverOpen && <div className="world-dock">
      {venueKind !== 'city' && <button className="dock-btn" aria-label="Back to Lekki" disabled={loading} onClick={() => goTo('city')}><ArrowLeft size={16} strokeWidth={2.5} /><span className="dock-label">Lekki</span></button>}
      <button className="dock-btn" aria-label={`Pace: ${speed}. Tap to change`} title="Walk / Run / Sprint (Shift = one step faster)" onClick={cycleSpeed}>
        {speed === 'walk' ? <Footprints size={16} strokeWidth={2.5} /> : speed === 'run' ? <Wind size={16} strokeWidth={2.5} /> : <Zap size={16} strokeWidth={2.5} />}
        <span className="dock-label">{speed === 'walk' ? 'Walk' : speed === 'run' ? 'Run' : 'Sprint'}</span>
      </button>
      {venueKind !== 'private_room' && <button className="dock-btn" aria-label="Go out: find a club" onClick={() => setSheet('places')}><MapPin size={16} strokeWidth={2.5} /><span className="dock-label">Go out</span></button>}
      {venueActions.length > 0 && <button className="dock-btn" aria-label="Things to do" onClick={() => setSheet('actions')}><Sparkles size={16} strokeWidth={2.5} /><span className="dock-label">Do</span></button>}
      {!inPrivate && <button className="dock-btn" aria-label="Nearby" onClick={() => setSheet('nearby')}><Users size={16} strokeWidth={2.5} /><span className="dock-label">Nearby</span>{profiles.length ? <b className="dock-count">{profiles.length}</b> : null}</button>}
    </div>}

    {tab === 'messages' && (dmThread
      ? <DmChat
        thread={dmThread}
        sending={dmSending}
        onBack={() => { setDmThread(undefined); refreshInbox().catch(() => {}); }}
        onSend={sendDm}
        onProfile={() => setSheet('dm-profile')}
        inviteBusy={inviteBusy}
        onSuggest={(initial) => openSuggest(dmThread.target_id, dmThread.display_name, dmThread.open_to, initial)}
        onRespond={respondInvite}
        onJoinDate={(inv) => inv.date_id && openDate(inv.date_id)}
        onEnterRoom={(inv) => inv.room_id && enterPrivate(inv.room_id)}
        onMore={() => openDmControls(dmThread)}
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

    {tab === 'feed' && <FeedPanel
      feed={feed}
      loading={!feed && !feedError}
      error={feedError}
      onRetry={() => refreshFeed()}
      onAction={feedAction}
      onExplore={() => setTab('world')}
    />}

    {tab === 'profile' && <div className="tab-panel">
      <header className="tab-panel-head profile-head"><h2>Profile</h2><span className="sticker">that's you ✨</span>
        <button className="icon-btn settings-btn" aria-label="Settings & privacy" onClick={openSettings}><SettingsIcon size={18} strokeWidth={2.4} /></button>
      </header>
      <button className="meet-cta" onClick={() => { setSheet(null); setDiscoverOpen(true); }}>
        <span className="meet-icon"><Heart size={22} strokeWidth={0} fill="currentColor" /></span>
        <span className="meet-text"><b>Meet someone new</b><small>See who's out in Lagos tonight</small></span>
        <ArrowRight size={20} strokeWidth={2.6} />
      </button>
      <section className="profile-hero-card">
        <div className="hero-portrait">
          <Preview look={identity.look} framing="face" interactive={false} />
          <span className="level-badge" aria-label={`Level ${life?.level ?? 1}`}>{life?.level ?? 1}</span>
        </div>
        <div className="hero-text">
          <strong>{name}</strong>
          {identity.bio ? <p className="hero-bio">“{identity.bio}”</p> : <button className="link-btn" onClick={() => openCreator(5, 'edit')}>+ Add a bio</button>}
          <div className="pill-row tight">
            {identity.likes.map((l) => <span key={l} className="pill">{l}</span>)}
            {identity.match_code && <span className="pill code">{identity.match_code}</span>}
          </div>
        </div>
      </section>
      <StatsHero stats={stats} onDetails={openStats} onExplore={() => setTab('world')} />
      <div className="action-tiles">
        <button className="action-tile" onClick={() => openCreator(1, 'edit')}><Shirt size={20} strokeWidth={2.3} /><span>Edit character</span></button>
        <button className="action-tile" onClick={() => openCreator(4, 'edit')}><SlidersHorizontal size={20} strokeWidth={2.3} /><span>Edit preferences</span></button>
        <button className="action-tile" onClick={() => openCreator(5, 'edit')}><Eye size={20} strokeWidth={2.3} /><span>Preview profile</span></button>
      </div>
      <h3 className="subhead">Your vibe</h3>
      <dl className="pref-grid">
        <div><dt>Here to</dt><dd>{labelOf(INTENTS, identity.intent)}</dd><em>private</em></div>
        <div><dt>Style</dt><dd>{identity.preferences.relationship_style ? labelOf(RELATIONSHIP_STYLES, identity.preferences.relationship_style) : 'Not set'}</dd><em>{identity.preferences.public_relationship_style ? 'public' : 'private'}</em></div>
        <div className="wide"><dt>Interests</dt><dd>{identity.preferences.interests.join(', ') || 'None yet'}</dd><em>{identity.preferences.public_interests ? 'public' : 'private'}</em></div>
        <div><dt>Boundaries</dt><dd>{identity.preferences.boundaries.map((b) => labelOf(INVITATION_TYPES, b)).join(', ') || 'None'}</dd><em>private</em></div>
        <div><dt>Show me</dt><dd>{identity.preferences.show_me.length === 0 || identity.preferences.show_me.length === SHOW_ME.length ? 'Everyone' : identity.preferences.show_me.map((g) => labelOf(SHOW_ME, g)).join(', ')}</dd></div>
        <div><dt>Nearby</dt><dd>{identity.preferences.discoverable ? 'Discoverable' : 'Hidden'}</dd></div>
      </dl>
      <h3 className="subhead">Relationships</h3>
      {relationships.length === 0
        ? <EmptyState icon="🤝" title="No relationships yet" body="Chat with locals and players to build connections." actionLabel="Meet someone" onAction={() => setTab('world')} />
        : relationships.map((r) => <div key={r.target_id} className="relationship-row">
          <strong>{nameFor(r.target_id)} <em>{tierFor(r.stats.affinity)}</em></strong>
          <TierMeter value={r.stats.affinity} />
        </div>)}
      <button className="stats-more settings-row" onClick={openSettings}>
        <SettingsIcon size={18} strokeWidth={2.4} />
        <span><b>Settings & privacy</b><small>Visibility, alerts, blocked players, account</small></span>
        <ArrowRight size={18} strokeWidth={2.6} />
      </button>
      <button className="link-btn signout" onClick={signOut}><LogOut size={15} strokeWidth={2.4} /> Sign out</button>
    </div>}

    {sheet === 'nearby' && <Sheet title="Nearby" subtitle={`${profiles.length} in ${room?.display_name ?? 'Lagos'}`} onClose={() => setSheet(null)}>
      {profiles.length === 0
        ? <EmptyState icon="🌃" title={venueKind === 'city' ? 'The street is quiet' : 'No one nearby yet'} body={venueKind === 'city' ? 'Head into a venue to meet people.' : 'Give it a moment, or try another venue.'} />
        : profiles.map((p) => <ProfileCard key={p.id} data={p} actions={nearbyActions(p)} />)}
    </Sheet>}

    {sheet === 'dm-profile' && tab === 'messages' && dmThread && <DmProfileSheet
      thread={dmThread}
      onClose={() => setSheet(null)}
      onMore={() => { setSheet(null); openDmControls(dmThread); }}
      onMeet={(venue) => { setSheet(null); setTab('world'); goTo(venue); }}
    />}
    {sheet === 'stats' && tab === 'profile' && stats && <StatsSheet stats={stats} saving={visSaving} onVisibility={saveVisibility} onClose={() => setSheet(null)} />}
    {sheet === 'settings' && tab === 'profile' && <SettingsSheet
      settings={settings}
      error={settingsError}
      onRetry={() => refreshSettings()}
      prefs={identity.preferences}
      saving={prefsSaving}
      onPrefs={savePrefs}
      onDiscoveryPrefs={() => { setSheet(null); openCreator(4, 'edit'); }}
      onStatVisibility={openStats}
      onAlerts={saveAlerts}
      onUnblock={unblock}
      onLegal={setLegal}
      onSignOut={signOut}
      onChangePassword={changePassword}
      onDelete={deleteAccount}
      onClose={() => setSheet(null)}
    />}
    {legal && <LegalPopup doc={legal} onClose={() => setLegal(undefined)} />}
    {sheet === 'places' && <Sheet title="Go out tonight" subtitle={`${CLUBS.length} clubs and lounges in Lagos`} onClose={() => setSheet(null)}>
      {[...new Set(CLUBS.map((c) => c.area))].map((area) => <section key={area} className="places-area">
        <h4>{area}</h4>
        <div className="places-list">
          {CLUBS.filter((c) => c.area === area).map((c) => <article key={c.kind} className="place-card" style={{ '--club': c.color } as React.CSSProperties}>
            <div><strong>{c.name}</strong><span>{c.street}</span><p>{c.vibe}</p></div>
            <div className="place-go">
              {venueKind === 'city' && <button className="ghost" onClick={() => { setSheet(null); setWalkRequest((w) => ({ kind: c.kind, seq: (w?.seq ?? 0) + 1 })); }}><Footprints size={15} strokeWidth={2.4} /> Walk</button>}
              <button onClick={() => { setSheet(null); goTo(c.kind); }}><CarTaxiFront size={15} strokeWidth={2.4} /> Ride there</button>
            </div>
          </article>)}
        </div>
      </section>)}
      <p className="creator-hint">Walk to see the city, or take a ride straight to the door. Clubs have neon names and searchlights over the rooftops, and you can tap one to walk there.</p>
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
      onChangeLocation={() => { setDiscoverOpen(false); setTab('world'); const others = CLUBS.filter((c) => c.kind !== venueKind); goTo(others[Math.floor(Math.random() * others.length)].kind); }}
      onMeetNpc={() => { setDiscoverOpen(false); setTab('world'); goTo('neon_lounge').then(() => setSheet('nearby')); }}
    />}

    {matchShown && <MatchMoment
      match={matchShown}
      myLook={identity.look}
      onStartChat={() => closeMatch(startChatWith)}
      onKeepExploring={() => closeMatch()}
    />}

    {suggest && <SuggestSheet
      name={suggest.name}
      activities={activities}
      openTo={suggest.openTo}
      money={life?.money}
      initial={suggest.initial}
      sending={inviteBusy}
      onSend={sendInvite}
      onClose={() => setSuggest(undefined)}
    />}

    {date && <DateScene
      date={date}
      myLook={identity.look}
      busy={dateBusy}
      feedbackBusy={feedbackBusy}
      onChoose={chooseInDate}
      onLeave={() => leaveDate(date)}
      onDone={() => finishDate(date)}
      onFeedback={(tags) => date.outcome && sendFeedback(date.outcome, tags)}
      onStats={() => { setDate(undefined); refreshLife().catch(() => {}); openStats(); }}
    />}

    {encounter && <EncounterScene
      encounter={encounter}
      myLook={identity.look}
      busy={encounterBusy}
      feedbackBusy={feedbackBusy}
      onConfirm={() => encounterAction('confirm')}
      onComplete={() => encounterAction('complete')}
      onLeave={() => leaveEncounter(encounter)}
      onFeedback={(tags) => encounter.outcome && sendFeedback(encounter.outcome, tags)}
      onDone={() => finishEncounter()}
      onStats={() => finishEncounter(openStats)}
    />}

    {dialog && <ConfirmDialog spec={dialog} onCancel={() => setDialog(undefined)} />}

    {!fullScreen && <BottomNav tab={tab} onTab={(t) => { setTab(t); setSheet(null); setDiscoverOpen(false); if (t !== 'messages') setDmThread(undefined); }} badges={{ messages: messageBadge || undefined, feed: alerts.feed && tab !== 'feed' && feed?.unseen_count ? feed.unseen_count : undefined }} onDiscover={() => { setSheet(null); setDiscoverOpen(true); }} />}
    {inPrivate && !date && !encounter && <button className="exit-scene" disabled={loading} onClick={() => goTo('city')}>← Leave</button>}

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
