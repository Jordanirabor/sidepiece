// Headless UI walkthrough: creator -> city -> lounge -> NPC chat -> rooftop, with screenshots.
// Captures BOTH phone (390x844) and desktop (1440x900) viewports.
// Usage (from web/): pnpm install && CHROME_PATH=/path/to/chrome SHOTS_DIR=/tmp/shots pnpm ui-check
// (dev stack must be running with ALLOW_DEV_LOGIN=true)
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.SHOTS_DIR ?? '/tmp';
const WEB = process.env.WEB_URL ?? 'http://localhost:3001';
const API = process.env.API_URL ?? 'http://localhost:4000';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1440,900'],
});

const allErrors = [];

async function run(prefix, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.setDefaultNavigationTimeout(90000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async (name, fullPage = false) => { await sleep(1000); await page.screenshot({ path: `${SHOTS}/${prefix}-${name}.png`, fullPage }); console.log('shot', prefix, name); };
  const clickText = async (text) => {
    const ok = await page.evaluate((t) => {
      const el = [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim().includes(t) && !b.disabled);
      if (el) { el.click(); return true; } return false;
    }, text);
    if (!ok) throw new Error('no button: ' + text);
    await sleep(400);
  };
  const walkTo = async (kind) => {
    for (let i = 0; i < 60; i++) {
      const st = await page.evaluate(() => ({ pos: window.__sp.pos(), portals: window.__sp.portals }));
      const p = st.portals.find((x) => x.kind === kind);
      const dx = p.pos[0] - st.pos[0], dz = p.pos[2] - st.pos[2];
      if (Math.hypot(dx, dz) < 1.0) return st.pos;
      const keys = [];
      if (Math.abs(dz) > 0.4) keys.push(dz > 0 ? 'w' : 's');
      if (Math.abs(dx) > 0.4) keys.push(dx > 0 ? 'd' : 'a');
      for (const k of keys) await page.keyboard.down(k);
      await sleep(Math.min(400, Math.max(80, Math.hypot(dx, dz) * 120)));
      for (const k of keys) await page.keyboard.up(k);
    }
    throw new Error('could not reach ' + kind);
  };

  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  // Passes share one browser profile: start each one signed out.
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2500); // backdrop warms up
  await shot('01-welcome');
  await clickText('Privacy');
  await shot('01b-legal-privacy');
  await page.keyboard.press('Escape');
  await clickText('Create account');
  await shot('01c-account');

  const res = await fetch(API + '/v1/auth/dev-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ display_name: 'Jay123' }) }).then((r) => r.json());
  await page.evaluate((t) => localStorage.setItem('sidepiece_token', t), res.data.token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Adventurous')), { timeout: 30000 });
  await clickText('Adventurous');
  await clickText('Caring');
  await shot('02-create-profile');
  await clickText('[ Next ]');
  await shot('03-build-character');
  await clickText('[ Next ]');
  await clickText('Glam'); await clickText('Streetwear');
  await shot('04-select-outfit');
  await clickText('[ Next ]');
  await clickText('Flirt'); await clickText('Committed'); await clickText('Afrobeats'); await clickText('Rooftop parties');
  await shot('05-preferences', true);
  await clickText('[ Review ]');
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
  await sleep(800);
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
  await page.waitForSelector('.match-scrim', { timeout: 12000 });
  await shot('16-match-moment');
  await clickText('Start chat');
  await page.waitForSelector('.dm-screen', { timeout: 8000 });
  await shot('17-dm-thread');
  await page.click('input[aria-label="Message"]');
  await page.keyboard.type('Hey Tolu, saw your profile. Rooftop later?');
  await clickText('Send');
  await shot('18-dm-sent');
  await page.click('button[aria-label="Conversation controls"]');
  await shot('19-conversation-controls');
  await page.keyboard.press('Escape');
  await sleep(250);
  await page.evaluate(() => document.querySelector('button[aria-label="Back to inbox"]')?.click());
  await page.waitForSelector('.messages-panel', { timeout: 8000 });
  await shot('20-messages-inbox');
  await clickText('World');

  // Rooftop
  await walkTo('city');
  await page.keyboard.press('e');
  await sleep(3000);
  await walkTo('rooftop_party');
  await page.keyboard.press('e');
  await sleep(3000);
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

await run('phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await run('desktop', { width: 1440, height: 900 });

await browser.close();
console.log('ALL errors:', allErrors.length ? allErrors.slice(0, 12) : 'none');
