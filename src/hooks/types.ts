import type { Remote } from 'comlink';
import type { MapartWorkerApi } from '../workers/mapart.worker';
import type { MapartStats, ManualEdit, BuildMode, ExportFormat } from '../types/mapart';
import type { MaterialCounts } from '../utils/export/materials';
import type { DitheringMode } from '../utils/processing';

export interface WorkerRefs {
    workerApiRef: React.RefObject<Remote<MapartWorkerApi> | null>;
    isProcessingRef: React.RefObject<boolean>;
    workerImageVersionRef: React.RefObject<number>;
}

export interface ProcessingResult {
    imageData: ImageData;
    stats: MapartStats;
    packedResults: Uint32Array;
    heightPath: Int32Array | null;
}

/** Parameters that determine the quantized map-art result and worker cache key. */
export interface ProcessingConfig {
    buildMode: BuildMode;
    selectedPaletteItems: Record<number, string | null>;
    threeDPrecision: number;
    dithering: DitheringMode;
    usePerceptual: boolean;
    hybridStrength: number;
    independentMaps: boolean;
}

export interface ProcessingParams extends ProcessingConfig {
    manualEdits: Record<number, ManualEdit>;
}

export interface ExportParams extends ProcessingParams {
    blockSupport: 'all' | 'needed' | 'gravity';
    supportBlockId: string;
    exportMode: 'full' | 'sections';
    paletteVersion: string;
    exportFormat: ExportFormat;
}

export type { MaterialCounts };
export type { ManualEdit };
