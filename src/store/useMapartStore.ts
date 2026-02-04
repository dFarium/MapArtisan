import { create } from 'zustand';
import type { MapartStats, ManualEdit, BuildMode } from '../types/mapart';
import { DEFAULT_VERSION } from '../data/supportedVersions';

export type BlockSupport = 'all' | 'needed' | 'gravity';
export type ImageFitMode = 'adjust' | 'crop';

export interface ImageSettings {
    saturation: number;
    brightness: number;
    contrast: number;
}

export interface GridDimensions {
    x: number;
    y: number;
}

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

export interface MapartState {
    paletteVersion: string;
    imageSettings: ImageSettings;
    gridDimensions: GridDimensions;
    buildMode: BuildMode;
    blockSupport: BlockSupport;
    dithering: string;
    uploadedImage: File | null;
    previewUrl: string | null;
    imageFitMode: ImageFitMode;
    cropSettings: CropSettings;
    selectedPaletteItems: Record<number, string | null>;
    threeDPrecision: number;
    useCielab: boolean;
    hybridStrength: number;
    mapartStats: MapartStats | null;
    independentMaps: boolean;
    manualEdits: Record<number, ManualEdit>;
    isPainting: boolean;
    isPicking: boolean;
    brushBlock: ManualEdit | null;
    history: Record<number, ManualEdit>[];
    historyIndex: number;

    // Actions
    setPaletteVersion: (version: string) => void;
    setImageSettings: (settings: Partial<ImageSettings> | ((prev: ImageSettings) => ImageSettings)) => void;
    setGridDimensions: (dim: GridDimensions) => void;
    setBuildMode: (mode: BuildMode) => void;
    setBlockSupport: (support: BlockSupport) => void;
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
