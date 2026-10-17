import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ControlPanel } from '../ControlPanel';
import { resetStore, renderPanel } from '../control-panel/__tests__/helpers';

describe('ControlPanel', () => {
    beforeEach(resetStore);

    it('keeps one section open at a time', () => {
        renderPanel(<ControlPanel onOpenMaterials={() => {}} />);
        expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
        expect(screen.queryByText(/oklab color space/i)).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /color processing/i }));
        expect(screen.getByText(/oklab color space/i)).toBeDefined();
        expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);

        fireEvent.click(screen.getByRole('button', { name: /color processing/i }));
        expect(screen.queryByText(/oklab color space/i)).toBeNull();
    });

    it('opens the material list', () => {
        const onOpenMaterials = vi.fn();
        renderPanel(<ControlPanel onOpenMaterials={onOpenMaterials} />);
        fireEvent.click(screen.getByRole('button', { name: /material list/i }));
        expect(onOpenMaterials).toHaveBeenCalled();
    });

    it('links to the about page', () => {
        renderPanel(<ControlPanel onOpenMaterials={() => {}} />);
        expect(screen.getByRole('link', { name: /about/i }).getAttribute('href')).toBe('/about');
    });
});
