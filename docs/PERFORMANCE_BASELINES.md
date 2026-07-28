# TypeScript Processing Baselines

These measurements provide a reproducible reference for the TypeScript engine before the Rust/WASM port. They are regression indicators, not performance guarantees across browsers or machines.

## Official workload limit

The application accepts at most `128` maps (`gridX * gridY <= 128`), equivalent to `2,097,152` source pixels. There is no single maximum grid shape: `16x8`, `8x16`, and `128x1` all contain the same number of pixels. The representative maximum benchmark uses `16x8` maps, or `2048x1024` pixels.

## Method

- Command: `npm run bench -- src/utils/__tests__/referenceBenchmarks.bench.ts`
- Runtime: Node.js 24.14.0 with Vitest 4.1.8 and jsdom
- Platform: Windows x64
- Date: 2026-07-27
- Input: deterministic synthetic RGB pattern and five-color palette
- Processing: perceptual OKLab matching, hybrid dithering at strength 50
- Cache state: color and OKLab caches cleared before every scenario

## Local reference results

| Scenario | Maps | Mode | Time |
|---|---:|---|---:|
| 128x128 | 1x1 | 3D valley | 8.4 ms |
| 512x512 | 4x4 | 3D valley | 46.8 ms |
| 2048x1024 | 16x8 (128 total) | 3D valley | 308.7 ms |
| 512x512 | 4x4 | 2D | 112.8 ms |

The benchmark suite uses deliberately loose upper bounds to detect major regressions without treating normal machine variance as a failure. Browser latency and peak memory must still be measured independently in a production build.

## Browser memory reference

The production-build slider stress test previously measured a peak of approximately `136 MB` for the page and returned to approximately `67 MB` at rest. This manual observation established that the multi-gigabyte development-mode growth came from React development instrumentation rather than the production processing pipeline. Repeat this browser measurement when the engine or buffer ownership model changes.
