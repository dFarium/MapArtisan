import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConnectorPanel from '../ConnectorPanel';
import { ConnectorSlot } from '../../components/builder/control-panel/ConnectorSlot';
import { publishConnectorView, type ConnectorActions, type ConnectorView } from '../connectorView';

const VIEW: ConnectorView = {
    connection: 'connected',
    closeReason: null,
    world: 'Test World',
    dimension: 'minecraft:overworld',
    origin: { x: -832, y: -51, z: -449 },
    status: 'synced',
    autoSync: true,
    sendingPaused: false,
    needsResync: false,
    gamePaused: false,
    appliedRevision: 17,
    activeRevision: null,
    phase: null,
    pendingChunks: null,
    totalChunks: null,
    message: null,
    lastTimings: { receiveMs: 2, validateMs: 3, waitMs: 60, pasteMs: 400, verifyMs: 90, totalMs: 560, generateMs: 80 },
};

function fakeActions(): ConnectorActions {
    return {
        reconnect: vi.fn(async () => undefined),
        disconnect: vi.fn(),
        setAutoSync: vi.fn(),
        setSendingPaused: vi.fn(),
        resync: vi.fn(async () => undefined),
    };
}

describe('ConnectorPanel', () => {
    it('shows the world, the applied revision and the sync state', () => {
        render(<ConnectorPanel view={VIEW} actions={fakeActions()} />);

        expect(screen.getByText('Synced')).toBeDefined();
        expect(screen.getByText('Test World')).toBeDefined();
        expect(screen.getByText(/origin -832 -51 -449/)).toBeDefined();
        expect(screen.getByText(/Revision 17 in the world · last paste 560 ms/)).toBeDefined();
    });

    it('toggles automatic sync, pauses sending and resyncs', () => {
        const actions = fakeActions();
        render(<ConnectorPanel view={VIEW} actions={actions} />);

        fireEvent.click(screen.getByRole('switch', { name: /automatic sync/i }));
        expect(actions.setAutoSync).toHaveBeenCalledWith(false);
        fireEvent.click(screen.getByRole('switch', { name: /pause sending/i }));
        expect(actions.setSendingPaused).toHaveBeenCalledWith(true);
        fireEvent.click(screen.getByRole('button', { name: 'Resync' }));
        expect(actions.resync).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
        expect(actions.disconnect).toHaveBeenCalled();
    });

    it('shows paste progress, a paused game and a pending resync', () => {
        render(<ConnectorPanel view={{
            ...VIEW, status: 'syncing', activeRevision: 18, phase: 'pasting', pendingChunks: 30, totalChunks: 72, needsResync: true,
        }} actions={fakeActions()} />);
        expect(screen.getByText('Revision 18: 42/72 chunks pasted')).toBeDefined();
        expect(screen.getByText(/partly pasted/)).toBeDefined();

        render(<ConnectorPanel view={{ ...VIEW, status: 'syncing', activeRevision: 18, phase: 'paused', gamePaused: true }}
            actions={fakeActions()} />);
        expect(screen.getByText('Game paused')).toBeDefined();
        expect(screen.getByText(/waiting for the game to resume/)).toBeDefined();
    });

    it('explains a File Layout that cannot sync', () => {
        render(<ConnectorPanel view={{ ...VIEW, status: 'blocked', message: 'Use Multiple Files in Construction Model for maps larger than 1×1' }}
            actions={fakeActions()} />);
        expect(screen.getByText('Unavailable')).toBeDefined();
        expect(screen.getByText(/Use Multiple Files/)).toBeDefined();
    });

    it('offers to reconnect after the connection is lost', () => {
        const actions = fakeActions();
        render(<ConnectorPanel view={{ ...VIEW, connection: 'disconnected', closeReason: 'world closed' }} actions={actions} />);

        expect(screen.getByText('Disconnected')).toBeDefined();
        expect(screen.getByText('world closed')).toBeDefined();
        expect(screen.queryByRole('switch')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
        expect(actions.reconnect).toHaveBeenCalled();
    });
});

describe('ConnectorSlot', () => {
    afterEach(() => act(() => publishConnectorView(null)));

    it('renders nothing without a connection and loads the controls once there is one', async () => {
        const { container } = render(<ConnectorSlot />);
        expect(container.innerHTML).toBe('');

        act(() => publishConnectorView(VIEW, fakeActions()));
        expect(await screen.findByTestId('connector-panel')).toBeDefined();

        act(() => publishConnectorView(null));
        expect(screen.queryByTestId('connector-panel')).toBeNull();
    });
});
