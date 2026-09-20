import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';
import { evaluateResult } from './helpers/process_result.js';
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'glance-tests-'));
const files = [];
for (const category of ['unit', 'window', 'injection', 'e2e', 'stress']) {
  for (const name of (await fs.readdir(path.join(directory, category))).sort()) {
    if (name.endsWith('.test.js')) files.push(`${category}/${name}`);
  }
}
const filters = process.argv.slice(2);
const selected = files.filter(file => !filters.length || filters.some(filter => file.includes(filter)));
if (!selected.length) { console.error('No matching test suites.'); process.exit(1); }
async function run(file) {
  const profile = path.join(root, file.replaceAll('/', '_'));
  const start = Date.now();
  return new Promise(resolve => {
    const child = spawn(electronPath, [path.join(directory, 'helpers/bootstrap.mjs'), path.join(directory, file)], {
      env: { ...process.env, GLANCE_TEST_PROFILE: profile, ELECTRON_ENABLE_LOGGING: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 90000);
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', error => { stderr += error.message; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ file, code, signal, timedOut, stdout, stderr, seconds: ((Date.now() - start) / 1000).toFixed(2), passed: evaluateResult(code, signal, timedOut, stdout, stderr) });
    });
  });
}
const results = [];
try {
  for (const file of selected) {
    const result = await run(file); results.push(result);
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${file} (${result.seconds}s)`);
    if (!result.passed) {
      console.error(`Exit code: ${result.code}; signal: ${result.signal || 'none'}; timeout: ${result.timedOut}`);
      console.log(result.stdout); console.error(result.stderr);
    }
  }
  console.log(`\n${results.filter(result => result.passed).length}/${results.length} suites passed.`);
  if (process.env.GLANCE_TEST_REPORT) await fs.writeFile(process.env.GLANCE_TEST_REPORT, JSON.stringify(results, null, 2));
} finally {
  // Only delete the unique directory created by this runner, never a user profile.
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(error => console.warn('Temporary test profile cleanup:', error.message));
}
process.exitCode = results.every(result => result.passed) ? 0 : 1;
