// Dashboard Logic
const PROMPT_PRESETS = {
  coding: 'Solve this coding problem step-by-step with optimal time and space complexity. Provide clean, well-commented code in the requested language. Highlight edge cases.',
  interview: 'Analyze the technical question shown in the image. Outline the thought process clearly, explain trade-offs, and write the complete, optimal solution.',
  exam: 'Identify the exact question and options shown in the image. Provide the correct answer choice clearly with a concise, factual explanation.',
  general: 'Analyze the screenshot and answer what is being asked clearly, directly, and thoroughly.'
};

const SHORTCUT_METADATA = [
  { id: 'screenshot', name: 'Screenshot & Attach', desc: 'Captures screen with pre-roll hide and attaches to Gemini', default: 'CommandOrControl+S' },
  { id: 'send', name: 'Send to Gemini', desc: 'Submits prompt and screenshot to Gemini', default: 'CommandOrControl+Return' },
  { id: 'returnHome', name: 'Return to Menu', desc: 'Toggles between Gemini overlay and this Dashboard', default: 'CommandOrControl+B' },
  { id: 'toggleVisibility', name: 'Boss Key / Hide', desc: 'Silently toggles overlay visibility', default: 'CommandOrControl+H' },
  { id: 'toggleFocus', name: 'Toggle Focusable', desc: 'When OFF, clicking overlay won\'t unfocus other windows', default: 'CommandOrControl+F' },
  { id: 'toggleClickThrough', name: 'Toggle Click-Through', desc: 'When ON, mouse clicks pass through overlay', default: 'CommandOrControl+M' },
  { id: 'moveUp', name: 'Move Up', desc: 'Nudges window up by 40px', default: 'CommandOrControl+Up' },
  { id: 'moveDown', name: 'Move Down', desc: 'Nudges window down by 40px', default: 'CommandOrControl+Down' },
  { id: 'moveLeft', name: 'Move Left', desc: 'Nudges window left by 40px', default: 'CommandOrControl+Left' },
  { id: 'moveRight', name: 'Move Right', desc: 'Nudges window right by 40px', default: 'CommandOrControl+Right' },
  { id: 'scrollUp', name: 'Scroll Chat Up', desc: 'Scrolls chat history upwards', default: 'CommandOrControl+Shift+Up' },
  { id: 'scrollDown', name: 'Scroll Chat Down', desc: 'Scrolls chat history downwards', default: 'CommandOrControl+Shift+Down' },
  { id: 'opacityDown', name: 'Decrease Opacity', desc: 'Dims window by 10%', default: 'CommandOrControl+[' },
  { id: 'opacityUp', name: 'Increase Opacity', desc: 'Brightens window by 10%', default: 'CommandOrControl+]' },
  { id: 'emergencyExit', name: 'Emergency Exit', desc: 'Immediately closes Undec', default: 'CommandOrControl+Shift+Q' }
];

let currentSettings = {};
let activeRecordingState = null;

function formatKey(acc) {
  if (!acc) return 'Unset';
  return acc
    .replace(/CommandOrControl/g, 'Ctrl')
    .replace(/Return/g, 'Enter')
    .replace(/Up/g, '↑')
    .replace(/Down/g, '↓')
    .replace(/Left/g, '←')
    .replace(/Right/g, '→')
    .replace(/\+/g, ' + ');
}

function eventToAccelerator(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');

  let key = e.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    return null;
  }

  if (key === 'Enter') key = 'Return';
  else if (key === 'ArrowUp') key = 'Up';
  else if (key === 'ArrowDown') key = 'Down';
  else if (key === 'ArrowLeft') key = 'Left';
  else if (key === 'ArrowRight') key = 'Right';
  else if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();

  parts.push(key);
  return parts.join('+');
}

function showToast(msg) {
  const toast = document.getElementById('status-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 1800);
}

// Update the live mini monitor mockup
function updateLivePreview(width, height) {
  const box = document.getElementById('mini-overlay-box');
  const label = document.getElementById('mini-size-label');
  const aspect = document.getElementById('preview-aspect');
  if (!box || !label || !aspect) return;

  // Monitor is 180x100 representing a 1920x1080 display
  const scaleX = 180 / 1920;
  const scaleY = 100 / 1080;

  const previewW = Math.max(30, Math.min(160, Math.round(width * scaleX)));
  const previewH = Math.max(25, Math.min(92, Math.round(height * scaleY)));

  box.style.width = previewW + 'px';
  box.style.height = previewH + 'px';
  label.textContent = width + '×' + height;
  aspect.textContent = 'Aspect: ' + width + ' × ' + height + ' px';
}

async function init() {
  if (!window.undecgpt) {
    console.error('undecgpt API not available');
    return;
  }

  try {
    currentSettings = await window.undecgpt.getSettings();
  } catch (e) {
    console.error('Failed to get settings:', e);
    currentSettings = {};
  }

  const inputWidth = document.getElementById('input-width');
  const numWidth = document.getElementById('num-width');
  const inputHeight = document.getElementById('input-height');
  const numHeight = document.getElementById('num-height');
  const inputOpacity = document.getElementById('input-opacity');
  const valOpacity = document.getElementById('val-opacity');
  const toggleFocusable = document.getElementById('toggle-focusable');
  const toggleClickthrough = document.getElementById('toggle-clickthrough');
  const toggleAutoSubmit = document.getElementById('toggle-autosubmit');
  const promptTextarea = document.getElementById('prompt-textarea');
  const promptCharCount = document.getElementById('prompt-char-count');
  const btnTestSize = document.getElementById('btn-test-size');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const btnSaveText = document.getElementById('btn-save-text');

  const w = currentSettings.windowWidth || 520;
  const h = currentSettings.windowHeight || 650;
  const op = currentSettings.opacity || 0.95;

  inputWidth.value = w;
  numWidth.value = w;
  inputHeight.value = h;
  numHeight.value = h;
  inputOpacity.value = op;
  valOpacity.textContent = Math.round(op * 100) + '%';

  toggleFocusable.checked = currentSettings.focusable !== false;
  toggleClickthrough.checked = !!currentSettings.clickThrough;
  if (toggleAutoSubmit) {
    toggleAutoSubmit.checked = !!currentSettings.autoSubmit;
  }

  promptTextarea.value = currentSettings.prompt || '';
  promptCharCount.textContent = (currentSettings.prompt || '').length + ' chars';

  // Initialize live preview
  updateLivePreview(w, h);

  // Synchronize Width
  function applyWidth(val) {
    inputWidth.value = val;
    numWidth.value = val;
    updateLivePreview(val, parseInt(inputHeight.value, 10));
    window.undecgpt.saveSettings({ windowWidth: val });
  }

  inputWidth.addEventListener('input', (e) => {
    applyWidth(parseInt(e.target.value, 10));
  });

  numWidth.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 300 && val <= 1400) {
      applyWidth(val);
    }
  });

  // Synchronize Height
  function applyHeight(val) {
    inputHeight.value = val;
    numHeight.value = val;
    updateLivePreview(parseInt(inputWidth.value, 10), val);
    window.undecgpt.saveSettings({ windowHeight: val });
  }

  inputHeight.addEventListener('input', (e) => {
    applyHeight(parseInt(e.target.value, 10));
  });

  numHeight.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 300 && val <= 1200) {
      applyHeight(val);
    }
  });

  // Size Presets
  document.querySelectorAll('.preset-btn[data-w]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nw = parseInt(btn.getAttribute('data-w'), 10);
      const nh = parseInt(btn.getAttribute('data-h'), 10);
      applyWidth(nw);
      applyHeight(nh);
      showToast('Set to ' + nw + '×' + nh + ' px');
    });
  });

  // Preview on Desktop Button
  if (btnTestSize) {
    btnTestSize.addEventListener('click', () => {
      const currentW = parseInt(inputWidth.value, 10);
      const currentH = parseInt(inputHeight.value, 10);
      if (window.undecgpt.previewOverlaySize) {
        window.undecgpt.previewOverlaySize(currentW, currentH);
        showToast('Previewing ' + currentW + '×' + currentH + ' on monitor for 2s...');
      }
    });
  }

  // Explicit Save Settings Button
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async () => {
      const currentW = parseInt(inputWidth.value, 10);
      const currentH = parseInt(inputHeight.value, 10);
      const currentOp = parseFloat(inputOpacity.value);
      const currentFocus = toggleFocusable.checked;
      const currentClickThrough = toggleClickthrough.checked;
      const currentAutoSubmit = toggleAutoSubmit ? toggleAutoSubmit.checked : false;
      const currentPrompt = promptTextarea.value;

      try {
        const updated = await window.undecgpt.saveSettings({
          windowWidth: currentW,
          windowHeight: currentH,
          opacity: currentOp,
          focusable: currentFocus,
          clickThrough: currentClickThrough,
          autoSubmit: currentAutoSubmit,
          prompt: currentPrompt
        });

        if (updated) currentSettings = updated;
        if (window.undecgpt.setFocusable) await window.undecgpt.setFocusable(currentFocus);
        if (window.undecgpt.setClickThrough) await window.undecgpt.setClickThrough(currentClickThrough);

        btnSaveSettings.classList.add('saved');
        if (btnSaveText) btnSaveText.textContent = 'Saved!';
        showToast('Settings saved successfully!');

        const footerHint = document.getElementById('footer-save-hint');
        if (footerHint) footerHint.textContent = 'All settings saved to disk';

        setTimeout(() => {
          btnSaveSettings.classList.remove('saved');
          if (btnSaveText) btnSaveText.textContent = 'Save Settings';
        }, 1600);
      } catch (err) {
        console.error('Failed to save settings:', err);
        showToast('Failed to save settings');
      }
    });
  }

  // Opacity Slider
  inputOpacity.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valOpacity.textContent = Math.round(val * 100) + '%';
    window.undecgpt.saveSettings({ opacity: val });
  });

  // Focusable Toggle
  toggleFocusable.addEventListener('change', (e) => {
    const checked = e.target.checked;
    window.undecgpt.saveSettings({ focusable: checked });
    window.undecgpt.setFocusable(checked);
    showToast(checked ? 'Focusable enabled' : 'Non-Activating Focus enabled');
  });

  // Click-Through Toggle
  toggleClickthrough.addEventListener('change', (e) => {
    const checked = e.target.checked;
    window.undecgpt.saveSettings({ clickThrough: checked });
    window.undecgpt.setClickThrough(checked);
    showToast(checked ? 'Click-Through ON' : 'Click-Through OFF');
  });

  // Auto-Submit Toggle
  if (toggleAutoSubmit) {
    toggleAutoSubmit.addEventListener('change', (e) => {
      const checked = e.target.checked;
      window.undecgpt.saveSettings({ autoSubmit: checked });
      showToast(checked ? 'Auto-Submit on Capture ON' : 'Auto-Submit on Capture OFF');
    });
  }

  // Prompt Editing & Presets
  promptTextarea.addEventListener('input', (e) => {
    const text = e.target.value;
    promptCharCount.textContent = text.length + ' chars';
    window.undecgpt.saveSettings({ prompt: text });
  });

  document.querySelectorAll('#prompt-presets button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const presetKey = btn.getAttribute('data-preset');
      if (PROMPT_PRESETS[presetKey]) {
        promptTextarea.value = PROMPT_PRESETS[presetKey];
        promptCharCount.textContent = promptTextarea.value.length + ' chars';
        window.undecgpt.saveSettings({ prompt: promptTextarea.value });
        showToast('Applied ' + btn.textContent.trim() + ' template');
      }
    });
  });

  // Render Shortcuts Table
  renderShortcuts();

  // Reset Shortcuts Button
  const resetBtn = document.getElementById('btn-reset-shortcuts');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (window.undecgpt.resetShortcuts) {
        currentSettings.shortcuts = await window.undecgpt.resetShortcuts();
        renderShortcuts();
        showToast('Hotkeys reset to defaults');
      }
    });
  }

  // Launch Gemini Button
  const launchBtn = document.getElementById('btn-launch-gemini');
  if (launchBtn) {
    launchBtn.addEventListener('click', () => {
      if (window.undecgpt.launchGemini) {
        window.undecgpt.launchGemini();
      }
    });
  }

  // Direct Window Close & Minimize Bindings
  const closeBtn = document.getElementById('btn-close');
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.undecgpt && window.undecgpt.closeApp) {
        window.undecgpt.closeApp();
      } else {
        window.close();
      }
    };
  }
}

function cancelActiveRecording() {
  if (!activeRecordingState) return;
  const { btn, badge, originalText, onKeyDown, onWindowClick } = activeRecordingState;
  window.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('mousedown', onWindowClick, true);
  btn.classList.remove('recording');
  btn.textContent = 'Rebind';
  badge.textContent = originalText;
  badge.classList.remove('listening');
  activeRecordingState = null;
  if (window.undecgpt && window.undecgpt.resumeShortcuts) {
    window.undecgpt.resumeShortcuts();
  }
}

function renderShortcuts() {
  const tbody = document.getElementById('shortcuts-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  const shortcuts = currentSettings.shortcuts || {};

  SHORTCUT_METADATA.forEach((meta) => {
    const currentKey = shortcuts[meta.id] || meta.default;
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.innerHTML = `<div class="shortcut-name">${meta.name}</div><div class="shortcut-desc">${meta.desc}</div>`;

    const keyTd = document.createElement('td');
    keyTd.className = 'shortcut-key-cell';

    const keyBadge = document.createElement('span');
    keyBadge.className = 'key-badge';
    keyBadge.textContent = formatKey(currentKey);

    const rebindBtn = document.createElement('button');
    rebindBtn.className = 'rebind-btn';
    rebindBtn.textContent = 'Rebind';
    rebindBtn.onclick = (e) => {
      e.stopPropagation();
      startRecording(meta.id, rebindBtn, keyBadge);
    };

    keyTd.appendChild(keyBadge);
    keyTd.appendChild(rebindBtn);

    tr.appendChild(nameTd);
    tr.appendChild(keyTd);
    tbody.appendChild(tr);
  });
}

function startRecording(actionId, btn, badge) {
  // If clicking the same button currently in recording mode, toggle off / cancel
  if (activeRecordingState && activeRecordingState.actionId === actionId) {
    cancelActiveRecording();
    showToast('Rebind cancelled');
    return;
  }

  // If another button was recording, cancel it first
  if (activeRecordingState) {
    cancelActiveRecording();
  }

  const originalText = badge.textContent;
  btn.classList.add('recording');
  btn.textContent = 'Cancel';
  badge.textContent = 'Press keys...';
  badge.classList.add('listening');

  // Pause global OS shortcuts so Electron doesn't consume keystrokes before Chromium
  if (window.undecgpt && window.undecgpt.pauseShortcuts) {
    window.undecgpt.pauseShortcuts();
  }

  const onKeyDown = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Escape cancels recording
    if (e.key === 'Escape') {
      cancelActiveRecording();
      showToast('Rebind cancelled');
      return;
    }

    // Ignore pure modifier keys (user is currently holding Ctrl/Alt/Shift)
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      return;
    }

    const acc = eventToAccelerator(e);
    if (!acc) return;

    // Validate: single alphanumeric character without modifier is prevented
    const hasModifier = e.ctrlKey || e.altKey || e.metaKey;
    const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/i.test(e.key);
    if (!hasModifier && !isFunctionKey) {
      showToast('Please include Ctrl or Alt (e.g. Ctrl + ' + (e.key.length === 1 ? e.key.toUpperCase() : e.key) + ')');
      return;
    }

    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('mousedown', onWindowClick, true);
    activeRecordingState = null;

    btn.classList.remove('recording');
    btn.textContent = 'Rebind';
    badge.classList.remove('listening');

    if (window.undecgpt && window.undecgpt.updateShortcut) {
      try {
        const updated = await window.undecgpt.updateShortcut(actionId, acc);
        currentSettings.shortcuts = updated;
        badge.textContent = formatKey(acc);
        showToast(`✅ Rebound to ${formatKey(acc)}`);
      } catch (err) {
        console.error('Failed to update shortcut:', err);
        badge.textContent = originalText;
        showToast('Failed to register shortcut');
      }
    } else {
      badge.textContent = formatKey(acc);
    }

    if (window.undecgpt && window.undecgpt.resumeShortcuts) {
      window.undecgpt.resumeShortcuts();
    }
  };

  const onWindowClick = (e) => {
    if (e.target !== btn && !btn.contains(e.target)) {
      cancelActiveRecording();
    }
  };

  activeRecordingState = { actionId, btn, badge, originalText, onKeyDown, onWindowClick };

  window.addEventListener('keydown', onKeyDown, true);
  setTimeout(() => {
    if (activeRecordingState && activeRecordingState.actionId === actionId) {
      window.addEventListener('mousedown', onWindowClick, true);
    }
  }, 100);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
