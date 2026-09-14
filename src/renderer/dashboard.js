// Dashboard Logic
const PROMPT_PRESETS = {
  coding: 'Solve this coding problem step-by-step with optimal time and space complexity. Provide clean, well-commented code in the requested language. Highlight edge cases.',
  interview: 'Analyze the technical question shown in the image. Outline the thought process clearly, explain trade-offs, and write the complete, optimal solution.',
  exam: 'Identify the exact question and options shown in the image. Provide the correct answer choice clearly with a concise, factual explanation.',
  general: 'Analyze the screenshot and answer what is being asked clearly, directly, and thoroughly.'
};

const SHORTCUT_METADATA = [
  { id: 'screenshot', name: 'Screenshot & Attach', desc: 'Captures screen with pre-roll hide and attaches to Gemini input', default: 'CommandOrControl+S' },
  { id: 'send', name: 'Send to Gemini', desc: 'Submits the attached screenshot and prompt to Gemini', default: 'CommandOrControl+Return' },
  { id: 'returnHome', name: 'Dashboard / Menu', desc: 'Toggles between Gemini overlay and this Configuration Dashboard', default: 'CommandOrControl+B' },
  { id: 'toggleVisibility', name: 'Boss Key / Hide', desc: 'Silently toggles visibility of the overlay window', default: 'CommandOrControl+H' },
  { id: 'toggleFocus', name: 'Toggle Focusable', desc: 'When OFF, clicking overlay will not unfocus other applications', default: 'CommandOrControl+F' },
  { id: 'toggleClickThrough', name: 'Toggle Click-Through', desc: 'When ON, mouse clicks pass directly through overlay', default: 'CommandOrControl+M' },
  { id: 'moveUp', name: 'Move Window Up', desc: 'Nudges window upwards by 40px', default: 'CommandOrControl+Up' },
  { id: 'moveDown', name: 'Move Window Down', desc: 'Nudges window downwards by 40px', default: 'CommandOrControl+Down' },
  { id: 'moveLeft', name: 'Move Window Left', desc: 'Nudges window leftwards by 40px', default: 'CommandOrControl+Left' },
  { id: 'moveRight', name: 'Move Window Right', desc: 'Nudges window rightwards by 40px', default: 'CommandOrControl+Right' },
  { id: 'scrollUp', name: 'Scroll Chat Up', desc: 'Scrolls chat history up', default: 'CommandOrControl+Shift+Up' },
  { id: 'scrollDown', name: 'Scroll Chat Down', desc: 'Scrolls chat history down', default: 'CommandOrControl+Shift+Down' },
  { id: 'opacityDown', name: 'Decrease Opacity', desc: 'Decreases window opacity by 10%', default: 'CommandOrControl+[' },
  { id: 'opacityUp', name: 'Increase Opacity', desc: 'Increases window opacity by 10%', default: 'CommandOrControl+]' },
  { id: 'emergencyExit', name: 'Emergency Kill Switch', desc: 'Immediately closes UndecGPT with zero confirmation', default: 'CommandOrControl+Shift+Q' }
];

let currentSettings = {};
let activeRecordingId = null;

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
  }, 2000);
}

async function init() {
  if (!window.undecgpt) {
    console.error('undecgpt API not available in preload');
    return;
  }

  currentSettings = await window.undecgpt.getSettings();

  // Inputs
  const inputWidth = document.getElementById('input-width');
  const valWidth = document.getElementById('val-width');
  const inputHeight = document.getElementById('input-height');
  const valHeight = document.getElementById('val-height');
  const inputOpacity = document.getElementById('input-opacity');
  const valOpacity = document.getElementById('val-opacity');
  const toggleFocusable = document.getElementById('toggle-focusable');
  const toggleClickthrough = document.getElementById('toggle-clickthrough');
  const promptTextarea = document.getElementById('prompt-textarea');
  const promptCharCount = document.getElementById('prompt-char-count');

  // Populate values
  const w = currentSettings.windowWidth || 520;
  const h = currentSettings.windowHeight || 650;
  const op = currentSettings.opacity || 0.95;

  inputWidth.value = w;
  valWidth.textContent = w + 'px';

  inputHeight.value = h;
  valHeight.textContent = h + 'px';

  inputOpacity.value = op;
  valOpacity.textContent = Math.round(op * 100) + '%';

  toggleFocusable.checked = currentSettings.focusable !== false;
  toggleClickthrough.checked = !!currentSettings.clickThrough;

  promptTextarea.value = currentSettings.prompt || '';
  promptCharCount.textContent = (currentSettings.prompt || '').length + ' characters';

  // Event Listeners for dimensions
  inputWidth.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    valWidth.textContent = val + 'px';
    window.undecgpt.saveSettings({ windowWidth: val });
  });

  inputHeight.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    valHeight.textContent = val + 'px';
    window.undecgpt.saveSettings({ windowHeight: val });
  });

  // Size Presets
  document.querySelectorAll('.preset-btn[data-w]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nw = parseInt(btn.getAttribute('data-w'), 10);
      const nh = parseInt(btn.getAttribute('data-h'), 10);
      inputWidth.value = nw;
      valWidth.textContent = nw + 'px';
      inputHeight.value = nh;
      valHeight.textContent = nh + 'px';
      window.undecgpt.saveSettings({ windowWidth: nw, windowHeight: nh });
      showToast('Dimensions set to ' + nw + 'x' + nh + 'px');
    });
  });

  // Opacity
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
    showToast(checked ? 'Focusable Mode enabled' : 'Non-Activating Focus enabled');
  });

  // Click-Through Toggle
  toggleClickthrough.addEventListener('change', (e) => {
    const checked = e.target.checked;
    window.undecgpt.saveSettings({ clickThrough: checked });
    window.undecgpt.setClickThrough(checked);
    showToast(checked ? 'Click-Through Mode enabled' : 'Click-Through Mode disabled');
  });

  // Prompt Editing & Presets
  promptTextarea.addEventListener('input', (e) => {
    const text = e.target.value;
    promptCharCount.textContent = text.length + ' characters';
    window.undecgpt.saveSettings({ prompt: text });
  });

  document.querySelectorAll('#prompt-presets button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const presetKey = btn.getAttribute('data-preset');
      if (PROMPT_PRESETS[presetKey]) {
        promptTextarea.value = PROMPT_PRESETS[presetKey];
        promptCharCount.textContent = promptTextarea.value.length + ' characters';
        window.undecgpt.saveSettings({ prompt: promptTextarea.value });
        showToast('Applied ' + btn.textContent.trim() + ' preset');
      }
    });
  });

  // Render Shortcuts Table
  renderShortcuts();

  // Reset Shortcuts Button
  document.getElementById('btn-reset-shortcuts').addEventListener('click', async () => {
    if (window.undecgpt.resetShortcuts) {
      currentSettings.shortcuts = await window.undecgpt.resetShortcuts();
      renderShortcuts();
      showToast('Keybinds reset to defaults');
    }
  });

  // Launch Gemini Button
  document.getElementById('btn-launch-gemini').addEventListener('click', () => {
    if (window.undecgpt.launchGemini) {
      window.undecgpt.launchGemini();
    }
  });

  // Window Controls
  document.getElementById('btn-minimize').addEventListener('click', () => {
    window.undecgpt.hideWindow();
  });

  document.getElementById('btn-close').addEventListener('click', () => {
    window.undecgpt.closeApp();
  });
}

function renderShortcuts() {
  const tbody = document.getElementById('shortcuts-body');
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
    rebindBtn.onclick = () => startRecording(meta.id, rebindBtn, keyBadge);

    keyTd.appendChild(keyBadge);
    keyTd.appendChild(rebindBtn);

    tr.appendChild(nameTd);
    tr.appendChild(keyTd);
    tbody.appendChild(tr);
  });
}

function startRecording(actionId, btn, badge) {
  if (activeRecordingId) return;
  activeRecordingId = actionId;
  btn.classList.add('recording');
  btn.textContent = 'Press Keys...';
  badge.textContent = 'Listening...';

  const onKeyDown = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const acc = eventToAccelerator(e);
    if (!acc) return; // Modifier key alone, wait for full combo

    window.removeEventListener('keydown', onKeyDown, true);
    activeRecordingId = null;
    btn.classList.remove('recording');
    btn.textContent = 'Rebind';

    if (window.undecgpt.updateShortcut) {
      const updated = await window.undecgpt.updateShortcut(actionId, acc);
      currentSettings.shortcuts = updated;
      badge.textContent = formatKey(acc);
      showToast(`Keybind for ${actionId} updated to ${formatKey(acc)}`);
    }
  };

  window.addEventListener('keydown', onKeyDown, true);
}

window.addEventListener('DOMContentLoaded', init);
