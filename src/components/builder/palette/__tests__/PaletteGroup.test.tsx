import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PaletteGroup } from '../PaletteGroup';
import type { PaletteColor } from '../../../../types/palette';

// Mock Palette Data
const mockColor: PaletteColor = {
    colorID: 1,
    colorName: 'white',
    brightnessValues: {
        lowest: { r: 0, g: 0, b: 0 },
        low: { r: 0, g: 0, b: 0 },
        normal: { r: 255, g: 255, b: 255 },
        high: { r: 0, g: 0, b: 0 }
    },
    blocks: [
        { id: 'minecraft:white_wool', needsSupport: false },
        { id: 'minecraft:white_concrete', needsSupport: false }
    ]
};

describe('PaletteGroup', () => {
    it('renders color name and selected block', () => {
        render(
            <PaletteGroup
                color={mockColor}
                isExpanded={false}
                selectedBlock="minecraft:white_wool"
                onToggleGroup={() => { }}
                onToggleBlock={() => { }}
            />
        );

        expect(screen.getByText('White Wool')).toBeDefined();
        expect(screen.getByText('white')).toBeDefined(); // sub-label
    });

    it('toggles expansion when clicked', () => {
        const onToggleGroup = vi.fn();
        render(
            <PaletteGroup
                color={mockColor}
                isExpanded={false}
                selectedBlock={null}
                onToggleGroup={onToggleGroup}
                onToggleBlock={() => { }}
            />
        );

        fireEvent.click(screen.getByText('white')); // Click header area
        expect(onToggleGroup).toHaveBeenCalledWith(1);
    });

    it('shows blocks when expanded', () => {
        render(
            <PaletteGroup
                color={mockColor}
                isExpanded={true}
                selectedBlock={null}
                onToggleGroup={() => { }}
                onToggleBlock={() => { }}
            />
        );

        expect(screen.getByTitle('white_wool')).toBeDefined();
        expect(screen.getByTitle('white_concrete')).toBeDefined();
        // The unselect button and image both have the title, so we check if at least one exists
        expect(screen.getAllByTitle('Unselect').length).toBeGreaterThan(0);
    });

    it('calls onToggleBlock when a block is clicked', () => {
        const onToggleBlock = vi.fn();
        render(
            <PaletteGroup
                color={mockColor}
                isExpanded={true}
                selectedBlock={null}
                onToggleGroup={() => { }}
                onToggleBlock={onToggleBlock}
            />
        );

        fireEvent.click(screen.getByTitle('white_concrete'));
        expect(onToggleBlock).toHaveBeenCalledWith(1, 'minecraft:white_concrete');
    });
});
