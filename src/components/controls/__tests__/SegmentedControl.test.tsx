import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SegmentedControl } from '../SegmentedControl';

const OPTIONS = [
    { value: 'adjust', label: 'Adjust' },
    { value: 'crop', label: 'Crop' },
] as const;

describe('SegmentedControl', () => {
    const renderControl = (value: 'adjust' | 'crop' = 'adjust') => {
        const onValueChange = vi.fn();
        render(
            <SegmentedControl
                aria-label="Image fit"
                value={value}
                onValueChange={onValueChange}
                options={OPTIONS}
            />
        );
        return { onValueChange };
    };

    it('marks the selected option', () => {
        renderControl('crop');
        expect(screen.getByRole('radio', { name: 'Crop' }).getAttribute('aria-checked')).toBe('true');
        expect(screen.getByRole('radio', { name: 'Adjust' }).getAttribute('aria-checked')).toBe('false');
    });

    it('selects another option on click', () => {
        const { onValueChange } = renderControl();
        fireEvent.click(screen.getByRole('radio', { name: 'Crop' }));
        expect(onValueChange).toHaveBeenCalledWith('crop');
    });

    it('keeps the active option when it is clicked again', () => {
        const { onValueChange } = renderControl();
        fireEvent.click(screen.getByRole('radio', { name: 'Adjust' }));
        expect(onValueChange).not.toHaveBeenCalled();
    });

    it('labels the group', () => {
        renderControl();
        expect(screen.getByRole('radiogroup', { name: 'Image fit' })).toBeDefined();
    });
});
