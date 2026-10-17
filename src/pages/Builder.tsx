import React, { useState, useEffect, useCallback } from 'react';
import { PaletteSidebar } from '../components/builder/PaletteSidebar';
import { MainCanvas } from '../components/builder/MainCanvas';
import { ControlPanel } from '../components/builder/ControlPanel';
import { MaterialList } from '../components/builder/MaterialList';
import { useMapartWorker } from '../hooks/useMapartWorker';
import { useMapartStore as useMapart, useMapartFields } from '../store/useMapartStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

const Builder: React.FC = () => {
    const [isMaterialListOpen, setIsMaterialListOpen] = useState(false);

    const previewUrl = useMapart(s => s.previewUrl);

    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    // Register global keyboard shortcuts for tool switches and undo/redo
    useKeyboardShortcuts();

    // Lift worker state to Builder so we can share it
    const {
        uploadedImage, gridDimensions,
        imageFitMode, resampling, cropSettings, buildMode, selectedPaletteItems, heightLimit, heightLimitStyle, dithering, usePerceptual, hybridStrength,
        setMapartStats, independentMaps, imageSettings, manualEdits, blockSupport, supportBlockId, exportMode, paletteVersion,
        exportFormat
    } = useMapartFields(
        'uploadedImage', 'gridDimensions',
        'imageFitMode', 'resampling', 'cropSettings', 'buildMode', 'selectedPaletteItems', 'heightLimit', 'heightLimitStyle', 'dithering', 'usePerceptual', 'hybridStrength',
        'setMapartStats', 'independentMaps', 'imageSettings', 'manualEdits', 'blockSupport', 'supportBlockId', 'exportMode', 'paletteVersion',
        'exportFormat'
    );

    const workerState = useMapartWorker({
        uploadedImage,
        previewUrl,
        gridDimensions,
        imageFitMode,
        resampling,
        cropSettings,
        buildMode,
        selectedPaletteItems,
        heightLimit,
        heightLimitStyle,
        dithering,
        usePerceptual,
        hybridStrength,
        independentMaps,
        setMapartStats,
        imageSettings,
        manualEdits,
        blockSupport,
        supportBlockId,
        exportMode,
        paletteVersion,
        exportFormat
    });

    // Stable so the memoized ControlPanel skips the re-render on every stroke.
    const openMaterials = useCallback(() => setIsMaterialListOpen(true), []);

    return (
        <div className="h-screen w-full flex text-foreground overflow-hidden relative">
            {/* Sidebar Palette */}
            <PaletteSidebar />

            {/* Main Canvas */}
            <MainCanvas workerState={workerState} />

            {/* Control Panel (Anchored to the right) */}
            <div className="w-96 h-full bg-card border-l p-4 overflow-y-auto shadow-2xl z-20">
                <ControlPanel onOpenMaterials={openMaterials} />
            </div>

            {/* Modals */}
            <MaterialList
                isOpen={isMaterialListOpen}
                onClose={() => setIsMaterialListOpen(false)}
                onCalculate={workerState.calculateMaterials}
            />
        </div>
    );
};

export default Builder;
