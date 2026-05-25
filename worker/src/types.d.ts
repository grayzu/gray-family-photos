declare module "libheif-js/wasm-bundle" {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      cb: (data: unknown) => void,
    ): void;
  }
  interface HeifDecoder {
    decode(buffer: Uint8Array): HeifImage[];
  }
  const libheif: {
    HeifDecoder: new () => HeifDecoder;
  };
  export default libheif;
}

declare global {
  interface CacheStorage {
    readonly default: Cache;
  }
}

export {};
