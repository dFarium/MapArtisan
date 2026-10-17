import { useMemo } from 'react';
import paletteData from '../../data/palette.json';
import { useMapartStore as useMapart } from '../../store/useMapartStore';
import type { PaletteColor } from '../../types/palette';
import { type ManualEdit, type BrightnessLevel } from '../../types/mapart';
import { filterPaletteByVersion, isBlockAvailable } from '../../utils/filterPaletteByVersion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface BrushSelectorProps {
    isOpen: boolean;
    onClose: () => void;
}

const VARIANTS = ['high', 'normal', 'low'] as const satisfies readonly BrightnessLevel[];
const VARIANT_LABEL: Record<(typeof VARIANTS)[number], string> = { high: 'Light', normal: 'Normal', low: 'Dark' };

export const BrushSelector = ({ isOpen, onClose }: BrushSelectorProps) => {
    const selectedPaletteItems = useMapart(s => s.selectedPaletteItems);
    const setBrushBlock = useMapart(s => s.setBrushBlock);
    const brushBlock = useMapart(s => s.brushBlock);
    const buildMode = useMapart(s => s.buildMode);
    const paletteVersion = useMapart(s => s.paletteVersion);

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

    const is3D = buildMode !== '2d';

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-4xl">
                <DialogHeader className="border-b p-4">
                    <DialogTitle className="text-base">Select {is3D ? 'Block Variant' : 'Color'}</DialogTitle>
                    <DialogDescription>
                        {is3D
                            ? 'Select the specific brightness variant you want to paint.'
                            : '2D Mode active. Switch to "3D Valley" in settings to enable brightness selection.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="overflow-y-auto p-4">
                    {activeColors.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            No colors available.<br />
                            <span className="text-xs">Select blocks in the Palette first.</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                            {activeColors.map((color) => {
                                const blockName = selectedPaletteItems[color.colorID]?.replace('minecraft:', '');

                                return (
                                    <div key={color.colorID} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2">
                                        <div className="truncate px-1 text-xs font-medium text-muted-foreground">
                                            {blockName}
                                        </div>
                                        <div className="flex gap-2">
                                            {VARIANTS.map(variant => {
                                                const rgb = color.brightnessValues[variant];
                                                const isSelected = brushBlock?.rgb.r === rgb.r &&
                                                    brushBlock?.rgb.g === rgb.g &&
                                                    brushBlock?.rgb.b === rgb.b;

                                                const isVariantDisabled = !is3D && variant !== 'normal';

                                                return (
                                                    <div key={variant} className="group flex flex-1 flex-col items-center gap-1">
                                                        {/* The swatch shows the Minecraft map color itself. */}
                                                        <Button
                                                            variant="ghost"
                                                            onClick={() => handleSelectColor(color, variant)}
                                                            disabled={isVariantDisabled}
                                                            aria-label={`${blockName} ${VARIANT_LABEL[variant]}`}
                                                            aria-pressed={isSelected}
                                                            className={cn(
                                                                'aspect-square h-auto w-full rounded-md p-0 shadow-sm',
                                                                isVariantDisabled
                                                                    ? 'grayscale disabled:opacity-20'
                                                                    : 'ring-1 ring-black/20 hover:scale-105 hover:ring-ring',
                                                                isSelected && 'z-10 ring-2 ring-foreground'
                                                            )}
                                                            style={{
                                                                backgroundColor: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
                                                            }}
                                                        />
                                                        <span className={cn(
                                                            'text-xs uppercase tracking-tight transition-colors',
                                                            isVariantDisabled ? 'text-muted-foreground/40' : 'text-muted-foreground group-hover:text-foreground'
                                                        )}>
                                                            {VARIANT_LABEL[variant]}
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
            </DialogContent>
        </Dialog>
    );
};
