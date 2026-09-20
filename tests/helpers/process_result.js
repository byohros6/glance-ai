export function evaluateResult(code, signal, timedOut, stdout, stderr = '') {
  const lines = stdout.split(/\r?\n/).filter(line => line.startsWith('GLANCE_TEST_RESULT '));
  if (code !== 0 || signal || timedOut || lines.length !== 1) return false;
  try {
    const result = JSON.parse(lines[0].slice('GLANCE_TEST_RESULT '.length));
    return Number.isInteger(result.passed) && result.passed > 0 && result.failed === 0 && !/FAIL:|UNHANDLED_TEST_ERROR/.test(stdout + stderr);
  } catch { return false; }
}
