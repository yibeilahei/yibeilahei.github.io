declare module "foliate-js/view.js" {
  /** Returns the shared Book shape (sections + HTML load + metadata + toc). */
  export function makeBook(file: File | Blob | string): Promise<unknown>;
}
