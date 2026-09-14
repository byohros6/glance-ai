import { desktopCapturer, screen } from 'electron';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';

const execFileAsync = promisify(execFile);

let isCapturing = false;

/**
 * Returns true if a screen capture is currently in flight.
 * @returns {boolean}
 */
export function getIsCapturing() {
  return isCapturing;
}

/**
 * Captures the screen.
 * Because setContentProtection(true) is active on the UndecGPT window,
 * Windows automatically excludes the UndecGPT window from capture!
 * @returns {Promise<string|null>} Data URL of the captured screenshot.
 */
export async function captureScreen() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const scaleFactor = primaryDisplay.scaleFactor || 1;
  const captureWidth = Math.round(width * scaleFactor);
  const captureHeight = Math.round(height * scaleFactor);

  // Method 1: Electron native desktopCapturer (fast & in-memory)
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: captureWidth, height: captureHeight }
    });

    if (sources && sources.length > 0) {
      const primaryIdStr = primaryDisplay.id != null ? primaryDisplay.id.toString() : '';
      const primarySource =
        sources.find((s) => s.display_id === primaryIdStr) ||
        sources.find((s) => primaryIdStr && s.id && s.id.includes(primaryIdStr)) ||
        sources[0];

      if (primarySource && primarySource.thumbnail && !primarySource.thumbnail.isEmpty()) {
        const dataUrl = primarySource.thumbnail.toDataURL();
        if (dataUrl && dataUrl.length > 500) {
          return dataUrl;
        }
      }
    }
  } catch (err) {
    console.warn('[Screenshot] desktopCapturer failed, trying PowerShell fallback:', err.message);
  }

  // Method 2: Windows PowerShell CopyFromScreen with DPI Awareness (exact WhisprGPT implementation)
  let tempFile = null;
  try {
    tempFile = path.join(
      app.getPath('temp'),
      `undec_${Date.now()}_${Math.random().toString(36).slice(2)}.png`
    );

    const escapedTempFile = tempFile.replace(/\\/g, '\\\\').replace(/'/g, "''");

    const psScript = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class DpiHelper {
    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();
}
"@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
[DpiHelper]::SetProcessDPIAware()
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save('${escapedTempFile}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bmp.Dispose()
`;

    await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript]);
    const buffer = await fs.readFile(tempFile);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.error('[Screenshot] PowerShell screenshot capture failed:', err);
    return null;
  } finally {
    if (tempFile) {
      await fs.unlink(tempFile).catch(() => {});
    }
  }
}

/**
 * Executes full-resolution screen capture with pre-roll hide delay and capture mutex.
 * Hides the overlay (opacity 0, mouse events forwarded), waits 100ms for compositor flush,
 * captures primary display, and safely restores opacity and mouse events in finally block.
 * @param {import('electron').BrowserWindow} win
 * @param {object} [options]
 * @param {number} [options.savedOpacity]
 * @param {boolean} [options.clickThrough]
 * @param {number} [options.defaultOpacity]
 * @returns {Promise<string|null>}
 */
export async function captureScreenWithHide(win, options = {}) {
  if (isCapturing) {
    console.warn('[Screenshot] Capture mutex active, debouncing concurrent capture request');
    return null;
  }

  if (!win || win.isDestroyed()) {
    return null;
  }

  isCapturing = true;

  const currentOpacity = win.getOpacity();
  const savedOpacity = typeof options.savedOpacity === 'number' && options.savedOpacity > 0
    ? options.savedOpacity
    : (currentOpacity > 0 ? currentOpacity : (options.defaultOpacity ?? 0.95));
  const isClickThrough = options.clickThrough ?? false;

  try {
    win.setOpacity(0);
    win.setIgnoreMouseEvents(true, { forward: true });

    // 100ms pre-roll delay for desktop compositor to clear overlay
    await new Promise((r) => setTimeout(r, 100));

    return await captureScreen();
  } catch (err) {
    console.error('[Screenshot] Error during captureScreenWithHide:', err);
    return null;
  } finally {
    if (win && !win.isDestroyed()) {
      win.setOpacity(savedOpacity);
      if (isClickThrough) {
        win.setIgnoreMouseEvents(true, { forward: true });
      } else {
        win.setIgnoreMouseEvents(false);
      }
    }
    isCapturing = false;
  }
}

