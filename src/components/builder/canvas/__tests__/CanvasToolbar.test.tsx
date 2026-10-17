import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import type React from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { describe, it, expect, vi } from 'vitest';
import { CanvasToolbar } from '../CanvasToolbar';

const wrapper = ({ children }: { children: React.ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;
const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper });

describe('CanvasToolbar', () => {
    const setScale = vi.fn();
    const setShowOriginal = vi.fn();
    const onExport = vi.fn();
    const onClearImage = vi.fn();

    const defaultProps = {
        scale: 1,
        setScale,
        isDragging: false,
        showOriginal: false,
        setShowOriginal,
        onExport,
        canExport: true,
        onClearImage,
        isProcessing: false,
        onDownloadPreview: vi.fn(),
        canDownloadPreview: true,
        onToggle3D: vi.fn(),
        is3DMode: false,
        isPainting: false,
        exportFormat: 'litematic' as const
    };

    it('renders zoom controls and handles clicks', () => {
        render(<CanvasToolbar {...defaultProps} />);

        // Zoom Out
        const zoomOutBtn = screen.getByRole('button', { name: 'Zoom Out' });
        fireEvent.click(zoomOutBtn);
        expect(setScale).toHaveBeenCalled(); // We pass a callback to setScale, verifying call is enough
    });

    it('renders current scale', () => {
        render(<CanvasToolbar {...defaultProps} scale={1.5} />);
        expect(screen.getByText('150%')).toBeDefined();
    });

    it('handles original image toggle', () => {
        render(<CanvasToolbar {...defaultProps} showOriginal={false} />);
        const toggleOriginalBtn = screen.getByRole('button', { name: 'Toggle Original Image' });

        fireEvent.click(toggleOriginalBtn);
        expect(setShowOriginal).toHaveBeenCalledWith(true); // Toggles false -> true
    });

    it('disables export button when canExport is false', () => {
        render(<CanvasToolbar {...defaultProps} canExport={false} />);
        const exportBtn = screen.getByRole('button', { name: 'Download Litematica Schematic' });
        expect(exportBtn.hasAttribute('disabled')).toBe(true);
    });

    it('shows processing indicator', () => {
        const { rerender } = render(<CanvasToolbar {...defaultProps} isProcessing={false} />);
        expect(screen.queryByText('Processing...')).toBeNull();

        rerender(<CanvasToolbar {...defaultProps} isProcessing={true} />);
        expect(screen.getByText('Processing...')).toBeDefined();
    });

    it('marks the active view toggles as pressed', () => {
        render(<CanvasToolbar {...defaultProps} showOriginal is3DMode />);
        expect(screen.getByRole('button', { name: 'Toggle Original Image' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'Toggle 3D View' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('disables the 3D toggle while painting', () => {
        render(<CanvasToolbar {...defaultProps} isPainting />);
        expect(screen.getByRole('button', { name: 'Toggle 3D View' }).hasAttribute('disabled')).toBe(true);
    });

    it('disables export while exporting', () => {
        render(<CanvasToolbar {...defaultProps} isExporting />);
        const exportBtn = screen.getByRole('button', { name: 'Download Litematica Schematic' });
        expect(exportBtn.hasAttribute('disabled')).toBe(true);
        expect(exportBtn.getAttribute('aria-busy')).toBe('true');
    });

    it('names the export button after the file format', () => {
        render(<CanvasToolbar {...defaultProps} exportFormat="nbt" />);
        expect(screen.getByRole('button', { name: 'Download Vanilla NBT Schematic' })).toBeDefined();
    });
});
