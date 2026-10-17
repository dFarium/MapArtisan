import type React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useMapartStore } from '../../../../store/useMapartStore';

// These helpers find controls by what the user sees, so the same tests run
// against the hand-made controls and their shadcn replacements.

const initialState = useMapartStore.getState();

export const resetStore = () => useMapartStore.setState(initialState, true);

export const store = () => useMapartStore.getState();

export const renderPanel = (ui: React.ReactElement) =>
    render(
        <MemoryRouter>
            <TooltipProvider>{ui}</TooltipProvider>
        </MemoryRouter>
    );

/** Clicks an option of a segmented selector or radio list by its visible text. */
export const chooseOption = (text: RegExp) => {
    const el = screen.getByText(text);
    fireEvent.click(el.closest('button') ?? el);
};

/** Picks an option of a native <select> or a Radix Select, found by its current text. */
export const pickSelectOption = (currentText: RegExp, optionText: RegExp) => {
    const native = screen.queryByDisplayValue(currentText);
    if (native instanceof HTMLSelectElement) {
        const option = Array.from(native.options).find((o) => optionText.test(o.text));
        if (!option) throw new Error(`No option matching ${optionText}`);
        fireEvent.change(native, { target: { value: option.value } });
        return;
    }
    const trigger = screen.getByText(currentText).closest('[role="combobox"]');
    if (!trigger) throw new Error(`No select showing ${currentText}`);
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const option = within(screen.getByRole('listbox')).getByRole('option', { name: optionText });
    fireEvent.keyDown(option, { key: 'Enter' });
};

/** A checkbox or switch; there must be exactly one in the rendered tree. */
export const getToggle = () => screen.queryByRole('switch') ?? screen.getByRole('checkbox');

/** Scrolls the mouse wheel up one notch over a slider. */
export const wheelUp = (slider: HTMLElement) => fireEvent.wheel(slider, { deltaY: -100 });
