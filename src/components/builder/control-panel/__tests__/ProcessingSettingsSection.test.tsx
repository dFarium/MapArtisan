import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ProcessingSettingsSection } from '../ProcessingSettingsSection';
import { resetStore, store, renderPanel, pickSelectOption, getToggle, wheelUp } from './helpers';

describe('ProcessingSettingsSection', () => {
    beforeEach(resetStore);

    const renderSection = () => renderPanel(<ProcessingSettingsSection isOpen onToggle={() => {}} />);

    it('changes the dithering mode', () => {
        renderSection();
        pickSelectOption(/smart v2/i, /floyd-steinberg/i);
        expect(store().dithering).toBe('floyd-steinberg');
    });

    it('shows the strength slider only for the smart modes', () => {
        renderSection();
        const [strength] = screen.getAllByRole('slider');
        wheelUp(strength);
        expect(store().hybridStrength).toBe(51);
        expect(screen.getByText(/100% = floyd-steinberg/i)).toBeDefined();

        pickSelectOption(/smart v2/i, /^disabled/i);
        expect(screen.queryByRole('slider')).toBeNull();
    });

    it('toggles OKLab', () => {
        renderSection();
        expect(screen.getByText(/perceptually uniform/i)).toBeDefined();
        fireEvent.click(getToggle());
        expect(store().usePerceptual).toBe(false);
        expect(screen.getByText(/faster rgb distance/i)).toBeDefined();
    });

    it('changes the Minecraft version', () => {
        renderSection();
        pickSelectOption(/^26\.2$/, /^1\.20\.0/);
        expect(store().paletteVersion).toBe('1.20.0');
    });

    it('disables auto-detect until there is an image', () => {
        renderSection();
        expect((screen.getByRole('button', { name: /auto/i }) as HTMLButtonElement).disabled).toBe(true);
    });
});
