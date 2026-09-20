import { app } from 'electron';
if (process.env.GLANCE_TEST_PROFILE) app.setPath('userData', process.env.GLANCE_TEST_PROFILE);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  process.exit(42);
} else {
  process.exit(0);
}
