import { beforeEach, describe, expect, it } from 'vitest';
import { useMapartStore } from '../useMapartStore';
import type { ManualEdit } from '../../types/mapart';

const store = () => useMapartStore.getState();

const block = (blockId: string): ManualEdit => ({
    blockId,
    brightness: 'normal',
    rgb: { r: 1, g: 2, b: 3 },
});
const STONE = block('minecraft:stone');
const DIRT = block('minecraft:dirt');

describe('undo/redo history', () => {
    beforeEach(() => {
        useMapartStore.setState({ manualEdits: {}, history: [], historyIndex: 0 });
    });

    it('undoes and redoes a stroke', () => {
        store().applyStroke({ 0: STONE, 1: STONE });
        expect(store().manualEdits).toEqual({ 0: STONE, 1: STONE });

        store().undo();
        expect(store().manualEdits).toEqual({});

        store().redo();
        expect(store().manualEdits).toEqual({ 0: STONE, 1: STONE });
    });

    it('restores the color a stroke painted over', () => {
        store().applyStroke({ 0: STONE });
        store().applyStroke({ 0: DIRT });
        store().undo();
        expect(store().manualEdits).toEqual({ 0: STONE });
    });

    it('restores erased pixels', () => {
        store().applyStroke({ 0: STONE, 1: DIRT });
        store().applyStroke({}, [0]);
        expect(store().manualEdits).toEqual({ 1: DIRT });

        store().undo();
        expect(store().manualEdits).toEqual({ 0: STONE, 1: DIRT });
    });

    it('keeps the oldest strokes when the history drops entries', () => {
        // 60 strokes overflow the 50-entry limit and drop the first 10.
        for (let i = 0; i < 60; i++) store().applyStroke({ [i]: STONE });
        expect(store().history).toHaveLength(50);

        store().undo();
        const edits = store().manualEdits;
        expect(Object.keys(edits)).toHaveLength(59);
        expect(edits[0]).toBe(STONE);
        expect(edits[59]).toBeUndefined();
    });

    it('stops undoing at the oldest kept stroke', () => {
        for (let i = 0; i < 60; i++) store().applyStroke({ [i]: STONE });
        for (let i = 0; i < 60; i++) store().undo();
        expect(store().historyIndex).toBe(0);
        // The 10 strokes that left the history stay painted.
        expect(Object.keys(store().manualEdits).map(Number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('drops the redo branch on a new stroke', () => {
        store().applyStroke({ 0: STONE });
        store().applyStroke({ 1: STONE });
        store().undo();
        store().applyStroke({ 2: DIRT });

        expect(store().history).toHaveLength(2);
        store().redo();
        expect(store().manualEdits).toEqual({ 0: STONE, 2: DIRT });
    });

    it('does not record a stroke that changes nothing', () => {
        store().applyStroke({ 0: STONE });
        store().applyStroke({ 0: STONE });
        store().applyStroke({}, [5]);
        expect(store().history).toHaveLength(1);
    });

    it('keeps an oversized stroke but restarts the history', () => {
        store().applyStroke({ 0: STONE });
        // Well over the 2 MB budget per entry.
        const huge: Record<number, ManualEdit> = {};
        for (let i = 1; i <= 40_000; i++) huge[i] = DIRT;
        store().applyStroke(huge);

        expect(Object.keys(store().manualEdits)).toHaveLength(40_001);
        expect(store().history).toEqual([]);
        expect(store().historyIndex).toBe(0);
    });
});
