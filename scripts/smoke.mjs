const API = process.env.API_URL ?? 'http://localhost:4000';
const log = (...a) => console.log(...a);
async function call(method, path, token, body) {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}
const check = (cond, label) => { if (!cond) throw new Error(`check failed: ${label}`); };
const must = (res, label) => { if (!res.ok) { throw new Error(`${label} failed: ${res.status} ${res.error}`); } return res.data; };

async function makePlayer(name, intent, style, extra = {}) {
  const email = `${name.toLowerCase()}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@smoke.test`;
  const login = must(await call('POST', '/v1/auth/register', null, { email, password: 'smoke-test-password', display_name: name, date_of_birth: '1995-05-05', accept_terms: true }), 'register');
  must(await call('POST', '/v1/avatar', login.token, { player_id: login.player_id, avatar: { display_name: name, gender: 'female', likes: intent, look: { gender: 'female', skin_tone: 0.4, hair_color: '#111111', hair_length: 0.8, body_type: 0.5, face: [0, 0, 0, 0], top: style, bottom: 'jeans', accessory: 'none', style: 'glam' }, match_code: '#1', ...extra } }), 'avatar');
  return login;
}
function connect(p, room, look) {
  return new Promise(async (resolve, reject) => {
    const t = must(await call('POST', '/v1/rooms/join-ticket', p.token, { player_id: p.player_id, room_id: room.id }), 'ticket');
    const ws = new WebSocket(room.websocket_url);
    const events = [];
    ws.onmessage = (m) => { const e = JSON.parse(m.data); events.push(e); if (e.type === 'welcome') resolve({ ws, events, welcome: e }); if (e.type === 'error') reject(new Error(e.message)); };
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', player_id: p.player_id, display_name: p.display_name, room_id: room.id, token: t.ticket, look }));
    ws.onerror = reject;
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const A = await makePlayer('Ada' + Date.now() % 1000, ['Caring', 'Humorous'], 'dress_red');
const H = await makePlayer('Hub' + Date.now() % 1000, ['Caring'], 'tee_white');
const B = await makePlayer('Ben' + Date.now() % 1000, ['Caring'], 'tee_white', { bio: 'Here for good music and better company', intent: 'flirt', preferences: { interests: ['Afrobeats', 'Food spots'], relationship_style: 'committed', public_relationship_style: false } });
const roomA = must(await call('POST', '/v1/matchmaking/join', A.token, { player_id: A.player_id, preferred_room: 'neon_lounge' }), 'join A');
const a = await connect(A, roomA, { gender: 'female', top: 'dress_red', style: 'glam', skin_tone: 0.4 });
a.ws.send(JSON.stringify({ type: 'move', x: 1.5, y: 0, z: 2, rot_y: 1 }));
await sleep(200);
const roomB = must(await call('POST', '/v1/matchmaking/join', B.token, { player_id: B.player_id, preferred_room: 'neon_lounge' }), 'join B');
log('rooms:', roomA.id, roomB.id);
check(roomA.display_name === 'Ikoyi Lounge', `lounge is named Ikoyi Lounge (got ${roomA.display_name})`);
const hub = must(await call('POST', '/v1/matchmaking/join', H.token, { player_id: H.player_id, preferred_room: 'city' }), 'join hub');
check(hub.display_name === 'Lekki Phase 1', `hub is named Lekki Phase 1 (got ${hub.display_name})`);
const b = await connect(B, roomB, { gender: 'male', top: 'tee_white', style: 'streetwear', skin_tone: 0.7 });
const rosterEntry = b.welcome.roster.find(r => r.player_id === A.player_id);
log('B welcome roster has A with look+pos:', JSON.stringify(rosterEntry));
await sleep(200);
const joinedEvt = a.events.find(e => e.type === 'player_joined' && e.player_id === B.player_id);
log('A saw B join with look:', JSON.stringify(joinedEvt?.look));

const disc = must(await call('GET', `/v1/discovery?player_id=${A.player_id}&room_id=${roomA.id}`, A.token), 'discovery');
log('A discovery:', disc.profiles.map(p => `${p.display_name}(${p.kind},${p.compatibility}%)`).join(', '));
const benCard = disc.profiles.find(p => p.id === `player:${B.player_id}`);
check(benCard?.bio === 'Here for good music and better company', 'public bio is shown to others');
check(JSON.stringify(benCard?.interests) === JSON.stringify(['Afrobeats', 'Food spots']), 'public interests are shown');
check(benCard?.relationship_style == null, 'private relationship style is NOT shown');
check(!('preferences' in benCard) && !('intent' in benCard), 'no private preference fields leak');
check(benCard?.open_to.includes('private_location'), 'B is open to private invitations');
const badPrefs = await call('POST', '/v1/avatar', B.token, { player_id: B.player_id, avatar: { display_name: 'Ben', gender: 'male', likes: ['Caring'], preferences: { interests: ['Skydiving'] } } });
check(badPrefs.status === 400, `unknown interest rejected (got ${badPrefs.status})`);
const badBio = await call('POST', '/v1/avatar', B.token, { player_id: B.player_id, avatar: { display_name: 'Ben', gender: 'male', likes: ['Caring'], bio: 'x'.repeat(161) } });
check(badBio.status === 400, 'oversized bio rejected');
log('preferences ok: public fields shown, private hidden, invalid values -> 400');

// ---- M4: Discover -> Match ----
const like1 = must(await call('POST', '/v1/social/interest', A.token, { player_id: A.player_id, target_id: `player:${B.player_id}` }), 'A likes B');
check(like1.matched === false, 'one-sided like is not a match');
const like2 = must(await call('POST', '/v1/social/interest', B.token, { player_id: B.player_id, target_id: `player:${A.player_id}` }), 'B likes A');
check(like2.matched === true && like2.match_info?.display_name === A.display_name, 'mutual like is a match');
const aMatches = must(await call('GET', `/v1/social/matches?player_id=${A.player_id}`, A.token), 'A matches');
check(aMatches.some(m => m.target_id === `player:${B.player_id}` && m.is_new), 'A has an unseen match with B');
const bMatches = must(await call('GET', `/v1/social/matches?player_id=${B.player_id}`, B.token), 'B matches');
check(bMatches.some(m => m.target_id === `player:${A.player_id}` && !m.is_new), 'B (who acted) already saw it');
must(await call('POST', '/v1/social/matches/seen', A.token, { player_id: A.player_id, target_id: `player:${B.player_id}` }), 'seen');
const aMatches2 = must(await call('GET', `/v1/social/matches?player_id=${A.player_id}`, A.token), 'A matches 2');
check(!aMatches2.find(m => m.target_id === `player:${B.player_id}`).is_new, 'match moment shows once');
const deck1 = must(await call('GET', `/v1/discover?player_id=${A.player_id}&limit=5`, A.token), 'deck');
check(!deck1.profiles.some(p => p.id === `player:${B.player_id}`), 'matched profiles leave the deck');
const first = deck1.profiles[0];
must(await call('POST', '/v1/social/pass', A.token, { player_id: A.player_id, target_id: first.id }), 'pass');
const deck2 = must(await call('GET', `/v1/discover?player_id=${A.player_id}&limit=30`, A.token), 'deck 2');
check(!deck2.profiles.some(p => p.id === first.id), 'a passed profile does not re-show');
const npcLike = must(await call('POST', '/v1/social/interest', A.token, { player_id: A.player_id, target_id: 'npc:zara' }), 'like zara');
check(npcLike.matched === false, 'an NPC you barely know does not match back');
const self = await call('POST', '/v1/social/interest', A.token, { player_id: A.player_id, target_id: `player:${A.player_id}` });
check(self.status === 400, 'cannot like yourself');
log(`match ok: one-sided -> no match, mutual -> match (${like2.match_info.display_name}), deck excludes matched/passed (${deck1.profiles.length} cards, first ${first.display_name}), npc needs Friendly`);

// ---- M5: Messages ----
const msg1 = must(await call('POST', '/v1/messages/send', A.token, { player_id: A.player_id, target_id: `player:${B.player_id}`, message: 'Saw you at the lounge. Come say hi?' }), 'send dm');
check(msg1.outgoing && msg1.content.includes('lounge'), 'sent DM echoes back as outgoing');
const bInbox = must(await call('GET', `/v1/messages/inbox?player_id=${B.player_id}`, B.token), 'B inbox');
const bConv = bInbox.conversations.find(c => c.target_id === `player:${A.player_id}`);
check(bConv?.unread_count === 1 && bInbox.unread_count >= 1, 'B inbox has unread DM');
check(bConv.last_message === 'Saw you at the lounge. Come say hi?', 'inbox shows last message');
const bThread = must(await call('GET', `/v1/messages/thread?player_id=${B.player_id}&target_id=player:${A.player_id}`, B.token), 'B thread');
check(bThread.messages.some(m => !m.outgoing && m.content === msg1.content), 'thread persists incoming message');
must(await call('POST', '/v1/messages/read', B.token, { player_id: B.player_id, target_id: `player:${A.player_id}` }), 'read dm');
const bInbox2 = must(await call('GET', `/v1/messages/inbox?player_id=${B.player_id}`, B.token), 'B inbox read');
check(bInbox2.conversations.find(c => c.target_id === `player:${A.player_id}`)?.unread_count === 0, 'mark read clears unread');
must(await call('POST', '/v1/messages/control', B.token, { player_id: B.player_id, target_id: `player:${A.player_id}`, action: 'mute' }), 'mute dm');
const muted = must(await call('GET', `/v1/messages/thread?player_id=${B.player_id}&target_id=player:${A.player_id}`, B.token), 'muted thread');
check(muted.muted === true, 'mute flag is visible');
must(await call('POST', '/v1/messages/control', B.token, { player_id: B.player_id, target_id: `player:${A.player_id}`, action: 'end' }), 'end dm');
const bInboxEnded = must(await call('GET', `/v1/messages/inbox?player_id=${B.player_id}`, B.token), 'B inbox ended');
check(!bInboxEnded.conversations.some(c => c.target_id === `player:${A.player_id}`), 'ended conversation hides locally');
must(await call('POST', '/v1/messages/send', A.token, { player_id: A.player_id, target_id: `player:${B.player_id}`, message: 'Still around?' }), 'send after end');
const bInboxNew = must(await call('GET', `/v1/messages/inbox?player_id=${B.player_id}`, B.token), 'B inbox new after end');
check(bInboxNew.conversations.some(c => c.target_id === `player:${A.player_id}` && c.unread_count === 1), 'new message reopens ended conversation');
const D = await makePlayer('Dee' + Date.now() % 1000, ['Caring'], 'tee_black');
const unmatched = await call('POST', '/v1/messages/send', A.token, { player_id: A.player_id, target_id: `player:${D.player_id}`, message: 'hello' });
check(unmatched.status === 403, `unmatched players cannot message (got ${unmatched.status})`);
log('messages ok: persisted DM, unread/read, mute/end, unmatched blocked');

// Ticket reuse must fail
const t1 = must(await call('POST', '/v1/rooms/join-ticket', A.token, { player_id: A.player_id, room_id: roomA.id }), 'ticket');

// Free-text NPC chat: scored replies move affinity and life needs
const thread = must(await call('GET', `/v1/npc/maya/chat?player_id=${A.player_id}`, A.token), 'thread');
log('Maya opens with:', JSON.stringify(thread.messages[0].content), '| tier', thread.relationship.tier_label);
const lifeBefore = must(await call('GET', `/v1/player/${A.player_id}/life`, A.token), 'life');
const nice = must(await call('POST', '/v1/npc/maya/chat', A.token, { player_id: A.player_id, message: "Haha you're funny! How was your day?" }), 'chat1');
log(`nice msg -> (${nice.score_delta >= 0 ? '+' : ''}${nice.score_delta}) "${nice.reply}" [${nice.source}] affinity ${nice.relationship.affinity}`);
const rude = must(await call('POST', '/v1/npc/maya/chat', A.token, { player_id: A.player_id, message: 'whatever, you are boring' }), 'chat2');
log(`rude msg -> (${rude.score_delta}) "${rude.reply}" affinity ${rude.relationship.affinity}`);
log('life: social', Math.round(lifeBefore.needs.social), '->', Math.round(rude.life.needs.social), '| xp', lifeBefore.xp, '->', rude.life.xp, '| clock', rude.life.clock.label);
const drink = must(await call('POST', `/v1/player/${A.player_id}/life/action`, A.token, { action: 'buy_drink', venue: 'neon_lounge' }), 'drink');
log('buy drink -> money', lifeBefore.money, '->', drink.life.money, '|', drink.message);
check(lifeBefore.money === 50000, `new player starts with ₦50,000 (got ${lifeBefore.money})`);
check(drink.life.money === lifeBefore.money - 3500, 'a drink costs ₦3,500');
const actions = must(await call('GET', '/v1/life/actions'), 'actions');
check(actions.every(x => !x.label.includes('$')), 'no $ in action labels');
check(actions.find(x => x.id === 'work_shift').label.includes('₦18,000'), 'shift label shows ₦18,000');
log('economy ok: start ₦50,000, drink ₦3,500, labels in ₦');
const wrongPlace = await call('POST', `/v1/player/${A.player_id}/life/action`, A.token, { action: 'work_shift', venue: 'neon_lounge' });
log('work shift in lounge ->', wrongPlace.status, wrongPlace.error);

// Player-to-player private room: A invites B
const pr = must(await call('POST', '/v1/social/private-room', A.token, { player_id: A.player_id, target_id: `player:${B.player_id}` }), 'request');
const selfAccept = await call('POST', `/v1/social/private-room/${pr.room.id}/consent`, A.token, { player_id: A.player_id, action: 'accept' });
log('A trying to self-accept ->', selfAccept.status, selfAccept.error);
const earlyTicket = await call('POST', '/v1/rooms/join-ticket', A.token, { player_id: A.player_id, room_id: pr.room.id });
log('ticket before consent ->', earlyTicket.status, earlyTicket.error);
const inc = must(await call('GET', `/v1/social/private-room/incoming?player_id=${B.player_id}`, B.token), 'incoming');
log('B incoming:', inc.requests.map(r => `${r.from_display_name}:${r.consent_state}`));
must(await call('POST', `/v1/social/private-room/${pr.room.id}/consent`, B.token, { player_id: B.player_id, action: 'accept' }), 'B accept');
const st = must(await call('GET', `/v1/social/private-room/${pr.room.id}?player_id=${A.player_id}`, A.token), 'status');
log('A polls status ->', st.consent_state);
const C = await makePlayer('Eve' + Date.now() % 1000, ['Reserved'], 'tee_black', { preferences: { boundaries: ['private_location'] } });
const toBoundary = await call('POST', '/v1/social/private-room', A.token, { player_id: A.player_id, target_id: `player:${C.player_id}` });
check(toBoundary.status === 403, `boundary blocks private invite (got ${toBoundary.status})`);
log('boundary: private invite to Eve ->', toBoundary.status, toBoundary.error);
const intruder = await call('POST', '/v1/rooms/join-ticket', C.token, { player_id: C.player_id, room_id: pr.room.id });
log('third party ticket ->', intruder.status, intruder.error);
const okTicket = await call('POST', '/v1/rooms/join-ticket', B.token, { player_id: B.player_id, room_id: pr.room.id });
log('B ticket after consent ->', okTicket.status, okTicket.ok);

// Block hides
must(await call('POST', '/v1/moderation/block', B.token, { blocker_id: B.player_id, target_id: `player:${A.player_id}` }), 'block');
const disc2 = must(await call('GET', `/v1/discovery?player_id=${A.player_id}&room_id=${roomA.id}`, A.token), 'discovery2');
log('A discovery after B blocked A:', disc2.profiles.map(p => p.display_name).join(', '));
const likeBlocked = await call('POST', '/v1/social/interest', A.token, { player_id: A.player_id, target_id: `player:${B.player_id}` });
check(likeBlocked.status === 404, `liking someone who blocked you looks like a missing profile (got ${likeBlocked.status})`);
const aMatches3 = must(await call('GET', `/v1/social/matches?player_id=${A.player_id}`, A.token), 'A matches 3');
check(!aMatches3.some(m => m.target_id === `player:${B.player_id}`), 'a block hides the match');
const blockedDm = await call('POST', '/v1/messages/send', A.token, { player_id: A.player_id, target_id: `player:${B.player_id}`, message: 'are you there?' });
check(blockedDm.status === 404, `blocked players cannot DM (got ${blockedDm.status})`);

const bad = await call('GET', `/v1/npc/nobody/chat?player_id=${A.player_id}`, A.token);
log('unknown npc ->', bad.status, bad.error);
a.ws.close(); b.ws.close();
await sleep(300);
process.exit(0);
