import type { ReactNode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Mapart3DPreview } from '../Mapart3DPreview';
import { loadTextureAtlas } from '../textureAtlas';
import type { Build3DGeometryProps } from '../../../../utils/geometry/build3DGeometry';

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@react-three/drei', () => ({
    OrbitControls: () => null,
    PerspectiveCamera: () => null,
    Grid: () => null,
}));

describe('Mapart3DPreview memory backpressure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('keeps one geometry RPC active and retains only the latest pending input', async () => {
        const pending: Array<(value: null) => void> = [];
        const build3DGeometryAsync = vi.fn((props: Build3DGeometryProps) => {
            void props;
            return new Promise<null>(resolve => pending.push(resolve));
        });

        const makeImage = (value: number) => new ImageData(
            new Uint8ClampedArray([value, value, value, 255]),
            1,
            1
        );

        const { rerender, unmount } = render(
            <Mapart3DPreview
                imageData={makeImage(0)}
                blockSupport="all"
                build3DGeometryAsync={build3DGeometryAsync}
            />
        );

        await waitFor(() => expect(build3DGeometryAsync).toHaveBeenCalledTimes(1));

        for (let value = 1; value <= 25; value++) {
            rerender(
                <Mapart3DPreview
                    imageData={makeImage(value)}
                    blockSupport="all"
                    build3DGeometryAsync={build3DGeometryAsync}
                />
            );
        }

        expect(build3DGeometryAsync).toHaveBeenCalledTimes(1);

        await act(async () => {
            pending[0](null);
            await Promise.resolve();
        });

        await waitFor(() => expect(build3DGeometryAsync).toHaveBeenCalledTimes(2));
        const latestProps = build3DGeometryAsync.mock.calls[1][0];
        expect(latestProps.imageData.data[0]).toBe(25);

        unmount();
        await act(async () => pending[1](null));
    });

    it('disposes an atlas that finishes after its consumer was cancelled', async () => {
        class MockImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(_value: string) {
                queueMicrotask(() => this.onload?.());
            }
        }
        vi.stubGlobal('Image', MockImage);

        const context = {
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(16 * 16 * 4) })),
        };
        const originalCreateElement = document.createElement.bind(document);
        const elementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
            if (tagName === 'canvas') {
                return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
            }
            return originalCreateElement(tagName);
        }) as typeof document.createElement);
        const disposeSpy = vi.spyOn(THREE.Texture.prototype, 'dispose');
        const onReady = vi.fn();

        const cancel = loadTextureAtlas(['minecraft:memory_test_texture'], onReady);
        cancel();

        await waitFor(() => expect(disposeSpy).toHaveBeenCalledTimes(1));
        expect(onReady).not.toHaveBeenCalled();

        disposeSpy.mockRestore();
        elementSpy.mockRestore();
        vi.unstubAllGlobals();
    });
});
