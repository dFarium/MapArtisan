import type React from 'react';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export interface SegmentedOption<T extends string> {
    value: T;
    label: React.ReactNode;
    icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
    value: T;
    onValueChange: (value: T) => void;
    options: readonly SegmentedOption<T>[];
    'aria-label'?: string;
    className?: string;
}

/**
 * Single-choice selector for 2–3 options, styled as tabs: the active option is
 * a raised segment on a darker track, so blue stays reserved for actions.
 * Clicking the active option keeps it selected.
 */
export function SegmentedControl<T extends string>({
    value,
    onValueChange,
    options,
    'aria-label': ariaLabel,
    className,
}: SegmentedControlProps<T>) {
    return (
        <ToggleGroup
            type="single"
            value={value}
            onValueChange={(next) => {
                if (next) onValueChange(next as T);
            }}
            spacing={1}
            aria-label={ariaLabel}
            className={cn('w-full rounded-lg border bg-background/50 p-0.5', className)}
        >
            {options.map((option) => (
                <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className="flex-1 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:ring-1 data-[state=on]:ring-input"
                >
                    {option.icon}
                    {option.label}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    );
}
