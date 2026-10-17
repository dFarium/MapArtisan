import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROCESSING_PROTOCOL_VERSION, type GenerateSnapshotResponseV1 } from '../../engine';
import { SyncCoordinator, LAYOUT_HINT, type SyncClient, type SyncState } from '../coordinator';
import type { SessionInfo } from '../protocol';
import { testSnapshot } from './fixtures';

/** Editor whose construction is identified by a version; the snapshot hash follows it. */
function editor() {
    const state = { version: 1, layoutBlocked: false };
    const source = vi.fn(async (): Promise<GenerateSnapshotResponseV1> => {
        const envelope = { protocolVersion: PROCESSING_PROTOCOL_VERSION, requestId: 1, sourceVersion: 1 };
        if (state.layoutBlocked) {
            return { ...envelope, status: 'rejected', code: 'UNSUPPORTED_LAYOUT', message: 'Single File only supports 1x1 maps' };
        }
        const snapshot = testSnapshot([[0, 0, 0, 0]]);
        snapshot.contentHash = `hash-${state.version}`;
        return { ...envelope, status: 'completed', snapshot };
    });
    return { state, source };
}

/** A client whose sends stay open until the test answers them. */
function fakeClient(lastAppliedHash: string | null = null) {
    const sent: { hash: string; resolve: () => void; reject: (error: Error) => void }[] = [];
    let revision = 0;
    const client = {
        connected: true,
        inFlight: null as Promise<never> | null,
        session: {
            lastApplied: lastAppliedHash ? { revision: 0, contentHash: lastAppliedHash } : null,
            needsResync: false,
        } as unknown as SessionInfo,
        send: vi.fn((snapshot: { contentHash: string }) => new Promise((resolve, reject) => {
            const current = ++revision;
            sent.push({
                hash: snapshot.contentHash,
                resolve: () => {
                    client.session = { ...client.session, lastApplied: { revision: current, contentHash: snapshot.contentHash } };
                    resolve({ type: 'applied', revision: current, contentHash: snapshot.contentHash, repeated: false, needsResync: false });
                },
                reject,
            });
        })),
    };
    return { client: client as unknown as SyncClient & typeof client, sent };
}

function coordinator(client: SyncClient, source: () => Promise<GenerateSnapshotResponseV1 | null>, autoSync = true) {
    const states: SyncState[] = [];
    const sync = new SyncCoordinator({ client, source, onChange: (s) => states.push(s), autoSync, now: () => 0 });
    return { sync, states };
}

/** Lets pending promise callbacks run without moving the clock. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('SyncCoordinator', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('batches a burst of changes and sends only the latest construction', async () => {
        const { state, source } = editor();
        const { client, sent } = fakeClient();
        const { sync } = coordinator(client, source);

        // Ten edits 50 ms apart: each one restarts the 200 ms batching delay.
        for (let i = 0; i < 10; i++) {
            state.version++;
            sync.constructionChanged();
            await vi.advanceTimersByTimeAsync(50);
        }
        await vi.advanceTimersByTimeAsync(200);
        expect(sent.map(s => s.hash)).toEqual(['hash-11']);

        // More edits while revision 1 is pasting: only the last one follows it.
        for (let i = 0; i < 5; i++) {
            state.version++;
            sync.constructionChanged();
            await vi.advanceTimersByTimeAsync(50);
        }
        sent[0].resolve();
        await vi.advanceTimersByTimeAsync(200);
        expect(sent.map(s => s.hash)).toEqual(['hash-11', 'hash-16']);

        sent[1].resolve();
        await vi.advanceTimersByTimeAsync(1000);
        expect(sent).toHaveLength(2);
        expect(sync.current.status).toBe('synced');
    });

    it('does not send what the game already holds, unless it needs a resync', async () => {
        const { source } = editor();
        const { client, sent } = fakeClient('hash-1');
        const { sync } = coordinator(client, source);

        sync.connected();
        await vi.advanceTimersByTimeAsync(0);
        expect(source).toHaveBeenCalledTimes(1);
        expect(sent).toHaveLength(0);
        expect(sync.current.status).toBe('synced');

        client.session = { ...client.session, needsResync: true };
        sync.constructionChanged();
        await vi.advanceTimersByTimeAsync(200);
        expect(sent.map(s => s.hash)).toEqual(['hash-1']);
    });

    it('holds changes while automatic sync is off or sending is paused', async () => {
        const { state, source } = editor();
        const { client, sent } = fakeClient('hash-1');
        const { sync } = coordinator(client, source, false);

        state.version = 2;
        sync.constructionChanged();
        await vi.advanceTimersByTimeAsync(1000);
        expect(source).not.toHaveBeenCalled();
        expect(sync.current.status).toBe('outdated');

        sync.setAutoSync(true);
        sync.setSendingPaused(true);
        state.version = 3;
        sync.constructionChanged();
        await vi.advanceTimersByTimeAsync(1000);
        expect(sent).toHaveLength(0);

        sync.setSendingPaused(false);
        await vi.advanceTimersByTimeAsync(200);
        expect(sent.map(s => s.hash)).toEqual(['hash-3']);
    });

    it('reports a File Layout that cannot sync without sending', async () => {
        const { state, source } = editor();
        state.layoutBlocked = true;
        const { client, sent } = fakeClient();
        const { sync } = coordinator(client, source);

        sync.connected();
        await settle();
        expect(sent).toHaveLength(0);
        expect(sync.current).toMatchObject({ status: 'blocked', message: LAYOUT_HINT });

        state.layoutBlocked = false;
        sync.constructionChanged();
        await vi.advanceTimersByTimeAsync(200);
        expect(sent).toHaveLength(1);
    });

    it('never retries a failed revision by itself', async () => {
        const { state, source } = editor();
        const { client, sent } = fakeClient();
        const { sync } = coordinator(client, source);

        sync.connected();
        await settle();
        sent[0].reject(Object.assign(new Error('aborted'), { code: 'ABORTED', partial: true }));
        await vi.advanceTimersByTimeAsync(5000);
        expect(sent).toHaveLength(1);
        expect(sync.current).toMatchObject({ status: 'error', message: 'ABORTED: aborted' });

        state.version = 2;
        sync.constructionChanged();
        await vi.advanceTimersByTimeAsync(200);
        expect(sent).toHaveLength(2);
    });

    it('waits for a revision adopted on reconnect before generating the next one', async () => {
        const { source } = editor();
        const { client, sent } = fakeClient();
        let finishAdopted!: () => void;
        client.inFlight = new Promise<never>((_, reject) => {
            finishAdopted = () => reject(new Error('done'));
        });
        const { sync } = coordinator(client, source);

        sync.connected();
        await vi.advanceTimersByTimeAsync(1000);
        expect(source).not.toHaveBeenCalled();

        client.inFlight = null;
        finishAdopted();
        await settle();
        expect(sent).toHaveLength(1);
    });

    it('sends on demand, even content already applied, but one revision at a time', async () => {
        const { source } = editor();
        const { client, sent } = fakeClient('hash-1');
        const { sync } = coordinator(client, source, false);

        const first = sync.syncNow(true);
        await settle();
        await expect(sync.syncNow(true)).rejects.toMatchObject({ code: 'BUSY' });
        sent[0].resolve();
        await expect(first).resolves.toMatchObject({ applied: { revision: 1 } });
        expect(sent.map(s => s.hash)).toEqual(['hash-1']);
    });

    it('stops after dispose', async () => {
        const { source } = editor();
        const { client } = fakeClient();
        const { sync } = coordinator(client, source);

        sync.constructionChanged();
        sync.dispose();
        await vi.advanceTimersByTimeAsync(1000);
        expect(source).not.toHaveBeenCalled();
    });
});
