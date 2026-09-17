/* tslint:disable */
/* eslint-disable */

export class WasmProcessingResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    height_map(): Int32Array;
    height_path(): Int32Array | undefined;
    packed_results(): Uint32Array;
    rgba(): Uint8Array;
    tone_map(): Int8Array | undefined;
    readonly height: number;
    readonly max_height: number;
    readonly min_height: number;
    readonly protocol_version: number;
    readonly request_id: bigint;
    readonly source_version: bigint;
    readonly width: number;
}

export function initThreadPool(num_threads: number): Promise<any>;

export function process_v1(source: Uint8Array, config: any, palette: any, edits: any): WasmProcessingResult;

export class wbg_rayon_PoolBuilder {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    build(): void;
    numThreads(): number;
    receiver(): number;
}

export function wbg_rayon_start_worker(receiver: number): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly __wbg_wasmprocessingresult_free: (a: number, b: number) => void;
    readonly process_v1: (a: number, b: number, c: any, d: any, e: any) => [number, number, number];
    readonly wasmprocessingresult_height: (a: number) => number;
    readonly wasmprocessingresult_height_map: (a: number) => any;
    readonly wasmprocessingresult_height_path: (a: number) => any;
    readonly wasmprocessingresult_max_height: (a: number) => number;
    readonly wasmprocessingresult_min_height: (a: number) => number;
    readonly wasmprocessingresult_packed_results: (a: number) => any;
    readonly wasmprocessingresult_protocol_version: (a: number) => number;
    readonly wasmprocessingresult_request_id: (a: number) => bigint;
    readonly wasmprocessingresult_rgba: (a: number) => any;
    readonly wasmprocessingresult_source_version: (a: number) => bigint;
    readonly wasmprocessingresult_tone_map: (a: number) => any;
    readonly wasmprocessingresult_width: (a: number) => number;
    readonly __wbg_wbg_rayon_poolbuilder_free: (a: number, b: number) => void;
    readonly initThreadPool: (a: number) => any;
    readonly wbg_rayon_poolbuilder_build: (a: number) => void;
    readonly wbg_rayon_poolbuilder_numThreads: (a: number) => number;
    readonly wbg_rayon_poolbuilder_receiver: (a: number) => number;
    readonly wbg_rayon_start_worker: (a: number) => void;
    readonly memory: WebAssembly.Memory;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_thread_destroy: (a?: number, b?: number, c?: number) => void;
    readonly __wbindgen_start: (a: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number }} module - Passing `SyncInitInput` directly is deprecated.
 * @param {WebAssembly.Memory} memory - Deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number } | SyncInitInput, memory?: WebAssembly.Memory): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number }} module_or_path - Passing `InitInput` directly is deprecated.
 * @param {WebAssembly.Memory} memory - Deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number } | InitInput | Promise<InitInput>, memory?: WebAssembly.Memory): Promise<InitOutput>;
