import React from 'react';

interface PrecisionSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (val: number) => void;
    accentColor?: string;
}

export const PrecisionSlider: React.FC<PrecisionSliderProps> = ({
    label,
    value,
    min,
    max,
    step,
    unit = "",
    onChange,
    accentColor = "accent-blue-500"
}) => {
    const handleWheel = (e: React.WheelEvent) => {
        // Prevent page scroll when hovering (standard behavior for precision inputs)
        // Note: In React passive event listeners might prevent preventDefault.
        // If that issue arises, we'd need a ref and native event listener.
        // For now, keeping original logic.

        const direction = e.deltaY > 0 ? -1 : 1;
        const range = max - min;
        const incrementalChange = Math.max(step, range * 0.01);
        const newValue = Math.min(max, Math.max(min, value + direction * incrementalChange));
        const roundedValue = Math.round(newValue / step) * step;

        // Only trigger change if value actually changed
        if (Math.abs(roundedValue - value) > Number.EPSILON) {
            onChange(Number(roundedValue.toFixed(2)));
        }
    };

    return (
        <div className="space-y-1.5 group">
            <div className="flex justify-between text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors uppercase tracking-wider font-semibold">
                <span>{label}</span>
                <span className="font-mono">{value}{unit}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                onWheel={handleWheel}
                className={`w-full ${accentColor} cursor-pointer`}
            />
        </div>
    );
};
