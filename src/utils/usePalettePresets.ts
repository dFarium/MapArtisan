import { useState, useCallback } from 'react';
import paletteData from '../data/palette.json';
import { BASIC_COLORS, EASY_KEYWORDS } from '../data/constants';
import type { PaletteColor } from '../types/palette';
import {
    filterPaletteByVersion,
    checkPresetCompatibility,
    applyReplacements,
    type BlockReplacement
} from './filterPaletteByVersion';

export interface Preset {
    name: string;
    selection: Record<number, string | null>;
}

export interface PresetApplyResult {
    replacements: BlockReplacement[];
}

export const usePalettePresets = (
    selectedPaletteItems: Record<number, string | null>,
    setSelectedPaletteItems: (items: Record<number, string | null>) => void,
    targetVersion?: string
) => {
    const [customPresets, setCustomPresets] = useState<Preset[]>(() => {
        const saved = localStorage.getItem('mapart_custom_presets');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Failed to parse presets', e);
            }
        }
        return [];
    });
    const [lastReplacements, setLastReplacements] = useState<BlockReplacement[]>([]);

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

    const clearReplacements = useCallback(() => {
        setLastReplacements([]);
    }, []);

    const applyPreset = useCallback((
        type: 'all' | 'basic' | 'easy' | 'custom',
        customData?: Record<number, string | null>
    ): PresetApplyResult => {
        const allColors = paletteData.colors as unknown as PaletteColor[];
        const version = targetVersion || '1.21.5';

        // Filter colors by version
        const availableColors = filterPaletteByVersion(allColors, version);

        if (type === 'custom' && customData) {
            // Check compatibility and apply replacements
            const replacements = checkPresetCompatibility(customData, allColors, version);

            if (replacements.length > 0) {
                const correctedSelection = applyReplacements(customData, replacements);
                setSelectedPaletteItems(correctedSelection);
                setLastReplacements(replacements);
            } else {
                setSelectedPaletteItems(customData);
                setLastReplacements([]);
            }

            return { replacements };
        }

        const newSelection: Record<number, string | null> = {};

        availableColors.forEach(color => {
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
        setLastReplacements([]);
        return { replacements: [] };
    }, [targetVersion, setSelectedPaletteItems]);

    return {
        customPresets,
        saveCurrentAsPreset,
        deletePreset,
        applyPreset,
        lastReplacements,
        clearReplacements
    };
};
