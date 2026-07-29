import type { ManualEdit, MapartStats, BuildMode } from '../types/mapart';
import type { DitheringMode } from '../utils/processing';

export const PROCESSING_PROTOCOL_VERSION = 1 as const;

/** Configuration fields that affect quantization and the engine cache key. */
export interface ProcessingConfigV1 {
    width: number;
    height: number;
    buildMode: BuildMode;
    selectedPaletteItems: Record<number, string | null>;
    threeDPrecision: number;
    dithering: DitheringMode;
    usePerceptual: boolean;
    hybridStrength: number;
    independentMaps: boolean;
}

/** An RGBA buffer whose ownership may be transferred by the transport layer. */
export interface ImageBufferV1 {
    width: number;
    height: number;
    rgba: ArrayBuffer;
}

export interface ProcessingRequestV1 {
    protocolVersion: typeof PROCESSING_PROTOCOL_VERSION;
    requestId: number;
    sourceVersion: number;
    config: ProcessingConfigV1;
    source: ImageBufferV1 | null;
    manualEdits: Record<number, ManualEdit>;
}

export interface ApplyEditsRequestV1 {
    protocolVersion: typeof PROCESSING_PROTOCOL_VERSION;
    requestId: number;
    sourceVersion: number;
    config: ProcessingConfigV1;
    manualEdits: Record<number, ManualEdit>;
}

export interface ProcessingBuffersV1 {
    rgba: ArrayBuffer;
    packedResults: ArrayBuffer;
    toneMap: ArrayBuffer | null;
    heightPath: ArrayBuffer | null;
}

export interface ProcessingStatsV1 {
    minHeight: number;
    maxHeight: number;
    heightMap: ArrayBuffer;
}

export interface ProcessingResponseV1 {
    protocolVersion: typeof PROCESSING_PROTOCOL_VERSION;
    requestId: number;
    sourceVersion: number;
    status: 'completed';
    width: number;
    height: number;
    buffers: ProcessingBuffersV1;
    stats: ProcessingStatsV1;
}

export interface ProcessingEngineV1 {
    process(request: ProcessingRequestV1): ProcessingResponseV1;
    applyEdits(request: ApplyEditsRequestV1): ProcessingResponseV1;
    clear(): void;
}

export type ProcessingEngineErrorCode =
    | 'INVALID_PROTOCOL'
    | 'INVALID_DIMENSIONS'
    | 'SOURCE_REQUIRED'
    | 'SOURCE_SIZE_MISMATCH'
    | 'CACHE_MISS';

export class ProcessingEngineError extends Error {
    readonly code: ProcessingEngineErrorCode;

    constructor(code: ProcessingEngineErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'ProcessingEngineError';
    }
}

/** Stable cache key shared by the TypeScript facade and future Rust adapters. */
export function createProcessingConfigKey(sourceVersion: number, config: ProcessingConfigV1): string {
    const palette = Object.entries(config.selectedPaletteItems)
        .map(([index, blockId]) => [Number(index), blockId] as const)
        .sort(([a], [b]) => a - b);

    return JSON.stringify([
        sourceVersion,
        config.width,
        config.height,
        config.buildMode,
        palette,
        config.threeDPrecision,
        config.dithering,
        config.usePerceptual,
        config.hybridStrength,
        config.independentMaps,
    ]);
}

export function statsToProtocol(stats: MapartStats): ProcessingStatsV1 {
    return {
        minHeight: stats.minHeight,
        maxHeight: stats.maxHeight,
        heightMap: cloneBuffer(stats.heightMap),
    };
}

export function cloneBuffer(view: ArrayBufferView): ArrayBuffer {
    const source = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const copy = new Uint8Array(source.byteLength);
    copy.set(source);
    return copy.buffer;
}
