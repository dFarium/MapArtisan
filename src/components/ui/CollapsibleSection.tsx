import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleSectionProps {
    title: string;
    icon: ReactNode;
    children: ReactNode;
    defaultOpen?: boolean;
}

export const CollapsibleSection = ({
    title,
    icon,
    children,
    defaultOpen = true
}: CollapsibleSectionProps) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border-b border-zinc-800 pb-5 last:border-0 last:pb-0">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between text-zinc-400 font-bold uppercase tracking-widest hover:text-zinc-100 transition-colors py-2"
            >
                <span className="flex items-center gap-3 text-xs">
                    {icon}
                    {title}
                </span>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {isOpen && (
                <div className="mt-3 space-y-5 px-1">
                    {children}
                </div>
            )}
        </div>
    );
};
