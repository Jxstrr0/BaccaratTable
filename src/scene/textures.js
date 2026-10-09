// Procedural textures (2D canvas only): playing cards, card back, casino chips, felt maps.
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* Shared constants & helpers                                          */
/* ------------------------------------------------------------------ */

const CARD_W = 768;
const CARD_H = 1072;

const RED = '#b3121f';
const BLACK = '#141414';
const GOLD = '#b8913a';
const PAPER = '#f7f4ec';

const SERIF = 'Georgia, "Times New Roman", serif';
// lining numerals (Georgia has old-style figures, which look wrong on indices)
const SERIF_NUM = '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", Georgia, serif';
const SANS = '"Helvetica Neue", Arial, "Liberation Sans", sans-serif';

const TAU = Math.PI * 2;
const isRed = (suit) => suit === 'H' || suit === 'D';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// tiny seeded PRNG so textures are identical between sessions
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function goldGradient(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#ecd795');
  g.addColorStop(0.35, '#cfa84e');
  g.addColorStop(0.62, '#b8913a');
  g.addColorStop(1, '#8a6821');
  return g;
}

// gold ramp that is mirror-symmetric along its axis (keeps the card back point-symmetric)
function goldGradientSym(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#a98128');
  g.addColorStop(0.5, '#e6cd85');
  g.addColorStop(1, '#a98128');
  return g;
}

// font size (px) so that capital letters are `cap` px tall
function fontForCap(ctx, family, weight, cap, style = '') {
  ctx.font = `${style} ${weight} 100px ${family}`;
  const m = ctx.measureText('H');
  return (100 * cap) / (m.actualBoundingBoxAscent || 70);
}

function spacedText(ctx, text, x, y, spacing, align = 'center') {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((ch, i) => {
    ctx.fillText(ch, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.textAlign = prev;
}

// text on a circle; baseline sits on radius r. bottom=true keeps glyphs upright at the bottom.
function arcText(ctx, text, cx, cy, r, mid, spacing, bottom = false) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'center';
  let cum = 0;
  chars.forEach((ch, i) => {
    const d = cum + widths[i] / 2;
    const a = bottom ? mid + total / (2 * r) - d / r : mid - total / (2 * r) + d / r;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(bottom ? a - Math.PI / 2 : a + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    cum += widths[i] + spacing;
  });
  ctx.textAlign = prevAlign;
}

let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  const r = rng(77);
  const img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const v = r();
    img.data[i * 4] = 90;
    img.data[i * 4 + 1] = 78;
    img.data[i * 4 + 2] = 55;
    img.data[i * 4 + 3] = v < 0.5 ? 0 : Math.floor((v - 0.5) * 2 * 11);
  }
  g.putImageData(img, 0, 0);
  g.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const x = r() * 256, y = r() * 256, a = r() * TAU, l = 3 + r() * 9;
    g.strokeStyle = r() < 0.5 ? 'rgba(120,100,70,0.05)' : 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  grainTile = c;
  return c;
}

function paperGrain(ctx, w, h) {
  ctx.fillStyle = ctx.createPattern(getGrainTile(), 'repeat');
  ctx.fillRect(0, 0, w, h);
}

function addNoise(ctx, w, h, amount, seed) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const r = rng(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/* ------------------------------------------------------------------ */
/* Suit vector paths (unit box, centred on origin, 1 unit = full height) */
/* ------------------------------------------------------------------ */

let suitPaths = null;
function getSuitPaths() {
  if (suitPaths) return suitPaths;
  const heart = new Path2D();
  heart.moveTo(0, 0.5);
  heart.bezierCurveTo(-0.1, 0.4, -0.5, 0.1, -0.5, -0.17);
  heart.bezierCurveTo(-0.5, -0.4, -0.34, -0.5, -0.22, -0.5);
  heart.bezierCurveTo(-0.1, -0.5, -0.02, -0.42, 0, -0.3);
  heart.bezierCurveTo(0.02, -0.42, 0.1, -0.5, 0.22, -0.5);
  heart.bezierCurveTo(0.34, -0.5, 0.5, -0.4, 0.5, -0.17);
  heart.bezierCurveTo(0.5, 0.1, 0.1, 0.4, 0, 0.5);
  heart.closePath();

  const diamond = new Path2D();
  diamond.moveTo(0, -0.5);
  diamond.bezierCurveTo(0.06, -0.3, 0.22, -0.1, 0.37, 0);
  diamond.bezierCurveTo(0.22, 0.1, 0.06, 0.3, 0, 0.5);
  diamond.bezierCurveTo(-0.06, 0.3, -0.22, 0.1, -0.37, 0);
  diamond.bezierCurveTo(-0.22, -0.1, -0.06, -0.3, 0, -0.5);
  diamond.closePath();

  const spade = new Path2D();
  spade.moveTo(0, -0.5);
  spade.bezierCurveTo(0.08, -0.34, 0.5, -0.12, 0.5, 0.12);
  spade.bezierCurveTo(0.5, 0.32, 0.36, 0.38, 0.24, 0.38);
  spade.bezierCurveTo(0.14, 0.38, 0.07, 0.33, 0.03, 0.26);
  spade.bezierCurveTo(0.04, 0.38, 0.08, 0.45, 0.19, 0.5);
  spade.lineTo(-0.19, 0.5);
  spade.bezierCurveTo(-0.08, 0.45, -0.04, 0.38, -0.03, 0.26);
  spade.bezierCurveTo(-0.07, 0.33, -0.14, 0.38, -0.24, 0.38);
  spade.bezierCurveTo(-0.36, 0.38, -0.5, 0.32, -0.5, 0.12);
  spade.bezierCurveTo(-0.5, -0.12, -0.08, -0.34, 0, -0.5);
  spade.closePath();

  const club = new Path2D();
  club.arc(0, -0.29, 0.21, 0, TAU);
  club.moveTo(-0.07, 0.07);
  club.arc(-0.27, 0.08, 0.21, 0, TAU);
  club.moveTo(0.48, 0.08);
  club.arc(0.27, 0.08, 0.21, 0, TAU);
  const stem = new Path2D();
  stem.moveTo(-0.17, -0.12);
  stem.lineTo(0.17, -0.12);
  stem.lineTo(0.2, 0.12);
  stem.lineTo(-0.2, 0.12);
  stem.closePath();
  club.addPath(stem);
  const foot = new Path2D();
  foot.moveTo(-0.055, 0.06);
  foot.lineTo(0.055, 0.06);
  foot.bezierCurveTo(0.055, 0.3, 0.1, 0.42, 0.2, 0.5);
  foot.lineTo(-0.2, 0.5);
  foot.bezierCurveTo(-0.1, 0.42, -0.055, 0.3, -0.055, 0.06);
  foot.closePath();
  club.addPath(foot);

  suitPaths = { H: heart, D: diamond, S: spade, C: club };
  return suitPaths;
}

// draw a suit centred at (x, y); size = height in px
function drawSuit(ctx, suit, x, y, size, fill, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(size, size);
  ctx.fillStyle = fill;
  ctx.fill(getSuitPaths()[suit]);
  ctx.restore();
}

function strokeSuit(ctx, suit, x, y, size, stroke, lw, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(size, size);
  ctx.lineWidth = lw / size;
  ctx.strokeStyle = stroke;
  ctx.lineJoin = 'round';
  ctx.stroke(getSuitPaths()[suit]);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Card faces                                                          */
/* ------------------------------------------------------------------ */

const COL_X = [245, 384, 523];
const PIP_TOP = 178;
const PIP_BOT = 894;
const PIP_SIZE = 126;

// [column, row 0..1] — rows below 0.5 are drawn rotated 180deg
const PIP_LAYOUTS = {
  2: [[1, 0], [1, 1]],
  3: [[1, 0], [1, 0.5], [1, 1]],
  4: [[0, 0], [2, 0], [0, 1], [2, 1]],
  5: [[0, 0], [2, 0], [1, 0.5], [0, 1], [2, 1]],
  6: [[0, 0], [2, 0], [0, 0.5], [2, 0.5], [0, 1], [2, 1]],
  7: [[0, 0], [2, 0], [1, 0.25], [0, 0.5], [2, 0.5], [0, 1], [2, 1]],
  8: [[0, 0], [2, 0], [1, 0.25], [0, 0.5], [2, 0.5], [1, 0.75], [0, 1], [2, 1]],
  9: [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [1, 0.5], [0, 2 / 3], [2, 2 / 3], [0, 1], [2, 1]],
  10: [[0, 0], [2, 0], [1, 1 / 6], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3], [1, 5 / 6], [0, 1], [2, 1]],
};

function drawIndex(ctx, rank, suit, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  const px = fontForCap(ctx, SERIF_NUM, 'bold', 104);
  ctx.font = `bold ${px}px ${SERIF_NUM}`;
  const cx = 104;
  ctx.save();
  ctx.translate(cx, 160);
  if (rank === '10') ctx.scale(0.8, 1);
  ctx.fillText(rank, 0, 0);
  ctx.restore();
  drawSuit(ctx, suit, cx, 226, 70, color);
  ctx.restore();
}

function drawPips(ctx, rank, suit, color) {
  const layout = PIP_LAYOUTS[rank];
  for (const [col, row] of layout) {
    const x = COL_X[col];
    const y = PIP_TOP + (PIP_BOT - PIP_TOP) * row;
    drawSuit(ctx, suit, x, y, PIP_SIZE, color, row > 0.5 ? Math.PI : 0);
  }
}

function drawDiamondOrnament(ctx, x, y, s, fill) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s * 0.62, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s * 0.62, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawLeafBranch(ctx, cx, cy, r, a0, a1, n, leaf, fill) {
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2 + (a1 > a0 ? 0.55 : -0.55));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(leaf * 0.55, -leaf * 0.5, 0, -leaf);
    ctx.quadraticCurveTo(-leaf * 0.55, -leaf * 0.5, 0, 0);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }
}

function drawAce(ctx, suit, color) {
  const cx = CARD_W / 2, cy = CARD_H / 2;
  const spade = suit === 'S';
  ctx.save();
  // fine gold rings
  ctx.strokeStyle = goldGradient(ctx, cx - 300, cy - 300, cx + 300, cy + 300);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, spade ? 262 : 236, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, spade ? 272 : 246, 0, TAU);
  ctx.stroke();

  if (spade) {
    // radiating rays between two rings
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      const r0 = 214, r1 = i % 3 === 0 ? 252 : 236;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 212, 0, TAU);
    ctx.stroke();
    // laurel branches
    const leaf = ctx.createLinearGradient(cx - 280, cy, cx + 280, cy);
    leaf.addColorStop(0, '#d3b061');
    leaf.addColorStop(1, '#a37f2c');
    drawLeafBranch(ctx, cx, cy, 292, Math.PI * 0.62, Math.PI * 1.12, 9, 34, leaf);
    drawLeafBranch(ctx, cx, cy, 292, Math.PI * 0.38, -Math.PI * 0.12, 9, 34, leaf);
    drawDiamondOrnament(ctx, cx, cy - 292, 16, '#b8913a');
    drawDiamondOrnament(ctx, cx, cy + 292, 16, '#b8913a');
  } else {
    // four small diamonds on the ring
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      drawDiamondOrnament(ctx, cx + Math.cos(a) * 236, cy + Math.sin(a) * 236, 11, '#b8913a');
    }
  }

  const size = spade ? 360 : 330;
  const oy = suit === 'S' ? -6 : 0;
  // soft shadow + fill
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  drawSuit(ctx, suit, cx, cy + oy, size, color);
  ctx.restore();
  // gold rim + engraved inner contours (upper body only, keeps the stem clean)
  const rim = goldGradient(ctx, cx - 160, cy - 160, cx + 160, cy + 160);
  strokeSuit(ctx, suit, cx, cy + oy, size - 8, rim, 3.5);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - size, cy + oy - size, size * 2, size * 0.98);
  ctx.clip();
  strokeSuit(ctx, suit, cx, cy + oy, size * 0.8, rim, 2.5);
  strokeSuit(ctx, suit, cx, cy + oy, size * 0.62, 'rgba(184,145,58,0.6)', 1.4);
  ctx.restore();

  if (spade) {
    ctx.fillStyle = '#9a7628';
    ctx.font = `bold 30px ${SERIF}`;
    ctx.textBaseline = 'middle';
    spacedText(ctx, 'PENTHOUSE', cx, cy + 346, 13);
    ctx.fillRect(cx - 150, cy + 378, 300, 1.6);
    drawDiamondOrnament(ctx, cx, cy + 378, 6, '#b8913a');
  }
  ctx.restore();
}

/* ---- court cards ---- */

function courtPalette(red) {
  return red
    ? { field: '#6e101e', field2: '#a02031', robe: '#15244a', robe2: '#27407c' }
    : { field: '#101e41', field2: '#27437f', robe: '#7c1226', robe2: '#ac2540' };
}

const SKIN = '#f0dfc2';
const SKIN_SHADE = '#d9bf98';
const INK_LINE = '#241a14';

function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

function drawJewel(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, TAU);
  ctx.fillStyle = goldGradient(ctx, x - r, y - r, x + r, y + r);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.5, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, color);
  g.addColorStop(1, color);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
}

function drawFace(ctx, y0, rank) {
  // head
  const g = ctx.createLinearGradient(-44, 0, 44, 0);
  g.addColorStop(0, '#f6e8cf');
  g.addColorStop(0.6, SKIN);
  g.addColorStop(1, SKIN_SHADE);
  ctx.beginPath();
  ctx.moveTo(-43, y0 - 14);
  ctx.bezierCurveTo(-45, y0 + 30, -26, y0 + 58, 0, y0 + 60);
  ctx.bezierCurveTo(26, y0 + 58, 45, y0 + 30, 43, y0 - 14);
  ctx.bezierCurveTo(42, y0 - 46, 22, y0 - 58, 0, y0 - 58);
  ctx.bezierCurveTo(-22, y0 - 58, -42, y0 - 46, -43, y0 - 14);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(36,26,20,0.65)';
  ctx.stroke();

  // brows, eyes, nose, mouth (minimal, deco-style)
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK_LINE;
  ctx.lineWidth = 3;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 9, y0 - 8);
    ctx.quadraticCurveTo(s * 22, y0 - 17, s * 33, y0 - 9);
    ctx.stroke();
    // almond eye: white, dark iris, lid line
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(s * 10, y0 + 2);
    ctx.quadraticCurveTo(s * 22, y0 - 8, s * 34, y0 + 2);
    ctx.quadraticCurveTo(s * 22, y0 + 9, s * 10, y0 + 2);
    ctx.closePath();
    ctx.fillStyle = '#fbf8ef';
    ctx.fill();
    ctx.clip();
    ctx.beginPath();
    ctx.arc(s * 22, y0 + 1, 5.2, 0, TAU);
    ctx.fillStyle = '#2b2118';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(s * 9, y0 + 2);
    ctx.quadraticCurveTo(s * 22, y0 - 9, s * 35, y0 + 1);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = INK_LINE;
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(80,50,30,0.8)';
  ctx.beginPath();
  ctx.moveTo(0, y0 - 2);
  ctx.lineTo(-5, y0 + 21);
  ctx.quadraticCurveTo(0, y0 + 25, 7, y0 + 21);
  ctx.stroke();
  // lips
  const my = y0 + 38;
  ctx.beginPath();
  ctx.moveTo(-13, my);
  ctx.quadraticCurveTo(-6, my - 6, 0, my - 3);
  ctx.quadraticCurveTo(6, my - 6, 13, my);
  ctx.quadraticCurveTo(0, my + 9, -13, my);
  ctx.fillStyle = rank === 'Q' ? '#a31526' : '#8d2a2a';
  ctx.fill();
}

function drawCrownK(ctx, y0) {
  // y0 = top of head region (about -306)
  const gold = goldGradient(ctx, -50, y0 - 70, 50, y0);
  ctx.beginPath();
  ctx.moveTo(-52, y0 + 6);
  ctx.lineTo(-52, y0 - 36);
  ctx.lineTo(-37, y0 - 14);
  ctx.lineTo(-26, y0 - 52);
  ctx.lineTo(-12, y0 - 14);
  ctx.lineTo(0, y0 - 68);
  ctx.lineTo(12, y0 - 14);
  ctx.lineTo(26, y0 - 52);
  ctx.lineTo(37, y0 - 14);
  ctx.lineTo(52, y0 - 36);
  ctx.lineTo(52, y0 + 6);
  ctx.closePath();
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#6d5116';
  ctx.stroke();
  // band
  ctx.fillStyle = '#2a1a0c';
  ctx.fillRect(-52, y0 - 14, 104, 3);
  // finial balls
  for (const [x, y] of [[-52, -36], [-26, -52], [0, -68], [26, -52], [52, -36]]) {
    ctx.beginPath();
    ctx.arc(x, y0 + y - 5, 5.5, 0, TAU);
    ctx.fillStyle = '#f1dc9c';
    ctx.fill();
    ctx.strokeStyle = '#6d5116';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  drawJewel(ctx, 0, y0 - 28, 7, '#b3121f');
  drawJewel(ctx, -30, y0 - 4, 5.5, '#1b3a7a');
  drawJewel(ctx, 30, y0 - 4, 5.5, '#1b3a7a');
  // cross on central peak
  ctx.fillStyle = '#f1dc9c';
  ctx.fillRect(-1.6, y0 - 90, 3.2, 20);
  ctx.fillRect(-7, y0 - 84, 14, 3.2);
}

function drawTiaraQ(ctx, y0) {
  const gold = goldGradient(ctx, -50, y0 - 40, 50, y0 + 10);
  // curved band following the brow
  ctx.beginPath();
  ctx.moveTo(-46, y0 + 18);
  ctx.quadraticCurveTo(-48, y0 - 8, -34, y0 - 20);
  ctx.lineTo(-24, y0 - 38);
  ctx.lineTo(-14, y0 - 20);
  ctx.quadraticCurveTo(0, y0 - 28, 14, y0 - 20);
  ctx.lineTo(24, y0 - 38);
  ctx.lineTo(34, y0 - 20);
  ctx.quadraticCurveTo(48, y0 - 8, 46, y0 + 18);
  ctx.quadraticCurveTo(0, y0 - 2, -46, y0 + 18);
  ctx.closePath();
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#6d5116';
  ctx.stroke();
  // pearls on points
  for (const [x, y] of [[-24, -43], [24, -43]]) {
    ctx.beginPath();
    ctx.arc(x, y0 + y + 1, 4.5, 0, TAU);
    ctx.fillStyle = '#fbf6e6';
    ctx.fill();
    ctx.stroke();
  }
  // lotus flower
  ctx.save();
  ctx.translate(0, y0 - 28);
  for (let i = -2; i <= 2; i++) {
    ctx.save();
    ctx.rotate(i * 0.5);
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.quadraticCurveTo(11, -14, 0, -38 + Math.abs(i) * 6);
    ctx.quadraticCurveTo(-11, -14, 0, 6);
    ctx.fillStyle = Math.abs(i) === 1 ? '#f4e9d0' : i === 0 ? '#fbf6e6' : '#e5d3a8';
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#6d5116';
    ctx.stroke();
    ctx.restore();
  }
  drawJewel(ctx, 0, 0, 6.5, '#b3121f');
  ctx.restore();
  // dotted pearls along band
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    ctx.beginPath();
    ctx.arc(i * 12.5, y0 + 5 - Math.abs(i) * 0.2 + Math.abs(i) * 1.2, 2.6, 0, TAU);
    ctx.fillStyle = '#fbf6e6';
    ctx.fill();
  }
}

function drawPlumeJ(ctx, P, y0) {
  // hat cap
  const cap = ctx.createLinearGradient(-56, y0 - 50, 56, y0);
  cap.addColorStop(0, P.robe2);
  cap.addColorStop(1, P.robe);
  ctx.beginPath();
  ctx.moveTo(-58, y0 + 10);
  ctx.bezierCurveTo(-64, y0 - 48, -20, y0 - 62, 6, y0 - 56);
  ctx.bezierCurveTo(44, y0 - 52, 66, y0 - 30, 58, y0 + 10);
  ctx.closePath();
  ctx.fillStyle = cap;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#d6b45c';
  ctx.stroke();
  // art-deco ribs on the cap
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(232,205,130,0.75)';
  for (const k of [-34, -17, 0, 17, 34]) {
    ctx.beginPath();
    ctx.moveTo(k * 1.4, y0 + 4);
    ctx.quadraticCurveTo(k * 0.7, y0 - 30, k * 0.35, y0 - 54);
    ctx.stroke();
  }
  // gold band
  ctx.beginPath();
  ctx.moveTo(-60, y0 + 4);
  ctx.lineTo(60, y0 + 4);
  ctx.lineTo(60, y0 + 18);
  ctx.lineTo(-60, y0 + 18);
  ctx.closePath();
  ctx.fillStyle = goldGradient(ctx, -60, y0, 60, y0 + 18);
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#6d5116';
  ctx.stroke();
  drawJewel(ctx, -40, y0 + 11, 4.5, '#f4efe0');
  drawJewel(ctx, 40, y0 + 11, 4.5, '#f4efe0');
  // brooch + feathers
  const bx = -34, by = y0 - 12;
  const feather = (p1, p2, p3, wmax, c0, c1) => {
    const p0 = [bx, by];
    const spine = (t) => {
      const u = 1 - t;
      return [
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ];
    };
    const N = 30;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const [x, y] = spine(t);
      const [x2, y2] = spine(Math.min(1, t + 0.01));
      const [x1, y1] = spine(Math.max(0, t - 0.01));
      let nx = -(y2 - y1), ny = x2 - x1;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      const w = wmax * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 0.8) + 1;
      pts.push({ x, y, nx, ny, w });
    }
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x + p.nx * p.w, p.y + p.ny * p.w) : ctx.moveTo(p.x + p.nx * p.w, p.y + p.ny * p.w)));
    for (let i = N; i >= 0; i--) ctx.lineTo(pts[i].x - pts[i].nx * pts[i].w, pts[i].y - pts[i].ny * pts[i].w);
    ctx.closePath();
    const fg = ctx.createLinearGradient(-90, y0, 40, y0 - 110);
    fg.addColorStop(0, c0);
    fg.addColorStop(1, c1);
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#a8842c';
    ctx.stroke();
    // barbs sweep toward the tip
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(140,108,36,0.75)';
    for (let i = 3; i < N - 1; i++) {
      const p = pts[i], q = pts[i + 2];
      const dx = q.x - p.x, dy = q.y - p.y;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + sgn * p.nx * p.w * 0.95 + dx * 1.4, p.y + sgn * p.ny * p.w * 0.95 + dy * 1.4);
        ctx.stroke();
      }
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#b8913a';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  };
  feather([-104, y0 - 6], [-100, y0 - 60], [-58, y0 - 84], 9, '#e8d6a0', '#cfae5a');
  feather([-86, y0 - 24], [-72, y0 - 94], [12, y0 - 98], 15, '#fbf6e6', '#e2cf9a');
  drawJewel(ctx, bx, by, 6.5, '#b3121f');
}

function drawHair(ctx, rank, y0, P) {
  const hair = rank === 'K' ? '#6b6258' : '#1c1511';
  if (rank === 'Q') {
    // long hair falling to the shoulders (drawn behind head)
    ctx.beginPath();
    ctx.moveTo(-50, y0 - 40);
    ctx.bezierCurveTo(-72, y0 - 10, -62, y0 + 60, -76, y0 + 118);
    ctx.bezierCurveTo(-48, y0 + 112, -32, y0 + 104, -30, y0 + 98);
    ctx.lineTo(30, y0 + 98);
    ctx.bezierCurveTo(32, y0 + 104, 48, y0 + 112, 76, y0 + 118);
    ctx.bezierCurveTo(62, y0 + 60, 72, y0 - 10, 50, y0 - 40);
    ctx.bezierCurveTo(30, y0 - 78, -30, y0 - 78, -50, y0 - 40);
    ctx.closePath();
    ctx.fillStyle = hair;
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,165,90,0.55)';
    ctx.lineWidth = 1.4;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(s * (54 + k * 4), y0 - 10);
        ctx.bezierCurveTo(s * (66 + k * 3), y0 + 30, s * (56 + k * 5), y0 + 70, s * (66 + k * 3), y0 + 108);
        ctx.stroke();
      }
    }
  } else {
    // ears + side hair
    ctx.beginPath();
    ctx.moveTo(-46, y0 - 36);
    ctx.bezierCurveTo(-60, y0 - 10, -54, y0 + 28, -44, y0 + 40);
    ctx.lineTo(-38, y0 + 10);
    ctx.lineTo(-40, y0 - 30);
    ctx.closePath();
    ctx.moveTo(46, y0 - 36);
    ctx.bezierCurveTo(60, y0 - 10, 54, y0 + 28, 44, y0 + 40);
    ctx.lineTo(38, y0 + 10);
    ctx.lineTo(40, y0 - 30);
    ctx.closePath();
    ctx.fillStyle = hair;
    ctx.fill();
  }
}

function drawFringe(ctx, rank, y0) {
  const hair = rank === 'K' ? '#6b6258' : '#1c1511';
  ctx.fillStyle = hair;
  ctx.beginPath();
  if (rank === 'Q') {
    // centre parting with swept waves
    ctx.moveTo(-44, y0 - 18);
    ctx.bezierCurveTo(-44, y0 - 54, -20, y0 - 62, 0, y0 - 58);
    ctx.bezierCurveTo(20, y0 - 62, 44, y0 - 54, 44, y0 - 18);
    ctx.bezierCurveTo(36, y0 - 38, 14, y0 - 46, 0, y0 - 44);
    ctx.bezierCurveTo(-14, y0 - 46, -36, y0 - 38, -44, y0 - 18);
  } else {
    ctx.moveTo(-44, y0 - 14);
    ctx.bezierCurveTo(-44, y0 - 56, 20, y0 - 66, 44, y0 - 20);
    ctx.bezierCurveTo(30, y0 - 34, 4, y0 - 36, -20, y0 - 30);
    ctx.bezierCurveTo(-30, y0 - 28, -38, y0 - 22, -44, y0 - 14);
  }
  ctx.closePath();
  ctx.fill();
}

function drawBeard(ctx, y0) {
  const col = '#6b6258';
  // beard
  ctx.beginPath();
  ctx.moveTo(-43, y0 + 4);
  ctx.bezierCurveTo(-46, y0 + 50, -26, y0 + 88, 0, y0 + 98);
  ctx.bezierCurveTo(26, y0 + 88, 46, y0 + 50, 43, y0 + 4);
  ctx.bezierCurveTo(36, y0 + 22, 24, y0 + 26, 14, y0 + 30);
  ctx.quadraticCurveTo(0, y0 + 24, -14, y0 + 30);
  ctx.bezierCurveTo(-24, y0 + 26, -36, y0 + 22, -43, y0 + 4);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,235,222,0.45)';
  ctx.lineWidth = 1.2;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(k * 11, y0 + 40);
    ctx.quadraticCurveTo(k * 12, y0 + 66, k * 5, y0 + 90);
    ctx.stroke();
  }
  // moustache
  ctx.beginPath();
  ctx.moveTo(0, y0 + 26);
  ctx.bezierCurveTo(10, y0 + 20, 26, y0 + 22, 34, y0 + 34);
  ctx.bezierCurveTo(24, y0 + 32, 12, y0 + 36, 0, y0 + 32);
  ctx.bezierCurveTo(-12, y0 + 36, -24, y0 + 32, -34, y0 + 34);
  ctx.bezierCurveTo(-26, y0 + 22, -10, y0 + 20, 0, y0 + 26);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  // mouth hint
  ctx.fillStyle = '#7d2323';
  ctx.fillRect(-7, y0 + 36, 14, 3);
}

function drawChevrons(ctx, P, y0, count, color, lw) {
  // nested V trim following the neckline
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'miter';
  for (let k = 0; k < count; k++) {
    const yy = y0 + k * 15;
    const yTop = -230;
    const dx = (0.8125 * (yy - yTop));
    ctx.beginPath();
    ctx.moveTo(-dx, yTop);
    ctx.lineTo(0, yy);
    ctx.lineTo(dx, yTop);
    ctx.stroke();
  }
}

function drawFigure(ctx, rank, red, P) {
  const headY = -250;
  // hair behind
  drawHair(ctx, rank, headY, P);

  // shoulders / robe
  const robe = ctx.createLinearGradient(-120, -180, 120, 0);
  robe.addColorStop(0, P.robe2);
  robe.addColorStop(1, P.robe);
  const shoulders = new Path2D();
  shoulders.moveTo(-160, 0);
  shoulders.lineTo(-160, -82);
  shoulders.bezierCurveTo(-154, -136, -104, -150, -54, -172);
  shoulders.lineTo(54, -172);
  shoulders.bezierCurveTo(104, -150, 154, -136, 160, -82);
  shoulders.lineTo(160, 0);
  shoulders.closePath();

  // neck
  ctx.beginPath();
  ctx.moveTo(-19, headY + 40);
  ctx.lineTo(-19, -178);
  ctx.lineTo(19, -178);
  ctx.lineTo(19, headY + 40);
  ctx.fillStyle = SKIN_SHADE;
  ctx.fill();

  ctx.fillStyle = robe;
  ctx.fill(shoulders);
  ctx.save();
  ctx.clip(shoulders);
  // undershirt / skin neckline
  if (rank === 'Q') {
    ctx.beginPath();
    ctx.moveTo(-58, -178);
    ctx.quadraticCurveTo(0, -84, 58, -178);
    ctx.fillStyle = SKIN;
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-40, -178);
    ctx.lineTo(0, -122);
    ctx.lineTo(40, -178);
    ctx.fillStyle = rank === 'K' ? '#f2ead6' : SKIN;
    ctx.fill();
  }
  // nested deco chevrons
  drawChevrons(ctx, P, -112, 7, 'rgba(228,198,112,0.85)', 2.4);
  drawChevrons(ctx, P, -104, 7, 'rgba(228,198,112,0.35)', 1.2);
  // rank-specific collar / ornament
  if (rank === 'K') {
    // ermine collar
    ctx.strokeStyle = '#f4eddb';
    ctx.lineWidth = 24;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(-136, -228);
    ctx.lineTo(0, -102);
    ctx.lineTo(136, -228);
    ctx.stroke();
    ctx.strokeStyle = '#b8913a';
    ctx.lineWidth = 2;
    for (const o of [-13, 13]) {
      ctx.beginPath();
      ctx.moveTo(-136 - o * 0.3, -228 - o);
      ctx.lineTo(0, -102 - o * 1.3);
      ctx.lineTo(136 + o * 0.3, -228 - o);
      ctx.stroke();
    }
    ctx.fillStyle = '#161616';
    for (let t = 0.1; t < 1; t += 0.115) {
      for (const s of [-1, 1]) {
        const x = s * (136 * (1 - t));
        const y = -228 + 126 * t;
        ctx.beginPath();
        ctx.ellipse(x, y, 2.4, 4.2, s * 0.8, 0, TAU);
        ctx.fill();
      }
    }
  } else if (rank === 'Q') {
    // pearl necklace with pendant
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const a = Math.PI * (0.12 + 0.76 * t);
      const x = Math.cos(a) * 54;
      const y = -176 + Math.sin(a) * 70;
      ctx.beginPath();
      ctx.arc(x, y, 4.6, 0, TAU);
      ctx.fillStyle = '#fbf6e6';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(120,95,40,0.8)';
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, -98);
    ctx.lineTo(10, -84);
    ctx.lineTo(0, -62);
    ctx.lineTo(-10, -84);
    ctx.closePath();
    ctx.fillStyle = goldGradient(ctx, -10, -98, 10, -62);
    ctx.fill();
    drawJewel(ctx, 0, -82, 5, red ? '#b3121f' : '#1b3a7a');
  } else {
    // diagonal sash with medallion
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-170, -20);
    ctx.lineTo(-170, -52);
    ctx.lineTo(170, -168);
    ctx.lineTo(170, -134);
    ctx.closePath();
    ctx.fillStyle = '#f2ead4';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#b8913a';
    ctx.stroke();
    ctx.restore();
    drawJewel(ctx, 0, -92, 12, red ? '#b3121f' : '#1b3a7a');
  }
  ctx.restore();

  // face
  drawFace(ctx, headY, rank);
  if (rank === 'K') drawBeard(ctx, headY);
  else drawFringe(ctx, rank, headY);

  // earrings for the queen
  if (rank === 'Q') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 45, headY + 12);
      ctx.lineTo(s * 45, headY + 26);
      ctx.strokeStyle = '#b8913a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawJewel(ctx, s * 45, headY + 32, 5, '#f4efe0');
    }
  }

  // headgear
  if (rank === 'K') drawCrownK(ctx, headY - 52);
  else if (rank === 'Q') drawTiaraQ(ctx, headY - 48);
  else drawPlumeJ(ctx, P, headY - 48);
}

function drawCourtHalf(ctx, rank, suit) {
  const red = isRed(suit);
  const P = courtPalette(red);
  const ink = red ? RED : BLACK;
  const goldFill = goldGradient(ctx, -190, -440, 190, 0);

  ctx.save();
  ctx.beginPath();
  ctx.rect(-196, -444, 392, 444);
  ctx.clip();

  // cream ground with faint sunburst
  ctx.fillStyle = '#f4edda';
  ctx.fillRect(-196, -444, 392, 444);
  ctx.save();
  ctx.translate(0, 0);
  for (let i = 0; i < 28; i++) {
    const a = Math.PI + (i / 27) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 520, a - 0.035, a + 0.035);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? 'rgba(184,145,58,0.10)' : 'rgba(184,145,58,0.04)';
    ctx.fill();
  }
  ctx.restore();

  // arch window
  const ARCH_R = 104, ARCH_CY = -318;
  const arch = new Path2D();
  arch.moveTo(-ARCH_R, 0);
  arch.lineTo(-ARCH_R, ARCH_CY);
  arch.arc(0, ARCH_CY, ARCH_R, Math.PI, 0, false);
  arch.lineTo(ARCH_R, 0);
  arch.closePath();
  ctx.save();
  ctx.clip(arch);
  const fg = ctx.createRadialGradient(0, -250, 10, 0, -250, 230);
  fg.addColorStop(0, P.field2);
  fg.addColorStop(1, P.field);
  ctx.fillStyle = fg;
  ctx.fillRect(-120, -440, 240, 450);
  // rays behind the head
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU;
    ctx.beginPath();
    ctx.moveTo(0, -250);
    ctx.arc(0, -250, 320, a, a + 0.1);
    ctx.closePath();
    ctx.fillStyle = 'rgba(232,205,130,0.10)';
    ctx.fill();
  }
  // halo rings
  ctx.strokeStyle = 'rgba(232,205,130,0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, -250, 78, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([2, 6]);
  ctx.beginPath();
  ctx.arc(0, -250, 88, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  drawFigure(ctx, rank, red, P);
  ctx.restore();

  // arch outline (double deco line)
  ctx.lineWidth = 4;
  ctx.strokeStyle = goldFill;
  ctx.stroke(arch);
  const arch2 = new Path2D();
  arch2.moveTo(-ARCH_R - 8, 0);
  arch2.lineTo(-ARCH_R - 8, ARCH_CY);
  arch2.arc(0, ARCH_CY, ARCH_R + 8, Math.PI, 0, false);
  arch2.lineTo(ARCH_R + 8, 0);
  ctx.lineWidth = 1.4;
  ctx.stroke(arch2);

  // spandrel ornaments: big letter (left), suit (right)
  ctx.save();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const px = fontForCap(ctx, SERIF_NUM, 'bold', 54);
  ctx.font = `bold ${px}px ${SERIF_NUM}`;
  ctx.fillText(rank, -152, -366);
  ctx.restore();
  drawSuit(ctx, suit, 152, -392, 50, ink);
  for (const s of [-1, 1]) {
    drawDiamondOrnament(ctx, s * 152, -330, 7, '#b8913a');
    drawDiamondOrnament(ctx, s * 152, -306, 4, '#b8913a');
  }
  ctx.restore();
}

// chamfered art-deco frame outline, centred on origin
function courtFramePath(inset) {
  const w = 196 - inset, h = 444 - inset, k = 26 - inset * 0.5;
  const p = new Path2D();
  p.moveTo(-w + k, -h);
  p.lineTo(w - k, -h);
  p.lineTo(w, -h + k);
  p.lineTo(w, h - k);
  p.lineTo(w - k, h);
  p.lineTo(-w + k, h);
  p.lineTo(-w, h - k);
  p.lineTo(-w, -h + k);
  p.closePath();
  return p;
}

function drawCourt(ctx, rank, suit) {
  const cx = CARD_W / 2, cy = CARD_H / 2;
  const red = isRed(suit);
  const ink = red ? RED : BLACK;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.clip(courtFramePath(0));
  drawCourtHalf(ctx, rank, suit);
  ctx.rotate(Math.PI);
  drawCourtHalf(ctx, rank, suit);
  ctx.restore();

  // centre band
  ctx.save();
  ctx.translate(cx, cy);
  const bandG = goldGradient(ctx, -196, 0, 196, 0);
  ctx.fillStyle = '#f4edda';
  ctx.fillRect(-196, -16, 392, 32);
  ctx.fillStyle = bandG;
  ctx.fillRect(-196, -17, 392, 3);
  ctx.fillRect(-196, 14, 392, 3);
  ctx.fillRect(-196, -1, 392, 1.6);
  for (const x of [-150, -110, 110, 150]) drawDiamondOrnament(ctx, x, 0, 6, '#b8913a');
  // medallion
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(40, 0);
  ctx.lineTo(0, 34);
  ctx.lineTo(-40, 0);
  ctx.closePath();
  ctx.fillStyle = '#f7f1e0';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = bandG;
  ctx.stroke();
  drawSuit(ctx, suit, 0, 0, 36, ink);
  ctx.restore();

  // outer frame: chamfered corners, gold double line
  ctx.save();
  ctx.translate(cx, cy);
  const hw = 196, hh = 444;
  const frame = (inset, lw) => {
    ctx.lineWidth = lw;
    ctx.stroke(courtFramePath(inset));
  };
  ctx.strokeStyle = goldGradient(ctx, -hw, -hh, hw, hh);
  frame(-1, 5);
  frame(10, 1.5);
  ctx.restore();
}

const faceCache = new Map();

export function makeCardFaceCanvas(card) {
  const key = `${card.rank}${card.suit}`;
  const cached = faceCache.get(key);
  if (cached) return cached;

  const canvas = makeCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  paperGrain(ctx, CARD_W, CARD_H);

  const { rank, suit } = card;
  const color = isRed(suit) ? RED : BLACK;

  if (rank === 'A') drawAce(ctx, suit, color);
  else if (rank === 'J' || rank === 'Q' || rank === 'K') drawCourt(ctx, rank, suit);
  else drawPips(ctx, rank, suit, color);

  drawIndex(ctx, rank, suit, color);
  // bottom-right index: same index rotated 180deg
  ctx.save();
  ctx.translate(CARD_W, CARD_H);
  ctx.rotate(Math.PI);
  drawIndex(ctx, rank, suit, color);
  ctx.restore();

  faceCache.set(key, canvas);
  return canvas;
}

export function makeCardFaceTexture(card) {
  const tex = new THREE.CanvasTexture(makeCardFaceCanvas(card));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Card back                                                           */
/* ------------------------------------------------------------------ */

function drawBackCorner(ctx, x, y, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const g = goldGradient(ctx, 0, 0, 120, 120);
  ctx.strokeStyle = g;
  ctx.fillStyle = '#0a2c22';
  ctx.beginPath();
  ctx.arc(0, 0, 92, 0, Math.PI / 2);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2.2;
  for (let r = 20; r <= 92; r += 12) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI / 2);
    ctx.stroke();
  }
  ctx.lineWidth = 1.4;
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
    ctx.lineTo(Math.cos(a) * 92, Math.sin(a) * 92);
    ctx.stroke();
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI / 2);
  ctx.lineTo(0, 0);
  ctx.fill();
  ctx.restore();
}

function drawMonogramP(ctx, cx, cy, cap, fill) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const px = fontForCap(ctx, SERIF, 'bold', cap, 'italic');
  ctx.font = `italic bold ${px}px ${SERIF}`;
  ctx.fillStyle = fill;
  ctx.fillText('P', 0, cap / 2);
  ctx.restore();
}

let backCanvas = null;
function getBackCanvas() {
  if (backCanvas) return backCanvas;
  const canvas = makeCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const cx = CARD_W / 2, cy = CARD_H / 2;

  // white margin
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  paperGrain(ctx, CARD_W, CARD_H);

  const M = 36;
  const fieldPath = new Path2D();
  fieldPath.roundRect(M, M, CARD_W - 2 * M, CARD_H - 2 * M, 22);
  ctx.save();
  ctx.clip(fieldPath);
  const bg = ctx.createRadialGradient(cx, cy, 20, cx, cy, 640);
  bg.addColorStop(0, '#0f5340');
  bg.addColorStop(0.55, '#0b3d2e');
  bg.addColorStop(1, '#04150f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // interlocking-circle lattice (grid node at centre -> point-symmetric)
  const s = 64;
  const gold = goldGradientSym(ctx, 0, 0, CARD_W, CARD_H);
  ctx.save();
  const inner = new Path2D();
  inner.rect(M + 40, M + 40, CARD_W - 2 * (M + 40), CARD_H - 2 * (M + 40));
  ctx.clip(inner);
  ctx.strokeStyle = 'rgba(207,168,78,0.55)';
  ctx.lineWidth = 1.3;
  for (let i = -8; i <= 8; i++) {
    for (let j = -10; j <= 10; j++) {
      const x = cx + i * s, y = cy + j * s;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.7071, 0, TAU);
      ctx.stroke();
    }
  }
  // dots, tiny stars
  for (let i = -8; i <= 8; i++) {
    for (let j = -10; j <= 10; j++) {
      const x = cx + i * s, y = cy + j * s;
      ctx.fillStyle = 'rgba(232,205,130,0.85)';
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, 3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(207,168,78,0.75)';
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x + 4, y);
      ctx.lineTo(x, y + 7);
      ctx.lineTo(x - 4, y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  // borders
  ctx.strokeStyle = gold;
  ctx.lineWidth = 5;
  const b1 = new Path2D();
  b1.roundRect(M + 16, M + 16, CARD_W - 2 * (M + 16), CARD_H - 2 * (M + 16), 10);
  ctx.stroke(b1);
  ctx.lineWidth = 1.6;
  const b2 = new Path2D();
  b2.roundRect(M + 28, M + 28, CARD_W - 2 * (M + 28), CARD_H - 2 * (M + 28), 6);
  ctx.stroke(b2);
  ctx.lineWidth = 1.6;
  const b3 = new Path2D();
  b3.rect(M + 40, M + 40, CARD_W - 2 * (M + 40), CARD_H - 2 * (M + 40));
  ctx.stroke(b3);

  // corner fans
  const ci = M + 40;
  drawBackCorner(ctx, ci, ci, 0);
  drawBackCorner(ctx, CARD_W - ci, ci, Math.PI / 2);
  drawBackCorner(ctx, CARD_W - ci, CARD_H - ci, Math.PI);
  drawBackCorner(ctx, ci, CARD_H - ci, -Math.PI / 2);

  // central medallion
  const R = 188;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 24, 0, TAU);
  ctx.fillStyle = '#05140f';
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 4;
  ctx.strokeStyle = gold;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 24, 0, TAU);
  ctx.stroke();
  // sunburst teeth
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a - 0.04) * (R + 4), cy + Math.sin(a - 0.04) * (R + 4));
    ctx.lineTo(cx + Math.cos(a) * (R + 22), cy + Math.sin(a) * (R + 22));
    ctx.lineTo(cx + Math.cos(a + 0.04) * (R + 4), cy + Math.sin(a + 0.04) * (R + 4));
    ctx.closePath();
    ctx.fillStyle = gold;
    ctx.fill();
  }
  const mg = ctx.createRadialGradient(cx, cy, 10, cx, cy, R);
  mg.addColorStop(0, '#126147');
  mg.addColorStop(1, '#082a1f');
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fillStyle = mg;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, R - 12, 0, TAU);
  ctx.stroke();
  // bead ring
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (R - 26), cy + Math.sin(a) * (R - 26), 3.4, 0, TAU);
    ctx.fillStyle = '#e4c677';
    ctx.fill();
  }
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, R - 40, 0, TAU);
  ctx.stroke();
  // inner rays
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 62, cy + Math.sin(a) * 62);
    ctx.lineTo(cx + Math.cos(a) * (R - 44), cy + Math.sin(a) * (R - 44));
    ctx.strokeStyle = 'rgba(207,168,78,0.4)';
    ctx.lineWidth = i % 2 ? 1 : 2;
    ctx.stroke();
  }
  // double monogram (P and rotated P => point-symmetric)
  ctx.beginPath();
  ctx.arc(cx, cy, 108, 0, TAU);
  ctx.fillStyle = '#06201a';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = gold;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 106, 0, TAU);
  ctx.clip();
  const pg = goldGradient(ctx, cx - 60, cy - 100, cx + 60, cy);
  drawMonogramP(ctx, cx, cy - 52, 82, pg);
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI);
  ctx.translate(-cx, -cy);
  drawMonogramP(ctx, cx, cy - 52, 82, pg);
  ctx.restore();
  ctx.fillStyle = gold;
  ctx.fillRect(cx - 86, cy - 1, 172, 2.4);
  drawDiamondOrnament(ctx, cx, cy, 9, '#e4c677');

  ctx.restore(); // field clip

  // field outline hairline
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke(fieldPath);

  backCanvas = canvas;
  return canvas;
}

export function makeCardBackTexture() {
  const tex = new THREE.CanvasTexture(getBackCanvas());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

const CHIP_CONFIG = {
  100: { base: '#161616', insert: '#f3efe4', ink: '#161616', label: '100', n: 8 },
  500: { base: '#5b2a86', insert: '#efe9f5', ink: '#3b1860', label: '500', n: 8 },
  1000: { base: '#e0b526', insert: '#2b2410', ink: '#3a2c06', label: '1K', n: 6 },
  5000: { base: '#c2561c', insert: '#f6e6d0', ink: '#6a2a0a', label: '5K', n: 6 },
  25000: { base: '#0f6b4a', insert: '#f1ece0', ink: '#073b29', label: '25K', n: 8 },
};

// insert layout shared by face + edge
const INSERT_TANGENT = 80; // px, tangential size on the face
const INSERT_R0 = 196;
const INSERT_R1 = 252;

const chipCache = new Map();

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function makeChipFace(cfg, seed) {
  const S = 512, c = S / 2;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = cfg.base;
  ctx.fillRect(0, 0, S, S);
  // gentle shading to give the clay body some depth
  const sg = ctx.createRadialGradient(c - 60, c - 70, 20, c, c, 270);
  sg.addColorStop(0, 'rgba(255,255,255,0.10)');
  sg.addColorStop(0.7, 'rgba(0,0,0,0)');
  sg.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, S, S);

  const light = cfg.insert;
  // outer rim lines
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(c, c, 249, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(c, c, 253, 0, TAU);
  ctx.stroke();

  // inserts
  const r = rng(seed);
  for (let i = 0; i < cfg.n; i++) {
    const a = (i / cfg.n) * TAU;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    // rectangle: radial along +x
    const len = INSERT_R1 - INSERT_R0;
    ctx.beginPath();
    ctx.rect(INSERT_R0, -INSERT_TANGENT / 2, len, INSERT_TANGENT);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = light;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = light;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.stroke();
    // inner thin rule + speckle
    ctx.strokeStyle = shade(cfg.base, 0);
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.strokeRect(INSERT_R0 + 7, -INSERT_TANGENT / 2 + 7, len - 14, INSERT_TANGENT - 14);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let k = 0; k < 40; k++) {
      ctx.fillRect(INSERT_R0 + r() * len, (r() - 0.5) * INSERT_TANGENT, 1.6, 1.6);
    }
    ctx.restore();
  }
  // dark ring that frames the inserts on the inner side
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(c, c, INSERT_R0 - 2, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = light;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(c, c, INSERT_R0 - 8, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // printed ring: fine dashes
  ctx.strokeStyle = light;
  ctx.lineWidth = 3;
  const dashes = 96;
  for (let i = 0; i < dashes; i++) {
    const a = (i / dashes) * TAU;
    const r0 = 150, r1 = i % 4 === 0 ? 176 : 166;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c, c, 182, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, 144, 0, TAU);
  ctx.stroke();

  // central inlay disc
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(c, c, 130, 0, TAU);
  ctx.fillStyle = '#f2ead3';
  ctx.fill();
  ctx.restore();
  const ig = ctx.createRadialGradient(c - 30, c - 40, 10, c, c, 130);
  ig.addColorStop(0, '#fcf7e8');
  ig.addColorStop(0.75, '#efe5c8');
  ig.addColorStop(1, '#d9ccA6');
  ctx.beginPath();
  ctx.arc(c, c, 130, 0, TAU);
  ctx.fillStyle = ig;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = goldGradient(ctx, c - 130, c - 130, c + 130, c + 130);
  ctx.beginPath();
  ctx.arc(c, c, 126, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(138,104,33,0.8)';
  ctx.beginPath();
  ctx.arc(c, c, 116, 0, TAU);
  ctx.stroke();

  // value
  ctx.fillStyle = cfg.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let cap = cfg.label.length === 2 ? 84 : 70;
  let px = fontForCap(ctx, SERIF_NUM, 'bold', cap);
  ctx.font = `bold ${px}px ${SERIF_NUM}`;
  const maxW = 190;
  const w = ctx.measureText(cfg.label).width;
  if (w > maxW) {
    px *= maxW / w;
    ctx.font = `bold ${px}px ${SERIF_NUM}`;
    cap *= maxW / w;
  }
  ctx.fillText(cfg.label, c, c + cap / 2 + 8);

  // curved caption
  ctx.font = `bold 19px ${SANS}`;
  ctx.fillStyle = shade(cfg.ink, 20);
  arcText(ctx, 'PENTHOUSE', c, c, 94, -Math.PI / 2, 5.5);
  drawDiamondOrnament(ctx, c - 22, c + 92, 4.5, '#8a6821');
  drawDiamondOrnament(ctx, c, c + 92, 5.5, '#8a6821');
  drawDiamondOrnament(ctx, c + 22, c + 92, 4.5, '#8a6821');

  addNoise(ctx, S, S, 14, seed + 1);
  // clay speckles
  const rr = rng(seed + 2);
  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = rr() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(rr() * S, rr() * S, 1 + rr() * 1.5, 1 + rr() * 1.5);
  }
  return canvas;
}

function makeChipEdge(cfg, seed) {
  const W = 1024, H = 64;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = cfg.base;
  ctx.fillRect(0, 0, W, H);
  const eg = ctx.createLinearGradient(0, 0, 0, H);
  eg.addColorStop(0, 'rgba(255,255,255,0.12)');
  eg.addColorStop(0.5, 'rgba(0,0,0,0)');
  eg.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = eg;
  ctx.fillRect(0, 0, W, H);

  // face insert covers ~INSERT_TANGENT px at mid-radius ~224 => angular width
  const wFrac = INSERT_TANGENT / (TAU * 224);
  const insW = Math.round(wFrac * W * 1.15);
  const r = rng(seed);
  for (let i = 0; i < cfg.n; i++) {
    const x = (i / cfg.n) * W;
    const draw = (xx) => {
      ctx.fillStyle = cfg.insert;
      ctx.fillRect(xx - insW / 2, 5, insW, H - 10);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(xx - insW / 2, 5, insW, H - 10);
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      for (let k = 0; k < 24; k++) ctx.fillRect(xx - insW / 2 + r() * insW, 5 + r() * (H - 10), 1.6, 1.6);
    };
    draw(x);
    if (i === 0) draw(W); // wrap seam
  }
  // thin rims
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, W, 2);
  ctx.fillRect(0, H - 2, W, 2);
  addNoise(ctx, W, H, 16, seed + 3);
  return canvas;
}

export function makeChipTextures(denom) {
  const cached = chipCache.get(denom);
  if (cached) return cached;
  const cfg = CHIP_CONFIG[denom] || { ...CHIP_CONFIG[100], label: String(denom) };
  const seed = 1000 + (Number(denom) % 9973);

  const face = new THREE.CanvasTexture(makeChipFace(cfg, seed));
  face.colorSpace = THREE.SRGBColorSpace;
  face.generateMipmaps = true;
  face.minFilter = THREE.LinearMipmapLinearFilter;

  const edge = new THREE.CanvasTexture(makeChipEdge(cfg, seed));
  edge.colorSpace = THREE.SRGBColorSpace;
  edge.wrapS = THREE.RepeatWrapping;
  edge.generateMipmaps = true;
  edge.minFilter = THREE.LinearMipmapLinearFilter;

  const out = { face, edge };
  chipCache.set(denom, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* Felt maps                                                           */
/* ------------------------------------------------------------------ */

const FELT = 256;

function makeFeltHeight() {
  const n = FELT;
  const h = new Float32Array(n * n);
  const r = rng(4242);
  const add = (x, y, v) => {
    const xi = ((Math.round(x) % n) + n) % n;
    const yi = ((Math.round(y) % n) + n) % n;
    h[yi * n + xi] += v;
  };
  // random short curved fibres, wrapped for seamless tiling
  for (let f = 0; f < 5200; f++) {
    let x = r() * n, y = r() * n;
    let a = r() * TAU;
    const len = 5 + r() * 12;
    const curv = (r() - 0.5) * 0.35;
    const amp = 0.5 + r() * 0.8;
    for (let t = 0; t < len; t += 0.7) {
      const taper = Math.sin((t / len) * Math.PI);
      const v = amp * taper;
      add(x, y, v);
      add(x + 1, y, v * 0.45);
      add(x - 1, y, v * 0.45);
      add(x, y + 1, v * 0.45);
      add(x, y - 1, v * 0.45);
      x += Math.cos(a) * 0.7;
      y += Math.sin(a) * 0.7;
      a += curv * 0.7;
    }
  }
  // fine per-pixel noise
  for (let i = 0; i < h.length; i++) h[i] += r() * 0.5;
  // light box blur (wrapped)
  const tmp = new Float32Array(h.length);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          s += h[((y + dy + n) % n) * n + ((x + dx + n) % n)] * (dx === 0 && dy === 0 ? 2 : 1);
        }
      }
      tmp[y * n + x] = s / 10;
    }
  }
  return tmp;
}

let feltNormalCanvas = null;
function getFeltNormalCanvas() {
  if (feltNormalCanvas) return feltNormalCanvas;
  const n = FELT;
  const h = makeFeltHeight();
  const canvas = makeCanvas(n, n);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(n, n);
  const at = (x, y) => h[((y + n) % n) * n + ((x + n) % n)];
  const strength = 1.1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const gx =
        -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      // image y runs down; tangent-space +Y is up => ny = +gy (see derivation: v = 1 - y)
      let nx = -gx * strength * 0.25;
      let ny = gy * strength * 0.25;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * n + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  feltNormalCanvas = canvas;
  return canvas;
}

export function makeFeltNormalTexture() {
  const tex = new THREE.CanvasTexture(getFeltNormalCanvas());
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function makeFeltNoiseTexture() {
  const n = FELT;
  const canvas = makeCanvas(n, n);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(n, n);
  const r = rng(9091);
  // wrapped value noise on a coarse lattice, two octaves
  const lattice = (g) => {
    const a = new Float32Array(g * g);
    for (let i = 0; i < a.length; i++) a[i] = r();
    return (u, v) => {
      const x = u * g, y = v * g;
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = x - x0, fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const p = (i, j) => a[(((j % g) + g) % g) * g + (((i % g) + g) % g)];
      const top = p(x0, y0) * (1 - sx) + p(x0 + 1, y0) * sx;
      const bot = p(x0, y0 + 1) * (1 - sx) + p(x0 + 1, y0 + 1) * sx;
      return top * (1 - sy) + bot * sy;
    };
  };
  const o1 = lattice(8), o2 = lattice(32);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n;
      let val = 0.88 + (o1(u, v) - 0.5) * 0.12 + (o2(u, v) - 0.5) * 0.08 + (r() - 0.5) * 0.08;
      val = Math.max(0.78, Math.min(1, val));
      const g = Math.round(val * 255);
      const i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
