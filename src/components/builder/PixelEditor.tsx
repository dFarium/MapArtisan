import { X, Trash2, Paintbrush, Pipette, Moon, Minus, Sun, Undo2, Redo2 } from 'lucide-react';

import { useMapartStore as useMapart } from '../../store/useMapartStore';
import type { BrightnessLevel } from '../../types/mapart';
import paletteData from '../../data/palette.json';
import type { PaletteColor } from '../../types/palette';
import { BrushSelector } from './BrushSelector';
import { useState, memo } from 'react';
import { ToolbarButton } from '@/components/controls/ToolbarButton';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface PixelEditorProps {
    disabled?: boolean;
}

// Memoize the open button to prevent unnecessary re-renders
const OpenButton = memo(({ onClick, disabled }: { onClick: () => void, disabled?: boolean }) => (
    <ToolbarButton
        label="Open Pixel Editor (B)"
        tooltip={disabled ? "Not available in 3D Mode" : undefined}
        onClick={onClick}
        disabled={disabled}
        className="h-auto flex-col gap-1 py-2 text-xs [&_svg:not([class*='size-'])]:size-4.5"
    >
        <Paintbrush />
        <span>Editor</span>
    </ToolbarButton>
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
    const brightnessDisabled = buildMode === '2d';
    const brushLabel = `Change Brush: ${brushBlock ? brushBlock.blockId.replace('minecraft:', '') : 'Select Block'} (${brushBlock ? brushBlock.brightness : 'None'})`;

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
            {/* Closed state - Open Button & optional Clear Edits shortcut */}
            {!isPainting && (
                <div className="flex w-full flex-col gap-1.5">
                    <OpenButton onClick={() => setIsPainting(true)} disabled={disabled} />
                    {editCount > 0 && (
                        <ToolbarButton
                            label={`Clear all ${editCount} manual edits`}
                            variant="destructive"
                            onClick={clearManualEdits}
                            className="h-auto flex-col gap-1 py-2 text-xs"
                        >
                            <Trash2 />
                            <span>Clear</span>
                        </ToolbarButton>
                    )}
                </div>
            )}

            {/* Open state - Full Editor (always mounted when isPainting, hidden otherwise) */}
            <div
                className={`flex w-full flex-col items-center gap-1 ${isPainting ? 'animate-in fade-in slide-in-from-left-2' : 'hidden'}`}
            >
                {/* Current Brush Display */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            aria-label={brushLabel}
                            onClick={() => setIsBrushSelectorOpen(true)}
                            className="h-auto w-full p-1"
                        >
                            <span className="relative size-8 shrink-0 overflow-hidden rounded-md border bg-muted shadow-inner">
                                {brushBlock ? (
                                    <>
                                        <span
                                            className="block size-full"
                                            style={{
                                                backgroundColor: `rgb(${brushBlock.rgb.r}, ${brushBlock.rgb.g}, ${brushBlock.rgb.b})`
                                            }}
                                        />
                                        {/* Texture overlay (subtle) */}
                                        <img
                                            src={getTextureUrl(brushBlock.blockId)}
                                            className="absolute inset-0 size-full object-cover opacity-20 mix-blend-overlay"
                                            alt=""
                                        />
                                    </>
                                ) : (
                                    <span className="flex size-full items-center justify-center text-xs text-muted-foreground">?</span>
                                )}
                            </span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{brushLabel}</TooltipContent>
                </Tooltip>

                <BrushSelector
                    isOpen={isBrushSelectorOpen}
                    onClose={() => setIsBrushSelectorOpen(false)}
                />

                {/* Brightness Controls */}
                {brushBlock && (
                    <>
                        <Separator className="my-1" />
                        <ToolbarButton
                            label="Dark (Depth)"
                            tooltip={brightnessDisabled ? "Not available in 2D mode" : undefined}
                            pressed={brushBlock.brightness === 'low'}
                            onClick={() => updateBrightness('low')}
                            disabled={brightnessDisabled}
                        >
                            <Moon />
                        </ToolbarButton>
                        <ToolbarButton
                            label="Normal (Flat)"
                            pressed={brushBlock.brightness === 'normal'}
                            onClick={() => updateBrightness('normal')}
                        >
                            <Minus />
                        </ToolbarButton>
                        <ToolbarButton
                            label="Light (Peak)"
                            tooltip={brightnessDisabled ? "Not available in 2D mode" : undefined}
                            pressed={brushBlock.brightness === 'high'}
                            onClick={() => updateBrightness('high')}
                            disabled={brightnessDisabled}
                        >
                            <Sun />
                        </ToolbarButton>
                    </>
                )}

                <Separator className="my-1" />

                {/* Tools */}
                <ToolbarButton
                    label="Paint Brush (B)"
                    pressed={isPainting && !isPicking}
                    onClick={() => {
                        setIsPicking(false);
                        setIsPainting(true);
                    }}
                >
                    <Paintbrush />
                </ToolbarButton>
                <ToolbarButton
                    label="Color Picker (I)"
                    pressed={isPicking}
                    onClick={() => setIsPicking(!isPicking)}
                >
                    <Pipette />
                </ToolbarButton>

                <Separator className="my-1" />

                {/* History */}
                <ToolbarButton label="Undo (Ctrl+Z)" onClick={undo} disabled={historyIndex <= 0}>
                    <Undo2 />
                </ToolbarButton>
                <ToolbarButton label="Redo (Ctrl+Y)" onClick={redo} disabled={historyIndex >= history.length - 1}>
                    <Redo2 />
                </ToolbarButton>
                <ToolbarButton
                    label={`Clear all ${editCount} manual edits`}
                    onClick={clearManualEdits}
                    disabled={editCount === 0}
                    className="hover:bg-destructive/10 hover:text-destructive"
                >
                    <Trash2 />
                </ToolbarButton>

                <Separator className="my-1" />

                {/* Close / Done */}
                <ToolbarButton label="Close Editor (Esc)" onClick={() => setIsPainting(false)}>
                    <X />
                </ToolbarButton>
            </div>
        </>
    );
};
