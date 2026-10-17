import { screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { PixelEditor } from '../PixelEditor';
import { resetStore, store, renderPanel } from '../control-panel/__tests__/helpers';
import paletteData from '../../../data/palette.json';
import type { PaletteColor } from '../../../types/palette';

const colors = paletteData.colors as unknown as PaletteColor[];
const grass = colors.find(c => c.blocks.some(b => b.id === 'minecraft:grass_block'))!;

const pressed = (name: RegExp) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('PixelEditor', () => {
    beforeEach(resetStore);

    it('opens the editor', () => {
        renderPanel(<PixelEditor />);
        fireEvent.click(screen.getByRole('button', { name: /open pixel editor/i }));
        expect(store().isPainting).toBe(true);
    });

    it('cannot open in 3D mode', () => {
        renderPanel(<PixelEditor disabled />);
        expect(screen.getByRole('button', { name: /open pixel editor/i }).hasAttribute('disabled')).toBe(true);
    });

    it('offers to clear edits while closed', () => {
        store().setManualEdit(0, { blockId: 'minecraft:grass_block', brightness: 'normal', rgb: grass.brightnessValues.normal });
        renderPanel(<PixelEditor />);
        // The open editor stays mounted (hidden by CSS), so take the closed-state button.
        fireEvent.click(screen.getAllByRole('button', { name: /clear all 1 manual edits/i })[0]);
        expect(store().manualEdits).toEqual({});
    });

    it('switches between brush and picker', () => {
        store().setIsPainting(true);
        renderPanel(<PixelEditor />);
        expect(pressed(/paint brush/i)).toBe('true');

        fireEvent.click(screen.getByRole('button', { name: /color picker/i }));
        expect(store().isPicking).toBe(true);
        expect(pressed(/color picker/i)).toBe('true');
        expect(pressed(/paint brush/i)).toBe('false');

        fireEvent.click(screen.getByRole('button', { name: /paint brush/i }));
        expect(store().isPicking).toBe(false);
    });

    it('changes the brush brightness in 3D and locks it in 2D', () => {
        store().setIsPainting(true);
        store().setBrushBlock({ blockId: 'minecraft:grass_block', brightness: 'normal', rgb: grass.brightnessValues.normal });
        const { unmount } = renderPanel(<PixelEditor />);

        fireEvent.click(screen.getByRole('button', { name: /dark \(depth\)/i }));
        expect(store().brushBlock?.brightness).toBe('low');
        expect(store().brushBlock?.rgb).toEqual(grass.brightnessValues.low);
        unmount();

        store().setBuildMode('2d');
        renderPanel(<PixelEditor />);
        expect(screen.getByRole('button', { name: /light \(peak\)/i }).hasAttribute('disabled')).toBe(true);
    });

    it('disables undo and redo without history', () => {
        store().setIsPainting(true);
        renderPanel(<PixelEditor />);
        expect(screen.getByRole('button', { name: /undo/i }).hasAttribute('disabled')).toBe(true);
        expect(screen.getByRole('button', { name: /redo/i }).hasAttribute('disabled')).toBe(true);
    });

    it('closes the editor', () => {
        store().setIsPainting(true);
        renderPanel(<PixelEditor />);
        fireEvent.click(screen.getByRole('button', { name: /close editor/i }));
        expect(store().isPainting).toBe(false);
    });

    it('picks a brush from the selector dialog', () => {
        store().setIsPainting(true);
        store().setSelectedPaletteItems({ [grass.colorID]: 'minecraft:grass_block' });
        renderPanel(<PixelEditor />);

        fireEvent.click(screen.getByRole('button', { name: /change brush/i }));
        const dialog = screen.getByRole('dialog', { name: /select block variant/i });
        fireEvent.click(within(dialog).getByRole('button', { name: 'grass_block Light' }));

        expect(store().brushBlock).toEqual({
            blockId: 'minecraft:grass_block',
            brightness: 'high',
            rgb: grass.brightnessValues.high,
        });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
