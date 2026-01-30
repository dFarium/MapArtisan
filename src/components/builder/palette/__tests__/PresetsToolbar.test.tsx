import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PresetsToolbar } from '../PresetsToolbar';

describe('PresetsToolbar', () => {
    const mockHook = {
        customPresets: [
            { name: 'My Custom', selection: { 1: 'block' } }
        ],
        applyPreset: vi.fn(),
        saveCurrentAsPreset: vi.fn(),
        deletePreset: vi.fn()
    };

    it('renders and toggles visibility', () => {
        render(<PresetsToolbar presetsHook={mockHook as any} onReset={() => { }} />);

        expect(screen.getByText('Presets')).toBeDefined();
        // Content hidden initially
        expect(screen.queryByText('All Colors')).toBeNull();

        // Toggle open
        fireEvent.click(screen.getByText('Presets'));
        expect(screen.getByText('All Colors')).toBeDefined();
    });

    it('calls applyPreset with correct args', () => {
        render(<PresetsToolbar presetsHook={mockHook as any} onReset={() => { }} />);
        fireEvent.click(screen.getByText('Presets')); // Open

        fireEvent.click(screen.getByText('Basic (16)'));
        expect(mockHook.applyPreset).toHaveBeenCalledWith('basic');
    });

    it('shows custom presets and allows applying them', () => {
        render(<PresetsToolbar presetsHook={mockHook as any} onReset={() => { }} />);
        fireEvent.click(screen.getByText('Presets')); // Open

        expect(screen.getByText('My Custom')).toBeDefined();
        fireEvent.click(screen.getByText('My Custom'));
        expect(mockHook.applyPreset).toHaveBeenCalledWith('custom', { 1: 'block' });
    });
});
