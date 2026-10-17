import { expose, transfer } from 'comlink';
import { getValidColors, unpackCandidateIdx, clearColorCache, clearOklabCache, type ColorCandidate } from '../utils/processing';
import {
    generateMapartExport,
    generateConstructionSections,
    buildConstructionSnapshot,
    resolveSnapshotSection,
    ConstructionSnapshotError,
    calculateMaterialCounts,
    type ConstructionSnapshot,
    type SnapshotSection,
} from '../utils/export';
import type { ManualEdit } from '../types/mapart';
import { build3DGeometry, type Build3DGeometryProps } from '../utils/geometry/build3DGeometry';
import { setDebugEnabled } from '../utils/diagnostic';
import { PROCESSING_PROTOCOL_VERSION, TypeScriptEngine, heightLimitOf, type ApplyEditsRequestV1, type CalculateMaterialsRequestV1, type CalculateMaterialsResponseV1, type GenerateExportRequestV1, type GenerateExportResponseV1, type GenerateSnapshotRequestV1, type GenerateSnapshotResponseV1, type ProcessingConfigV1, type ProcessingRequestV1, type ProcessingResponseV1 } from '../engine';

/**
 * Snapshot of the latest processed result, kept for block picking.
 *
 * Response buffers are transferred to the main thread and detach in the
 * worker, so the picker keeps its own copy of `packedResults`. Candidate
 * indices are only meaningful against the palette that produced them, so
 * the config travels with the buffer and candidates are derived lazily.
 */
let pickerState: {
    width: number;
    height: number;
    packedResults: Uint32Array;
    config: ProcessingConfigV1;
    candidates: ColorCandidate[] | null;
} | null = null;

const processingEngine = new TypeScriptEngine();

function rememberForPicker(response: ProcessingResponseV1, config: ProcessingConfigV1): void {
    pickerState = {
        width: response.width,
        height: response.height,
        packedResults: new Uint32Array(response.buffers.packedResults.slice(0)),
        config,
        candidates: null,
    };
}

function transferProcessingResponse(response: ProcessingResponseV1): ProcessingResponseV1 {
    const buffers = [
        response.buffers.rgba,
        response.buffers.packedResults,
        response.stats.heightMap,
    ];
    if (response.buffers.toneMap) buffers.push(response.buffers.toneMap);
    if (response.buffers.heightPath) buffers.push(response.buffers.heightPath);
    return transfer(response, buffers) as ProcessingResponseV1;
}

const api = {
    /** Receives the browser preference because Web Workers cannot access localStorage. */
    setDiagnosticsEnabled: (enabled: boolean): void => {
        setDebugEnabled(enabled);
    },

    clearCache: (): void => {
        pickerState = null;
        processingEngine.clear();
        clearColorCache();
        clearOklabCache();
    },

    /** Versioned processing contract used by the worker migration path. */
    processV1: async (request: ProcessingRequestV1): Promise<ProcessingResponseV1> => {
        const response = processingEngine.process(request);
        rememberForPicker(response, request.config);
        return transferProcessingResponse(response);
    },

    /** Applies edits against the cached v1 base result without re-quantizing. */
    applyEditsV1: async (request: ApplyEditsRequestV1): Promise<ProcessingResponseV1> => {
        const response = processingEngine.applyEdits(request);
        rememberForPicker(response, request.config);
        return transferProcessingResponse(response);
    },

    calculateMaterialCountsV1: (request: CalculateMaterialsRequestV1): CalculateMaterialsResponseV1 => {
        const processed = processingEngine.process(request);
        const imageData = new ImageData(
            new Uint8ClampedArray(processed.buffers.rgba),
            processed.width,
            processed.height,
        );
        const counts = calculateMaterialCounts(
            imageData,
            request.config.selectedPaletteItems,
            request.config.buildMode,
            heightLimitOf(request.config),
            request.config.dithering,
            request.config.usePerceptual,
            request.config.hybridStrength,
            request.config.independentMaps,
            {},
            request.config.blockSupport,
            request.config.supportBlockId,
            request.config.exportMode,
            new Uint32Array(processed.buffers.packedResults),
        );
        return {
            protocolVersion: PROCESSING_PROTOCOL_VERSION,
            requestId: request.requestId,
            sourceVersion: request.sourceVersion,
            status: 'completed',
            counts,
        };
    },

    generateMapartExportV1: async (request: GenerateExportRequestV1): Promise<GenerateExportResponseV1> => {
        const processed = processingEngine.process(request);
        const imageData = new ImageData(
            new Uint8ClampedArray(processed.buffers.rgba),
            processed.width,
            processed.height,
        );
        const result = await generateMapartExport(
            imageData,
            request.config.selectedPaletteItems,
            request.config.buildMode,
            request.filename,
            request.metadata,
            heightLimitOf(request.config),
            request.config.dithering,
            request.config.usePerceptual,
            request.config.hybridStrength,
            request.config.independentMaps,
            {},
            request.config.blockSupport,
            request.config.supportBlockId,
            request.config.exportMode,
            request.config.paletteVersion,
            new Uint32Array(processed.buffers.packedResults),
            request.config.exportFormat,
        );
        return {
            protocolVersion: PROCESSING_PROTOCOL_VERSION,
            requestId: request.requestId,
            sourceVersion: request.sourceVersion,
            status: 'completed',
            filename: result.filename,
            blob: result.blob,
        };
    },

    /**
     * Builds the construction snapshot of one section for the live preview connector.
     * It comes from the same generation as generateMapartExportV1, so it matches the
     * exported file for that section. The layout is validated before processing.
     */
    generateConstructionSnapshotV1: async (request: GenerateSnapshotRequestV1): Promise<GenerateSnapshotResponseV1> => {
        const { config } = request;
        const envelope = {
            protocolVersion: PROCESSING_PROTOCOL_VERSION,
            requestId: request.requestId,
            sourceVersion: request.sourceVersion,
        };
        const rejected = (error: unknown): GenerateSnapshotResponseV1 => {
            if (!(error instanceof ConstructionSnapshotError)) throw error;
            return { ...envelope, status: 'rejected', code: error.code, message: error.message };
        };

        let section: SnapshotSection;
        try {
            section = resolveSnapshotSection(config.width, config.height, config.exportMode, request.section);
        } catch (error) {
            return rejected(error);
        }

        const processed = processingEngine.process(request);
        const imageData = new ImageData(
            new Uint8ClampedArray(processed.buffers.rgba),
            processed.width,
            processed.height,
        );
        const construction = generateConstructionSections(
            imageData,
            config.selectedPaletteItems,
            config.buildMode,
            heightLimitOf(config),
            config.dithering,
            config.usePerceptual,
            config.hybridStrength,
            config.independentMaps,
            {},
            config.blockSupport,
            config.supportBlockId,
            config.exportMode,
            new Uint32Array(processed.buffers.packedResults),
        );
        let snapshot: ConstructionSnapshot;
        try {
            snapshot = buildConstructionSnapshot(construction, section, {
                buildMode: config.buildMode,
                blockSupport: config.blockSupport,
                supportBlockId: config.supportBlockId,
                minecraftVersion: config.paletteVersion,
            });
        } catch (error) {
            return rejected(error);
        }

        return transfer(
            { ...envelope, status: 'completed' as const, snapshot },
            [snapshot.x.buffer, snapshot.y.buffer, snapshot.z.buffer, snapshot.paletteIndices.buffer]
        );
    },

    /**
     * Retrieves the block at a pixel of the latest processed result.
     * Manual edits take precedence over the quantized base.
     */
    getBlockAt: (x: number, y: number, manualEdits: Record<number, ManualEdit>): ManualEdit | null => {
        if (!pickerState) return null;
        const { width, height, packedResults, config } = pickerState;
        if (x < 0 || y < 0 || x >= width || y >= height) return null;

        const index = y * width + x;
        if (manualEdits[index]) return manualEdits[index];

        pickerState.candidates ??= getValidColors(config.selectedPaletteItems, config.buildMode);
        const candidateIndex = unpackCandidateIdx(packedResults[index]);
        const candidate = pickerState.candidates[candidateIndex];
        if (!candidate) return null;
        return {
            blockId: candidate.blockId,
            brightness: candidate.brightness,
            rgb: candidate.rgb,
        };
    },

    /**
     * Runs `build3DGeometry` entirely off the main thread and returns the
     * resulting typed arrays as Transferable buffers (zero-copy).
     *
     * The caller must NOT use the passed-in `packedResults` buffer after this
     * call if it was transferred — pass a `.slice()` copy if the caller needs
     * to retain it.
     *
     * @param props All parameters for build3DGeometry. `packedResults` (if provided)
     *              will be sent by-value (structured clone) unless the caller
     *              explicitly transfers it beforehand.
     * @returns InstanceGeometry with positions, colors, and textureIds as
     *          Transferable Float32Array / Int16Array buffers.
     */
    build3DGeometryInWorker: (props: Build3DGeometryProps): {
        positions: Float32Array;
        colors: Float32Array;
        textureIds: Int16Array;
        uniqueTextureIds: string[];
        count: number;
    } => {
        const result = build3DGeometry(props);

        // Slice to exact size before transferring (subarray views share the original
        // over-allocated buffer, which would transfer the full allocation unnecessarily)
        const positions = result.positions.slice();
        const colors = result.colors.slice();
        const textureIds = result.textureIds.slice();

        return transfer(
            {
                positions,
                colors,
                textureIds,
                uniqueTextureIds: result.uniqueTextureIds,
                count: result.count,
            },
            [positions.buffer, colors.buffer, textureIds.buffer]
        );
    }
};

export type MapartWorkerApi = typeof api;

export const mapartWorkerApi = api;

expose(api);
