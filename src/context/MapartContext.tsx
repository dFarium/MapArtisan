import { useMapartStore } from '../store/useMapartStore';
import type { ReactNode } from 'react';

// Re-export types from store for compatibility
export type {
    BlockSupport,
    ImageFitMode,
    ImageSettings,
    GridDimensions,

    CropSettings,
    MapartState
} from '../store/useMapartStore';
export type { BuildMode } from '../types/mapart';

// Deprecated Provider (No-op)
export const MapartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    return <>{children}</>;
};

// Hook alias
export const useMapart = useMapartStore;
