import React, { useState, useMemo, useEffect } from 'react';
import { Search, ChevronRight, ChevronLeft } from 'lucide-react';
import paletteData from '../../data/palette.json';
import { useMapart } from '../../context/MapartContext';

const ASSET_BASE_URL = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.1';

interface BlockTextureMap {
    [key: string]: {
        texture: string | null;
    };
}

// Define the shape of a color entry based on palette.json
interface PaletteColor {
    colorID: number;
    colorName: string;
    r: number; // Note: The JSON provided shows brightnessValues structure, but previous code used direct r,g,b. 
    // Need to check if I need to map "normal" brightness or if the JSON has flattened r,g,b.
    // Looking at the JSON snippet, it has 'brightnessValues'.
    // Wait, the previous code assumed `color.r`, `color.g`, `color.b`.
    // The JSON I saw has `brightnessValues: { lowest:..., low:..., normal:..., high:... }`.
    // This means my previous code `rgb({color.r}, ...)` was ALSO WRONG if applied to this JSON.
    // I need to use `color.brightnessValues.normal.r`.
    brightnessValues: {
        normal: { r: number; g: number; b: number; };
    };
    blocks: string[];
}

export const PaletteSidebar = () => {
    const { paletteVersion } = useMapart();
    const [isOpen, setIsOpen] = useState(true);
    const [width, setWidth] = useState(320);
    const [isResizing, setIsResizing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [textureMap, setTextureMap] = useState<BlockTextureMap>({});

    useEffect(() => {
        const fetchTextures = async () => {
            try {
                const response = await fetch(`${ASSET_BASE_URL}/blocks_textures.json`);
                if (!response.ok) throw new Error('Failed to load textures');
                const data = await response.json();

                const map: BlockTextureMap = {};
                if (Array.isArray(data)) {
                    data.forEach((item: any) => {
                        if (item.name && item.texture) {
                            map[item.name] = { texture: item.texture };
                        }
                    });
                }
                setTextureMap(map);
            } catch (error) {
                console.error("Failed to fetch texture mapping:", error);
            }
        };

        fetchTextures();
    }, []);

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
        return (paletteData.colors as unknown as PaletteColor[]).filter(color =>
            color.blocks.some(block => block.toLowerCase().includes(query)) ||
            color.colorID.toString().includes(query)
        );
    }, [searchQuery]);

    const getTextureUrl = (blockName: string) => {
        const cleanName = blockName.replace('minecraft:', '');
        const textureData = textureMap[cleanName];

        if (textureData && textureData.texture) {
            const cleanPath = textureData.texture.replace('minecraft:', '');
            return `${ASSET_BASE_URL}/${cleanPath}.png`;
        }
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
                        // Correctly access normal brightness values
                        const { r, g, b } = color.brightnessValues.normal;
                        const rgb = `rgb(${r}, ${g}, ${b})`;

                        const mainBlock = color.blocks[0];
                        const textureUrl = getTextureUrl(mainBlock);

                        return (
                            <div
                                key={color.colorID}
                                className="group flex items-center gap-3 p-2 rounded hover:bg-zinc-800/50 transition-colors border border-transparent hover:border-zinc-800"
                            >
                                <div className="relative flex-shrink-0">
                                    {/* Color Fallback / Background */}
                                    <div
                                        className="w-10 h-10 rounded border border-zinc-700 shadow-sm"
                                        style={{ backgroundColor: rgb }}
                                        title={`Base Color: ${rgb}`}
                                    />
                                    {/* Texture Overlay */}
                                    {textureUrl && (
                                        <img
                                            src={textureUrl}
                                            alt={mainBlock}
                                            className="absolute inset-0 w-10 h-10 rounded object-cover rendering-pixelated"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                            loading="lazy"
                                        />
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <span className="font-medium text-zinc-200 text-sm truncate" title={color.blocks.join(', ')}>
                                            {color.blocks[0].replace('minecraft:', '').replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-xs text-zinc-600 font-mono">#{color.colorID}</span>
                                    </div>
                                    <div className="text-xs text-zinc-500 truncate">
                                        {color.blocks.length > 1 ? `+${color.blocks.length - 1} variants` : 'Single block'}
                                    </div>
                                </div>
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
