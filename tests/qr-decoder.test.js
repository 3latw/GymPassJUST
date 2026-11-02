import test from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import jsQR from "jsqr";
test("the browser fallback decoder reads the same QR encoding used for signed student passes", () => {
  const token =
    "eyJraW5kIjoibWVtYmVyc2hpcCIsInN1YiI6Im1lbWJlci0xIn0.signed-test-payload-for-roundtrip";
  const code = QRCode.create(token),
    scale = 6,
    margin = 4,
    size = (code.modules.size + margin * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < code.modules.size; y++)
    for (let x = 0; x < code.modules.size; x++)
      if (code.modules.get(y, x))
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const p =
              (((y + margin) * scale + dy) * size + (x + margin) * scale + dx) *
              4;
            pixels[p] = pixels[p + 1] = pixels[p + 2] = 0;
          }
  assert.equal(
    jsQR(pixels, size, size, { inversionAttempts: "dontInvert" }).data,
    token,
  );
  assert.equal(
    jsQR(new Uint8ClampedArray(32 * 32 * 4).fill(255), 32, 32),
    null,
  );
});
