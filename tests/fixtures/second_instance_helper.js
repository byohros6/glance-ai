import { app } from 'electron';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  process.exit(42);
} else {
  process.exit(0);
}
