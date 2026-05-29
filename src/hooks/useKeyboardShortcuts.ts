import { useEffect } from 'react';
import { useMapartStore } from '../store/useMapartStore';

/**
 * Hook to register global keyboard shortcuts for the editor.
 * 
 * Supports:
 * - 'B' -> Activate Paint Brush tool
 * - 'I' -> Activate Color Picker (eyedropper) tool
 * - 'Escape' -> Exit painting/picking mode
 * - 'Ctrl+Z' / 'Cmd+Z' -> Undo
 * - 'Ctrl+Y' / 'Cmd+Y' or 'Ctrl+Shift+Z' -> Redo
 * 
 * Safe against typing inside input fields/textareas.
 */
export const useKeyboardShortcuts = () => {
    const isPainting = useMapartStore(s => s.isPainting);
    const setIsPainting = useMapartStore(s => s.setIsPainting);
    const isPicking = useMapartStore(s => s.isPicking);
    const setIsPicking = useMapartStore(s => s.setIsPicking);
    const undo = useMapartStore(s => s.undo);
    const redo = useMapartStore(s => s.redo);
    const uploadedImage = useMapartStore(s => s.uploadedImage);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Avoid triggering shortcuts when typing in inputs/textareas
            const activeEl = document.activeElement;
            if (activeEl && (
                activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA' ||
                activeEl.getAttribute('contenteditable') === 'true'
            )) {
                return;
            }

            if (!uploadedImage) return;

            // Undo / Redo (Ctrl + Z / Ctrl + Y)
            if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                if (e.key === 'z' || e.key === 'Z') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        redo();
                    } else {
                        undo();
                    }
                } else if (e.key === 'y' || e.key === 'Y') {
                    e.preventDefault();
                    redo();
                }
                return;
            }

            // Simple tool switches (b, i, Escape) without modifiers
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                if (e.key === 'b' || e.key === 'B') {
                    e.preventDefault();
                    if (isPainting && !isPicking) {
                        // Toggle off if already in brush mode
                        setIsPainting(false);
                        setIsPicking(false);
                    } else {
                        // Switch to brush mode
                        setIsPainting(true);
                        setIsPicking(false);
                    }
                } else if (e.key === 'i' || e.key === 'I') {
                    e.preventDefault();
                    if (isPainting && isPicking) {
                        // Toggle off if already in picker mode
                        setIsPainting(false);
                        setIsPicking(false);
                    } else {
                        // Switch to picker mode
                        setIsPainting(true);
                        setIsPicking(true);
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsPainting(false);
                    setIsPicking(false);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [uploadedImage, isPainting, isPicking, setIsPainting, setIsPicking, undo, redo]);
};
