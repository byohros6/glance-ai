import { randomUUID } from 'node:crypto';

// Own the entire operation, including renderer upload and submission acknowledgement.
export class OperationCoordinator {
  constructor({ capture, settings, restore, timeoutMs = 45000 }) {
    Object.assign(this, { capture, settings, restore, timeoutMs });
    this.active = null;
  }

  cancel(win) {
    if (this.active && (!win || this.active.win === win)) {
      if (!this.active.win.isDestroyed()) this.active.win.webContents.send('action:cancel-operation', this.active.id);
      this.active.finish({ ok: false, error: 'Operation cancelled by navigation or window change.' });
    }
  }

  complete(win, result) {
    if (this.active?.win !== win || result?.id !== this.active.id || typeof result.ok !== 'boolean') return false;
    this.active.finish(result);
    return true;
  }

  async run(win, type = 'capture') {
    if (!win || win.isDestroyed()) return { ok: false, error: 'Open the overlay first.' };
    if (this.active) return { ok: false, error: 'An attachment or send is already in progress.' };
    const id = randomUUID();
    const url = win.webContents.getURL();
    let resolveResult;
    const completed = new Promise(resolve => { resolveResult = resolve; });
    const operation = { id, win, finish: result => {
      clearTimeout(operation.timer);
      if (this.active === operation) this.active = null;
      resolveResult(result);
    }};
    this.active = operation;
    operation.timer = setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.send('action:cancel-operation', id);
      operation.finish({ ok: false, error: 'Could not confirm completion. Check the conversation before retrying.' });
    }, this.timeoutMs);
    try {
      const settings = this.settings();
      if (type === 'capture') {
        const dataUrl = await this.capture(win, {
          savedOpacity: settings.opacity, clickThrough: settings.clickThrough,
          restoreState: () => this.restore(win)
        });
        if (this.active !== operation) return await completed;
        if (!dataUrl) throw new Error('Screen capture failed. Please try again.');
        if (win.isDestroyed() || win.webContents.getURL() !== url) throw new Error('The conversation changed during capture. Nothing was attached.');
        win.webContents.send('action:attach-screenshot', { id, dataUrl, prompt: settings.prompt, autoSubmit: settings.autoSubmit });
      } else {
        win.webContents.send('action:submit', { id });
      }
    } catch (error) { operation.finish({ id, ok: false, error: error.message }); }
    return await completed;
  }
}
