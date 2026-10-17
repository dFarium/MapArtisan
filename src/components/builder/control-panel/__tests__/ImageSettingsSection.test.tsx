import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ImageSettingsSection } from '../ImageSettingsSection';
import { resetStore, store, renderPanel, chooseOption, wheelUp } from './helpers';

describe('ImageSettingsSection', () => {
    beforeEach(resetStore);

    const renderSection = () => renderPanel(<ImageSettingsSection isOpen onToggle={() => {}} />);

    it('edits the map grid', () => {
        renderSection();
        const [mapsX, mapsY] = screen.getAllByRole('spinbutton');
        fireEvent.change(mapsX, { target: { value: '3' } });
        fireEvent.change(mapsY, { target: { value: '2' } });
        expect(store().gridDimensions).toEqual({ x: 3, y: 2 });
    });

    it('falls back to one map when the field is cleared', () => {
        renderSection();
        const [mapsX] = screen.getAllByRole('spinbutton');
        fireEvent.change(mapsX, { target: { value: '' } });
        expect(store().gridDimensions.x).toBe(1);
    });

    it('shows the memory estimate', () => {
        renderSection();
        expect(screen.getByText(`~${store().memoryEstimate.estimatedMB} MB`)).toBeDefined();
        expect(screen.getByText('128 × 128 px')).toBeDefined();
    });

    it('switches to crop mode and shows the crop sliders', () => {
        renderSection();
        expect(screen.queryByText(/^zoom$/i)).toBeNull();
        chooseOption(/^crop$/i);
        expect(store().imageFitMode).toBe('crop');
        expect(screen.getByText(/^zoom$/i)).toBeDefined();
    });

    it('edits and resets the crop', () => {
        store().setImageFitMode('crop');
        renderSection();
        const [zoom] = screen.getAllByRole('slider');
        wheelUp(zoom);
        expect(store().cropSettings.zoom).toBe(1.07);
        fireEvent.click(screen.getByRole('button', { name: /reset crop/i }));
        expect(store().cropSettings.zoom).toBe(1);
    });

    it('switches resampling and its hint', () => {
        renderSection();
        expect(screen.getByText(/averages each block/i)).toBeDefined();
        chooseOption(/^sharp$/i);
        expect(store().resampling).toBe('sharp');
        expect(screen.getByText(/nearest pixel/i)).toBeDefined();
    });

    it('edits and resets the color adjustments', () => {
        renderSection();
        const [saturation, brightness, contrast] = screen.getAllByRole('slider');
        wheelUp(saturation);
        wheelUp(brightness);
        wheelUp(contrast);
        expect(store().imageSettings).toEqual({ saturation: 102, brightness: 2, contrast: 2 });
        fireEvent.click(screen.getByRole('button', { name: /reset adjustments/i }));
        expect(store().imageSettings).toEqual({ saturation: 100, brightness: 0, contrast: 0 });
    });
});
