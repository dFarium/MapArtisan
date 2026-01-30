import { useState, useEffect } from 'react';
import paletteData from '../data/palette_1_21_11.json';
import { BASIC_COLORS, EASY_KEYWORDS } from '../data/constants';

// Define the shape locally or import if shared
interface PaletteColor {
    colorID: number;
    colorName: string;
    blocks: { id: string; needsSupport: boolean }[];
}

export interface Preset {
    name: string;
    selection: Record<number, string | null>;
}

export const usePalettePresets = (
    selectedPaletteItems: Record<number, string | null>,
    setSelectedPaletteItems: (items: Record<number, string | null>) => void
) => {
    const [customPresets, setCustomPresets] = useState<Preset[]>([]);

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

    const saveCustomPresets = (presets: Preset[]) => {
        setCustomPresets(presets);
        localStorage.setItem('mapart_custom_presets', JSON.stringify(presets));
    };

    const saveCurrentAsPreset = () => {
        const name = prompt('Enter a name for this preset:');
        if (!name) return;
        saveCustomPresets([...customPresets, { name, selection: { ...selectedPaletteItems } }]);
    };

    const deletePreset = (index: number) => {
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
                if (BASIC_COLORS.includes(color.colorName.toLowerCase())) {
                    // Prefer wool, then concrete
                    const preferred = blockIds.find(id => id.includes('_wool')) ||
                        blockIds.find(id => id.includes('_concrete')) ||
                        blockIds[0];
                    newSelection[color.colorID] = preferred || null;
                } else {
                    newSelection[color.colorID] = null;
                }
            } else if (type === 'easy') {
                const preferred = blockIds.find(id => EASY_KEYWORDS.some(kw => id.includes(kw))) || blockIds[0];
                newSelection[color.colorID] = preferred || null;
            }
        });

        setSelectedPaletteItems(newSelection);
    };

    return {
        customPresets,
        saveCurrentAsPreset,
        deletePreset,
        applyPreset
    };
};
