const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function check(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) check(filename);
    else if (/\.(cjs|mjs|js)$/.test(filename)) {
      const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
      if (result.status !== 0) { console.error(filename, result.stderr); process.exitCode = 1; }
    }
  }
}
check('src'); check('tests');
