/**
 * DinoRUSH end-to-end tests (Playwright + Chromium).
 * Runs against the production build (`npm run build` first) served by
 * `vite preview`. Covers the 20 acceptance scenarios from the brief.
 *
 *   npm run build && npm run e2e
 */
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'e2e', 'out');
mkdirSync(OUT, { recursive: true });
const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const results = [];

function record(id, name, pass, detail = '') {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  T${id} ${name}${detail ? '  — ' + detail : ''}`);
}

async function test(id, name, fn) {
  try {
    const detail = await fn();
    record(id, name, true, detail ?? '');
  } catch (e) {
    record(id, name, false, String(e && e.message ? e.message : e).split('\n')[0]);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const LAUNCH = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] };

async function newPage(browser, { timescale = 1, viewport = { width: 1180, height: 820 }, device } = {}) {
  const ctx = await browser.newContext(device ? { ...device } : { viewport, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(e.message));
  await page.goto(`${BASE}?timescale=${timescale}`);
  await page.waitForFunction(() => !!window.__dinorush);
  // skip the first-launch tutorial offer if shown
  await page.evaluate(() => window.__dinorush.store.finishTutorialOffer(true));
  return { ctx, page };
}

/** Real touch through CDP at the centre of an element. */
async function touch(page, testId) {
  const box = await page.getByTestId(testId).boundingBox();
  assert(box, `no element ${testId}`);
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Several simultaneous fingers (true multi-touch). */
async function multiTouch(page, testIds) {
  const pts = [];
  for (const [i, id] of testIds.entries()) {
    const b = await page.getByTestId(id).boundingBox();
    assert(b, `no element ${id}`);
    pts.push({ x: b.x + b.width / 2, y: b.y + b.height / 2, id: i + 1 });
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function startRace(page, setup, seed) {
  await page.evaluate(([setup, seed]) => {
    window.__race = null;
    window.__dinorush.store.startRace(seed ?? undefined, setup);
  }, [setup, seed ?? null]);
  await page.waitForFunction(() => window.__race && window.__race.engine && document.querySelector('[data-testid="race-screen"]'));
  // record events + popups for assertions
  await page.evaluate(() => {
    window.__events = [];
    window.__popups = [];
    const ctrl = window.__race;
    ctrl.subscribe((evs) => window.__events.push(...evs));
    const obs = new MutationObserver(() => {
      document.querySelectorAll('.popup').forEach((el) => {
        if (!el.dataset.seen) {
          el.dataset.seen = '1';
          window.__popups.push(el.textContent);
        }
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
}

/** In-page bot: taps the right dino button (DOM pointer events) for given seats. */
async function startBot(page, ids, leadSeconds = 0.6) {
  await page.evaluate(
    ([ids, lead]) => {
      clearInterval(window.__bot);
      window.__bot = setInterval(() => {
        const c = window.__race;
        if (!c || c.paused) return;
        const s = c.engine.state;
        if (s.phase !== 'racing') return;
        for (const id of ids) {
          const p = s.participants.find((x) => x.id === id);
          if (!p || p.finished) continue;
          const segs = s.track.segments;
          const seg = segs[p.segmentIndex];
          let next = null;
          for (let i = p.segmentIndex + 1; i < segs.length; i++) {
            if (segs[i].start - p.position > 300) break;
            if (segs[i].recommended !== seg.recommended) {
              next = segs[i];
              break;
            }
          }
          let target = null;
          if (p.current !== seg.recommended && !p.prepared) target = seg.recommended;
          if (next && (next.start - p.position) / Math.max(1, p.speed) <= lead) target = next.recommended;
          if (target && target !== p.current) {
            const btn = document.querySelector(`[data-testid="dino-btn-${p.seat}-${target}"]`);
            if (btn) btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 20 + p.seat, pointerType: 'touch', isPrimary: true }));
          }
        }
      }, 25);
    },
    [ids, leadSeconds],
  );
}

const solo = { mode: 'classic', humans: 1, names: ['Ema'], worldId: 'jungle', difficulty: 'racer' };

async function waitResults(page, timeout = 240000) {
  await page.getByTestId('results').waitFor({ timeout });
}

// ---------------------------------------------------------------------------

async function main() {
  const server = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1500));
  const browser = await chromium.launch(LAUNCH);
  try {
    // ---------------------------------------------------------------- T1, T2
    const { page: p1, ctx: c1 } = await newPage(browser, { timescale: 1 });
    await test(1, 'Spuštění aplikace a hlavní menu', async () => {
      await p1.getByTestId('main-menu').waitFor();
      await p1.getByTestId('logo').waitFor();
      await p1.getByTestId('play').waitFor();
      await p1.screenshot({ path: join(OUT, 't01-menu.png') });
      return 'menu, logo a tlačítko HRÁT viditelné';
    });
    await test(2, 'Závod jednoho hráče proti dvěma AI (přes UI)', async () => {
      await p1.getByTestId('play').click({ force: true });
      await p1.getByTestId('mode-classic').click({ force: true });
      await p1.getByTestId('players-1').click({ force: true });
      await p1.getByTestId('players-next').click({ force: true });
      await p1.getByTestId('world-jungle').click({ force: true });
      await p1.getByTestId('difficulty-racer').click({ force: true });
      await p1.getByTestId('start-race').click({ force: true });
      await p1.waitForFunction(() => window.__race && window.__race.engine.state.phase === 'racing', null, { timeout: 20000 });
      const info = await p1.evaluate(() => window.__race.engine.state.participants.map((p) => p.kind));
      assert(info.filter((k) => k === 'ai').length === 2 && info.filter((k) => k === 'human').length === 1, 'participants ' + info);
      // wait for 2 s of simulated race time (independent of how fast the test machine renders)
      await p1.waitForFunction(() => window.__race.engine.state.time > 2, null, { timeout: 30000 });
      const pos = await p1.evaluate(() => window.__race.engine.state.participants.map((p) => p.position));
      assert(pos.every((x) => x > 5), 'racers are moving automatically ' + pos);
      await p1.screenshot({ path: join(OUT, 't02-race.png') });
      const fps = await p1.evaluate(
        () =>
          new Promise((res) => {
            let n = 0;
            const t0 = performance.now();
            const f = () => (performance.now() - t0 < 2000 ? (n++, requestAnimationFrame(f)) : res(n / 2));
            requestAnimationFrame(f);
          }),
      );
      return `účastníci: ${info.join(', ')}; pozice ${pos.map((x) => x.toFixed(1)).join(' / ')} m; headless FPS ≈ ${fps}`;
    });
    await c1.close();

    // ------------------------------------------------- T3–T9, T14 (2 humans + AI)
    const { page: p2, ctx: c2 } = await newPage(browser, { timescale: 2 });
    const waterSeed = await p2.evaluate(() => {
      for (let s = 1000; s < 9000; s++) {
        const t = window.__dinorush.generateTrack({ seed: s, worldId: 'jungle', difficulty: 'racer' });
        const w = t.segments[1];
        const n = t.segments[2];
        if (w.terrain === 'water' && !w.event && w.end - w.start > 40 && n && n.recommended !== 'raptor') return s;
      }
      return -1;
    });
    const coinsBefore = await p2.evaluate(() => window.__dinorush.store.get().profile.coins);
    await startRace(p2, { mode: 'classic', humans: 2, names: ['Ema', 'Ben'], worldId: 'jungle', difficulty: 'racer' }, waterSeed);
    await test(14, 'Závod dvou lidských hráčů proti AI', async () => {
      const kinds = await p2.evaluate(() => window.__race.engine.state.participants.map((p) => `${p.id}:${p.kind}`));
      assert(kinds.join(',') === 'p0:human,ai0:ai,p1:human', kinds.join(','));
      assert((await p2.getByTestId('panel-0').count()) === 1 && (await p2.getByTestId('panel-1').count()) === 1, 'two panels');
      const norm = await p2.evaluate(() => window.__race.engine.state.config.normalizeStats);
      assert(norm === true, 'stats normalised for fairness');
      return 'lanes: ' + kinds.join(', ') + '; RPG normalizace zapnuta';
    });
    await test(3, 'Přepnutí Velociraptora na Spinosaura před vodou', async () => {
      // prepare the finger before waiting so the tap is not delayed by round-trips
      const box = await p2.getByTestId('dino-btn-0-spino').boundingBox();
      const cdp = await p2.context().newCDPSession(p2);
      await p2.evaluate(() => {
        const e = window.__race.engine;
        e.onEvent = (ev) => {
          if (ev.type === 'switch' && ev.participantId === 'p0' && !window.__switchTtc) {
            const p = e.participant('p0');
            window.__switchTtc = (e.state.track.segments[1].start - p.position) / Math.max(1, p.speed);
          }
        };
      });
      await p2.waitForFunction(
        () => {
          const e = window.__race.engine;
          const p = e.participant('p0');
          const w = e.state.track.segments[1];
          return e.state.phase === 'racing' && (w.start - p.position) / Math.max(1, p.speed) <= 0.9;
        },
        null,
        { timeout: 30000, polling: 'raf' },
      );
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await p2.waitForTimeout(100);
      const cur = await p2.evaluate(() => window.__race.engine.participant('p0').current);
      assert(cur === 'spino', 'current ' + cur);
      const active = await p2.getByTestId('dino-btn-0-spino').getAttribute('data-active');
      assert(active === '1', 'button highlighted');
      await p2.waitForFunction(() => window.__race.engine.participant('p0').position > window.__race.engine.state.track.segments[1].start + 12, null, { timeout: 20000 });
      const sp = await p2.evaluate(() => window.__race.engine.participant('p0').speed);
      assert(sp > 11.5, 'speed in water ' + sp);
      await p2.screenshot({ path: join(OUT, 't03-water.png') });
      const ttc = await p2.evaluate(() => window.__switchTtc);
      return `přepnuto ${ttc.toFixed(2)} s před vodou; rychlost Spinosaura ve vodě ${sp.toFixed(1)} m/s`;
    });
    await test(4, 'Zpomalení při nesprávném dinosaurovi', async () => {
      await p2.waitForFunction(() => window.__race.engine.participant('p1').position > window.__race.engine.state.track.segments[1].start + 12, null, { timeout: 20000 });
      const r = await p2.evaluate(() => {
        const p = window.__race.engine.participant('p1');
        return { cur: p.current, speed: p.speed, factor: p.terrainFactor };
      });
      assert(r.cur === 'raptor' && r.speed < 7.5, JSON.stringify(r));
      return `Velociraptor ve vodě ${r.speed.toFixed(1)} m/s (násobič ${r.factor.toFixed(2)})`;
    });
    await test(5, 'Perfektní proměna', async () => {
      const r = await p2.evaluate(() => ({
        perfects: window.__race.engine.participant('p0').perfects,
        ev: window.__events.filter((e) => e.type === 'perfect' && e.participantId === 'p0').length,
        popups: window.__popups,
      }));
      assert(r.perfects >= 1 && r.ev >= 1, JSON.stringify(r));
      assert(r.popups.some((t) => t.includes('PERFEKTNÍ')), 'popup shown');
      return 'událost perfect + nápis „PERFEKTNÍ PROMĚNA!“';
    });
    await startBot(p2, ['p0', 'p1']);
    await test(6, 'Kombo po třech správných úsecích', async () => {
      await p2.waitForFunction(() => window.__events.some((e) => e.type === 'combo' && e.participantId === 'p0' && e.value === 3), null, { timeout: 90000 });
      const r = await p2.evaluate(() => ({
        turbo: window.__events.some((e) => e.type === 'turbo' && e.participantId === 'p0'),
        popups: window.__popups.filter((t) => t.startsWith('COMBO')),
      }));
      assert(r.turbo, 'turbo activated');
      assert(r.popups.includes('COMBO 3×'), 'popup ' + r.popups);
      return 'COMBO 3× + turbo';
    });
    await test(7, 'Automatická aktivace speciální schopnosti', async () => {
      await p2.waitForFunction(() => window.__events.some((e) => e.type === 'abilityActivated' && e.participantId === 'p0'), null, { timeout: 120000 });
      const a = await p2.evaluate(() => window.__events.find((e) => e.type === 'abilityActivated' && e.participantId === 'p0').archetype);
      return 'schopnost aktivována: ' + a;
    });
    await test(8, 'Dokončení závodu a správné pořadí', async () => {
      await waitResults(p2);
      const res = await p2.evaluate(() => window.__dinorush.store.get().last.result.results.map((r) => ({ id: r.id, place: r.place, t: r.finishTime })));
      for (let i = 1; i < res.length; i++) assert(res[i].t >= res[i - 1].t, 'order by time ' + JSON.stringify(res));
      res.forEach((r, i) => assert(r.place === i + 1, 'places'));
      const podium1 = await p2.getByTestId('podium-1').textContent();
      const firstName = await p2.evaluate(() => window.__dinorush.store.get().last.result.results[0].name);
      assert(podium1.includes(firstName), 'podium shows winner');
      await p2.screenshot({ path: join(OUT, 't08-results.png') });
      return res.map((r) => `${r.place}. ${r.id} ${r.t.toFixed(1)} s`).join(', ');
    });
    await test(9, 'Připsání odměn', async () => {
      const r = await p2.evaluate(() => {
        const st = window.__dinorush.store.get();
        const missionCoins = st.last.rewards.missions.reduce((a, m) => a + m.reward.coins, 0);
        return { coins: st.profile.coins, total: st.last.rewards.totalCoins, missionCoins, xp: st.profile.dinos['raptor-green'].xp };
      });
      assert(r.coins === coinsBefore + r.total + r.missionCoins, JSON.stringify({ coinsBefore, ...r }));
      assert(r.total >= 200 && r.xp > 0, 'coins for 2 players and XP');
      return `mince ${coinsBefore} → ${r.coins} (+${r.total} závod, +${r.missionCoins} úkoly), XP raptor ${r.xp}`;
    });

    // ---------------------------------------------------- T10–T13 (progression)
    await test(10, 'Zakoupení vylepšení a změna statistiky', async () => {
      await p2.getByTestId('to-menu').click({ force: true });
      await p2.getByTestId('nav-collection').click({ force: true });
      await p2.getByTestId('collection').waitFor();
      const before = await p2.evaluate(() => {
        const p = window.__dinorush.store.get().profile;
        return { coins: p.coins, speed: p.dinos['raptor-green'].stats.speed, mission: !!p.missions.upgradeFirst?.completed };
      });
      await touch(p2, 'upgrade-speed');
      await p2.waitForTimeout(200);
      const after = await p2.evaluate(() => {
        const p = window.__dinorush.store.get().profile;
        return { coins: p.coins, speed: p.dinos['raptor-green'].stats.speed, mission: !!p.missions.upgradeFirst?.completed };
      });
      const pips = await p2.locator('[data-testid="stat-speed"] .pip.on').count();
      assert(after.speed === before.speed + 1 && pips === after.speed, JSON.stringify({ before, after, pips }));
      const missionBonus = !before.mission && after.mission ? 40 : 0;
      assert(after.coins === before.coins - 60 + missionBonus, 'paid 60 coins');
      await p2.screenshot({ path: join(OUT, 't10-upgrade.png') });
      return `RYCHLOST ${before.speed} → ${after.speed}, mince ${before.coins} → ${after.coins}`;
    });
    await test(11, 'Otevření vajíčka a odemčení odměny', async () => {
      await p2.evaluate(() => window.__dinorush.store.updateProfile((p) => (p.eggs.pending += 1)));
      await p2.getByTestId('back').click({ force: true });
      await p2.getByTestId('nav-eggs').click({ force: true });
      await touch(p2, 'egg');
      await p2.getByTestId('egg-reveal').waitFor({ timeout: 8000 });
      const name = await p2.getByTestId('reward-name').textContent();
      const owned = await p2.evaluate(() => !!window.__dinorush.store.get().profile.dinos['raptor-blue']);
      assert(owned, 'raptor-blue unlocked');
      await p2.waitForTimeout(800);
      await p2.screenshot({ path: join(OUT, 't11-egg.png') });
      await p2.getByTestId('to-collection').click({ force: true });
      const locked = await p2.getByTestId('card-raptor-blue').getAttribute('class');
      assert(!locked.includes('locked'), 'card unlocked in collection');
      return `odměna „${name}“ je ve sbírce`;
    });
    await test(12, 'Umístění dekorace do Dino Parku', async () => {
      await p2.getByTestId('back').click({ force: true });
      await p2.getByTestId('nav-park').click({ force: true });
      await p2.getByTestId('park-view').waitFor();
      await p2.waitForTimeout(600);
      await p2.getByTestId('tab-shop').click({ force: true });
      await p2.getByTestId('buy-tree').click({ force: true });
      const box = await p2.getByTestId('park-view').boundingBox();
      const cdp = await p2.context().newCDPSession(p2);
      // tap a few spots until a cell gets the tree
      for (const [fx, fy] of [[0.5, 0.55], [0.4, 0.5], [0.6, 0.6]]) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * fx, y: box.y + box.height * fy, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await p2.waitForTimeout(250);
        const placed = await p2.evaluate(() => window.__dinorush.store.get().profile.park.cells.includes('tree'));
        if (placed) break;
      }
      await cdp.detach();
      const cells = await p2.evaluate(() => window.__dinorush.store.get().profile.park.cells);
      const idx = cells.indexOf('tree');
      assert(idx >= 0, 'tree placed');
      await p2.waitForTimeout(800);
      await p2.screenshot({ path: join(OUT, 't12-park.png') });
      return `strom na políčku ${idx}`;
    });
    await test(13, 'Obnovení stránky a zachování postupu', async () => {
      const snap = () =>
        p2.evaluate(() => {
          const p = window.__dinorush.store.get().profile;
          return JSON.stringify({ c: p.coins, d: Object.keys(p.dinos).sort(), park: p.park.cells, xp: p.dinos['raptor-green'].xp, st: p.dinos['raptor-green'].stats, m: Object.keys(p.missions).sort() });
        });
      const before = await snap();
      await p2.reload();
      await p2.waitForFunction(() => !!window.__dinorush);
      const after = await snap();
      assert(before === after, 'profile differs after reload');
      return 'mince, dinosauři, XP, vylepšení, park i úkoly zachovány';
    });
    await c2.close();

    // ------------------------------------------------------- T15–T16 (3 humans)
    const { page: p3, ctx: c3 } = await newPage(browser, { timescale: 1 });
    await startRace(p3, { mode: 'classic', humans: 3, names: ['Ema', 'Ben', 'Lia'], worldId: 'volcano', difficulty: 'racer' }, 4242);
    await p3.waitForFunction(() => window.__race.engine.state.phase === 'racing', null, { timeout: 20000 });
    await test(15, 'Závod tří hráčů na jednom tabletu', async () => {
      const panels = await p3.locator('.player-panel').count();
      const buttons = await p3.locator('.dino-btn').count();
      assert(panels === 3 && buttons === 12, `panels ${panels} buttons ${buttons}`);
      await p3.waitForTimeout(500);
      await touch(p3, 'dino-btn-2-ankylo');
      await p3.waitForTimeout(80);
      const cur = await p3.evaluate(() => window.__race.engine.state.participants.map((p) => p.current));
      assert(cur.join(',') === 'raptor,raptor,ankylo', 'only P3 changed: ' + cur);
      await p3.screenshot({ path: join(OUT, 't15-three.png') });
      return '3 panely × 4 tlačítka; dotyk P3 změnil jen P3';
    });
    await test(16, 'Současné dotyky různých hráčů', async () => {
      await p3.waitForTimeout(450); // let P3's cooldown pass
      await multiTouch(p3, ['dino-btn-0-trike', 'dino-btn-1-spino', 'dino-btn-2-raptor']);
      await p3.waitForTimeout(80);
      const cur = await p3.evaluate(() => window.__race.engine.state.participants.map((p) => p.current));
      assert(cur.join(',') === 'trike,spino,raptor', 'simultaneous: ' + cur);
      await p3.waitForTimeout(450);
      await multiTouch(p3, ['dino-btn-0-ankylo', 'dino-btn-2-spino']);
      await p3.waitForTimeout(80);
      const cur2 = await p3.evaluate(() => window.__race.engine.state.participants.map((p) => p.current));
      assert(cur2.join(',') === 'ankylo,spino,spino', 'second multi-touch: ' + cur2);
      return 'tři prsty najednou → trike / spino / raptor; dva prsty → ankylo / (beze změny) / spino';
    });
    await c3.close();

    // ---------------------------------------------------------- T17 all modes
    const { page: p4, ctx: c4 } = await newPage(browser, { timescale: 14 });
    await test(17, 'Funkčnost všech šesti režimů', async () => {
      const out = [];
      for (const mode of ['classic', 'trex', 'goldRush', 'team', 'endless']) {
        await startRace(p4, { ...solo, mode, worldId: mode === 'trex' ? 'ice' : mode === 'team' ? 'islands' : 'jungle' }, 777);
        await startBot(p4, ['p0']);
        if (mode === 'endless') {
          await p4.waitForFunction(() => window.__race.engine.participant('p0').position > 900, null, { timeout: 120000 });
          await touch(p4, 'pause');
          await p4.getByTestId('end-expedition').click({ force: true });
        }
        await waitResults(p4);
        const r = await p4.evaluate(() => {
          const l = window.__dinorush.store.get().last;
          return { mode: l.result.config.mode, res: l.result.results, team: l.result.teamWon, rec: window.__dinorush.store.get().profile.records };
        });
        assert(r.mode === mode, 'mode ' + r.mode);
        if (mode === 'trex') assert(r.res.every((x) => typeof x.caught === 'boolean') && r.res[0].stars >= 1, 'trex result');
        if (mode === 'goldRush') for (let i = 1; i < r.res.length; i++) assert(r.res[i - 1].coins >= r.res[i].coins, 'gold ranking by coins');
        if (mode === 'team') assert(typeof r.team === 'boolean' && (await p4.getByTestId('team-result').count()) === 1, 'team result');
        if (mode === 'endless') assert(r.res.find((x) => x.id === 'p0').score > 900 && r.rec.endlessBest > 900, 'endless score saved');
        await p4.screenshot({ path: join(OUT, `t17-${mode}.png`) });
        const me = r.res.find((x) => x.id === 'p0');
        out.push(`${mode}: ${me.place}. místo` + (mode === 'trex' ? (me.caught ? ' (dohoněn)' : ' (utekl)') : mode === 'team' ? (r.team ? ' (tým vyhrál)' : ' (tým prohrál)') : mode === 'endless' ? ` (${me.score} b.)` : mode === 'goldRush' ? ` (${me.coins} mincí)` : ''));
      }
      // Dino Cup – all five races
      await startRace(p4, { ...solo, mode: 'cup' }, undefined);
      for (let i = 0; i < 5; i++) {
        await startBot(p4, ['p0']);
        await waitResults(p4);
        await p4.getByTestId('cup-standings').click({ force: true });
        if (i < 4) {
          await p4.getByTestId('next-cup-race').click({ force: true });
          await p4.waitForFunction(() => document.querySelector('[data-testid="race-screen"]'));
          await p4.waitForTimeout(300);
          await p4.evaluate(() => {
            window.__events = [];
          });
        }
      }
      await p4.getByTestId('cup-final').waitFor();
      const cupInfo = await p4.evaluate(() => ({ done: window.__dinorush.store.get().profile.stats.cupsCompleted, hist: window.__dinorush.store.get().profile.cupHistory.length }));
      assert(cupInfo.done === 1 && cupInfo.hist === 1, 'cup completed');
      await p4.screenshot({ path: join(OUT, 't17-cup.png') });
      out.push('cup: 5 závodů dokončeno');
      return out.join('; ');
    });
    await c4.close();

    // ---------------------------------------------------------- T18 tablet
    await test(18, 'Ovládání na tabletu v landscape (iPad emulace)', async () => {
      const dev = devices['iPad Pro 11 landscape'] || devices['iPad (gen 7) landscape'];
      const { page, ctx } = await newPage(browser, { device: dev, timescale: 1 });
      await startRace(page, solo, 1234);
      await page.waitForFunction(() => window.__race.engine.state.phase === 'racing', null, { timeout: 20000 });
      const m = await page.evaluate(() => {
        const view = document.querySelector('.race-view').getBoundingClientRect();
        const btn = document.querySelector('.dino-btn').getBoundingClientRect();
        return { vh: innerHeight, vw: innerWidth, view: view.height, btnW: btn.width, btnH: btn.height, scroll: document.scrollingElement.scrollHeight > innerHeight + 1 };
      });
      assert(m.vw > m.vh, 'landscape');
      assert(m.view / m.vh > 0.6 && m.view / m.vh < 0.7, '3D area ratio ' + (m.view / m.vh).toFixed(2));
      assert(m.btnW >= 120 && m.btnH >= 120, `button size ${m.btnW}x${m.btnH}`);
      assert(!m.scroll, 'no scrolling');
      await touch(page, 'dino-btn-0-trike');
      await page.waitForTimeout(60);
      const cur = await page.evaluate(() => window.__race.engine.participant('p0').current);
      assert(cur === 'trike', 'touch works');
      await page.screenshot({ path: join(OUT, 't18-ipad.png') });
      // portrait shows the rotate notice
      await page.setViewportSize({ width: m.vh, height: m.vw });
      await page.waitForTimeout(200);
      const notice = await page.evaluate(() => getComputedStyle(document.querySelector('.rotate-notice')).display);
      assert(notice !== 'none', 'portrait notice');
      await ctx.close();
      return `${m.vw}×${m.vh}, 3D ${(100 * m.view / m.vh).toFixed(0)} % výšky, tlačítko ${Math.round(m.btnW)}×${Math.round(m.btnH)} px, portrait → výzva k otočení`;
    });

    // ---------------------------------------------------------- T19 background
    await test(19, 'Pozastavení při přechodu na pozadí', async () => {
      const { page, ctx } = await newPage(browser, { timescale: 1 });
      await startRace(page, solo, 99);
      await page.waitForFunction(() => window.__race.engine.state.phase === 'racing' && window.__race.engine.state.time > 1, null, { timeout: 20000 });
      const setVis = (v) =>
        page.evaluate((v) => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
        }, v);
      await setVis('hidden');
      const t0 = await page.evaluate(() => window.__race.engine.state.time);
      await page.waitForTimeout(2000);
      const t1 = await page.evaluate(() => window.__race.engine.state.time);
      const paused = await page.evaluate(() => window.__race.paused);
      assert(paused && Math.abs(t1 - t0) < 1e-6, `paused ${paused}, time ${t0} → ${t1}`);
      await setVis('visible');
      await page.getByTestId('pause-menu').waitFor();
      await page.getByTestId('resume').click({ force: true });
      await page.waitForTimeout(50);
      const t2 = await page.evaluate(() => window.__race.engine.state.time);
      assert(t2 - t1 < 0.25, 'no big jump after resume: ' + (t2 - t1));
      await ctx.close();
      return `čas závodu stál (${t0.toFixed(2)} s), po návratu pauza, skok po obnovení ${(t2 - t1).toFixed(3)} s`;
    });

    // ---------------------------------------------------------- T20 offline PWA
    await test(20, 'Spuštění PWA bez internetu', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
      const page = await ctx.newPage();
      await page.goto(BASE);
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
      await ctx.setOffline(true);
      await page.reload();
      await page.getByTestId('main-menu').waitFor({ timeout: 15000 });
      await page.evaluate(() => window.__dinorush.store.finishTutorialOffer(true));
      await page.evaluate(() => window.__dinorush.store.startRace(5, { mode: 'classic', humans: 1, names: ['Off'], worldId: 'ice', difficulty: 'small' }));
      await page.waitForFunction(() => window.__race && window.__race.engine.state.phase === 'racing', null, { timeout: 20000 });
      await page.screenshot({ path: join(OUT, 't20-offline.png') });
      const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).ok);
      await ctx.close();
      assert(manifest, 'manifest from cache');
      return 'service worker aktivní; offline reload načetl menu a spustil závod';
    });

    // ---------------------------------------------------------- extra: tutorial
    await test(21, 'Interaktivní tutoriál (doplňkový test)', async () => {
      const { page, ctx } = await newPage(browser, { timescale: 1 });
      await page.evaluate(() => window.__dinorush.store.startTutorial());
      await page.waitForFunction(() => window.__race && window.__race.engine.state.phase === 'racing', null, { timeout: 20000 });
      await page.waitForTimeout(400);
      const slow = await page.evaluate(() => window.__race.engine.state.timeScale);
      const hint = await page.locator('.dino-btn.hint').getAttribute('data-testid');
      assert(slow < 0.5 && hint === 'dino-btn-0-raptor', `slow ${slow} hint ${hint}`);
      await touch(page, 'dino-btn-0-raptor');
      await page.waitForTimeout(300);
      const fast = await page.evaluate(() => window.__race.engine.state.timeScale);
      assert(fast === 1, 'resumes after correct tap');
      await page.waitForFunction(() => window.__race.engine.state.timeScale < 0.5, null, { timeout: 20000 });
      const hint2 = await page.locator('.dino-btn.hint').getAttribute('data-testid');
      assert(hint2 === 'dino-btn-0-spino', 'water → spino hint ' + hint2);
      await page.screenshot({ path: join(OUT, 't21-tutorial.png') });
      await ctx.close();
      return 'zpomalení + zvýraznění správného tlačítka (Velociraptor, pak Spinosaurus)';
    });

    for (const p of [p1, p2, p3, p4]) if (p.__errors.length) console.log('page errors:', p.__errors);
  } finally {
    await browser.close();
    server.kill();
  }
  const passed = results.filter((r) => r.pass).length;
  const md = ['# DinoRUSH – výsledky E2E testů', '', `Datum: ${new Date().toISOString()}`, '', '| # | Test | Výsledek | Detail |', '|---|---|---|---|']
    .concat(results.sort((a, b) => a.id - b.id).map((r) => `| ${r.id} | ${r.name} | ${r.pass ? 'OK' : 'CHYBA'} | ${r.detail.replace(/\|/g, '/')} |`))
    .concat(['', `**${passed}/${results.length} testů prošlo.**`]);
  writeFileSync(join(OUT, 'report.md'), md.join('\n'));
  console.log(`\n${passed}/${results.length} passed. Report: e2e/out/report.md`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
