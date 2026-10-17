import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PrecisionSlider } from '../PrecisionSlider';

describe('PrecisionSlider', () => {
    const renderSlider = (props: Partial<React.ComponentProps<typeof PrecisionSlider>> = {}) => {
        const onChange = vi.fn();
        render(
            <PrecisionSlider
                label="Saturation"
                value={100}
                min={0}
                max={200}
                step={1}
                unit="%"
                onChange={onChange}
                {...props}
            />
        );
        return { onChange, slider: screen.getByRole('slider') };
    };

    it('shows the label, value and unit', () => {
        renderSlider();
        expect(screen.getByText('Saturation')).toBeDefined();
        expect(screen.getByText('100%')).toBeDefined();
    });

    it('exposes the value and range to assistive tech', () => {
        const { slider } = renderSlider();
        expect(slider.getAttribute('aria-valuenow')).toBe('100');
        expect(slider.getAttribute('aria-valuemin')).toBe('0');
        expect(slider.getAttribute('aria-valuemax')).toBe('200');
    });

    it('moves by 1% of the range per wheel notch', () => {
        const { onChange, slider } = renderSlider();
        fireEvent.wheel(slider, { deltaY: -100 });
        expect(onChange).toHaveBeenLastCalledWith(102);
        fireEvent.wheel(slider, { deltaY: 100 });
        expect(onChange).toHaveBeenLastCalledWith(98);
    });

    it('moves by one step when the step is larger than 1% of the range', () => {
        const { onChange, slider } = renderSlider({ value: 5, min: 1, max: 8, step: 0.01 });
        fireEvent.wheel(slider, { deltaY: -100 });
        expect(onChange).toHaveBeenLastCalledWith(5.07);
    });

    it('does not fire when the wheel pushes past a limit', () => {
        const { onChange, slider } = renderSlider({ value: 200 });
        fireEvent.wheel(slider, { deltaY: -100 });
        expect(onChange).not.toHaveBeenCalled();
    });

    it('changes with the keyboard', () => {
        const { onChange, slider } = renderSlider();
        fireEvent.keyDown(slider, { key: 'ArrowRight' });
        expect(onChange).toHaveBeenLastCalledWith(101);
    });
});
