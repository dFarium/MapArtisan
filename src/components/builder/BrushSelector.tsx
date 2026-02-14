import { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import paletteData from '../../data/palette.json';
import { useMapart } from '../../context/useMapart';
import type { PaletteColor } from '../../types/palette';
import { type ManualEdit, type BrightnessLevel } from '../../types/mapart';
import { filterPaletteByVersion, isBlockAvailable } from '../../utils/filterPaletteByVersion';

interface BrushSelectorProps {
    isOpen: boolean;
    onClose: () => void;
}

export const BrushSelector = ({ isOpen, onClose }: BrushSelectorProps) => {
    const selectedPaletteItems = useMapart(s => s.selectedPaletteItems);
    const setBrushBlock = useMapart(s => s.setBrushBlock);
    const brushBlock = useMapart(s => s.brushBlock);
    const buildMode = useMapart(s => s.buildMode);
    const paletteVersion = useMapart(s => s.paletteVersion);

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
        // Filter colors by version first
        const versionFiltered = filterPaletteByVersion(
            paletteData.colors as unknown as PaletteColor[],
            paletteVersion
        );

        // Then filter colors that have a valid, version-compatible block selected
        return versionFiltered.filter(color => {
            const selectedBlock = selectedPaletteItems[color.colorID];
            if (!selectedBlock || selectedBlock === '') return false;

            // Check if the selected block is available in this version
            const blockInfo = color.blocks.find(b => b.id === selectedBlock);
            return blockInfo && isBlockAvailable(blockInfo.introducedIn, paletteVersion);
        });
    }, [selectedPaletteItems, paletteVersion]);


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
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200 w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>

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
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {activeColors.map((color) => {
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

                                                const isVariantDisabled = !is3D && variant !== 'normal';

                                                return (
                                                    <div key={variant} className="flex-1 flex flex-col items-center gap-1 group">
                                                        <button
                                                            onClick={() => !isVariantDisabled && handleSelectColor(color, variant)}
                                                            disabled={isVariantDisabled}
                                                            className={`
                                                                w-full aspect-square rounded shadow-sm transition-all
                                                                ${isVariantDisabled
                                                                    ? 'opacity-20 cursor-not-allowed ring-1 ring-black/10 grayscale'
                                                                    : 'hover:scale-105'
                                                                }
                                                                ${isSelected ? 'ring-2 ring-white z-10' : (isVariantDisabled ? '' : 'ring-1 ring-black/20 hover:ring-zinc-500')}
                                                            `}
                                                            style={{
                                                                backgroundColor: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
                                                            }}
                                                            title={isVariantDisabled
                                                                ? 'This shade requires 3D Valley mode (height variation)'
                                                                : `${variant} brightness`}
                                                        />
                                                        <span className={`text-[10px] uppercase tracking-tighter transition-colors ${isVariantDisabled ? 'text-zinc-700' : 'text-zinc-600 group-hover:text-zinc-400'}`}>
                                                            {variant === 'high' ? 'Light' : variant === 'low' ? 'Dark' : 'Normal'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div className="p-3 bg-zinc-950/50 border-t border-zinc-800 text-xs text-zinc-500 text-center">
                    {is3D
                        ? 'Select the specific brightness variant you want to paint.'
                        : '2D Mode active. Switch to "3D Valley" in settings to enable brightness selection.'}
                </div>
            </div>
        </div>,
        document.body
    );
};
