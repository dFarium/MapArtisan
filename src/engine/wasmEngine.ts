import initWasm, { process_v1, type WasmProcessingResult } from '../wasm/processing/processing_wasm';
import { getValidColors } from '../utils/processing';
import type { ManualEdit } from '../types/mapart';
import type { ApplyEditsRequestV1, ProcessingConfigV1, ProcessingRequestV1, ProcessingResponseV1 } from './protocol';
import { TypeScriptEngine } from './typescriptEngine';

let initialization: Promise<unknown> | null = null;
type ThreadedWasmModule = typeof import('../wasm/processing-threaded/processing_wasm');
let threadedInitialization: Promise<ThreadedWasmModule | null> | null = null;

const THREADED_MIN_PIXELS = 512 * 512;
const MAX_WASM_THREADS = 4;

function initialize(): Promise<unknown> {
    initialization ??= initWasm();
    return initialization;
}

function supportsWasmThreads(): boolean {
    return globalThis.crossOriginIsolated === true
        && typeof globalThis.SharedArrayBuffer !== 'undefined';
}

function threadedWorkerCount(): number {
    const available = globalThis.navigator?.hardwareConcurrency ?? 2;
    return Math.max(1, Math.min(MAX_WASM_THREADS, available - 1));
}

function initializeThreaded(): Promise<ThreadedWasmModule | null> {
    threadedInitialization ??= (async () => {
        if (!supportsWasmThreads()) return null;
        try {
            const module = await import('../wasm/processing-threaded/processing_wasm');
            await module.default();
            await module.initThreadPool(threadedWorkerCount());
            return module;
        } catch {
            return null;
        }
    })();
    return threadedInitialization;
}

function ownedBuffer(view: ArrayBufferView): ArrayBuffer {
    if (view.byteOffset === 0 && view.byteLength === view.buffer.byteLength && view.buffer instanceof ArrayBuffer) {
        return view.buffer;
    }
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

function editsToDto(edits: Record<number, ManualEdit>) {
    return Object.entries(edits).map(([index, edit]) => ({
        index: Number(index),
        blockId: edit.blockId,
        brightness: edit.brightness === 'low' ? -1 : edit.brightness === 'high' ? 1 : 0,
        rgb: [edit.rgb.r, edit.rgb.g, edit.rgb.b],
        needsSupport: edit.needsSupport,
    }));
}

function paletteToDto(config: ProcessingConfigV1) {
    return getValidColors(config.selectedPaletteItems, config.buildMode).map(candidate => ({
        colorId: candidate.colorID,
        blockId: candidate.blockId,
        rgb: [candidate.rgb.r, candidate.rgb.g, candidate.rgb.b],
        brightness: candidate.brightness === 'low' ? -1 : candidate.brightness === 'high' ? 1 : 0,
        needsSupport: candidate.needsSupport,
    }));
}

function configToDto(requestId: number, sourceVersion: number, config: ProcessingConfigV1) {
    return {
        protocolVersion: 1,
        requestId,
        sourceVersion,
        width: config.width,
        height: config.height,
        buildMode: config.buildMode,
        threeDPrecision: config.threeDPrecision,
        dithering: config.dithering,
        usePerceptual: config.usePerceptual,
        hybridStrength: config.hybridStrength,
        independentMaps: config.independentMaps,
        blockSupport: config.blockSupport,
        supportBlockId: config.supportBlockId,
        exportMode: config.exportMode,
        exportFormat: config.exportFormat,
        paletteVersion: config.paletteVersion,
    };
}

function shouldUseWasm(config: ProcessingConfigV1): boolean {
    if (config.dithering === 'hybrid-v2') return true;
    if (!config.usePerceptual) return true;
    return config.dithering === 'none'
        || config.dithering === 'ordered'
        || config.dithering === 'ordered-8x8';
}

function shouldUseThreadedWasm(config: ProcessingConfigV1): boolean {
    return config.width * config.height >= THREADED_MIN_PIXELS
        && (config.dithering === 'floyd-steinberg'
            || config.dithering === 'adaptive'
            || config.dithering === 'hybrid-v2');
}

function toResponse(result: WasmProcessingResult): ProcessingResponseV1 {
    try {
        const rgba = result.rgba();
        const packed = result.packed_results();
        const tone = result.tone_map();
        const path = result.height_path();
        const heights = result.height_map();
        return {
            protocolVersion: result.protocol_version as 1,
            requestId: Number(result.request_id),
            sourceVersion: Number(result.source_version),
            status: 'completed',
            width: result.width,
            height: result.height,
            buffers: {
                rgba: ownedBuffer(rgba),
                packedResults: ownedBuffer(packed),
                toneMap: tone ? ownedBuffer(tone) : null,
                heightPath: path ? ownedBuffer(path) : null,
            },
            stats: {
                minHeight: result.min_height,
                maxHeight: result.max_height,
                heightMap: ownedBuffer(heights),
            },
        };
    } finally {
        result.free();
    }
}

export class WasmEngine {
    private cachedSource: Uint8Array | null = null;
    private cachedConfig: ProcessingConfigV1 | null = null;
    private readonly fallback: TypeScriptEngine;

    constructor(fallback: TypeScriptEngine) {
        this.fallback = fallback;
    }

    async process(request: ProcessingRequestV1): Promise<ProcessingResponseV1> {
        if (!request.source) return this.fallback.process(request);
        // Cached OKLab is faster for non-diffusion modes. Error diffusion
        // generates many adjusted colors, where the JS JIT still wins.
        const useSerialWasm = shouldUseWasm(request.config);
        const useThreadedWasm = shouldUseThreadedWasm(request.config);
        if (!useSerialWasm && !useThreadedWasm) return this.fallback.process(request);
        try {
            // The worker already owns the transferred source ArrayBuffer.
            // Keep a view instead of cloning it once more before wasm-bindgen.
            this.cachedSource = new Uint8Array(request.source.rgba);
            this.cachedConfig = request.config;
            const threaded = useThreadedWasm ? await initializeThreaded() : null;
            if (!threaded && !useSerialWasm) return this.fallback.process(request);
            if (!threaded) await initialize();
            const process = threaded?.process_v1 ?? process_v1;
            return toResponse(process(
                this.cachedSource,
                configToDto(request.requestId, request.sourceVersion, request.config),
                paletteToDto(request.config),
                editsToDto(request.manualEdits),
            ));
        } catch {
            return this.fallback.process(request);
        }
    }

    async applyEdits(request: ApplyEditsRequestV1): Promise<ProcessingResponseV1> {
        const useSerialWasm = shouldUseWasm(request.config);
        const useThreadedWasm = shouldUseThreadedWasm(request.config);
        if (!useSerialWasm && !useThreadedWasm) return this.fallback.applyEdits(request);
        if (!this.cachedSource || !this.cachedConfig) return this.fallback.applyEdits(request);
        try {
            const threaded = useThreadedWasm ? await initializeThreaded() : null;
            if (!threaded && !useSerialWasm) return this.fallback.applyEdits(request);
            if (!threaded) await initialize();
            const process = threaded?.process_v1 ?? process_v1;
            return toResponse(process(
                this.cachedSource,
                configToDto(request.requestId, request.sourceVersion, request.config),
                paletteToDto(request.config),
                editsToDto(request.manualEdits),
            ));
        } catch {
            return this.fallback.applyEdits(request);
        }
    }

    clear(): void {
        this.cachedSource = null;
        this.cachedConfig = null;
        this.fallback.clear();
    }
}
