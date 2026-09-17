import { describe, expect, it } from 'vitest';
import manifestJson from './fixtures/processing-goldens.json';
import {
    createGoldenConfigs,
    generateGoldenCase,
    goldenCaseId,
    type GoldenManifest,
} from './goldenFixtures';

const manifest = manifestJson as unknown as GoldenManifest;

describe('processing golden fixtures', () => {
    it('contains the complete, unique programmatic cross-product', () => {
        const configs = createGoldenConfigs();
        expect(configs).toHaveLength(352);
        expect(manifest.schemaVersion).toBe(1);
        expect(manifest.cases).toHaveLength(configs.length);
        expect(manifest.cases.map(item => item.id)).toEqual(configs.map(goldenCaseId));
        expect(new Set(manifest.cases.map(item => item.id)).size).toBe(configs.length);
    });

    it.each(manifest.cases)('$id', ({ config, expected }) => {
        expect(generateGoldenCase(config).expected).toEqual(expected);
    });
});
