import { describe, expect, it } from 'vitest';
import { calculateMaterialCounts, imageDataToBlockStates, splitBlocksIntoSections, type ExportSection } from '../export';
import { NO_HEIGHT_LIMIT, processMapart, unpackTone } from '../processing';

const WIDTH = 128;
const HEIGHT = 256;
const SUPPORT = 'minecraft:cobblestone';
const PALETTE = {
    1: 'minecraft:grass_block',
    11: 'minecraft:stone',
    13: 'minecraft:oak_planks',
};

/** Diagonal waves so every column gets a different mix of up, flat and down tones. */
function testImage(): ImageData {
    const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const i = (y * WIDTH + x) * 4;
            const wave = 0.5 + 0.5 * Math.sin((x + y) / 9) * Math.cos(y / 23);
            data[i] = Math.round(60 + wave * 120);
            data[i + 1] = Math.round(80 + wave * 110);
            data[i + 2] = Math.round(50 + wave * 60);
            data[i + 3] = 255;
        }
    }
    return new ImageData(data, WIDTH, HEIGHT);
}

function exportSections(independentMaps: boolean, blockSupport: 'all' | 'needed') {
    const image = testImage();
    const { packedResults } = processMapart(image, '3d_valley', PALETTE, NO_HEIGHT_LIMIT, 'none', true, 50, independentMaps);
    const blocks = imageDataToBlockStates(
        image, PALETTE, '3d_valley', true, NO_HEIGHT_LIMIT, 'none', true, 50, independentMaps,
        undefined, blockSupport, SUPPORT, 'sections', packedResults,
    );
    return { packedResults, sections: splitBlocksIntoSections(blocks, WIDTH, HEIGHT, independentMaps) };
}

/** Top-most block per local (x, z): the block a map actually renders. */
function surface(section: ExportSection): Map<string, { y: number; blockId: string }> {
    const top = new Map<string, { y: number; blockId: string }>();
    const { blocks } = section;
    for (let i = 0; i < blocks.count; i++) {
        const key = `${blocks.x[i]},${blocks.z[i]}`;
        const current = top.get(key);
        if (!current || blocks.y[i] > current.y) {
            top.set(key, { y: blocks.y[i], blockId: blocks.palette[blocks.paletteIndices[i]] });
        }
    }
    return top;
}

/**
 * Asserts that a section renders exactly one map: a north reference row at
 * local z = 0 plus 128 pixel rows whose height steps reproduce every tone.
 */
function expectSectionMatchesTones(section: ExportSection, packedResults: Uint32Array) {
    const top = surface(section);
    const zValues = new Set<number>();
    for (const key of top.keys()) zValues.add(Number(key.split(',')[1]));
    expect(Math.min(...zValues)).toBe(0);
    expect(Math.max(...zValues)).toBe(128);
    expect(top.size).toBe(WIDTH * 129);

    for (let x = 0; x < WIDTH; x++) {
        for (let z = 1; z <= 128; z++) {
            const north = top.get(`${x},${z - 1}`)!;
            const block = top.get(`${x},${z}`)!;
            expect(block.blockId, `pixel at x=${x} z=${z}`).not.toBe(SUPPORT);
            const imageRow = section.sY * 128 + z - 1;
            const tone = unpackTone(packedResults[imageRow * WIDTH + x]);
            expect(Math.sign(block.y - north.y), `tone at x=${x} row=${imageRow}`).toBe(tone);
        }
    }
}

describe('splitBlocksIntoSections', () => {
    it('keeps every row of independent maps and gives each map its own noobline', () => {
        const { sections, packedResults } = exportSections(true, 'needed');

        expect(sections.map(section => [section.sX, section.sY])).toEqual([[0, 0], [0, 1]]);
        for (const section of sections) {
            expectSectionMatchesTones(section, packedResults);
            const top = surface(section);
            for (let x = 0; x < WIDTH; x++) {
                expect(top.get(`${x},0`)!.blockId).toBe(SUPPORT);
            }
        }
    });

    it('keeps physical supports with the map that owns their block', () => {
        const { sections, packedResults } = exportSections(true, 'all');

        for (const section of sections) {
            expectSectionMatchesTones(section, packedResults);
            expect(pixelBlockCount(section)).toBe(WIDTH * 128);
        }
    });

    it('shares the boundary row between global maps', () => {
        const { sections, packedResults } = exportSections(false, 'needed');

        for (const section of sections) {
            expectSectionMatchesTones(section, packedResults);
        }
        const firstTop = surface(sections[0]);
        const secondTop = surface(sections[1]);
        for (let x = 0; x < WIDTH; x++) {
            expect(secondTop.get(`${x},0`)!.blockId).toBe(firstTop.get(`${x},128`)!.blockId);
        }
    });
});

describe('calculateMaterialCounts with independent sections', () => {
    it('counts each noobline in the map that owns it', () => {
        const image = testImage();
        const counts = calculateMaterialCounts(
            image, PALETTE, '3d_valley', NO_HEIGHT_LIMIT, 'none', true, 50, true,
            undefined, 'needed', SUPPORT, 'sections',
        );

        expect(counts.total[SUPPORT]).toBe(WIDTH * 2);
        expect(counts.reusable[SUPPORT]).toBe(WIDTH);
    });
});

function pixelBlockCount(section: ExportSection): number {
    let count = 0;
    for (let i = 0; i < section.blocks.count; i++) {
        if (section.blocks.palette[section.blocks.paletteIndices[i]] !== SUPPORT) count++;
    }
    return count;
}
