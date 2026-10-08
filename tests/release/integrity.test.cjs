const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeChecksums, verify, verifyArchive, versionInfo } = require('../../tools/release.cjs');

test('Release verification detects modified assets and rejects duplicate/path entries', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-integrity-'));
  try {
    fs.writeFileSync(path.join(directory, 'Glance-AI-Setup-1.2.8.exe'), 'MZinstaller');
    fs.writeFileSync(path.join(directory, 'Glance-AI-Portable-1.2.8.exe'), 'MZportable');
    fs.writeFileSync(path.join(directory, 'release-metadata.json'), JSON.stringify({version: '1.2.8', sourceCommit: 'a'.repeat(40)}));
    writeChecksums(directory, '1.2.8');
    assert.equal(verify(directory, '1.2.8').version, '1.2.8');
    fs.appendFileSync(path.join(directory, 'Glance-AI-Portable-1.2.8.exe'), 'changed');
    assert.throws(() => verify(directory, '1.2.8'), /mismatch/);
    writeChecksums(directory, '1.2.8');
    const sums = fs.readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8');
    fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), sums.replace('Glance-AI-Portable-1.2.8.exe', '../portable.exe'));
    assert.throws(() => verify(directory, '1.2.8'), /asset name/);
    fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), sums.replace('Glance-AI-Portable-1.2.8.exe', 'Glance-AI-Setup-1.2.8.exe'));
    assert.throws(() => verify(directory, '1.2.8'), /asset name/);
  } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});
test('Release tags must match checked-in version metadata', () => {
  const version = JSON.parse(fs.readFileSync('package.json')).version;
  assert.equal(versionInfo(process.cwd(), `v${version}`).version, version);
  assert.throws(() => versionInfo(process.cwd(), 'v99.0.0'), /tag/);
});

test('Real archives match source and reject stale or extra files', async () => {
  const asar = require('@electron/asar');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-archive-'));
  const source = path.join(directory, 'source');
  try {
    fs.mkdirSync(path.join(source, 'src/main'), {recursive: true});
    fs.mkdirSync(path.join(source, 'src/preload'), {recursive: true});
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({version: '1.2.8'}));
    fs.writeFileSync(path.join(source, 'LICENSE'), 'fixture license');
    fs.writeFileSync(path.join(source, 'src/main/main.js'), '// main fixture');
    fs.writeFileSync(path.join(source, 'src/preload/preload.cjs'), '// preload fixture');
    const archive = path.join(directory, 'app.asar');
    await asar.createPackage(source, archive);
    assert.doesNotThrow(() => verifyArchive(archive, source, '1.2.8'));
    assert.throws(() => verifyArchive(archive, source, '1.2.9'), /version/);
    fs.appendFileSync(path.join(source, 'src/main/main.js'), '\n// changed');
    assert.throws(() => verifyArchive(archive, source, '1.2.8'), /differs from source/);
    fs.writeFileSync(path.join(source, 'private-report.txt'), 'must not ship');
    const extraArchive = path.join(directory, 'extra.asar');
    await asar.createPackage(source, extraArchive);
    assert.throws(() => verifyArchive(extraArchive, source, '1.2.8'), /Unexpected file/);
  } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});
