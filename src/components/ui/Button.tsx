import * as React from 'react';
import { cn } from '../../utils/cn';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'secondary' | 'ghost' | 'destructive' | 'outline' | 'link';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'default', size = 'default', isLoading, children, disabled, ...props }, ref) => {
        return (
            <button
                ref={ref}
                disabled={isLoading || disabled}
                className={cn(
                    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50",
                    {
                        // Variants
                        "bg-blue-600 text-white shadow hover:bg-blue-700": variant === 'default',
                        "bg-zinc-800 text-zinc-100 shadow-sm hover:bg-zinc-700": variant === 'secondary',
                        "hover:bg-zinc-800 hover:text-zinc-100 text-zinc-400": variant === 'ghost',
                        "bg-red-900/50 text-red-200 hover:bg-red-900/70 border border-red-900": variant === 'destructive',
                        "border border-zinc-700 bg-transparent shadow-sm hover:bg-zinc-800 hover:text-zinc-100": variant === 'outline',
                        "text-blue-500 underline-offset-4 hover:underline": variant === 'link',

                        // Sizes
                        "h-9 px-4 py-2": size === 'default',
                        "h-8 rounded-md px-3 text-xs": size === 'sm',
                        "h-10 rounded-md px-8": size === 'lg',
                        "h-9 w-9 p-0": size === 'icon',
                    },
                    className
                )}
                {...props}
            >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {children}
            </button>
        );
    }
);
Button.displayName = "Button";

export { Button };
