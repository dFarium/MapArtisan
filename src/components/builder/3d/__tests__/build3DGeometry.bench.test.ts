/**
 * Benchmark de baseline para build3DGeometry.
 *
 * Estos benchmarks miden el rendimiento ACTUAL de la función de
 * construcción de geometría 3D (antes de cualquier optimización).
 *
 * Sirven para:
 *   1. Establecer una línea base de rendimiento
 *   2. Medir el impacto de cada optimización individual
 *   3. Detectar regresiones de rendimiento en el futuro
 *
 * Cómo interpretar los resultados:
 *   - Los logs muestran tiempo promedio en ms para N iteraciones
 *   - El campo `avgMs` es la métrica principal a comparar antes/después
 *   - Un umbral máximo soft se aplica para detectar regresiones graves
 *
 * Nomenclatura de escenarios:
 *   - Small:  1×1 mapa (128×128 bloques) — baseline mínimo
 *   - Medium: 2×2 mapas (256×256 bloques) — caso de uso típico
 *   - Large:  4×4 mapas (512×512 bloques) — caso de uso grande
 */

import { describe, it, expect } from 'vitest';
import { build3DGeometry, type GeometryParams, type BlockColorRGB } from '../build3DGeometry';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SUPPORT_COLOR: BlockColorRGB = { r: 128, g: 128, b: 128 };

/** Creates a noise-filled ImageData for realistic benchmark conditions */
function makeNoiseImageData(width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    // Use a deterministic LCG for reproducibility
    let seed = 42;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return (seed >>> 0) / 0xffffffff;
    };
    for (let i = 0; i < width * height; i++) {
        data[i * 4] = Math.floor(rand() * 256);
        data[i * 4 + 1] = Math.floor(rand() * 256);
        data[i * 4 + 2] = Math.floor(rand() * 256);
        data[i * 4 + 3] = 255;
    }
    return new ImageData(data, width, height);
}

/** Creates a realistic toneMap with a mix of -1, 0, 1 values */
function makeRealisticToneMap(width: number, height: number): Int8Array {
    const tones = new Int8Array(width * height);
    let seed = 99;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return (seed >>> 0) / 0xffffffff;
    };
    for (let i = 0; i < tones.length; i++) {
        const r = rand();
        tones[i] = r < 0.33 ? -1 : r < 0.66 ? 0 : 1;
    }
    return tones;
}

/** Runs a function N times and returns average + min + max ms */
function bench(label: string, fn: () => void, iterations = 10): { avgMs: number; minMs: number; maxMs: number } {
    // Warmup
    fn();
    fn();

    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        times.push(performance.now() - start);
    }

    const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    const minMs = Math.min(...times);
    const maxMs = Math.max(...times);

    console.log(
        `[BENCH] ${label}: avg=${avgMs.toFixed(2)}ms  min=${minMs.toFixed(2)}ms  max=${maxMs.toFixed(2)}ms  (${iterations} iters)`,
    );

    return { avgMs, minMs, maxMs };
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmarks
// ─────────────────────────────────────────────────────────────────────────────

describe('build3DGeometry — performance baseline', () => {

    it('[BASELINE] Small: 1×1 map (128×128 = 16 384 blocks, no support)', () => {
        const W = 128, H = 128;
        const imageData = makeNoiseImageData(W, H);
        const toneMap = makeRealisticToneMap(W, H);

        const params: GeometryParams = {
            imageData,
            toneMap,
            blockSupport: 'needed',
            supportColor: SUPPORT_COLOR,
        };

        const { avgMs } = bench(`Small 128×128 noSupport`, () => build3DGeometry(params));
        // Soft threshold: should finish well under 200ms on any modern machine
        expect(avgMs).toBeLessThan(200);
    });

    it('[BASELINE] Small: 1×1 map (128×128 = 16 384 blocks, all support)', () => {
        const W = 128, H = 128;
        const imageData = makeNoiseImageData(W, H);
        const toneMap = makeRealisticToneMap(W, H);

        const params: GeometryParams = {
            imageData,
            toneMap,
            blockSupport: 'all',
            supportColor: SUPPORT_COLOR,
        };

        const { avgMs } = bench(`Small 128×128 allSupport`, () => build3DGeometry(params));
        expect(avgMs).toBeLessThan(400);
    });

    it('[BASELINE] Medium: 2×2 maps (256×256 = 65 536 blocks, no support)', () => {
        const W = 256, H = 256;
        const imageData = makeNoiseImageData(W, H);
        const toneMap = makeRealisticToneMap(W, H);

        const params: GeometryParams = {
            imageData,
            toneMap,
            blockSupport: 'needed',
            supportColor: SUPPORT_COLOR,
        };

        const { avgMs } = bench(`Medium 256×256 noSupport`, () => build3DGeometry(params));
        expect(avgMs).toBeLessThan(800);
    });

    it('[BASELINE] Medium: 2×2 maps (256×256, all support)', () => {
        const W = 256, H = 256;
        const imageData = makeNoiseImageData(W, H);
        const toneMap = makeRealisticToneMap(W, H);

        const params: GeometryParams = {
            imageData,
            toneMap,
            blockSupport: 'all',
            supportColor: SUPPORT_COLOR,
        };

        const { avgMs } = bench(`Medium 256×256 allSupport`, () => build3DGeometry(params));
        expect(avgMs).toBeLessThan(1600);
    });

    it('[BASELINE] Large: 4×4 maps (512×512 = 262 144 blocks, no support)', () => {
        const W = 512, H = 512;
        const imageData = makeNoiseImageData(W, H);
        const toneMap = makeRealisticToneMap(W, H);

        const params: GeometryParams = {
            imageData,
            toneMap,
            blockSupport: 'needed',
            supportColor: SUPPORT_COLOR,
        };

        // Fewer iterations for the large case
        const { avgMs } = bench(`Large 512×512 noSupport`, () => build3DGeometry(params), 5);
        expect(avgMs).toBeLessThan(3000);
    });

    it('[BASELINE] Large: 4×4 maps (512×512, all support)', () => {
        const W = 512, H = 512;
        const imageData = makeNoiseImageData(W, H);
        const toneMap = makeRealisticToneMap(W, H);

        const params: GeometryParams = {
            imageData,
            toneMap,
            blockSupport: 'all',
            supportColor: SUPPORT_COLOR,
        };

        const { avgMs } = bench(`Large 512×512 allSupport`, () => build3DGeometry(params), 5);
        expect(avgMs).toBeLessThan(6000);
    });

    it('[BASELINE] Memory: count of instances matches expected ratio', () => {
        // For allSupport on a fully-elevated map, every block has a support below it.
        // So count should be ≈ 2 × (W × H) + W (noobline)
        const W = 32, H = 32;
        const imageData = makeNoiseImageData(W, H);
        // All high → every block gets elevated, so all get supports
        const toneMap = new Int8Array(W * H).fill(1);

        const geo = build3DGeometry({
            imageData,
            toneMap,
            blockSupport: 'all',
            supportColor: SUPPORT_COLOR,
        });

        // noobline (1 row × W) + map blocks + support blocks
        // not all map blocks will be elevated due to smart-drop path optimization,
        // so we just verify the ballpark
        expect(geo.count).toBeGreaterThan(W * H);
        expect(geo.count).toBeLessThanOrEqual(W * H * 2 + W + 1);
    });
});
