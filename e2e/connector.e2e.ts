/**
 * Stage 4 end-to-end suite (docs/litematica-live-preview-spec.md, section 12.3): the real
 * ConnectorClient and raw protocol messages against a running game with MapartisanConnector.
 *
 * Needs an empty reserved area: run /mapartisan start in the game, then
 *   CONNECTOR_TOKEN=<token> pnpm connector:e2e
 * Every applied revision is checked block by block by the mod itself before `applied`.
 */
import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConnectorClient, type SocketLike } from '../src/connector/client';
import {
    CONNECTOR_PATH,
    DEFAULT_CONNECTOR_PORT,
    clientMessage,
    encodeSnapshotParts,
    parseServerMessage,
    snapshotBeginFields,
    type ServerMessage,
    type SessionInfo,
} from '../src/connector/protocol';
import { snapshotContentHash, type ConstructionSnapshot } from '../src/utils/export';

const TOKEN = process.env.CONNECTOR_TOKEN ?? '';
const PORT = Number(process.env.CONNECTOR_PORT ?? DEFAULT_CONNECTOR_PORT);
const URL = `ws://127.0.0.1:${PORT}${CONNECTOR_PATH}`;
const ORIGIN = 'http://localhost:5173';

type Block = [number, number, number, number];

function snapshot(blocks: Block[], palette: string[]): ConstructionSnapshot {
    const x = Int32Array.from(blocks, b => b[0]);
    const y = Int32Array.from(blocks, b => b[1]);
    const z = Int32Array.from(blocks, b => b[2]);
    const paletteIndices = Uint32Array.from(blocks, b => b[3]);
    let sx = 0, sy = 0, sz = 0;
    for (const b of blocks) {
        sx = Math.max(sx, b[0] + 1);
        sy = Math.max(sy, b[1] + 1);
        sz = Math.max(sz, b[2] + 1);
    }
    return {
        section: { x: 0, y: 0, mapsX: 1, mapsY: 1 },
        size: { x: sx, y: sy, z: sz },
        palette,
        x, y, z, paletteIndices,
        count: blocks.length,
        config: { buildMode: '3d_valley', blockSupport: 'all', supportBlockId: 'minecraft:cobblestone', minecraftVersion: '26.3' },
        contentHash: snapshotContentHash(palette, x, y, z, paletteIndices),
    };
}

/** A floor of sizeX × sizeZ at y=0 plus a pillar at its middle. */
function floorWithPillar(sizeX: number, sizeZ: number, pillar: number): ConstructionSnapshot {
    const blocks: Block[] = [];
    for (let z = 0; z < sizeZ; z++) for (let x = 0; x < sizeX; x++) blocks.push([x, 0, z, 0]);
    for (let y = 1; y <= pillar; y++) blocks.push([sizeX >> 1, y, sizeZ >> 1, 1]);
    return snapshot(blocks, ['minecraft:white_concrete', 'minecraft:oak_leaves[persistent=true]']);
}

/** The full 128 × 129 footprint plus four tall corner columns: a large volume to paste. */
function large(height: number): ConstructionSnapshot {
    const blocks: Block[] = [];
    for (let z = 0; z < 129; z++) for (let x = 0; x < 128; x++) blocks.push([x, 0, z, (x + z) % 2]);
    for (const [x, z] of [[0, 0], [127, 0], [0, 128], [127, 128]]) {
        for (let y = 1; y < height; y++) blocks.push([x, y, z, 2]);
    }
    return snapshot(blocks, ['minecraft:black_concrete', 'minecraft:white_concrete', 'minecraft:stone']);
}

function nodeSocket(origin = ORIGIN) {
    // Node's WebSocket accepts headers, so the test can send the Origin a browser would.
    return (url: string) => new WebSocket(url, { headers: { Origin: origin } } as never) as unknown as SocketLike;
}

/** Status code of a raw upgrade request: 101 when the bridge would accept it. */
function upgradeStatus(path: string, headers: Record<string, string>): Promise<number> {
    return new Promise((resolve, reject) => {
        const req = request({
            host: '127.0.0.1',
            port: PORT,
            path,
            // The global agent keeps sockets alive; reusing one the bridge closed ends in ECONNRESET.
            agent: false,
            headers: {
                Connection: 'Upgrade',
                Upgrade: 'websocket',
                'Sec-WebSocket-Version': '13',
                'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
                ...headers,
            },
        });
        req.on('upgrade', (_res, socket) => {
            socket.destroy();
            resolve(101);
        });
        req.on('response', (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
    });
}

/**
 * The mod releases a closed tab's write control on its network thread, so a connection opened
 * right after closing another one can still get BUSY for a moment.
 */
async function retryBusy<T>(open: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await open();
        } catch (error) {
            if ((error as { code?: string }).code !== 'BUSY' || attempt >= 40) throw error;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
}

function connectClient(): Promise<{ client: ConnectorClient; session: SessionInfo }> {
    return retryBusy(async () => {
        const client = new ConnectorClient(URL, TOKEN, nodeSocket());
        return { client, session: await client.connect() };
    });
}

/** Protocol-level session for messages the real client never sends (bad hashes, repeats, ...). */
class RawSession {
    private readonly socket: WebSocket;
    private readonly inbox: ServerMessage[] = [];
    private waiting: (() => void) | null = null;
    session!: SessionInfo;

    private constructor(socket: WebSocket) {
        this.socket = socket;
        socket.binaryType = 'arraybuffer';
        socket.onmessage = (event) => {
            const message = typeof event.data === 'string' ? parseServerMessage(event.data) : null;
            if (message) {
                this.inbox.push(message);
                this.waiting?.();
            }
        };
    }

    static async open(): Promise<RawSession> {
        const socket = new WebSocket(URL, { headers: { Origin: ORIGIN } } as never);
        await new Promise((resolve, reject) => {
            socket.onopen = resolve;
            socket.onerror = () => reject(new Error(`Could not connect to ${URL}`));
        });
        const raw = new RawSession(socket);
        raw.send('hello', { token: TOKEN });
        const welcome = await raw.next(['welcome', 'rejected']);
        if (welcome.type === 'rejected') {
            raw.close();
            throw Object.assign(new Error(welcome.message), { code: welcome.code });
        }
        raw.send('openSession');
        raw.session = await raw.next(['sessionReady']) as unknown as SessionInfo;
        return raw;
    }

    send(type: string, fields: Record<string, unknown> = {}) {
        this.socket.send(clientMessage(type, fields));
    }

    sendBinary(part: ArrayBuffer) {
        this.socket.send(part);
    }

    /**
     * The next message of one of the types. With a revision, messages about other revisions are
     * skipped; a rejection without a revision still counts, since it answers the transfer.
     */
    async next(types: ServerMessage['type'][], revision?: number): Promise<ServerMessage> {
        const deadline = Date.now() + 30_000;
        const matches = (m: ServerMessage) => types.includes(m.type)
            && (revision === undefined || !('revision' in m) || m.revision === undefined || m.revision === revision);
        for (;;) {
            const index = this.inbox.findIndex(matches);
            if (index >= 0) return this.inbox.splice(index, 1)[0];
            if (Date.now() > deadline) throw new Error(`No ${types.join('/')} within 30 s`);
            await new Promise<void>(resolve => {
                this.waiting = resolve;
                setTimeout(resolve, 200);
            });
        }
    }

    /** Sends a snapshot; options break it on purpose. Returns the first terminal answer. */
    async sendSnapshot(revision: number, snap: ConstructionSnapshot, options: { hash?: string; dropLastPart?: boolean } = {}) {
        const parts = encodeSnapshotParts(snap, revision, options.dropLastPart ? 1024 : undefined);
        const begin = snapshotBeginFields(this.session.sessionId, revision, snap, parts.length);
        this.send('snapshotBegin', { ...begin, contentHash: options.hash ?? begin.contentHash });
        for (const part of options.dropLastPart ? parts.slice(0, -1) : parts) this.sendBinary(part);
        this.send('snapshotEnd', { sessionId: this.session.sessionId, revision });
        // A repeated revision is confirmed with `applied` and no `accepted` before it.
        const answer = await this.next(['accepted', 'applied', 'failed', 'rejected'], revision);
        return answer.type === 'accepted' ? this.next(['applied', 'failed', 'rejected'], revision) : answer;
    }

    close() {
        this.socket.close();
    }
}

describe.skipIf(!TOKEN)('MapartisanConnector end to end', () => {
    let firstSession: SessionInfo;
    let revision = 0;

    beforeAll(async () => {
        const { client, session } = await connectClient();
        firstSession = session;
        revision = session.lastRevision;
        client.disconnect();
    });

    describe('handshake guard', () => {
        it('accepts the configured Origin on loopback', async () => {
            expect(await upgradeStatus(CONNECTOR_PATH, { Host: `127.0.0.1:${PORT}`, Origin: ORIGIN })).toBe(101);
        });

        it('refuses another Origin', async () => {
            expect(await upgradeStatus(CONNECTOR_PATH, { Host: `127.0.0.1:${PORT}`, Origin: 'https://example.com' })).toBe(403);
        });

        it('refuses a rebinding Host', async () => {
            expect(await upgradeStatus(CONNECTOR_PATH, { Host: `attacker.example:${PORT}`, Origin: ORIGIN })).toBe(403);
        });

        it('answers 404 on another path', async () => {
            expect(await upgradeStatus('/', { Host: `127.0.0.1:${PORT}`, Origin: ORIGIN })).toBe(404);
        });
    });

    describe('authentication', () => {
        it('rejects an invalid token', async () => {
            const client = new ConnectorClient(URL, 'not-the-token', nodeSocket());
            await expect(client.connect()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        });

        it('gives write control to one tab only', async () => {
            const { client: first } = await connectClient();
            try {
                const second = new ConnectorClient(URL, TOKEN, nodeSocket());
                await expect(second.connect()).rejects.toMatchObject({ code: 'BUSY' });
            } finally {
                first.disconnect();
            }
        });

        it('reports the reserved area and a clean state', () => {
            expect(firstSession.area).toMatchObject({ x: 128, z: 129 });
            expect(firstSession.area.y).toBe(firstSession.buildHeight.max - firstSession.origin.y + 1);
            expect(firstSession.pending).toBeNull();
        });
    });

    describe('revisions', () => {
        let raw: RawSession;

        beforeAll(async () => {
            raw = await retryBusy(() => RawSession.open());
        });

        afterAll(() => raw.close());

        it('rejects content that does not match its hash', async () => {
            const answer = await raw.sendSnapshot(++revision, floorWithPillar(8, 8, 2), { hash: '0123456789abcdef' });
            expect(answer).toMatchObject({ type: 'rejected', code: 'HASH_MISMATCH' });
        });

        it('rejects unknown blocks and properties', async () => {
            const unknownBlock = snapshot([[0, 0, 0, 0]], ['minecraft:not_a_block']);
            expect(await raw.sendSnapshot(++revision, unknownBlock)).toMatchObject({ code: 'INVALID_BLOCK_STATE' });
            const unknownProperty = snapshot([[0, 0, 0, 0]], ['minecraft:stone[facing=north]']);
            expect(await raw.sendSnapshot(++revision, unknownProperty)).toMatchObject({ code: 'INVALID_BLOCK_STATE' });
        });

        it('rejects duplicate positions', async () => {
            const duplicate = snapshot([[0, 0, 0, 0], [0, 0, 0, 0]], ['minecraft:stone']);
            expect(await raw.sendSnapshot(++revision, duplicate)).toMatchObject({ code: 'INVALID_STRUCTURE' });
        });

        it('rejects structures larger than the reserved area', async () => {
            const wide = snapshot([[0, 0, 0, 0], [128, 0, 0, 0]], ['minecraft:stone']);
            expect(await raw.sendSnapshot(++revision, wide)).toMatchObject({ code: 'OUT_OF_AREA' });
            const deep = snapshot([[0, 0, 0, 0], [0, 0, 129, 0]], ['minecraft:stone']);
            expect(await raw.sendSnapshot(++revision, deep)).toMatchObject({ code: 'OUT_OF_AREA' });
        });

        it('does not paste an incomplete transfer', async () => {
            const answer = await raw.sendSnapshot(++revision, floorWithPillar(16, 16, 2), { dropLastPart: true });
            expect(answer).toMatchObject({ type: 'rejected', code: 'TRANSFER_INCOMPLETE' });
        });

        it('applies a revision only after verifying the area', async () => {
            const answer = await raw.sendSnapshot(++revision, floorWithPillar(16, 17, 6));
            expect(answer).toMatchObject({ type: 'applied', revision, repeated: false, needsResync: false });
            // More when the session started with force over existing blocks: they are part of the volume.
            expect((answer as { verifiedPositions: number }).verifiedPositions).toBeGreaterThanOrEqual(16 * 7 * 17);
        });

        it('confirms a repeated revision without pasting, and refuses other content under its number', async () => {
            const applied = revision;
            expect(await raw.sendSnapshot(applied, floorWithPillar(16, 17, 6))).toMatchObject({ type: 'applied', repeated: true });
            expect(await raw.sendSnapshot(applied, floorWithPillar(16, 17, 5))).toMatchObject({ code: 'REVISION_CONFLICT' });
        });

        it('replaces with air what the next revision leaves out, and refuses older revisions', async () => {
            revision += 5;
            const answer = await raw.sendSnapshot(revision, floorWithPillar(8, 9, 2));
            // The verified volume is the union with the previous revision, so the removed blocks are checked as air.
            expect(answer).toMatchObject({ type: 'applied', revision });
            expect((answer as { verifiedPositions: number }).verifiedPositions).toBe(16 * 7 * 17);
            expect(await raw.sendSnapshot(revision - 2, floorWithPillar(4, 4, 1))).toMatchObject({ code: 'STALE_REVISION' });
        });
    });

    describe('recovery', () => {
        it('hands the outcome of a paste to the tab that reconnects', async () => {
            const raw = await retryBusy(() => RawSession.open());
            try {
                const big = large(200);
                const parts = encodeSnapshotParts(big, ++revision);
                raw.send('snapshotBegin', snapshotBeginFields(raw.session.sessionId, revision, big, parts.length));
                for (const part of parts) raw.sendBinary(part);
                raw.send('snapshotEnd', { sessionId: raw.session.sessionId, revision });
                expect(await raw.next(['accepted', 'rejected'], revision)).toMatchObject({ type: 'accepted', revision });
            } finally {
                raw.close();
            }

            const { client, session } = await connectClient();
            try {
                expect(session.lastRevision).toBe(revision);
                if (session.pending) {
                    expect(session.pending.revision).toBe(revision);
                    await expect(client.inFlight).resolves.toMatchObject({ type: 'applied', revision });
                } else {
                    // The paste finished before the new tab connected: the result is in the session state.
                    console.warn('The large paste finished before reconnecting; the in-flight handover was not exercised');
                    expect(session.lastApplied?.revision).toBe(revision);
                }
                expect(client.session?.lastApplied?.revision).toBe(revision);
            } finally {
                client.disconnect();
            }
        });

        it('reports the state on request', async () => {
            const { client } = await connectClient();
            try {
                await expect(client.queryStatus()).resolves.toMatchObject({
                    lastRevision: revision,
                    lastApplied: { revision },
                    needsResync: false,
                    pending: null,
                });

                // Leave a small structure behind, which also clears the large one.
                const final = await client.send(floorWithPillar(16, 17, 6));
                expect(final).toMatchObject({ type: 'applied', revision: revision + 1 });
            } finally {
                client.disconnect();
            }
        });
    });
});
