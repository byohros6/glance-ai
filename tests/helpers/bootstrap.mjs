import { app } from 'electron';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const profile = process.env.GLANCE_TEST_PROFILE;
if (!profile) throw new Error('Tests require an isolated GLANCE_TEST_PROFILE');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
process.on('unhandledRejection', error => { console.error('UNHANDLED_TEST_ERROR', error); app.exit(1); });
process.on('uncaughtException', error => { console.error('UNHANDLED_TEST_ERROR', error); app.exit(1); });
await import(pathToFileURL(process.argv[2]).href);
