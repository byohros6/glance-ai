import { app } from 'electron';
import { OperationCoordinator } from '../../src/main/operations.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';
const suite = createTestSuite('Production capture-to-send transaction');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture(timeoutMs = 500) {
  const messages = [];
  const win = { isDestroyed: () => false, webContents: { getURL: () => 'https://chatgpt.com/c/one', send: (...args) => messages.push(args) } };
  const coordinator = new OperationCoordinator({ capture: async () => 'data:image/png;base64,test', settings: () => ({ prompt: 'test', autoSubmit: true }), restore() {}, timeoutMs });
  return { win, coordinator, messages };
}
suite.test('The lock lasts until renderer acknowledgement, and rejects another capture or send', async () => {
  const { win, coordinator, messages } = fixture();
  const pending = coordinator.run(win);
  await tick();
  assert.ok(coordinator.active);
  assert.equal((await coordinator.run(win, 'submit')).ok, false);
  assert.equal((await coordinator.run(win)).ok, false);
  assert.equal(messages.length, 1);
  const payload = messages[0][1];
  assert.equal(payload.autoSubmit, true);
  assert.equal(coordinator.complete({}, { id: payload.id, ok: true }), false);
  assert.equal(coordinator.complete(win, { id: 'wrong', ok: true }), false);
  coordinator.complete(win, { id: payload.id, ok: true });
  assert.equal((await pending).ok, true);
  assert.equal(coordinator.active, null);
});
suite.test('Cancelled capture cannot inject into a changed conversation', async () => {
  const { win, coordinator, messages } = fixture();
  let finishCapture;
  coordinator.capture = () => new Promise(resolve => { finishCapture = resolve; });
  const pending = coordinator.run(win);
  coordinator.cancel(win);
  finishCapture('data:image/png;base64,test');
  assert.equal((await pending).ok, false);
  assert.equal(messages.some(([channel]) => channel === 'action:attach-screenshot'), false);
  assert.equal(coordinator.active, null);
});
suite.test('Missing acknowledgement times out and releases the operation', async () => {
  const { win, coordinator } = fixture(30);
  assert.equal((await coordinator.run(win, 'submit')).ok, false);
  assert.equal(coordinator.active, null);
});
suite.test('Capture failure cannot reach upload or report success', async () => {
  const { win, coordinator, messages } = fixture(); coordinator.capture = async () => null;
  assert.equal((await coordinator.run(win)).ok, false);
  assert.equal(messages.length, 0);
});
app.whenReady().then(async () => app.exit(await suite.run() ? 0 : 1));
