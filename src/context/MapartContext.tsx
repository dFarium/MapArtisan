import { useMapartStore } from '../store/useMapartStore';
import type { ReactNode } from 'react';

// Re-export types from store for compatibility
export type {
    BuildMode,
    BlockSupport,
    ImageFitMode,
    ImageSettings,
    GridDimensions,
    TransparencySettings,
    CropSettings,
    MapartState
} from '../store/useMapartStore';

// Deprecated Provider (No-op)
export const MapartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    return <>{children}</>;
};

// Hook alias
export const useMapart = useMapartStore;
