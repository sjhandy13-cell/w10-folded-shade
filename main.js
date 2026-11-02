// main.js : 접히는 판 파빌리온 발표 페이지 (three.js r170)
// pavilion.json (GH BLOCKS 가 저장) 을 읽고, fold.js 로 같은 공식의 접기를 다시 계산한다.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Rig, V, sunVec, declination } from './fold.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// ------------------------------------------------------------------ 이름과 한 문장
// 여기 적으면 웹 전체(제목, 끝맺음, 대본)에 쓰입니다. 비워 두면 pavilion.json 의 meta.name / meta.concept 을 씁니다.
const TEXT = {
  name: '접힌 그늘',
  concept: '한 장의 판이 접혀 여름 해를 막고, 그 주름 사이로 빛의 결을 들인다',
};

// ------------------------------------------------------------------ 화면 설정
// 여기 값을 바꾸면 페이지 전체 분위기가 바뀝니다. 주소 뒤에 ?style=white&theme=dark 처럼 붙여 미리 볼 수도 있습니다.
const CONFIG = {
  style: 'real',     // real 사실적 재료 | white 흰 모형 | line 선 강조
  theme: 'grey',     // grey 회색 (paper 보다 조금 어둡게) | paper 밝은 회색 | white 흰색 | dark 어두운 남색
  camera: 'persp',   // 처음 투영. 화면 오른쪽 아래 버튼(또는 O 키)으로 원근 / 평행 전환. 안쪽 시점과 조인트 확대는 늘 원근
  shadow: 'sharp',   // soft 부드럽게 | sharp 선명하게 (그늘 진하게)
  tone: 'neutral',   // neutral | aces | agx  (렌더러 색 처리)
  ao: false,         // 주름 그늘 강조 (GTAO 후처리)
  night: true,       // 데이터 장면에 낮 / 밤 버튼
  font: 'plex',      // plex IBM Plex Sans KR | pretendard | serif Noto Serif KR
  accent: 'cobalt',  // cobalt | orange | green
  intro: 'fold',     // fold 평평한 판에서 접히며 시작 | still 완성된 모습으로 시작
  glb: 'ghost',      // ghost 3장면에서 라이노 glb 를 선으로 겹쳐 보기 | swap 라이노 색 그대로 바꿔 보기
};
{
  const q = new URLSearchParams(location.search);
  for (const k of Object.keys(CONFIG)) if (q.has(k)) CONFIG[k] = typeof CONFIG[k] === 'boolean' ? q.get(k) !== '0' : q.get(k);
  const el = document.documentElement;
  el.dataset.theme = CONFIG.theme; el.dataset.accent = CONFIG.accent; el.dataset.font = CONFIG.font;
  const FONT_CSS = { pretendard: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css',
    serif: 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;400;500;600&display=swap' };
  if (FONT_CSS[CONFIG.font]) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONT_CSS[CONFIG.font]; document.head.appendChild(l); }
}
const css = getComputedStyle(document.documentElement);
const tok = (n) => css.getPropertyValue(n).trim();
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LITE = new URLSearchParams(location.search).has('lite');   // 느린 컴퓨터용: ?lite
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, REDUCED ? 0 : ms));
const won = (v) => v.toLocaleString('ko-KR');

function fail(html) { const m = $('#msg'); m.querySelector('p').innerHTML = html; m.classList.add('on'); }

// ------------------------------------------------------------------ 데이터
let D;
try {
  const r = await fetch('./pavilion.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  D = await r.json();
} catch (e) {
  fail('pavilion.json 을 읽지 못했어요.<br>index.html 을 더블클릭하지 말고, 폴더에서 <b>npx serve</b> 로 연 주소로 들어오세요.');
  throw e;
}
const meta = D.meta || {};
const NAME = TEXT.name || meta.name || '접히는 판 파빌리온';
const CONCEPT = TEXT.concept || meta.concept || '평평한 판 한 장이 접혀 일어나 벽과 지붕이 된다';
document.title = NAME;
$('#name').textContent = NAME;
$('#concept').textContent = CONCEPT;
$('#closingTxt').textContent = CONCEPT;

const TYPES = Object.fromEntries(D.types.map((t) => [t.id, t]));
const countOf = (id) => (TYPES[id] ? TYPES[id].count : 0);

// 힌지 간격: JSON 의 개수와 맞는 값을 찾는다 (GH 에서 step 을 바꿨을 때 대비)
function makeRig() {
  for (const step of [1.0, 0.75, 0.5, 1.25, 1.5, 2.0, 0.6, 0.8]) {
    const r = new Rig(D.params, step);
    const h = r.hinges(r.B1);
    if (!TYPES.hinge_gen || (h.gen.length === countOf('hinge_gen') && h.zig.length === countOf('hinge_zig'))) return r;
  }
  return new Rig(D.params, 1.0);
}
const rig = makeRig();
const N = rig.N, n = rig.n, NP = N * n;
const panels = D.panels && D.panels.length === NP ? D.panels : rig.panelInfo.map((p) => ({ b: p.band, j: p.j, rad: 0, kind: 0 }));
const rads = panels.map((p) => p.rad);
const kinds = panels.map((p) => clamp(Math.floor(p.kind), 0, 2));
const DAT = D.data || {};
const rmin = DAT.min ?? Math.min(...rads), rmax = DAT.max ?? Math.max(...rads);
const thr = DAT.thresholds || [rmin + (rmax - rmin) / 3, rmin + 2 * (rmax - rmin) / 3];
const pIndex = (b, j) => (b - 1) * n + j;
const bandName = (b) => ((TYPES['plate_' + b] || {}).name || '판-' + b).replace(/^판-\d+\s*/, '');
let TOP_BAND = '', topMean = -Infinity;
for (let b = 1; b <= N; b++) { let m = 0; for (let j = 0; j < n; j++) m += rads[pIndex(b, j)] / n; if (m > topMean) { topMean = m; TOP_BAND = bandName(b); } }
const BAND_KIND = [[], [], []];          // 창 종류마다 그 종류가 가장 많은 띠 이름
for (let b = 1; b <= N; b++) {
  const c = [0, 0, 0]; for (let j = 0; j < n; j++) c[kinds[pIndex(b, j)]]++;
  BAND_KIND[c.indexOf(Math.max(...c))].push(bandName(b));
}

// 접힘선마다 양쪽 판 번호 (폭발도·선 위치 계산용)
for (const c of rig.creases) {
  if (c.kind === 'gen') { c.pa = pIndex(c.kb, c.ja - 1); c.pb = pIndex(c.kb, c.ja); }
  else { c.pa = pIndex(c.ka, c.ja); c.pb = pIndex(c.ka + 1, c.ja); }
}

// ------------------------------------------------------------------ three.js 기본
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(LITE ? 1 : Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = CONFIG.shadow === 'sharp' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping }[CONFIG.tone] || THREE.NeutralToneMapping;
renderer.toneMappingExposure = CONFIG.tone === 'aces' ? 1.1 : CONFIG.tone === 'agx' ? 1.15 : 1;
const shadowDirty = () => { renderer.shadowMap.needsUpdate = true; };

const scene = new THREE.Scene();
const BG = new THREE.Color(tok('--paper'));
scene.background = BG;
scene.fog = new THREE.Fog(BG, 34, 78);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.05, 300);
camera.position.set(16, 8, 16);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 0.5;
controls.maxDistance = 70;
controls.target.set(0, 2.2, 0);
controls.autoRotateSpeed = 0.7;

// 평행 투영 카메라: 원근 카메라(조작 기준)를 따라가며 줌으로 크기를 맞춘다
const ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
const O_H = 20, O_D = 120;
const PERSP_ONLY = new Set(['data1', 'joint']);
let rcam = camera;

// 주름 그늘 (GTAO)
let composer = null, gtao = null, rpass = null;
if (CONFIG.ao) {
  composer = new EffectComposer(renderer);
  rpass = new RenderPass(scene, camera); composer.addPass(rpass);
  gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.updateGtaoMaterial({ radius: 1.0, distanceExponent: 1, thickness: 2, scale: 1.8, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  const ov = gtao.overrideVisibility.bind(gtao);
  gtao.overrideVisibility = function () { ov(); this.scene.traverse((o) => { if (o.userData.noAO) o.visible = false; }); };
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
}
function setRenderCam(c) {
  if (rcam === c) return;
  rcam = c;
  if (composer) { rpass.camera = c; gtao.camera = c; gtao.gtaoMaterial.defines.PERSPECTIVE_CAMERA = c.isPerspectiveCamera ? 1 : 0; gtao.gtaoMaterial.needsUpdate = true; }
}
function syncCams() {
  const d = camera.position.distanceTo(controls.target);
  const useO = state.ortho && !PERSP_ONLY.has(camKey);
  if (useO) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    ocam.position.copy(controls.target).addScaledVector(dir, O_D);
    ocam.quaternion.copy(camera.quaternion);
    ocam.zoom = O_H / (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    ocam.updateProjectionMatrix(); ocam.updateMatrixWorld();
  }
  setRenderCam(useO ? ocam : camera);
  const extra = useO ? O_D - d : 0;
  scene.fog.near = 34 + extra; scene.fog.far = 78 + extra;
}

const HEMI = CONFIG.style === 'line' ? 1.35 : CONFIG.shadow === 'sharp' ? 0.6 : 0.95;
const hemi = new THREE.HemisphereLight('#f3f5f7', CONFIG.theme === 'dark' ? '#3a4048' : '#b8b3a8', HEMI);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fffaf3', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(LITE ? 1024 : 4096, LITE ? 1024 : 4096);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 5, far: 90 });
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 96), new THREE.MeshStandardMaterial({ color: tok('--ground'), roughness: 0.96 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(40, 40, tok('--ink'), tok('--ink'));
grid.material.transparent = true; grid.material.opacity = CONFIG.theme === 'dark' ? 0.1 : 0.07; grid.material.depthWrite = false;
grid.position.y = 0.002;
scene.add(grid);

// 파빌리온 그룹: 안에서는 GH 와 같은 Z 위 좌표, 밖에서는 three.js 의 Y 위
const pav = new THREE.Group();
pav.rotation.x = -Math.PI / 2;
scene.add(pav);
pav.updateMatrixWorld();
const toWorld = (p) => pav.localToWorld(new THREE.Vector3(p[0], p[1], p[2]));

// ------------------------------------------------------------------ 블록 형상 (블록 정의 = 부재 종류)
function rectPath(cx, cy, L, W, P = new THREE.Path()) {
  P.moveTo(cx - L / 2, cy - W / 2); P.lineTo(cx + L / 2, cy - W / 2); P.lineTo(cx + L / 2, cy + W / 2); P.lineTo(cx - L / 2, cy + W / 2);
  return P;
}
function slab(shape, thk, seg = 1) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thk, bevelEnabled: false, curveSegments: seg });
  g.translate(0, 0, -thk / 2);
  return g;
}
const holeCx = {};
function plateGeom(b) {
  const t = TYPES['plate_' + b] || {};
  const pts = t.shape || rig.shapes[b];
  const [L, W] = t.hole || [1.2, 0.3];
  holeCx[b] = t.hole_cx || 0;
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  sh.holes.push(rectPath(holeCx[b], 0, L, W));
  return slab(sh, t.thk || 0.03);
}
const WS = (TYPES.win_open && TYPES.win_open.size) || [1.2, 0.3, 0.008];
function perfGeom() {
  const t = TYPES.win_perf || {};
  const [L, W, d] = t.size || [WS[0], WS[1], 0.004];
  const [nx, ny, r] = t.holes || [16, 4, 0.022];
  const sh = new THREE.Shape(); rectPath(0, 0, L - 0.01, W - 0.01, sh);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const h = new THREE.Path(); h.absarc(-L / 2 + (i + 0.5) * L / nx, -W / 2 + (j + 0.5) * W / ny, r, 0, Math.PI * 2, true); sh.holes.push(h);
  }
  return slab(sh, d, 6);
}
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
function pinGeom(id, r0, L0) { const t = TYPES[id] || {}; return new THREE.CylinderGeometry(t.r || r0, t.r || r0, t.L || L0, 16).rotateZ(-Math.PI / 2); }
function shoeGeom() {
  const t = TYPES.shoe || {};
  const [px, py, pz] = t.plate || [0.3, 0.3, 0.02], [fx, fy, fz] = t.fin || [0.02, 0.24, 0.15];
  return mergeGeometries([box(px, py, pz).translate(0, 0, pz / 2), box(fx, fy, fz).translate(0, 0, pz + fz / 2)]);
}

const MAT = {
  plate: new THREE.MeshStandardMaterial({ color: tok('--wood'), roughness: 0.72, metalness: 0 }),
  data: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 }),
  open: new THREE.MeshStandardMaterial({ color: tok('--open'), roughness: 0.05, transparent: true, opacity: 0.38, depthWrite: false }),
  perf: new THREE.MeshStandardMaterial({ color: tok('--perf'), roughness: 0.38, metalness: 0.7 }),
  solid: new THREE.MeshStandardMaterial({ color: tok('--solid'), roughness: 0.5, metalness: 0.4 }),
  hinge_gen: new THREE.MeshStandardMaterial({ color: '#8d939a', roughness: 0.4, metalness: 0.7 }),
  hinge_zig: new THREE.MeshStandardMaterial({ color: '#8d939a', roughness: 0.4, metalness: 0.7 }),
  shoe: new THREE.MeshStandardMaterial({ color: '#6c7178', roughness: 0.55, metalness: 0.6 }),
  added: new THREE.MeshStandardMaterial({ color: tok('--cobalt'), roughness: 0.45, metalness: 0.3 }),
  person: new THREE.MeshStandardMaterial({ color: '#7a828b', roughness: 0.9 }),
};

// 모델 표현: 흰 모형 / 선 강조는 재료색을 모형처럼 바꾼다
const STEEL = CONFIG.style === 'real' ? '#8d939a' : '#b9bdc2';
if (CONFIG.style !== 'real') {
  MAT.plate.color.set('#efefec'); MAT.plate.roughness = 0.92;
  MAT.perf.color.set('#d6d8da'); MAT.perf.metalness = 0.1; MAT.perf.roughness = 0.8;
  MAT.solid.color.set('#c2c5c8'); MAT.solid.metalness = 0.05; MAT.solid.roughness = 0.85;
  MAT.open.color.set('#e3eef2'); MAT.open.opacity = 0.3;
  MAT.shoe.color.set('#a4a8ad'); MAT.shoe.metalness = 0.1;
  MAT.hinge_gen.color.set(STEEL); MAT.hinge_zig.color.set(STEEL);
  MAT.person.color.set('#9aa0a6');
}

const IM = {};
function addIM(id, geo, mat, count, cast = true) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(count, 1));
  m.count = count; m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.name = id; pav.add(m); IM[id] = m;
  return m;
}
for (let b = 1; b <= N; b++) addIM('plate_' + b, plateGeom(b), MAT.plate, n);
const KIND_ID = ['win_open', 'win_perf', 'win_solid'];
const kindCount = [0, 0, 0];
const plateIdx = [], winRef = [];
for (let i = 0; i < NP; i++) {
  plateIdx.push(panels[i].j);
  const k = kinds[i]; winRef.push({ id: KIND_ID[k], idx: kindCount[k]++ });
}
addIM('win_open', box(WS[0] - 0.01, WS[1] - 0.01, WS[2]), MAT.open, kindCount[0], false);
addIM('win_perf', perfGeom(), MAT.perf, kindCount[1]);
addIM('win_solid', box(WS[0] - 0.01, WS[1] - 0.01, (TYPES.win_solid && TYPES.win_solid.size[2]) || 0.006), MAT.solid, kindCount[2]);
const H1 = rig.hinges(rig.B1);
addIM('hinge_gen', pinGeom('hinge_gen', 0.018, 0.16), MAT.hinge_gen, H1.gen.length);
addIM('hinge_zig', pinGeom('hinge_zig', 0.026, 0.22), MAT.hinge_zig, H1.zig.length);
addIM('shoe', shoeGeom(), MAT.shoe, 2 * (n + 1));
// 판 인스턴스 색 (데이터 보기용) - 처음부터 만들어 두어 셰이더가 바뀌지 않게
const WHITE = new THREE.Color(1, 1, 1);
for (let i = 0; i < NP; i++) IM['plate_' + panels[i].b].setColorAt(plateIdx[i], WHITE);

// ------------------------------------------------------------------ 상태와 자세
const state = { ortho: CONFIG.camera === 'ortho', t: 1, explode: 0, scene: 0, step: 0, hour: 15.5, locked: false, assembled: true, mode: 'material', hingeLook: 'steel' };
let pose = null, offs = null;
const _m = new THREE.Matrix4();
function setM(mesh, i, o, x, y, z, off) {
  const ox = o[0] + (off ? off[0] : 0), oy = o[1] + (off ? off[1] : 0), oz = o[2] + (off ? off[2] : 0);
  _m.set(x[0], y[0], z[0], ox, x[1], y[1], z[1], oy, x[2], y[2], z[2], oz, 0, 0, 0, 1);
  mesh.setMatrixAt(i, _m);
}
function explodeOffsets(B, frames, e) {
  if (e < 1e-4) return null;
  const all = B.flat(), C = V.mean(all);
  const la = V.unit(V.sub(B[0][2], B[0][0]));
  const dir = [];
  for (let b = 1; b <= N; b++) {
    let v = V.sub(V.mean(B[b - 1].concat(B[b])), C);
    v = V.sub(v, V.mul(la, V.dot(v, la)));
    dir[b] = V.unit(v);
  }
  return frames.map((f) => V.add(V.mul(dir[f.band], e * 1.2), V.mul(la, (f.j - (n - 1) / 2) * e * 0.08)));
}
const avgOff = (a, b) => (offs ? V.mul(V.add(offs[a], offs[b]), 0.5) : null);

function applyPose(t) {
  state.t = t;
  pose = rig.pose(t);
  const { B, frames } = pose;
  const e = state.explode;
  offs = explodeOffsets(B, frames, e);
  frames.forEach((f, i) => {
    const off = offs ? offs[i] : null;
    setM(IM['plate_' + f.band], plateIdx[i], f.o, f.x, f.y, f.z, off);
    const w = winRef[i];
    let wo = V.add(f.o, V.mul(f.x, holeCx[f.band]));
    if (off) wo = V.add(wo, V.add(off, V.mul(f.n, e * 0.6)));
    setM(IM[w.id], w.idx, wo, f.x, f.y, f.z);
  });
  const H = rig.hinges(B);
  H.gen.forEach((h, i) => setM(IM.hinge_gen, i, h.o, h.x, h.y, h.z, avgOff(h.crease.pa, h.crease.pb)));
  H.zig.forEach((h, i) => setM(IM.hinge_zig, i, h.o, h.x, h.y, h.z, avgOff(h.crease.pa, h.crease.pb)));
  rig.feet(B).forEach((f, i) => {
    let off = null;
    if (offs) { const p = i <= n ? pIndex(1, Math.min(i, n - 1)) : pIndex(N, Math.min(i - n - 1, n - 1)); off = [offs[p][0], offs[p][1], 0]; }
    setM(IM.shoe, i, f.o, f.x, f.y, f.z, off);
  });
  for (const m of Object.values(IM)) m.instanceMatrix.needsUpdate = true;
  updateCreaseLines();
  updateOutline();
  if (loadPath.group.visible) buildLoadPath();
  updateFoldReadout();
  refreshFixes();
  shadowDirty();
}

// ------------------------------------------------------------------ 데이터 색
const RAMP = [[0, '#f2e3a0'], [0.38, '#eab05c'], [0.7, '#d2602f'], [1, '#8a2a17']].map(([p, c]) => {
  const k = new THREE.Color(c); const s = {}; k.getRGB(s, THREE.SRGBColorSpace); return [p, s];
});
function rampColor(u, out = new THREE.Color()) {
  u = clamp(u, 0, 1);
  let i = 0; while (i < RAMP.length - 2 && u > RAMP[i + 1][0]) i++;
  const [p0, a] = RAMP[i], [p1, b] = RAMP[i + 1];
  const k = (u - p0) / (p1 - p0);
  return out.setRGB(a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k, THREE.SRGBColorSpace);
}
const rampCSS = 'linear-gradient(90deg,' + RAMP.map(([p, s]) => `rgb(${Math.round(s.r * 255)},${Math.round(s.g * 255)},${Math.round(s.b * 255)}) ${p * 100}%`).join(',') + ')';
const norm = (v) => (v - rmin) / Math.max(rmax - rmin, 1e-9);

function setPlateMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  const c = new THREE.Color();
  for (let i = 0; i < NP; i++) IM['plate_' + panels[i].b].setColorAt(plateIdx[i], mode === 'data' ? rampColor(norm(rads[i]), c) : WHITE);
  for (let b = 1; b <= N; b++) { const m = IM['plate_' + b]; m.material = mode === 'data' ? MAT.data : MAT.plate; m.instanceColor.needsUpdate = true; }
}
function setWindows(on) { for (const id of KIND_ID) IM[id].visible = on; shadowDirty(); }
function setHingeLook(look) {
  state.hingeLook = look;
  const pick = (id) => (look === 'locked' ? tok('--cobalt') : look === 'block' && TYPES[id] ? TYPES[id].color : STEEL);
  MAT.hinge_gen.color.set(pick('hinge_gen'));
  MAT.hinge_zig.color.set(pick('hinge_zig'));
}

// ------------------------------------------------------------------ 해
function sunDir(hour, day = 202) {
  const ha = THREE.MathUtils.degToRad(15 * (hour - 12) - (135 - 126.98));   // 서울 경도 보정 (KST)
  const s = sunVec(37.57, declination(day), ha);
  return { s, w: new THREE.Vector3(s[0], s[2], -s[1]) };
}
const BEARING = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
function setSun(hour) {
  state.hour = hour;
  const { s, w } = sunDir(hour);
  const alt = Math.asin(clamp(s[2], -1, 1));
  sun.target.position.set(0, 1.5, 0);
  sun.position.copy(w).multiplyScalar(40).add(sun.target.position);
  sun.intensity = alt > 0 ? 2.5 * clamp(Math.sin(alt) * 2.4, 0.12, 1) : 0;
  const az = (Math.atan2(s[0], s[1]) * 180 / Math.PI + 360) % 360;
  const hh = Math.floor(hour), mm = Math.round((hour - hh) * 60);
  $('#sunOut').textContent = `${hh}:${String(mm).padStart(2, '0')}`;
  $('#sunInfo').textContent = alt > 0 ? `해 높이 ${Math.round(alt * 180 / Math.PI)}°, ${BEARING[Math.round(az / 45) % 8]}쪽` : '해가 졌습니다';
  shadowDirty();
}

// ------------------------------------------------------------------ 사람 (1.75 m) 과 북쪽 표시
const person = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.2, 4, 12), MAT.person); body.position.y = 0.77;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), MAT.person); head.position.y = 1.65;
  for (const m of [body, head]) { m.castShadow = true; person.add(m); }
  const a = toWorld(V.mean(rig.B1[0])), b = toWorld(V.mean(rig.B1[N]));
  person.position.set(6.7, 0, a.z + (b.z - a.z) * 0.45);      // 동쪽 입구 앞 (단면과 키 비교)
  scene.add(person);
}
const north = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.9), new THREE.Vector2(-0.32, -0.3), new THREE.Vector2(0, -0.1), new THREE.Vector2(0.32, -0.3)])),
  new THREE.MeshBasicMaterial({ color: tok('--ink') }));
north.rotation.x = -Math.PI / 2; north.position.set(8.0, 0.01, -6.0);
scene.add(north);
{
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = tok('--ink'); g.font = '500 92px "IBM Plex Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('북', 64, 70);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  lab.rotation.x = -Math.PI / 2; lab.position.set(8.0, 0.012, -7.4);
  scene.add(lab);
}

// 굵은 선: 길이가 같으면 버퍼를 다시 만들지 않고 값만 바꾼다
function setSeg(geo, arr) {
  const a = geo.attributes.instanceStart;
  if (a && a.data.array.length === arr.length) { a.data.array.set(arr); a.data.needsUpdate = true; geo.computeBoundingBox(); geo.computeBoundingSphere(); }
  else geo.setPositions(arr);
}

// ------------------------------------------------------------------ 접힘선 (산 빨강 / 골 파랑)
const creaseMat = new LineMaterial({ linewidth: 2.4, vertexColors: true });
const creaseLines = new LineSegments2(new LineSegmentsGeometry(), creaseMat);
creaseLines.visible = false; creaseLines.userData.noAO = true;
pav.add(creaseLines);
{
  const cM = new THREE.Color(tok('--signal')), cV = new THREE.Color(tok('--valley')), col = [];
  for (const c of rig.creases) { const k = c.mv === 'M' ? cM : cV; col.push(k.r, k.g, k.b, k.r, k.g, k.b); }
  creaseLines.geometry.setColors(col);
  $('#nM').textContent = rig.creases.filter((c) => c.mv === 'M').length;
  $('#nV').textContent = rig.creases.filter((c) => c.mv === 'V').length;
}
function updateCreaseLines() {
  if (!creaseLines.visible || !pose) return;
  const { B, frames } = pose, pos = [];
  for (const c of rig.creases) {
    const nn = V.unit(V.add(frames[c.pa].n, frames[c.pb].n)), off = V.mul(nn, 0.03);
    const a = V.add(B[c.ka][c.ja], off), b = V.add(B[c.kb][c.jb], off);
    pos.push(...a, ...b);
  }
  setSeg(creaseLines.geometry, pos);
}

// ------------------------------------------------------------------ 선 강조: 판 윤곽선 (앞뒤 면)
const outlineMat = new LineMaterial({ color: tok('--ink'), linewidth: 1.3 });
const outline = new LineSegments2(new LineSegmentsGeometry(), outlineMat);
outline.visible = CONFIG.style === 'line'; outline.userData.noAO = true;
pav.add(outline);
const OUTL = {};
for (let b = 1; b <= N; b++) {
  const t = TYPES['plate_' + b] || {}; const [L, W] = t.hole || [1.2, 0.3], cx = t.hole_cx || 0;
  OUTL[b] = [t.shape || rig.shapes[b], [[cx - L / 2, -W / 2], [cx + L / 2, -W / 2], [cx + L / 2, W / 2], [cx - L / 2, W / 2]]];
}
function updateOutline() {
  if (!outline.visible || !pose) return;
  const pos = [];
  const P = (f, q, s, off) => [0, 1, 2].map((i) => f.o[i] + f.x[i] * q[0] + f.y[i] * q[1] + f.z[i] * s + (off ? off[i] : 0));
  pose.frames.forEach((f, i) => {
    const off = offs ? offs[i] : null, th = ((TYPES['plate_' + f.band] || {}).thk || 0.03) / 2 + 0.003;
    for (const s of [th, -th]) for (const loop of OUTL[f.band]) for (let k = 0; k < loop.length; k++)
      pos.push(...P(f, loop[k], s, off), ...P(f, loop[(k + 1) % loop.length], s, off));
  });
  setSeg(outline.geometry, pos);
}

// ------------------------------------------------------------------ 하중 경로
const loadPath = { group: new THREE.Group(), paths: [] };
loadPath.group.visible = false; loadPath.group.userData.noAO = true;
pav.add(loadPath.group);
const lpLines = new LineSegments2(new LineSegmentsGeometry(), new LineMaterial({ color: tok('--signal'), linewidth: 2, transparent: true, opacity: 0.55 }));
const DOTS = 5;
const LP_COLS = []; for (let j = 0; j <= n; j += 3) LP_COLS.push(j);
const lpDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 12, 8), new THREE.MeshBasicMaterial({ color: tok('--signal') }), LP_COLS.length * 2 * DOTS);
lpDots.frustumCulled = false;
loadPath.group.add(lpLines, lpDots);
const arrowGeo = { shaft: new THREE.CylinderGeometry(0.04, 0.04, 1, 10).translate(0, 0.5, 0), head: new THREE.ConeGeometry(0.13, 0.32, 16).translate(0, 0.16, 0) };
function makeArrow(mat, len = 1.3) {
  const g = new THREE.Group();
  const s = new THREE.Mesh(arrowGeo.shaft, mat); s.scale.y = len - 0.32;
  const h = new THREE.Mesh(arrowGeo.head, mat); h.position.y = len - 0.32;
  g.add(s, h); return g;
}
const thrustMat = new THREE.MeshBasicMaterial({ color: tok('--signal') });
const thrust = [makeArrow(thrustMat), makeArrow(thrustMat)];
for (const a of thrust) { a.visible = false; pav.add(a); }
const _up = new THREE.Vector3(0, 1, 0);
function placeArrow(a, at, dir) {
  a.position.set(at[0], at[1], at[2]);
  a.quaternion.setFromUnitVectors(_up, new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
}
function buildLoadPath() {
  if (!pose) return;
  const { B, frames } = pose, seg = [];
  loadPath.paths = [];
  for (const j of LP_COLS) {
    const jj = Math.min(j, n - 1);
    const pts = [];
    for (let k = 0; k <= N; k++) {
      const ba = Math.max(k, 1), bb = Math.min(k + 1, N);
      const nn = V.unit(V.add(frames[pIndex(ba, jj)].n, frames[pIndex(bb, jj)].n));
      pts.push(V.add(B[k][j], V.mul(nn, 0.08)));
    }
    let apex = 0; pts.forEach((p, k) => { if (p[2] > pts[apex][2]) apex = k; });
    for (let k = 0; k < N; k++) seg.push(...pts[k], ...pts[k + 1]);
    for (const half of [pts.slice(0, apex + 1).reverse(), pts.slice(apex)]) {
      const cum = [0]; for (let k = 1; k < half.length; k++) cum.push(cum[k - 1] + Math.hypot(...V.sub(half[k], half[k - 1])));
      loadPath.paths.push({ pts: half, cum, L: cum[cum.length - 1] });
    }
  }
  setSeg(lpLines.geometry, seg);
  const A = V.mean(B[0]), Z = V.mean(B[N]);
  const out = V.unit([A[0] - Z[0], A[1] - Z[1], 0]);
  placeArrow(thrust[0], V.add(A, [out[0] * 0.25, out[1] * 0.25, 0.35]), out);
  placeArrow(thrust[1], V.add(Z, [-out[0] * 0.25, -out[1] * 0.25, 0.35]), V.mul(out, -1));
}
function animateLoadPath(time) {
  let i = 0;
  for (const p of loadPath.paths) {
    for (let d = 0; d < DOTS; d++) {
      const u = ((time * 0.22 + d / DOTS) % 1) * p.L;
      let k = 1; while (k < p.cum.length - 1 && p.cum[k] < u) k++;
      const s = (u - p.cum[k - 1]) / Math.max(p.cum[k] - p.cum[k - 1], 1e-9);
      const a = p.pts[k - 1], b = p.pts[k];
      _m.makeTranslation(a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s);
      lpDots.setMatrixAt(i++, _m);
    }
  }
  lpDots.count = i;
  lpDots.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------------ 구조 보강 (수정 후)
const fixes = new THREE.Group(); fixes.visible = false; pav.add(fixes);
const TIE_J = []; for (let j = 0; j <= n; j += 5) TIE_J.push(j);
function rod(a, b, r, mat) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  const len = A.distanceTo(Bv);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
  m.position.copy(A).add(Bv).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, Bv.clone().sub(A).normalize());
  m.castShadow = true;
  return m;
}
{
  const B = rig.B1;
  for (const j of [0, n]) for (let k = 0; k < N; k++) fixes.add(rod(B[k][j], B[k + 1][j], 0.05, MAT.added));
  for (const j of TIE_J) fixes.add(rod([B[0][j][0], B[0][j][1], 0.03], [B[N][j][0], B[N][j][1], 0.03], 0.022, MAT.added));
}
function refreshFixes() {
  const want = state.wantFixes && state.t > 0.999 && state.explode < 0.01;
  if (fixes.visible !== want) { fixes.visible = want; shadowDirty(); }
}

// ------------------------------------------------------------------ 3D 위 라벨
const tags = [];
function addTag(cls, html, anchor) {
  const el = document.createElement('div');
  el.className = 'tag ' + cls; el.innerHTML = html; el.style.opacity = 0;
  $('#labels').appendChild(el);
  const t = { el, anchor, on: false }; tags.push(t); return t;
}
const kMax = rig.turns.reduce((bi, v, i, a) => (Math.abs(v) > Math.abs(a[bi]) ? i : bi), 0) + 1;   // 가장 크게 꺾인 경계
const WEAK = [
  { no: 1, bad: '힌지가 풀리면 펴짐', fix: '꺾임 힌지 잠금', at: () => pose.B[kMax][Math.round(n / 2)] },
  { no: 2, bad: '발이 벌어짐', fix: '받침 슈와 바닥 아래 타이', at: () => V.mean(pose.B[N]) },
  { no: 3, bad: '끝 주름이 벌어짐', fix: '테두리 프레임', at: () => pose.B[2][0] },
].map((w) => ({ ...w, tag: addTag('', `<span class="pin">${w.no}</span><span class="txt">${w.bad}</span>`, () => toWorld(w.at())) }));
function setWeakTags(on, fixed) {
  for (const w of WEAK) {
    w.tag.on = on;
    w.tag.el.classList.toggle('fix', !!fixed);
    w.tag.el.querySelector('.txt').textContent = fixed ? w.fix : w.bad;
  }
}
const _v = new THREE.Vector3();
function instWorld(id, i) { IM[id].getMatrixAt(i, _m); return pav.localToWorld(new THREE.Vector3().setFromMatrixPosition(_m)); }
const JP = pIndex(Math.min(2, N), Math.round(n / 2));                        // 확대해서 볼 판
const JH = H1.zig.findIndex((h) => h.crease.ka === 1 && h.crease.ja === Math.round(n / 2));
const nearHinge = (p) => { const h = instWorld('hinge_zig', Math.max(JH, 0)); return h.lerp(p, 0.4); };
const jointTags = [
  addTag('plain', `<span class="pin"></span><span class="txt">판 ${(TYPES.plate_2 || {}).material || 'LVL'}</span>`, () => nearHinge(instWorld('plate_' + panels[JP].b, plateIdx[JP]))),
  addTag('plain', `<span class="pin"></span><span class="txt">${(TYPES.hinge_zig || {}).name || '힌지'}: ${(TYPES.hinge_zig || {}).material || ''}</span>`, () => instWorld('hinge_zig', Math.max(JH, 0))),
  addTag('plain', `<span class="pin"></span><span class="txt">${(TYPES[winRef[JP].id] || {}).name || '창 모듈'}: ${(TYPES[winRef[JP].id] || {}).material || ''}</span>`, () => nearHinge(instWorld(winRef[JP].id, winRef[JP].idx))),
];
const personTag = addTag('plain', '<span class="pin"></span><span class="txt">사람 1.75 m</span>', () => new THREE.Vector3(person.position.x, 1.95, person.position.z));
personTag.occlude = true;
for (const w of WEAK) w.tag.occlude = false;
const ray = new THREE.Raycaster();
let tagFrame = 0;
function hidden(p) {          // 판에 가려졌는지
  if (rcam.isOrthographicCamera) {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(rcam.quaternion);
    ray.set(p.clone().addScaledVector(dir, -100), dir); ray.far = 99.85;
  } else { ray.set(rcam.position, p.clone().sub(rcam.position).normalize()); ray.far = p.distanceTo(rcam.position) - 0.15; }
  return ray.intersectObjects(Object.keys(IM).filter((k) => k.startsWith('plate_')).map((k) => IM[k]), false).length > 0;
}
function updateTags() {
  const W = innerWidth, Hh = innerHeight;
  const check = (tagFrame++ % 8) === 0;
  for (const t of tags) {
    if (!t.on) { if (t.el.style.opacity !== '0') t.el.style.opacity = 0; continue; }
    const p = t.anchor();
    if (t.occlude && check) t.blocked = hidden(p);
    _v.copy(p).project(rcam);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1 && !(t.occlude && t.blocked);
    t.el.style.opacity = vis ? 1 : 0;
    t.el.style.left = ((_v.x + 1) / 2 * W).toFixed(1) + 'px';
    t.el.style.top = ((1 - _v.y) / 2 * Hh).toFixed(1) + 'px';
  }
}

// ------------------------------------------------------------------ 카메라
const tweens = new Set();
function tween(sec, fn, done) { const tw = { t0: performance.now(), dur: REDUCED ? 1 : sec * 1000, fn, done }; tweens.add(tw); return tw; }
let camTw = null, foldTw = null;
function fitFactor() { const a = innerWidth / innerHeight; return a < 1.5 ? Math.pow(1.5 / a, 0.75) : 1; }
const _s0 = new THREE.Spherical(), _s1 = new THREE.Spherical();
function flyTo(p, tg, sec = 1.6) {
  const T = new THREE.Vector3(...tg);
  const P = new THREE.Vector3(...p).sub(T).multiplyScalar(fitFactor()).add(T);
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  _s0.setFromVector3(p0.clone().sub(t0)); _s1.setFromVector3(P.clone().sub(T));
  const a = { ..._s0 }, b = { ..._s1 };
  let dth = b.theta - a.theta; dth = ((dth + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  if (camTw) tweens.delete(camTw);
  const s = new THREE.Spherical();
  camTw = tween(sec, (u) => {
    controls.target.lerpVectors(t0, T, u);
    s.set(a.radius + (b.radius - a.radius) * u, a.phi + (b.phi - a.phi) * u, a.theta + dth * u);
    camera.position.setFromSpherical(s).add(controls.target);
  }, () => { camTw = null; });
}
controls.addEventListener('start', () => { if (camTw) { tweens.delete(camTw); camTw = null; } });

const CAM = {
  idea: [[17.5, 8, 17.5], [0, 2.2, 0]],
  data0: [[12.5, 12, 14], [0, 2.0, 0]],
  data1: [[4.6, 1.7, -2.4], [-2.5, 0.5, 1.3]],
  night: [[17, 4.6, 15.5], [0, 2.0, 0]],
  logic: [[-15, 14, 17], [0, 1.0, 0]],
  struct: [[16.5, 4.4, 7.0], [0, 2.4, -0.3]],
  make: [[-13.5, 9.5, 13], [0, 2.4, 0]],
};
function jointCam() {
  const h = toWorld(rig.hinges(pose.B).zig[Math.max(JH, 0)].o);       // 펼침 0 기준 위치
  const f = pose.frames;
  const nn = V.unit(V.add(f[pIndex(1, Math.round(n / 2))].n, f[pIndex(2, Math.round(n / 2))].n));
  const nw = toWorld(nn).sub(toWorld([0, 0, 0]));
  const p = h.clone().add(nw.multiplyScalar(2.6)).add(new THREE.Vector3(1.3, 0.6, 0));
  return [[p.x, p.y, p.z], [h.x, h.y, h.z]];
}
let camKey = null;
function camFor(si, st) {
  if (si === 0 || (si === 4 && st === 3)) return 'idea';
  if (si === 1) return st === 0 ? 'data0' : state.night ? 'night' : 'data1';
  if (si === 2) return 'logic';
  if (si === 3) return 'struct';
  if (si === 4) return state.joint ? 'joint' : st === 2 ? 'logic' : 'make';
}
function moveCamera(force = false) {
  const key = camFor(state.scene, state.step);
  if (!force && key === camKey) return;
  camKey = key;
  const [p, t] = key === 'joint' ? jointCam() : CAM[key];
  flyTo(p, t, key === 'joint' ? 1.8 : 1.6);
}

// ------------------------------------------------------------------ 화면 크기와 시점 이동 (패널을 피해 모델을 가운데로)
function layout() {
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  for (const m of [creaseMat, lpLines.material, outlineMat]) m.resolution.set(W, H);
  ocam.left = -O_H / 2 * W / H; ocam.right = O_H / 2 * W / H; ocam.top = O_H / 2; ocam.bottom = -O_H / 2;
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); }
  let sx = 0, sy = 0;
  if (W > 860) {
    const card = $('#card').getBoundingClientRect();
    const sideOn = $('.sidebox.on');
    const left = card.width ? card.right : 0;
    const right = sideOn ? W - sideOn.getBoundingClientRect().left : 0;
    sx = (left - right) / 2;
  } else {
    sy = ($('#card').getBoundingClientRect().height || 0) / 2.2;
  }
  for (const c of [camera, ocam]) { if (sx || sy) c.setViewOffset(W, H, -sx, sy, W, H); else c.clearViewOffset(); c.updateProjectionMatrix(); }
}
addEventListener('resize', layout);

// ------------------------------------------------------------------ 패널 내용
function fillSide() {
  // 데이터 범례
  $('#dataLabel').textContent = DAT.label || '6~8월 누적 일사';
  $('#dataUnit').textContent = (DAT.unit || 'kWh/m2').replace('m2', 'm²');
  $('#rampBar').style.background = rampCSS;
  const tk = [rmin, thr[0], thr[1], rmax];
  $('#rampTicks').innerHTML = tk.map((v) => `<span style="left:${norm(v) * 100}%">${Math.round(v)}</span>`).join('');
  if (DAT.source !== 'Ladybug') $('#dataLead').textContent = `판 ${NP}장마다 GH 로 추정한 6~8월 누적 일사량입니다. 진할수록 해를 많이 받습니다.`;
  $('#dataSrc').textContent = DAT.source === 'Ladybug' ? '출처: Ladybug Incident Radiation, 6월 1일~8월 31일' : '지금은 GH 추정값입니다. Ladybug 결과로 다시 저장하면 바뀝니다.';
  // 값 -> 바뀐 것 (판 150장을 일사 순으로)
  const order = rads.map((v, i) => i).sort((a, b) => rads[a] - rads[b]);
  const bw = 300 / NP, kc = [tok('--open'), tok('--perf'), tok('--solid')];
  let svg = '';
  order.forEach((i, x) => {
    svg += `<rect x="${(x * bw).toFixed(2)}" y="0" width="${(bw + 0.05).toFixed(2)}" height="30" fill="${'#' + rampColor(norm(rads[i])).getHexString(THREE.SRGBColorSpace)}"/>`;
    svg += `<rect x="${(x * bw).toFixed(2)}" y="34" width="${(bw + 0.05).toFixed(2)}" height="16" fill="${kc[kinds[i]]}"/>`;
  });
  svg += '<text x="0" y="62" font-size="9" fill="#57616d">적게 받는 판</text><text x="300" y="62" font-size="9" fill="#57616d" text-anchor="end">많이 받는 판</text>';
  $('#strip').innerHTML = svg;
  const words = [['적음', '열림', TYPES.win_open], ['중간', '타공', TYPES.win_perf], ['많음', '막힘', TYPES.win_solid]];
  $('#ruleList').innerHTML = words.map(([a, b, t], k) =>
    `<li><span class="key" style="background:${kc[k]};width:12px;height:12px"></span><span>${a} → <b>${b}</b><br><span class="small">${t ? t.material : ''}${BAND_KIND[k].length ? ', ' + BAND_KIND[k].join(', ') : ''}</span></span><span class="n">${kindCount[k]}</span></li>`).join('');
  // GH 흐름
  const P = D.params, tot = D.types.reduce((s, t) => s + t.count, 0);
  $('#flow').innerHTML = `
    <section><h4>입력</h4><ul><li>단면 점 ${P.profile.length}개 (사람 키 위로 지붕)</li><li>판 폭 ${P.w} m, ${P.n}줄</li><li>주름 각 ${P.phi}°, 접기 0~1</li><li>Ladybug 일사 (판마다)</li></ul></section>
    <div class="arrow">↓</div>
    <section><h4>규칙</h4><ul><li>꺾임 각 ${rig.turns.map((v) => Math.round(v) + '°').join(', ')} → 지그재그 길이</li><li>접힘선마다 거울처럼 뒤집어 접기</li><li>일사 3구간 → 창 열림, 타공, 막힘</li></ul></section>
    <div class="arrow">↓</div>
    <section><h4>출력</h4><ul><li>블록 ${D.types.length}종, ${won(tot)}개 → 라이노 Bake</li><li>pavilion.json → 이 웹</li></ul></section>`;
  // 부재 표
  const fam = [];
  for (const t of D.types) { let f = fam.find((x) => x.name === t.family); if (!f) fam.push(f = { name: t.family, items: [] }); f.items.push(t); }
  let rows = '<tr><th>블록</th><th class="num">개수</th></tr>';
  for (const f of fam) {
    rows += `<tr class="fam"><td>${f.name} ${f.items.length}종</td><td class="num">${won(f.items.reduce((s, t) => s + t.count, 0))}</td></tr>`;
    for (const t of f.items) rows += `<tr><td><span class="key" style="background:${t.color}"></span>${t.name}<span class="mat">${t.material}</span></td><td class="num">${won(t.count)}</td></tr>`;
  }
  rows += `<tr class="total"><td>${D.types.length}종</td><td class="num">${won(tot)}</td></tr>`;
  $('#countTable').innerHTML = rows;
  $$('[data-count]').forEach((el) => { el.textContent = won(countOf(el.dataset.count)); });
  // 주름 깊이
  const dep = P.w * Math.sin(THREE.MathUtils.degToRad(P.phi));
  $('#depthTxt').textContent = dep.toFixed(2) + ' m';
  $('#depthRatio').textContent = Math.round(rig.stats(rig.B1).span / dep);
}

// GH 와 웹 비교 (같은 공식인지)
function matchCheck() {
  const by = {};
  for (const it of D.instances || []) (by[it.type] ||= []).push(it);
  const p1 = rig.pose(1);
  let err = 0, cnt = 0;
  p1.frames.forEach((f, i) => {
    const J = (by['plate_' + f.band] || [])[plateIdx[i]];
    if (J) { err = Math.max(err, Math.hypot(...V.sub(J.p, f.o))); cnt++; }
  });
  $('#matchInfo').textContent = cnt ? `GH 가 저장한 판 ${cnt}장의 위치와 이 웹이 같은 공식으로 다시 계산한 위치의 차이는 최대 ${(err * 1000).toFixed(1)} mm 입니다.` : 'pavilion.json 에 인스턴스가 없어 비교하지 못했습니다.';
}

function updateFoldReadout() {
  const pct = Math.round(state.t * 100);
  const s = rig.stats(pose.B);
  $('#foldStats').textContent = `접기 ${pct}%: 폭 ${s.span.toFixed(1)} m × 길이 ${s.depth.toFixed(1)} m, 높이 ${s.height.toFixed(1)} m`;
  const r = $('#foldT');
  if (document.activeElement !== r) r.value = pct;
  $('#foldOut').textContent = pct + '%';
  r.style.setProperty('--p', pct + '%');
}

// 재료 (반사)
const PRESETS = [
  { id: 'lvl', name: 'LVL 목재', color: '#cdb892', rough: 0.72, metal: 0, refl: 0.4, note: '부드럽게 퍼지는 반사' },
  { id: 'corten', name: '내후성 강판', color: '#8a4a2c', rough: 0.82, metal: 0.35, refl: 0.15, note: '빛을 거의 먹음' },
  { id: 'alu', name: '알루미늄 판', color: '#c9cdd2', rough: 0.3, metal: 1, refl: 0.7, note: '은은한 금속 반사' },
  { id: 'mirror', name: '미러 스테인리스', color: '#e4e7ea', rough: 0.05, metal: 1, refl: 0.6, note: '주변을 거울처럼 비춤' },
];
if (CONFIG.style !== 'real') PRESETS.unshift({ id: 'model', name: '모형 흰색', color: '#efefec', rough: 0.92, metal: 0, refl: 0.8, note: '재료 대신 형태만' });
$('#matList').innerHTML = PRESETS.map((p, i) => `<label><input type="radio" name="mat" value="${i}" ${i === 0 ? 'checked' : ''}><span>${p.name}<span class="small" style="display:block">${p.note}, 반사율 약 ${Math.round(p.refl * 100)}%</span></span><span class="bar"><i style="width:${p.refl * 100}%"></i></span></label>`).join('');
$$('#matList input').forEach((r) => r.addEventListener('change', () => {
  const p = PRESETS[+r.value];
  MAT.plate.color.set(p.color); MAT.plate.roughness = p.rough; MAT.plate.metalness = p.metal;
  scene.environmentIntensity = p.metal > 0.5 ? 0.8 : 0.45;
}));

// ------------------------------------------------------------------ 발표 노트 (N)
const NOTES = [
  [`제 파빌리온은 '${NAME}'입니다. 한 문장으로 말하면, ${CONCEPT}.`,
    `참고한 것은 리베스킨트의 Eighteen Turns(2001)입니다. 접은 판으로 벽과 지붕을 한 몸으로 만들었죠. 저는 그 접힌 모양을 고정된 조각이 아니라, 평평한 판 한 장이 실제로 접혀 서는 구조로 바꿨습니다.`],
  [`데이터는 Ladybug 로 계산한 6~8월 누적 일사량입니다. 판 ${NP}장마다 값이 다르고, 진할수록 여름 해를 많이 받습니다. 가장 많이 받는 곳은 ${TOP_BAND}입니다.`,
    `이 값이 창의 종류를 바꿨습니다. 많이 받는 ${BAND_KIND[2].join('과 ') || '판'}은 막고, 중간인 ${BAND_KIND[1].join('과 ') || '판'}은 타공판으로 거르고, 적게 받는 ${BAND_KIND[0].join('과 ') || '판'}은 열었습니다. 열림 ${kindCount[0]}, 타공 ${kindCount[1]}, 막힘 ${kindCount[2]}. 시간을 움직이면 안쪽 바닥의 빛 얼룩이 바뀝니다.`],
  [`로직은 접는 값 하나입니다. 0이면 평평한 판, 100이면 파빌리온입니다. 판은 휘거나 늘어나지 않고 접힘선에서만 돕니다. 빨간 선이 산접기, 파란 선이 골접기입니다.`,
    `그래스호퍼는 세 그룹입니다. 입력은 단면 점과 판 폭, 줄 수, 주름 각. 규칙은 꺾임 각으로 지그재그 길이를 정하고, 접힘선마다 뒤집어 접고, 일사로 창을 고릅니다. 출력은 블록 ${D.types.length}종과 pavilion.json. 웹도 같은 공식이라 위치가 그대로 맞습니다.`],
  [`구조는 주름이 보 역할을 합니다. 힘은 주름을 따라 양쪽 발로 내려갑니다.`,
    `AI 에게 약점을 물었더니 세 가지였습니다. 첫째, 힌지가 풀려 있으면 이건 구조가 아니라 접히는 기계라서 자기 무게에 펴지며 주저앉습니다. 둘째, 아치처럼 발이 바깥으로 벌어집니다. 셋째, 열린 양 끝의 주름이 벌어집니다.`,
    `그래서 꺾임 힌지에 잠금판, 발에는 받침 슈와 바닥 아래 타이, 양 끝에는 테두리 프레임을 더했습니다.`],
  [`부재는 판 ${N}종, 창 3종, 힌지 2종, 받침 1종, 모두 ${D.types.length}종 ${won(D.types.reduce((s, t) => s + t.count, 0))}개입니다. 판은 띠마다 모양이 하나라서 ${N}종이면 됩니다.`,
    `조인트는 판과 판 사이의 핀 힌지이고, 창 모듈은 판의 구멍에 끼웁니다. 재료를 바꾸면 반사가 달라집니다. LVL 은 반사가 낮아 안쪽 빛 얼룩이 또렷합니다.`,
    `생산은 땅에서 평평하게 조립하고, 접어 올리고, 힌지를 잠그고, 받침을 고정합니다. 해체는 거꾸로, 다시 평평하게 펴서 옮깁니다.`,
    `이 아래에서 사람은 시간마다 자리를 옮기는 빛 얼룩 사이를 걷고 머뭅니다. 다시 처음 문장으로. ${CONCEPT}. 감사합니다.`],
];
const TITLES = ['아이디어', '데이터', '로직', '구조·AI', '재료·조인트·생산'];
const AIM = ['0:30', '1:10', '1:55', '2:35', '3:45'];   // 장면이 끝날 시각 (3분 45초)
const STEPS = NOTES.map((s) => s.length);

// ------------------------------------------------------------------ 장면 이동
const nav = $('#nav');
nav.innerHTML = TITLES.map((t, i) => `${i ? '<span class="link"></span>' : ''}<button type="button" data-s="${i}"><span class="dot">${i + 1}</span><span class="label">${t}</span><span class="sub">${'<i></i>'.repeat(STEPS[i])}</span></button>`).join('');
$$('#nav button').forEach((b) => b.addEventListener('click', () => go(+b.dataset.s, 0)));
$('#next').addEventListener('click', () => next());
$('#prev').addEventListener('click', () => prev());
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => { const [s, t] = b.dataset.goto.split(',').map(Number); go(s, t); }));

let seen = 0, runId = 0;
function go(si, st) {
  si = clamp(si, 0, 4); st = clamp(st, 0, STEPS[si] - 1);
  const prevScene = state.scene, prevStep = state.step;
  state.scene = si; state.step = st;
  seen = Math.max(seen, si);
  startTimer();
  // 카드와 패널
  $$('.scene').forEach((a) => a.classList.toggle('on', +a.dataset.scene === si));
  $$(`.scene[data-scene="${si}"] .step`).forEach((s) => s.classList.toggle('on', s.classList.contains('keep') ? +s.dataset.step <= st : +s.dataset.step === st));
  document.body.classList.toggle('closing', si === 4 && st === 3);
  $$('.sidebox').forEach((s) => s.classList.toggle('on', +s.dataset.for === si));
  $('#ruleBox').hidden = !(si === 1 && st >= 1);
  $('#aiBox').classList.toggle('fixed', si === 3 && st === 2);
  $$('[data-goto]').forEach((b) => { const [s, t] = b.dataset.goto.split(',').map(Number); b.setAttribute('aria-pressed', String(s === si && t === st)); });
  $$('#nav button').forEach((b, i) => {
    b.classList.toggle('on', i === si); b.classList.toggle('seen', i <= seen);
    $$('.sub i', b).forEach((d, k) => d.classList.toggle('on', i === si && k <= st));
  });
  $('#notes').innerHTML = `<small>${si + 1}-${st + 1} ${TITLES[si]}, 이 장면은 ${AIM[si]} 까지</small>${NOTES[si][st]}`;
  enter(si, st, prevScene, prevStep);
  layout();
}
function next() { if (state.step < STEPS[state.scene] - 1) go(state.scene, state.step + 1); else if (state.scene < 4) go(state.scene + 1, 0); }
function prev() { if (state.step > 0) go(state.scene, state.step - 1); else if (state.scene > 0) go(state.scene - 1, STEPS[state.scene - 1] - 1); }

function animateT(to, sec) {
  return new Promise((res) => {
    if (foldTw) tweens.delete(foldTw);
    const from = state.t;
    if (Math.abs(to - from) < 1e-4) { applyPose(to); res(); return; }
    foldTw = tween(sec, (u) => applyPose(from + (to - from) * u), () => { foldTw = null; res(); });
  });
}
function setExplode(v) {
  state.explode = v;
  const r = $('#explode'); r.value = Math.round(v * 100); r.style.setProperty('--p', r.value + '%');
  $('#explodeOut').textContent = r.value + '%';
  applyPose(state.t);
}

function enter(si, st, ps, pst) {
  const run = ++runId;
  // 기본값 (장면마다 같은 것을 같은 방식으로)
  setPlateMode(si === 1 && st === 0 ? 'data' : 'material');
  setWindows(!(si === 1 && st === 0));
  setSun(si === 1 ? +$('#sunHour').value : 15.5);
  creaseLines.visible = si === 2 && $('#creaseToggle').checked;
  loadPath.group.visible = si === 3 && $('#loadToggle').checked;
  thrust.forEach((a) => { a.visible = si === 3 && st === 1; });
  setWeakTags(si === 3 && st >= 1, si === 3 && st === 2);
  for (const t of jointTags) t.on = si === 4 && !!state.joint && camKey === 'joint';
  personTag.on = si === 0 && st === 0;
  $('#closing').classList.toggle('on', si === 4 && st === 3);
  showGlb();
  if (si !== 4) { if (state.joint) setJoint(false); if (explodeTw) { tweens.delete(explodeTw); explodeTw = null; } if (state.explode) setExplode(0); }
  state.wantFixes = (si === 3 && st === 2) || (si === 4 && state.assembled);
  IM.shoe.visible = !(si === 4 && !state.assembled);
  setHingeLook(si === 3 && st === 2 ? 'locked' : si === 4 ? (state.locked ? 'locked' : 'block') : 'steel');
  IM.hinge_gen.visible = IM.hinge_zig.visible = si >= 2;            // 아이디어·데이터 장면은 판과 창만
  const inside = si === 1 && st === 1;
  if (state.night && !inside) setNight(false);
  const SH = CONFIG.shadow === 'sharp' ? 0.6 : 1;     // 선명하게: 그늘을 더 진하게
  if (!state.night) { hemi.intensity = inside ? 0.42 * SH : HEMI; scene.environmentIntensity = (inside ? 0.22 : (MAT.plate.metalness > 0.5 ? 0.8 : CONFIG.style === 'line' ? 0.7 : 0.45)) * SH; }
  controls.autoRotate = (si === 0 || (si === 4 && st === 3)) && !REDUCED;

  // 장면별 움직임
  if (si === 2) {
    if (st === 0 && ps !== 2) { applyPose(0); setTimeout(() => { if (run === runId) animateT(1, 4.2); }, 900); }
  } else if (si === 3) {
    if (st === 1) animateT(0.72, 1.8);
    else animateT(1, 1.2);
  } else if (si === 4) {
    if (st === 2 && pst !== 2) playAssembly(run);
    else if (st !== 2 && state.t < 0.999) { state.assembling = false; animateT(1, 1.4); }
    if (st !== 2 && !state.assembled) { state.assembled = true; state.locked = false; IM.shoe.visible = true; state.wantFixes = true; setHingeLook('block'); }
    if (st === 0 && ps !== 4) { setExplode(0); setTimeout(() => { if (run === runId) animateExplode(0.6, 2.2); }, 600); }
    if (st < 2) { state.locked = false; setHingeLook('block'); }
    const wantJoint = st === 1;
    if (st >= 1 && state.explode) animateExplode(0, 0.9);
    if (state.joint !== wantJoint) setJoint(wantJoint, st >= 1 && state.explode ? 950 : 0);
  } else if (state.t < 0.999 && !foldTw) animateT(1, 1.2);
  refreshFixes();
  if (loadPath.group.visible) buildLoadPath();
  if (creaseLines.visible) updateCreaseLines();
  moveCamera();
}

// 조립과 해체
function setSeq(k, done = false) { $$('#seq li').forEach((li, i) => { li.classList.toggle('done', i < k || done); li.classList.toggle('now', i === k && !done); }); }
async function playAssembly(run = ++runId) {
  state.assembling = true;
  if (state.explode) setExplode(0);
  state.locked = false; setHingeLook('block');
  state.assembled = false; state.wantFixes = false; IM.shoe.visible = false; refreshFixes();
  setSeq(0);
  await animateT(0, state.t > 0.01 ? 1.6 : 0.01); if (run !== runId) return;
  await sleep(900); if (run !== runId) return;
  setSeq(1); await animateT(1, 4.2); if (run !== runId) return;
  setSeq(2); state.locked = true; setHingeLook('locked'); await sleep(1100); if (run !== runId) return;
  setSeq(3); state.assembled = true; IM.shoe.visible = true; state.wantFixes = true; refreshFixes(); shadowDirty();
  await sleep(900); if (run !== runId) return;
  setSeq(4, true); state.assembling = false;
}
async function playDisassembly() {
  const run = ++runId;
  state.assembling = true;
  setSeq(3); state.assembled = false; IM.shoe.visible = false; state.wantFixes = false; refreshFixes(); shadowDirty();
  await sleep(700); if (run !== runId) return;
  setSeq(2); state.locked = false; setHingeLook('block'); await sleep(700); if (run !== runId) return;
  setSeq(1); await animateT(0, 3.6); if (run !== runId) return;
  setSeq(0); state.assembling = false;
}
$('#assemble').addEventListener('click', () => playAssembly());
$('#disassemble').addEventListener('click', () => playDisassembly());

// ------------------------------------------------------------------ 조작 연결
function bindRange(el, fn) {
  const upd = () => { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); fn(+el.value); };
  el.addEventListener('input', upd);
  el.addEventListener('pointerup', () => el.blur());
  upd();
}
bindRange($('#sunHour'), (v) => { if (state.scene === 1) setSun(v); });
bindRange($('#foldT'), (v) => { if (state.scene === 2 && (document.activeElement === $('#foldT') || !foldTw)) { if (foldTw) { tweens.delete(foldTw); foldTw = null; } applyPose(v / 100); } });
bindRange($('#explode'), (v) => { if (state.scene === 4 && Math.abs(v / 100 - state.explode) > 1e-3) { state.explode = v / 100; $('#explodeOut').textContent = v + '%'; applyPose(state.t); if (state.joint) { camKey = null; moveCamera(); } } });
$('#foldPlay').addEventListener('click', () => { applyPose(0); animateT(1, 4.2); });
$('#creaseToggle').addEventListener('change', (e) => { creaseLines.visible = e.target.checked && state.scene === 2; updateCreaseLines(); });
$('#loadToggle').addEventListener('change', (e) => { loadPath.group.visible = e.target.checked && state.scene === 3; buildLoadPath(); });
let explodeTw = null;
function animateExplode(to, sec) {
  if (explodeTw) tweens.delete(explodeTw);
  const from = state.explode;
  explodeTw = tween(sec, (u) => setExplode(from + (to - from) * u), () => { explodeTw = null; });
}
function setJoint(on, delay = 0) {
  state.joint = on;
  const b = $('#jointBtn'); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '전체 보기' : '조인트 확대';
  setTimeout(() => {
    if (state.joint !== on) return;
    for (const t of jointTags) t.on = on && state.scene === 4;
    camKey = null; moveCamera();
  }, delay);
}
$('#jointBtn').addEventListener('click', () => { const on = !state.joint; if (on && state.explode) { animateExplode(0, 0.8); setJoint(on, 850); } else setJoint(on); });

// GH 캡처 이미지
const ghImg = $('#ghImg');
ghImg.addEventListener('load', () => { ghImg.hidden = false; $('#ghEmpty').hidden = true; });
ghImg.src = './assets/gh_canvas.png';
ghImg.addEventListener('click', () => { const lb = $('#lightbox'); lb.querySelector('img').src = ghImg.src; lb.classList.add('on'); });
$('#lightbox').addEventListener('click', (e) => e.currentTarget.classList.remove('on'));

// 라이노 glb (있으면 3장면에서 보기)
let glb = null;
function showGlb() {
  if (!glb) return;
  const on = state.scene === 2 && $('#glbToggle').checked;
  glb.visible = on;
  if (CONFIG.glb !== 'ghost') { pav.visible = !on; if (on && state.t < 0.999) animateT(1, 1); }
  shadowDirty();
}
new GLTFLoader().load('./pavilion.glb', (g) => {
  glb = g.scene;
  if (CONFIG.glb === 'ghost') {
    const ghost = new THREE.MeshBasicMaterial({ color: tok('--cobalt'), wireframe: true, transparent: true, opacity: 0.35 });
    glb.traverse((o) => { if (o.isMesh) o.material = ghost; });
  } else {
    glb.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.material.color.convertSRGBToLinear(); /* 라이노는 화면색을 그대로 적어 보냄 */ if (o.material.name === '창-열림') { o.material.transparent = true; o.material.opacity = 0.45; o.material.depthWrite = false; } } });
    $('#glbRow').lastChild.textContent = ' 라이노에서 내보낸 glb 로 보기';
  }
  glb.visible = false; scene.add(glb);
  $('#glbRow').hidden = false;
  $('#glbToggle').addEventListener('change', () => showGlb());
}, undefined, () => {});

// ------------------------------------------------------------------ 밤 보기 (데이터 장면, CONFIG.night)
const lamp = new THREE.PointLight('#ffc888', 0, 0, 2);
lamp.castShadow = true; lamp.shadow.mapSize.set(LITE ? 512 : 1024, LITE ? 512 : 1024);
lamp.shadow.bias = -0.003; lamp.shadow.camera.near = 0.1; lamp.shadow.camera.far = 30;
{ const a = toWorld(V.mean(rig.B1[0])), b = toWorld(V.mean(rig.B1[N])); lamp.position.set(0, 2.1, (a.z + b.z) / 2); }
scene.add(lamp);
const DAY = { bg: BG.clone(), ground: new THREE.Color(tok('--ground')) };
state.night = false;
function setNight(on) {
  state.night = on;
  document.body.classList.toggle('night', on);
  const bg = on ? new THREE.Color('#0e131a') : DAY.bg;
  scene.background.copy(bg); scene.fog.color.copy(bg);
  ground.material.color.copy(on ? new THREE.Color('#161c24') : DAY.ground);
  lamp.intensity = on ? 14 : 0;
  sun.visible = !on;
  hemi.intensity = on ? 0.05 : (state.scene === 1 && state.step === 1 ? 0.42 : HEMI);
  scene.environmentIntensity = on ? 0.03 : 0.22;
  MAT.open.emissive.set(on ? '#ffcf96' : '#000000'); MAT.open.emissiveIntensity = on ? 0.8 : 0;
  $$('#dayNight button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.night === '1') === on)));
  shadowDirty();
}
if (CONFIG.night) {
  const box = document.createElement('div');
  box.className = 'seg'; box.id = 'dayNight'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', '낮과 밤');
  box.innerHTML = '<button type="button" data-night="0" aria-pressed="true">낮</button><button type="button" data-night="1" aria-pressed="false">밤</button>';
  $('.scene[data-scene="1"] .step[data-step="1"] h3').after(box);
  box.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; setNight(b.dataset.night === '1'); camKey = null; moveCamera(); });
}

// ------------------------------------------------------------------ 원근 / 평행 전환
function setOrtho(on) {
  state.ortho = on;
  $$('#camSeg button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.cam === 'ortho') === on)));
}
$$('#camSeg button').forEach((b) => b.addEventListener('click', () => { setOrtho(b.dataset.cam === 'ortho'); b.blur(); }));
setOrtho(state.ortho);

// ------------------------------------------------------------------ 타이머와 키
let t0 = null;
function startTimer() { if (t0 === null && (state.scene > 0 || state.step > 0)) t0 = performance.now(); }
function drawTimer(now) {
  const s = t0 === null ? 0 : Math.floor((now - t0) / 1000);
  const el = $('#timer');
  el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} / 3:45`;
  el.classList.toggle('late', s > 225);
}
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const inRange = e.target.matches && e.target.matches('input[type=range]');
  const k = e.key;
  if ((k === 'ArrowRight' || k === 'PageDown') && !inRange) { e.preventDefault(); next(); }
  else if ((k === 'ArrowLeft' || k === 'PageUp') && !inRange) { e.preventDefault(); prev(); }
  else if (k >= '1' && k <= '5') go(+k - 1, 0);
  else if (k === 'r' || k === 'R') { camKey = null; moveCamera(true); }
  else if (k === 'n' || k === 'N') $('#notes').classList.toggle('on');
  else if (k === 't' || k === 'T') t0 = null;
  else if (k === 'f' || k === 'F') { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
  else if (k === 'p' || k === 'P') { if (state.scene === 2) $('#foldPlay').click(); if (state.scene === 4) playAssembly(); }
  else if (k === 'o' || k === 'O') setOrtho(!state.ortho);
  else if (k === 'Escape') $('#lightbox').classList.remove('on');
});

// ------------------------------------------------------------------ 시작
fillSide();
matchCheck();
applyPose(REDUCED || CONFIG.intro === 'still' ? 1 : 0.0);
go(0, 0);
{
  const [p, t] = CAM.idea; const T = new THREE.Vector3(...t);
  camera.position.set(...p).sub(T).multiplyScalar(fitFactor()).add(T); controls.target.copy(T); camKey = 'idea';
}
if (!REDUCED && CONFIG.intro !== 'still') setTimeout(() => { if (state.scene === 0) animateT(1, 3.6); }, 700);
layout();

const clock = new THREE.Clock();
renderer.setAnimationLoop((now) => {
  for (const tw of [...tweens]) {
    const u = clamp((now - tw.t0) / tw.dur, 0, 1);
    tw.fn(ease(u));
    if (u >= 1) { tweens.delete(tw); tw.done && tw.done(); }
  }
  controls.autoRotate = (state.scene === 0 || (state.scene === 4 && state.step === 3)) && !camTw && !REDUCED;
  controls.update();
  if (loadPath.group.visible) animateLoadPath(clock.getElapsedTime());
  syncCams();
  updateTags();
  drawTimer(now);
  if (composer) composer.render(); else renderer.render(scene, rcam);
});
window.__pav = { state, go, rig, applyPose, setExplode, camera, controls };
