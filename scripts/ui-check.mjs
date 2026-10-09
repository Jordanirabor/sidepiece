// Headless UI walkthrough: creator -> city -> lounge -> NPC chat -> rooftop, with screenshots.
// Usage: npm i puppeteer-core && CHROME_PATH=/path/to/chrome SHOTS_DIR=/tmp/shots node scripts/ui-check.mjs
// (dev stack must be running with ALLOW_DEV_LOGIN=true)
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = async (name) => { await sleep(1200); await page.screenshot({ path: `${process.env.SHOTS_DIR ?? '/tmp'}/${name}.png` }); console.log('shot', name); };
const clickText = async (text) => {
  const ok = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim().includes(t) && !b.disabled);
    if (el) { el.click(); return true; } return false;
  }, text);
  if (!ok) throw new Error('no button: ' + text);
  await sleep(400);
};

await page.goto(process.env.WEB_URL ?? 'http://localhost:3001', { waitUntil: 'networkidle2' });
await shot('01-auth');

const res = await fetch((process.env.API_URL ?? 'http://localhost:4000') + '/v1/auth/dev-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ display_name: 'Jay123' }) }).then((r) => r.json());
await page.evaluate((t) => localStorage.setItem('sidepiece_token', t), res.data.token);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(800);
await clickText('Adventurous');
await clickText('Caring');
await shot('02-create-profile');
await clickText('[ Next ]');
await shot('03-build-character');
await clickText('[ Next ]');
await clickText('Glam'); await clickText('Streetwear');
await shot('04-select-outfit');
await clickText('[ Review ]');
await shot('05-identity-complete');
await clickText('Enter the city');
await sleep(2500);
await shot('06-city');

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
console.log('at door:', await walkTo('neon_lounge'));
await shot('07-city-at-door');
await page.keyboard.press('e');
await sleep(3000);
console.log('venue now:', await page.evaluate(() => window.__sp.venue));
await shot('08-lounge');
await clickText('Chat');
await sleep(800);
await page.type('.npc-chat input', "Haha you seem fun. What's your favourite spot for late night food?");
await page.keyboard.press('Enter');
await sleep(300);
await shot('09-chat-typing');
await sleep(1500);
await shot('10-chat-reply');
await page.evaluate(() => document.querySelector('.npc-chat .close').click());
await walkTo('city');
await page.keyboard.press('e');
await sleep(3000);
await walkTo('rooftop_party');
await page.keyboard.press('e');
await sleep(3000);
console.log('venue now:', await page.evaluate(() => window.__sp.venue));
await shot('11-rooftop');
console.log('errors:', errors.length ? errors.slice(0, 8) : 'none');
await browser.close();
