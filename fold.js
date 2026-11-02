// fold.js : 그래스호퍼 FOLD.py 와 같은 공식 (엇갈린 미우라 접기)
// 좌표는 GH 와 같이 Z 위, 단위 m. three.js 장면에서는 그룹을 X축으로 -90도 돌려 Y 위로 바꾼다.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const mean = (P) => { const k = 1 / P.length; let x = 0, y = 0, z = 0; for (const p of P) { x += p[0]; y += p[1]; z += p[2]; } return [x * k, y * k, z * k]; };
const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;
const pmod = (a, m) => ((a % m) + m) % m;   // Python 식 나머지

export const V = { sub, add, mul, dot, cross, unit, mean };

export function profileDesign(prof) {
  const s = [], ang = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const [x0, z0] = prof[i], [x1, z1] = prof[i + 1];
    s.push(Math.hypot(x1 - x0, z1 - z0));
    ang.push(deg(Math.atan2(z1 - z0, x1 - x0)));
  }
  const turns = [];
  for (let i = 0; i < ang.length - 1; i++) turns.push(pmod(ang[i + 1] - ang[i] + 180, 360) - 180);
  return { s, turns };
}

export function flatPattern(s, turns, w, n, phimax) {
  const N = s.length, sphi = Math.sin(rad(phimax));
  const A = turns.map((th) => w / Math.tan(Math.atan(Math.tan(rad(Math.abs(th)) / 2) / sphi)));
  const p = [1];
  for (let i = 1; i < N - 1; i++) {
    const same = (turns[i] > 0) === (turns[i - 1] > 0);
    p.push(same ? -p[p.length - 1] : p[p.length - 1]);
  }
  const X = [0];
  for (const v of s) X.push(X[X.length - 1] + v);
  const xs = [new Array(n + 1).fill(0)];
  for (let k = 1; k < N; k++) {
    const row = [];
    for (let j = 0; j <= n; j++) row.push(X[k] + p[k - 1] * (j % 2 === 0 ? -1 : 1) * A[k - 1] / 2);
    xs.push(row);
  }
  xs.push(new Array(n + 1).fill(X[N]));
  return { xs, A, p, total: X[N] };
}

// B[k][j] : 경계 k(0..N), 주름선 j(0..n) 의 3D 점. t = 0 평평 ... 1 설계 형태
export function fold(xs, w, n, phimax, t, rot = 0) {
  const N = xs.length - 1;
  const phi = rad(phimax) * Math.max(t, 1e-5);
  const cy = w * Math.cos(phi), sz = w * Math.sin(phi);
  const planes = [];
  let B = [];
  for (let k = 0; k <= N; k++) {
    let P = [];
    for (let j = 0; j <= n; j++) P.push([xs[k][j], j * cy, (j % 2) * sz]);
    const upto = Math.max(k - 1, 0);
    for (let m = 0; m < upto; m++) {
      const [c, nn] = planes[m];
      P = P.map((q) => sub(q, mul(nn, 2 * dot(sub(q, c), nn))));
    }
    if (k >= 1 && k <= N - 1) {
      const nn = unit(cross(sub(P[1], P[0]), sub(P[2], P[1])));
      planes.push([mean(P), nn]);
    }
    B.push(P);
  }
  const fa = mean(B[0]), fb = mean(B[N]);
  const ang = Math.atan2(fb[2] - fa[2], fb[0] - fa[0]);
  const c = Math.cos(-ang), sn = Math.sin(-ang);
  B = B.map((P) => P.map((q0) => { const q = sub(q0, fa); return [c * q[0] - sn * q[2], q[1], sn * q[0] + c * q[2]]; }));
  let zs = 0; for (const P of B) for (const q of P) zs += q[2];
  if (zs < 0) B = B.map((P) => P.map((q) => [q[0], -q[1], -q[2]]));
  let zmin = Infinity; for (const q of B[0].concat(B[N])) zmin = Math.min(zmin, q[2]);
  let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
  for (const P of B) for (const q of P) { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); }
  const ym = (y0 + y1) / 2, xm = (x0 + x1) / 2;
  B = B.map((P) => P.map((q) => [q[0] - xm, q[1] - ym, q[2] - zmin]));
  if (rot) {
    const r = rad(rot), cr = Math.cos(r), sr = Math.sin(r);
    B = B.map((P) => P.map((q) => [cr * q[0] - sr * q[1], sr * q[0] + cr * q[1], q[2]]));
  }
  return B;
}

// 판: 바깥쪽을 향하는 감김 순서, 바깥 법선, 좌표틀 (원점, x = 주름선 방향, y, z = 법선)
export function panelsFrom(B, xs, w, n) {
  const N = B.length - 1;
  const la = unit(sub(B[0][2], B[0][0]));
  const bd = [];
  for (let b = 1; b <= N; b++) bd.push(unit(sub(mean(B[b]), mean(B[b - 1]))));
  const ctr = mean(B.flat());
  const o1 = unit(cross(la, bd[0]));
  const sgn = dot(o1, sub(mean(B[0].concat(B[1])), ctr)) > 0 ? 1 : -1;
  const res = [];
  for (let b = 1; b <= N; b++) {
    const outw = mul(unit(cross(la, bd[b - 1])), sgn);
    for (let j = 0; j < n; j++) {
      let v = [B[b - 1][j], B[b - 1][j + 1], B[b][j + 1], B[b][j]];
      let nrm = unit(cross(sub(v[1], v[0]), sub(v[3], v[0])));
      let swap = false;
      if (dot(nrm, outw) < 0) { v = [v[0], v[3], v[2], v[1]]; nrm = mul(nrm, -1); swap = true; }
      const o = mean(v);
      const gx = unit(sub(B[b][j], B[b - 1][j]));
      const y = cross(nrm, gx);
      res.push({ band: b, j, v, n: nrm, swap, frame: [o, gx, y, nrm],
        local: v.map((q) => [dot(sub(q, o), gx), dot(sub(q, o), y)]) });
    }
  }
  return res;
}

export function canonical(panels, tol = 1e-6) {
  const ref = {};
  const same = (a, b) => a.every((p) => Math.min(...b.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))) < tol);
  for (const pn of panels) {
    if (!ref[pn.band]) ref[pn.band] = pn.local;
    const r = ref[pn.band];
    if (same(pn.local, r)) pn.flip = false;
    else {
      const mir = pn.local.map((p) => [p[0], -p[1]]);
      if (!same(mir, r)) throw new Error(`panel ${pn.band}/${pn.j} does not match its band shape`);
      const [o, x, y, z] = pn.frame;
      pn.frame = [o, x, mul(y, -1), mul(z, -1)];
      pn.flip = true;
    }
  }
  return ref;
}

// 산(M) / 골(V) : 바깥에서 본 접힘
export function creases(B, panels, n) {
  const N = B.length - 1;
  const idx = {};
  for (const pn of panels) idx[pn.band + ',' + pn.j] = pn;
  const mv = (pa, pb) => (dot(sub(mean(pb.v), mean(pa.v)), pa.n) < 0 ? 'M' : 'V');
  const out = [];
  for (let b = 1; b <= N; b++) for (let j = 1; j < n; j++)
    out.push({ kind: 'gen', ka: b - 1, kb: b, ja: j, jb: j, mv: mv(idx[b + ',' + (j - 1)], idx[b + ',' + j]) });
  for (let k = 1; k < N; k++) for (let j = 0; j < n; j++)
    out.push({ kind: 'zig', ka: k, kb: k, ja: j, jb: j + 1, mv: mv(idx[k + ',' + j], idx[(k + 1) + ',' + j]) });
  return out;
}

// 해 방향 (x 동, y 북, z 위). decl, ha 는 라디안 (ha > 0 오후)
export function sunVec(lat, decl, ha) {
  const la = rad(lat);
  return [-Math.cos(decl) * Math.sin(ha),
    Math.sin(decl) * Math.cos(la) - Math.cos(decl) * Math.cos(ha) * Math.sin(la),
    Math.sin(decl) * Math.sin(la) + Math.cos(decl) * Math.cos(ha) * Math.cos(la)];
}
export const declination = (dayOfYear) => rad(23.44) * Math.sin(rad(360 * (284 + dayOfYear) / 365));

// 접기 장치: t = 1 에서 감김·뒤집힘을 정해 두고, 어떤 t 에서도 같은 순서로 좌표틀을 만든다
export class Rig {
  constructor(params, step = 1.0) {
    this.params = params;
    const { profile, w, n, phi, rot } = params;
    this.w = w; this.n = n; this.phi = phi; this.rot = rot || 0;
    const d = profileDesign(profile);
    this.s = d.s; this.turns = d.turns; this.N = d.s.length;
    const fp = flatPattern(d.s, d.turns, w, n, phi);
    this.xs = fp.xs; this.amp = fp.A; this.total = fp.total;
    const B1 = fold(this.xs, w, n, phi, 1, this.rot);
    const P1 = panelsFrom(B1, this.xs, w, n);
    this.shapes = canonical(P1);
    this.panelInfo = P1.map((p) => ({ band: p.band, j: p.j, swap: p.swap, flip: p.flip }));
    this.creases = creases(B1, P1, n);
    for (const c of this.creases) {
      const L = Math.hypot(...sub(B1[c.kb][c.jb], B1[c.ka][c.ja]));
      c.len = L; c.count = Math.max(2, Math.round(L / step));
    }
    this.B1 = B1;
  }

  pose(t) {
    const { n, w, phi } = this;
    const B = fold(this.xs, w, n, phi, t, this.rot);
    const frames = this.panelInfo.map((pi) => {
      const b = pi.band, j = pi.j;
      let v = [B[b - 1][j], B[b - 1][j + 1], B[b][j + 1], B[b][j]];
      if (pi.swap) v = [v[0], v[3], v[2], v[1]];
      const nrm = unit(cross(sub(v[1], v[0]), sub(v[3], v[0])));
      const o = mean(v);
      const gx = unit(sub(B[b][j], B[b - 1][j]));
      let y = cross(nrm, gx), z = nrm;
      if (pi.flip) { y = mul(y, -1); z = mul(z, -1); }
      return { o, x: gx, y, z, n: nrm, v, band: b, j };
    });
    return { B, frames, t };
  }

  // 힌지 좌표틀 (BLOCKS.py 와 같은 규칙과 순서)
  hinges(B) {
    const gen = [], zig = [];
    for (const c of this.creases) {
      const a = B[c.ka][c.ja], b = B[c.kb][c.jb];
      const dv = sub(b, a), L = Math.hypot(...dv), d = unit(dv);
      const up = Math.abs(d[2]) < 0.95 ? [0, 0, 1] : [1, 0, 0];
      const y = unit(cross(up, d)), z = cross(d, y);
      for (let i = 0; i < c.count; i++) {
        const o = add(a, mul(d, L * (i + 0.5) / c.count));
        (c.kind === 'gen' ? gen : zig).push({ o, x: d, y, z, crease: c });
      }
    }
    return { gen, zig };
  }

  feet(B) {
    const la0 = unit(sub(B[0][2], B[0][0]));
    const la = unit([la0[0], la0[1], 0]);
    const lay = cross([0, 0, 1], la);
    return B[0].concat(B[this.N]).map((f) => ({ o: [f[0], f[1], 0], x: la, y: lay, z: [0, 0, 1] }));
  }

  stats(B) {
    // 회전 전 기준: 폭(단면 방향) x 길이(볼트 방향), 높이
    const r = rad(-this.rot), cr = Math.cos(r), sr = Math.sin(r);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z1 = 0;
    for (const P of B) for (const q of P) {
      const x = cr * q[0] - sr * q[1], y = sr * q[0] + cr * q[1];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z1 = Math.max(z1, q[2]);
    }
    return { span: x1 - x0, depth: y1 - y0, height: z1 };
  }
}
