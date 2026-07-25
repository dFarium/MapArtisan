import { describe, expect, it, vi } from 'vitest';
import { LatestWinsQueue } from '../latestWinsQueue';

describe('LatestWinsQueue', () => {
    it('allows one active task and retains only the latest pending task', async () => {
        const queue = new LatestWinsQueue();
        const completed: number[] = [];
        let active = 0;
        let maxActive = 0;
        let releaseFirst!: () => void;
        const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });

        const makeTask = (id: number, gate?: Promise<void>) => vi.fn(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await gate;
            completed.push(id);
            active--;
        });

        const first = makeTask(1, firstGate);
        const replaced = makeTask(2);
        const latest = makeTask(3);

        queue.enqueue(first);
        queue.enqueue(replaced);
        queue.enqueue(latest);

        expect(first).toHaveBeenCalledTimes(1);
        expect(replaced).not.toHaveBeenCalled();
        expect(latest).not.toHaveBeenCalled();

        releaseFirst();
        await vi.waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(queue.isRunning).toBe(false));

        expect(replaced).not.toHaveBeenCalled();
        expect(completed).toEqual([1, 3]);
        expect(maxActive).toBe(1);
    });

    it('can discard pending work without interrupting the active task', async () => {
        const queue = new LatestWinsQueue();
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const pending = vi.fn(async () => undefined);

        queue.enqueue(async () => gate);
        queue.enqueue(pending);
        queue.clearPending();
        release();

        await vi.waitFor(() => expect(queue.isRunning).toBe(false));
        expect(pending).not.toHaveBeenCalled();
    });
});
