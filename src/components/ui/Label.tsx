import * as React from 'react';
import { cn } from '../../utils/cn';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
    icon?: React.ReactNode;
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
    ({ className, children, icon, ...props }, ref) => {
        return (
            <label
                ref={ref}
                className={cn(
                    "text-xs text-zinc-500 uppercase font-bold flex items-center gap-2 tracking-wider leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2",
                    className
                )}
                {...props}
            >
                {icon}
                {children}
            </label>
        );
    }
);
Label.displayName = "Label";

export { Label };
