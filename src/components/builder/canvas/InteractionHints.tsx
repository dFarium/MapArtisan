import { useMapartStore as useMapart } from '../../../store/useMapartStore';
import { Paintbrush, Eraser, Move, ZoomIn } from 'lucide-react';
import { HintBar, type Hint } from './HintBar';

const PAINTING_HINTS: Hint[] = [
    { icon: Paintbrush, label: 'Paint', bind: 'LMB' },
    { icon: Eraser, label: 'Erase', bind: 'RMB' },
    { icon: Move, label: 'Pan', bind: 'Ctrl+Drag' },
    { icon: ZoomIn, label: 'Zoom', bind: 'Wheel' },
];

const VIEW_HINTS: Hint[] = [
    { icon: Paintbrush, label: 'Edit Mode', bind: 'B' },
    { icon: Move, label: 'Pan', bind: 'Drag' },
    { icon: ZoomIn, label: 'Zoom', bind: 'Wheel' },
];

export const InteractionHints = () => {
    const isPainting = useMapart(s => s.isPainting);

    return <HintBar hints={isPainting ? PAINTING_HINTS : VIEW_HINTS} />;
};
