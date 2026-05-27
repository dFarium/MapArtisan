import { create } from 'zustand';
import type { MapartStats, ManualEdit, BuildMode, ExportMode, PreviewSection } from '../types/mapart';
import { DEFAULT_VERSION } from '../data/supportedVersions';

export type BlockSupport = 'all' | 'needed' | 'gravity';
export type ImageFitMode = 'adjust' | 'crop';

/**
 * Filter settings applied to the source image before processing.
 */
export interface ImageSettings {
    saturation: number;
    brightness: number;
    contrast: number;
}

/**
 * Dimensions of the mapart in Minecraft maps grid (e.g. 1x1, 2x2 maps).
 */
export interface GridDimensions {
    x: number;
    y: number;
}

/**
 * Zoom and offsets configuration for cropping and viewport adjustment.
 */
export interface CropSettings {
    zoom: number;
    offsetX: number;
    offsetY: number;
}

const defaultCropSettings: CropSettings = {
    zoom: 1,
    offsetX: 0,
    offsetY: 0
};

/**
 * Zustand global application state for Mapart Creator.
 */
export interface MapartState {
    /** Target Minecraft version to filter palettes */
    paletteVersion: string;
    /** Image adjustment filters */
    imageSettings: ImageSettings;
    /** Layout grid size in maps */
    gridDimensions: GridDimensions;
    /** Output build layout strategy (2D flat vs 3D valley steps) */
    buildMode: BuildMode;
    /** Support block placement strategy */
    blockSupport: BlockSupport;
    /** Namespace-key of the block used for nooblines and underneath supports */
    supportBlockId: string;
    /** Export format splitting (export as whole map or split region sections) */
    exportMode: ExportMode;
    /** Specific section focused for preview and isolated exports */
    previewSection: PreviewSection | null;
    /** Pixel color dithering algorithm */
    dithering: string;
    /** Raw user uploaded image file */
    uploadedImage: File | null;
    /** ObjectURL representing the preview source */
    previewUrl: string | null;
    /** Fit adjustment style */
    imageFitMode: ImageFitMode;
    /** Viewport cropping parameters */
    cropSettings: CropSettings;
    /** Map color index mapping to minecraft block IDs */
    selectedPaletteItems: Record<number, string | null>;
    /** Height penalty threshold for 3D steps (0% to 100%) */
    threeDPrecision: number;
    /** Use CIELAB color delta E (true) or RGB Euclidean distance (false) */
    useCielab: boolean;
    /** Error diffusion threshold scale for adaptive/hybrid dithering */
    hybridStrength: number;
    /** Computed output structure dimensions and height limits stats */
    mapartStats: MapartStats | null;
    /** Treat grid maps as standalone entities for grounding and borders */
    independentMaps: boolean;
    /** Manually painted block edits over the base mapart image */
    manualEdits: Record<number, ManualEdit>;
    /** Current tool active: painting brush */
    isPainting: boolean;
    /** Current tool active: color picker eye-dropper */
    isPicking: boolean;
    /** The block template loaded in the paint brush */
    brushBlock: ManualEdit | null;
    /** Undo history stack */
    history: Record<number, ManualEdit>[];
    /** History index pointer */
    historyIndex: number;

    // Actions
    setPaletteVersion: (version: string) => void;
    setImageSettings: (settings: Partial<ImageSettings> | ((prev: ImageSettings) => ImageSettings)) => void;
    setGridDimensions: (dim: GridDimensions) => void;
    setBuildMode: (mode: BuildMode) => void;
    setBlockSupport: (support: BlockSupport) => void;
    setSupportBlockId: (id: string) => void;
    setExportMode: (mode: ExportMode) => void;
    setPreviewSection: (section: PreviewSection | null) => void;
    setDithering: (dithering: string) => void;
    setUploadedImage: (file: File | null) => void;
    setImageFitMode: (mode: ImageFitMode) => void;
    setCropSettings: (settings: Partial<CropSettings> | ((prev: CropSettings) => CropSettings)) => void;
    resetCropSettings: () => void;
    setSelectedPaletteItems: (items: Record<number, string | null> | ((prev: Record<number, string | null>) => Record<number, string | null>)) => void;
    setThreeDPrecision: (value: number) => void;
    setUseCielab: (value: boolean) => void;
    setHybridStrength: (value: number) => void;
    setMapartStats: (stats: MapartStats | null) => void;
    setIndependentMaps: (value: boolean) => void;
    setManualEdit: (index: number, data: ManualEdit) => void;
    applyBatchEdits: (edits: Record<number, ManualEdit>, deletions?: number[]) => void;
    deleteManualEdit: (index: number) => void;
    clearManualEdits: () => void;
    setIsPainting: (isPainting: boolean) => void;
    setIsPicking: (isPicking: boolean) => void;
    setBrushBlock: (block: ManualEdit | null) => void;
    addToHistory: () => void;
    undo: () => void;
    redo: () => void;
}



export const useMapartStore = create<MapartState>((set) => ({
    paletteVersion: DEFAULT_VERSION,
    imageSettings: { saturation: 100, brightness: 0, contrast: 0 },
    gridDimensions: { x: 1, y: 1 },
    buildMode: '3d_valley',
    blockSupport: 'all',
    supportBlockId: 'minecraft:cobblestone',
    exportMode: 'sections',
    previewSection: null,
    dithering: 'hybrid',
    uploadedImage: null,
    previewUrl: null,
    imageFitMode: 'adjust',
    cropSettings: defaultCropSettings,
    selectedPaletteItems: {},
    threeDPrecision: 100,
    useCielab: true,
    hybridStrength: 50,
    mapartStats: null,
    independentMaps: true,
    manualEdits: {},
    isPainting: false,
    isPicking: false,
    brushBlock: null,

    // History
    history: [{}],
    historyIndex: 0,

    // Actions
    setPaletteVersion: (version) => set({ paletteVersion: version }),
    setImageSettings: (settings) => set((state) => ({
        imageSettings: typeof settings === 'function' ? settings(state.imageSettings) : { ...state.imageSettings, ...settings },
        manualEdits: {}, // Clear manual edits on image setting change
        history: [{}], historyIndex: 0
    })),
    setGridDimensions: (dim) => set({ gridDimensions: dim }),
    setBuildMode: (mode) => set({
        buildMode: mode,
        manualEdits: {}, // Clear manual edits on build mode change
        history: [{}], historyIndex: 0
    }),
    setBlockSupport: (support) => set({ blockSupport: support }),
    setSupportBlockId: (id) => set({ supportBlockId: id }),
    setExportMode: (mode) => set({ exportMode: mode }),
    setPreviewSection: (section) => set({ previewSection: section }),
    setDithering: (dithering) => set({
        dithering,
        manualEdits: {}, // Clear manual edits on dithering change
        history: [{}], historyIndex: 0
    }),
    setUploadedImage: (file) => set((state) => {
        if (state.previewUrl) {
            URL.revokeObjectURL(state.previewUrl);
        }
        const url = file ? URL.createObjectURL(file) : null;
        return { uploadedImage: file, previewUrl: url, manualEdits: {}, history: [{}], historyIndex: 0 };
    }),
    setImageFitMode: (mode) => set({ imageFitMode: mode, manualEdits: {}, history: [{}], historyIndex: 0 }),
    setCropSettings: (settings) => set((state) => ({
        cropSettings: typeof settings === 'function' ? settings(state.cropSettings) : { ...state.cropSettings, ...settings },
        manualEdits: {}, // Clear edits on crop change
        history: [{}], historyIndex: 0
    })),
    resetCropSettings: () => set({
        cropSettings: { zoom: 1, offsetX: 0, offsetY: 0 },
        manualEdits: {},
        history: [{}], historyIndex: 0
    }),
    setSelectedPaletteItems: (items) => set((state) => ({
        selectedPaletteItems: typeof items === 'function' ? items(state.selectedPaletteItems) : items,
        manualEdits: {}, // Clear edits on palette change
        history: [{}], historyIndex: 0
    })),
    setThreeDPrecision: (value) => set({
        threeDPrecision: value,
        manualEdits: {}, // Clear edits on precision change
        history: [{}], historyIndex: 0
    }),
    setUseCielab: (value) => set({
        useCielab: value,
        manualEdits: {}, // Clear edits on algorithm change
        history: [{}], historyIndex: 0
    }),
    setHybridStrength: (value) => set({
        hybridStrength: value,
        manualEdits: {},
        history: [{}], historyIndex: 0
    }),
    setMapartStats: (stats) => set({ mapartStats: stats }),
    setIndependentMaps: (value) => set({ independentMaps: value }),
    setManualEdit: (index, data) => set((state) => ({
        manualEdits: { ...state.manualEdits, [index]: data }
    })),
    applyBatchEdits: (edits, deletions) => set((state) => {
        const newEdits = { ...state.manualEdits, ...edits };
        if (deletions) {
            for (const index of deletions) {
                delete newEdits[index];
            }
        }
        return { manualEdits: newEdits };
    }),
    deleteManualEdit: (index) => set((state) => {
        const newEdits = { ...state.manualEdits };
        delete newEdits[index];
        return { manualEdits: newEdits };
    }),
    clearManualEdits: () => set({ manualEdits: {}, history: [{}], historyIndex: 0 }),
    setIsPainting: (isPainting) => set({ isPainting, isPicking: false }),
    setIsPicking: (isPicking) => set({ isPicking }),
    setBrushBlock: (block) => set({ brushBlock: block }),

    addToHistory: () => set((state) => {
        const newHistory = state.history.slice(0, state.historyIndex + 1);
        newHistory.push(state.manualEdits);
        // Limit history size if needed (e.g. 50)
        if (newHistory.length > 50) newHistory.shift();

        return {
            history: newHistory,
            historyIndex: newHistory.length - 1
        };
    }),
    undo: () => set((state) => {
        if (state.historyIndex > 0) {
            const newIndex = state.historyIndex - 1;
            return {
                manualEdits: state.history[newIndex],
                historyIndex: newIndex
            };
        }
        return {};
    }),
    redo: () => set((state) => {
        if (state.historyIndex < state.history.length - 1) {
            const newIndex = state.historyIndex + 1;
            return {
                manualEdits: state.history[newIndex],
                historyIndex: newIndex
            };
        }
        return {};
    })
}));
