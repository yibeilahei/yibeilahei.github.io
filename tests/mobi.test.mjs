import assert from "node:assert/strict";
import { isMobiMagic, mobiIsEncrypted } from "../src/lib/adapters/mobi.ts";

function fakeMobi(opts = {}) {
  const magic = opts.magic ?? "BOOKMOBI";
  const encryption = opts.encryption ?? 0;
  const rec0 = 86;
  const rec = new Uint8Array(20);
  rec[12] = (encryption >> 8) & 0xff;
  rec[13] = encryption & 0xff;
  const buf = new Uint8Array(rec0 + rec.length);
  for (let i = 0; i < magic.length; i++) buf[60 + i] = magic.charCodeAt(i);
  buf[77] = 1;
  buf[81] = rec0;
  buf.set(rec, rec0);
  return new File([buf], "book.bin");
}

{
  const file = fakeMobi();
  assert.equal(await isMobiMagic(file), true);
  assert.equal(await mobiIsEncrypted(file), false);
}
{
  const file = fakeMobi({ encryption: 2 });
  assert.equal(await isMobiMagic(file), true);
  assert.equal(await mobiIsEncrypted(file), true);
}
{
  const file = fakeMobi({ magic: "TEXtREAd" });
  assert.equal(await isMobiMagic(file), false);
}

console.log("mobi tests passed");
