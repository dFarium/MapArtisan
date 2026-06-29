import type { Remote } from 'comlink';
import type { MapartWorkerApi } from '../workers/mapart.worker';
import type { MapartStats, BrightnessLevel, RGB, BuildMode, ExportFormat } from '../types/mapart';
import type { MaterialCounts } from '../utils/export/materials';

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
    blobUrl: string;
}

export interface ProcessingParams {
    buildMode: BuildMode;
    selectedPaletteItems: Record<number, string | null>;
    threeDPrecision: number;
    dithering: string;
    usePerceptual: boolean;
    hybridStrength: number;
    independentMaps: boolean;
    manualEdits: Record<number, ManualEdit>;
}

export interface ManualEdit {
    blockId: string;
    brightness: BrightnessLevel;
    rgb: RGB;
    needsSupport?: boolean;
}

export interface ExportParams extends ProcessingParams {
    blockSupport: 'all' | 'needed' | 'gravity';
    supportBlockId: string;
    exportMode: 'full' | 'sections';
    paletteVersion: string;
    exportFormat: ExportFormat;
}

export type { MaterialCounts };
