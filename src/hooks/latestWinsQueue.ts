export type AsyncTask = () => Promise<void>;

/**
 * Runs at most one async task at a time. While it is busy, newly enqueued work
 * replaces the previous pending task, so a burst retains only the latest state.
 */
export class LatestWinsQueue {
    private running = false;
    private pending: AsyncTask | null = null;

    get isRunning(): boolean {
        return this.running;
    }

    enqueue(task: AsyncTask): void {
        if (this.running) {
            this.pending = task;
            return;
        }

        this.running = true;
        void this.drain(task);
    }

    clearPending(): void {
        this.pending = null;
    }

    private async drain(initialTask: AsyncTask): Promise<void> {
        let task: AsyncTask | null = initialTask;
        try {
            while (task) {
                try {
                    await task();
                } catch (error) {
                    // A failed task must not prevent the latest pending task from running.
                    console.error('[LatestWinsQueue] Task failed', error);
                }
                task = this.pending;
                this.pending = null;
            }
        } finally {
            this.running = false;
        }
    }
}
