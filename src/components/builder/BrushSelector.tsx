import { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import paletteData from '../../data/palette_1_21_11.json';
import { useMapart } from '../../context/MapartContext';
import type { PaletteColor } from '../../types/palette';
import { type ManualEdit, type BrightnessLevel } from '../../types/mapart';

interface BrushSelectorProps {
    isOpen: boolean;
    onClose: () => void;
}

export const BrushSelector = ({ isOpen, onClose }: BrushSelectorProps) => {
    const selectedPaletteItems = useMapart(s => s.selectedPaletteItems);
    const setBrushBlock = useMapart(s => s.setBrushBlock);
    const brushBlock = useMapart(s => s.brushBlock);
    const buildMode = useMapart(s => s.buildMode);

    // ESC Key Handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Backdrop Click Handler
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const activeColors = useMemo(() => {
        // Filter colors that have a valid block selected in the palette
        return (paletteData.colors as unknown as PaletteColor[]).filter(color => {
            const selectedBlock = selectedPaletteItems[color.colorID];
            return selectedBlock && selectedBlock !== '';
        });
    }, [selectedPaletteItems]);

    const handleSelectColor = (color: PaletteColor, brightness: BrightnessLevel = 'normal') => {
        const blockId = selectedPaletteItems[color.colorID];
        if (blockId) {
            const manualEdit: ManualEdit = {
                blockId: blockId,
                brightness: brightness,
                rgb: color.brightnessValues[brightness]
            };
            setBrushBlock(manualEdit);
            onClose();
        }
    };

    if (!isOpen) return null;

    const is3D = buildMode !== '2d';

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={handleBackdropClick}
        >
            <div className={`bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200 ${is3D ? 'w-full max-w-4xl' : 'w-full max-w-lg'}`} onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-zinc-100">Select {is3D ? 'Block Variant' : 'Color'}</h3>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 max-h-[80vh] overflow-y-auto">
                    {activeColors.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500">
                            No colors available.<br />
                            <span className="text-sm">Select blocks in the Palette first.</span>
                        </div>
                    ) : (
                        <div className={`grid ${is3D ? 'grid-cols-2 md:grid-cols-3 gap-4' : 'grid-cols-8 sm:grid-cols-10 gap-2'}`}>
                            {activeColors.map((color) => {
                                // For 3D mode, we show 3 variants (High -> lighter, Normal, Low -> darker)
                                // High (North), Normal (Flat), Low (South)

                                if (is3D) {
                                    const variants: BrightnessLevel[] = ['high', 'normal', 'low'];

                                    return (
                                        <div key={color.colorID} className="bg-zinc-950/30 p-2 rounded-lg border border-zinc-800/50 flex flex-col gap-2">
                                            <div className="text-xs text-zinc-400 font-medium truncate px-1">
                                                {selectedPaletteItems[color.colorID]?.replace('minecraft:', '')}
                                            </div>
                                            <div className="flex gap-2">
                                                {variants.map(variant => {
                                                    const rgb = color.brightnessValues[variant];
                                                    const isSelected = brushBlock?.rgb.r === rgb.r &&
                                                        brushBlock?.rgb.g === rgb.g &&
                                                        brushBlock?.rgb.b === rgb.b;

                                                    return (
                                                        <div key={variant} className="flex-1 flex flex-col items-center gap-1 group">
                                                            <button
                                                                onClick={() => handleSelectColor(color, variant)}
                                                                className={`
                                                                    w-full aspect-square rounded shadow-sm transition-all hover:scale-105
                                                                    ${isSelected ? 'ring-2 ring-white z-10' : 'ring-1 ring-black/20 hover:ring-zinc-500'}
                                                                `}
                                                                style={{
                                                                    backgroundColor: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
                                                                }}
                                                                title={`${variant} brightness`}
                                                            />
                                                            <span className="text-[10px] text-zinc-600 uppercase tracking-tighter group-hover:text-zinc-400 transition-colors">
                                                                {variant === 'high' ? 'High' : variant === 'low' ? 'Low' : 'Norm'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                } else {
                                    // 2D Mode (Flat)
                                    const isSelected = brushBlock?.rgb.r === color.brightnessValues.normal.r &&
                                        brushBlock?.rgb.g === color.brightnessValues.normal.g &&
                                        brushBlock?.rgb.b === color.brightnessValues.normal.b;

                                    return (
                                        <button
                                            key={color.colorID}
                                            onClick={() => handleSelectColor(color, 'normal')}
                                            className={`
                                                aspect-square rounded-md shadow-sm transition-transform hover:scale-110
                                                ${isSelected ? 'ring-2 ring-white scale-110 z-10' : 'ring-1 ring-black/20 hover:ring-zinc-500'}
                                            `}
                                            style={{
                                                backgroundColor: `rgb(${color.brightnessValues.normal.r}, ${color.brightnessValues.normal.g}, ${color.brightnessValues.normal.b})`
                                            }}
                                            title={`${color.colorName} (${selectedPaletteItems[color.colorID]?.replace('minecraft:', '')})`}
                                        />
                                    );
                                }
                            })}
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div className="p-3 bg-zinc-950/50 border-t border-zinc-800 text-xs text-zinc-500 text-center">
                    {is3D ? 'Select the specific brightness variant you want to paint.' : 'Colors based on your current Palette configuration.'}
                </div>
            </div>
        </div>,
        document.body
    );
};
