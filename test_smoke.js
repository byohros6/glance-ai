import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
// For direct invocation; npm run test:smoke uses the isolated test runner.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-smoke-'));
app.setPath('userData', profile);
process.env.GLANCE_TEST_PROFILE = profile;
await import('./tests/e2e/production_app.test.js');
