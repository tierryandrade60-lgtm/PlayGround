import * as THREE from 'three';
const TAU = Math.PI * 2;
function makeRng(seed) {
  let a = seed >>> 0; return () => {a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hsla(h, s, l, a = 1) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}
function canvasOf(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function textureOf(c, srgb = true, extra) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (extra) Object.assign(t, extra); t.needsUpdate = true; return t;
}
function offsets(p, r, n) {
  const out = [0]; if (p - r < 0) out.push(n); if (p + r > n) out.push(-n); return out;
}
function trace(ctx, pts, close = true) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}
function pointBounds(pts, pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) {x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
function tileDraw(ctx, w, h, box, draw) {
  const xs = offsets((box[0] + box[2]) / 2, (box[2] - box[0]) / 2, w); const ys = offsets((box[1] + box[3]) / 2, (box[3] - box[1]) / 2, h);
  for (const x of xs) for (const y of ys) {ctx.save(); ctx.translate(x, y); draw(); ctx.restore();
  }
}
function tileEllipse(ctx, w, h, x, y, rx, ry, fill) {
  ctx.fillStyle = fill; for (const ox of offsets(x, rx, w)) for (const oy of offsets(y, ry, h)) {ctx.beginPath();
    ctx.ellipse(x + ox, y + oy, rx, ry, 0, 0, TAU); ctx.fill();
  }
}
function tileRect(ctx, w, h, x, y, rw, rh, fill) {
  ctx.fillStyle = fill; for (const ox of offsets(x + rw / 2, rw / 2, w)) for (const oy of offsets(y + rh / 2, rh / 2, h)) ctx.fillRect(x + ox, y + oy, rw, rh);
}
function tileLine(ctx, w, h, x1, y1, x2, y2, width, color) {
  ctx.strokeStyle = color; ctx.lineWidth = width; const box = [Math.min(x1, x2) - width, Math.min(y1, y2) - width, Math.max(x1, x2) + width, Math.max(y1, y2) + width];
  tileDraw(ctx, w, h, box, () => {ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });
}
export function asphaltTexture() {
  const w = 512, h = 512, c = canvasOf(w, h), ctx = c.getContext('2d'), r = makeRng(0x91a57); ctx.fillStyle = '#232527';
  ctx.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) {const v = 22 + Math.floor(r() * 35); tileEllipse(ctx, w, h, r() * w, r() * h, 18 + r() * 95, 12 + r() * 68, `rgba(${v},${v + 1},${v + 2},${0.02 + r() * 0.05})`);
  }
  for (let i = 0; i < 22; i++) {const x = r() * w, y = r() * h, rx = 24 + r() * 76, ry = 11 + r() * 46, n = 8 + Math.floor(r() * 7), pts = [];
    for (let j = 0; j < n; j++) {const a = (j / n) * TAU, q = 0.68 + r() * 0.58; pts.push([x + Math.cos(a) * rx * q, y + Math.sin(a) * ry * q]);
    }
    ctx.fillStyle = `rgba(10,11,12,${0.16 + r() * 0.19})`; tileDraw(ctx, w, h, pointBounds(pts, 3), () => {trace(ctx, pts); ctx.fill();
    });
  }
  for (let i = 0; i < 7600; i++) {const v = 46 + Math.floor(r() * 116), warm = Math.floor(r() * 11) - 5; tileEllipse(ctx, w, h, r() * w, r() * h, 0.35 + r() * 1.35, 0.3 + r() * 1.15, `rgba(${v + warm},${v},${Math.max(18, v - warm)},${0.11 + r() * 0.34})`);
  }
  for (let i = 0; i < 2300; i++) {const v = 8 + Math.floor(r() * 30); tileEllipse(ctx, w, h, r() * w, r() * h, 0.25 + r() * 0.7, 0.25 + r() * 0.65, `rgba(${v},${v},${v},${0.15 + r() * 0.35})`);
  }
  for (let i = 0; i < 25; i++) {let x = r() * w, y = r() * h, a = r() * TAU; const pts = [[x, y]], steps = 7 + Math.floor(r() * 13);
    for (let j = 0; j < steps; j++) {a += (r() - 0.5) * 0.95; const len = 3 + r() * 13; x += Math.cos(a) * len;
      y += Math.sin(a) * len; pts.push([x, y]);
    }
    ctx.strokeStyle = `rgba(7,8,9,${0.42 + r() * 0.34})`; ctx.lineWidth = 0.45 + r() * 1.05; tileDraw(ctx, w, h, pointBounds(pts, 4), () => {
      trace(ctx, pts, false); ctx.stroke();
    });
  }
  ctx.fillStyle = 'rgba(172,166,144,0.19)'; ctx.fillRect(0, 366, w, 12); ctx.fillStyle = 'rgba(205,194,157,0.09)';
  ctx.fillRect(0, 369, w, 3); for (let i = 0; i < 230; i++) {const x = r() * w, y = 360 + r() * 24, rw = 0.8 + r() * 10, rh = 0.8 + r() * 7;
    tileRect(ctx, w, h, x, y, rw, rh, `rgba(32,34,35,${0.28 + r() * 0.45})`);
  }
  for (let i = 0; i < 70; i++) {const warm = r() < 0.35; tileEllipse(ctx, w, h, r() * w, 360 + r() * 25, 0.5 + r() * 2.5, 0.4 + r() * 1.5, warm ? `rgba(190,165,84,${0.12 + r() * 0.25})` : `rgba(190,188,174,${0.12 + r() * 0.3})`);
  }
  for (let i = 0; i < 50; i++) tileEllipse(ctx, w, h, r() * w, r() * h, 8 + r() * 52, 0.8 + r() * 4, 'rgba(130,145,150,0.015)');
  return textureOf(c);
}
export function concreteTexture() {
  const w = 512, h = 512, c = canvasOf(w, h), ctx = c.getContext('2d'), r = makeRng(0xc0c4e7e); ctx.fillStyle = '#77746b';
  ctx.fillRect(0, 0, w, h); for (let i = 0; i < 130; i++) {const warm = r() < 0.35, v = 78 + Math.floor(r() * 52);
    tileEllipse(ctx, w, h, r() * w, r() * h, 16 + r() * 92, 12 + r() * 70, warm ? `rgba(${v + 18},${v + 6},${v - 8},${0.035 + r() * 0.06})` : `rgba(${v},${v},${v - 3},${0.03 + r() * 0.06})`);
  }
  for (let i = 0; i < 5200; i++) {const v = 66 + Math.floor(r() * 92); tileEllipse(ctx, w, h, r() * w, r() * h, 0.35 + r() * 1.2, 0.3 + r(), `rgba(${v},${v - 1},${v - 4},${0.04 + r() * 0.15})`);
  }
  for (let i = 0; i < 1900; i++) {const v = 32 + Math.floor(r() * 44); tileEllipse(ctx, w, h, r() * w, r() * h, 0.3 + r() * 0.9, 0.3 + r() * 0.9, `rgba(${v},${v - 2},${v - 4},${0.25 + r() * 0.5})`);
  }
  for (let i = 0; i < 110; i++) {const v = 58 + Math.floor(r() * 26), x = r() * w, y = r() * h, rr = 1.2 + r() * 3.5;
    tileEllipse(ctx, w, h, x, y, rr, rr * 0.8, `rgba(${v},${v - 2},${v - 5},0.6)`); tileEllipse(ctx, w, h, x - rr * 0.3, y - rr * 0.35, rr * 0.35, rr * 0.25, 'rgba(190,186,174,0.28)');
  }
  for (let i = 0; i < 34; i++) {const x = r() * w, y = r() * h, rr = 3 + r() * 12, n = 5 + Math.floor(r() * 4), pts = [];
    for (let j = 0; j < n; j++) {const a = (j / n) * TAU, q = 0.55 + r() * 0.7; pts.push([x + Math.cos(a) * rr * q, y + Math.sin(a) * rr * q]);
    }
    ctx.fillStyle = `rgba(65,62,56,${0.22 + r() * 0.28})`; ctx.strokeStyle = 'rgba(176,171,156,0.26)'; ctx.lineWidth = 1;
    tileDraw(ctx, w, h, pointBounds(pts, 2), () => {trace(ctx, pts); ctx.fill(); ctx.stroke();
    });
  }
  for (let i = 0; i < 24; i++) {let x = r() * w, y = r() * h, a = r() * TAU; const pts = [[x, y]], steps = 8 + Math.floor(r() * 15);
    for (let j = 0; j < steps; j++) {a += (r() - 0.5) * 0.75; const len = 3 + r() * 12; x += Math.cos(a) * len;
      y += Math.sin(a) * len; pts.push([x, y]);
    }
    ctx.strokeStyle = `rgba(47,46,42,${0.28 + r() * 0.3})`; ctx.lineWidth = 0.45 + r() * 0.75; tileDraw(ctx, w, h, pointBounds(pts, 3), () => {
      trace(ctx, pts, false); ctx.stroke();
    });
  }
  for (let i = 0; i < 34; i++) {const brown = r() < 0.5; tileEllipse(ctx, w, h, r() * w, r() * h, 3 + r() * 22, 18 + r() * 105, brown ? `rgba(91,72,48,${0.018 + r() * 0.04})` : `rgba(55,58,57,${0.02 + r() * 0.045})`);
  }
  for (let i = 0; i < 20; i++) tileRect(ctx, w, h, r() * w, r() * h, 0.5 + r() * 1.2, 20 + r() * 95, `rgba(63,55,42,${0.03 + r() * 0.05})`);
  for (let i = 0; i < 7; i++) {const x = r() * w, y = r() * h, rr = 3.5 + r() * 2.5; ctx.strokeStyle = 'rgba(55,52,46,0.45)';
    ctx.lineWidth = 2; tileDraw(ctx, w, h, [x - rr, y - rr, x + rr, y + rr], () => {ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
    }); tileEllipse(ctx, w, h, x, y, rr * 0.7, rr * 0.7, 'rgba(43,41,37,0.62)'); tileEllipse(ctx, w, h, x - 1, y - 1, rr * 0.22, rr * 0.22, 'rgba(161,155,141,0.22)');
  }
  return textureOf(c);
}
export function metalTexture() {
  const w = 512, h = 512, c = canvasOf(w, h), ctx = c.getContext('2d'), r = makeRng(0x4e7a1); ctx.fillStyle = '#4e585b';
  ctx.fillRect(0, 0, w, h); for (let i = 0; i < 110; i++) {const light = r() < 0.5, v = 55 + Math.floor(r() * 55);
    tileEllipse(ctx, w, h, r() * w, r() * h, 12 + r() * 90, 8 + r() * 58, light ? `rgba(${v + 15},${v + 20},${v + 20},${0.03 + r() * 0.06})` : `rgba(${v - 20},${v - 18},${v - 16},${0.035 + r() * 0.06})`);
  }
  for (let i = 0; i < 2100; i++) {const v = 30 + Math.floor(r() * 105); tileEllipse(ctx, w, h, r() * w, r() * h, 0.3 + r() * 1.05, 0.3 + r() * 0.95, `rgba(${v},${v + 3},${v + 4},${0.05 + r() * 0.19})`);
  }
  for (let i = 0; i < 75; i++) tileEllipse(ctx, w, h, r() * w, r() * h, 1 + r() * 5, 20 + r() * 100, `rgba(${40 + Math.floor(r() * 25)},${43 + Math.floor(r() * 25)},${43 + Math.floor(r() * 25)},${0.025 + r() * 0.06})`);
  for (let i = 0; i < 180; i++) {const x = r() * w, y = r() * h, len = 3 + r() * 28, a = -0.25 + r() * 2.1, light = r() < 0.55;
    tileLine(ctx, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.35 + r() * 1.1, light ? `rgba(180,190,190,${0.06 + r() * 0.18})` : `rgba(17,20,21,${0.08 + r() * 0.22})`);
  }
  for (const sx of [0, 256]) {tileRect(ctx, w, h, sx - 1, 0, 2, h, 'rgba(18,22,23,0.78)'); tileRect(ctx, w, h, sx + 1.2, 0, 1, h, 'rgba(157,166,166,0.18)');
    for (let y = 10; y < h; y += 27) {const rr = 2.1 + r() * 0.5; tileEllipse(ctx, w, h, sx, y + r() * 2, rr, rr, 'rgba(21,25,26,0.88)');
      tileEllipse(ctx, w, h, sx - 0.35, y - 0.45, rr * 0.68, rr * 0.68, 'rgba(115,124,125,0.72)'); tileEllipse(ctx, w, h, sx - 0.7, y - 0.9, rr * 0.24, rr * 0.24, 'rgba(210,216,214,0.34)');
    }
  }
  for (const sy of [0, 256]) {tileRect(ctx, w, h, 0, sy - 1, w, 2, 'rgba(18,22,23,0.7)'); tileRect(ctx, w, h, 0, sy + 1.1, w, 1, 'rgba(157,166,166,0.14)');
  }
  for (let i = 0; i < 130; i++) tileEllipse(ctx, w, h, r() * w, r() * h, 0.5 + r() * 2.8, 0.4 + r() * 2.4, `rgba(${100 + Math.floor(r() * 75)},${43 + Math.floor(r() * 35)},${18 + Math.floor(r() * 20)},${0.10 + r() * 0.28})`);
  return textureOf(c);
}
export function crateTexture() {
  const w = 512, h = 512, c = canvasOf(w, h), ctx = c.getContext('2d'), r = makeRng(0xc4a7e); ctx.fillStyle = '#39412b';
  ctx.fillRect(0, 0, w, h); for (let i = 0; i < 95; i++) {const light = r() < 0.5; tileEllipse(ctx, w, h, r() * w, r() * h, 20 + r() * 100, 12 + r() * 72, light ? `rgba(86,94,61,${0.03 + r() * 0.06})` : `rgba(25,31,19,${0.03 + r() * 0.07})`);
  }
  for (let i = 0; i < 130; i++) {const y = r() * h, amp = 0.4 + r() * 2.2, ph = r() * TAU; ctx.strokeStyle = r() < 0.5 ? `rgba(19,25,14,${0.08 + r() * 0.13})` : `rgba(109,116,76,${0.04 + r() * 0.08})`;
    ctx.lineWidth = 0.5 + r() * 1.2; ctx.beginPath(); for (let x = 0; x <= w; x += 16) {const yy = y + Math.sin((x / w) * TAU * 2 + ph) * amp;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.save(); ctx.fillStyle = 'rgba(185,181,139,0.55)'; ctx.font = '700 40px monospace'; ctx.fillText('7.62 MM', 48, 116);
  ctx.font = '700 18px monospace'; ctx.fillText('AMMUNITION', 50, 144); ctx.font = '700 27px monospace'; ctx.fillText('LOT 04-77', 50, 412);
  ctx.fillText('N.W. 12 KG', 50, 447); ctx.strokeStyle = 'rgba(185,181,139,0.48)'; ctx.lineWidth = 3; ctx.beginPath();
  ctx.moveTo(430, 102); ctx.lineTo(430, 138); ctx.moveTo(418, 118); ctx.lineTo(430, 102); ctx.lineTo(442, 118);
  ctx.stroke(); ctx.font = '700 13px monospace'; ctx.fillText('THIS SIDE UP', 388, 158); ctx.restore(); for (let i = 0; i < 170; i++) {
    const x = r() * w, y = r() * h, len = 2 + r() * 24, a = r() * TAU; tileLine(ctx, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.4 + r() * 1.7, r() < 0.55 ? `rgba(15,20,11,${0.12 + r() * 0.26})` : `rgba(128,133,93,${0.08 + r() * 0.2})`);
  }
  for (let i = 0; i < 28; i++) tileEllipse(ctx, w, h, r() * w, r() * h, 2 + r() * 18, 0.8 + r() * 5, `rgba(20,16,10,${0.04 + r() * 0.11})`);
  const plate = (x, y, sx, sy) => {ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy); ctx.fillStyle = 'rgba(48,54,46,0.88)';
    ctx.fillRect(9, 9, 92, 17); ctx.fillRect(9, 9, 17, 92); ctx.strokeStyle = 'rgba(139,145,126,0.28)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(9, 9, 92, 17); ctx.strokeRect(9, 9, 17, 92); ctx.fillStyle = 'rgba(20,23,19,0.82)'; for (const p of [24, 50, 76]) {
      ctx.beginPath(); ctx.arc(p, 17.5, 2.6, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(17.5, p, 2.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }; plate(0, 0, 1, 1); plate(w, 0, -1, 1); plate(0, h, 1, -1); plate(w, h, -1, -1); return textureOf(c);
}
export function containerTexture(hue = 20) {
  const w = 1024, h = 512, c = canvasOf(w, h), ctx = c.getContext('2d'), r = makeRng(0xc07a1e); const H = Number.isFinite(Number(hue)) ? ((Number(hue) % 360) + 360) % 360 : 20, rib = 32;
  for (let x = 0; x < w; x += rib) {const g = ctx.createLinearGradient(x, 0, x + rib, 0); g.addColorStop(0, hsla(H, 36, 21));
    g.addColorStop(0.18, hsla(H, 38, 30)); g.addColorStop(0.5, hsla(H, 35, 47)); g.addColorStop(0.82, hsla(H, 37, 31));
    g.addColorStop(1, hsla(H, 36, 21)); ctx.fillStyle = g; ctx.fillRect(x, 0, rib, h);
  }
  for (let i = 0; i < 95; i++) {const light = r() < 0.62; tileEllipse(ctx, w, h, r() * w, r() * h, 28 + r() * 180, 14 + r() * 78, light ? hsla(H, 12 + r() * 18, 52 + r() * 18, 0.02 + r() * 0.045) : hsla(H, 22 + r() * 20, 16 + r() * 15, 0.02 + r() * 0.04));
  }
  for (let i = 0; i < 130; i++) {const x = r() * w, y = 8 + r() * h * 0.72, len = 24 + r() * 260, ww = 0.8 + r() * 5.5;
    tileEllipse(ctx, w, h, x, y + len / 2, ww, len / 2, `rgba(${92 + Math.floor(r() * 55)},${36 + Math.floor(r() * 28)},${13 + Math.floor(r() * 17)},${0.035 + r() * 0.11})`);
    if (r() < 0.35) tileRect(ctx, w, h, x, y, 0.6 + r() * 1.6, len * (0.4 + r() * 0.6), `rgba(${72 + Math.floor(r() * 40)},${27 + Math.floor(r() * 20)},${10 + Math.floor(r() * 12)},${0.12 + r() * 0.14})`);
  }
  for (let i = 0; i < 720; i++) {const x = r() * w, y = r() * h, rr = 0.5 + r() * 3.6; tileEllipse(ctx, w, h, x, y, rr, rr * (0.45 + r() * 1.2), `rgba(${88 + Math.floor(r() * 55)},${34 + Math.floor(r() * 27)},${11 + Math.floor(r() * 13)},${0.08 + r() * 0.23})`);
  }
  for (let i = 0; i < 85; i++) {const x = r() * w, y = r() * h, len = 2 + r() * 32, a = -0.2 + r() * 2; tileLine(ctx, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.35 + r(), r() < 0.5 ? `rgba(210,208,191,${0.05 + r() * 0.14})` : `rgba(30,20,14,${0.08 + r() * 0.16})`);
  }
  for (const y of [0, h - 19]) {const g = ctx.createLinearGradient(0, y, 0, y + 19); g.addColorStop(0, hsla(H, 30, 16));
    g.addColorStop(0.35, hsla(H, 34, 35)); g.addColorStop(0.62, hsla(H, 31, 24)); g.addColorStop(1, hsla(H, 30, 13));
    ctx.fillStyle = g; ctx.fillRect(0, y, w, 19); for (let x = 16; x < w; x += 64) {tileEllipse(ctx, w, h, x, y + 9.5, 2.6, 2.6, 'rgba(20,18,13,0.55)');
      tileEllipse(ctx, w, h, x - 0.5, y + 8.8, 1.2, 1.2, hsla(H, 18, 62, 0.32));
    }
  }
  for (let i = 0; i < 260; i++) {const x = r() * w, y = h * (0.76 + r() * 0.24), rr = 0.8 + r() * 4; tileEllipse(ctx, w, h, x, y, rr, rr * 0.6, `rgba(${92 + Math.floor(r() * 50)},${39 + Math.floor(r() * 25)},${12 + Math.floor(r() * 15)},${0.08 + r() * 0.2})`);
  }
  return textureOf(c);
}
export function sandbagTexture() {
  const w = 512, h = 512, c = canvasOf(w, h), ctx = c.getContext('2d'), r = makeRng(0x5a4d8a); ctx.fillStyle = '#8d7956';
  ctx.fillRect(0, 0, w, h); for (let i = 0; i < 80; i++) {const light = r() < 0.5; tileEllipse(ctx, w, h, r() * w, r() * h, 18 + r() * 90, 12 + r() * 64, light ? `rgba(170,151,111,${0.03 + r() * 0.06})` : `rgba(82,67,43,${0.03 + r() * 0.07})`);
  }
  for (let y = 0; y < h; y += 5) {const ph = r() * TAU, dark = r() < 0.6; ctx.strokeStyle = dark ? `rgba(72,58,37,${0.25 + r() * 0.28})` : `rgba(183,162,119,${0.18 + r() * 0.25})`;
    ctx.lineWidth = 2.2 + r() * 1.2; ctx.beginPath(); for (let x = -8; x <= w + 8; x += 12) {const yy = y + Math.sin((x / w) * TAU * 8 + ph) * 0.65;
      if (x === -8) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke(); ctx.strokeStyle = 'rgba(35,28,18,0.16)'; ctx.lineWidth = 0.7; ctx.beginPath(); for (let x = -8; x <= w + 8; x += 12) {
      const yy = y + 2.8 + Math.sin((x / w) * TAU * 8 + ph) * 0.65; if (x === -8) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  for (let x = 0; x < w; x += 5) {const ph = r() * TAU, dark = r() < 0.55; ctx.strokeStyle = dark ? `rgba(68,54,34,${0.18 + r() * 0.26})` : `rgba(190,168,124,${0.14 + r() * 0.23})`;
    ctx.lineWidth = 2 + r() * 1.2; ctx.beginPath(); for (let y = -8; y <= h + 8; y += 12) {const xx = x + Math.sin((y / h) * TAU * 8 + ph) * 0.6;
      if (y === -8) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 2800; i++) {const x = r() * w, y = r() * h, light = r() < 0.5; tileRect(ctx, w, h, x, y, 1 + r() * 5, 0.6 + r() * 1.4, light ? `rgba(186,164,119,${0.12 + r() * 0.25})` : `rgba(66,52,31,${0.1 + r() * 0.25})`);
  }
  for (let i = 0; i < 55; i++) tileEllipse(ctx, w, h, r() * w, r() * h, 4 + r() * 30, 3 + r() * 18, `rgba(72,55,32,${0.025 + r() * 0.075})`);
  ctx.fillStyle = 'rgba(61,47,27,0.32)'; ctx.fillRect(249, 0, 14, h); ctx.fillStyle = 'rgba(142,121,84,0.38)';
  ctx.fillRect(253, 0, 7, h); tileLine(ctx, w, h, 249, 0, 249, h, 1.2, 'rgba(47,36,21,0.55)'); tileLine(ctx, w, h, 263, 0, 263, h, 1.2, 'rgba(47,36,21,0.45)');
  for (let y = 6; y < h; y += 16) {tileLine(ctx, w, h, 244, y, 268, y + 3, 1.6, 'rgba(189,172,132,0.58)'); tileEllipse(ctx, w, h, 246, y, 1.1, 1.1, 'rgba(37,29,17,0.55)');
    tileEllipse(ctx, w, h, 266, y + 3, 1.1, 1.1, 'rgba(37,29,17,0.55)');
  }
  for (let i = 0; i < 260; i++) {const x = r() * w, y = r() * h, len = 2 + r() * 18, a = r() * TAU; tileLine(ctx, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.4 + r() * 0.9, `rgba(${67 + Math.floor(r() * 45)},${53 + Math.floor(r() * 35)},${31 + Math.floor(r() * 25)},${0.08 + r() * 0.2})`);
  }
  return textureOf(c);
}
export function rustTexture() {
  const w = 512, h = 512, c = canvasOf(w, h), ctx = c.getContext('2d'), r = makeRng(0x7a57ed); ctx.fillStyle = '#713a1d';
  ctx.fillRect(0, 0, w, h); for (let i = 0; i < 230; i++) {const k = r(); const fill = k < 0.3 ? `rgba(126,63,25,${0.06 + r() * 0.18})` : k < 0.6 ? `rgba(84,39,17,${0.06 + r() * 0.2})` : k < 0.82 ? `rgba(162,86,31,${0.05 + r() * 0.16})` : `rgba(196,114,45,${0.04 + r() * 0.12})`;
    tileEllipse(ctx, w, h, r() * w, r() * h, 5 + r() * 72, 3 + r() * 48, fill);
  }
  for (let i = 0; i < 2200; i++) {const k = r(); const fill = k < 0.55 ? `rgba(${46 + Math.floor(r() * 34)},${21 + Math.floor(r() * 20)},${8 + Math.floor(r() * 12)},${0.15 + r() * 0.32})` : `rgba(${137 + Math.floor(r() * 75)},${71 + Math.floor(r() * 46)},${24 + Math.floor(r() * 26)},${0.08 + r() * 0.28})`;
    tileEllipse(ctx, w, h, r() * w, r() * h, 0.35 + r() * 2.8, 0.3 + r() * 2.2, fill);
  }
  for (let i = 0; i < 650; i++) tileEllipse(ctx, w, h, r() * w, r() * h, 0.5 + r() * 3.5, 0.4 + r() * 2.2, `rgba(${171 + Math.floor(r() * 55)},${92 + Math.floor(r() * 44)},${36 + Math.floor(r() * 28)},${0.08 + r() * 0.22})`);
  for (let i = 0; i < 46; i++) tileEllipse(ctx, w, h, r() * w, r() * h, 1 + r() * 6, 18 + r() * 100, `rgba(${55 + Math.floor(r() * 34)},${23 + Math.floor(r() * 18)},${8 + Math.floor(r() * 10)},${0.04 + r() * 0.11})`);
  for (let i = 0; i < 30; i++) {let x = r() * w, y = r() * h, a = r() * TAU; const pts = [[x, y]], steps = 5 + Math.floor(r() * 8);
    for (let j = 0; j < steps; j++) {a += (r() - 0.5) * 1.1; const len = 4 + r() * 17; x += Math.cos(a) * len;
      y += Math.sin(a) * len; pts.push([x, y]);
    }
    ctx.strokeStyle = `rgba(${38 + Math.floor(r() * 28)},${17 + Math.floor(r() * 16)},${6 + Math.floor(r() * 9)},${0.2 + r() * 0.34})`;
    ctx.lineWidth = 0.5 + r() * 1.5; tileDraw(ctx, w, h, pointBounds(pts, 3), () => {trace(ctx, pts, false); ctx.stroke();
    });
  }
  return textureOf(c);
}
export function hazardTexture() {
  const w = 512, h = 512, c = canvasOf(w, h), ctx = c.getContext('2d'), r = makeRng(0x4a2a9d); ctx.fillStyle = '#17150f';
  ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#d2a21b'; ctx.lineWidth = 31; for (let x = -h; x < w + h; x += 64) {ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,221,75,0.18)'; ctx.lineWidth = 4; for (let x = -h + 13; x < w + h; x += 64) {ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
  }
  for (let i = 0; i < 820; i++) {const x = r() * w, y = r() * h, rr = 0.5 + r() * 6.5; tileEllipse(ctx, w, h, x, y, rr, rr * (0.35 + r() * 0.9), r() < 0.72 ? `rgba(22,20,14,${0.12 + r() * 0.4})` : `rgba(105,75,29,${0.08 + r() * 0.22})`);
  }
  for (let i = 0; i < 150; i++) {const x = r() * w, y = r() * h, len = 2 + r() * 22, a = r() * TAU; tileLine(ctx, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.4 + r() * 1.3, r() < 0.55 ? `rgba(238,202,94,${0.05 + r() * 0.17})` : `rgba(43,34,17,${0.08 + r() * 0.2})`);
  }
  for (let i = 0; i < 45; i++) tileEllipse(ctx, w, h, r() * w, r() * h, 4 + r() * 28, 2 + r() * 15, `rgba(${53 + Math.floor(r() * 35)},${35 + Math.floor(r() * 24)},${20 + Math.floor(r() * 15)},${0.03 + r() * 0.09})`);
  return textureOf(c);
}
export function tarpaulinTexture() {
  const w = 512, h = 512, c = canvasOf(w, h), ctx = c.getContext('2d'), r = makeRng(0x7a4b1e); ctx.fillStyle = '#1c2427';
  ctx.fillRect(0, 0, w, h); for (let i = 0; i < 80; i++) tileEllipse(ctx, w, h, r() * w, r() * h, 18 + r() * 110, 12 + r() * 75, r() < 0.5 ? `rgba(43,57,60,${0.025 + r() * 0.05})` : `rgba(6,12,14,${0.025 + r() * 0.06})`);
  for (let i = 0; i < 32; i++) {const x1 = r() * w, y1 = r() * h, x2 = x1 + (r() - 0.5) * 300, y2 = y1 + (r() - 0.5) * 300;
    const cx = (x1 + x2) / 2 + (r() - 0.5) * 120, cy = (y1 + y2) / 2 + (r() - 0.5) * 120, box = pointBounds([[x1, y1], [cx, cy], [x2, y2]], 45), width = 14 + r() * 52;
    ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(4,9,11,${0.07 + r() * 0.13})`; ctx.lineWidth = width; tileDraw(ctx, w, h, box, () => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
    }); ctx.strokeStyle = `rgba(112,143,148,${0.025 + r() * 0.06})`; ctx.lineWidth = width * (0.12 + r() * 0.14);
    tileDraw(ctx, w, h, box, () => {ctx.beginPath(); ctx.moveTo(x1 + 5, y1 - 4); ctx.quadraticCurveTo(cx + 6, cy - 5, x2 + 4, y2 - 3); ctx.stroke();
    });
  }
  for (let i = 0; i < 95; i++) {const x = r() * w, y = r() * h, len = 3 + r() * 34, a = -0.6 + r() * 1.6; tileLine(ctx, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.35 + r() * 1.2, r() < 0.5 ? `rgba(126,154,158,${0.035 + r() * 0.1})` : `rgba(3,7,8,${0.08 + r() * 0.17})`);
  }
  for (let i = 0; i < 2600; i++) {const v = 12 + Math.floor(r() * 34); tileEllipse(ctx, w, h, r() * w, r() * h, 0.3 + r() * 1.4, 0.3 + r() * 1.1, `rgba(${v},${v + 5},${v + 7},${0.05 + r() * 0.15})`);
  }
  for (let i = 0; i < 35; i++) tileEllipse(ctx, w, h, r() * w, r() * h, 2 + r() * 20, 0.6 + r() * 4, `rgba(108,130,134,${0.015 + r() * 0.04})`);
  return textureOf(c);
}
export function grateTexture() {
  const w = 512, h = 512, c = canvasOf(w, h), ctx = c.getContext('2d'), r = makeRng(0x6a7e11); ctx.fillStyle = '#313637';
  ctx.fillRect(0, 0, w, h); for (let i = 0; i < 80; i++) tileEllipse(ctx, w, h, r() * w, r() * h, 8 + r() * 45, 4 + r() * 24, r() < 0.5 ? 'rgba(75,82,81,0.04)' : 'rgba(15,18,18,0.05)');
  const cell = 64, inset = 11, side = 42; for (let gy = 0; gy < h; gy += cell) for (let gx = 0; gx < w; gx += cell) {const x = gx + inset, y = gy + inset, g = ctx.createLinearGradient(x, y, x, y + side);
    g.addColorStop(0, 'rgba(4,6,6,0.97)'); g.addColorStop(0.5, 'rgba(8,10,10,0.96)'); g.addColorStop(1, 'rgba(14,17,17,0.95)');
    ctx.fillStyle = g; ctx.fillRect(x, y, side, side); ctx.strokeStyle = 'rgba(151,159,155,0.23)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y + side); ctx.lineTo(x, y); ctx.lineTo(x + side, y); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,0.62)';
    ctx.beginPath(); ctx.moveTo(x + side, y); ctx.lineTo(x + side, y + side); ctx.lineTo(x, y + side); ctx.stroke();
    ctx.fillStyle = 'rgba(168,175,169,0.11)'; ctx.fillRect(x + 2, y + 2, 5, 1.2);
  }
  for (let i = 0; i < 320; i++) {const x = r() * w, y = r() * h, len = 1 + r() * 11, a = r() * TAU; tileLine(ctx, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.35 + r() * 1.1, r() < 0.58 ? `rgba(163,170,164,${0.05 + r() * 0.17})` : `rgba(8,10,10,${0.1 + r() * 0.28})`);
  }
  for (let i = 0; i < 240; i++) tileEllipse(ctx, w, h, r() * w, r() * h, 0.5 + r() * 4, 0.4 + r() * 3, `rgba(${91 + Math.floor(r() * 55)},${45 + Math.floor(r() * 30)},${20 + Math.floor(r() * 18)},${0.07 + r() * 0.2})`);
  return textureOf(c);
}
export function noiseTexture(size = 256) {
  const n = Math.max(16, Math.min(1024, Math.floor(size) || 256)), c = canvasOf(n, n), ctx = c.getContext('2d'), r = makeRng(0x51f0a11);
  const periods = [4, 8, 16, 32, 64, 128]; const lat = periods.map(p => {const a = new Float32Array(p * p); for (let i = 0; i < a.length; i++) a[i] = r(); return a;
  }); const img = ctx.createImageData(n, n); for (let y = 0; y < n; y++) {const fy = y / n; for (let x = 0; x < n; x++) {
      const fx = x / n; let v = 0; for (let o = 0; o < periods.length; o++) {const p = periods[o], a = lat[o], px = fx * p, py = fy * p, x0 = Math.floor(px), y0 = Math.floor(py);
        let tx = px - x0, ty = py - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty); const xa = x0 % p, xb = (x0 + 1) % p, ya = y0 % p, yb = (y0 + 1) % p, v0 = a[ya * p + xa], v1 = a[ya * p + xb], v2 = a[yb * p + xa], v3 = a[yb * p + xb];
        const top = v0 + (v1 - v0) * tx, bot = v2 + (v3 - v2) * tx; v += (top + (bot - top) * ty) / (o + 1.5);
      }
      const g = Math.max(0, Math.min(255, Math.round(32 + (v / 1.91) * 192))), i = (y * n + x) * 4; img.data[i] = g;
      img.data[i + 1] = g; img.data[i + 2] = g; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0); return textureOf(c, false);
}
export function bulletHoleTexture() {
  const s = 256, c = canvasOf(s, s), ctx = c.getContext('2d'), r = makeRng(0xb011e7), cx = 128, cy = 126; const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 112);
  g.addColorStop(0, 'rgba(4,4,4,1)'); g.addColorStop(0.15, 'rgba(9,8,7,0.98)'); g.addColorStop(0.19, 'rgba(57,46,34,0.82)');
  g.addColorStop(0.28, 'rgba(13,12,11,0.58)'); g.addColorStop(0.55, 'rgba(82,76,67,0.2)'); g.addColorStop(0.78, 'rgba(48,45,41,0.07)');
  g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, s, s); const hole = []; for (let i = 0; i < 23; i++) {
    const a = (i / 23) * TAU, rr = 11 + r() * 5; hole.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  ctx.fillStyle = 'rgba(3,3,3,0.96)'; trace(ctx, hole); ctx.fill(); ctx.strokeStyle = 'rgba(116,103,85,0.62)';
  ctx.lineWidth = 2; trace(ctx, hole); ctx.stroke(); for (let i = 0; i < 19; i++) {let a = r() * TAU, x = cx + Math.cos(a) * (15 + r() * 5), y = cy + Math.sin(a) * (15 + r() * 5);
    const pts = [[x, y]], steps = 3 + Math.floor(r() * 6); for (let j = 0; j < steps; j++) {a += (r() - 0.5) * 0.55;
      const len = 4 + r() * 12; x += Math.cos(a) * len; y += Math.sin(a) * len; pts.push([x, y]);
    }
    ctx.strokeStyle = `rgba(18,16,14,${0.3 + r() * 0.35})`; ctx.lineWidth = 0.45 + r() * 0.75; trace(ctx, pts, false);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {const start = r() * TAU, len = 0.25 + r() * 1.1, rad = 24 + r() * 18; ctx.strokeStyle = `rgba(139,129,111,${0.14 + r() * 0.28})`;
    ctx.lineWidth = 0.5 + r() * 1.3; ctx.beginPath(); ctx.arc(cx, cy, rad, start, start + len); ctx.stroke();
  }
  for (let i = 0; i < 85; i++) {const a = r() * TAU, rad = 16 + r() * 24, rr = 0.5 + r() * 2.2; tileEllipse(ctx, s, s, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, rr, rr * 0.6, `rgba(176,166,143,${0.08 + r() * 0.2})`);
  }
  return textureOf(c);
}
export function muzzleFlashTexture() {
  const s = 256, c = canvasOf(s, s), ctx = c.getContext('2d'), r = makeRng(0xf1a5b), cx = 128, cy = 128; const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 122);
  g.addColorStop(0, 'rgba(255,255,250,1)'); g.addColorStop(0.08, 'rgba(255,248,203,0.95)'); g.addColorStop(0.2, 'rgba(255,190,61,0.62)');
  g.addColorStop(0.48, 'rgba(255,91,10,0.18)'); g.addColorStop(1, 'rgba(255,40,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 14; i++) {const a = (i / 14) * TAU + (r() - 0.5) * 0.08, len = 55 + r() * 62, spread = 0.035 + r() * 0.055;
    const co = Math.cos(a), si = Math.sin(a), nx = -si, ny = co; const lg = ctx.createLinearGradient(cx, cy, cx + co * len, cy + si * len);
    lg.addColorStop(0, 'rgba(255,255,245,0.92)'); lg.addColorStop(0.3, 'rgba(255,225,128,0.42)'); lg.addColorStop(1, 'rgba(255,82,0,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(cx + nx * 1.5, cy + ny * 1.5); ctx.lineTo(cx + co * len + nx * len * spread, cy + si * len + ny * len * spread);
    ctx.lineTo(cx + co * len - nx * len * spread, cy + si * len - ny * len * spread); ctx.lineTo(cx - nx * 1.5, cy - ny * 1.5);
    ctx.closePath(); ctx.fill();
  }
  for (const a of [-Math.PI / 2, Math.PI / 2, 0, Math.PI]) {const co = Math.cos(a), si = Math.sin(a), len = 112;
    ctx.strokeStyle = 'rgba(255,245,196,0.42)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(cx + co * 8, cy + si * 8);
    ctx.lineTo(cx + co * len, cy + si * len); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(255,255,255,0.98)'; ctx.beginPath(); ctx.ellipse(cx, cy, 9, 13, 0, 0, TAU);
  ctx.fill(); return textureOf(c);
}
export function sparkTexture() {
  const s = 128, c = canvasOf(s, s), ctx = c.getContext('2d'), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.1, 'rgba(255,255,255,0.98)'); g.addColorStop(0.3, 'rgba(255,247,213,0.46)');
  g.addColorStop(0.7, 'rgba(255,210,123,0.09)'); g.addColorStop(1, 'rgba(255,190,90,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  return textureOf(c);
}
export function rainStreakTexture() {
  const w = 64, h = 256, c = canvasOf(w, h), ctx = c.getContext('2d'); let g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.18, 'rgba(255,255,255,0.12)'); g.addColorStop(0.48, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.78, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in'; g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.34, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(0.66, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over';
  return textureOf(c);
}
export function smokeTexture() {
  const s = 256, c = canvasOf(s, s), ctx = c.getContext('2d'), r = makeRng(0x5a0c1); for (let i = 0; i < 34; i++) {const ang = r() * TAU, dist = Math.pow(r(), 1.7) * 66, x = 128 + Math.cos(ang) * dist, y = 128 + Math.sin(ang) * dist;
    const rr = 14 + r() * 58, v = 98 + Math.floor(r() * 78), g = ctx.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, `rgba(${v},${v},${v},${0.025 + r() * 0.07})`);
    g.addColorStop(0.55, `rgba(${v - 10},${v - 8},${v - 6},${0.018 + r() * 0.04})`); g.addColorStop(1, `rgba(${v - 20},${v - 18},${v - 16},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < 12; i++) {const x = 70 + r() * 116, y = 70 + r() * 116, rr = 6 + r() * 24; tileEllipse(ctx, s, s, x, y, rr, rr * 0.75, `rgba(74,77,78,${0.025 + r() * 0.04})`);
  }
  return textureOf(c);
}
export function skyTexture() {
  const w = 2048, h = 1024, c = canvasOf(w, h), ctx = c.getContext('2d'), r = makeRng(0x51a7f13d); let g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#01030a'); g.addColorStop(0.28, '#030817'); g.addColorStop(0.42, '#071328'); g.addColorStop(0.48, '#0e1a2c');
  g.addColorStop(0.5, '#26232a'); g.addColorStop(0.53, '#3a2b20'); g.addColorStop(0.6, '#0c1118'); g.addColorStop(1, '#030508');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); for (let i = 0; i < 1150; i++) {const x = r() * w, y = Math.pow(r(), 1.55) * h * 0.48, rr = 0.3 + Math.pow(r(), 4) * 2.3, b = 205 + Math.floor(r() * 50), warm = r() < 0.14;
    tileEllipse(ctx, w, h, x, y, rr, rr, warm ? `rgba(255,${b - 10},${b - 45},${0.16 + Math.pow(r(), 2) * 0.68})` : `rgba(${b - 8},${b},255,${0.16 + Math.pow(r(), 2) * 0.68})`);
    if (rr > 1.45 && r() < 0.52) {const a = 0.06 + r() * 0.18, len = rr * (3 + r() * 3), color = `rgba(202,218,255,${a})`;
      tileLine(ctx, w, h, x - len, y, x + len, y, 0.6, color); tileLine(ctx, w, h, x, y - len, x, y + len, 0.6, color);
    }
  }
  g = ctx.createLinearGradient(0, h * 0.405, 0, h * 0.58); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.32, 'rgba(191,91,25,0.025)');
  g.addColorStop(0.48, 'rgba(255,142,50,0.1)'); g.addColorStop(0.58, 'rgba(114,55,18,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); for (let i = 0; i < 12; i++) {tileEllipse(ctx, w, h, r() * w, h * (0.49 + r() * 0.018), 70 + r() * 280, 5 + r() * 22, `rgba(255,${105 + Math.floor(r() * 60)},${28 + Math.floor(r() * 32)},${0.018 + r() * 0.038})`);
  }
  for (let i = 0; i < 190; i++) {const x = r() * w, y = h * (0.492 + r() * 0.022), rr = 0.5 + r() * 1.5; tileEllipse(ctx, w, h, x, y, rr * 2.5, rr * 0.7, `rgba(255,${115 + Math.floor(r() * 60)},${38 + Math.floor(r() * 35)},${0.08 + r() * 0.3})`);
  }
  ctx.filter = 'blur(8px)'; for (let i = 0; i < 32; i++) {const x = r() * w, y = h * (0.4 + r() * 0.13), rx = 60 + r() * 280, ry = 5 + r() * 20;
    tileEllipse(ctx, w, h, x, y, rx, ry, `rgba(44,52,66,${0.035 + r() * 0.075})`); tileEllipse(ctx, w, h, x, y + ry * 0.8, rx * 0.76, ry * 0.3, `rgba(231,132,57,${0.012 + r() * 0.032})`);
  }
  ctx.filter = 'none'; const mx = w * 0.78, my = h * 0.2; g = ctx.createRadialGradient(mx, my, 4, mx, my, 190);
  g.addColorStop(0, 'rgba(231,236,225,0.32)'); g.addColorStop(0.08, 'rgba(184,203,216,0.14)'); g.addColorStop(0.42, 'rgba(124,151,184,0.035)');
  g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(mx - 190, my - 190, 380, 380); ctx.fillStyle = 'rgba(220,225,210,0.5)';
  ctx.beginPath(); ctx.arc(mx, my, 8, 0, TAU); ctx.fill(); return textureOf(c, true, {mapping: THREE.EquirectangularReflectionMapping
  });
}
export function makeGlowTexture(color = '#66ddff') {
  const s = 256, c = canvasOf(s, s), ctx = c.getContext('2d'), g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.07, 'rgba(255,255,255,0.94)'); g.addColorStop(0.28, 'rgba(255,255,255,0.42)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.09)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = color; ctx.fillRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'source-over'; return textureOf(c);
}
