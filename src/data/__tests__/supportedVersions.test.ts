import { describe, it, expect } from 'vitest';
import palette from '../palette.json';
import { SUPPORTED_VERSIONS, DEFAULT_VERSION, MINECRAFT_DATA_VERSIONS, getDataVersion } from '../supportedVersions';
import { filterPaletteByVersion, isVersionLessOrEqual } from '../../utils/filterPaletteByVersion';
import type { PaletteColor } from '../../types/palette';

const colors = palette.colors as PaletteColor[];
const blockIds = (target: string) =>
    new Set(filterPaletteByVersion(colors, target).flatMap(c => c.blocks.map(b => b.id)));

describe('supportedVersions', () => {
    it('defaults to the newest supported version', () => {
        expect(DEFAULT_VERSION).toBe(SUPPORTED_VERSIONS[0].value);
    });

    it('covers every block version in the palette', () => {
        const introduced = colors.flatMap(c => c.blocks.map(b => b.introducedIn ?? '1.0.0'));
        for (const version of introduced) {
            expect(isVersionLessOrEqual(version, DEFAULT_VERSION)).toBe(true);
        }
        expect(palette.version).toBe(DEFAULT_VERSION);
    });

    it('lists versions newest first with increasing DataVersions', () => {
        for (let i = 1; i < SUPPORTED_VERSIONS.length; i++) {
            const newer = SUPPORTED_VERSIONS[i - 1].value;
            const older = SUPPORTED_VERSIONS[i].value;
            expect(isVersionLessOrEqual(older, newer)).toBe(true);
            expect(MINECRAFT_DATA_VERSIONS[older]).toBeLessThan(MINECRAFT_DATA_VERSIONS[newer]);
        }
    });

    it('exports 26.3 with its DataVersion', () => {
        expect(getDataVersion('26.3')).toBe(5023);
    });

    it('shows 26.3 blocks only from 26.3 on', () => {
        const ids26_2 = blockIds('26.2');
        const ids26_3 = blockIds('26.3');
        for (const id of ['minecraft:poplar_planks', 'minecraft:white_wool_slab', 'minecraft:black_concrete_slab']) {
            expect(ids26_2.has(id)).toBe(false);
            expect(ids26_3.has(id)).toBe(true);
        }
        expect(ids26_3.size - ids26_2.size).toBe(42);
    });
});
