// The World in One Page — 24 November 2026.
// A program that draws a one-page newspaper front page summing up the
// world's news of Tuesday 24 November 2026, and writes it to entry.png.
// Node 22, standard library only, no network, fully deterministic:
// the same bytes come out of every run.
//
// Layout: masthead + dateline, lead story (COP31 ends without a deal)
// with a drawn globe panel, two stories (Indonesia factory fire;
// Huang returns as Nvidia chief), three stories (Sparta II ship fire;
// India–Nepal reset; Alcaraz wins the ATP Finals), and a bottom ticker
// with the day's other news.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// PNG encoding (stdlib only)
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (1 + width * 4) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Canvas: a 1024x1024 RGBA buffer with simple drawing primitives
// ---------------------------------------------------------------------------

const W = 1024;
const H = 1024;
const PAPER: [number, number, number] = [246, 241, 226];
const INK: [number, number, number] = [24, 22, 19];
const RED: [number, number, number] = [168, 30, 23];
const BLUE: [number, number, number] = [31, 78, 121];
const SKY: [number, number, number] = [205, 227, 238];
const GREEN: [number, number, number] = [74, 120, 66];
const GREY: [number, number, number] = [107, 101, 90];
const BLACK: [number, number, number] = [18, 16, 14];
const WHITE: [number, number, number] = [250, 248, 242];
const ORANGE: [number, number, number] = [214, 106, 24];
const GOLD: [number, number, number] = [196, 148, 44];
const SAFFRON: [number, number, number] = [255, 153, 51];

type RGB = [number, number, number];

const pixels = new Uint8Array(W * H * 4);

function setPixel(x: number, y: number, c: RGB): void {
  // Round: callers pass fractional centres (globe continents), and a
  // fractional row would shift the byte offset by hundreds of pixels.
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  pixels[i] = c[0];
  pixels[i + 1] = c[1];
  pixels[i + 2] = c[2];
  pixels[i + 3] = 255;
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPixel(xx, yy, c);
  }
}

function rectOutline(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function hline(x0: number, x1: number, y: number, c: RGB, t = 1): void {
  fillRect(x0, y, x1 - x0, t, c);
}

function vline(x: number, y0: number, y1: number, c: RGB, t = 1): void {
  fillRect(x, y0, t, y1 - y0, c);
}

// Bresenham line, with optional thickness.
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  const half = Math.floor(t / 2);
  for (;;) {
    for (let oy = -half; oy <= half; oy++) {
      for (let ox = -half; ox <= half; ox++) setPixel(x + ox, y + oy, c);
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function polyline(points: [number, number][], c: RGB, t = 1): void {
  for (let i = 0; i + 1 < points.length; i++) {
    line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], c, t);
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) setPixel(cx + x, cy + y, c);
  }
}

function circleOutline(cx: number, cy: number, r: number, c: RGB, t = 2): void {
  for (let a = 0; a < 720; a++) {
    const rad = (a * Math.PI) / 360;
    const x = Math.round(cx + r * Math.cos(rad));
    const y = Math.round(cy + r * Math.sin(rad));
    for (let oy = -Math.floor(t / 2); oy <= Math.floor(t / 2); oy++) {
      for (let ox = -Math.floor(t / 2); ox <= Math.floor(t / 2); ox++) {
        setPixel(x + ox, y + oy, c);
      }
    }
  }
}

// Filled ellipse centred on (cx, cy) with radii rx, ry.
function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = -ry; y <= ry; y++) {
    const k = 1 - (y * y) / (ry * ry);
    if (k < 0) continue;
    const half = Math.floor(rx * Math.sqrt(k));
    for (let x = -half; x <= half; x++) setPixel(cx + x, cy + y, c);
  }
}

// Filled triangle.
function fillTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGB): void {
  const minX = Math.min(ax, bx, cx);
  const maxX = Math.max(ax, bx, cx);
  const minY = Math.min(ay, by, cy);
  const maxY = Math.max(ay, by, cy);
  const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((bx - x) * (cy - y) - (by - y) * (cx - x)) / d;
      const w1 = ((cx - x) * (ay - y) - (cy - y) * (ax - x)) / d;
      const w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) setPixel(x, y, c);
    }
  }
}

// ---------------------------------------------------------------------------
// Bitmap font: 5x7 glyphs, each row a 5-character "0"/"1" string.
// ---------------------------------------------------------------------------

const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "11110", "10001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01110", "10000", "10000", "10001", "01110"],
  d: ["00001", "00001", "01111", "10001", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11110", "01000", "01000", "01000"],
  g: ["00000", "01111", "10001", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "11110", "10001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "00010", "11100"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "11110", "10001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["00000", "00000", "11110", "10001", "10001", "11110", "10000"],
  q: ["00000", "00000", "01111", "10001", "10001", "01111", "00001"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["00100", "00100", "11110", "00100", "00100", "00100", "00011"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10101", "10101", "10101", "01010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "10001", "10001", "01111", "00001", "00001", "01110"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  '"': ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "*": ["00000", "00100", "10101", "01110", "10101", "00100", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00100", "00100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  ":": ["00000", "00100", "00000", "00000", "00000", "00100", "00000"],
  ";": ["00000", "00100", "00000", "00000", "00100", "00100", "01000"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "@": ["01110", "10001", "10111", "10101", "10110", "10000", "01110"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "\\": ["10000", "01000", "01000", "00100", "00010", "00010", "00001"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "`": ["00100", "00100", "00010", "00000", "00000", "00000", "00000"],
  "{": ["00110", "01000", "01000", "01110", "01000", "01000", "00110"],
  "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100"],
  "}": ["01100", "00010", "00010", "01110", "00010", "00010", "01100"],
  "~": ["00000", "00000", "01001", "10110", "00000", "00000", "00000"],
  "•": ["00000", "00000", "00100", "01110", "01110", "01110", "00100"],
};

// Normalise typographic characters to glyphs the font carries.
function normaliseChar(ch: string): string {
  if (ch === "’" || ch === "‘") return "'";
  if (ch === "“" || ch === "”") return '"';
  if (ch === "–" || ch === "—") return "-";
  return ch;
}

function glyphOf(ch: string): string[] {
  return FONT[normaliseChar(ch)] ?? FONT["?"];
}

// Width in pixels of a string at a given scale (5 px per glyph + 1 px gap).
function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}

function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s) {
    const glyph = glyphOf(ch);
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === "1") {
          fillRect(cx + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentred(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}

// Greedy word wrap; returns lines that fit maxW at the given scale.
function wrapText(s: string, scale: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur === "" ? word : cur + " " + word;
    if (textWidth(trial, scale) <= maxW) {
      cur = trial;
    } else {
      if (cur !== "") lines.push(cur);
      cur = word;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// Draw a wrapped paragraph; returns the y just below the last line.
function drawPara(
  s: string,
  x: number,
  y: number,
  scale: number,
  c: RGB,
  maxW: number,
  lineGap = 4,
): number {
  const lines = wrapText(s, scale, maxW);
  const step = 7 * scale + lineGap;
  for (let i = 0; i < lines.length; i++) drawText(lines[i], x, y + i * step, scale, c);
  return y + lines.length * step;
}

// ---------------------------------------------------------------------------
// Drawn illustrations (all geometry, no external images)
// ---------------------------------------------------------------------------

// A globe with a red crack across it: the climate summit ends with no deal.
function drawGlobe(cx: number, cy: number, r: number): void {
  fillCircle(cx, cy, r, SKY);
  // Latitude lines (chords of the circle).
  for (const dy of [-r / 2, 0, r / 2]) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    line(cx - half, cy + Math.round(dy), cx + half, cy + Math.round(dy), BLUE, 1);
  }
  // Longitude lines (vertical ellipses approximated by chords).
  for (const k of [-0.55, 0, 0.55]) {
    const rx = Math.max(2, Math.round(r * Math.abs(k)));
    const top = cy - r;
    const bottom = cy + r;
    const steps = 24;
    let prev: [number, number] | null = null;
    for (let i = 0; i <= steps; i++) {
      const y = top + ((bottom - top) * i) / steps;
      const yy = y - cy;
      const half = Math.sqrt(Math.max(0, 1 - (yy * yy) / (r * r)));
      const x = cx + Math.round(rx * half) * (k < 0 ? -1 : 1) * (k === 0 ? 0 : 1);
      const px = k === 0 ? cx : x;
      if (prev) line(prev[0], prev[1], px, Math.round(y), BLUE, 1);
      prev = [px, Math.round(y)];
    }
  }
  // Continents as simple green landmasses.
  fillEllipse(cx - r / 3, cy - r / 3, 20, 12, GREEN);
  fillEllipse(cx + r / 4, cy + r / 8, 24, 13, GREEN);
  fillEllipse(cx + r / 2, cy - r / 2, 11, 8, GREEN);
  fillEllipse(cx - r / 2, cy + r / 2, 13, 8, GREEN);
  circleOutline(cx, cy, r, INK, 3);
  // The crack: a jagged red line from the top of the globe to its base.
  polyline(
    [
      [cx - 8, cy - r + 2],
      [cx + 6, cy - Math.round(r * 0.55)],
      [cx - 10, cy - Math.round(r * 0.15)],
      [cx + 8, cy + Math.round(r * 0.3)],
      [cx - 4, cy + Math.round(r * 0.7)],
      [cx + 10, cy + r - 2],
    ],
    RED,
    3,
  );
}

// A factory with a smoking chimney and a flame: the Indonesia fire.
function drawFactory(x: number, y: number, w: number, h: number): void {
  const ground = y + h;
  // Chimney with smoke that stays low, clear of the text above.
  fillRect(x + w - 26, y + 8, 14, h - 8, INK);
  fillCircle(x + w - 26, y + 4, 8, GREY);
  fillCircle(x + w - 14, y - 2, 10, GREY);
  fillCircle(x + w - 2, y - 6, 7, GREY);
  // Sawtooth-roof building.
  fillRect(x, y + 34, w - 30, h - 34, BLUE);
  fillTriangle(x, y + 34, x + 16, y + 18, x + 32, y + 34, BLUE);
  fillTriangle(x + 32, y + 34, x + 48, y + 18, x + 64, y + 34, BLUE);
  fillTriangle(x + 64, y + 34, x + 80, y + 18, x + w - 30, y + 34, BLUE);
  // Windows.
  for (let i = 0; i < 3; i++) fillRect(x + 10 + i * 26, y + 48, 14, 12, GOLD);
  // Flame licking the roof.
  fillTriangle(x + 18, y + 22, x + 28, y - 2, x + 38, y + 22, ORANGE);
  fillTriangle(x + 30, y + 22, x + 38, y + 4, x + 46, y + 22, RED);
  line(x, ground, x + w, ground, INK, 2);
}

// A chip with a rising arrow: Nvidia's rally.
function drawChip(x: number, y: number, s: number): void {
  const w = 64;
  const h = 64;
  // Pins.
  for (let i = 0; i < 4; i++) {
    fillRect(x + 8 + i * 15, y - 8, 6, 8, INK);
    fillRect(x + 8 + i * 15, y + h, 6, 8, INK);
    fillRect(x - 8, y + 8 + i * 15, 8, 6, INK);
    fillRect(x + w, y + 8 + i * 15, 8, 6, INK);
  }
  fillRect(x, y, w, h, INK);
  fillRect(x + 4, y + 4, w - 8, h - 8, GREEN);
  fillRect(x + 18, y + 18, w - 36, h - 36, PAPER);
  drawText("NV", x + 20, y + 26, 2, INK);
  // Rising arrow over the chip; its tip stays below the text above.
  polyline(
    [
      [x - 6, y + h - 16],
      [x + 16, y + h - 34],
      [x + 30, y + h - 26],
      [x + w + 10, y + 2],
    ],
    RED,
    4,
  );
  fillTriangle(x + w + 10, y + 2, x + w - 4, y + 4, x + w + 6, y + 16, RED);
}

// A cargo ship with smoke: the Sparta II fire in the Gulf of Finland.
function drawShip(x: number, y: number, w: number, h: number): void {
  const waterY = y + h - 10;
  // Smoke from the stern.
  fillCircle(x + 18, y + 2, 10, GREY);
  fillCircle(x + 30, y - 6, 12, GREY);
  fillCircle(x + 44, y - 12, 9, GREY);
  // Containers.
  fillRect(x + 52, y + 30, 26, 22, SAFFRON);
  fillRect(x + 82, y + 30, 26, 22, BLUE);
  fillRect(x + 112, y + 30, 26, 22, RED);
  fillRect(x + 67, y + 8, 26, 22, GREEN);
  fillRect(x + 97, y + 8, 26, 22, GOLD);
  // Bridge tower.
  fillRect(x + 146, y + 14, 22, 38, WHITE);
  rectOutline(x + 146, y + 14, 22, 38, INK, 2);
  fillRect(x + 150, y + 20, 14, 8, BLUE);
  // Hull.
  polyline(
    [
      [x, y + 52],
      [x + w - 8, y + 52],
      [x + w - 26, y + h - 14],
      [x + 12, y + h - 14],
    ],
    INK,
    3,
  );
  fillTriangle(x + 4, y + 54, x + w - 12, y + 54, x + w - 26, y + h - 16, RED);
  fillTriangle(x + 4, y + 54, x + w - 26, y + h - 16, x + 12, y + h - 16, RED);
  // Flame on deck.
  fillTriangle(x + 118, y + 30, x + 126, y + 10, x + 134, y + 30, ORANGE);
  // Water.
  line(x, waterY, x + w, waterY, BLUE, 3);
  line(x + 20, waterY + 6, x + 60, waterY + 6, BLUE, 2);
  line(x + 90, waterY + 6, x + 150, waterY + 6, BLUE, 2);
}

// Two small flags side by side: India and Nepal.
function drawFlags(x: number, y: number): void {
  // India: saffron / white / green with a navy wheel.
  fillRect(x, y, 74, 16, SAFFRON);
  fillRect(x, y + 16, 74, 16, WHITE);
  fillRect(x, y + 32, 74, 16, GREEN);
  rectOutline(x, y, 74, 48, INK, 2);
  circleOutline(x + 37, y + 24, 7, BLUE, 2);
  // Nepal: crimson field with a blue border.
  fillRect(x + 96, y, 74, 48, RED);
  rectOutline(x + 96, y, 74, 48, BLUE, 4);
  fillCircle(x + 122, y + 16, 7, WHITE);
  fillCircle(x + 150, y + 34, 6, WHITE);
}

// A trophy cup with a tennis ball: Alcaraz wins the ATP Finals.
function drawTrophy(x: number, y: number): void {
  // Ball.
  fillCircle(x + 108, y + 52, 15, GREEN);
  circleOutline(x + 108, y + 52, 15, INK, 2);
  polyline(
    [
      [x + 96, y + 42],
      [x + 104, y + 52],
      [x + 96, y + 62],
    ],
    WHITE,
    2,
  );
  polyline(
    [
      [x + 120, y + 42],
      [x + 112, y + 52],
      [x + 120, y + 62],
    ],
    WHITE,
    2,
  );
  // Cup.
  fillRect(x + 8, y + 6, 62, 34, GOLD);
  rectOutline(x + 8, y + 6, 62, 34, INK, 2);
  // Handles.
  line(x + 8, y + 12, x - 6, y + 18, INK, 3);
  line(x - 6, y + 18, x + 8, y + 30, INK, 3);
  line(x + 70, y + 12, x + 84, y + 18, INK, 3);
  line(x + 84, y + 18, x + 70, y + 30, INK, 3);
  // Stem and base.
  fillRect(x + 34, y + 40, 10, 14, GOLD);
  fillRect(x + 20, y + 54, 38, 8, GOLD);
  rectOutline(x + 20, y + 54, 38, 8, INK, 2);
  drawText("1", x + 34, y + 16, 2, INK);
}

// ---------------------------------------------------------------------------
// Small icons for the three-column row
// ---------------------------------------------------------------------------

function drawMiniShip(x: number, y: number): void {
  // Smoke, hull, mast and flame in a ~150x40 box.
  fillCircle(x + 24, y + 4, 8, GREY);
  fillCircle(x + 36, y - 2, 10, GREY);
  fillRect(x + 60, y + 12, 18, 12, SAFFRON);
  fillRect(x + 82, y + 12, 18, 12, BLUE);
  fillRect(x + 104, y + 12, 18, 12, RED);
  fillRect(x + 126, y + 2, 14, 22, WHITE);
  rectOutline(x + 126, y + 2, 14, 22, INK, 2);
  polyline(
    [
      [x + 4, y + 24],
      [x + 146, y + 24],
      [x + 132, y + 38],
      [x + 16, y + 38],
    ],
    INK,
    2,
  );
  fillTriangle(x + 8, y + 26, x + 142, y + 26, x + 132, y + 38, RED);
  fillTriangle(x + 8, y + 26, x + 132, y + 38, x + 16, y + 38, RED);
  fillTriangle(x + 86, y + 12, x + 92, y - 2, x + 98, y + 12, ORANGE);
  line(x + 4, y + 44, x + 150, y + 44, BLUE, 2);
}

function drawMiniFlags(x: number, y: number): void {
  fillRect(x, y, 62, 13, SAFFRON);
  fillRect(x, y + 13, 62, 13, WHITE);
  fillRect(x, y + 26, 62, 13, GREEN);
  rectOutline(x, y, 62, 39, INK, 2);
  circleOutline(x + 31, y + 19, 6, BLUE, 2);
  fillRect(x + 78, y, 62, 39, RED);
  rectOutline(x + 78, y, 62, 39, BLUE, 3);
  fillCircle(x + 100, y + 13, 6, WHITE);
  fillCircle(x + 122, y + 28, 5, WHITE);
}

function drawMiniTrophy(x: number, y: number): void {
  fillCircle(x + 96, y + 26, 13, GREEN);
  circleOutline(x + 96, y + 26, 13, INK, 2);
  line(x + 88, y + 18, x + 96, y + 26, WHITE, 2);
  line(x + 96, y + 26, x + 88, y + 34, WHITE, 2);
  line(x + 104, y + 18, x + 96, y + 26, WHITE, 2);
  line(x + 96, y + 26, x + 104, y + 34, WHITE, 2);
  fillRect(x + 8, y, 52, 28, GOLD);
  rectOutline(x + 8, y, 52, 28, INK, 2);
  line(x + 8, y + 6, x - 4, y + 12, INK, 3);
  line(x - 4, y + 12, x + 8, y + 22, INK, 3);
  line(x + 60, y + 6, x + 72, y + 12, INK, 3);
  line(x + 72, y + 12, x + 60, y + 22, INK, 3);
  fillRect(x + 29, y + 28, 10, 10, GOLD);
  fillRect(x + 17, y + 38, 34, 6, GOLD);
  rectOutline(x + 17, y + 38, 34, 6, INK, 2);
  drawText("1", x + 29, y + 9, 2, INK);
}

// ---------------------------------------------------------------------------
// The front page
// ---------------------------------------------------------------------------

function drawPage(): void {
  // Paper and frame.
  fillRect(0, 0, W, H, PAPER);
  rectOutline(10, 10, W - 20, H - 20, INK, 3);
  rectOutline(18, 18, W - 36, H - 36, INK, 1);

  // Masthead.
  drawTextCentred("THE WORLD IN ONE PAGE", W / 2, 38, 5, INK);
  hline(40, 182, 55, RED, 2);
  hline(842, 984, 55, RED, 2);
  hline(40, 984, 92, RED, 2);
  hline(40, 984, 96, RED, 1);

  // Dateline.
  drawTextCentred("TUESDAY, 24 NOVEMBER 2026", W / 2, 106, 2, RED);
  hline(40, 984, 130, INK, 2);

  // ---- Lead story: COP31 ----
  drawText("CLIMATE SUMMIT - THE LEAD STORY", 32, 146, 2, RED);
  drawText("COP31 ENDS", 32, 172, 4, INK);
  drawText("WITHOUT A DEAL", 32, 208, 4, INK);
  drawPara(
    "Climate talks collapse as countries fail to agree stronger language on phasing out fossil fuels.",
    32,
    252,
    2,
    INK,
    600,
  );
  drawPara(
    "Negotiators leave with no consensus deal, and the summit ends without a stronger pledge to move away from fossil fuels.",
    32,
    296,
    2,
    INK,
    600,
  );
  // "What it means" box.
  rectOutline(32, 362, 600, 82, INK, 2);
  rectOutline(37, 367, 590, 72, INK, 1);
  drawText("WHAT IT MEANS", 48, 374, 2, RED);
  drawPara(
    "No deal leaves the talks' central question - how fast to quit fossil fuels - unanswered.",
    48,
    398,
    2,
    INK,
    568,
  );

  // Lead illustration: a cracked globe with a NO DEAL stamp.
  rectOutline(664, 146, 328, 298, INK, 2);
  drawGlobe(828, 250, 70);
  rectOutline(756, 330, 144, 34, RED, 3);
  drawTextCentred("NO DEAL", 828, 336, 3, RED);
  const capLines = wrapText("The summit ends with no deal on fossil fuels.", 2, 300);
  for (let i = 0; i < capLines.length; i++) {
    drawTextCentred(capLines[i], 828, 376 + i * 18, 2, INK);
  }

  // Rule under the lead.
  hline(32, 992, 456, INK, 2);
  hline(32, 992, 460, INK, 1);

  // ---- Row 2: two stories ----
  vline(508, 472, 656, INK, 1);
  // Indonesia factory fire.
  drawText("INDONESIA", 32, 472, 2, RED);
  drawText("AT LEAST 24 DEAD", 32, 496, 3, INK);
  drawText("IN FACTORY FIRE", 32, 523, 3, INK);
  drawPara(
    "A candy factory fire kills at least 24 people. Around 30 workers are missing.",
    32,
    552,
    2,
    INK,
    460,
  );
  drawFactory(60, 600, 220, 64);
  // Huang returns as Nvidia chief.
  drawText("TECH - NVIDIA", 540, 472, 2, RED);
  drawText("HUANG RETURNS", 540, 496, 3, INK);
  drawText("AS NVIDIA CHIEF", 540, 523, 3, INK);
  drawPara(
    "Huang is back as chief executive. Nvidia climbs almost $1 trillion.",
    540,
    552,
    2,
    INK,
    452,
  );
  drawChip(760, 590, 1);

  // Rule under row 2.
  hline(32, 992, 668, INK, 2);
  hline(32, 992, 672, INK, 1);

  // ---- Row 3: three stories ----
  vline(344, 684, 884, INK, 1);
  vline(672, 684, 884, INK, 1);
  // Sparta II.
  drawText("THE GULF OF FINLAND", 32, 684, 2, RED);
  drawText("SHIP AFIRE AFTER", 32, 708, 3, INK);
  drawText("DRONE STRIKE", 32, 735, 3, INK);
  drawPara(
    "Russian cargo ship Sparta II catches fire after a drone strike.",
    32,
    768,
    2,
    INK,
    304,
  );
  drawMiniShip(80, 836);
  // India–Nepal.
  drawText("INDIA - NEPAL", 360, 684, 2, RED);
  drawText("INDIA, NEPAL", 360, 708, 3, INK);
  drawText("RESET TIES", 360, 735, 3, INK);
  drawPara(
    "Modi announces a Rs 15,000-crore package and eight deals as the neighbours reset ties.",
    360,
    768,
    2,
    INK,
    304,
  );
  drawMiniFlags(396, 838);
  // Alcaraz.
  drawText("SPORT - TURIN", 688, 684, 2, RED);
  drawText("ALCARAZ WINS", 688, 708, 3, INK);
  drawText("ATP FINALS TITLE", 688, 735, 3, INK);
  drawPara(
    "Carlos Alcaraz beats Alexander Zverev to win his first ATP Finals title.",
    688,
    768,
    2,
    INK,
    304,
  );
  drawMiniTrophy(736, 836);

  // Rule above the ticker.
  hline(32, 992, 892, INK, 2);
  hline(32, 992, 896, INK, 1);

  // ---- Bottom ticker: the day's other news ----
  fillRect(28, 904, 968, 72, BLACK);
  drawPara(
    "ALSO TODAY - Chess: the World Championship opens in Geneva. Hormuz: the UN counts 25 seafarers killed. Denmark: top court upholds 'ghetto law' evictions. Cricket: India v New Zealand first Test ends in a draw.",
    42,
    912,
    2,
    WHITE,
    940,
  );

  // Footer.
  drawTextCentred("ONE DAY - ONE PAGE - THE WORLD", W / 2, 984, 2, GREY);
}

function main(): void {
  drawPage();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encodePNG(W, H, pixels));
}

main();
