let nextVersion = 1;

/**
 * Per-pixel buffers of one processing result, handed to components as a
 * single prop. The arrays live in private fields because React's development
 * build diffs changed props for the Performance panel and walks typed arrays
 * element by element: on a 10x10 grid that froze the page for seconds after
 * every result. The diff only sees `version`.
 */
export class PixelBuffers {
    readonly version = nextVersion++;
    readonly #packedResults: Uint32Array;
    readonly #heightPath: Int32Array | null;

    constructor(packedResults: Uint32Array, heightPath: Int32Array | null) {
        this.#packedResults = packedResults;
        this.#heightPath = heightPath;
    }

    get packedResults(): Uint32Array {
        return this.#packedResults;
    }

    /** Column-major height path, only present in 3D Valley mode. */
    get heightPath(): Int32Array | null {
        return this.#heightPath;
    }
}
