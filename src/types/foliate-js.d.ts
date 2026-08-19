declare module "foliate-js/view.js" {
  /** Returns the shared Book shape (sections + HTML load + metadata + toc). */
  export function makeBook(file: File | Blob | string): Promise<unknown>;
}

declare module "foliate-js/mobi.js" {
  export function isMOBI(file: File | Blob): Promise<boolean>;
  export class MOBI {
    constructor(opts: { unzlib: (data: Uint8Array) => Uint8Array });
    open(file: File | Blob): Promise<unknown>;
  }
}

declare module "foliate-js/vendor/fflate.js" {
  export function unzlibSync(data: Uint8Array, opts?: { out?: Uint8Array }): Uint8Array;
}
