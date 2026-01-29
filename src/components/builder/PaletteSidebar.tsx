import { useState, useMemo, useEffect } from 'react';
import { Search, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Save, Trash2, RotateCcw } from 'lucide-react';
import paletteData from '../../data/palette_1_21_11.json';
import { useMapart } from '../../context/MapartContext';

// Define the shape of a color entry based on palette.json
interface PaletteColor {
    colorID: number;
    colorName: string;

    brightnessValues: {
        lowest: { r: number; g: number; b: number; };
        low: { r: number; g: number; b: number; };
        normal: { r: number; g: number; b: number; };
        high: { r: number; g: number; b: number; };
    };
    blocks: { id: string; needsSupport: boolean }[];
}

export const PaletteSidebar = () => {
    const paletteVersion = useMapart(s => s.paletteVersion);
    const selectedPaletteItems = useMapart(s => s.selectedPaletteItems);
    const setSelectedPaletteItems = useMapart(s => s.setSelectedPaletteItems);
    const [isOpen, setIsOpen] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});
    const [customPresets, setCustomPresets] = useState<{ name: string; selection: Record<number, string | null> }[]>([]);
    const [isPresetsOpen, setIsPresetsOpen] = useState(false);

    // Load custom presets from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('mapart_custom_presets');
        if (saved) {
            try {
                setCustomPresets(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse presets', e);
            }
        }
    }, []);

    const saveCustomPresets = (presets: typeof customPresets) => {
        setCustomPresets(presets);
        localStorage.setItem('mapart_custom_presets', JSON.stringify(presets));
    };

    const handleSaveCurrentAsPreset = () => {
        const name = prompt('Enter a name for this preset:');
        if (!name) return;
        saveCustomPresets([...customPresets, { name, selection: { ...selectedPaletteItems } }]);
    };

    const handleDeletePreset = (index: number) => {
        if (!confirm('Delete this preset?')) return;
        saveCustomPresets(customPresets.filter((_, i) => i !== index));
    };

    const applyPreset = (type: 'all' | 'basic' | 'easy' | 'custom', customData?: Record<number, string | null>) => {
        if (type === 'custom' && customData) {
            setSelectedPaletteItems(customData);
            return;
        }

        const newSelection: Record<number, string | null> = {};
        const colors = paletteData.colors as unknown as PaletteColor[];

        colors.forEach(color => {
            if (color.colorName === 'clear') return;

            const blockIds = color.blocks.map(b => b.id);

            if (type === 'all') {
                newSelection[color.colorID] = blockIds[0] || null;
            } else if (type === 'basic') {
                const basicColors = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
                if (basicColors.includes(color.colorName.toLowerCase())) {
                    // Prefer wool, then concrete
                    const preferred = blockIds.find(id => id.includes('_wool')) ||
                        blockIds.find(id => id.includes('_concrete')) ||
                        blockIds[0];
                    newSelection[color.colorID] = preferred || null;
                } else {
                    newSelection[color.colorID] = null;
                }
            } else if (type === 'easy') {
                const easyKeywords = ['dirt', 'cobblestone', 'stone', 'sand', 'gravel', 'netherrack', 'oak_planks', 'deepslate', 'andesite', 'granite', 'diorite'];
                const preferred = blockIds.find(id => easyKeywords.some(kw => id.includes(kw))) || blockIds[0];
                newSelection[color.colorID] = preferred || null;
            }
        });

        setSelectedPaletteItems(newSelection);
    };

    // Texture bundle is now managed globally in MapartContext

    const filteredPalette = useMemo(() => {
        const query = searchQuery.toLowerCase();
        // Access .colors array
        return (paletteData.colors as unknown as PaletteColor[]).filter(color => {
            if (color.colorName === 'clear') return false;

            const matches =
                color.colorName.toLowerCase().includes(query) ||
                color.blocks.some(block => block.id.toLowerCase().includes(query)) ||
                color.colorID.toString().includes(query);
            return matches;
        });
    }, [searchQuery]);

    // Auto-expand groups when searching
    // Auto-collapse groups when search bar is empty
    useEffect(() => {
        if (searchQuery) {
            const newExpanded: Record<number, boolean> = {};
            filteredPalette.forEach(c => newExpanded[c.colorID] = true);
            setExpandedGroups(prev => ({ ...prev, ...newExpanded }));
        } else {
            setExpandedGroups({});
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
        return `/textures/${cleanName}.png`;
    };

    return (
        <div
            className="h-full bg-zinc-900 border-r border-zinc-700 flex flex-col relative transition-all duration-75 select-none"
            style={{ width: isOpen ? 350 : 'auto' }}
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

                    {/* Presets Toolbar */}
                    <div className="flex flex-col gap-2">
                        <div
                            className="flex items-center justify-between cursor-pointer text-zinc-400 hover:text-zinc-200 transition-colors"
                            onClick={() => setIsPresetsOpen(!isPresetsOpen)}
                        >
                            <span className="text-xs font-semibold uppercase tracking-wider">Presets</span>
                            {isPresetsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </div>

                        {isPresetsOpen && (
                            <div className="bg-zinc-950/50 rounded border border-zinc-800 p-2 flex flex-col gap-2 animate-in fade-in slide-in-from-top-1">
                                <div className="grid grid-cols-3 gap-1.5">
                                    <button
                                        onClick={() => applyPreset('all')}
                                        className="!px-1 !py-1.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300 font-medium whitespace-nowrap"
                                    >
                                        All Colors
                                    </button>
                                    <button
                                        onClick={() => applyPreset('basic')}
                                        className="!px-1 !py-1.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300 font-medium whitespace-nowrap"
                                    >
                                        Basic (16)
                                    </button>
                                    <button
                                        onClick={() => applyPreset('easy')}
                                        className="!px-1 !py-1.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300 font-medium whitespace-nowrap"
                                    >
                                        Easy
                                    </button>
                                </div>

                                {/* Custom Presets */}
                                {customPresets.length > 0 && (
                                    <div className="border-t border-zinc-800/50 pt-2 flex flex-col gap-1">
                                        <span className="text-[9px] text-zinc-500 uppercase font-bold px-1">My Presets</span>
                                        {customPresets.map((p, i) => (
                                            <div key={i} className="flex items-center gap-1 group/p">
                                                <button
                                                    onClick={() => applyPreset('custom', p.selection)}
                                                    className="flex-1 text-left !px-2 !py-1 text-[10px] bg-zinc-900/50 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-zinc-200 truncate"
                                                >
                                                    {p.name}
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePreset(i)}
                                                    className="!p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover/p:opacity-100 transition-all bg-transparent border-none"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex gap-1.5 border-t border-zinc-800/50 pt-2">
                                    <button
                                        onClick={() => setSelectedPaletteItems({})}
                                        className="flex-1 flex items-center justify-center gap-1 !py-1 text-[10px] bg-red-900/10 hover:bg-red-900/20 border-red-900/30 text-red-500/80 font-medium"
                                    >
                                        <RotateCcw size={10} /> Reset
                                    </button>
                                    <button
                                        onClick={handleSaveCurrentAsPreset}
                                        className="flex-[2] flex items-center justify-center gap-1 !py-1 text-[10px] bg-blue-900/20 hover:bg-blue-900/40 border-blue-900/30 text-blue-400 font-bold"
                                    >
                                        <Save size={10} /> Save Current
                                    </button>
                                </div>
                            </div>
                        )}

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
                </div>
            )}

            {/* Content List */}
            {isOpen && (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filteredPalette.map((color) => {
                        const { r, g, b } = color.brightnessValues.normal;
                        const normalRgb = `rgb(${r}, ${g}, ${b})`;
                        const isExpanded = expandedGroups[color.colorID];
                        const selectedBlock = selectedPaletteItems[color.colorID];

                        return (
                            <div key={color.colorID} className="rounded border border-zinc-800/50 bg-zinc-900/50 overflow-hidden mb-1">
                                {/* Group Header */}
                                <div
                                    className="flex items-center gap-3 p-2 hover:bg-zinc-800 cursor-pointer transition-colors"
                                    onClick={() => toggleGroup(color.colorID)}
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
                                            onClick={() => toggleBlockSelection(color.colorID, '')}
                                            className={`
                                                flex flex-col items-center justify-center !p-0 rounded !w-12 !h-12
                                                border transition-all
                                                ${!selectedBlock
                                                    ? 'bg-zinc-800 border-blue-500/50 ring-1 ring-blue-500/20'
                                                    : 'bg-zinc-900/30 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700'}
                                            `}
                                            title="Unselect"
                                            style={{ outline: '1px solid var(--block-outline)', outlineOffset: '-1px' }}
                                        >
                                            <img
                                                src="/textures/barrier.png"
                                                alt="Unselect"
                                                className="w-full h-full object-cover rendering-pixelated"
                                                title="Unselect"
                                            />
                                        </button>

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
                                                    onClick={() => toggleBlockSelection(color.colorID, block)}
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
                    })}

                    {filteredPalette.length === 0 && (
                        <div className="text-center p-8 text-zinc-500 text-sm">
                            No blocks found matching "{searchQuery}"
                        </div>
                    )}
                </div>
            )}

        </div>
    );
};
