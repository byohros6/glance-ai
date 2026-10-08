# Releases

Release tags identify immutable source commits. Windows executables belong in GitHub Releases, not Git. Keep existing releases and tags intact.

## Local preparation

Use Windows, Node 24, and a clean checkout:

```sh
npm ci
npm run check
npm run verify:repo
npm run test:release
npm test
npm run dist
npm run release:prepare
npm run release:verify
```

`release:prepare` checks the packaged archive's version and file allowlist, writes a build manifest, and hashes the exact installer, portable executable, and manifest. `release:verify` checks every checksum. Results are in `dist/`: the two versioned executables, `release-metadata.json`, and `SHA256SUMS.txt`. It never selects an older executable from the same directory.

The manifest records the source commit and locked Electron version. Build from committed source; preparation refuses a dirty working tree. Run the packaged smoke test with `GLANCE_TEST_APP_ROOT` pointing to `dist/win-unpacked/resources/app.asar` and validate your logged-in provider manually before publishing. Automated fixtures do not establish live login compatibility.

## Draft release workflow

Create and push a tag matching the package version, such as `v1.2.8`. The **Prepare Windows draft release** workflow checks version agreement, tests, builds, verifies the package/checksums, and uploads a **draft** GitHub release. It never publishes automatically. Manual dispatch can prepare an existing matching tag. The workflow refuses to modify an existing release instead of silently replacing its assets.

Review the notes and assets in GitHub, test the download, then publish the draft. A public repository exposes its history and existing releases as well as current files; review those before changing visibility.

## Verify a download

In PowerShell:

```powershell
Get-FileHash .\Glance-AI-Portable-1.2.8.exe -Algorithm SHA256
```

Compare the result to the corresponding line in the downloaded `SHA256SUMS.txt`. Checksums detect a changed asset; they do not replace code signing. No signing certificate is configured in the repository. GitHub's generated source archives contain source code, not the ready-to-run Windows app.
