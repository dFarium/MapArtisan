import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import clsx from 'clsx';

interface PaletteGroupProps {
    colorID: number;
    colorName: string;
    blocks: { id: string; needsSupport: boolean }[];
    isExpanded: boolean;
    selectedBlockId: string | null;
    onToggleExpand: () => void;
    onSelectBlock: (blockId: string) => void;
}

export const PaletteGroup = ({
    colorID,
    colorName,
    blocks,
    isExpanded,
    selectedBlockId,
    onToggleExpand,
    onSelectBlock
}: PaletteGroupProps) => {

    const getTextureUrl = (blockName: string) => {
        const cleanName = blockName.replace('minecraft:', '');
        return `/textures/${cleanName}.png`;
    };

    return (
        <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/30">
            <button
                onClick={onToggleExpand}
                className={clsx(
                    "w-full px-3 py-2 flex items-center justify-between transition-colors",
                    isExpanded ? "bg-zinc-800/50" : "hover:bg-zinc-800/30"
                )}
            >
                <div className="flex items-center gap-3">
                    <div
                        className="w-4 h-4 rounded-full shadow-sm border border-white/10"
                        style={{ backgroundColor: colorName.replace('_', '') }}
                    />
                    <span className="text-sm font-medium text-zinc-300 capitalize">
                        {colorName.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">
                        ID: {colorID}
                    </span>
                </div>
                {isExpanded ? <ChevronDown size={16} className="text-zinc-500" /> : <ChevronRight size={16} className="text-zinc-500" />}
            </button>

            {isExpanded && (
                <div className="p-2 bg-zinc-950/50 grid grid-cols-6 gap-2 border-t border-zinc-800">
                    {/* "None" Option */}
                    <button
                        onClick={() => onSelectBlock('')}
                        title="Don't use this color"
                        className={clsx(
                            "aspect-square rounded flex items-center justify-center border transition-all",
                            selectedBlockId === null
                                ? "bg-red-500/10 border-red-500 text-red-500"
                                : "bg-zinc-900 border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-500"
                        )}
                    >
                        <Check size={16} className={selectedBlockId === null ? "opacity-100" : "opacity-0"} />
                    </button>

                    {blocks.map((block) => {
                        const isSelected = selectedBlockId === block.id;
                        return (
                            <button
                                key={block.id}
                                onClick={() => onSelectBlock(block.id)}
                                title={block.id + (block.needsSupport ? ' (Needs Support)' : '')}
                                className={clsx(
                                    "relative aspect-square rounded transition-all group overflow-hidden",
                                    isSelected
                                        ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-950 z-10"
                                        : "hover:ring-2 hover:ring-zinc-600 hover:z-10 opacity-70 hover:opacity-100"
                                )}
                            >
                                <img
                                    src={getTextureUrl(block.id)}
                                    alt={block.id}
                                    className="w-full h-full object-cover pixelated font-pixel"
                                    loading="lazy"
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.parentElement!.style.backgroundColor = '#18181b';
                                    }}
                                />
                                {block.needsSupport && (
                                    <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-yellow-500 rounded-full shadow-sm" title="Needs Support Block" />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
