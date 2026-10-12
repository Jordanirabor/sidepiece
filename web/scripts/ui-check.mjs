// Headless UI walkthrough: creator -> city -> lounge -> NPC chat -> discover -> match -> DMs -> invitation -> date -> outcome
// -> private encounter -> stats -> feed -> settings -> go out -> rooftop.
// Captures BOTH phone (390x844) and desktop (1440x900) viewports.
// Usage (from web/): pnpm install && CHROME_PATH=/path/to/chrome SHOTS_DIR=/tmp/shots pnpm ui-check
// (dev stack must be running with ALLOW_DEV_LOGIN=true). UI_ONLY=phone|desktop runs a single viewport.
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.SHOTS_DIR ?? '/tmp';
const WEB = process.env.WEB_URL ?? 'http://localhost:4001';
const API = process.env.API_URL ?? 'http://localhost:4002';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  // UI_GPU=1 renders on the real GPU (ANGLE/Metal on macOS): far less memory than SwiftShader and closer to a
  // real device. Default stays SwiftShader so it also works on GPU-less CI machines.
  args: process.env.UI_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1440,900'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1440,900'],
});

const allErrors = [];
let currentPage;

async function run(prefix, viewport, sink) {
  const page = await browser.newPage();
  currentPage = page;
  await page.setViewport(viewport);
  page.setDefaultNavigationTimeout(90000);
  const errors = sink;
  errors.length = 0;
  let lastShot = 'start';
  page.on('pageerror', (e) => errors.push(`[after ${lastShot}] ${e.message} @ ${(e.stack ?? '').split('\n').slice(1, 3).map((l) => l.trim()).join(' < ')}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[after ${lastShot}] ${m.text()}`); });
  const shot = async (name, fullPage = false) => { await sleep(1000); await page.screenshot({ path: `${SHOTS}/${prefix}-${name}.png`, fullPage }); lastShot = name; console.log('shot', prefix, name); };
  const clickText = async (text) => {
    const ok = await page.evaluate((t) => {
      const el = [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim().includes(t) && !b.disabled);
      if (el) { el.click(); return true; } return false;
    }, text);
    if (!ok) throw new Error('no button: ' + text);
    await sleep(400);
  };
  const walkTo = async (kind) => {
    for (let i = 0; i < 700; i++) { // the open city is ~110 m from spawn to a door; headless renders slowly
      const st = await page.evaluate(() => ({ pos: window.__sp.pos(), portals: window.__sp.portals, alpha: window.__sp.camAlpha?.() ?? -Math.PI / 2 }));
      const p = st.portals.find((x) => x.kind === kind);
      const dx = p.pos[0] - st.pos[0], dz = p.pos[2] - st.pos[2];
      if (Math.hypot(dx, dz) < 1.0) return st.pos;
      // Movement is camera-relative: project the offset onto the camera's forward and right (the city starts facing west).
      const fwd = [-Math.cos(st.alpha), -Math.sin(st.alpha)];
      const ahead = dx * fwd[0] + dz * fwd[1];
      const side = dx * fwd[1] - dz * fwd[0];
      const keys = [];
      if (Math.abs(ahead) > 0.4) keys.push(ahead > 0 ? 'w' : 's');
      if (Math.abs(side) > 0.4) keys.push(side > 0 ? 'd' : 'a');
      for (const k of keys) await page.keyboard.down(k);
      await sleep(Math.min(400, Math.max(80, Math.hypot(dx, dz) * 120)));
      for (const k of keys) await page.keyboard.up(k);
    }
    const st = await page.evaluate(() => ({ pos: window.__sp.pos(), portals: window.__sp.portals, venue: window.__sp.venue }));
    throw new Error(`could not reach ${kind}: at ${st.pos.map((v) => v.toFixed(1))} in ${st.venue}, portals ${JSON.stringify(st.portals)}`);
  };

  // Cold Vite loads can be slow on a busy machine: one retry before giving up.
  await page.goto(WEB, { waitUntil: 'domcontentloaded' }).catch(() => page.goto(WEB, { waitUntil: 'domcontentloaded' }));
  // Passes share one browser profile: start each one signed out.
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2500); // backdrop warms up
  await shot('01-welcome');
  await clickText('Privacy');
  await shot('01b-legal-privacy');
  await page.keyboard.press('Escape');
  await clickText('Get in');
  await shot('01c-account');
  await clickText('Sign in');
  await shot('01d-sign-in');

  const res = await fetch(API + '/v1/auth/dev-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ display_name: 'Jay123' }) }).then((r) => r.json());
  await page.evaluate((t) => localStorage.setItem('sidepiece_token', t), res.data.token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Adventurous')), { timeout: 30000 });
  await clickText('Adventurous');
  await clickText('Caring');
  await shot('02-create-profile');
  await clickText('Next');
  await shot('03-build-character');
  await clickText('Next');
  await clickText('Glam'); await clickText('Streetwear');
  await shot('04-select-outfit');
  await clickText('Next');
  await clickText('Flirt'); await clickText('Committed'); await clickText('Afrobeats'); await clickText('Rooftop parties');
  await shot('05-preferences', true);
  await clickText('Review');
  await page.type('.public-preview textarea', 'Lekki girl at heart. Suya over everything.');
  await shot('05b-identity-complete', true);
  await clickText('Enter the city');
  await sleep(2500);
  await shot('06-city');

  await walkTo('neon_lounge');
  await shot('07-city-at-door');
  await page.keyboard.press('e');
  await sleep(3000);
  await shot('08-lounge');

  // Nearby sheet
  await clickText('Nearby');
  await shot('09-nearby-sheet');
  await clickText('Chat');
  await page.waitForSelector('.npc-chat input', { timeout: 15000 });
  await page.type('.npc-chat input', "Haha you seem fun. What's your favourite spot for late night food?");
  await page.keyboard.press('Enter');
  await sleep(300);
  await shot('10-chat-typing');
  await sleep(1500);
  await shot('11-chat-reply');
  await page.evaluate(() => document.querySelector('.npc-chat .close')?.click());

  // Profile tab, then edit preferences from Profile and cancel back to the world
  await clickText('Profile');
  await shot('12-profile');
  await clickText('Edit preferences');
  await shot('12b-edit-preferences');
  await page.evaluate(() => document.querySelector('.creator-cancel').click());
  await sleep(3000);
  if (!(await page.evaluate(() => !!document.querySelector('main.shell')))) throw new Error('cancel did not return to the world');
  await clickText('World');

  // Discover (07) -> profile detail (07A) -> like / pass
  await clickText('Discover');
  await sleep(1500);
  await shot('14-discover-deck');
  await page.click('button[aria-label="View profile"]');
  await shot('15-profile-detail');
  await clickText('Express interest');
  await sleep(800);
  await page.click('button[aria-label="Pass"]');
  await sleep(800);
  await page.keyboard.press('Escape');

  // Match moment (08), triggered by the OTHER side: a helper player likes us back.
  const token = await page.evaluate(() => localStorage.getItem('sidepiece_token'));
  const me = await fetch(API + '/v1/auth/verify', { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
  const email = `helper.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@ui.test`;
  const helper = await fetch(API + '/v1/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'ui-check-password', display_name: 'Tolu', date_of_birth: '1996-02-02', accept_terms: true }) }).then((r) => r.json());
  const hpost = (path, body) => fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${helper.data.token}` }, body: JSON.stringify(body) }).then((r) => r.json());
  const mpost = (path, body) => fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then((r) => r.json());
  await hpost('/v1/avatar', { player_id: helper.data.player_id, avatar: { display_name: 'Tolu', gender: 'female', likes: ['Caring'], bio: 'Amapiano and good jollof.', look: { gender: 'female', skin_tone: 0.2, hair_color: '#1a1110', hair_length: 0.85, body_type: 0.5, face: [0, 0, 0, 0], top: 'dress_red', bottom: 'jeans', accessory: 'none', style: 'glam' }, match_code: '#2' } });
  await mpost('/v1/social/interest', { player_id: me.data.player_id, target_id: `player:${helper.data.player_id}` });
  const back = await hpost('/v1/social/interest', { player_id: helper.data.player_id, target_id: `player:${me.data.player_id}` });
  if (!back.data?.matched) throw new Error('helper like-back did not match');
  await page.waitForSelector('.match-scrim', { timeout: 20000 });
  await shot('16-match-moment');
  await clickText('Start chat');
  await page.waitForSelector('.dm-screen', { timeout: 8000 });
  await shot('17-dm-thread');
  await page.click('input[aria-label="Message"]');
  await page.keyboard.type('Hey Tolu, saw your profile. Rooftop later?');
  await clickText('Send');
  await shot('18-dm-sent');
  // Header profile shortcut (09): same avatar + presence sheet
  await page.click('.dm-person');
  await page.waitForSelector('.dm-profile', { timeout: 8000 });
  await shot('18b-dm-profile');
  await page.keyboard.press('Escape');
  await sleep(250);
  // Controls (09A): explained, and End asks for confirmation (cancelled here)
  await page.click('button[aria-label="Conversation controls"]');
  await shot('19-conversation-controls');
  await clickText('End conversation');
  await page.waitForSelector('.dialog[aria-label^="End conversation"]', { timeout: 4000 });
  await shot('19b-end-confirm');
  await page.keyboard.press('Escape');
  await sleep(250);

  // M6: Suggest activity (10) -> in-chat invitation (11) -> date scene (12) -> outcome
  const hget = (path) => fetch(API + path, { headers: { authorization: `Bearer ${helper.data.token}` } }).then((r) => r.json());
  const hid = helper.data.player_id;
  const myId = me.data.player_id;
  await clickText('Make plans');
  await page.waitForSelector('.activity-list', { timeout: 4000 });
  await clickText('Rooftop date');
  await shot('21-suggest-sheet');
  await clickText('Send invitation');
  await page.waitForSelector('.invite-row.out .state-pill.pending', { timeout: 6000 });
  await shot('22-invite-pending');
  const hThread = await hget(`/v1/messages/thread?player_id=${hid}&target_id=player:${myId}`);
  const inv = hThread.data.invitations.at(-1);
  await hpost(`/v1/invitations/${inv.id}/respond`, { player_id: hid, action: 'accept' });
  // The helper is API-only; a real client polls the date every 2 s, so heartbeat like one (drop-off detection).
  const helperBeat = setInterval(() => hget(`/v1/dates/${inv.id}?player_id=${hid}`).catch(() => {}), 4000);
  await page.waitForSelector('.date-screen', { timeout: 12000 }); // the sender's thread poll sees "accepted"
  await sleep(4000); // avatars load
  await shot('23-date-scene');
  await page.click('.date-choice');
  await shot('24-date-waiting');
  const hchoose = (beat, choice) => hpost(`/v1/dates/${inv.id}/choose`, { player_id: hid, beat, choice });
  await hchoose(0, 1);
  await page.waitForFunction(() => !!document.querySelector('.date-recap'), { timeout: 8000 });
  await shot('25-date-beat-2');
  for (const beat of [1, 2]) {
    await page.waitForFunction(() => [...document.querySelectorAll('.date-choice')].some((b) => !b.disabled), { timeout: 8000 });
    await page.click('.date-choice');
    await hchoose(beat, 0);
    await sleep(2500);
  }
  await page.waitForSelector('.date-outcome', { timeout: 8000 });
  clearInterval(helperBeat);
  await shot('26-date-outcome');
  // Outcome (14): optional feedback updates the summary; rewards don't change.
  await clickText('Great vibe');
  await clickText('Send feedback');
  await page.waitForSelector('.feedback-done', { timeout: 6000 });
  await shot('26b-outcome-feedback');
  await clickText('Continue');
  await page.waitForFunction(() => !document.querySelector('.date-screen'), { timeout: 8000 });
  await shot('27-thread-after-date');
  // Incoming invitation: accept, then Leave (confirmed) returns to the chat with no penalty.
  await hpost('/v1/invitations', { player_id: hid, target_id: `player:${myId}`, activity: 'venue_visit' });
  await page.waitForSelector('.invite-row.in .state-pill.pending', { timeout: 8000 });
  await shot('28-invite-incoming');
  await clickText('Accept');
  await page.waitForSelector('.date-screen', { timeout: 20000 });
  await hget(`/v1/dates/${(await hget(`/v1/messages/thread?player_id=${hid}&target_id=player:${myId}`)).data.invitations.at(-1).id}?player_id=${hid}`);
  await sleep(4000);
  await shot('29-lounge-date');
  await page.click('.date-leave');
  await page.waitForSelector('.dialog', { timeout: 4000 });
  await shot('30-leave-confirm');
  await page.evaluate(() => [...document.querySelectorAll('.dialog button')].find((b) => b.textContent.trim() === 'Leave')?.click());
  // The thread stays mounted under the date, so wait for the date itself to close.
  await page.waitForFunction(() => !document.querySelector('.date-screen') && !!document.querySelector('.dm-screen'), { timeout: 8000 })
    .catch(() => { throw new Error(`${prefix}: date still open after Leave`); });
  await shot('31-back-in-chat');
  await page.evaluate(() => document.querySelector('button[aria-label="Back to inbox"]')?.click());
  await page.waitForSelector('.messages-panel', { timeout: 8000 });
  await sleep(3500); // longer than one thread poll: Back must stick
  if (await page.$('.dm-screen')) throw new Error(`${prefix}: thread reopened after Back`);
  await shot('20-messages-inbox');

  // M7: private invitation -> encounter (13): both confirm -> scene -> Skip -> outcome (14) -> stats (15/15A)
  await hpost('/v1/invitations', { player_id: hid, target_id: `player:${myId}`, activity: 'private_location' });
  await page.click('.inbox-row');
  await page.waitForSelector('.invite-row.in .state-pill.pending', { timeout: 8000 });
  await clickText('Accept');
  await page.waitForSelector('.encounter-screen', { timeout: 20000 }); // phone passes on a busy machine can be slow
  await sleep(4000); // avatars load
  await shot('32-encounter-consent');
  await clickText("I'm ready");
  await page.waitForSelector('.consent-status span.ok', { timeout: 6000 });
  await shot('33-encounter-waiting');
  const encId = (await hget(`/v1/messages/thread?player_id=${hid}&target_id=player:${myId}`)).data.invitations.at(-1).encounter_id;
  const encBeat = setInterval(() => hget(`/v1/encounters/${encId}?player_id=${hid}`).catch(() => {}), 4000);
  await hpost(`/v1/encounters/${encId}/confirm`, { player_id: hid });
  await page.waitForSelector('.encounter-line', { timeout: 8000 });
  await sleep(4500);
  await shot('34-encounter-scene');
  await sleep(3000);
  await shot('35-encounter-fade');
  // Skip if the scene is still playing (a slow pass may already have reached the end on its own).
  await page.evaluate(() => document.querySelector('.encounter-skip')?.click());
  await page.waitForSelector('.encounter-screen .outcome-card', { timeout: 10000 });
  clearInterval(encBeat);
  await shot('36-encounter-outcome');
  await hpost(`/v1/outcomes/${encId}/feedback`, { player_id: hid, tags: ['Respectful', 'Would meet again'] });
  await clickText('See your stats');
  await page.waitForSelector('.stats-detail', { timeout: 15000 });
  await shot('37-stats-detail');
  await page.evaluate(() => document.querySelector('.sheet-body')?.scrollTo(0, 99999));
  await shot('37b-stats-visibility');
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('.sheet-scrim')?.click());
  await sleep(500);
  await page.waitForSelector('.stats-hero .stats-grid', { timeout: 8000 });
  await page.evaluate(() => document.querySelector('.stats-hero')?.scrollIntoView({ block: 'center' }));
  await shot('38-profile-stats');
  // M8: Feed (16): personal items + world posts; every item links somewhere (achievement -> stats)
  await clickText('Feed');
  await page.waitForSelector('.feed-row.kind-achievement', { timeout: 20000 }); // events reach the audit via NATS
  await shot('39-feed');
  // One in-page step: the feed's poll can re-render the list between finding a row and clicking it.
  await page.evaluate(() => document.querySelector('.feed-row.kind-achievement')?.click());
  await page.waitForSelector('.stats-detail', { timeout: 15000 });
  await shot('39b-feed-to-stats');
  await page.keyboard.press('Escape');
  await sleep(400);
  // M8: Settings & privacy (18): visibility, alerts, blocked list + unblock, help, delete-account confirmation
  await fetch(API + '/v1/moderation/block', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ blocker_id: me.data.player_id, target_id: 'npc:kai' }) });
  await clickText('Profile');
  await page.click('button[aria-label="Settings & privacy"]');
  await page.waitForSelector('.settings .blocked-list', { timeout: 10000 });
  await shot('40-settings');
  await page.evaluate(() => document.querySelector('.settings .blocked-list')?.scrollIntoView({ block: 'center' }));
  await shot('40b-settings-alerts-blocked');
  await page.evaluate(() => [...document.querySelectorAll('.settings .switch-row')].find((r) => r.textContent.includes('Feed activity'))?.querySelector('input')?.click());
  await sleep(600);
  await page.evaluate(() => document.querySelector('.blocked-list button')?.click());
  await page.waitForSelector('.dialog', { timeout: 5000 });
  await shot('40c-unblock-confirm');
  await page.evaluate(() => document.querySelector('.dialog-actions button:last-child')?.click());
  await page.waitForFunction(() => !document.querySelector('.settings .blocked-list'), { timeout: 10000 });
  await clickText('Delete account');
  await page.evaluate(() => document.querySelector('.danger-zone')?.scrollIntoView({ block: 'end' }));
  await shot('40d-delete-confirm');
  await clickText('Keep my account');
  await page.keyboard.press('Escape');
  await sleep(400);
  await clickText('World');

  // Go out (ADR 0019): the club list by area, then a ride straight to Sky Garden's rooftop.
  await clickText('Go out');
  await shot('13a-go-out', true);
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.place-card')].find((c) => c.querySelector('strong')?.textContent === 'Sky Garden');
    [...card.querySelectorAll('button')].find((b) => b.textContent.includes('Ride')).click();
  });
  await page.waitForFunction(() => window.__sp?.venue === 'rooftop_party', { timeout: 30000 });
  await sleep(4000);
  await shot('13-rooftop');

  // No horizontal scroll check
  const layoutWidth = await page.evaluate(() => document.documentElement.clientWidth);
  if (layoutWidth !== viewport.width) throw new Error(`${prefix}: page laid out at ${layoutWidth}px, viewport is ${viewport.width}px (missing/broken viewport meta?)`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(prefix, 'h-overflow px:', overflow);
  console.log(prefix, 'errors:', errors.length ? errors.slice(0, 8) : 'none');
  allErrors.push(...errors.map((e) => `${prefix}: ${e}`));
  await page.close();
}

const pageErrors = [];
async function pass(prefix, viewport) {
  try {
    await run(prefix, viewport, pageErrors);
  } catch (err) {
    // A failed step usually has a page error behind it: print those, not just the timeout.
    console.log(prefix, 'FAILED:', err.message, '\npage errors:', pageErrors.length ? pageErrors.slice(-8) : 'none');
    await currentPage?.screenshot({ path: `${SHOTS}/${prefix}-FAILED.png` }).catch(() => {});
    console.log('toasts:', await currentPage?.evaluate(() => document.querySelector('.toast-stack')?.innerText).catch(() => '?'));
    await browser.close();
    process.exit(1);
  }
}
// UI_ONLY=phone|desktop runs one viewport (lower peak memory on a busy machine; run both before calling it done).
const only = process.env.UI_ONLY;
if (!only || only === 'phone') await pass('phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
if (!only || only === 'desktop') await pass('desktop', { width: 1440, height: 900 });

await browser.close();
console.log('ALL errors:', allErrors.length ? allErrors.slice(0, 12) : 'none');
