# Processing contract v1

`src/engine` defines the browser-independent boundary between the UI/worker transport and the image-processing implementation. `TypeScriptEngine` is the reference implementation; a future Rust/WASM engine must implement the same contract and pass the golden fixtures before replacing it.

## Ownership and lifecycle

- `sourceVersion` identifies the current source image. A new image must use a new version.
- The first `process` request for a `(sourceVersion, config)` pair includes the RGBA source buffer. The engine copies it and owns the working buffers after that call.
- Subsequent requests may omit the source only when the pair is still cached. `applyEdits` always uses the cached base result and never re-runs quantization.
- Every response returns fresh `ArrayBuffer` copies. A transport may transfer them to a worker or WASM adapter without exposing internal cache memory.
- `clear()` releases the cached base result. The UI/transport owns request ordering and latest-wins cancellation; the engine remains deterministic for each request it accepts.

## Versioning and errors

All requests and responses carry `protocolVersion`. Unsupported versions fail with `ProcessingEngineError` (`INVALID_PROTOCOL`). Dimensions, source byte length, missing source, and cache mismatches have separate error codes so an adapter can map them to transport errors without parsing messages.

The cache key includes `sourceVersion` and every processing parameter, including palette ordering, dithering, OKLab, hybrid strength, and independent-map segmentation. Changing any of these requires a new base computation.

## Buffer layout

`rgba` is tightly packed RGBA8 (`width * height * 4` bytes). `packedResults` is a `Uint32Array`; `toneMap` is an optional `Int8Array`; `heightPath` and `stats.heightMap` are optional/required `Int32Array` buffers respectively. Consumers must interpret them using the declared dimensions and little-endian typed-array representation.

This boundary is intentionally independent of React and the browser. The same request/response structures can be transported through Comlink today or a binary worker/WASM adapter later, while React continues to receive only completed responses.
