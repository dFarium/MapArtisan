import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { Mapart3DPreview } from '../Mapart3DPreview';
import type { Build3DGeometryProps } from '../../../../utils/geometry/build3DGeometry';

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }: { children: ReactNode }) => <>{children}</>,
    useThree: () => ({
        gl: {
            properties: {
                remove: vi.fn(),
            },
            info: {
                memory: {
                    geometries: 0,
                    textures: 0,
                },
            },
        },
    }),
}));

vi.mock('@react-three/drei', () => ({
    OrbitControls: () => null,
    PerspectiveCamera: () => null,
    Grid: () => null,
}));

describe('Mapart3DPreview memory profiling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('limits active and pending 3D geometry RPCs to 2 total', async () => {
        const pending: Array<(value: null) => void> = [];
        const build3DGeometryAsync = vi.fn((props: Build3DGeometryProps) => {
            void props;
            return new Promise<null>(resolve => pending.push(resolve));
        });

        const makeImage = (w: number, h: number, v: number) => new ImageData(
            new Uint8ClampedArray(w * h * 4).fill(v),
            w,
            h
        );

        const { rerender: rer, unmount: unm } = render(
            <Mapart3DPreview
                imageData={makeImage(1, 1, 0)}
                blockSupport="all"
                build3DGeometryAsync={build3DGeometryAsync}
            />
        );

        await waitFor(() => expect(build3DGeometryAsync).toHaveBeenCalledTimes(1));

        for (let i = 1; i <= 25; i++) {
            rer(
                <Mapart3DPreview
                    imageData={makeImage(1, 1, i)}
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

        unm();
    });

    it('only triggers 2 RPCs for 25 rapid updates (active + latest)', async () => {
        let resolveFirst: ((value: null) => void) | null = null;
        const build3DGeometryAsync = vi.fn((props: Build3DGeometryProps) => {
            void props;
            if (!resolveFirst) {
                return new Promise<null>(resolve => { resolveFirst = resolve; });
            }
            return Promise.resolve(null);
        });

        const makeImage = (v: number) => new ImageData(
            new Uint8ClampedArray([v, v, v, 255]),
            1,
            1
        );

        const { rerender: rer } = render(
            <Mapart3DPreview
                imageData={makeImage(0)}
                blockSupport="all"
                build3DGeometryAsync={build3DGeometryAsync}
            />
        );

        await waitFor(() => expect(build3DGeometryAsync).toHaveBeenCalledTimes(1));

        for (let v = 1; v <= 25; v++) {
            rer(
                <Mapart3DPreview
                    imageData={makeImage(v)}
                    blockSupport="all"
                    build3DGeometryAsync={build3DGeometryAsync}
                />
            );
        }

        expect(build3DGeometryAsync).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolveFirst!(null);
            await Promise.resolve();
        });

        await waitFor(() => expect(build3DGeometryAsync).toHaveBeenCalledTimes(2));

        const lastCall = build3DGeometryAsync.mock.calls[1][0];
        expect(lastCall.imageData.data[0]).toBe(25);
    });
});
