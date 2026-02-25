#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const previewServerRequire = createRequire(
  require.resolve('@react-email/preview-server/package.json'),
);
const emailCliEntry = require.resolve('react-email/dist/index.js');
const esbuildBinaryPath = previewServerRequire.resolve('esbuild/bin/esbuild');

const child = spawn(
  process.execPath,
  [emailCliEntry, 'dev', '--dir', 'src/lib/email/templates'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ESBUILD_BINARY_PATH: esbuildBinaryPath,
    },
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
