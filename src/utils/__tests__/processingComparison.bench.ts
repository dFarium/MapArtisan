import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GOLDEN_HYBRID_STRENGTH, GOLDEN_PALETTE, GOLDEN_THREE_D_PRECISION, makeGoldenSource } from './goldenFixtures';
import { getValidColors, processMapart, type BuildMode, type DitheringMode } from '../processing';
import { initSync, process_v1 } from '../../wasm/processing/processing_wasm';

interface Scenario { name: string; width: number; height: number; build: BuildMode; dither: DitheringMode; perceptual: boolean }
const scenarios: Scenario[] = [
    { name: '128-2d-none-rgb', width: 128, height: 128, build: '2d', dither: 'none', perceptual: false },
    { name: '512-2d-none-rgb', width: 512, height: 512, build: '2d', dither: 'none', perceptual: false },
    { name: '512-2d-none-oklab', width: 512, height: 512, build: '2d', dither: 'none', perceptual: true },
    { name: '512-2d-fs-rgb', width: 512, height: 512, build: '2d', dither: 'floyd-steinberg', perceptual: false },
    { name: '512-2d-fs-oklab', width: 512, height: 512, build: '2d', dither: 'floyd-steinberg', perceptual: true },
    { name: '512-3d-hybrid-oklab', width: 512, height: 512, build: '3d_valley', dither: 'hybrid', perceptual: true },
    { name: '512-3d-hybrid-v2-oklab', width: 512, height: 512, build: '3d_valley', dither: 'hybrid-v2', perceptual: true },
    { name: '1024x512-3d-hybrid-oklab', width: 1024, height: 512, build: '3d_valley', dither: 'hybrid', perceptual: true },
    { name: '1024x512-3d-hybrid-v2-oklab', width: 1024, height: 512, build: '3d_valley', dither: 'hybrid-v2', perceptual: true },
];

function percentile(sorted: number[], ratio: number): number { return sorted[Math.ceil((sorted.length - 1) * ratio)]; }

describe('TypeScript/Rust processing comparison baseline', () => {
    it('measures the TypeScript engine after warm-up', { timeout: 120_000 }, () => {
        console.log('engine,scenario,mean_ms,median_ms,p95_ms,min_ms,max_ms');
        for (const scenario of scenarios) {
            const source = makeGoldenSource(scenario.width, scenario.height);
            const iterations = scenario.width * scenario.height >= 500_000 ? 16 : 30;
            const warmup = 5;
            const values: number[] = [];
            for (let iteration = 0; iteration < iterations + warmup; iteration++) {
                const start = performance.now();
                processMapart(source, scenario.build, GOLDEN_PALETTE, GOLDEN_THREE_D_PRECISION,
                    scenario.dither, scenario.perceptual, GOLDEN_HYBRID_STRENGTH, false);
                if (iteration >= warmup) values.push(performance.now() - start);
            }
            values.sort((a, b) => a - b);
            const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
            console.log(`typescript,${scenario.name},${mean.toFixed(3)},${percentile(values, .5).toFixed(3)},${percentile(values, .95).toFixed(3)},${values[0].toFixed(3)},${values.at(-1)!.toFixed(3)}`);
        }
    });

    it('measures the WASM bridge including result buffer copies', { timeout: 120_000 }, () => {
        const bytes = readFileSync(resolve(process.cwd(), 'src/wasm/processing/processing_wasm_bg.wasm'));
        initSync({ module: bytes });
        console.log('engine,scenario,mean_ms,median_ms,p95_ms,min_ms,max_ms');
        for (const scenario of scenarios) {
            const source = makeGoldenSource(scenario.width, scenario.height);
            const sourceBytes = new Uint8Array(source.data.buffer, source.data.byteOffset, source.data.byteLength);
            const palette = getValidColors(GOLDEN_PALETTE, scenario.build).map(candidate => ({
                colorId: candidate.colorID, blockId: candidate.blockId,
                rgb: [candidate.rgb.r, candidate.rgb.g, candidate.rgb.b],
                brightness: candidate.brightness === 'low' ? -1 : candidate.brightness === 'high' ? 1 : 0,
                needsSupport: candidate.needsSupport,
            }));
            const config = {
                protocolVersion: 1, requestId: 1, sourceVersion: 1,
                width: scenario.width, height: scenario.height, buildMode: scenario.build,
                threeDPrecision: GOLDEN_THREE_D_PRECISION, dithering: scenario.dither,
                usePerceptual: scenario.perceptual, hybridStrength: GOLDEN_HYBRID_STRENGTH,
                independentMaps: false, blockSupport: 'all', supportBlockId: 'minecraft:cobblestone',
                exportMode: 'sections', exportFormat: 'litematic', paletteVersion: 'benchmark',
            };
            const iterations = scenario.width * scenario.height >= 500_000 ? 16 : 30;
            const warmup = 5;
            const values: number[] = [];
            for (let iteration = 0; iteration < iterations + warmup; iteration++) {
                const start = performance.now();
                const result = process_v1(sourceBytes, config, palette, []);
                result.rgba(); result.packed_results(); result.tone_map(); result.height_path(); result.height_map();
                result.free();
                if (iteration >= warmup) values.push(performance.now() - start);
            }
            values.sort((a, b) => a - b);
            const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
            console.log(`wasm,${scenario.name},${mean.toFixed(3)},${percentile(values, .5).toFixed(3)},${percentile(values, .95).toFixed(3)},${values[0].toFixed(3)},${values.at(-1)!.toFixed(3)}`);
        }
    });
});
