import React, { useState } from 'react';
import { PaletteSidebar } from '../components/builder/PaletteSidebar';
import { MainCanvas } from '../components/builder/MainCanvas';
import { ControlPanel } from '../components/builder/ControlPanel';
import { MaterialList } from '../components/builder/MaterialList';
import { useMapartWorker } from '../hooks/useMapartWorker';
import { useMapart } from '../context/MapartContext';

const Builder: React.FC = () => {
    const [isMaterialListOpen, setIsMaterialListOpen] = useState(false);

    // Lift worker state to Builder so we can share it
    const {
        uploadedImage, previewUrl, gridDimensions,
        imageFitMode, cropSettings, buildMode, selectedPaletteItems, threeDPrecision, dithering, useCielab, hybridStrength,
        setMapartStats, independentMaps, imageSettings, manualEdits, blockSupport, paletteVersion
    } = useMapart();

    const workerState = useMapartWorker({
        uploadedImage,
        previewUrl,
        gridDimensions,
        imageFitMode,
        cropSettings,
        buildMode,
        selectedPaletteItems,
        threeDPrecision,
        dithering,
        useCielab,
        hybridStrength,
        independentMaps,
        setMapartStats,
        imageSettings,
        manualEdits,
        blockSupport,
        paletteVersion
    });

    return (
        <div className="h-screen w-full flex text-white overflow-hidden relative">
            {/* Sidebar Palette */}
            <PaletteSidebar />

            {/* Main Canvas */}
            <MainCanvas workerState={workerState} />

            {/* Control Panel (Anchored to the right) */}
            <div className="w-96 h-full bg-zinc-900/95 border-l border-zinc-700 p-4 overflow-y-auto custom-scrollbar shadow-2xl z-20">
                <ControlPanel onOpenMaterials={() => setIsMaterialListOpen(true)} />
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
