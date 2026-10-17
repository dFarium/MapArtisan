import { Fragment } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export interface Hint {
    icon: LucideIcon;
    label: string;
    bind: string;
}

/** Floating pill at the top of the canvas listing mouse and keyboard bindings. */
export const HintBar = ({ hints }: { hints: Hint[] }) => (
    <div className="absolute top-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-full border bg-popover/90 px-3 py-2 text-xs shadow-xl backdrop-blur-md pointer-events-none select-none">
        {hints.map(({ icon: Icon, label, bind }, i) => (
            <Fragment key={label}>
                {i > 0 && <Separator orientation="vertical" className="h-3" />}
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">{label}:</span>
                    <span className="font-semibold text-foreground">{bind}</span>
                </div>
            </Fragment>
        ))}
    </div>
);
