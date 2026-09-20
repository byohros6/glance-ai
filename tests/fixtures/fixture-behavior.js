// Fixture behavior models upload acknowledgement and completed submission, not just event receipt.
(() => {
  function acceptedFile(target, file) {
    if (!file) return;
    const scope = target.closest('form') || target.parentElement || document.body;
    const progress = document.createElement('span'); progress.setAttribute('role', 'progressbar'); scope.append(progress);
    setTimeout(() => {
      progress.remove();
      const chip = document.createElement('span');
      chip.dataset.testid = 'attachment'; chip.setAttribute('data-test-id', 'attachment');
      chip.textContent = file.name; scope.append(chip);
    }, window.__fixtureUploadDelay || 50);
  }
  document.addEventListener('change', event => {
    if (event.target.matches('input[type="file"]')) acceptedFile(event.target, event.target.files?.[0]);
  });
  document.addEventListener('paste', event => {
    if (!event.target.matches('textarea, [contenteditable="true"]')) return;
    const file = event.clipboardData?.files?.[0];
    if (file) { event.preventDefault(); acceptedFile(event.target, file); }
  });
  document.addEventListener('drop', event => { acceptedFile(event.target, event.dataTransfer?.files?.[0]); });
  function submitted() {
    const editor = document.querySelector('textarea, [contenteditable="true"]');
    const message = document.createElement('div'); message.dataset.messageAuthorRole = 'user';
    message.textContent = editor?.value || editor?.textContent || 'Screenshot';
    document.querySelector('#chat-container')?.append(message) || document.body.append(message);
    if (editor) { if ('value' in editor) editor.value = ''; else editor.textContent = ''; }
  }
  document.addEventListener('click', event => {
    if (event.target.matches('#send-btn, #submit-btn') && !event.target.disabled && event.target.getAttribute('aria-disabled') !== 'true') submitted();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('textarea, [contenteditable="true"]') && !document.querySelector('#send-btn, #submit-btn')) submitted();
  });
})();
