import type React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

interface FieldLabelProps extends React.ComponentProps<typeof Label> {
    icon?: React.ReactNode;
}

/** Uppercase title for a field or group inside a panel section. */
export const FieldLabel = ({ icon, className, children, ...props }: FieldLabelProps) => (
    <Label
        className={cn('gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground [&_svg]:size-3.5', className)}
        {...props}
    >
        {icon}
        {children}
    </Label>
);
