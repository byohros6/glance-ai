const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function versionInfo(root = process.cwd(), tag = process.env.RELEASE_TAG) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || lock.version !== pkg.version || lock.packages[''].version !== pkg.version) throw new Error('Package and lockfile versions must match');
  if (tag && tag !== `v${pkg.version}`) throw new Error('Release tag must match the package version');
  if (!fs.existsSync(path.join(root, 'docs/releases', `v${pkg.version}.md`))) throw new Error('Missing versioned release notes');
  return { version: pkg.version, electron: lock.packages['node_modules/electron'].version };
}
function names(version) {
  return [`Glance-AI-Setup-${version}.exe`, `Glance-AI-Portable-${version}.exe`, 'release-metadata.json'];
}
const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
function writeChecksums(directory, version) {
  const lines = names(version).map(name => {
    const filename = path.join(directory, name);
    if (!fs.statSync(filename).size) throw new Error(`Empty asset: ${name}`);
    return `${hash(filename)}  ${name}`;
  });
  fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
}
function verify(directory, version) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'release-metadata.json')));
  if (manifest.version !== version || !/^[0-9a-f]{40}$/.test(manifest.sourceCommit)) throw new Error('Invalid release manifest');
  const expected = new Set(names(version));
  const lines = fs.readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8').trim().split(/\r?\n/);
  if (lines.length !== expected.size) throw new Error('Unexpected checksum entries');
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})  ([A-Za-z0-9.-]+)$/);
    if (!match || !expected.delete(match[2])) throw new Error('Unexpected or duplicate asset name');
    if (hash(path.join(directory, match[2])) !== match[1]) throw new Error(`Checksum mismatch: ${match[2]}`);
  }
  return manifest;
}
function prepare(root = process.cwd()) {
  const info = versionInfo(root);
  if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) throw new Error('Commit changes before preparing release assets');
  const asar = require('@electron/asar');
  const archive = path.join(root, 'dist/win-unpacked/resources/app.asar');
  const packaged = JSON.parse(asar.extractFile(archive, 'package.json'));
  if (packaged.version !== info.version) throw new Error('Packaged version does not match source');
  const files = asar.listPackage(archive).map(name => name.replace(/^[/\\]/, '').replaceAll('\\', '/'));
  if (files.some(name => !['src', 'LICENSE', 'package.json'].includes(name) && !name.startsWith('src/'))) throw new Error('Unexpected file in application archive');
  if (!files.includes('src/main/main.js') || !files.includes('src/preload/preload.cjs')) throw new Error('Incomplete application archive');
  // A same-version stale archive must not be labeled with the current commit.
  for (const name of files) {
    const source = path.join(root, name);
    if (name === 'package.json') continue; // Builder removes development-only metadata.
    if (!fs.existsSync(source)) throw new Error(`Packaged file is absent from source: ${name}`);
    if (fs.statSync(source).isFile() && !asar.extractFile(archive, name).equals(fs.readFileSync(source))) throw new Error(`Packaged file differs from source: ${name}`);
  }
  const directory = path.join(root, 'dist');
  for (const name of names(info.version).slice(0, 2)) {
    const descriptor = fs.openSync(path.join(directory, name), 'r');
    const header = Buffer.alloc(2);
    try { fs.readSync(descriptor, header, 0, 2, 0); } finally { fs.closeSync(descriptor); }
    if (header.toString() !== 'MZ') throw new Error(`Invalid Windows executable: ${name}`);
  }
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(directory, 'release-metadata.json'), JSON.stringify({ ...info, sourceCommit, platform: 'win32', arch: 'x64', builtAt: new Date().toISOString(), signed: false }, null, 2) + '\n');
  writeChecksums(directory, info.version);
  verify(directory, info.version);
  console.log(`Prepared verified release assets for v${info.version}, source ${sourceCommit}`);
}
if (require.main === module) {
  try {
    if (process.argv[2] === 'prepare') prepare();
    else if (process.argv[2] === 'verify') { const info = versionInfo(); verify(path.resolve('dist'), info.version); console.log(`Checksums verified for v${info.version}`); }
    else if (process.argv[2] === 'check') { console.log(`Release metadata checked for v${versionInfo().version}`); }
    else throw new Error('Use check, prepare, or verify');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { versionInfo, writeChecksums, verify, prepare };
