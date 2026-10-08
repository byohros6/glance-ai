# Contributing

Use Windows and Node.js 24. Clone the repository, run `npm ci`, then `npm start`.

Before submitting a pull request, run:

```sh
npm run check
npm run verify:repo
npm run test:release
npm test
```

Native focus and shortcut tests need an interactive Windows desktop. Avoid typing or changing foreground windows during those tests. See [testing](docs/testing.md) for their scope and limitations.

Keep patches focused. Preserve the providers' original web interfaces, existing settings and default shortcuts unless the change explicitly calls for different behavior. Do not add account cookies, credentials, screenshots of private conversations, generated executables, or local test reports to a pull request.

Include the problem, resulting behavior, and relevant validation in the pull request. For a runtime patch, increment the patch version in `package.json` and both root version fields in `package-lock.json`, and update `CHANGELOG.md`. Documentation-only changes do not need a version bump. Never rewrite a published release tag.

See [release preparation](docs/releasing.md) for checksums, draft releases, and publication.
