import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PresetsToolbar } from '../PresetsToolbar';
import { ToastProvider } from '../../../ui/Toast';

const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <ToastProvider>{children}</ToastProvider>
);

describe('PresetsToolbar', () => {
    const mockHook = {
        customPresets: [
            { name: 'My Custom', selection: { 1: 'block' } }
        ],
        applyPreset: vi.fn(() => ({ replacements: [] })),
        saveCurrentAsPreset: vi.fn(),
        deletePreset: vi.fn(),
        lastReplacements: [],
        clearReplacements: vi.fn()
    };

    it('renders and toggles visibility', () => {
        const h = mockHook as unknown as Parameters<typeof PresetsToolbar>[0]['presetsHook'];
        render(<PresetsToolbar presetsHook={h} onReset={() => { }} />, { wrapper: Wrapper });

        expect(screen.getByText('Presets')).toBeDefined();
        // Content hidden initially
        expect(screen.queryByText('All Colors')).toBeNull();

        // Toggle open
        fireEvent.click(screen.getByText('Presets'));
        expect(screen.getByText('All Colors')).toBeDefined();
    });

    it('calls applyPreset with correct args', () => {
        const h = mockHook as unknown as Parameters<typeof PresetsToolbar>[0]['presetsHook'];
        render(<PresetsToolbar presetsHook={h} onReset={() => { }} />, { wrapper: Wrapper });
        fireEvent.click(screen.getByText('Presets')); // Open

        fireEvent.click(screen.getByText('Basic (16)'));
        expect(mockHook.applyPreset).toHaveBeenCalledWith('basic', undefined);
    });

    it('shows custom presets and allows applying them', () => {
        const h = mockHook as unknown as Parameters<typeof PresetsToolbar>[0]['presetsHook'];
        render(<PresetsToolbar presetsHook={h} onReset={() => { }} />, { wrapper: Wrapper });
        fireEvent.click(screen.getByText('Presets')); // Open

        expect(screen.getByText('My Custom')).toBeDefined();
        fireEvent.click(screen.getByText('My Custom'));
        expect(mockHook.applyPreset).toHaveBeenCalledWith('custom', { 1: 'block' });
    });
});

