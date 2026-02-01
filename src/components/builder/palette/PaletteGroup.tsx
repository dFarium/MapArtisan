import { ChevronDown, ChevronUp } from 'lucide-react';
import type { PaletteColor } from '../../../types/palette';

interface PaletteGroupProps {
    color: PaletteColor;
    isExpanded: boolean;
    selectedBlock: string | null | undefined;
    onToggleGroup: (id: number) => void;
    onToggleBlock: (colorId: number, block: string) => void;
}

export const PaletteGroup = ({
    color,
    isExpanded,
    selectedBlock,
    onToggleGroup,
    onToggleBlock
}: PaletteGroupProps) => {
    const { r, g, b } = color.brightnessValues.normal;
    const normalRgb = `rgb(${r}, ${g}, ${b})`;

    const getTextureUrl = (blockName: string) => {
        const cleanName = blockName.replace('minecraft:', '');
        return `/textures/${cleanName}.png`;
    };

    return (
        <div className="rounded border border-zinc-800/50 bg-zinc-900/50 overflow-hidden mb-1">
            {/* Group Header */}
            <div
                className="flex items-center gap-3 p-2 hover:bg-zinc-800 cursor-pointer transition-colors"
                onClick={() => onToggleGroup(color.colorID)}
            >
                <div className="flex items-center gap-1.5">
                    <div
                        className="w-12 h-12 border border-zinc-700 bg-zinc-800 overflow-hidden flex flex-col justify-end rounded"
                        style={{ outline: '1px solid var(--block-outline)', outlineOffset: '-1px' }}
                    >
                        {(() => {
                            const isSlab = selectedBlock?.includes('slab');
                            const isFlat = selectedBlock?.includes('pressure_plate') || selectedBlock?.includes('carpet') || selectedBlock?.includes('button') || selectedBlock?.includes('weighted_pressure_plate');

                            return (
                                <img
                                    src={selectedBlock ? getTextureUrl(selectedBlock) : "/textures/barrier.png"}
                                    className={`
                                        w-full object-cover rendering-pixelated
                                        ${isFlat ? 'h-1/4' : isSlab ? 'h-1/2' : 'h-full'}
                                        ${(isFlat || isSlab) ? 'object-contain' : 'object-top'}
                                    `}
                                    alt={selectedBlock || "None"}
                                />
                            );
                        })()}
                    </div>
                    <div
                        className="w-12 h-12 border border-zinc-700 shadow-sm rounded overflow-hidden grid grid-cols-2 grid-rows-2"
                        title="Map Color Variations"
                        style={{ outline: '1px solid var(--block-outline)', outlineOffset: '-1px' }}
                    >
                        <div style={{ backgroundColor: `rgb(${color.brightnessValues.lowest.r}, ${color.brightnessValues.lowest.g}, ${color.brightnessValues.lowest.b})` }} />
                        <div style={{ backgroundColor: `rgb(${color.brightnessValues.low.r}, ${color.brightnessValues.low.g}, ${color.brightnessValues.low.b})` }} />
                        <div style={{ backgroundColor: `rgb(${color.brightnessValues.normal.r}, ${color.brightnessValues.normal.g}, ${color.brightnessValues.normal.b})` }} />
                        <div style={{ backgroundColor: `rgb(${color.brightnessValues.high.r}, ${color.brightnessValues.high.g}, ${color.brightnessValues.high.b})` }} />
                    </div>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-zinc-100 truncate">
                            {selectedBlock ? selectedBlock.replace('minecraft:', '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : color.colorName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </span>
                        {isExpanded ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">
                        {color.colorName}
                    </div>
                </div>
            </div>

            {/* Expanded Block Grid */}
            {isExpanded && (
                <div className="p-2 pt-0 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1.5 bg-black/20">
                    {/* "None" selector (Clear) */}
                    <button
                        onClick={() => onToggleBlock(color.colorID, '')}
                        className={`
                            flex flex-col items-center justify-center !p-0 rounded !w-12 !h-12
                            border transition-all
                            ${!selectedBlock
                                ? 'bg-zinc-800 border-blue-500/50 ring-1 ring-blue-500/20'
                                : 'bg-zinc-900/30 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700'}
                        `}
                        title="Unselect (Auto)"
                        style={{ outline: '1px solid var(--block-outline)', outlineOffset: '-1px' }}
                    >
                        <img
                            src="/textures/barrier.png"
                            alt="Unselect"
                            className="w-full h-full object-cover rendering-pixelated opacity-50"
                            title="Unselect (Auto)"
                        />
                    </button>

                    {/* Removed Air selector */}

                    {color.blocks.map((blockObj) => {
                        const block = blockObj.id;
                        const isSelected = selectedBlock === block;
                        const textureUrl = getTextureUrl(block);

                        const isSlab = block.includes('slab');
                        const isFlat = block.includes('pressure_plate') || block.includes('carpet') || block.includes('button') || block.includes('weighted_pressure_plate');

                        return (
                            <button
                                key={block}
                                type="button"
                                onClick={() => onToggleBlock(color.colorID, block)}
                                className={`
                                    relative group block !p-0 rounded !w-12 !h-12
                                    border transition-all overflow-hidden
                                    ${isSelected
                                        ? 'bg-zinc-800 border-blue-500 ring-1 ring-blue-500/30'
                                        : 'bg-zinc-900/30 border-transparent hover:bg-zinc-800 hover:border-zinc-700'}
                                `}
                                title={block.replace('minecraft:', '')}
                                style={{ outline: '1px solid var(--block-outline)', outlineOffset: '-1px' }}
                            >
                                <div className={`w-full h-full relative flex flex-col justify-end`}>
                                    <img
                                        src={textureUrl}
                                        alt={block}
                                        className={`
                                            w-full object-cover rendering-pixelated relative z-10
                                            ${isFlat ? 'h-1/4' : isSlab ? 'h-1/2' : 'h-full'}
                                            ${(isFlat || isSlab) ? 'object-contain bg-transparent' : 'object-top'}
                                        `}
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
