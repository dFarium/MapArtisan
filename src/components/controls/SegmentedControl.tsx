import type React from 'react';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface SegmentedOption<T extends string> {
    value: T;
    label: React.ReactNode;
    icon?: React.ReactNode;
    tooltip?: string;
}

interface SegmentedControlProps<T extends string> {
    value: T;
    onValueChange: (value: T) => void;
    options: readonly SegmentedOption<T>[];
    'aria-label'?: string;
    className?: string;
}

/** Single-choice selector for 2–3 options. Clicking the active option keeps it selected. */
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
            className={cn('w-full rounded-lg border bg-muted/40 p-0.5', className)}
        >
            {options.map((option) => {
                // Style the active item by aria-checked too: a TooltipTrigger wrapper
                // overwrites data-state with the tooltip's open/closed state.
                const item = (
                    <ToggleGroupItem
                        key={option.value}
                        value={option.value}
                        className="flex-1 uppercase text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground aria-checked:bg-primary aria-checked:text-primary-foreground"
                    >
                        {option.icon}
                        {option.label}
                    </ToggleGroupItem>
                );
                if (!option.tooltip) return item;
                return (
                    <Tooltip key={option.value}>
                        <TooltipTrigger asChild>{item}</TooltipTrigger>
                        <TooltipContent>{option.tooltip}</TooltipContent>
                    </Tooltip>
                );
            })}
        </ToggleGroup>
    );
}
