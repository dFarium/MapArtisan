import { describe, expect, it } from 'vitest';
import { ConnectorClient, ConnectorError, type SocketLike } from '../client';
import { testSnapshot } from './fixtures';

class FakeSocket implements SocketLike {
    binaryType: BinaryType = 'blob';
    readyState = 0;
    sent: (string | ArrayBuffer)[] = [];
    closed = false;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    send(data: string | ArrayBuffer) {
        this.sent.push(data);
    }

    close() {
        this.closed = true;
        this.readyState = 3;
    }

    open() {
        this.readyState = 1;
        this.onopen?.(new Event('open'));
    }

    receive(message: Record<string, unknown>) {
        this.onmessage?.({ data: JSON.stringify({ protocolVersion: 1, ...message }) } as MessageEvent);
    }

    drop(reason = '') {
        this.readyState = 3;
        this.onclose?.({ reason } as CloseEvent);
    }

    /** Text messages sent so far, parsed. */
    messages(): Record<string, unknown>[] {
        return this.sent.filter((m): m is string => typeof m === 'string').map(m => JSON.parse(m));
    }
}

const SESSION = {
    sessionId: 'session-1',
    world: 'Test World',
    dimension: 'minecraft:overworld',
    origin: { x: 10, y: -60, z: 20 },
    buildHeight: { min: -64, max: 319 },
    lastRevision: 4,
    lastApplied: { revision: 4, contentHash: 'aaaaaaaaaaaaaaaa' },
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

async function connected() {
    const socket = new FakeSocket();
    const client = new ConnectorClient('ws://127.0.0.1:25590/mapartisan/v1', 'secret', () => socket);
    const connecting = client.connect();
    socket.open();
    await flush();
    socket.receive({ type: 'welcome', mod: '1.0', minecraft: '26.3', litematica: '0.29.1', limits: {} });
    await flush();
    socket.receive({ type: 'sessionReady', ...SESSION });
    await connecting;
    return { socket, client };
}

describe('ConnectorClient', () => {
    it('authenticates with the token in hello and opens the session', async () => {
        const { socket, client } = await connected();

        expect(socket.binaryType).toBe('arraybuffer');
        expect(socket.messages()).toEqual([
            { protocolVersion: 1, type: 'hello', token: 'secret', client: { name: 'MapArtisan' } },
            { protocolVersion: 1, type: 'openSession' },
        ]);
        expect(client.session).toEqual(SESSION);
        expect(client.connected).toBe(true);
    });

    it('fails to connect when the mod rejects the token', async () => {
        const socket = new FakeSocket();
        const client = new ConnectorClient('ws://x', 'wrong', () => socket);
        const connecting = client.connect();
        socket.open();
        await flush();
        socket.receive({ type: 'rejected', code: 'UNAUTHORIZED', message: 'invalid token' });

        await expect(connecting).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        expect(socket.closed).toBe(true);
        expect(client.connected).toBe(false);
    });

    it('fails to connect when nothing listens', async () => {
        const socket = new FakeSocket();
        const client = new ConnectorClient('ws://x', 'secret', () => socket);
        const connecting = client.connect();
        socket.onerror?.(new Event('error'));
        socket.drop();

        await expect(connecting).rejects.toMatchObject({ code: 'CONNECTION_FAILED' });
    });

    it('sends begin, parts and end, continuing after the last revision of the session', async () => {
        const { socket, client } = await connected();
        const snapshot = testSnapshot([[0, 0, 0, 0], [1, 1, 1, 0]]);
        const progress: unknown[] = [];
        const sending = client.send(snapshot, p => progress.push(p));

        const sent = socket.sent.slice(2);
        expect(sent).toHaveLength(3);
        expect(JSON.parse(sent[0] as string)).toMatchObject({ type: 'snapshotBegin', sessionId: 'session-1', revision: 5, parts: 1, count: 2 });
        expect(sent[1]).toBeInstanceOf(ArrayBuffer);
        expect(JSON.parse(sent[2] as string)).toEqual({ protocolVersion: 1, type: 'snapshotEnd', sessionId: 'session-1', revision: 5 });

        socket.receive({ type: 'accepted', sessionId: 'session-1', revision: 5 });
        socket.receive({ type: 'progress', sessionId: 'session-1', revision: 5, phase: 'pasting', pendingChunks: 3, totalChunks: 4 });
        socket.receive({ type: 'applied', sessionId: 'session-1', revision: 4, contentHash: 'x', repeated: false });
        expect(client.busyRevision).toBe(5);
        socket.receive({ type: 'applied', sessionId: 'session-1', revision: 5, contentHash: snapshot.contentHash, repeated: false });

        await expect(sending).resolves.toMatchObject({ revision: 5, repeated: false });
        expect(progress).toHaveLength(1);
        expect(client.session?.lastApplied).toEqual({ revision: 5, contentHash: snapshot.contentHash });
        expect(client.busyRevision).toBeNull();
    });

    it('allows one revision in flight', async () => {
        const { client } = await connected();
        void client.send(testSnapshot([[0, 0, 0, 0]]));

        await expect(client.send(testSnapshot([[0, 0, 0, 0]]))).rejects.toMatchObject({ code: 'BUSY' });
    });

    it('rejects on rejected and failed, keeping partial and samples', async () => {
        const { socket, client } = await connected();
        const first = client.send(testSnapshot([[0, 0, 0, 0]]));
        socket.receive({ type: 'rejected', revision: 5, code: 'INVALID_BLOCK_STATE', message: 'bad' });
        await expect(first).rejects.toMatchObject({ code: 'INVALID_BLOCK_STATE', partial: false });

        const second = client.send(testSnapshot([[0, 0, 0, 0]]));
        socket.receive({ type: 'accepted', sessionId: 'session-1', revision: 6 });
        socket.receive({
            type: 'failed', sessionId: 'session-1', revision: 6, code: 'VERIFY_MISMATCH', message: 'diff', partial: true, samples: ['0,0,0'],
        });
        const error = await second.catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ConnectorError);
        expect(error).toMatchObject({ code: 'VERIFY_MISMATCH', partial: true, samples: ['0,0,0'] });
    });

    it('treats a rejection without a revision as the answer to the transfer in flight', async () => {
        const { socket, client } = await connected();
        const sending = client.send(testSnapshot([[0, 0, 0, 0]]));
        socket.receive({ type: 'rejected', code: 'BAD_MESSAGE', message: 'malformed part' });

        await expect(sending).rejects.toMatchObject({ code: 'BAD_MESSAGE' });
    });

    it('never reports success when the connection drops, and flags a possible partial paste once accepted', async () => {
        const { socket, client } = await connected();
        const before = client.send(testSnapshot([[0, 0, 0, 0]]));
        socket.drop('game closed');
        await expect(before).rejects.toMatchObject({ code: 'CONNECTION_CLOSED', partial: false });

        const again = await connected();
        const after = again.client.send(testSnapshot([[0, 0, 0, 0]]));
        again.socket.receive({ type: 'accepted', sessionId: 'session-1', revision: 5 });
        again.socket.drop();
        await expect(after).rejects.toMatchObject({ code: 'CONNECTION_CLOSED', partial: true });
        expect(again.client.connected).toBe(false);
    });

    it('closes the session on disconnect', async () => {
        const { socket, client } = await connected();
        client.disconnect();

        expect(socket.messages().at(-1)).toEqual({ protocolVersion: 1, type: 'closeSession' });
        expect(socket.closed).toBe(true);
        await expect(client.send(testSnapshot([[0, 0, 0, 0]]))).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
    });
});
