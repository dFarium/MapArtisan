/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * End-to-end tests against a running game with MapartisanConnector
 * (docs/litematica-live-preview-spec.md, section 12.3). Not part of `vitest run`:
 * start a session with /mapartisan start, then run `pnpm connector:e2e` with
 * CONNECTOR_TOKEN set to the token it copies.
 */
export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        include: ['e2e/**/*.e2e.ts'],
        testTimeout: 60_000,
        hookTimeout: 30_000,
        fileParallelism: false,
    },
});
