// Run with Node.js and playwright-core (or set PLAYWRIGHT_MODULE_PATH).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html'); res.end(data); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : { channel: 'msedge' }), headless: true });
  try {
    const pages = await Promise.all([browser.newPage({ viewport: { width: 1600, height: 900 } }), browser.newPage({ viewport: { width: 1600, height: 900 } })]);
    const errors = [];
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    await Promise.all(pages.map(async (page, index) => {
      page.on('pageerror', e => { errors.push(e.message); console.log(e.stack); });
      await page.route('**/peerjs.min.js', route => route.fulfill({ body: '' }));
      await page.goto(url);
      await page.waitForFunction(() => typeof window.__startOnlineFromTitle === 'function');
      await page.click('#btn-title-online');
      assert.equal(await page.locator('#online-modal').evaluate(el => el.classList.contains('active')), true);
      // Replace only the Peer transport with a deterministic two-page relay.
      // Production NetworkManager.send and all game callbacks remain in use.
      await page.exposeFunction('relayPacket', msg => pages[1 - index].evaluate(async msg => {
        const { network } = await import('./js/network.js?v=urban-v1'); network.onMessage(msg);
      }, msg));
      await page.evaluate(async role => {
        const { network } = await import('./js/network.js?v=urban-v1');
        network.isConnected = true; network.role = role;
        network.conn = { open: true, send(msg) { window.relayPacket(msg); }, close() {} };
        network.onConnected(role);
      }, index === 0 ? 'P1' : 'P2');
    }));
    const [blue, red] = pages;
    await blue.click('#pick-confirm-btn'); await red.click('#pick-confirm-btn');
    await blue.waitForFunction(() => document.getElementById('screen-battle').classList.contains('active'));
    await blue.click('#btn-deploy-confirm');
    await red.waitForFunction(() => !document.getElementById('btn-deploy-confirm').disabled && document.getElementById('deploy-control-bar').style.display !== 'none');
    await red.click('#btn-deploy-confirm');
    await blue.waitForFunction(() => document.getElementById('turn-count-badge').innerText === 'TURN 1');
    assert.equal(await blue.locator('#board .piece').count(), 12);
    assert.equal(await red.locator('#board .piece').count(), 12);
    assert.equal(await red.locator('#urban-coord-cols').innerText(), 'G\nF\nE\nD\nC\nB\nA');
    assert.equal(await red.locator('#btn-end-turn').isDisabled(), true);
    await red.locator('#board .piece.p1.kinesis').click();
    assert.equal(await red.locator('.urban-basic-actions button').first().isDisabled(), true);
    await blue.locator('#board .piece.p1.kinesis').click();
    await blue.locator('.urban-command').first().click();
    await blue.locator('#board .piece.p1.kinesis').click();
    await red.waitForFunction(async () => {
      const { board } = await import('./js/board.js?v=urban-v1');
      return board.flat().find(u => u?.typeKey === 'KINESIS')?.stockA === 1;
    });
    assert.match(await blue.locator('.urban-stats').innerText(), /30/);
    const move = blue.locator('#board .tile.movable').first();
    const destination = await move.evaluate(el => ({ r: el.dataset.r, c: el.dataset.c }));
    await move.click();
    await red.waitForFunction(({ r, c }) => !!document.querySelector(`.tile[data-r="${r}"][data-c="${c}"] .kinesis.p1`), destination);
    await blue.locator('#btn-end-turn').focus(); await blue.keyboard.down('Enter'); await blue.waitForTimeout(500); await blue.keyboard.up('Enter');
    await red.waitForFunction(() => !document.getElementById('btn-end-turn').disabled);
    assert.equal(await blue.locator('#btn-end-turn').isDisabled(), true);
    await red.locator('#board .piece.p2.phase').click();
    const redMove = red.locator('#board .tile.movable').first();
    const redDestination = await redMove.evaluate(el => ({ r: el.dataset.r, c: el.dataset.c }));
    await redMove.click();
    await blue.waitForFunction(({ r, c }) => !!document.querySelector(`.tile[data-r="${r}"][data-c="${c}"] .phase.p2`), redDestination);
    await red.click('#urban-tab-log'); assert.ok(await red.locator('#log-box .log-entry').count() > 5);
    await red.screenshot({ path: path.join(root, 'scratch/urban-online-red.png') });
    await blue.setViewportSize({ width: 800, height: 450 });
    const bounds = await blue.locator('.urban-inspector').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 800 && bounds.y + bounds.height <= 450);
    assert.deepEqual(errors, []);
    console.log('PASS: two-client online draft/deploy, RED perspective, skill and both players movement sync, turn sync, opponent controls disabled, logs, scaled layout. Peer transport simulated.');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exit(1); });
