import {
    applyManualEdits,
    processMapart,
    type ColorCandidate,
} from '../utils/processing';
import type { ManualEdit } from '../types/mapart';
import {
    cloneBuffer,
    createProcessingConfigKey,
    ProcessingEngineError,
    PROCESSING_PROTOCOL_VERSION,
    statsToProtocol,
    type ApplyEditsRequestV1,
    type ProcessingConfigV1,
    type ProcessingEngineV1,
    type ProcessingRequestV1,
    type ProcessingResponseV1,
} from './protocol';

interface BaseResult {
    key: string;
    sourceVersion: number;
    config: ProcessingConfigV1;
    imageData: ImageData;
    packedResults: Uint32Array;
    candidates: ColorCandidate[];
    toneMap: Int8Array | null;
    heightPath: Int32Array | null;
    stats: { minHeight: number; maxHeight: number; heightMap: Int32Array };
    floatBuffer: Float32Array;
}

function validateConfig(config: ProcessingConfigV1): void {
    if (!Number.isInteger(config.width) || !Number.isInteger(config.height) || config.width <= 0 || config.height <= 0) {
        throw new ProcessingEngineError('INVALID_DIMENSIONS', 'Processing dimensions must be positive integers.');
    }
}

function validateProtocol(protocolVersion: number): void {
    if (protocolVersion !== PROCESSING_PROTOCOL_VERSION) {
        throw new ProcessingEngineError(
            'INVALID_PROTOCOL',
            `Unsupported processing protocol version: ${protocolVersion}.`,
        );
    }
}

function validateSource(source: ProcessingRequestV1['source'], config: ProcessingConfigV1): ImageData {
    if (!source) {
        throw new ProcessingEngineError('SOURCE_REQUIRED', 'A source image is required for a new processing version.');
    }
    if (source.width !== config.width || source.height !== config.height) {
        throw new ProcessingEngineError('INVALID_DIMENSIONS', 'Source and processing dimensions must match.');
    }
    const expectedBytes = config.width * config.height * 4;
    if (source.rgba.byteLength !== expectedBytes) {
        throw new ProcessingEngineError(
            'SOURCE_SIZE_MISMATCH',
            `Expected ${expectedBytes} RGBA bytes, received ${source.rgba.byteLength}.`,
        );
    }

    // The engine never mutates the caller's buffer. This also makes the direct
    // TypeScript facade behave like a worker receiving an owned transferable.
    const rgba = new Uint8ClampedArray(source.rgba.slice(0));
    return new ImageData(rgba, config.width, config.height);
}

function hasEdits(manualEdits: Record<number, ManualEdit>): boolean {
    return Object.keys(manualEdits).length > 0;
}

export class TypeScriptEngine implements ProcessingEngineV1 {
    private base: BaseResult | null = null;

    process(request: ProcessingRequestV1): ProcessingResponseV1 {
        validateProtocol(request.protocolVersion);
        validateConfig(request.config);

        const key = createProcessingConfigKey(request.sourceVersion, request.config);
        if (!this.base || this.base.key !== key) {
            const source = validateSource(request.source, request.config);
            const result = processMapart(
                source,
                request.config.buildMode,
                request.config.selectedPaletteItems,
                request.config.threeDPrecision,
                request.config.dithering,
                request.config.usePerceptual,
                request.config.hybridStrength,
                request.config.independentMaps,
                this.base?.floatBuffer ?? null,
            );
            this.base = {
                key,
                sourceVersion: request.sourceVersion,
                config: request.config,
                imageData: result.imageData,
                packedResults: result.packedResults,
                candidates: result.candidates,
                toneMap: result.toneMap,
                heightPath: result.heightPath,
                stats: result.stats,
                floatBuffer: result.floatBuffer,
            };
        }

        const output = hasEdits(request.manualEdits)
            ? this.applyEditsInternal(request.manualEdits)
            : this.base;
        return this.toResponse(request.requestId, request.sourceVersion, output);
    }

    applyEdits(request: ApplyEditsRequestV1): ProcessingResponseV1 {
        validateProtocol(request.protocolVersion);
        validateConfig(request.config);

        const key = createProcessingConfigKey(request.sourceVersion, request.config);
        if (!this.base || this.base.key !== key) {
            throw new ProcessingEngineError('CACHE_MISS', 'No matching base result is available for manual edits.');
        }

        return this.toResponse(
            request.requestId,
            request.sourceVersion,
            hasEdits(request.manualEdits) ? this.applyEditsInternal(request.manualEdits) : this.base,
        );
    }

    clear(): void {
        this.base = null;
    }

    private applyEditsInternal(manualEdits: Record<number, ManualEdit>): BaseResult {
        if (!this.base) {
            throw new ProcessingEngineError('CACHE_MISS', 'No base result is available for manual edits.');
        }
        const result = applyManualEdits(
            this.base.imageData,
            this.base.packedResults,
            manualEdits,
            this.base.config.buildMode,
            this.base.candidates,
            this.base.toneMap,
            this.base.config.independentMaps,
        );
        return {
            ...this.base,
            imageData: result.imageData,
            packedResults: result.packedResults,
            toneMap: result.toneMap,
            heightPath: result.heightPath,
            stats: result.stats,
        };
    }

    private toResponse(requestId: number, sourceVersion: number, output: BaseResult): ProcessingResponseV1 {
        return {
            protocolVersion: PROCESSING_PROTOCOL_VERSION,
            requestId,
            sourceVersion,
            status: 'completed',
            width: output.imageData.width,
            height: output.imageData.height,
            buffers: {
                rgba: cloneBuffer(output.imageData.data),
                packedResults: cloneBuffer(output.packedResults),
                toneMap: output.toneMap ? cloneBuffer(output.toneMap) : null,
                heightPath: output.heightPath ? cloneBuffer(output.heightPath) : null,
            },
            stats: statsToProtocol(output.stats),
        };
    }
}
