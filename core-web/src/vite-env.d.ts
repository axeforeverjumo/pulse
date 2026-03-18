/// <reference types="vite/client" />

declare module "heic-convert" {
  function convert(options: {
    buffer: Uint8Array<ArrayBuffer>;
    format: "JPEG" | "PNG";
    quality?: number;
  }): Promise<Uint8Array<ArrayBuffer>>;
  export default convert;
}

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
