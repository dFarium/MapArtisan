import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleSectionProps {
    title: string;
    icon: ReactNode;
    children: ReactNode;
    defaultOpen?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
}

export const CollapsibleSection = ({
    title,
    icon,
    children,
    defaultOpen = true,
    isOpen: controlledIsOpen,
    onToggle
}: CollapsibleSectionProps) => {
    const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);

    const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
    const handleToggle = () => {
        if (onToggle) {
            onToggle();
        } else {
            setInternalIsOpen(!isOpen);
        }
    };

    return (
        <div className="border-b border-zinc-800 pb-2 last:border-0 last:pb-0">
            <button
                onClick={handleToggle}
                className="w-full flex items-center justify-between text-zinc-400 font-bold uppercase tracking-widest hover:text-zinc-100 transition-colors py-1.5"
            >
                <span className="flex items-center gap-2 text-[11px]">
                    {icon}
                    {title}
                </span>
                {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {isOpen && (
                <div className="mt-1 space-y-3 px-1">
                    {children}
                </div>
            )}
        </div>
    );
};
