// Run with Node.js and playwright-core (or set PLAYWRIGHT_MODULE_PATH).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright-core');

const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)];
  if (type) res.setHeader('Content-Type', type);
  fs.createReadStream(file).on('error', () => res.writeHead(404).end()).pipe(res);
});

async function assertStageFits(page) {
  await page.waitForFunction(() => {
    const stage = document.getElementById('battle-stage');
    const box = stage.getBoundingClientRect();
    const { clientWidth, clientHeight } = document.documentElement;
    return box.left >= -1 && box.top >= -1 &&
      box.right <= clientWidth + 1 && box.bottom <= clientHeight + 1 &&
      Math.abs(box.left - (clientWidth - box.right)) < 1 &&
      Math.abs(box.top - (clientHeight - box.bottom)) < 1 &&
      Math.abs(box.width / box.height - 16 / 9) < 0.01;
  });
}

async function assertSoundDoesNotOverlap(page, button) {
  const control = await page.locator(button).boundingBox();
  const sound = await page.locator('#battle-se-toggle').boundingBox();
  assert.ok(control && sound && control.x + control.width < sound.x);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE_PATH
      ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
      : { channel: 'msedge' })
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1.25 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/peerjs.min.js|fonts.googleapis.com/, route => route.fulfill({ body: '' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await assertStageFits(page);
    assert.equal(await page.locator('#battle-stage').evaluate(el => getComputedStyle(el).transform), 'none');
    await page.locator('#btn-title-pve').click();
    await assertSoundDoesNotOverlap(page, '#pick-confirm-btn');

    const draftImageCount = await page.evaluate(() => {
      const images = [...document.querySelectorAll('#pick-cards-grid img')];
      document.querySelector('#pick-cards-grid [data-pick-focus="VEIL"]').click();
      document.querySelector('#pick-role-filters [data-pick-role="ASSAULT"]').click();
      document.querySelector('#pick-role-filters [data-pick-role="ALL"]').click();
      return images.filter(img => img.isConnected).length;
    });
    assert.equal(draftImageCount, 12);
    await page.evaluate(() => {
      window.__onConfirmPick();
      window.__onConfirmDeploy();
      window.__onConfirmDeploy();
    });
    await page.waitForFunction(() => document.getElementById('turn-cutin-overlay').hidden);
    await assertSoundDoesNotOverlap(page, '#btn-end-turn');

    const replacements = await page.evaluate(() => {
      const images = [...document.querySelectorAll('#board .piece img')];
      const tile = document.querySelector('#board .piece.ally.kinesis').closest('.tile');
      tile.click();
      const portrait = document.querySelector('#unit-detail-panel img');
      const skill = document.querySelector('#unit-detail-panel [data-inspector-control="SKILL_A"]');
      skill.focus();
      skill.click();
      return {
        images: images.filter(img => !img.isConnected).length,
        portrait: portrait === document.querySelector('#unit-detail-panel img'),
        focus: document.activeElement.dataset.inspectorControl
      };
    });
    assert.deepEqual(replacements, { images: 0, portrait: true, focus: 'SKILL_A' });
    await page.evaluate(() => window.setCommandMode('SKILL_A'));

    const source = page.locator('#board .piece.ally.kinesis').first();
    const destination = page.locator('#board .tile.valid-move').first();
    const { r, c } = await destination.evaluate(el => el.dataset);
    await source.dragTo(destination);
    await page.waitForFunction(({ r, c }) => !!document.querySelector(`#board .tile[data-r="${r}"][data-c="${c}"] .piece.ally.kinesis`), { r, c });
    assert.equal(await page.locator('#board .drag-over-valid, #board .drag-over-attack').count(), 0);

    for (const viewport of [{ width: 800, height: 450 }, { width: 390, height: 844 }, { width: 1600, height: 900 }]) {
      await page.setViewportSize(viewport);
      await assertStageFits(page);
      await assertSoundDoesNotOverlap(page, '#btn-end-turn');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: stable viewport, draft and battle portraits, keyboard focus, native drag-and-drop, and unobstructed controls.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
