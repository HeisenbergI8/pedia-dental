/** Image headers for the pixel-size check (D #30): just enough bytes for each format to state its size. */

/** A PNG's signature and IHDR chunk: all the size check reads. */
export function pngOf(width: number, height: number): Buffer<ArrayBuffer> {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "latin1");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  return Buffer.from(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr]));
}

/** A JPEG with an APP0 segment, a fill byte and a frame header (`sof`: 0xc0 baseline, 0xc2 progressive). */
export function jpegOf(width: number, height: number, sof = 0xc0, appBytes = 14): Buffer<ArrayBuffer> {
  const app = Buffer.alloc(4 + appBytes);
  app.writeUInt16BE(0xffe0, 0);
  app.writeUInt16BE(2 + appBytes, 2);
  const frame = Buffer.from([0xff, sof, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03]);
  frame.writeUInt16BE(height, 5);
  frame.writeUInt16BE(width, 7);
  return Buffer.from(Buffer.concat([Buffer.from([0xff, 0xd8]), app, Buffer.from([0xff]), frame, Buffer.alloc(16)]));
}

const riff = (chunk: string, payload: Buffer): Buffer<ArrayBuffer> => {
  const head = Buffer.alloc(20);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(4 + 8 + payload.length, 4);
  head.write("WEBP", 8, "latin1");
  head.write(chunk, 12, "latin1");
  head.writeUInt32LE(payload.length, 16);
  return Buffer.from(Buffer.concat([head, payload]));
};
/** Lossy WebP: a frame tag, the start code, then 14-bit width and height. */
export function webpVp8Of(width: number, height: number): Buffer<ArrayBuffer> {
  const p = Buffer.alloc(14);
  p.set([0x9d, 0x01, 0x2a], 3);
  p.writeUInt16LE(width, 6);
  p.writeUInt16LE(height, 8);
  return riff("VP8 ", p);
}
/** Lossless WebP: the 0x2f signature, then width-1 and height-1 in 14 bits each. */
export function webpVp8lOf(width: number, height: number): Buffer<ArrayBuffer> {
  const p = Buffer.alloc(10);
  p[0] = 0x2f;
  p.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), 1);
  return riff("VP8L", p);
}
/** Extended WebP: flags, then width-1 and height-1 in 24 bits each. */
export function webpVp8xOf(width: number, height: number): Buffer<ArrayBuffer> {
  const p = Buffer.alloc(10);
  p.writeUIntLE(width - 1, 4, 3);
  p.writeUIntLE(height - 1, 7, 3);
  return riff("VP8X", p);
}
