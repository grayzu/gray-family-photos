declare module "heic-convert" {
  export interface ConvertOptions {
    buffer: Buffer | Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  }
  function convert(opts: ConvertOptions): Promise<Uint8Array>;
  export default convert;
}
