import { ChevronDown } from 'lucide-react';
import type { PaletteColor } from '../../../types/palette';
import { cn } from '@/lib/utils';

interface PaletteGroupProps {
    color: PaletteColor;
    isExpanded: boolean;
    selectedBlock: string | null | undefined;
    onToggleGroup: (id: number) => void;
    onToggleBlock: (colorId: number, block: string) => void;
}

const getTextureUrl = (blockName: string) => {
    const cleanName = blockName.replace('minecraft:', '');
    return `/textures/${cleanName}.png`;
};

const titleCase = (name: string) => name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const blockShape = (block: string | null | undefined) => ({
    isSlab: !!block?.includes('slab'),
    isFlat: !!block && (block.includes('pressure_plate') || block.includes('carpet') || block.includes('button')),
});

// The grid can show hundreds of textures at once, so tiles are plain styled
// buttons rather than wrapped in Radix components (tooltips, toggles).
const headerClass = 'flex w-full items-center gap-3 p-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30';
const tileClass = 'relative block size-12 overflow-hidden rounded-md border p-0 transition-all';
const tileSelected = `${tileClass} border-primary bg-muted ring-1 ring-primary/30`;
const tileIdle = `${tileClass} border-transparent bg-muted/30 hover:border-ring hover:bg-muted`;
const textureBase = 'relative z-10 w-full object-cover rendering-pixelated';
const textureClass = {
    flat: `${textureBase} h-1/4`,
    slab: `${textureBase} h-1/2`,
    full: `${textureBase} h-full object-top`,
};
// Flat and slab textures stay object-cover, as they rendered before the shadcn migration.
const tileOutline = { outline: '1px solid var(--block-outline)', outlineOffset: '-1px' };

export const PaletteGroup = ({
    color,
    isExpanded,
    selectedBlock,
    onToggleGroup,
    onToggleBlock
}: PaletteGroupProps) => {
    const { r, g, b } = color.brightnessValues.normal;
    const normalRgb = `rgb(${r}, ${g}, ${b})`;
    const selectedShape = blockShape(selectedBlock);

    return (
        <div className="mb-1 overflow-hidden rounded-md border bg-muted/20">
            {/* Group Header */}
            <button
                type="button"
                onClick={() => onToggleGroup(color.colorID)}
                aria-expanded={isExpanded}
                className={headerClass}
            >
                <div className="flex items-center gap-1.5">
                    <div
                        className="flex size-12 flex-col justify-end overflow-hidden rounded-md border bg-muted"
                        style={tileOutline}
                    >
                        <img
                            src={selectedBlock ? getTextureUrl(selectedBlock) : "/textures/barrier.png"}
                            className={cn(
                                'w-full object-cover rendering-pixelated',
                                selectedShape.isFlat ? 'h-1/4' : selectedShape.isSlab ? 'h-1/2' : 'h-full',
                                !(selectedShape.isFlat || selectedShape.isSlab) && 'object-top'
                            )}
                            alt={selectedBlock || "None"}
                        />
                    </div>
                    <div
                        className="grid size-12 grid-cols-2 grid-rows-2 overflow-hidden rounded-md border shadow-sm"
                        title="Map Color Variations"
                        style={tileOutline}
                    >
                        <div style={{ backgroundColor: `rgb(${color.brightnessValues.lowest.r}, ${color.brightnessValues.lowest.g}, ${color.brightnessValues.lowest.b})` }} />
                        <div style={{ backgroundColor: `rgb(${color.brightnessValues.low.r}, ${color.brightnessValues.low.g}, ${color.brightnessValues.low.b})` }} />
                        <div style={{ backgroundColor: `rgb(${color.brightnessValues.normal.r}, ${color.brightnessValues.normal.g}, ${color.brightnessValues.normal.b})` }} />
                        <div style={{ backgroundColor: `rgb(${color.brightnessValues.high.r}, ${color.brightnessValues.high.g}, ${color.brightnessValues.high.b})` }} />
                    </div>
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                            {titleCase(selectedBlock ? selectedBlock.replace('minecraft:', '') : color.colorName)}
                        </span>
                        <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                    </div>
                    <div className="truncate text-xs font-normal text-muted-foreground">
                        {color.colorName}
                    </div>
                </div>
            </button>

            {/* Expanded Block Grid */}
            {isExpanded && (
                <div className="grid grid-cols-4 gap-1.5 bg-background/40 p-2 pt-0 sm:grid-cols-5 md:grid-cols-6">
                    {/* "None" selector (Clear) */}
                    <button
                        type="button"
                        onClick={() => onToggleBlock(color.colorID, '')}
                        aria-pressed={!selectedBlock}
                        className={cn(
                            tileClass,
                            !selectedBlock
                                ? 'border-primary bg-muted ring-1 ring-primary/30'
                                : 'bg-muted/30 hover:border-ring hover:bg-muted'
                        )}
                        title="Unselect (Auto)"
                        style={tileOutline}
                    >
                        <img
                            src="/textures/barrier.png"
                            alt="Unselect"
                            className="size-full object-cover opacity-50 rendering-pixelated"
                        />
                    </button>

                    {color.blocks.map((blockObj) => {
                        const block = blockObj.id;
                        const isSelected = selectedBlock === block;
                        const { isSlab, isFlat } = blockShape(block);

                        return (
                            <button
                                key={block}
                                type="button"
                                onClick={() => onToggleBlock(color.colorID, block)}
                                aria-pressed={isSelected}
                                className={isSelected ? tileSelected : tileIdle}
                                title={block.replace('minecraft:', '')}
                                style={tileOutline}
                            >
                                <div className="relative flex size-full flex-col justify-end">
                                    <img
                                        src={getTextureUrl(block)}
                                        alt={block}
                                        className={textureClass[isFlat ? 'flat' : isSlab ? 'slab' : 'full']}
                                        style={{ backgroundColor: normalRgb, transition: 'background-color 0.2s' }}
                                        loading="lazy"
                                        onLoad={(e) => {
                                            (e.target as HTMLElement).style.backgroundColor = 'transparent';
                                        }}
                                    />
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
