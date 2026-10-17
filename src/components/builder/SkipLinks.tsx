import { Button } from '@/components/ui/button';

export const CANVAS_ID = 'builder-canvas';
export const SETTINGS_ID = 'builder-settings';

const TARGETS = [
    { id: CANVAS_ID, label: 'Skip to canvas' },
    { id: SETTINGS_ID, label: 'Skip to settings' },
];

/**
 * Hidden until focused. The palette's color groups come first in the tab
 * order, so the first Tab lands here and lets keyboard users jump past them.
 * Targets need tabIndex={-1} to take focus.
 */
export const SkipLinks = () => (
    <div className="absolute left-2 top-2 z-50 flex gap-2">
        {TARGETS.map(({ id, label }) => (
            <Button
                key={id}
                variant="secondary"
                className="sr-only focus-visible:not-sr-only"
                onClick={() => document.getElementById(id)?.focus()}
            >
                {label}
            </Button>
        ))}
    </div>
);
