import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CANVAS_ID, SETTINGS_ID, SkipLinks } from '../SkipLinks';

describe('SkipLinks', () => {
    it('moves focus to the canvas and to the settings panel', () => {
        render(
            <>
                <SkipLinks />
                <main id={CANVAS_ID} tabIndex={-1} />
                <div id={SETTINGS_ID} tabIndex={-1} />
            </>
        );

        fireEvent.click(screen.getByRole('button', { name: 'Skip to canvas' }));
        expect(document.activeElement?.id).toBe(CANVAS_ID);

        fireEvent.click(screen.getByRole('button', { name: 'Skip to settings' }));
        expect(document.activeElement?.id).toBe(SETTINGS_ID);
    });

    it('comes first in the tab order', () => {
        render(
            <>
                <SkipLinks />
                <button>Palette group</button>
            </>
        );
        const [first] = screen.getAllByRole('button');
        expect(first.textContent).toBe('Skip to canvas');
    });
});
