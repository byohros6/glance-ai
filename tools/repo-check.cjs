const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { versionInfo } = require('./release.cjs');
try {
  versionInfo();
  const pkg = JSON.parse(fs.readFileSync('package.json'));
  const lock = JSON.parse(fs.readFileSync('package-lock.json'));
  for (const [name, version] of Object.entries(pkg.devDependencies)) {
    if (version !== lock.packages['node_modules/' + name].version || lock.packages[''].devDependencies[name] !== version) throw new Error(`Dependency is not pinned consistently: ${name}`);
  }
  const tracked = execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean);
  for (const name of tracked) {
    if (/^(dist|node_modules|review|reports|\.aws|\.codex)\//.test(name) || (name !== '.env.example' && /(^|\/)\.env($|\.)|\.(exe|pem|key|pfx|p12)$/.test(name))) throw new Error(`Local/private artifact tracked: ${name}`);
  }
  for (const required of ['README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/testing.md', 'docs/releasing.md']) if (!fs.existsSync(required)) throw new Error(`Missing ${required}`);
  console.log('Repository layout, pinned dependencies, and release metadata verified.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
