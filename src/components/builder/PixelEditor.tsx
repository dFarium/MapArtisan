import { X, RefreshCw, Paintbrush, ChevronDown, Pipette } from 'lucide-react';
import { useMapart } from '../../context/MapartContext';
import type { BrightnessLevel } from '../../types/mapart';
import paletteData from '../../data/palette_1_21_11.json';
import type { PaletteColor } from '../../types/palette';
import { BrushSelector } from './BrushSelector';
import { useState } from 'react';

export const PixelEditor = () => {
    const isPainting = useMapart(s => s.isPainting);
    const setIsPainting = useMapart(s => s.setIsPainting);
    const isPicking = useMapart(s => s.isPicking);
    const setIsPicking = useMapart(s => s.setIsPicking);
    const brushBlock = useMapart(s => s.brushBlock);
    const setBrushBlock = useMapart(s => s.setBrushBlock);
    const clearManualEdits = useMapart(s => s.clearManualEdits);
    const manualEdits = useMapart(s => s.manualEdits);
    const buildMode = useMapart(s => s.buildMode);

    const [isBrushSelectorOpen, setIsBrushSelectorOpen] = useState(false);

    const editCount = Object.keys(manualEdits).length;

    if (!isPainting) {
        return (
            <button
                onClick={() => setIsPainting(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 text-sm transition-colors"
                title="Open Pixel Editor"
            >
                <Paintbrush size={14} />
                <span>Pixel Editor</span>
            </button>
        );
    }

    const updateBrightness = (brightness: BrightnessLevel) => {
        if (!brushBlock) return;

        // Find local color info to get RGB for brightness
        // We know blockId, we need to find colorID that contains this block
        const allColors = paletteData.colors as unknown as PaletteColor[];
        const colorInfo = allColors.find(c =>
            c.blocks.some(b => b.id === brushBlock.blockId) ||
            (brushBlock.blockId === 'minecraft:stone' && true) // Naive fallback if stone is generic
        );

        // Better way: brushBlock should store colorID maybe? 
        // Or we just search.
        if (colorInfo) {
            setBrushBlock({
                ...brushBlock,
                brightness,
                rgb: colorInfo.brightnessValues[brightness]
            });
        }
    };

    const getTextureUrl = (blockName: string) => {
        return `/textures/${blockName.replace('minecraft:', '')}.png`;
    };

    return (
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg p-1.5 shadow-lg animate-in fade-in slide-in-from-bottom-2">

            {/* Paint/Erase Toggle (Implicit: Selecting 'None' block effectively erases if we implement it, 
                BUT for now 'Erase' implies removing the manual edit entry) */}

            {/* Current Brush Display */}
            <div
                className="flex items-center gap-2 px-2 border-r border-zinc-800 cursor-pointer hover:bg-zinc-800/50 rounded transition-colors"
                onClick={() => setIsBrushSelectorOpen(true)}
                title="Change Brush"
            >
                <div className="w-10 h-10 rounded border border-zinc-700 bg-zinc-800 overflow-hidden relative shadow-inner shrink-0">
                    {brushBlock ? (
                        <>
                            <div
                                className="w-full h-full"
                                style={{
                                    backgroundColor: `rgb(${brushBlock.rgb.r}, ${brushBlock.rgb.g}, ${brushBlock.rgb.b})`
                                }}
                            />
                            {/* Texture overlay (subtle) */}
                            <img
                                src={getTextureUrl(brushBlock.blockId)}
                                className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-overlay"
                                alt="Brush Texture"
                            />
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <span className="text-[10px]">?</span>
                        </div>
                    )}
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-medium text-zinc-200 flex items-center gap-1">
                        {brushBlock ? brushBlock.blockId.replace('minecraft:', '').split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : 'Select Block'}
                        <ChevronDown size={10} className="text-zinc-500" />
                    </span>
                    <span className="text-[10px] text-zinc-500">
                        {brushBlock ? brushBlock.brightness : 'No Brush'}
                    </span>
                </div>
            </div>

            <BrushSelector
                isOpen={isBrushSelectorOpen}
                onClose={() => setIsBrushSelectorOpen(false)}
            />

            {/* Brightness Controls */}
            <div className="flex bg-zinc-950 rounded border border-zinc-800 p-0.5">
                {(['low', 'normal', 'high'] as const).map(b => {
                    const is2D = buildMode === '2d';
                    const isDisabled = !brushBlock || (is2D && b !== 'normal');

                    return (
                        <button
                            key={b}
                            onClick={() => updateBrightness(b)}
                            disabled={isDisabled}
                            className={`
                                px-2 py-1 text-[10px] rounded-sm transition-colors uppercase font-medium
                                ${brushBlock?.brightness === b
                                    ? 'bg-blue-600/20 text-blue-400'
                                    : (isDisabled ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-500 hover:text-zinc-300')}
                            `}
                            title={is2D && b !== 'normal' ? 'Not available in 2D mode' : b}
                        >
                            {b[0]}
                        </button>
                    );
                })}
            </div>

            <div className="h-6 w-px bg-zinc-800 mx-1" />

            {/* Picker Tool */}
            <button
                onClick={() => setIsPicking(!isPicking)}
                className={`p-1.5 rounded transition-colors ${isPicking ? 'bg-blue-600 text-white' : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                title="Color Picker (Eye Dropper)"
            >
                <Pipette size={14} />
            </button>

            {/* Clear Edits */}
            <button
                onClick={clearManualEdits}
                disabled={editCount === 0}
                className="p-1.5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 rounded transition-colors disabled:opacity-50"
                title={`Clear ${editCount} edits`}
            >
                <RefreshCw size={14} />
            </button>

            {/* Close / Done */}
            <button
                onClick={() => setIsPainting(false)}
                className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                title="Close Editor"
            >
                <X size={14} />
            </button>
        </div>
    );
};
