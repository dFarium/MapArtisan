
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage, ImageData as CanvasImageData } from 'canvas';
import { processMapart } from '../src/utils/mapartProcessing';
import type { MapartStats } from '../src/types/mapart';
import paletteData from '../src/data/palette.json' with { type: 'json' };

// Polyfill ImageData for Node environment
(global as any).ImageData = CanvasImageData;

async function main() {
    const examplesDir = path.join(process.cwd(), 'examples');
    const files = fs.readdirSync(examplesDir).filter(f => f.match(/\.(png|jpg|jpeg)$/i));

    if (files.length === 0) {
        console.error('No images found in examples/ folder.');
        return;
    }

    console.log(`Found ${files.length} images to analyze.`);

    // Optimization Configuration
    // We will run TWO passes:
    // 1. Baseline (Standard)
    // 2. Optimized (Safe-Reset) -> To be implemented

    // Since we haven't implemented the toggle in mapartProcessing yet, 
    // we will seemingly run the same thing twice unless we modify the call.
    // This script essentially "Research Phase" code.

    for (const file of files) {
        console.log(`\nAnalyzing: ${file}`);
        const imagePath = path.join(examplesDir, file);

        try {
            const image = await loadImage(imagePath);
            const width = image.width;
            const height = image.height;

            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);

            const imageData = ctx.getImageData(0, 0, width, height);

            // Mock Palette Items (All selected)
            const mockSelectedPalette: Record<number, string | null> = {};
            // Assuming palette 1.21.11 structure
            (paletteData.colors as any[]).forEach(c => {
                mockSelectedPalette[c.colorID] = c.blocks[0].id; // Pick first block for each color
            });
            console.log(`  Palette loaded: ${Object.keys(mockSelectedPalette).length} colors selected.`);

            // --- RUN: 3D Valley (Optimized) ---
            const start = performance.now();
            const result = processMapart(
                imageData as unknown as ImageData, // Cast for node-canvas compatibility
                '3d_valley',
                mockSelectedPalette,
                100, // 3D Precision
                'none', // No dithering for pure height analysis first
                true, // CIELAB
                50,
                false // independentMaps
            );
            const time = performance.now() - start;

            const stats = result.stats;
            const range = stats.maxHeight - stats.minHeight;

            console.log(`  [3D Valley] Range: ${range} (${stats.minHeight} to ${stats.maxHeight}) | Time: ${time.toFixed(2)}ms`);

            // --- Detailed Column Analysis ---
            // If we had a baseline, we could compare. Now we just show the profile stats.
            const heightMap = stats.heightMap;
            if (heightMap) {
                // Calculate average height deviation?
                let totalAbsHeight = 0;
                for (let i = 0; i < heightMap.length; i++) {
                    totalAbsHeight += Math.abs(heightMap[i] - stats.minHeight);
                }
                const avgHeight = totalAbsHeight / heightMap.length;
                console.log(`  > Average Height (relative to min): ${avgHeight.toFixed(2)} blocks`);
            }

        } catch (err) {
            console.error(`  Error processing ${file}:`, err);
        }
    }
}

main();
