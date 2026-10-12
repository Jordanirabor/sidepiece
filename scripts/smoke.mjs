const API = process.env.API_URL ?? 'http://localhost:4002';
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
// Modular looks (ADR 0017): parts and colours save; junk colours are rejected.
const lookBase = { gender: 'female', skin_tone: 0.2, hair_color: '#111111', hair_length: 0.8, body_type: 0.5, face: [0, 0, 0, 0], top: 'dress_red', bottom: 'skirt_black', accessory: 'none', style: 'glam' };
must(await call('POST', '/v1/avatar', H.token, { player_id: H.player_id, avatar: { display_name: H.display_name, gender: 'female', likes: ['Caring'], look: { ...lookBase, hair_style: 'afro', shoes: 'heels', top_color: '#ff2f91' }, match_code: '#1' } }), 'modular look saves');
check((await call('POST', '/v1/avatar', H.token, { player_id: H.player_id, avatar: { display_name: H.display_name, gender: 'female', likes: ['Caring'], look: { ...lookBase, top_color: 'red' }, match_code: '#1' } })).status === 400, 'look colours must be #rrggbb');
console.log('looks ok: modular parts save, junk colours rejected');
const roomA = must(await call('POST', '/v1/matchmaking/join', A.token, { player_id: A.player_id, preferred_room: 'neon_lounge' }), 'join A');
const a = await connect(A, roomA, { gender: 'female', top: 'dress_red', style: 'glam', skin_tone: 0.4 });
a.ws.send(JSON.stringify({ type: 'move', x: 1.5, y: 0, z: 2, rot_y: 1 }));
await sleep(200);
const roomB = must(await call('POST', '/v1/matchmaking/join', B.token, { player_id: B.player_id, preferred_room: 'neon_lounge' }), 'join B');
log('rooms:', roomA.id, roomB.id);
check(roomA.display_name === 'Club 57', `lounge is named Club 57 (got ${roomA.display_name})`);
// Real Lagos clubs (ADR 0019): every catalog venue is joinable, unknown kinds are refused.
const quilox = must(await call('POST', '/v1/matchmaking/join', B.token, { player_id: B.player_id, preferred_room: 'quilox' }), 'join quilox');
check(quilox.display_name === 'Quilox' && quilox.id.startsWith('quilox-'), `quilox room (got ${quilox.id} ${quilox.display_name})`);
const bogus = await call('POST', '/v1/matchmaking/join', B.token, { player_id: B.player_id, preferred_room: 'nowhere' });
check(bogus.status === 400, `unknown venue is refused (got ${bogus.status})`);
must(await call('POST', '/v1/matchmaking/join', B.token, { player_id: B.player_id, preferred_room: 'neon_lounge' }), 'B back to the lounge');
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
const reopened = bInboxNew.conversations.find(c => c.target_id === `player:${A.player_id}`);
const unmutedUnread = bInboxNew.conversations.filter(c => !c.muted).reduce((n, c) => n + c.unread_count, 0);
check(reopened?.muted === true && bInboxNew.unread_count === unmutedUnread, 'muted thread keeps its unread count but stays out of the badge total');
const D = await makePlayer('Dee' + Date.now() % 1000, ['Caring'], 'tee_black');
const unmatched = await call('POST', '/v1/messages/send', A.token, { player_id: A.player_id, target_id: `player:${D.player_id}`, message: 'hello' });
check(unmatched.status === 403, `unmatched players cannot message (got ${unmatched.status})`);
log('messages ok: persisted DM, unread/read, mute (badge) / end, unmatched blocked');

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

// ---- M6: Invitations & date scenes ----
const acts = must(await call('GET', '/v1/activities'), 'activities');
check(['public_date', 'venue_visit', 'private_location'].every(id => acts.some(x => x.id === id && x.cost > 0 && x.description)), 'activity catalog covers all three invitation types with costs');
const cashOf = async (p) => must(await call('GET', `/v1/player/${p.player_id}/life`, p.token), 'life');
const invite = (from, to, activity, extra = {}) => call('POST', '/v1/invitations', from.token, { player_id: from.player_id, target_id: `player:${to.player_id}`, activity, ...extra });
const respond = (p, inv, action) => call('POST', `/v1/invitations/${inv.id}/respond`, p.token, { player_id: p.player_id, action });
const threadOf = async (p, other) => must(await call('GET', `/v1/messages/thread?player_id=${p.player_id}&target_id=player:${other.player_id}`, p.token), 'thread');
const S = await makePlayer('Sol' + Date.now() % 1000, ['Caring'], 'tee_black');
check((await invite(A, S, 'public_date')).status === 403, 'unmatched players cannot invite');
check((await invite(A, B, 'yacht_party')).status === 400, 'unknown activity -> 400');
const aCash0 = (await cashOf(A)).money;
const inv1 = must(await invite(A, B, 'public_date'), 'A invites B');
check(inv1.status === 'pending' && inv1.outgoing && inv1.label === 'Rooftop date', 'invitation starts pending');
check((await invite(A, B, 'venue_visit')).status === 409, 'only one pending invitation per pair');
const bInboxInv = must(await call('GET', `/v1/messages/inbox?player_id=${B.player_id}`, B.token), 'B inbox invite');
check(bInboxInv.conversations.find(c => c.target_id === `player:${A.player_id}`)?.pending_invite === 'Rooftop date' && bInboxInv.invite_count >= 1, 'recipient inbox flags the pending invitation');
const bSees = (await threadOf(B, A)).invitations.at(-1);
check(bSees.id === inv1.id && !bSees.outgoing && bSees.status === 'pending', 'invitation card shows in the recipient thread');
check((await respond(A, inv1, 'accept')).status === 403, 'sender cannot accept their own invitation');
check((await respond(B, inv1, 'cancel')).status === 403, 'recipient cannot cancel (they decline)');
check((await respond(S, inv1, 'accept')).status === 404, 'a third party cannot see the invitation');
const dec = must(await respond(B, inv1, 'decline'), 'B declines');
check(dec.status === 'declined', 'decline -> declined');
check((await cashOf(A)).money === aCash0, 'a declined invitation costs nothing');
check((await respond(B, inv1, 'accept')).status === 409, 'a declined invitation cannot be accepted later');
check((await invite(A, B, 'venue_visit')).status === 409, 'decline cooldown: no re-asking straight away');
must(await call('POST', '/v1/messages/send', A.token, { player_id: A.player_id, target_id: `player:${B.player_id}`, message: 'No worries! Still up for chatting.' }), 'chat after decline');
const inv2 = must(await invite(B, A, 'venue_visit'), 'B invites A');
check(must(await respond(B, inv2, 'cancel'), 'B cancels').status === 'cancelled', 'cancel -> cancelled');
check((await respond(A, inv2, 'accept')).status === 409, 'a cancelled invitation cannot be accepted');
const inv3 = must(await invite(B, A, 'venue_visit', { ttl_seconds: 1 }), 'B invites A (short ttl)');
await sleep(1500);
check((await threadOf(A, B)).invitations.find(i => i.id === inv3.id)?.status === 'expired', 'pending invitation expires');
check((await respond(A, inv3, 'accept')).status === 409, 'an expired invitation cannot be accepted');
log('invitations ok: pending, one-per-pair, decline (free, cooldown, chat continues), cancel, expire, only the right side can answer');

const bCash0 = (await cashOf(B)).money;
const inv4 = must(await invite(B, A, 'public_date'), 'B invites A to a date');
const acc = must(await respond(A, inv4, 'accept'), 'A accepts');
check(acc.status === 'accepted' && acc.date_id === inv4.id && acc.date_status === 'active', 'accept starts the date scene');
check((await cashOf(B)).money === bCash0 - inv4.cost, `sender pays ${inv4.cost} on acceptance`);
check((await respond(A, inv4, 'accept')).status === 409, 'accepting twice does nothing');
const dateUrl = `/v1/dates/${inv4.id}`;
const getDate = async (p) => must(await call('GET', `${dateUrl}?player_id=${p.player_id}`, p.token), 'date');
const choose = (p, beat, choice) => call('POST', `${dateUrl}/choose`, p.token, { player_id: p.player_id, beat, choice });
check((await call('GET', `${dateUrl}?player_id=${S.player_id}`, S.token)).status === 404, 'outsiders cannot open the date');
const d0 = await getDate(A);
check(d0.beat === 0 && d0.choices.length === 3 && d0.partner_name === B.display_name && d0.title === 'Rooftop date', 'date opens on beat 1 with three choices');
const aXp0 = (await cashOf(A)).xp; const bXp0 = (await cashOf(B)).xp;
must(await choose(A, 0, 0), 'A picks');
check((await choose(A, 0, 1)).status === 409, 'one choice per beat');
check((await choose(A, 1, 0)).status === 409, 'cannot skip ahead');
check((await choose(B, 0, 7)).status === 400, 'invalid choice -> 400');
const bWait = await getDate(B);
check(bWait.partner_ready && bWait.my_choice == null && bWait.beat === 0, 'partner choice is hidden until both pick');
const d1 = must(await choose(B, 0, 1), 'B picks');
check(d1.beat === 1 && d1.history.length === 1 && d1.history[0].delta === 4 && d1.chemistry === 4, 'beat resolves when both pick');
for (const beat of [1, 2]) { must(await choose(A, beat, 0), 'A picks'); must(await choose(B, beat, 0), 'B picks'); }
const done = await getDate(A);
check(done.status === 'completed' && done.outcome?.label === 'Sparks flew' && done.outcome.objective_met, `date completes with an outcome (${done.outcome?.label}, chemistry ${done.chemistry}/${done.chemistry_goal})`);
check((await cashOf(A)).xp === aXp0 + done.outcome.xp && (await cashOf(B)).xp === bXp0 + done.outcome.xp, 'both get the date XP exactly once');
check(done.outcome.money > 0 && done.outcome.kind === 'date' && done.outcome.partner_name === B.display_name, `date outcome pays ₦ (${done.outcome.money})`);
check(done.outcome.achievements.includes('First date') && done.outcome.reputation_delta > 0, `outcome shows unlocked achievements and reputation (${done.outcome.achievements.join(', ')}, +${done.outcome.reputation_delta})`);
check((await choose(A, 3, 0)).status === 409, 'no choices after the date ends');
must(await call('POST', `${dateUrl}/leave`, A.token, { player_id: A.player_id }), 'leave after done');
check((await getDate(A)).status === 'completed', 'leaving a finished date keeps it completed');

const inv5 = must(await invite(B, A, 'venue_visit'), 'B invites A to the lounge');
must(await respond(A, inv5, 'accept'), 'A accepts lounge');
must(await call('POST', `/v1/dates/${inv5.id}/leave`, A.token, { player_id: A.player_id }), 'A leaves');
const bLeft = must(await call('GET', `/v1/dates/${inv5.id}?player_id=${B.player_id}`, B.token), 'B sees left');
check(bLeft.status === 'left' && !bLeft.left_by_me && bLeft.title === 'Lounge night', 'partner sees the date ended neutrally');
check((await call('POST', `/v1/dates/${inv5.id}/choose`, B.token, { player_id: B.player_id, beat: 0, choice: 0 })).status === 409, 'no choices after someone leaves');
log(`dates ok: accept -> scene, sender charged, hidden picks, beats resolve, ${done.outcome.label} (+${done.outcome.xp} XP once), leave ends it for both`);

const inv6 = must(await invite(B, A, 'private_location'), 'B invites A somewhere private');
const acc6 = must(await respond(A, inv6, 'accept'), 'A accepts private');
check(acc6.room_id?.startsWith('private-'), 'private location opens a private room');
must(await call('POST', '/v1/rooms/join-ticket', A.token, { player_id: A.player_id, room_id: acc6.room_id }), 'A ticket to private room');
check((await call('POST', '/v1/rooms/join-ticket', S.token, { player_id: S.player_id, room_id: acc6.room_id })).status === 403, 'outsiders cannot enter the private room');
const npcInv = must(await call('POST', '/v1/invitations', A.token, { player_id: A.player_id, target_id: 'npc:zara', activity: 'public_date' }), 'invite Zara');
check(npcInv.status === 'declined' && npcInv.note?.includes('Keep talking'), `an NPC you barely know says not yet (${npcInv.note})`);
const E = await makePlayer('Ema' + Date.now() % 1000, ['Caring'], 'tee_black', { preferences: { boundaries: ['public_date'] } });
must(await call('POST', '/v1/social/interest', A.token, { player_id: A.player_id, target_id: `player:${E.player_id}` }), 'A likes E');
must(await call('POST', '/v1/social/interest', E.token, { player_id: E.player_id, target_id: `player:${A.player_id}` }), 'E likes A');
check((await invite(A, E, 'public_date')).status === 403, 'boundaries block that invitation type');
check(must(await invite(A, E, 'venue_visit'), 'other types still allowed').status === 'pending', 'other invitation types still go through');
log('private + npc ok: private room on accept, outsiders kept out, NPC consent follows the relationship');

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

// ---- M7: outcomes, feedback, encounters, stats ----
const fb = (p, id, tags) => call('POST', `/v1/outcomes/${id}/feedback`, p.token, { player_id: p.player_id, tags });
check((await fb(A, inv4.id, ['Rude'])).status === 400, 'unknown feedback tag -> 400');
check((await fb(A, inv4.id, [])).status === 400, 'empty feedback -> 400 (skipping sends nothing)');
check((await fb(S, inv4.id, ['Funny'])).status === 404, 'outsiders cannot leave feedback');
const aXpFb = (await cashOf(A)).xp;
const fbOut = must(await fb(A, inv4.id, ['Great vibe', 'Funny']), 'A feedback');
check(JSON.stringify(fbOut.my_feedback) === JSON.stringify(['Great vibe', 'Funny']), 'feedback updates the outcome summary');
check((await fb(A, inv4.id, ['Funny'])).status === 409, 'feedback once per activity');
check((await cashOf(A)).xp === aXpFb, 'feedback never changes rewards');
check(JSON.stringify((await getDate(B)).outcome.their_feedback) === JSON.stringify(['Great vibe', 'Funny']), "partner sees the feedback on their outcome");

const enc = (p, id, action) => action ? call('POST', `/v1/encounters/${id}/${action}`, p.token, { player_id: p.player_id }) : call('GET', `/v1/encounters/${id}?player_id=${p.player_id}`, p.token);
const encId1 = acc6.encounter_id;
check(!!encId1, 'accepting a private invitation opens an encounter');
check((await enc(S, encId1)).status === 404, 'outsiders cannot see the encounter');
const e0 = must(await enc(A, encId1), 'A opens encounter');
check(e0.status === 'waiting' && !e0.i_confirmed && !e0.partner_confirmed && e0.partner_name === B.display_name, 'encounter waits for both to confirm');
check((await enc(A, encId1, 'complete')).status === 409, 'cannot complete before both agree');
const e1 = must(await enc(A, encId1, 'confirm'), 'A confirms');
check(e1.status === 'waiting' && e1.i_confirmed && !e1.partner_confirmed, 'one confirmation is not enough');
check(must(await enc(B, encId1), 'B view').partner_confirmed, 'partner sees the confirmation');
const e2 = must(await enc(B, encId1, 'confirm'), 'B confirms');
check(e2.status === 'playing' && e2.elapsed_secs >= 0 && e2.scene_secs > 0, 'both confirmed -> scene plays');
const bLife0 = await cashOf(B);
const e3 = must(await enc(B, encId1, 'complete'), 'B completes');
check(e3.status === 'completed' && e3.outcome?.kind === 'encounter' && e3.outcome.money > 0 && !e3.outcome.repeat, `encounter outcome pays (₦${e3.outcome?.money}, +${e3.outcome?.xp} XP)`);
const aLife1 = await cashOf(A);
const again = must(await enc(A, encId1, 'complete'), 'A completes too (replay)');
check(again.status === 'completed' && again.outcome.money === e3.outcome.money, 'second complete returns the same outcome');
const aLife2 = await cashOf(A); const bLife1 = await cashOf(B);
check(aLife2.money === aLife1.money && aLife2.xp === aLife1.xp, 'replaying completion pays nothing more');
check(bLife1.xp === bLife0.xp + e3.outcome.xp, 'B got the encounter XP exactly once');
check((await enc(A, encId1, 'leave')).ok && (await enc(A, encId1)).data.status === 'completed', 'leaving after the end keeps it completed');

const privateEncounter = async () => {
  const room = must(await call('POST', '/v1/social/private-room', A.token, { player_id: A.player_id, target_id: `player:${B.player_id}` }), 'A requests room');
  const ok = must(await call('POST', `/v1/social/private-room/${room.room.id}/consent`, B.token, { player_id: B.player_id, action: 'accept' }), 'B accepts room');
  check(!!ok.encounter_id, 'world private room opens an encounter');
  return ok.encounter_id;
};
const playThrough = async (id) => { must(await enc(A, id, 'confirm'), 'A ok'); must(await enc(B, id, 'confirm'), 'B ok'); return must(await enc(A, id, 'complete'), 'complete'); };
const encId2 = must(await call('GET', `/v1/social/private-room/${pr.room.id}?player_id=${A.player_id}`, A.token), 'pr status').encounter_id;
check(!!encId2, 'the earlier accepted private room has an encounter');
const r2 = await playThrough(encId2);
check(r2.outcome.repeat && r2.outcome.money === 0 && r2.outcome.xp === 0, 'a repeat with the same partner inside 24h counts but pays nothing');
await playThrough(await privateEncounter());

const encLeft = await privateEncounter();
must(await enc(A, encLeft, 'confirm'), 'A confirms');
const left = must(await enc(B, encLeft, 'leave'), 'B leaves');
check(left.status === 'left' && left.left_by_me, 'either side can leave before the scene');
const aSeesLeft = must(await enc(A, encLeft), 'A sees left');
check(aSeesLeft.status === 'left' && !aSeesLeft.left_by_me && !aSeesLeft.outcome, 'partner sees it ended, no outcome');
check((await enc(A, encLeft, 'confirm')).status === 409 && (await enc(A, encLeft, 'complete')).status === 409, 'nothing continues after someone leaves');

const statsOf = async (p) => must(await call('GET', `/v1/player/${p.player_id}/stats`, p.token), 'stats');
const aStats = await statsOf(A);
check(aStats.body_count === 1 && aStats.total_encounters === 3, `3 encounters with 1 partner = body count 1, total 3 (got ${aStats.body_count}/${aStats.total_encounters})`);
check(aStats.dates_completed === 1 && aStats.reputation > 5 && aStats.reputation <= 10 && aStats.level_title, `stats: ${aStats.dates_completed} date, reputation ${aStats.reputation}, ${aStats.level_title}`);
check(aStats.achievements.find(x => x.id === 'after_hours')?.unlocked_at && aStats.achievements.find(x => x.id === 'first_date')?.unlocked_at, 'achievements unlocked');
check(aStats.cash_earned > 0 && aStats.cash_spent >= 0, `cash earned ₦${aStats.cash_earned}, spent ₦${aStats.cash_spent}`);
const bStats = await statsOf(B);
check(bStats.feedback.some(f => f.from_name === A.display_name && f.tags.includes('Funny')), 'rating history shows feedback received');
check((await call('GET', `/v1/player/${B.player_id}/stats`, A.token)).status === 403, "you can't read someone else's private stats");
const bPublic = (await threadOf(A, B)).stats;
check(bPublic.reputation > 5 && bPublic.level >= 1 && bPublic.body_count == null && bPublic.encounters == null, 'body count and encounters are private by default');
must(await call('POST', `/v1/player/${B.player_id}/stats/visibility`, B.token, { player_id: B.player_id, visibility: { ...bStats.visibility, body_count: true, reputation: false } }), 'B shares body count');
const bPublic2 = (await threadOf(A, B)).stats;
check(bPublic2.body_count === 1 && bPublic2.reputation == null, 'visibility toggles control what others see');
const zaraRoom = must(await call('POST', '/v1/social/private-room', A.token, { player_id: A.player_id, target_id: 'npc:zara' }), 'A asks Zara somewhere private');
check((await call('POST', `/v1/social/private-room/${zaraRoom.room.id}/consent`, A.token, { player_id: A.player_id, action: 'accept' })).status === 403, 'an NPC you barely know does not agree to a private room');
log(`encounters ok: both confirm -> scene -> outcome once, repeats pay nothing, leave ends it; stats body ${aStats.body_count} / total ${aStats.total_encounters}, rep ${aStats.reputation}`);

// ---- M8: Feed (spec 16): personal, from the event audit (async via NATS -> event worker) ----
const feedOf = async (p) => must(await call('GET', `/v1/feed?player_id=${p.player_id}`, p.token), 'feed');
const waitFeed = async (p, pred, label) => { for (let i = 0; i < 40; i++) { const f = await feedOf(p); if (pred(f)) return f; await sleep(250); } throw new Error(`check failed: ${label}`); };
const aFeed = await waitFeed(A, (f) => f.items.some((i) => i.kind === 'encounter') && f.items.some((i) => i.kind === 'achievement'), 'A feed has encounter + achievement');
check(aFeed.items.some((i) => i.kind === 'match' && i.title.includes(B.display_name) && i.action === `chat:player:${B.player_id}`), 'feed: match with B links to the chat');
check(aFeed.items.some((i) => i.kind === 'date' && i.title.includes(B.display_name) && i.body === 'Sparks flew'), 'feed: finished date with its outcome');
check(aFeed.items.filter((i) => i.action).length === aFeed.items.length, 'every feed item links somewhere');
check(aFeed.items.some((i) => i.kind === 'npc' || i.kind === 'venue'), 'feed: world posts (NPC updates / venue announcements)');
check(aFeed.unseen_count > 0, 'feed: unseen badge count');
const bFeed = await waitFeed(B, (f) => f.items.some((i) => i.kind === 'feedback'), 'B feed has feedback');
check(bFeed.items.some((i) => i.kind === 'invitation' && i.title.includes(A.display_name) && i.title.includes('Rooftop date')), 'feed: incoming invitation');
const sFeed = await feedOf(S);
check(!sFeed.items.some((i) => (i.title + i.body).includes(A.display_name) || (i.title + i.body).includes(B.display_name)), "feed never shows other people's activity");
must(await call('POST', '/v1/feed/seen', A.token, { player_id: A.player_id }), 'feed seen');
check((await feedOf(A)).unseen_count === 0, 'opening the feed clears the badge');
log(`feed ok: ${aFeed.items.length} items for A (${[...new Set(aFeed.items.map((i) => i.kind))].join(', ')}), private to each player, badge clears`);

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
check((await invite(A, B, 'venue_visit')).status === 404, 'blocked players cannot invite');
check((await call('GET', `/v1/dates/${inv4.id}?player_id=${A.player_id}`, A.token)).status === 404, 'a block hides shared dates too');
check((await enc(A, encId1)).status === 404, 'a block hides shared encounters too');
check((await fb(B, inv4.id, ['Funny'])).status === 404, 'no feedback across a block');
check(!(await feedOf(A)).items.some((i) => (i.title + i.body).includes(B.display_name)), 'a block removes them from your feed');

// ---- M8: Settings & privacy (spec 18) ----
const settingsOf = async (p) => must(await call('GET', `/v1/player/${p.player_id}/settings`, p.token), 'settings');
const bSet = await settingsOf(B);
check(bSet.email?.endsWith('@smoke.test') && bSet.member_since, 'settings show the account email and join date');
check(Object.values(bSet.notifications).every((v) => v === true), 'alerts default to on');
check(bSet.blocked.length === 1 && bSet.blocked[0].target_id === `player:${A.player_id}` && bSet.blocked[0].display_name === A.display_name, 'blocked list names who you blocked');
check((await call('GET', `/v1/player/${B.player_id}/settings`, A.token)).status === 403, 'nobody else can read your settings');
must(await call('POST', `/v1/player/${B.player_id}/settings/notifications`, B.token, { player_id: B.player_id, notifications: { messages: true, matches: false, invitations: true, feed: false } }), 'set alerts');
const bSet2 = await settingsOf(B);
check(!bSet2.notifications.feed && !bSet2.notifications.matches && bSet2.notifications.messages, 'alert preferences persist');
check((await call('POST', '/v1/moderation/unblock', A.token, { blocker_id: B.player_id, target_id: `player:${A.player_id}` })).status === 403, 'only the blocker can unblock');
must(await call('POST', '/v1/moderation/unblock', B.token, { blocker_id: B.player_id, target_id: `player:${A.player_id}` }), 'unblock');
check((await settingsOf(B)).blocked.length === 0, 'unblock empties the list');
check((await call('POST', '/v1/moderation/unblock', B.token, { blocker_id: B.player_id, target_id: `player:${A.player_id}` })).status === 404, 'unblocking twice is a 404');
check((await call('POST', '/v1/social/interest', A.token, { player_id: A.player_id, target_id: `player:${B.player_id}` })).ok, 'after an unblock they can find each other again');
// Password change
const pw = (body) => call('POST', '/v1/account/password', B.token, { player_id: B.player_id, ...body });
check((await pw({ current_password: 'wrong-password-123', new_password: 'another-good-password' })).status === 403, 'wrong current password -> 403');
check((await pw({ current_password: 'smoke-test-password', new_password: 'short' })).status === 400, 'short new password -> 400');
must(await pw({ current_password: 'smoke-test-password', new_password: 'another-good-password' }), 'change password');
check((await call('POST', '/v1/auth/login', null, { email: bSet.email, password: 'smoke-test-password' })).status === 401, 'old password stops working');
must(await call('POST', '/v1/auth/login', null, { email: bSet.email, password: 'another-good-password' }), 'login with new password');
// Account deletion
const Gone = await makePlayer('Del' + Date.now() % 1000, ['Caring'], 'tee_white');
const dEmail = (await settingsOf(Gone)).email;
must(await call('POST', '/v1/social/interest', A.token, { player_id: A.player_id, target_id: `player:${Gone.player_id}` }), 'A likes Gone');
must(await call('POST', '/v1/social/interest', Gone.token, { player_id: Gone.player_id, target_id: `player:${A.player_id}` }), 'Gone likes A');
must(await call('POST', '/v1/messages/send', Gone.token, { player_id: Gone.player_id, target_id: `player:${A.player_id}`, message: 'bye for now' }), 'Gone messages A');
must(await call('POST', '/v1/moderation/block', A.token, { blocker_id: A.player_id, target_id: `player:${Gone.player_id}` }), 'A blocks Gone');
must(await call('POST', '/v1/moderation/report', A.token, { reporter_id: A.player_id, target_id: `player:${Gone.player_id}`, reason: 'smoke', details: null }), 'A reports Gone');
const del = (p, body) => call('POST', '/v1/account/delete', p.token, { player_id: Gone.player_id, ...body });
check((await del(Gone, { password: 'smoke-test-password', confirm: 'delete' })).status === 400, 'deletion needs the word DELETE');
check((await del(Gone, { password: 'nope-nope-nope', confirm: 'DELETE' })).status === 403, 'deletion needs the password');
check((await del(A, { password: 'smoke-test-password', confirm: 'DELETE' })).status === 403, "nobody can delete someone else's account");
must(await del(Gone, { password: 'smoke-test-password', confirm: 'DELETE' }), 'delete account');
check((await call('GET', '/v1/auth/verify', Gone.token)).status === 401, "a deleted account's session can't be restored");
check((await call('POST', '/v1/auth/login', null, { email: dEmail, password: 'smoke-test-password' })).status === 401, 'a deleted account cannot sign in');
check(!must(await call('GET', `/v1/social/matches?player_id=${A.player_id}`, A.token), 'A matches 4').some((m) => m.target_id === `player:${Gone.player_id}`), 'their matches are gone for the other side');
check(!must(await call('GET', `/v1/messages/inbox?player_id=${A.player_id}`, A.token), 'A inbox 4').conversations.some((c) => c.target_id === `player:${Gone.player_id}`), 'their messages are gone for the other side');
check(!(await settingsOf(A)).blocked.some((b) => b.target_id === `player:${Gone.player_id}`), "they leave others' blocked lists");
const reRegistered = await call('POST', '/v1/auth/register', null, { email: dEmail, password: 'smoke-test-password', display_name: 'Again', date_of_birth: '1995-05-05', accept_terms: true });
check(reRegistered.ok, 'the email can be used again after deletion');
log('settings ok: alerts persist, blocked list + unblock, password change, account deletion cleans both sides');

const bad = await call('GET', `/v1/npc/nobody/chat?player_id=${A.player_id}`, A.token);
log('unknown npc ->', bad.status, bad.error);
a.ws.close(); b.ws.close();
await sleep(300);
process.exit(0);
