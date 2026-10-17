import type React from 'react';
import { Slider } from '@/components/ui/slider';

interface PrecisionSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (val: number) => void;
}

export const PrecisionSlider: React.FC<PrecisionSliderProps> = ({
    label,
    value,
    min,
    max,
    step,
    unit = "",
    onChange,
}) => {
    // Each wheel notch moves 1% of the range, or one step if that is larger.
    const handleWheel = (e: React.WheelEvent) => {
        const direction = e.deltaY > 0 ? -1 : 1;
        const range = max - min;
        const incrementalChange = Math.max(step, range * 0.01);
        const newValue = Math.min(max, Math.max(min, value + direction * incrementalChange));
        const roundedValue = Math.round(newValue / step) * step;

        if (Math.abs(roundedValue - value) > Number.EPSILON) {
            onChange(Number(roundedValue.toFixed(2)));
        }
    };

    return (
        <div className="group space-y-2">
            <div className="flex justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                <span>{label}</span>
                <span className="font-mono tabular-nums">{value}{unit}</span>
            </div>
            <Slider
                value={[value]}
                min={min}
                max={max}
                step={step}
                onValueChange={([next]) => onChange(next)}
                onWheel={handleWheel}
                className="cursor-pointer"
            />
        </div>
    );
};
