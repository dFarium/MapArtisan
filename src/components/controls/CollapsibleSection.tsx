import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
    onToggle,
}: CollapsibleSectionProps) => {
    const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
    const isOpen = controlledIsOpen ?? internalIsOpen;

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={(open) => (onToggle ? onToggle() : setInternalIsOpen(open))}
            className="border-b pb-2 last:border-0 last:pb-0"
        >
            <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md py-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 data-[state=open]:text-foreground">
                <span className="flex items-center gap-2 [&_svg]:size-4">
                    {icon}
                    {title}
                </span>
                <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-3 px-1">
                {children}
            </CollapsibleContent>
        </Collapsible>
    );
};
