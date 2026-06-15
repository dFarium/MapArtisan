import { describe, it, expect, beforeEach } from 'vitest';
import { processMapart, clearColorCache, unpackTone, unpackCandidateIdx } from '../mapartProcessing';
import { generateMapartExport } from '../export/fileExport';
import JSZip from 'jszip';

const PALETTE_MULTI = {
    4:  'minecraft:stone',
    8:  'minecraft:dirt',
    17: 'minecraft:oak_log',
    49: 'minecraft:obsidian',
    1:  'minecraft:grass_block',
    12: 'minecraft:white_wool',
    30: 'minecraft:red_wool'
};

function makeGradientImage(w: number, h: number): ImageData {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const v = Math.round((i / (w * h - 1)) * 255);
        data[i * 4]     = v;
        data[i * 4 + 1] = Math.round(v * 0.75);
        data[i * 4 + 2] = Math.round(255 - v * 0.45);
        data[i * 4 + 3] = 255;
    }
    return new ImageData(data, w, h);
}

describe('Hotpath Regression Tests (512x512)', () => {
    beforeEach(() => {
        clearColorCache();
    });

    it('TC1: 2D None - compute baseline checksums', () => {
        const img = makeGradientImage(512, 512);
        const result = processMapart(img, '2d', PALETTE_MULTI, 50, 'none', true, 50, false);
        
        let toneCheck = 0;
        let indicesCheck = 0;
        for (let i = 0; i < result.packedResults.length; i++) {
            toneCheck += unpackTone(result.packedResults[i]);
            indicesCheck += unpackCandidateIdx(result.packedResults[i]);
        }
        
        console.log('[REGRESSION 2D NONE] Tone Checksum:', toneCheck);
        console.log('[REGRESSION 2D NONE] Indices Checksum:', indicesCheck);
        
        expect(toneCheck).toBe(0);
        expect(indicesCheck).toBe(818814);
        expect(result.packedResults.length).toBe(512 * 512);
    });

    it('TC2: 3D Valley + Floyd-Steinberg - compute baseline checksums', () => {
        const img = makeGradientImage(512, 512);
        const result = processMapart(img, '3d_valley', PALETTE_MULTI, 50, 'floyd-steinberg', true, 50, false);
        
        let toneCheck = 0;
        let indicesCheck = 0;
        for (let i = 0; i < result.packedResults.length; i++) {
            toneCheck += unpackTone(result.packedResults[i]);
            indicesCheck += unpackCandidateIdx(result.packedResults[i]);
        }
        
        console.log('[REGRESSION 3D FLOYD] Tone Checksum:', toneCheck);
        console.log('[REGRESSION 3D FLOYD] Indices Checksum:', indicesCheck);
        
        expect(toneCheck).toBe(0);
        expect(indicesCheck).toBe(2585449);
        expect(result.packedResults.length).toBe(512 * 512);
    });

    it('TC3: 2D Ordered Dithering - compute baseline checksums', () => {
        const img = makeGradientImage(512, 512);
        const result = processMapart(img, '2d', PALETTE_MULTI, 50, 'ordered', false, 50, false);
        
        let toneCheck = 0;
        let indicesCheck = 0;
        for (let i = 0; i < result.packedResults.length; i++) {
            toneCheck += unpackTone(result.packedResults[i]);
            indicesCheck += unpackCandidateIdx(result.packedResults[i]);
        }
        
        console.log('[REGRESSION ORDERED] Tone Checksum:', toneCheck);
        console.log('[REGRESSION ORDERED] Indices Checksum:', indicesCheck);
        
        expect(toneCheck).toBe(0);
        expect(indicesCheck).toBe(888675);
        expect(result.packedResults.length).toBe(512 * 512);
    });

    it('TC4: E2E Export Pipeline Regression (2x2 Multi-Map Split)', async () => {
        // Create a 256x256 image (which splits into exactly 2x2 = 4 maps of 128x128)
        const img = makeGradientImage(256, 256);
        const result = processMapart(img, '3d_valley', PALETTE_MULTI, 50, 'floyd-steinberg', true, 50, false);

        // Run full export pipeline
        const exportResult = await generateMapartExport(
            img, PALETTE_MULTI, '3d_valley', 'regression_mapart.litematic',
            { name: 'Regression', author: 'Author', description: 'Desc' },
            0, 'floyd-steinberg', true, 50, false, undefined, 'all', 'minecraft:cobblestone',
            'sections', '1.20', result.packedResults
        );

        expect(exportResult.filename).toBe('regression_mapart_package.zip');
        expect(exportResult.blob).toBeDefined();

        // Load and verify the generated ZIP archive
        const zip = await JSZip.loadAsync(await exportResult.blob.arrayBuffer());
        const filenames = Object.keys(zip.files);

        // Should contain exactly 4 section files
        expect(filenames.length).toBe(4);
        expect(filenames).toContain('regression_mapart_0_0.litematic');
        expect(filenames).toContain('regression_mapart_0_1.litematic');
        expect(filenames).toContain('regression_mapart_1_0.litematic');
        expect(filenames).toContain('regression_mapart_1_1.litematic');

        // Verify that each section contains non-empty binary data
        for (const filename of filenames) {
            const fileData = await zip.files[filename].async('uint8array');
            expect(fileData.length).toBeGreaterThan(100); // Standard compressed NBT should be larger than 100 bytes
        }
    });
});
