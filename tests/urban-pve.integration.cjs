// Run with Node.js and playwright-core (or set PLAYWRIGHT_MODULE_PATH).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright-core');
const http = require('node:http');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.log('PAGE ERROR', e.stack); });
    page.on('dialog', async d => { console.log('DIALOG', d.message()); await d.dismiss(); });
    await page.route('**/peerjs.min.js', route => route.fulfill({ body: '' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => typeof window.__startPvEMode === 'function');
    await page.click('#btn-title-pve');
    await page.click('#pick-confirm-btn');
    await page.screenshot({ path: path.join(root, 'scratch/urban-deploy.png') });
    assert.equal(await page.locator('#board .piece').count(), 6);
    await page.click('#btn-deploy-confirm', { timeout: 5000 });
    await page.click('#btn-deploy-confirm');
    await page.locator('.tile .piece.kinesis').first().click();
    await page.screenshot({ path: path.join(root, 'scratch/urban-battle.png') });
    assert.match(await page.locator('#unit-detail-panel').innerText(), /KINESIS|HP/);
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('#board .piece').count(), 12);
    assert.ok(await page.locator('#board img').evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth)));
    const target = page.locator('#board .tile.movable').first();
    if (await target.count()) await target.click();
    await page.click('#urban-tab-log');
    assert.ok(await page.locator('#log-box .log-entry').count() > 10);
    await page.locator('#btn-end-turn').focus();
    await page.keyboard.down('Enter'); await page.waitForTimeout(500); await page.keyboard.up('Enter');
    await page.waitForTimeout(5000);
    await page.waitForFunction(() => document.getElementById('turn-count-badge').innerText === 'TURN 2' && !document.getElementById('btn-end-turn').disabled);
    console.log('PASS: AI draft, deployment, character images, movement, logs, hold-to-end-turn and AI response.');
    if (errors.length) throw Error(errors.join('\n'));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exit(1); });
