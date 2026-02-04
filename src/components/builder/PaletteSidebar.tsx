import { useState, useMemo, useEffect } from 'react';
import { Search, ChevronRight, ChevronLeft } from 'lucide-react';
import paletteData from '../../data/palette.json';
import { useMapart } from '../../context/MapartContext';
import type { PaletteColor } from '../../types/palette';
import { usePalettePresets } from '../../utils/usePalettePresets';
import { PresetsToolbar } from './palette/PresetsToolbar';
import { PaletteGroup } from './palette/PaletteGroup';
import { filterPaletteByVersion } from '../../utils/filterPaletteByVersion';

export const PaletteSidebar = () => {
    const paletteVersion = useMapart(s => s.paletteVersion);
    const selectedPaletteItems = useMapart(s => s.selectedPaletteItems);
    const setSelectedPaletteItems = useMapart(s => s.setSelectedPaletteItems);

    const [isOpen, setIsOpen] = useState(true);


    const [searchQuery, setSearchQuery] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});

    // Custom Hook for Presets (with version awareness)
    const presetsHook = usePalettePresets(selectedPaletteItems, setSelectedPaletteItems, paletteVersion);


    // Filter palette by version first, then by search query
    const versionFilteredPalette = useMemo(() => {
        const allColors = paletteData.colors as unknown as PaletteColor[];
        return filterPaletteByVersion(allColors, paletteVersion);
    }, [paletteVersion]);

    const filteredPalette = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return versionFilteredPalette.filter(color => {
            if (color.colorName === 'clear') return false;

            const matches =
                color.colorName.toLowerCase().includes(query) ||
                color.blocks.some(block => block.id.toLowerCase().includes(query)) ||
                color.colorID.toString().includes(query);
            return matches;
        });
    }, [searchQuery, versionFilteredPalette]);


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
                    <PresetsToolbar
                        presetsHook={presetsHook}
                        onReset={() => setSelectedPaletteItems({})}
                    />

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
                    {filteredPalette.map((color) => (
                        <PaletteGroup
                            key={color.colorID}
                            color={color}
                            isExpanded={!!expandedGroups[color.colorID]}
                            selectedBlock={selectedPaletteItems[color.colorID]}
                            onToggleGroup={toggleGroup}
                            onToggleBlock={toggleBlockSelection}
                        />
                    ))}

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
