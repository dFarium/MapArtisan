import { X, RefreshCw, Paintbrush, Pipette, Moon, Minus, Sun, Undo2, Redo2 } from 'lucide-react';

import { useMapart } from '../../context/useMapart';
import type { BrightnessLevel } from '../../types/mapart';
import paletteData from '../../data/palette.json';
import type { PaletteColor } from '../../types/palette';
import { BrushSelector } from './BrushSelector';
import { useState, memo } from 'react';

interface PixelEditorProps {
    disabled?: boolean;
}

// Memoize the open button to prevent unnecessary re-renders
const OpenButton = memo(({ onClick, disabled }: { onClick: () => void, disabled?: boolean }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className="flex flex-col items-center justify-center gap-1 p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={disabled ? "Not available in 3D Mode" : "Open Pixel Editor"}
    >
        <Paintbrush size={18} />
        <span>Editor</span>
    </button>
));

export const PixelEditor = ({ disabled }: PixelEditorProps) => {
    const isPainting = useMapart(s => s.isPainting);
    const setIsPainting = useMapart(s => s.setIsPainting);
    const isPicking = useMapart(s => s.isPicking);
    const setIsPicking = useMapart(s => s.setIsPicking);
    const brushBlock = useMapart(s => s.brushBlock);
    const setBrushBlock = useMapart(s => s.setBrushBlock);
    const clearManualEdits = useMapart(s => s.clearManualEdits);
    const manualEdits = useMapart(s => s.manualEdits);
    const buildMode = useMapart(s => s.buildMode);

    const undo = useMapart(s => s.undo);
    const redo = useMapart(s => s.redo);
    const history = useMapart(s => s.history);
    const historyIndex = useMapart(s => s.historyIndex);

    const [isBrushSelectorOpen, setIsBrushSelectorOpen] = useState(false);

    const editCount = Object.keys(manualEdits).length;

    const updateBrightness = (brightness: BrightnessLevel) => {
        if (!brushBlock) return;

        const allColors = paletteData.colors as unknown as PaletteColor[];
        const colorInfo = allColors.find(c =>
            c.blocks.some(b => b.id === brushBlock.blockId) ||
            (brushBlock.blockId === 'minecraft:stone' && true)
        );

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

    // Render both states but hide/show based on isPainting
    return (
        <>
            {/* Closed state - Open Button */}
            {!isPainting && (
                <OpenButton onClick={() => setIsPainting(true)} disabled={disabled} />
            )}

            {/* Open state - Full Editor (always mounted when isPainting, hidden otherwise) */}
            <div
                className={`flex flex-col items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg p-1.5 shadow-lg w-full ${isPainting ? 'animate-in fade-in slide-in-from-left-2' : 'hidden'
                    }`}
            >
                {/* Current Brush Display */}
                <div
                    className="flex flex-col items-center gap-1 p-1 border-b border-zinc-800 cursor-pointer hover:bg-zinc-800/50 rounded transition-colors w-full"
                    onClick={() => setIsBrushSelectorOpen(true)}
                    title={`Change Brush: ${brushBlock ? brushBlock.blockId.replace('minecraft:', '') : 'Select Block'} (${brushBlock ? brushBlock.brightness : 'None'})`}
                >
                    <div className="w-8 h-8 rounded border border-zinc-700 bg-zinc-800 overflow-hidden relative shadow-inner shrink-0">
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
                </div>


                <BrushSelector
                    isOpen={isBrushSelectorOpen}
                    onClose={() => setIsBrushSelectorOpen(false)}
                />

                {/* Brightness Controls */}
                {
                    brushBlock && (
                        <div className="flex flex-col items-center gap-1 p-1 bg-zinc-950 rounded-lg border border-zinc-800 w-full">
                            <button
                                onClick={() => updateBrightness('low')}
                                disabled={buildMode === '2d'}
                                className={`w-full p-1.5 rounded flex items-center justify-center transition-colors ${brushBlock.brightness === 'low'
                                    ? 'bg-zinc-800 text-blue-400'
                                    : (buildMode === '2d' ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-500 hover:text-zinc-300')
                                    }`}
                                title={buildMode === '2d' ? "Not available in 2D mode" : "Dark (Depth)"}
                            >
                                <Moon size={14} />
                            </button>
                            <button
                                onClick={() => updateBrightness('normal')}
                                className={`w-full p-1.5 rounded flex items-center justify-center transition-colors ${brushBlock.brightness === 'normal'
                                    ? 'bg-zinc-800 text-zinc-100'
                                    : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                title="Normal (Flat)"
                            >
                                <Minus size={14} />
                            </button>
                            <button
                                onClick={() => updateBrightness('high')}
                                disabled={buildMode === '2d'}
                                className={`w-full p-1.5 rounded flex items-center justify-center transition-colors ${brushBlock.brightness === 'high'
                                    ? 'bg-zinc-800 text-amber-400'
                                    : (buildMode === '2d' ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-500 hover:text-zinc-300')
                                    }`}
                                title={buildMode === '2d' ? "Not available in 2D mode" : "Light (Peak)"}
                            >
                                <Sun size={14} />
                            </button>
                        </div>
                    )
                }


                {/* Tools */}
                <div className="flex flex-col bg-zinc-900/50 p-1 rounded-lg border border-zinc-800 gap-1 w-full">
                    <button
                        onClick={() => {
                            setIsPicking(false);
                            setIsPainting(true);
                        }}
                        className={`flex items-center justify-center p-2 rounded gap-2 text-xs font-medium transition-colors w-full ${(isPainting && !isPicking)
                            ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                            : 'text-zinc-400 hover:bg-zinc-800'
                            }`}
                        title="Paint Brush"
                    >
                        <Paintbrush size={16} />
                    </button>
                    <button
                        onClick={() => setIsPicking(!isPicking)}
                        className={`flex items-center justify-center p-2 rounded gap-2 text-xs font-medium transition-colors w-full ${isPicking
                            ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                            : 'text-zinc-400 hover:bg-zinc-800'
                            }`}
                        title="Color Picker"
                    >
                        <Pipette size={16} />
                    </button>
                </div>

                {/* Clear Edits */}
                <div className="flex flex-col bg-zinc-900/50 p-1 rounded-lg border border-zinc-800 gap-1 w-full">
                    <button
                        onClick={undo}
                        disabled={historyIndex <= 0}
                        className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent w-full flex justify-center"
                        title="Undo"
                    >
                        <Undo2 size={16} />
                    </button>
                    <button
                        onClick={redo}
                        disabled={historyIndex >= history.length - 1}
                        className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent w-full flex justify-center"
                        title="Redo"
                    >
                        <Redo2 size={16} />
                    </button>
                    <div className='h-px w-5 bg-zinc-800 my-0.5 self-center' />
                    <button
                        onClick={clearManualEdits}
                        disabled={editCount === 0}
                        className="p-2 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 rounded transition-colors disabled:opacity-50 w-full flex justify-center"
                        title={`Clear ${editCount} edits`}
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>

                {/* Close / Done */}
                <button
                    onClick={() => setIsPainting(false)}
                    className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors w-full flex justify-center"
                    title="Close Editor"
                >
                    <X size={16} />
                </button>
            </div>
        </>
    );
};
