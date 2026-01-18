import React, { useState, useMemo, useEffect } from 'react';
import { Search, ChevronRight, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react';
import paletteData from '../../data/palette.json';
import { useMapart } from '../../context/MapartContext';

// Define the shape of a color entry based on palette.json
interface PaletteColor {
    colorID: number;
    colorName: string;
    r: number;
    brightnessValues: {
        normal: { r: number; g: number; b: number; };
    };
    blocks: string[];
}

export const PaletteSidebar = () => {
    const { paletteVersion, selectedPaletteItems, setSelectedPaletteItems, textureBundle } = useMapart();
    const [isOpen, setIsOpen] = useState(true);
    const [width, setWidth] = useState(320);
    const [isResizing, setIsResizing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});

    // Texture bundle is now managed globally in MapartContext



    const startResizing = (e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    };

    useEffect(() => {
        const stopResizing = () => setIsResizing(false);
        const resize = (e: MouseEvent) => {
            if (isResizing) {
                const newWidth = Math.max(250, Math.min(600, e.clientX));
                setWidth(newWidth);
            }
        };

        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        }

        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing]);

    const filteredPalette = useMemo(() => {
        const query = searchQuery.toLowerCase();
        // Access .colors array
        return (paletteData.colors as unknown as PaletteColor[]).filter(color => {
            if (color.colorName === 'clear') return false;

            const matches =
                color.colorName.toLowerCase().includes(query) ||
                color.blocks.some(block => block.toLowerCase().includes(query)) ||
                color.colorID.toString().includes(query);
            return matches;
        });
    }, [searchQuery]);

    // Auto-expand groups when searching
    useEffect(() => {
        if (searchQuery) {
            const newExpanded: Record<number, boolean> = {};
            filteredPalette.forEach(c => newExpanded[c.colorID] = true);
            setExpandedGroups(prev => ({ ...prev, ...newExpanded }));
        }
    }, [searchQuery, filteredPalette]);

    const toggleGroup = (id: number) => {
        setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const toggleBlockSelection = (colorId: number, block: string) => {
        setSelectedPaletteItems((prev) => {
            const current = prev[colorId];
            if (current === block && block !== '') {
                const next = { ...prev };
                delete next[colorId];
                return next;
            } else {
                if (block === '') {
                    const next = { ...prev };
                    delete next[colorId];
                    return next;
                }
                return { ...prev, [colorId]: block };
            }
        });
    };


    const getTextureUrl = (blockName: string) => {
        const cleanName = blockName.replace('minecraft:', '');
        const base64 = textureBundle[cleanName];
        if (base64) {
            return `data:image/png;base64,${base64}`;
        }
        // Fallback for async load or missing texture
        return null;
    };

    return (
        <div
            className="h-full bg-zinc-900 border-r border-zinc-700 flex flex-col relative transition-all duration-75 select-none"
            style={{ width: isOpen ? width : 'auto' }}
        >
            {/* Toggle Button (Collapsed) */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="p-4 hover:bg-zinc-800 text-zinc-400 transition-colors"
                >
                    <ChevronRight size={20} />
                </button>
            )}

            {/* Header */}
            {isOpen && (
                <div className="p-4 border-b border-zinc-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
                            Palette <span className="text-xs font-normal text-zinc-500">v{paletteVersion}</span>
                        </h2>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 hover:bg-zinc-800 rounded text-zinc-400"
                        >
                            <ChevronLeft size={18} />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 text-zinc-500" size={14} />
                        <input
                            type="text"
                            placeholder="Search blocks..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-8 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 placeholder:text-zinc-600"
                        />
                    </div>
                </div>
            )}

            {/* Content List */}
            {isOpen && (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filteredPalette.map((color) => {
                        const { r, g, b } = color.brightnessValues.normal;
                        const rgb = `rgb(${r}, ${g}, ${b})`;
                        const isExpanded = expandedGroups[color.colorID];
                        const selectedBlock = selectedPaletteItems[color.colorID];

                        return (
                            <div key={color.colorID} className="rounded border border-zinc-800/50 bg-zinc-900/50 overflow-hidden mb-1">
                                {/* Group Header */}
                                <div
                                    className="flex items-center gap-3 p-2 hover:bg-zinc-800 cursor-pointer transition-colors"
                                    onClick={() => toggleGroup(color.colorID)}
                                >
                                    <div className="relative">
                                        <div
                                            className="w-6 h-6 rounded border border-zinc-700 shadow-sm"
                                            style={{ backgroundColor: rgb }}
                                        />
                                        {/* Show selected block texture as badge if collapsed and something is selected */}
                                        {!isExpanded && selectedBlock && (
                                            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-sm border border-zinc-900 bg-zinc-800 z-10 flex items-center justify-center">
                                                <img
                                                    src={getTextureUrl(selectedBlock) || ''}
                                                    className="w-full h-full object-cover rendering-pixelated rounded-sm"
                                                    alt=""
                                                    onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0 flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-zinc-200 capitalize">
                                                {color.colorName.replace(/_/g, ' ')}
                                            </span>
                                            <span className="text-xs text-zinc-500">
                                                {selectedBlock
                                                    ? selectedBlock.replace('minecraft:', '').replace(/_/g, ' ')
                                                    : 'None selected'}
                                            </span>
                                        </div>
                                        <div className="text-zinc-500">
                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Content (Block List) */}
                                {isExpanded && (
                                    <div className="bg-zinc-950/50 p-2 grid grid-cols-4 gap-2 border-t border-zinc-800/50">
                                        {/* Option to select None */}
                                        <button
                                            onClick={() => toggleBlockSelection(color.colorID, '')}
                                            className={`
                                                flex flex-col items-center justify-center !p-0 !rounded-none !w-10 !h-10
                                                border transition-all
                                                ${!selectedBlock
                                                    ? 'bg-zinc-800 border-blue-500/50 ring-1 ring-blue-500/20'
                                                    : 'bg-zinc-900/30 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700'}
                                            `}
                                            title="Unselect"
                                        >
                                            <div className="w-full h-full flex items-center justify-center text-zinc-500 font-mono text-xs">
                                                /
                                            </div>
                                        </button>

                                        {color.blocks.map((block) => {
                                            const isSelected = selectedBlock === block;
                                            const textureUrl = getTextureUrl(block);

                                            // Only render if we have a texture or fallback

                                            return (
                                                <button
                                                    key={block}
                                                    type="button"
                                                    onClick={() => toggleBlockSelection(color.colorID, block)}
                                                    className={`
                                                        relative group block !p-0 !rounded-none !w-10 !h-10
                                                        border transition-all overflow-hidden
                                                        ${isSelected
                                                            ? 'bg-zinc-800 border-blue-500 ring-1 ring-blue-500/30'
                                                            : 'bg-zinc-900/30 border-transparent hover:bg-zinc-800 hover:border-zinc-700'}
                                                    `}
                                                    title={block.replace('minecraft:', '')}
                                                >
                                                    <div className="w-full h-full relative">
                                                        {textureUrl ? (
                                                            <img
                                                                src={textureUrl}
                                                                alt={block}
                                                                className="w-full h-full object-cover object-top rendering-pixelated !rounded-none"
                                                                loading="lazy"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full bg-zinc-800 !rounded-none flex items-center justify-center text-[10px] text-zinc-600">
                                                                ?
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {filteredPalette.length === 0 && (
                        <div className="text-center p-8 text-zinc-500 text-sm">
                            No blocks found matching "{searchQuery}"
                        </div>
                    )}
                </div>
            )}

            {/* Resizer Handle */}
            {isOpen && (
                <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-10"
                    onMouseDown={startResizing}
                />
            )}
        </div>
    );
};
