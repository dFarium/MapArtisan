import { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import paletteData from '../../data/palette_1_21_11.json';
import { useMapart } from '../../context/MapartContext';
import type { PaletteColor } from '../../types/palette';
import { type ManualEdit } from '../../types/mapart';

interface BrushSelectorProps {
    isOpen: boolean;
    onClose: () => void;
}

export const BrushSelector = ({ isOpen, onClose }: BrushSelectorProps) => {
    const selectedPaletteItems = useMapart(s => s.selectedPaletteItems);
    const setBrushBlock = useMapart(s => s.setBrushBlock);
    const brushBlock = useMapart(s => s.brushBlock);

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

    const handleSelectColor = (color: PaletteColor) => {
        const blockId = selectedPaletteItems[color.colorID];
        if (blockId) {
            const manualEdit: ManualEdit = {
                blockId: blockId,
                brightness: 'normal',
                rgb: color.brightnessValues.normal
            };
            setBrushBlock(manualEdit);
            onClose();
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={handleBackdropClick}
        >
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-full max-w-lg flex flex-col animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-zinc-100">Select Color</h3>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4">
                    {activeColors.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500">
                            No colors available.<br />
                            <span className="text-sm">Select blocks in the Palette first.</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-8 sm:grid-cols-10 gap-2">
                            {activeColors.map((color) => {
                                const isSelected = brushBlock?.rgb.r === color.brightnessValues.normal.r &&
                                    brushBlock?.rgb.g === color.brightnessValues.normal.g &&
                                    brushBlock?.rgb.b === color.brightnessValues.normal.b;

                                return (
                                    <button
                                        key={color.colorID}
                                        onClick={() => handleSelectColor(color)}
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
                            })}
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div className="p-3 bg-zinc-950/50 border-t border-zinc-800 text-xs text-zinc-500 text-center">
                    Colors based on your current Palette configuration.
                </div>
            </div>
        </div>,
        document.body
    );
};
