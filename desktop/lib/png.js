// Tiny PNG painter for the tray and app icons (no image files needed).
const zlib = require('node:zlib');

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

// paint(x, y) → [r, g, b, a] for pixel centres in 0..1 space.
const encode = (size, paint) => {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4× supersampling for smooth edges.
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const p = paint((x + dx) / size, (y + dy) / size);
        r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? r / a : 0; raw[o + 1] = a ? g / a : 0; raw[o + 2] = a ? b / a : 0; raw[o + 3] = a / 4;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Four-point sparkle (the MaowCore ✦) inside a coloured circle.
const sparkle = (x, y) => {
  const dx = Math.abs(x - 0.5); const dy = Math.abs(y - 0.5);
  return Math.pow(dx, 0.55) + Math.pow(dy, 0.55) < Math.pow(0.27, 0.55);
};

const appIcon = (size = 256, color = '#5865F2') => encode(size, (x, y) => {
  const d = Math.hypot(x - 0.5, y - 0.5);
  if (d > 0.48) return [0, 0, 0, 0];
  if (sparkle(x, y)) return [255, 255, 255, 255];
  return [...hex(color), 255];
});

// Tray: the app icon with a status dot in the corner.
const trayIcon = (state, size = 32) => {
  const dot = { online: '#22c55e', starting: '#eab308', restarting: '#f97316', stopping: '#eab308', external: '#3b82f6' }[state] || '#ef4444';
  return encode(size, (x, y) => {
    const dd = Math.hypot(x - 0.78, y - 0.78);
    if (dd < 0.2) return dd < 0.15 ? [...hex(dot), 255] : [20, 20, 24, 255];
    const d = Math.hypot(x - 0.45, y - 0.45);
    if (d > 0.42) return [0, 0, 0, 0];
    const sx = (x - 0.45) / 0.84 + 0.5; const sy = (y - 0.45) / 0.84 + 0.5;
    if (sparkle(sx, sy)) return [255, 255, 255, 255];
    return [88, 101, 242, 255];
  });
};

module.exports = { encode, appIcon, trayIcon };
