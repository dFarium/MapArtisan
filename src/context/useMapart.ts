import { useMapartStore } from '../store/useMapartStore';

/**
 * Hook alias for useMapartStore.
 * Maintained for backward compatibility and cleaner imports.
 */
export const useMapart = useMapartStore;

export type {
    BlockSupport,
    ImageFitMode,
    ImageSettings,
    GridDimensions,
    CropSettings,
    MapartState
} from '../store/useMapartStore';

export type { BuildMode } from '../types/mapart';
