import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.goldens.config.ts'],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
