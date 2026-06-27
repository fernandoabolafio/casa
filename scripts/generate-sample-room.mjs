// Generates public/sample-room.png — a clean flat-illustration living room with
// distinct, selectable objects (sofa, rug, lamp, plant, artwork, window) used by
// the "Try a sample room" button so anyone can try the editor without a photo.
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const W = 1536;
const H = 1024;
const buf = new Uint8ClampedArray(W * H * 4);

function px(x, y, [r, g, b], a = 255) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  const ia = a / 255;
  buf[i] = buf[i] * (1 - ia) + r * ia;
  buf[i + 1] = buf[i + 1] * (1 - ia) + g * ia;
  buf[i + 2] = buf[i + 2] * (1 - ia) + b * ia;
  buf[i + 3] = 255;
}
function rect(x0, y0, x1, y1, rgb, a = 255) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(x, y, rgb, a);
}
function vGradient(x0, y0, x1, y1, top, bot) {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / (y1 - y0);
    const c = [0, 1, 2].map((k) => Math.round(top[k] + (bot[k] - top[k]) * t));
    for (let x = x0; x < x1; x++) px(x, y, c);
  }
}
function roundRect(x0, y0, x1, y1, r, rgb) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = Math.max(x0 + r - x, 0, x - (x1 - r - 1));
      const dy = Math.max(y0 + r - y, 0, y - (y1 - r - 1));
      if (dx * dx + dy * dy <= r * r) px(x, y, rgb);
    }
  }
}
function ellipse(cx, cy, rx, ry, rgb, a = 255) {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) px(x, y, rgb, a);
    }
  }
}

// Wall + floor
vGradient(0, 0, W, 690, [233, 227, 218], [214, 205, 193]);
vGradient(0, 690, W, H, [183, 150, 116], [160, 128, 96]);
rect(0, 686, W, 694, [120, 95, 70]); // baseboard line

// Window (left), with frame + sky
rect(150, 150, 520, 470, [70, 60, 50]);
vGradient(166, 166, 504, 454, [171, 206, 232], [206, 226, 240]);
rect(330, 166, 340, 454, [70, 60, 50]); // mullion
rect(166, 305, 504, 315, [70, 60, 50]);

// Framed artwork (right)
rect(1060, 180, 1320, 430, [86, 70, 54]);
vGradient(1078, 198, 1302, 412, [196, 158, 140], [150, 120, 150]);

// Rug (ellipse on floor)
ellipse(760, 880, 540, 150, [150, 120, 92]);
ellipse(760, 880, 470, 120, [176, 146, 116]);

// Sofa (center) with cushions
roundRect(470, 560, 1080, 800, 36, [60, 92, 98]); // body
roundRect(470, 520, 1080, 610, 28, [72, 106, 112]); // backrest
roundRect(470, 560, 540, 790, 24, [52, 82, 88]); // left arm
roundRect(1010, 560, 1080, 790, 24, [52, 82, 88]); // right arm
roundRect(560, 545, 745, 625, 18, [84, 120, 126]); // back cushion 1
roundRect(805, 545, 990, 625, 18, [84, 120, 126]); // back cushion 2
roundRect(560, 650, 770, 740, 20, [96, 132, 138]); // seat cushion 1
roundRect(790, 650, 1000, 740, 20, [96, 132, 138]); // seat cushion 2

// Floor lamp (right)
rect(1290, 470, 1302, 800, [54, 46, 40]); // pole
roundRect(1250, 410, 1342, 480, 14, [224, 198, 150]); // shade
ellipse(1296, 800, 70, 18, [54, 46, 40]); // base

// Potted plant (left)
rect(250, 740, 340, 850, [150, 96, 70]); // pot
ellipse(295, 690, 70, 80, [70, 120, 78]); // foliage
ellipse(250, 710, 48, 58, [84, 138, 92]);
ellipse(345, 712, 46, 56, [60, 104, 68]);

// Coffee table (in front of sofa)
roundRect(640, 815, 900, 870, 12, [92, 66, 46]);

function encodePng(width, height, rgba) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc = (b) => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (ty, d) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(d.length, 0);
    const b = Buffer.concat([Buffer.from(ty), d]);
    const cr = Buffer.alloc(4);
    cr.writeUInt32BE(crc(b), 0);
    return Buffer.concat([l, b, cr]);
  };
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(width, 0);
  ih.writeUInt32BE(height, 4);
  ih[8] = 8;
  ih[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer).copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ih), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const out = path.join(process.cwd(), "public", "sample-room.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, encodePng(W, H, buf));
console.log(`wrote ${out}`);
