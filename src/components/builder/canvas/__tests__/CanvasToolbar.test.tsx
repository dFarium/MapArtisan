import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CanvasToolbar } from '../CanvasToolbar';

describe('CanvasToolbar', () => {
    const setScale = vi.fn();
    const setShowPreview = vi.fn();
    const onExport = vi.fn();
    const onClearImage = vi.fn();

    const defaultProps = {
        scale: 1,
        setScale,
        isDragging: false,
        showPreview: true,
        setShowPreview,
        onExport,
        canExport: true,
        onClearImage,
        isProcessing: false,
        onDownloadPreview: vi.fn(),
        canDownloadPreview: true
    };

    it('renders zoom controls and handles clicks', () => {
        render(<CanvasToolbar {...defaultProps} />);

        // Zoom Out
        const zoomOutBtn = screen.getAllByRole('button')[0]; // Assuming order
        fireEvent.click(zoomOutBtn);
        expect(setScale).toHaveBeenCalled(); // We pass a callback to setScale, verifying call is enough
    });

    it('renders current scale', () => {
        render(<CanvasToolbar {...defaultProps} scale={1.5} />);
        expect(screen.getByText('150%')).toBeDefined();
    });

    it('handles preview toggle', () => {
        render(<CanvasToolbar {...defaultProps} />);
        const buttons = screen.getAllByRole('button');
        const previewBtn = buttons[3]; // Approx index, better to use title if possible

        fireEvent.click(previewBtn);
        expect(setShowPreview).toHaveBeenCalledWith(false); // Toggles true -> false
    });

    it('disables export button when canExport is false', () => {
        render(<CanvasToolbar {...defaultProps} canExport={false} />);
        const exportBtn = screen.getByTitle('Download Litematica Schematic');
        expect(exportBtn.hasAttribute('disabled')).toBe(true);
    });

    it('shows processing indicator', () => {
        const { rerender } = render(<CanvasToolbar {...defaultProps} isProcessing={false} />);
        expect(screen.queryByText('Processing...')).toBeNull();

        rerender(<CanvasToolbar {...defaultProps} isProcessing={true} />);
        expect(screen.getByText('Processing...')).toBeDefined();
    });
});
