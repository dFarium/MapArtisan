import * as React from 'react';
import { cn } from '../../utils/cn';
import { Check } from 'lucide-react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
    onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
    ({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            if (onCheckedChange) {
                onCheckedChange(e.target.checked);
            }
            if (onChange) {
                onChange(e);
            }
        };

        return (
            <div className="relative flex items-center">
                <input
                    type="checkbox"
                    className={cn("peer h-5 w-5 appearance-none rounded border border-zinc-700 bg-zinc-950 checked:bg-blue-600 checked:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-1 focus:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 transition-all cursor-pointer", className)}
                    ref={ref}
                    checked={checked}
                    onChange={handleChange}
                    {...props}
                />
                <Check
                    size={14}
                    strokeWidth={3}
                    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 transition-opacity"
                />
            </div>
        );
    }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
