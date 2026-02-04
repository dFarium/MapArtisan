import { useMapart } from '../../../context/useMapart';
import { type LucideIcon, Paintbrush, Eraser, Move, ZoomIn } from 'lucide-react';

interface HintItemProps {
    icon: LucideIcon;
    label: string;
    bind: string;
}

const HintItem = ({ icon: Icon, label, bind }: HintItemProps) => (
    <div className="flex items-center gap-1.5">
        <Icon size={14} className="text-zinc-400" />
        <span className="text-zinc-300">{label}:</span>
        <span className="text-white font-semibold">{bind}</span>
    </div>
);

export const InteractionHints = () => {
    const isPainting = useMapart(s => s.isPainting);

    return (
        <div className="absolute bottom-4 right-4 bg-black/80 text-xs px-3 py-2 rounded-full backdrop-blur-md pointer-events-none select-none z-30 font-sans tracking-wide transition-all duration-300 border border-white/10 shadow-xl">
            {isPainting ? (
                <div className="flex items-center gap-4">
                    <HintItem icon={Paintbrush} label="Paint" bind="LMB" />
                    <div className="w-px h-3 bg-white/20" />
                    <HintItem icon={Eraser} label="Erase" bind="RMB" />
                    <div className="w-px h-3 bg-white/20" />
                    <HintItem icon={Move} label="Pan" bind="Ctrl+Drag" />
                    <div className="w-px h-3 bg-white/20" />
                    <HintItem icon={ZoomIn} label="Zoom" bind="Wheel" />
                </div>
            ) : (
                <div className="flex items-center gap-4">
                    <HintItem icon={Move} label="Pan" bind="Drag" />
                    <div className="w-px h-3 bg-white/20" />
                    <HintItem icon={ZoomIn} label="Zoom" bind="Wheel" />
                </div>
            )}
        </div>
    );
};
