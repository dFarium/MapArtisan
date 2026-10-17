import type React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ToolbarButtonProps extends React.ComponentProps<typeof Button> {
    /** Accessible name; also the tooltip unless `tooltip` is given. */
    label: string;
    tooltip?: string;
    /** Renders the button as a toggle (aria-pressed). */
    pressed?: boolean;
    tooltipSide?: React.ComponentProps<typeof TooltipContent>['side'];
}

/** Icon button for the floating canvas toolbars, with a tooltip. */
export const ToolbarButton = ({
    label,
    tooltip,
    pressed,
    tooltipSide = 'right',
    variant = 'ghost',
    size = 'icon-lg',
    className,
    ...props
}: ToolbarButtonProps) => (
    <Tooltip>
        {/* The span keeps the tooltip working while the button is disabled,
            since disabled buttons receive no pointer events. */}
        <TooltipTrigger asChild>
            <span className="inline-flex w-full justify-center">
                <Button
                    variant={variant}
                    size={size}
                    aria-label={label}
                    aria-pressed={pressed}
                    className={cn(
                        'w-full',
                        variant === 'ghost' && 'text-muted-foreground',
                        'aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/80',
                        className
                    )}
                    {...props}
                />
            </span>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide}>{tooltip ?? label}</TooltipContent>
    </Tooltip>
);
