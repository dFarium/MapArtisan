/// <reference types="node" />

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGoldenConfigs, generateGoldenManifest } from './goldenFixtures';

describe('processing golden fixture generator', () => {
    it('writes the complete programmatic permutation manifest', () => {
        const manifest = generateGoldenManifest();
        const target = resolve(process.cwd(), 'src/utils/__tests__/fixtures/processing-goldens.json');
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

        expect(createGoldenConfigs()).toHaveLength(320);
        expect(manifest.cases).toHaveLength(320);
        expect(new Set(manifest.cases.map(item => item.id)).size).toBe(320);
    }, 60_000);
});
