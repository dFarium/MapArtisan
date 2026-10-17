import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ConstructionSettingsSection } from '../ConstructionSettingsSection';
import { resetStore, store, renderPanel, chooseOption, pickSelectOption, getToggle, wheelUp } from './helpers';

describe('ConstructionSettingsSection', () => {
    beforeEach(resetStore);

    const renderSection = () => renderPanel(<ConstructionSettingsSection isOpen onToggle={() => {}} />);

    it('switches the build mode and hides the height limit in 2D', () => {
        renderSection();
        expect(screen.getByText(/limit build height/i)).toBeDefined();
        chooseOption(/^2d$/i);
        expect(store().buildMode).toBe('2d');
        expect(screen.queryByText(/limit build height/i)).toBeNull();
    });

    it('limits the build height and remembers the last value', () => {
        renderSection();
        expect(screen.queryByRole('slider')).toBeNull();
        fireEvent.click(getToggle());
        expect(store().heightLimit).toBe(32);

        wheelUp(screen.getByRole('slider'));
        expect(store().heightLimit).toBe(33);

        fireEvent.click(getToggle());
        expect(store().heightLimit).toBe(0);
        fireEvent.click(getToggle());
        expect(store().heightLimit).toBe(33);
    });

    it('changes the height limit style and its hint', () => {
        store().setHeightLimit(32);
        renderSection();
        chooseOption(/^noise$/i);
        expect(store().heightLimitStyle).toBe('noise');
        expect(screen.getByText(/scatter at random/i)).toBeDefined();
    });

    it('hides the support block field when there is no support', () => {
        renderSection();
        expect(screen.getByText(/support block id/i)).toBeDefined();
        pickSelectOption(/include physical support/i, /no support/i);
        expect(store().blockSupport).toBe('needed');
        expect(screen.queryByText(/support block id/i)).toBeNull();
    });

    it('applies a new support block only when it changed', () => {
        renderSection();
        const apply = screen.getByRole('button', { name: /apply/i }) as HTMLButtonElement;
        expect(apply.disabled).toBe(true);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'minecraft:stone' } });
        expect(apply.disabled).toBe(false);
        fireEvent.click(apply);
        expect(store().supportBlockId).toBe('minecraft:stone');
    });

    it('changes the file format and its hint', () => {
        renderSection();
        chooseOption(/^vanilla nbt$/i);
        expect(store().exportFormat).toBe('nbt');
        expect(screen.getByText(/structure blocks/i)).toBeDefined();
    });

    it('locks the 3D preview to the whole map in single-file layout', () => {
        renderSection();
        expect(store().previewSection).toEqual({ x: 0, y: 0 });
        chooseOption(/^single file$/i);
        expect(store().exportMode).toBe('full');
        expect(store().previewSection).toBeNull();
        expect(screen.getByText(/show entire map art/i)).toBeDefined();
    });

    it('picks the 3D preview section in multi-file layout', () => {
        store().setGridDimensions({ x: 2, y: 1 });
        renderSection();
        pickSelectOption(/section 0, 0/i, /section 1, 0/i);
        expect(store().previewSection).toEqual({ x: 1, y: 0 });
    });
});
