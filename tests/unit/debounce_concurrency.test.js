import { app, BrowserWindow, desktopCapturer } from 'electron';
import { captureScreenWithHide, getIsCapturing } from '../../src/main/screenshot.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';
const suite = createTestSuite('Production capture lock and window restoration');
let win;
const original = desktopCapturer.getSources;
suite.test('Concurrent captures are rejected until the production capture finishes', async () => {
  win = new BrowserWindow({ show: false }); win.setOpacity(.85);
  let captures = 0;
  desktopCapturer.getSources = async () => {
    captures++;
    const { screen } = await import('electron');
    return [{ display_id: String(screen.getPrimaryDisplay().id), thumbnail: { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,' + 'A'.repeat(600) } }];
  };
  const first = captureScreenWithHide(win, { savedOpacity: .85 });
  assert.equal(getIsCapturing(), true);
  assert.equal(await captureScreenWithHide(win), null);
  assert.ok(await first); assert.equal(captures, 1);
  assert.equal(getIsCapturing(), false); assert.equal(win.getOpacity(), .85);
});
suite.test('Latest state restoration is used and a restoration exception cannot wedge the mutex', async () => {
  await assert.rejects(captureScreenWithHide(win, { restoreState() { throw new Error('restore failure'); } }), /restore failure/);
  assert.equal(getIsCapturing(), false);
  await captureScreenWithHide(win, { restoreState() { win.setOpacity(.65); } });
  assert.equal(win.getOpacity(), .65);
});
app.whenReady().then(async () => { const ok = await suite.run(); desktopCapturer.getSources = original; win?.destroy(); app.exit(ok ? 0 : 1); });
