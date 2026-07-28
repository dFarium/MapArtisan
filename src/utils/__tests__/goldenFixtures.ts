import type { ManualEdit, MapartStats } from '../../types/mapart';
import {
    DITHERING_MODES,
    applyManualEdits,
    processMapart,
    type BuildMode,
    type ColorCandidate,
    type DitheringMode,
} from '../processing';

export const GOLDEN_MAP_EDGE = 128;
export const GOLDEN_THREE_D_PRECISION = 73;
export const GOLDEN_HYBRID_STRENGTH = 61;

export const GOLDEN_PALETTE: Record<number, string> = {
    1: 'minecraft:grass_block',
    4: 'minecraft:stone',
    8: 'minecraft:dirt',
    12: 'minecraft:white_wool',
    17: 'minecraft:oak_log',
    30: 'minecraft:red_wool',
    49: 'minecraft:obsidian',
};

export interface GoldenCaseConfig {
    gridX: 1 | 2;
    gridY: 1 | 2;
    buildMode: BuildMode;
    dithering: DitheringMode;
    usePerceptual: boolean;
    withEdits: boolean;
    independentMaps: boolean;
}

export interface GoldenProbe {
    x: number;
    y: number;
    rgba: [number, number, number, number];
    packed: number;
    tone: number | null;
    height: number | null;
}

export interface GoldenExpected {
    sourceRgba: string;
    processedRgba: string;
    packedResults: string;
    candidates: string;
    toneMap: string | null;
    heightPath: string | null;
    heightMap: string;
    minHeight: number;
    maxHeight: number;
    manualEditCount: number;
    probes: GoldenProbe[];
}

export interface GoldenCase {
    id: string;
    config: GoldenCaseConfig;
    expected: GoldenExpected;
}

export interface GoldenManifest {
    schemaVersion: 1;
    hashAlgorithm: 'fnv1a-64-le-bytes';
    mapEdge: number;
    threeDPrecision: number;
    hybridStrength: number;
    palette: Record<number, string>;
    cases: GoldenCase[];
}

interface FixtureOutput {
    imageData: ImageData;
    stats: MapartStats;
    packedResults: Uint32Array;
    toneMap: Int8Array | null;
    heightPath: Int32Array | null;
}

const BUILD_MODES: readonly BuildMode[] = ['2d', '3d_valley'];
const BOOLEAN_VALUES = [false, true] as const;
const GRIDS = [
    { gridX: 1, gridY: 1 },
    { gridX: 2, gridY: 2 },
] as const;

export function createGoldenConfigs(): GoldenCaseConfig[] {
    const configs: GoldenCaseConfig[] = [];
    for (const grid of GRIDS) {
        for (const buildMode of BUILD_MODES) {
            for (const dithering of DITHERING_MODES) {
                for (const usePerceptual of BOOLEAN_VALUES) {
                    for (const withEdits of BOOLEAN_VALUES) {
                        for (const independentMaps of BOOLEAN_VALUES) {
                            configs.push({ ...grid, buildMode, dithering, usePerceptual, withEdits, independentMaps });
                        }
                    }
                }
            }
        }
    }
    return configs;
}

export function goldenCaseId(config: GoldenCaseConfig): string {
    const grid = `${config.gridX}x${config.gridY}`;
    const colorSpace = config.usePerceptual ? 'oklab' : 'rgb';
    const edits = config.withEdits ? 'edits' : 'base';
    const segmentation = config.independentMaps ? 'independent' : 'continuous';
    return `${grid}__${config.buildMode}__${config.dithering}__${colorSpace}__${edits}__${segmentation}`;
}

export function makeGoldenSource(width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            let r = (x * 17 + y * 31 + (x ^ y) * 3) & 0xff;
            let g = (x * 7 + y * 13 + ((x >>> 4) * (y >>> 4)) * 19) & 0xff;
            let b = (x * x + y * y + x * y) & 0xff;

            // Make map seams visually and numerically distinctive.
            if (x % GOLDEN_MAP_EDGE === GOLDEN_MAP_EDGE - 1) [r, g, b] = [255, 0, 255];
            if (x % GOLDEN_MAP_EDGE === 0) [r, g, b] = [0, 255, 255];
            if (y % GOLDEN_MAP_EDGE === GOLDEN_MAP_EDGE - 1) [r, g, b] = [255, 255, 0];
            if (y % GOLDEN_MAP_EDGE === 0) [r, g, b] = [0, 0, 255];

            data[offset] = r;
            data[offset + 1] = g;
            data[offset + 2] = b;
            data[offset + 3] = 255;
        }
    }
    return new ImageData(data, width, height);
}

function fixtureCoordinates(width: number, height: number): Array<[number, number]> {
    const candidates: Array<[number, number]> = [
        [0, 0],
        [width - 1, 0],
        [0, height - 1],
        [width - 1, height - 1],
        [Math.floor(width / 2), Math.floor(height / 2)],
        [63, 63],
        [64, 64],
        [127, 127],
        [128, 127],
        [127, 128],
        [128, 128],
        [191, 64],
        [64, 191],
        [191, 191],
    ];
    const unique = new Map<string, [number, number]>();
    for (const [x, y] of candidates) {
        if (x >= 0 && x < width && y >= 0 && y < height) unique.set(`${x},${y}`, [x, y]);
    }
    return [...unique.values()];
}

function makeManualEdits(width: number, height: number, candidates: ColorCandidate[]): Record<number, ManualEdit> {
    const edits: Record<number, ManualEdit> = {};
    const points = fixtureCoordinates(width, height);
    for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        const candidate = candidates[(i * 7 + 3) % candidates.length];
        edits[y * width + x] = {
            blockId: candidate.blockId,
            brightness: candidate.brightness,
            rgb: candidate.rgb,
            needsSupport: i % 2 === 0 ? candidate.needsSupport : !candidate.needsSupport,
        };
    }
    return edits;
}

function fnv1a64(bytes: Uint8Array): string {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (const byte of bytes) {
        hash ^= BigInt(byte);
        hash = BigInt.asUintN(64, hash * prime);
    }
    return hash.toString(16).padStart(16, '0');
}

function hashView(view: ArrayBufferView | null): string | null {
    if (!view) return null;
    return fnv1a64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
}

function hashCandidates(candidates: ColorCandidate[]): string {
    const stableCandidates = candidates.map(candidate => ({
        colorID: candidate.colorID,
        brightness: candidate.brightness,
        rgb: candidate.rgb,
        blockId: candidate.blockId,
        needsSupport: candidate.needsSupport,
    }));
    return fnv1a64(new TextEncoder().encode(JSON.stringify(stableCandidates)));
}

function makeProbes(output: FixtureOutput, width: number, height: number): GoldenProbe[] {
    return fixtureCoordinates(width, height).map(([x, y]) => {
        const pixelIndex = y * width + x;
        const rgbaOffset = pixelIndex * 4;
        return {
            x,
            y,
            rgba: [
                output.imageData.data[rgbaOffset],
                output.imageData.data[rgbaOffset + 1],
                output.imageData.data[rgbaOffset + 2],
                output.imageData.data[rgbaOffset + 3],
            ],
            packed: output.packedResults[pixelIndex],
            tone: output.toneMap?.[pixelIndex] ?? null,
            height: output.heightPath?.[x * height + y] ?? null,
        };
    });
}

export function generateGoldenCase(config: GoldenCaseConfig): GoldenCase {
    const width = config.gridX * GOLDEN_MAP_EDGE;
    const height = config.gridY * GOLDEN_MAP_EDGE;
    const source = makeGoldenSource(width, height);
    const base = processMapart(
        source,
        config.buildMode,
        GOLDEN_PALETTE,
        GOLDEN_THREE_D_PRECISION,
        config.dithering,
        config.usePerceptual,
        GOLDEN_HYBRID_STRENGTH,
        config.independentMaps,
    );

    const edits = config.withEdits ? makeManualEdits(width, height, base.candidates) : {};
    const output: FixtureOutput = config.withEdits
        ? applyManualEdits(
            base.imageData,
            base.packedResults,
            edits,
            config.buildMode,
            base.candidates,
            base.toneMap,
            config.independentMaps,
        )
        : base;

    return {
        id: goldenCaseId(config),
        config,
        expected: {
            sourceRgba: hashView(source.data)!,
            processedRgba: hashView(output.imageData.data)!,
            packedResults: hashView(output.packedResults)!,
            candidates: hashCandidates(base.candidates),
            toneMap: hashView(output.toneMap),
            heightPath: hashView(output.heightPath),
            heightMap: hashView(output.stats.heightMap)!,
            minHeight: output.stats.minHeight,
            maxHeight: output.stats.maxHeight,
            manualEditCount: Object.keys(edits).length,
            probes: makeProbes(output, width, height),
        },
    };
}

export function generateGoldenManifest(): GoldenManifest {
    const configs = createGoldenConfigs();
    return {
        schemaVersion: 1,
        hashAlgorithm: 'fnv1a-64-le-bytes',
        mapEdge: GOLDEN_MAP_EDGE,
        threeDPrecision: GOLDEN_THREE_D_PRECISION,
        hybridStrength: GOLDEN_HYBRID_STRENGTH,
        palette: GOLDEN_PALETTE,
        cases: configs.map(generateGoldenCase),
    };
}
