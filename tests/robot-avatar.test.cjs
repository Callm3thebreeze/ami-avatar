const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.ROBOT_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');

test('CommonJS export is usable without a DOM at import time', () => {
  const RobotAvatar = require('../avatar/robot-avatar.js');
  assert.equal(typeof RobotAvatar, 'function');
  assert.equal(RobotAvatar.states.length, 7);
  assert.equal(RobotAvatar.stateInfo('toString'), null);
  assert.throws(() => new RobotAvatar(null), /contenedor/);
});

test('browser API, isolation, external mouth control and teardown', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<div id="a" style="width:200px"></div><div id="b" style="width:200px"></div>');
    await page.addStyleTag({ path: path.join(root, 'avatar/robot-avatar.css') });
    await page.addScriptTag({ path: path.join(root, 'vendor/gsap.min.js') });
    await page.addScriptTag({ path: path.join(root, 'avatar/robot-avatar.js') });
    await page.evaluate(() => {
      window.a = new RobotAvatar(document.querySelector('#a'), { speechSimulation: false });
      window.b = new RobotAvatar(document.querySelector('#b'), { speechSimulation: false });
    });
    const result = await page.evaluate(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
      const uniqueIds = ids.length === new Set(ids).size;
      const refsValid = [...document.querySelectorAll('[mask],[clip-path]')].every(node => {
        const value = node.getAttribute('mask') || node.getAttribute('clip-path');
        return !!node.closest('svg').querySelector('[id="' + value.slice(5, -1) + '"]');
      });
      const invalid = a.setState('toString');
      for (const state of RobotAvatar.states) {
        a.setState(state);
        await wait(35);
      }
      a.setState('habla', { instant: true });
      a.setSpeechSimulation(true);
      a.setSpeechSimulation(false);
      a.setMouthOpen(0.73, 0);
      a.setIntensity(0.8);
      await wait(650);
      const externalMouth = !a.speaking && a.mouthOpen === 0.73;
      const isolation = b.state === 'reposo' && b.mouthOpen === 0;
      a.setState('sorpresa');
      await wait(60);
      a.setReducedMotion(true);
      await wait(30);
      const activeEyes = a.parts.eyesets.wide;
      const reduced = !activeEyes.group.classList.contains('rb-off') &&
        [...activeEyes.eyes].every(eye => Number(gsap.getProperty(eye, 'scaleY')) === 1);
      a.reset();
      // Force the delayed blink into its active timeline before unmounting.
      a._blinkCall.progress(1);
      a._tlBlink.progress(0.2);
      b.setState('pensamiento', { instant: true });
      const unrelated = { x: 0 };
      const otherTween = gsap.to(unrelated, { x: 1, duration: 10 });
      a.destroy();
      a.destroy();
      const otherInstanceAlive = b.el.isConnected && !!b._tlSpin;
      b.destroy();
      const otherTweenAlive = !!otherTween.parent;
      otherTween.kill();
      a.setState('habla');
      a.setMouthOpen(1);
      a.setIntensity(1);
      a.setReducedMotion(false);
      a.reset();
      a.setSpeechSimulation(true);
      await wait(550);
      return { uniqueIds, refsValid, invalid, externalMouth, isolation, reduced,
        otherInstanceAlive, otherTweenAlive,
        avatarsLeft: document.querySelectorAll('.robot-avatar').length,
        animationsLeft: gsap.globalTimeline.getChildren(true, true, true).length };
    });
    assert.deepEqual(result, { uniqueIds: true, refsValid: true, invalid: false,
      externalMouth: true, isolation: true, reduced: true,
      otherInstanceAlive: true, otherTweenAlive: true, avatarsLeft: 0, animationsLeft: 0 });
    assert.deepEqual(errors, []);

    for (const file of ['index.html', 'example.html']) {
      await page.goto(pathToFileURL(path.join(root, file)).href);
      await page.getByRole('button', { name: 'Pensamiento', exact: true }).click();
      await page.waitForTimeout(650);
      await page.getByRole('button', { name: 'Reposo', exact: true }).click();
      assert.equal(await page.locator('.robot-avatar').count(), 1);
      if (file === 'index.html') assert.equal(await page.locator('#status-sim').isVisible(), false);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
