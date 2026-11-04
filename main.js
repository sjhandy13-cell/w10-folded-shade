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
function bandKinds(arr) {                // 창 종류마다 그 종류가 가장 많은 띠 이름
  const out = [[], [], []];
  for (let b = 1; b <= N; b++) {
    const c = [0, 0, 0]; for (let j = 0; j < n; j++) c[arr[pIndex(b, j)]]++;
    out[c.indexOf(Math.max(...c))].push(bandName(b));
  }
  return out;
}
const BAND_KIND = bandKinds(kinds);

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
const BASE_EXPOSURE = CONFIG.tone === 'aces' ? 1.1 : CONFIG.tone === 'agx' ? 1.15 : 1;
renderer.toneMappingExposure = BASE_EXPOSURE;
const shadowDirty = () => { renderer.shadowMap.needsUpdate = true; };

const scene = new THREE.Scene();
const BG = new THREE.Color(tok('--paper'));
scene.background = BG;
scene.fog = new THREE.Fog(BG, 34, 78);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 300);
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
const FOG = { park: false };
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
  const useO = state.ortho && !PERSP_ONLY.has(camKey) && !pov.on;
  if (useO) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    ocam.position.copy(controls.target).addScaledVector(dir, O_D);
    ocam.quaternion.copy(camera.quaternion);
    ocam.zoom = O_H / (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    ocam.updateProjectionMatrix(); ocam.updateMatrixWorld();
  }
  setRenderCam(useO ? ocam : camera);
  const extra = useO ? O_D - d : 0;
  scene.fog.near = (FOG.park ? 48 : 34) + extra; scene.fog.far = (FOG.park ? 120 : 78) + extra;
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
const kindsLive = kinds.slice();                 // 데이터 장면에서 경계값을 움직이면 바뀜 (GH 값은 kinds)
const winShown = new Array(NP).fill(true);       // 배치 애니메이션용
for (let i = 0; i < NP; i++) plateIdx.push(panels[i].j);
function assignWindows() {
  kindCount.fill(0);
  for (let i = 0; i < NP; i++) { const k = kindsLive[i]; winRef[i] = { id: KIND_ID[k], idx: kindCount[k]++ }; }
  KIND_ID.forEach((id, k) => { if (IM[id]) IM[id].count = kindCount[k]; });
}
assignWindows();
addIM('win_open', box(WS[0] - 0.01, WS[1] - 0.01, WS[2]), MAT.open, NP, false);
addIM('win_perf', perfGeom(), MAT.perf, NP);
addIM('win_solid', box(WS[0] - 0.01, WS[1] - 0.01, (TYPES.win_solid && TYPES.win_solid.size[2]) || 0.006), MAT.solid, NP);
KIND_ID.forEach((id, k) => { IM[id].count = kindCount[k]; });
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
let EXP_DIR = [];
function explodeOffsets(B, frames, e) {
  if (e < 1e-4) return null;
  const all = B.flat(), C = V.mean(all);
  const la = V.unit(V.sub(B[0][2], B[0][0]));
  const dir = [];
  for (let b = 1; b <= N; b++) {
    let v = V.sub(V.mean(B[b - 1].concat(B[b])), C);
    v = V.unit(V.sub(v, V.mul(la, V.dot(v, la))));
    v[2] = Math.max(v[2], 0);                                     // 땅 밑으로는 보내지 않음
    dir[b] = V.unit(v);
  }
  EXP_DIR = dir;
  // 띠는 2.6 m, 판 사이는 0.28 m, 창은 띠 방향으로 0.9 m 더 (겹침 검사: 0~100% 모두 최소 4 cm 이상 떨어짐)
  return frames.map((f) => V.add(V.mul(dir[f.band], e * 2.6), V.mul(la, (f.j - (n - 1) / 2) * e * 0.28)));
}
const avgOff = (a, b) => (offs ? V.mul(V.add(offs[a], offs[b]), 0.5) : null);
const ZERO = [0, 0, 0];

// 보조 표시(선, 하중 경로 등)에서 오류가 나도 모델과 슬라이더는 계속 움직이게
function safe(fn) { try { fn(); } catch (err) { console.error('[파빌리온]', err); } }
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
    if (off) wo = V.add(wo, V.add(off, V.mul(EXP_DIR[f.band], e * 0.9)));
    if (winShown[i]) setM(IM[w.id], w.idx, wo, f.x, f.y, f.z); else setM(IM[w.id], w.idx, wo, ZERO, ZERO, ZERO);
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
  safe(updateCreaseLines);
  safe(updateOutline);
  safe(updateSpikes);
  if (loadPath.group.visible) safe(buildLoadPath);
  safe(updateFoldReadout);
  safe(refreshFixes);
  safe(updatePreview);
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

// ------------------------------------------------------------------ 일사 막대 (값을 판 위에 길이로)
const spikes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8).translate(0, 0.5, 0).rotateX(Math.PI / 2),
  new THREE.MeshStandardMaterial({ roughness: 0.55 }), NP);
spikes.visible = false; spikes.frustumCulled = false; spikes.userData.noAO = true;
pav.add(spikes);
{ const c = new THREE.Color(); for (let i = 0; i < NP; i++) spikes.setColorAt(i, rampColor(norm(rads[i]), c)); }
const spikeLen = (i) => 0.15 + 1.25 * norm(rads[i]);
function updateSpikes() {
  if (!spikes.visible || !pose) return;
  pose.frames.forEach((f, i) => {
    const z = f.n, x = f.x, y = V.cross(z, x), L = spikeLen(i), o = V.add(f.o, V.mul(z, 0.02));
    _m.set(x[0], y[0], z[0] * L, o[0], x[1], y[1], z[1] * L, o[1], x[2], y[2], z[2] * L, o[2], 0, 0, 0, 1);
    spikes.setMatrixAt(i, _m);
  });
  spikes.instanceMatrix.needsUpdate = true;
}
const iMax = rads.indexOf(Math.max(...rads)), iMin = rads.indexOf(Math.min(...rads));
const spikeTip = (i) => toWorld(V.add(pose.frames[i].o, V.mul(pose.frames[i].n, spikeLen(i) + 0.1)));

// 배치 애니메이션: 일사가 적은 판부터 차례로 창이 들어간다
const rankOrder = rads.map((v, i) => i).sort((a, b) => rads[a] - rads[b]);
let sweepTw = null;
function playSweep() {
  if (sweepTw) tweens.delete(sweepTw);
  winShown.fill(false); applyPose(state.t);
  state.sweeping = true; moveCamera();
  sweepTw = tween(3.2, (u) => {
    const k = Math.round(u * NP);
    for (let r = 0; r < NP; r++) winShown[rankOrder[r]] = r < k;
    applyPose(state.t); drawStripCursor(u); markSunRule(kindsLive[rankOrder[Math.min(k, NP - 1)]]);
  }, () => { sweepTw = null; drawStripCursor(null); markSunRule(-1); setTimeout(() => { if (state.sweeping) { state.sweeping = false; moveCamera(); } }, 600); });
}
function stopSweep() { if (sweepTw) { tweens.delete(sweepTw); sweepTw = null; } if ($('#sunRule li')) markSunRule(-1); state.sweeping = false; winShown.fill(true); drawStripCursor(null); }

// 경계값: 이 값부터 타공, 이 값부터 막힘 (GH 는 3등분 = thr)
const thrLive = [thr[0], thr[1]];
function setThresholds(a, b, fromGH = false) {
  thrLive[0] = Math.min(a, b); thrLive[1] = Math.max(a, b);
  for (let i = 0; i < NP; i++) kindsLive[i] = fromGH ? kinds[i] : rads[i] < thrLive[0] ? 0 : rads[i] < thrLive[1] ? 1 : 2;
  assignWindows(); applyPose(state.t);
  const same = kindsLive.every((k, i) => k === kinds[i]);
  $('#thrReset').hidden = same;
  $('#thrNote').textContent = same ? '지금은 GH 에서 정한 값. 움직이면 창이 바로 바뀝니다.' : 'GH 와 다른 실험 값 (화면에서만 바뀜)';
  for (const [id, v] of [['thr1', thrLive[0]], ['thr2', thrLive[1]]]) { const r = $('#' + id); r.value = v; r.style.setProperty('--p', (norm(v) * 100) + '%'); $('#' + id + 'Out').textContent = Math.round(v) + ' kWh/m²'; }
  drawStrip(); drawRule(); if (typeof updateBandTags === 'function') updateBandTags(); shadowDirty();
}

$('#sweepBtn').addEventListener('click', () => playSweep());
$('#thrReset').addEventListener('click', () => setThresholds(thr[0], thr[1], true));
for (const id of ['thr1', 'thr2']) {
  const r = $('#' + id);
  r.addEventListener('input', () => { stopSweep(); setThresholds(+$('#thr1').value, +$('#thr2').value); if (!state.extView) { state.extView = true; moveCamera(); } });
  r.addEventListener('pointerup', () => r.blur());
}

// ------------------------------------------------------------------ 해
function sunDir(hour, day = 202) {
  const ha = THREE.MathUtils.degToRad(15 * (hour - 12) - (135 - 126.98));   // 서울 경도 보정 (KST)
  const s = sunVec(37.57, declination(day), ha);
  return { s, w: new THREE.Vector3(s[0], s[2], -s[1]) };
}
const BEARING = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
// 달: 보름달로 가정 (해와 12시간 차이, 적위는 해의 반대). 7월 보름달은 남쪽 하늘에 낮게 뜬다
function moonDir(hour, day = 202) {
  const ha = THREE.MathUtils.degToRad(15 * (hour - 12) - (135 - 126.98) + 180);
  const s = sunVec(37.57, -declination(day), ha);
  return { s, w: new THREE.Vector3(s[0], s[2], -s[1]) };
}
const SUNNOW = { w: new THREE.Vector3(0, 1, 0), alt: 1, mw: new THREE.Vector3(0, -1, 0), malt: -1 };
const azName = (s) => BEARING[Math.round(((Math.atan2(s[0], s[1]) * 180 / Math.PI + 360) % 360) / 45) % 8];
function setSun(hour) {
  state.hour = hour;
  const { s, w } = sunDir(hour);
  const alt = Math.asin(clamp(s[2], -1, 1)), altD = alt * 180 / Math.PI;
  sun.target.position.set(0, 1.5, 0);
  sun.position.copy(w).multiplyScalar(40).add(sun.target.position);
  sun.intensity = alt > 0 ? 2.5 * clamp(Math.sin(alt) * 2.4, 0.12, 1) : 0;
  sun.visible = alt > 0;
  const f = clamp((6 - altD) / 12, 0, 1);                       // 해 높이 6° 이상 낮, -6° 이하 밤
  const m = moonDir(hour), malt = Math.asin(clamp(m.s[2], -1, 1));
  SUNNOW.w.copy(w); SUNNOW.alt = alt; SUNNOW.mw.copy(m.w); SUNNOW.malt = malt;
  applySky(f, m.w, malt);
  const hh = Math.floor(hour) % 24, mm = Math.round((hour - Math.floor(hour)) * 60);
  $('#sunOut').textContent = `${hh}:${String(mm).padStart(2, '0')}`;
  $('#sunInfo').textContent = alt > 0 ? `해 높이 ${Math.round(altD)}°, ${azName(s)}쪽` :
    malt > 0 ? `해가 졌습니다. 달 높이 ${Math.round(malt * 180 / Math.PI)}°, ${azName(m.s)}쪽 (보름달로 가정)` : '해가 졌고 달도 아직 지평선 아래';
  shadowDirty();
}

// ------------------------------------------------------------------ 사람 (1.75 m): 걷고, 끌어서 옮길 수 있음
const ZC = (() => { const a = toWorld(V.mean(rig.B1[0])), b = toWorld(V.mean(rig.B1[N])); return a.z + (b.z - a.z) * 0.45; })();   // 볼트 안쪽 가운데 줄
const blobMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16, depthWrite: false });
const blobGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
function makeFigure(mat) {
  const g = new THREE.Group(), limbs = {};
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.42, 4, 12), mat); torso.position.y = 1.18;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat); head.position.y = 1.64;
  const legGeo = new THREE.CapsuleGeometry(0.065, 0.74, 4, 8).translate(0, -0.44, 0);
  const armGeo = new THREE.CapsuleGeometry(0.05, 0.52, 4, 8).translate(0, -0.31, 0);
  for (const sd of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0, 0.92, sd * 0.09); leg.add(new THREE.Mesh(legGeo, mat));
    const arm = new THREE.Group(); arm.position.set(0, 1.42, sd * 0.21); arm.add(new THREE.Mesh(armGeo, mat));
    g.add(leg, arm); limbs[sd] = { leg, arm };
  }
  const blob = new THREE.Mesh(blobGeo, blobMat); blob.scale.setScalar(0.38); blob.position.y = 0.006;
  g.add(torso, head, blob);
  g.userData.limbs = limbs;
  return g;
}
function poseFigure(g, swing) {
  const L = g.userData.limbs;
  L[-1].leg.rotation.z = swing; L[1].leg.rotation.z = -swing;
  L[-1].arm.rotation.z = -swing * 0.7; L[1].arm.rotation.z = swing * 0.7;
}
const person = makeFigure(MAT.person);
const HOME = new THREE.Vector3(6.7, 0, ZC);                      // 동쪽 입구 앞 (단면과 키 비교)
person.position.copy(HOME);
person.rotation.y = Math.PI;
scene.add(person);
const walk = { x: 9, dir: -1, phase: 0, dragged: false, dragging: false, moved: 0 };
function updatePerson(dt) {
  const auto = (state.scene === 0 || (state.scene === 4 && state.step === 3)) && !walk.dragged && !REDUCED;
  if (auto) {                                                     // 공원 길을 따라 볼트 안을 지나 왕복
    walk.x += walk.dir * 1.1 * dt;
    if (walk.x < -10) walk.dir = 1; else if (walk.x > 10) walk.dir = -1;
    person.position.set(walk.x, 0, ZC); person.rotation.y = walk.dir > 0 ? 0 : Math.PI;
    walk.phase += dt * 6.2;
  } else if (!walk.dragging) walk.phase *= 0.85;
  poseFigure(person, auto || walk.dragging ? Math.sin(walk.phase) * 0.45 : 0);
}
// 끌어서 옮기기 (사람을 누른 채 움직이면) / 더블클릭하면 그 사람의 시선
const pickRay = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _ndc = new THREE.Vector2(), _hit = new THREE.Vector3();
function ndc(e) { const r = canvas.getBoundingClientRect(); _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); return _ndc; }
const grabOff = new THREE.Vector3();
const pov = { on: false, yawOff: 0, pitch: -0.08, looking: false, lx: 0, ly: 0 };
canvas.addEventListener('pointerdown', (e) => {
  if (pov.on) { pov.looking = true; pov.lx = e.clientX; pov.ly = e.clientY; canvas.setPointerCapture(e.pointerId); return; }
  pickRay.setFromCamera(ndc(e), rcam);
  if (!pickRay.intersectObject(person, true).length) return;
  if (pickRay.ray.intersectPlane(groundPlane, _hit)) grabOff.copy(person.position).sub(_hit); else grabOff.set(0, 0, 0);
  walk.dragging = true; walk.moved = 0; controls.enabled = false; canvas.classList.add('grab');
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (pov.on && pov.looking) {
    pov.yawOff -= (e.clientX - pov.lx) * 0.0045; pov.pitch = clamp(pov.pitch - (e.clientY - pov.ly) * 0.0045, -1.1, 1.35);
    pov.lx = e.clientX; pov.ly = e.clientY; return;
  }
  if (!walk.dragging) return;
  pickRay.setFromCamera(ndc(e), rcam);
  if (!pickRay.ray.intersectPlane(groundPlane, _hit)) return;
  _hit.add(grabOff);
  const dx = _hit.x - person.position.x, dz = _hit.z - person.position.z, d = Math.hypot(dx, dz);
  if (d > 1e-3) { person.rotation.y = Math.atan2(-dz, dx); walk.phase += d * 3; walk.moved += d; }
  if (walk.moved > 0.05) walk.dragged = true;
  person.position.set(clamp(_hit.x, -30, 30), 0, clamp(_hit.z, -30, 30));
});
const endDrag = () => {
  pov.looking = false;
  if (!walk.dragging) return; walk.dragging = false; if (!pov.on) controls.enabled = true; canvas.classList.remove('grab');
};
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('dblclick', (e) => {
  if (pov.on) { exitPov(); return; }
  pickRay.setFromCamera(ndc(e), rcam);
  if (pickRay.intersectObject(person, true).length) enterPov();
});
function enterPov() {
  personTag.on = false;
  pov.on = true; pov.yawOff = 0; pov.pitch = -0.08;
  if (camTw) { tweens.delete(camTw); camTw = null; }
  controls.enabled = false; person.visible = false;
  camera.fov = 62; document.body.classList.add('pov'); $('#povBar').hidden = false;
  layout(); shadowDirty();
}
function exitPov(restore = true) {
  if (!pov.on) return;
  pov.on = false; pov.looking = false; controls.enabled = true; person.visible = true;
  camera.fov = 34; document.body.classList.remove('pov'); $('#povBar').hidden = true;
  layout(); shadowDirty();
  if (restore) { camKey = null; moveCamera(true); }
}
// 사람 시선에서 걷기: W/↑ 앞, S/↓ 뒤, A/D 옆걸음, ←/→ 몸 돌리기, Shift 빨리
const keys = new Set();
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift']);
addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
addEventListener('blur', () => keys.clear());
const wallRay = new THREE.Raycaster();
function blocked(from, dir, dist) {        // 판·창·받침에 부딪히면 멈춤 (무릎과 가슴 높이 두 번 확인)
  const meshes = Object.values(IM).filter((m) => m.visible);
  for (const h of [0.5, 1.3]) {
    wallRay.set(new THREE.Vector3(from.x, h, from.z), dir); wallRay.far = dist + 0.3;
    if (wallRay.intersectObjects(meshes, false).length) return true;
  }
  return false;
}
let povBob = 0;
function updatePov(dt = 0.016) {
  if (!pov.on) return;
  const turn = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0);
  if (turn) pov.yawOff += turn * 1.6 * dt;
  const fw = (keys.has('w') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('s') || keys.has('ArrowDown') ? 1 : 0);
  const sd = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
  if (fw || sd) {
    walk.dragged = true;                                            // 자동 걷기 멈춤
    const yaw0 = person.rotation.y + pov.yawOff, sp = (keys.has('Shift') ? 3.0 : 1.4) * dt;
    const dir = new THREE.Vector3(Math.cos(yaw0) * fw + Math.sin(yaw0) * sd, 0, -Math.sin(yaw0) * fw + Math.cos(yaw0) * sd).normalize();
    if (!blocked(person.position, dir, sp)) {
      person.position.addScaledVector(dir, sp);
      person.position.x = clamp(person.position.x, -45, 45); person.position.z = clamp(person.position.z, -45, 45);
      povBob += sp * 7; walk.phase += sp * 4;
    }
  }
  const yaw = person.rotation.y + pov.yawOff, cp = Math.cos(pov.pitch);
  camera.position.set(person.position.x, 1.62 + Math.sin(povBob) * 0.025, person.position.z);
  controls.target.set(camera.position.x + Math.cos(yaw) * cp, camera.position.y + Math.sin(pov.pitch), camera.position.z - Math.sin(yaw) * cp);
  camera.lookAt(controls.target);
}

// ------------------------------------------------------------------ 공원 (1장면): 잔디, 산책로, 광장, 나무, 관목, 벤치, 쓰레기통, 가로등, 화단, 사람들
const park = new THREE.Group(); park.visible = false; scene.add(park);
const parkLamps = [];          // 밤 빛 웅덩이 자리
const parkOccluders = [];      // 눈부심 계산에서 해를 가리는 것 (나무, 생울타리)
const PLAZA_LAMPS = [[-9.9, ZC - 3.2], [9.9, ZC - 5.9], [-9.9, ZC + 5.9]];   // 남동쪽 모서리는 첫 화면 앞이라 비움   // 광장 모서리 가로등 (밤에 실제 빛)
let parkLampMat = null;
{
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), Yax = new THREE.Vector3(0, 1, 0);
  const place = (mesh, i, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => mesh.setMatrixAt(i, _m.compose(ps.set(x, y, z), q.setFromAxisAngle(Yax, ry), sc.set(sx, sy, sz)));
  const std = (color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
  const inst = (geo, mat, count, shadow = true) => { const m = new THREE.InstancedMesh(geo, mat, count); m.castShadow = shadow; m.receiveShadow = true; park.add(m); return m; };

  // 잔디 (가장자리는 배경으로 흐려지고, 얼룩덜룩한 결)
  {
    const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
    const grd = g.createRadialGradient(512, 512, 120, 512, 512, 512);
    grd.addColorStop(0, 'rgba(128,153,104,1)'); grd.addColorStop(0.78, 'rgba(128,153,104,0.97)'); grd.addColorStop(1, 'rgba(128,153,104,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 1024);
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 420; i++) {
      const x = rnd() * 1024, y = rnd() * 1024, r = 10 + rnd() * 46;
      g.fillStyle = rnd() < 0.5 ? 'rgba(98,126,78,0.16)' : 'rgba(168,186,124,0.16)';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 24000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(90,118,70,0.28)' : 'rgba(176,196,136,0.25)'; g.fillRect(rnd() * 1024, rnd() * 1024, 2, 2); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(62, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false }));
    lawn.position.set(0, 0.004, ZC); lawn.receiveShadow = true; park.add(lawn);
  }

  // 산책로: 곡선 리본 + 연석
  const PATHS = [];
  function ribbon(pts, width, y, mat, closed = false) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal');
    const M = Math.ceil(curve.getLength() / 0.6), P = curve.getSpacedPoints(M), pos = [], nor = [], idx = [];
    for (let i = 0; i <= M; i++) {
      const t = curve.getTangentAt(Math.min(i / M, 0.9999)), nx = -t.z, nz = t.x, l = Math.hypot(nx, nz) || 1;
      pos.push(P[i].x + nx / l * width / 2, y, P[i].z + nz / l * width / 2, P[i].x - nx / l * width / 2, y, P[i].z - nz / l * width / 2);
      nor.push(0, 1, 0, 0, 1, 0);
    }
    for (let i = 0; i < M; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; park.add(m);
    return P;
  }
  const pathMat = std('#d9d3c6', 0.95, { side: THREE.DoubleSide }), curbMat = std('#b7b0a2', 0.95, { side: THREE.DoubleSide });
  const ROUTES = [
    { w: 2.6, p: [[-6, ZC], [-14, ZC + 0.3], [-24, ZC + 2.6], [-36, ZC + 1.4], [-48, ZC - 3], [-64, ZC - 6]] },
    { w: 2.6, p: [[6, ZC], [14, ZC - 0.4], [24, ZC - 2.8], [36, ZC - 1.2], [48, ZC + 3], [64, ZC + 5]] },
    { w: 2.0, p: [[1.8, ZC - 3.5], [2.2, ZC - 11], [5.5, ZC - 20], [4, ZC - 32], [-1, ZC - 46], [-3, ZC - 64]] },
    { w: 2.0, p: [[-1.8, ZC + 3], [-2.5, ZC + 11], [-7, ZC + 20], [-5, ZC + 33], [1, ZC + 46], [2, ZC + 64]] },
  ];
  for (const r of ROUTES) { ribbon(r.p, r.w + 0.36, 0.014, curbMat); PATHS.push(ribbon(r.p, r.w, 0.024, pathMat)); }
  const ringPts = []; for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; ringPts.push([21 * Math.cos(a), ZC + 18 * Math.sin(a)]); }
  ribbon(ringPts, 1.96, 0.012, curbMat, true); PATHS.push(ribbon(ringPts, 1.6, 0.02, pathMat, true));
  // 첫 화면 카메라(남동쪽 위) 앞쪽 부채꼴에는 키 있는 것을 두지 않음
  const inFront = (x, z) => { const a = Math.atan2(z - ZC, x) * 180 / Math.PI; return (Math.abs(a - 45) < 42 || Math.abs(a + 45) < 30 || Math.abs(a + 145) < 28) && Math.hypot(x, z - ZC) > 8; };   // 1·2장면(낮·밤) 카메라 앞
  const distPath = (x, z) => { let d = Infinity; for (const P of PATHS) for (let i = 0; i < P.length; i += 2) d = Math.min(d, Math.hypot(P[i].x - x, P[i].z - z)); return d; };

  // 광장: 파빌리온 바닥까지 이어지는 포장 (줄눈 무늬)
  {
    const tc = document.createElement('canvas'); tc.width = tc.height = 256; const g = tc.getContext('2d');
    g.fillStyle = '#ddd8cb'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(150,142,128,0.55)'; g.lineWidth = 3;
    for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(0, k * 64); g.lineTo(256, k * 64); g.stroke(); }
    for (let r = 0; r < 4; r++) for (let k = 0; k <= 2; k++) { const x = k * 128 + (r % 2) * 64; g.beginPath(); g.moveTo(x, r * 64); g.lineTo(x, r * 64 + 64); g.stroke(); }
    const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1 / 1.2, 1 / 1.2); tex.anisotropy = 4;
    const rr = (w, h, r) => { const s = new THREE.Shape(); s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0); s.lineTo(w / 2, h / 2 - r); s.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2); s.lineTo(-w / 2 + r, h / 2); s.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI); s.lineTo(-w / 2, -h / 2 + r); s.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5); return s; };
    const curb = new THREE.Mesh(new THREE.ShapeGeometry(rr(18.6, 10.6, 2.3), 8).rotateX(-Math.PI / 2), curbMat); curb.position.set(0, 0.026, ZC); curb.receiveShadow = true;
    const plaza = new THREE.Mesh(new THREE.ShapeGeometry(rr(18, 10, 2), 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
    plaza.position.set(0, 0.032, ZC); plaza.receiveShadow = true;
    park.add(curb, plaza);
  }

  // 키 큰 나무 (카메라가 도는 원 바깥): 활엽수 = 수관 3덩이, 침엽수 = 원뿔 2단
  const BIG = [];
  let g1 = 0;
  while (BIG.length < 96 && g1++ < 20000) {        // 횟수 제한: 자리가 모자라도 멈추지 않게
    const r = 27 + rnd() * 34, a = rnd() * Math.PI * 2, x = r * Math.cos(a), z = ZC + r * Math.sin(a);
    if (distPath(x, z) < 3.2) continue;
    BIG.push({ x, z, s: 0.8 + rnd() * 0.7, k: Math.floor(rnd() * 4), con: rnd() < 0.28 });
  }
  // 작은 나무 (광장 가까이, 낮아서 파빌리온을 가리지 않음)
  const SMALL = [];
  let g2 = 0;
  while (SMALL.length < 12 && g2++ < 20000) {
    const r = 11.5 + rnd() * 5, a = rnd() * Math.PI * 2, x = r * Math.cos(a), z = ZC + r * Math.sin(a);
    if (distPath(x, z) < 2.4 || inFront(x, z) || Math.abs(x) < 10.5 && Math.abs(z - ZC) < 6.5 || SMALL.some((t) => Math.hypot(t.x - x, t.z - z) < 4)) continue;
    SMALL.push({ x, z, s: 0.42 + rnd() * 0.13, k: Math.floor(rnd() * 4), con: false });
  }
  const TREES = BIG.concat(SMALL), DEC = TREES.filter((t) => !t.con), CON = TREES.filter((t) => t.con);
  const greens = ['#7a9265', '#6a8657', '#879f6e', '#5d7850', '#93a873'].map((h) => new THREE.Color(h));
  const trunk = inst(new THREE.CylinderGeometry(0.1, 0.18, 1, 6).translate(0, 0.5, 0), std('#6b5a48'), TREES.length);
  const crown = inst(new THREE.IcosahedronGeometry(1, 1), std('#ffffff', 0.9, { flatShading: true }), DEC.length * 3);
  const cone = inst(new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0), std('#ffffff', 0.9, { flatShading: true }), CON.length * 2);
  const shade = inst(blobGeo, blobMat, TREES.length, false);
  let ci = 0, ki = 0;
  TREES.forEach((t, i) => {
    const h = t.con ? 1.2 + t.s * 0.8 : 1.8 + t.s * 1.4;
    place(trunk, i, t.x, 0, t.z, 0, 1 + t.s * 0.3, h, 1 + t.s * 0.3);
    place(shade, i, t.x + 0.5, 0.006, t.z + 0.4, 0, 2.0 * t.s, 1, 2.0 * t.s);
    if (t.con) {
      for (let k = 0; k < 2; k++) { place(cone, ki, t.x, h + k * 1.5 * t.s, t.z, 0, (1.7 - k * 0.5) * t.s, 2.8 * t.s, (1.7 - k * 0.5) * t.s); cone.setColorAt(ki++, greens[(t.k + 1) % 4].clone().multiplyScalar(0.85)); }
    } else {
      const off = [[0, 1.1, 0, 1.0], [0.65, 0.75, 0.3, 0.72], [-0.5, 0.8, -0.45, 0.78]];
      for (const [ox, oy, oz, s2] of off) { place(crown, ci, t.x + ox * t.s, h + oy * t.s, t.z + oz * t.s, t.k + ox, 1.6 * t.s * s2, 1.5 * t.s * s2, 1.6 * t.s * s2); crown.setColorAt(ci++, greens[(t.k + (ox > 0 ? 1 : 0)) % 5]); }
    }
  });

  // 관목 덩이와 광장 가장자리 생울타리
  const SHR = [];
  let guard = 0;
  while (SHR.length < 46 && guard++ < 5000) {
    const r = 8 + rnd() * 10, a = rnd() * Math.PI * 2, x = r * Math.cos(a), z = ZC + r * Math.sin(a);
    if (distPath(x, z) < 1.9 || inFront(x, z) || Math.abs(x) < 10 && Math.abs(z - ZC) < 6.2) continue;
    if (TREES.some((t) => Math.hypot(t.x - x, t.z - z) < 1.6)) continue;
    SHR.push({ x, z, s: 0.45 + rnd() * 0.4, k: Math.floor(rnd() * 5) });
  }
  const bush = inst(new THREE.IcosahedronGeometry(1, 1), std('#ffffff', 0.92, { flatShading: true }), SHR.length * 3);
  SHR.forEach((b, i) => { for (let k = 0; k < 3; k++) { const a = k * 2.1 + b.k; place(bush, i * 3 + k, b.x + Math.cos(a) * 0.45 * b.s, 0.45 * b.s, b.z + Math.sin(a) * 0.45 * b.s, a, b.s * 1.1, b.s * 0.85, b.s); bush.setColorAt(i * 3 + k, greens[(b.k + k) % 5].clone().multiplyScalar(0.92)); } });
  const HEDGE = [[-6.2, ZC - 5.75, 4.6], [6.2, ZC - 5.75, 4.6], [-6.2, ZC + 5.75, 4.6], [6.2, ZC + 5.75, 4.6]];
  const hedge = inst(new THREE.BoxGeometry(1, 0.62, 0.6).translate(0, 0.31, 0), std('#5f7d4f', 0.95), HEDGE.length);
  parkOccluders.push(crown, cone, trunk);
  HEDGE.forEach(([x, z, L], i) => place(hedge, i, x, 0, z, 0, L, 1, 1));

  // 벤치 (나무 살 + 주물 다리), 쓰레기통, 가로등
  const benchWood = mergeGeometries([
    ...[0, 1, 2].map((k) => new THREE.BoxGeometry(1.8, 0.04, 0.12).translate(0, 0.45, -0.15 + k * 0.15)),
    ...[0, 1].map((k) => new THREE.BoxGeometry(1.8, 0.11, 0.035).rotateX(-0.22).translate(0, 0.62 + k * 0.15, -0.25 - k * 0.03)),
  ]);
  const benchLeg = mergeGeometries([-0.75, 0.75].flatMap((x) => [
    new THREE.BoxGeometry(0.05, 0.45, 0.42).translate(x, 0.225, 0), new THREE.BoxGeometry(0.05, 0.45, 0.04).rotateX(-0.22).translate(x, 0.65, -0.26),
    new THREE.BoxGeometry(0.05, 0.04, 0.4).translate(x, 0.66, 0.02)]));
  const BENCH = [];
  // 광장 모서리: 볼트의 열린 끝을 바라봄
  for (const [x, z] of [[-8.0, ZC - 3.6], [-8.0, ZC + 3.2], [8.0, ZC - 3.6], [8.0, ZC + 3.2]]) BENCH.push({ x, z, ry: Math.atan2(Math.sign(x) * -6 - x, ZC - z), bin: true });
  // 산책로 옆: 길을 바라보게
  const along = (P, frac, side) => { const i = Math.floor(frac * (P.length - 1)), a = P[i], b = P[Math.min(i + 1, P.length - 1)]; const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1; return { x: a.x - tz / l * side, z: a.z + tx / l * side, ry: Math.atan2(side * tz / l, -side * tx / l) }; };   // 벤치 앞(+z)이 길을 향함
  for (const [pi, f, sd] of [[0, 0.16, 2.2], [0, 0.3, -2.2], [1, 0.16, -2.2], [1, 0.3, 2.2], [2, 0.18, 1.9], [3, 0.2, -1.9], [4, 0.08, 1.7], [4, 0.33, -1.7], [4, 0.58, 1.7], [4, 0.83, -1.7]]) {
    const p = along(PATHS[pi], f, sd); BENCH.push({ x: p.x, z: p.z, ry: p.ry, bin: rnd() < 0.6 });
  }
  const bw = inst(benchWood, std('#9a7a58', 0.8), BENCH.length), bl = inst(benchLeg, std('#3a3e44', 0.5, { metalness: 0.6 }), BENCH.length);
  BENCH.forEach((b, i) => { place(bw, i, b.x, 0, b.z, b.ry); place(bl, i, b.x, 0, b.z, b.ry); });
  const BINS = BENCH.filter((b) => b.bin).map((b) => ({ x: b.x + Math.cos(b.ry) * 1.25, z: b.z - Math.sin(b.ry) * 1.25 }));
  const binBody = inst(new THREE.CylinderGeometry(0.24, 0.21, 0.82, 16).translate(0, 0.41, 0), std('#43524a', 0.6, { metalness: 0.3 }), BINS.length);
  const binLid = inst(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 16).translate(0, 0.85, 0), std('#2f3a35', 0.5, { metalness: 0.4 }), BINS.length);
  BINS.forEach((b, i) => { place(binBody, i, b.x, 0, b.z); place(binLid, i, b.x, 0, b.z); });
  const LAMP = [];
  for (const [pi, n2] of [[0, 5], [1, 5], [2, 5], [3, 5]]) for (let k = 1; k <= n2; k++) { const p = along(PATHS[pi], 0.06 + k * 0.17, (k % 2 ? 1 : -1) * 1.8); LAMP.push(p); }
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + 0.3, x = 22.3 * Math.cos(a), z = ZC + 19.3 * Math.sin(a); if (!inFront(x, z)) LAMP.push({ x, z }); }
  for (const [x, z] of PLAZA_LAMPS) LAMP.push({ x, z, plaza: true });
  const pole = inst(new THREE.CylinderGeometry(0.045, 0.06, 4.2, 8).translate(0, 2.1, 0), std('#2f3338', 0.5, { metalness: 0.6 }), LAMP.length);
  const lampHead = inst(new THREE.CylinderGeometry(0.22, 0.12, 0.2, 12).translate(0, 4.25, 0), std('#f4efe2', 0.4, { emissive: '#fff3d6', emissiveIntensity: 0.25 }), LAMP.length, false);
  LAMP.forEach((l, i) => { place(pole, i, l.x, 0, l.z); place(lampHead, i, l.x, 0, l.z); });
  parkLamps.push(...LAMP); parkLampMat = lampHead.material;

  // 화단 (흙 + 꽃)
  const BEDS = [[-12.5, ZC - 4.6], [12.5, ZC - 4.8], [-6, ZC + 9], [6.5, ZC - 9.5]].filter(([x, z]) => distPath(x, z) > 2.2);
  const soil = inst(new THREE.CylinderGeometry(1.5, 1.6, 0.22, 24).translate(0, 0.11, 0), std('#7a6450', 1), BEDS.length, false);
  const FL = 60, flower = inst(new THREE.IcosahedronGeometry(0.1, 0), std('#ffffff', 0.8), BEDS.length * FL, false);
  const fc = ['#e58aa8', '#f2cf5b', '#f6f1e8', '#b18ad8', '#e8735a'].map((h) => new THREE.Color(h));
  BEDS.forEach(([x, z], bi) => {
    place(soil, bi, x, 0, z);
    for (let k = 0; k < FL; k++) { const r = Math.sqrt(rnd()) * 1.35, a = rnd() * Math.PI * 2; place(flower, bi * FL + k, x + r * Math.cos(a), 0.3 + rnd() * 0.12, z + r * Math.sin(a), 0, 1, 1, 1); flower.setColorAt(bi * FL + k, fc[Math.floor(rnd() * fc.length)]); }
  });

  // 안내판
  {
    const c2 = document.createElement('canvas'); c2.width = 512; c2.height = 320; const g = c2.getContext('2d');
    g.fillStyle = '#2f3a35'; g.fillRect(0, 0, 512, 320); g.fillStyle = '#f1ede4';
    g.font = '500 64px "IBM Plex Sans KR", sans-serif'; g.fillText(NAME, 36, 120);
    g.font = '400 30px "IBM Plex Sans KR", sans-serif'; g.fillText('파빌리온 2026', 36, 180); g.fillText('여름 해를 막고 빛의 결을 들인다', 36, 236);
    const tex = new THREE.CanvasTexture(c2); tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.05), [std('#2f3a35'), std('#2f3a35'), std('#2f3a35'), std('#2f3a35'), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), std('#2f3a35')]);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), std('#3a3e44', 0.5));
    const sign = new THREE.Group(); board.position.y = 1.35; post.position.y = 0.6; sign.add(board, post);
    sign.position.set(-10.6, 0, ZC - 2.4); sign.rotation.y = -Math.PI / 2 + 0.35; sign.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    park.add(sign);
  }

  // 공원의 다른 사람들
  const others = [std('#8d949b'), std('#9b8f84'), std('#7f8d99')];
  for (const [x, z, ry, sw, mi] of [[-13.5, ZC - 2.2, 0.2, 0.25, 0], [14, ZC + 2.6, 2.4, -0.3, 1], [2.4, ZC - 12.5, 1.5, 0.3, 1], [-3.6, ZC + 13, -1.7, -0.2, 0], [9.6, ZC - 3.9, 2.0, 0, 2]]) {
    const f = makeFigure(others[mi]); f.position.set(x, 0, z); f.rotation.y = ry; poseFigure(f, sw); f.traverse((o) => { if (o.isMesh && o.geometry !== blobGeo) o.castShadow = true; }); park.add(f);
  }
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
const dataTags = [
  addTag('plain', `<span class="pin"></span><span class="txt">막대가 가장 긴 판: ${Math.round(rads[iMax])} kWh/m², ${bandName(panels[iMax].b)}</span>`, () => spikeTip(iMax)),
  addTag('plain', `<span class="pin"></span><span class="txt">막대가 가장 짧은 판: ${Math.round(rads[iMin])} kWh/m², ${bandName(panels[iMin].b)}</span>`, () => spikeTip(iMin)),
];
const KIND_VERB = ['연다', '거른다', '막는다'];
const bandTags = [];
for (let b = 1; b <= N; b++) {
  const jc = Math.floor(n / 2), i0 = pIndex(b, jc);
  const tg = addTag('plain kindtag', '<span class="pin"></span><span class="txt"></span>', () => toWorld(V.add(pose.frames[i0].o, V.mul(pose.frames[i0].n, 0.45))));
  tg.band = b; tg.occlude = true; bandTags.push(tg);
}
function updateBandTags() {
  const kc = KC();
  for (const tg of bandTags) {
    const c = [0, 0, 0]; for (let j = 0; j < n; j++) c[kindsLive[pIndex(tg.band, j)]]++;
    const k = c.indexOf(Math.max(...c));
    tg.el.querySelector('.pin').style.background = kc[k];
    tg.el.querySelector('.txt').textContent = `${bandName(tg.band)}: ${['해 적게', '해 중간', '해 많이'][k]} → ${KIND_VERB[k]}`;
  }
}
const personTag = addTag('plain', '<span class="pin"></span><span class="txt">사람 1.75 m</span>', () => new THREE.Vector3(person.position.x, 1.95, person.position.z));
personTag.occlude = true;
personTag.el.querySelector('.txt').innerHTML = '사람 1.75 m <span class="small">더블클릭: 시선</span>';
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
  data0: [[11.5, 17, 13.5], [0, 1.6, -0.3]],
  dataBar: [[13, 15, -13.5], [0, 2.0, -0.5]],
  data1: [[4.6, 1.7, -2.4], [-2.5, 0.5, 1.3]],
  night: [[-21, 3.6, -15], [1, 6.4, -1]],          // 북서쪽에서 남동쪽 하늘을 봄: 떠오르는 보름달이 보임
  logic: [[-15, 14, 17], [0, 1.0, 0]],
  struct: [[16.5, 4.4, 7.0], [0, 2.4, -0.3]],
  make: [[-24, 16, 23], [0.6, 2.0, 0]],
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
  if (si === 1) return st === 0 ? 'dataBar' : state.sweeping || state.extView ? 'data0' : state.night ? 'night' : 'data1';
  if (si === 2) return 'logic';
  if (si === 3) return 'struct';
  if (si === 4) return state.joint ? 'joint' : st === 2 ? 'logic' : 'make';
}
function moveCamera(force = false) {
  if (pov.on) return;
  const key = camFor(state.scene, state.step);
  if (!force && key === camKey) return;
  camKey = key;
  controls.maxPolarAngle = key === 'night' ? Math.PI * 0.545 : Math.PI * 0.495;   // 밤 시점은 달을 올려다봄
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
  if (pov.on) { /* 사람 시선: 화면 가운데 */ } else if (W > 860) {
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
  // 값 -> 바뀐 것
  $('#ruleFormula').textContent = `GH 규칙: (일사 − ${Math.round(rmin)}) ÷ (${Math.round(rmax)} − ${Math.round(rmin)}) × 3 → 내림 → 0 열림, 1 타공, 2 막힘`;
  for (const id of ['thr1', 'thr2']) { const r = $('#' + id); r.min = Math.floor(rmin); r.max = Math.ceil(rmax); r.step = 1; }
  setThresholds(thr[0], thr[1], true);
  drawBarHelp();
  // GH 흐름
  const P = D.params, tot = D.types.reduce((s, t) => s + t.count, 0);
  $('#flow').innerHTML = `
    <section class="g1"><h4>1 입력: 무엇을 넣나</h4><ul>
      <li>단면 점 ${P.profile.length}개 <span class="cmp">Panel. 바닥에서 지붕 2.6 ~ 5.3 m 까지 단면을 정함</span></li>
      <li>판 폭 ${P.w} m, ${P.n}줄, 주름 각 ${P.phi}°, 접기 ${P.t}, 방향 ${P.rot}° <span class="cmp">Number Slider 5개</span></li>
      <li>서울 기상 데이터, 6월 1일 ~ 8월 31일 <span class="cmp">ImportEPW, AnalysisPeriod</span></li></ul></section>
    <div class="arrow">↓</div>
    <section class="g2"><h4>2 규칙: 어떻게 바꾸나</h4><ul>
      <li>꺾임 각 ${rig.turns.map((v) => Math.round(v) + '°').join(', ')} → 지그재그 길이, 접힘선마다 뒤집어 접기 → 판 ${NP}장 <span class="cmp">FOLD (Python)</span></li>
      <li>판마다 여름 일사 계산 <span class="cmp">SkyMatrix → IncidentRadiation (Ladybug)</span></li>
      <li>일사를 0 ~ 3 으로 옮겨 창 종류 결정 <span class="cmp">Bounds → Remap Numbers</span></li></ul></section>
    <div class="arrow">↓</div>
    <section class="g3"><h4>3 출력: 무엇이 나오나</h4><ul>
      <li>부재 블록 ${D.types.length}종, ${won(tot)}개 <span class="cmp">BLOCKS (Python)</span></li>
      <li>bake → 라이노 블록, write → pavilion.json → 이 웹 <span class="cmp">Button 2개</span></li></ul></section>`;
  // 부재 표
  const fam = [];
  for (const t of D.types) { let f = fam.find((x) => x.name === t.family); if (!f) fam.push(f = { name: t.family, items: [] }); f.items.push(t); }
  let rows = '<tr><th>블록</th><th class="num">개수</th></tr>';
  for (const f of fam) {
    rows += `<tr class="fam"><td>${f.name} ${f.items.length}종</td><td class="num">${won(f.items.reduce((s, t) => s + t.count, 0))}</td></tr>`;
    for (const t of f.items) rows += `<tr data-id="${t.id}" tabindex="0"><td><span class="key" style="background:${t.color}"></span>${t.name}<span class="mat">${t.material}</span></td><td class="num">${won(t.count)}</td></tr>`;
  }
  rows += `<tr class="total"><td>${D.types.length}종</td><td class="num">${won(tot)}</td></tr>`;
  $('#countTable').innerHTML = rows;
  $$('#countTable tr[data-id]').forEach((tr) => { tr.addEventListener('click', () => { if (state.scene === 4) showMember(tr.dataset.id); }); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') tr.click(); }); });
  $$('[data-count]').forEach((el) => { el.textContent = won(countOf(el.dataset.count)); });
  // 주름 깊이
  const dep = P.w * Math.sin(THREE.MathUtils.degToRad(P.phi));
  $('#depthTxt').textContent = dep.toFixed(2) + ' m';
  $('#depthRatio').textContent = Math.round(rig.stats(rig.B1).span / dep);
}

// 판 150장을 일사 순으로: 위 띠는 값(색), 아래 띠는 정해진 창, 세로선은 경계값
const KC = () => [tok('--open'), tok('--perf'), tok('--solid')];
function drawStrip() {
  const bw = 300 / NP, kc = KC();
  let svg = '';
  rankOrder.forEach((i, x) => {
    svg += `<rect x="${(x * bw).toFixed(2)}" y="0" width="${(bw + 0.05).toFixed(2)}" height="30" fill="${'#' + rampColor(norm(rads[i])).getHexString(THREE.SRGBColorSpace)}"/>`;
    svg += `<rect x="${(x * bw).toFixed(2)}" y="34" width="${(bw + 0.05).toFixed(2)}" height="16" fill="${kc[kindsLive[i]]}"/>`;
  });
  for (const t of thrLive) { const x = rankOrder.filter((i) => rads[i] < t).length * bw; svg += `<rect x="${(x - 0.6).toFixed(1)}" y="0" width="1.2" height="52" fill="${tok('--ink')}"/>`; }
  svg += '<rect id="stripCursor" x="0" y="0" width="2" height="52" fill="' + tok('--cobalt') + '" visibility="hidden"/>';
  svg += '<text x="0" y="62" font-size="9" fill="#57616d">적게 받는 판</text><text x="300" y="62" font-size="9" fill="#57616d" text-anchor="end">많이 받는 판</text>';
  $('#strip').innerHTML = svg;
}
function drawStripCursor(u) {
  const c = $('#stripCursor'); if (!c) return;
  if (u === null) c.setAttribute('visibility', 'hidden'); else { c.setAttribute('visibility', 'visible'); c.setAttribute('x', (u * 300 - 1).toFixed(1)); }
}
function drawRule() {
  drawSunRule();
  const kc = KC(), bk = bandKinds(kindsLive);
  const words = [['적음', '열림', TYPES.win_open], ['중간', '타공', TYPES.win_perf], ['많음', '막힘', TYPES.win_solid]];
  $('#ruleList').innerHTML = words.map(([a, b, t], k) =>
    `<li><span class="key" style="background:${kc[k]};width:12px;height:12px"></span><span>${a} → <b>${b}</b><br><span class="small">${t ? t.material : ''}${bk[k].length ? ', ' + bk[k].join(', ') : ''}</span></span><span class="n">${kindCount[k]}</span></li>`).join('');
}

// 해 많이 -> 막는다 규칙 표 (왼쪽 카드)
const hexOf = (u) => '#' + rampColor(u).getHexString(THREE.SRGBColorSpace);
function sunIcon(level) {          // 2 많이, 1 중간, 0 적게
  const col = hexOf([0.1, 0.55, 0.97][level]), r = [4.5, 5.5, 6.5][level], L = [0, 3.5, 6][level];
  let rays = '';
  if (L) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, x1 = 14 + Math.cos(a) * (r + 2), y1 = 14 + Math.sin(a) * (r + 2); rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${(x1 + Math.cos(a) * L).toFixed(1)}" y2="${(y1 + Math.sin(a) * L).toFixed(1)}" stroke="${col}" stroke-width="2" stroke-linecap="round"/>`; }
  return `<svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="${r}" fill="${col}"/>${rays}</svg>`;
}
function modIcon(k) {
  const kc = KC()[k];
  if (k === 2) return `<svg width="38" height="18" viewBox="0 0 38 18"><rect x="1" y="1" width="36" height="16" fill="${kc}" stroke="${tok('--ink')}" stroke-width="1"/></svg>`;
  if (k === 1) { let d = ''; for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) d += `<circle cx="${4.5 + i * 4.8}" cy="${4.5 + j * 4.5}" r="1.5" fill="#fff"/>`; return `<svg width="38" height="18" viewBox="0 0 38 18"><rect x="1" y="1" width="36" height="16" fill="${kc}" stroke="${tok('--ink')}" stroke-width="1"/>${d}</svg>`; }
  return `<svg width="38" height="18" viewBox="0 0 38 18"><rect x="1" y="1" width="36" height="16" fill="${kc}" stroke="${tok('--ink')}" stroke-width="1"/><line x1="8" y1="15" x2="16" y2="3" stroke="#fff" stroke-width="1.6"/><line x1="14" y1="15" x2="20" y2="6" stroke="#fff" stroke-width="1.2"/></svg>`;
}
function drawSunRule() {
  const rows = [[2, '해 많이 받는 판', '막는다'], [1, '중간', '거른다'], [0, '해 적게 받는 판', '연다']];
  $('#sunRule').innerHTML = rows.map(([k, a, v]) => `<li data-k="${k}"><span>${sunIcon(k)}</span><span>${a}</span><span class="ar">→</span><span>${modIcon(k)}</span><span><span class="verb">${v}</span> <span class="cnt">${kindCount[k]}장</span></span></li>`).join('');
}
function markSunRule(k) { $$('#sunRule li').forEach((li) => li.classList.toggle('now', +li.dataset.k === k)); }
function drawBarHelp() {
  const sun = '#f0b12c', ink = tok('--ink'), ink2 = tok('--ink-2');
  const lo = spikeLen(iMin), hi = spikeLen(iMax), px = 52;          // 1 m = 52 px
  const plate = (x, col, len, label) => {
    const y = 96, h = len * px;
    return `<polygon points="${x - 34},${y + 6} ${x + 34},${y + 6} ${x + 26},${y - 2} ${x - 42},${y - 2}" fill="${tok('--wood')}" stroke="${ink}" stroke-width="0.8"/>` +
      `<rect x="${x - 4}" y="${y - 2 - h}" width="8" height="${h}" fill="${col}"/>` +
      `<line x1="${x + 12}" y1="${y - 2}" x2="${x + 12}" y2="${y - 2 - h}" stroke="${ink2}" stroke-width="0.8"/><line x1="${x + 9}" y1="${y - 2 - h}" x2="${x + 15}" y2="${y - 2 - h}" stroke="${ink2}" stroke-width="0.8"/>` +
      `<text x="${x + 18}" y="${y - 2 - h / 2 + 3}" font-size="9" fill="${ink2}">${len.toFixed(2)} m</text>` +
      `<text x="${x}" y="${y + 18}" font-size="10" fill="${ink}" text-anchor="middle">${label}</text>`;
  };
  let svg = `<circle cx="22" cy="18" r="8" fill="${sun}"/>`;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; svg += `<line x1="${22 + Math.cos(a) * 11}" y1="${18 + Math.sin(a) * 11}" x2="${22 + Math.cos(a) * 15}" y2="${18 + Math.sin(a) * 15}" stroke="${sun}" stroke-width="2" stroke-linecap="round"/>`; }
  svg += `<line x1="36" y1="26" x2="88" y2="84" stroke="${sun}" stroke-width="1.2" stroke-dasharray="3 3"/><line x1="38" y1="22" x2="206" y2="84" stroke="${sun}" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  svg += plate(96, hexOf(norm(rads[iMin])), lo, `${Math.round(rads[iMin])} kWh/m², ${bandName(panels[iMin].b)}`);
  svg += plate(222, hexOf(norm(rads[iMax])), hi, `${Math.round(rads[iMax])} kWh/m², ${bandName(panels[iMax].b)}`);
  $('#barSvg').innerHTML = svg;
  $('#barTxt').textContent = `판 가운데서 바깥쪽으로 솟은 막대 = 그 판이 6~8월에 받은 햇빛 양. 길고 진할수록 많이 받습니다. 가장 적은 판은 ${lo.toFixed(2)} m, 가장 많은 판은 ${hi.toFixed(2)} m 로 그렸습니다 (값 비교용 길이).`;
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
// 판 전체 면적 (창 구멍 뺀 값) -> 재료별 무게
const PLATE_AREA = (() => {
  let a = 0;
  for (let b = 1; b <= N; b++) {
    const t = TYPES['plate_' + b] || {}, P = t.shape || rig.shapes[b], [L, W] = t.hole || [1.2, 0.3];
    let s2 = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q2 = P[(i + 1) % P.length]; s2 += p[0] * q2[1] - q2[0] * p[1]; }
    a += (Math.abs(s2) / 2 - L * W) * n;
  }
  return a;
})();
const PRESETS = [
  { id: 'lvl', name: 'LVL 단판적층재 30 mm', color: '#cdb892', rough: 0.72, metal: 0, refl: 0.4, kg: 16.5, note: '얇은 나무 단판을 겹쳐 붙인 구조용 목재. 가볍고 CNC 가공이 쉬움' },
  { id: 'corten', name: '내후성 강판 (코르텐) 6 mm', color: '#8a4a2c', rough: 0.82, metal: 0.35, refl: 0.15, kg: 47.1, note: '겉의 녹이 보호막. 튼튼하지만 무거워 발이 더 벌어짐' },
  { id: 'alu', name: '알루미늄 판 (A5052) 5 mm', color: '#c9cdd2', rough: 0.3, metal: 1, refl: 0.7, kg: 13.5, note: '가장 가볍고 녹이 슬지 않음. 빛을 많이 되비춤' },
  { id: 'mirror', name: '미러 스테인리스 (STS304) 3 mm', color: '#e4e7ea', rough: 0.05, metal: 1, refl: 0.6, kg: 23.8, note: '거울처럼 공원을 비춤. 여름엔 눈부심 주의' },
];
if (CONFIG.style !== 'real') PRESETS.unshift({ id: 'model', name: '모형 흰색', color: '#efefec', rough: 0.92, metal: 0, refl: 0.8, note: '재료 대신 형태만' });
$('#matList').innerHTML = PRESETS.map((p, i) => `<label><input type="radio" name="mat" value="${i}" ${i === 0 ? 'checked' : ''}><span>${p.name}<span class="small" style="display:block">${p.kg ? `${p.kg} kg/m², 판 전체 약 ${(p.kg * PLATE_AREA / 1000).toFixed(1)} t, ` : ''}반사 ${Math.round(p.refl * 100)}%</span><span class="small note">${p.note}</span></span><span class="bar"><i style="width:${p.refl * 100}%"></i></span></label>`).join('');
function setPreset(i) {
  const p = PRESETS[i]; if (!p) return;
  MAT.plate.color.set(p.color); MAT.plate.roughness = p.rough; MAT.plate.metalness = p.metal;
  const r = $(`#matList input[value="${i}"]`); if (r) r.checked = true;
  setSun(state.scene === 1 ? +$('#sunHour').value : 15.5);
}
$$('#matList input').forEach((r) => r.addEventListener('change', () => setPreset(+r.value)));

// ------------------------------------------------------------------ 재료 카드 (실제 건축 재료)
const OPEN_RATIO = (() => { const t = TYPES.win_perf || {}, [L, W] = t.size || [1.2, 0.3], [nx, ny, r] = t.holes || [16, 4, 0.022]; return nx * ny * Math.PI * r * r / (L * W); })();
const MATINFO = {
  plate: { title: 'LVL (단판적층재) 30 mm', rows: [
    ['재료', '3 mm 안팎의 나무 단판을 결 방향으로 겹쳐 붙인 구조용 목재. 넓은 판으로 써도 잘 휘거나 갈라지지 않음'],
    ['규격', `밀도 약 550 kg/m³, 30 mm 판 약 16.5 kg/m². 판 150장 ${PLATE_AREA.toFixed(0)} m² → 약 ${(PLATE_AREA * 16.5 / 1000).toFixed(1)} t`],
    ['가공', 'CNC 라우터로 판 외곽과 창 구멍을 한 번에 자름. 띠마다 모양이 하나라 같은 파일로 30장씩 반복'],
    ['마감', '발수·자외선 차단 오일. 반사율 약 40% 라 안쪽 빛 얼룩이 또렷'] ] },
  win_open: { title: '폴리카보네이트 판 8 mm (투명)', rows: [
    ['재료', '유리처럼 투명하지만 훨씬 가볍고 깨지지 않는 플라스틱 판. 온실, 버스 정류장 지붕에 흔히 쓰임'],
    ['규격', `빛 투과 약 85%, 약 9.6 kg/m², 창 하나 ${(WS[0] * WS[1]).toFixed(2)} m²`],
    ['고정', 'EPDM 고무 가스켓으로 판 구멍에 끼움'],
    ['쓰인 곳', '일사가 적은 판 → 약한 빛을 그대로 들임'] ] },
  win_perf: { title: '타공 알루미늄판 4 mm', rows: [
    ['재료', '알루미늄 판에 구멍을 규칙적으로 뚫은 외장재. 건물 차양, 주차장 외벽에 많이 쓰임'],
    ['규격', `구멍 Ø${Math.round(((TYPES.win_perf || {}).holes || [0, 0, 0.022])[2] * 2000)} mm, 간격 75 mm → 개구율 약 ${Math.round(OPEN_RATIO * 100)}%. 약 10.8 kg/m²`],
    ['가공', '펀칭 또는 레이저 타공 후 분체도장'],
    ['쓰인 곳', `일사가 중간인 판 → 빛의 약 ${Math.round(OPEN_RATIO * 100)}% 만 통과, 바닥에 점무늬 빛 얼룩`] ] },
  win_solid: { title: '알루미늄 복합판 (ACM) 6 mm', rows: [
    ['재료', '알루미늄 0.5 mm 두 장 사이에 불연 심재를 넣은 외장 패널. 상가 간판, 건물 외벽에 흔함'],
    ['규격', '약 7.5 kg/m², 평평하고 단단함'],
    ['고정', '재단 후 판 구멍 테두리에 볼트로 고정'],
    ['쓰인 곳', '일사가 가장 많은 판 → 강한 여름 해를 막아 그늘'] ] },
  hinge_gen: { title: '강재 핀 힌지 (스테인리스 STS304)', rows: [
    ['재료', '녹슬지 않는 스테인리스 강. 야외에서 여러 번 조립·해체해도 견딤'],
    ['규격', `핀 Ø${Math.round(((TYPES.hinge_gen || {}).r || 0.018) * 2000)} mm × ${Math.round(((TYPES.hinge_gen || {}).L || 0.16) * 1000)} mm, 판마다 볼트 4개`],
    ['역할', '띠 안의 주름 접힘선을 이어 판이 접히게 함. 세운 뒤 볼트로 각도를 고정'] ] },
  hinge_zig: { title: '강재 핀 힌지 + 잠금판 (스테인리스)', rows: [
    ['재료', '같은 스테인리스 핀 힌지에 6 mm 강판 잠금판을 더함'],
    ['규격', `핀 Ø${Math.round(((TYPES.hinge_zig || {}).r || 0.026) * 2000)} mm × ${Math.round(((TYPES.hinge_zig || {}).L || 0.22) * 1000)} mm, 잠금판 볼트 2개`],
    ['역할', '띠와 띠가 크게 꺾이는 곳. 잠금판으로 각도를 묶어야 접히는 기계가 서 있는 구조가 됨 (AI 검토 1)'] ] },
  shoe: { title: '받침 슈 (용융아연도금 강판)', rows: [
    ['재료', '녹 방지를 위해 아연을 입힌 강판 300 × 300 × 20 mm + 세움 리브'],
    ['고정', '땅에는 스크류 파일(나선형 강관 말뚝)을 돌려 박고 볼트로 연결. 콘크리트 없이 설치하고 빼낼 수 있음'],
    ['역할', '발을 땅에 묶고, 양쪽 발을 바닥 아래 강봉 타이(Ø24)로 이어 벌어짐을 막음 (AI 검토 2)'] ] },
};
let memberFilter = null;
function matKey(id) { return id.startsWith('plate_') ? 'plate' : id; }
function showMember(id) {
  memberFilter = memberFilter === id ? null : id;
  $$('#countTable tr[data-id]').forEach((tr) => tr.classList.toggle('sel', tr.dataset.id === memberFilter));
  const card = $('#matCard');
  if (!memberFilter) { card.hidden = true; applyMemberFilter(); return; }
  const t = TYPES[memberFilter] || {}, info = MATINFO[matKey(memberFilter)];
  card.innerHTML = `<div class="fam">${t.family || ''}, ${t.name || memberFilter}, ${won(t.count || 0)}개</div><h4>${info.title}</h4><dl>${info.rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl><button type="button" class="btn" id="matAll">전체 보기</button>`;
  card.hidden = false;
  $('#matAll').addEventListener('click', () => showMember(memberFilter));
  applyMemberFilter();
}
function clearMemberFilter() {           // 5장면을 떠날 때: 선택 해제, 모든 부재 다시 보이기
  memberFilter = null;
  $$('#countTable tr[data-id]').forEach((tr) => tr.classList.remove('sel'));
  $('#matCard').hidden = true;
  for (const m of Object.values(IM)) m.visible = true;
}
function applyMemberFilter() {
  if (state.scene !== 4) return;
  for (const [id, m] of Object.entries(IM)) m.visible = memberFilter ? id === memberFilter : (id === 'shoe' ? state.assembled : true);
  fixes.visible = !memberFilter && state.wantFixes && state.t > 0.999 && state.explode < 0.01;
  shadowDirty();
}

// ------------------------------------------------------------------ 발표 노트 (N)
const NOTES = [
  [`제 파빌리온은 '${NAME}'입니다. 한 문장으로 말하면, ${CONCEPT}.`,
    `참고한 것은 리베스킨트의 Eighteen Turns(2001)입니다. 접은 판으로 벽과 지붕을 한 몸으로 만들었죠. 저는 그 접힌 모양을 고정된 조각이 아니라, 평평한 판 한 장이 실제로 접혀 서는 구조로 바꿨습니다.`],
  [`데이터는 Ladybug 로 계산한 6~8월 누적 일사량입니다. 판 ${NP}장마다 막대 길이와 색이 그 값입니다. 가장 많이 받는 곳은 ${TOP_BAND}로 ${Math.round(rads[iMax])}, 가장 적은 곳은 ${Math.round(rads[iMin])} kWh/m² 입니다.`,
    `이 값이 창의 종류를 바꿨습니다. 많이 받는 ${BAND_KIND[2].join('과 ') || '판'}은 막고, 중간인 ${BAND_KIND[1].join('과 ') || '판'}은 타공판으로 거르고, 적게 받는 ${BAND_KIND[0].join('과 ') || '판'}은 열었습니다. 열림 ${kindCount[0]}, 타공 ${kindCount[1]}, 막힘 ${kindCount[2]}. 경계값을 옮기면 창이 바로 바뀌고, 시간을 움직이면 안쪽 바닥의 빛 얼룩이 바뀝니다.`],
  [`로직은 접는 값 하나입니다. 0이면 평평한 판, 100이면 파빌리온입니다. 판은 휘거나 늘어나지 않고 접힘선에서만 돕니다. 빨간 선이 산접기, 파란 선이 골접기입니다.`,
    `그래스호퍼는 세 그룹입니다. 입력은 단면 점과 판 폭, 줄 수, 주름 각. 규칙은 꺾임 각으로 지그재그 길이를 정하고, 접힘선마다 뒤집어 접고, 일사로 창을 고릅니다. 출력은 블록 ${D.types.length}종과 pavilion.json. 웹도 같은 공식이라 위치가 그대로 맞습니다.`],
  [`구조는 주름이 보 역할을 합니다. 힘은 주름을 따라 양쪽 발로 내려갑니다.`,
    `AI 에게 약점을 물었더니 세 가지였습니다. 첫째, 힌지가 풀려 있으면 이건 구조가 아니라 접히는 기계라서 자기 무게에 펴지며 주저앉습니다. 둘째, 아치처럼 발이 바깥으로 벌어집니다. 셋째, 열린 양 끝의 주름이 벌어집니다.`,
    `그래서 꺾임 힌지에 잠금판, 발에는 받침 슈와 바닥 아래 타이, 양 끝에는 테두리 프레임을 더했습니다.`],
  [`부재는 판 ${N}종, 창 3종, 힌지 2종, 받침 1종, 모두 ${D.types.length}종 ${won(D.types.reduce((s, t) => s + t.count, 0))}개입니다. 판은 띠마다 모양이 하나라서 ${N}종이면 됩니다.`,
    `판은 LVL 단판적층재 30 mm, 열린 창은 폴리카보네이트, 타공은 개구율 ${Math.round(OPEN_RATIO * 100)}% 알루미늄, 막힌 창은 알루미늄 복합판입니다. 조인트는 스테인리스 핀 힌지이고 꺾이는 곳은 잠금판으로 묶습니다. 판을 강판으로 바꾸면 무게가 세 배가 되어 LVL 을 골랐습니다.`,
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
  if (pov.on) { exitPov(false); camKey = null; }
  if (prevScene !== si && typeof closeTopics === 'function') closeTopics();
  // 카드와 패널
  $$('.scene').forEach((a) => a.classList.toggle('on', +a.dataset.scene === si));
  $$(`.scene[data-scene="${si}"] .step`).forEach((s) => s.classList.toggle('on', s.classList.contains('keep') ? +s.dataset.step <= st : +s.dataset.step === st));
  document.body.classList.toggle('closing', si === 4 && st === 3);
  $$('.sidebox').forEach((s) => s.classList.toggle('on', +s.dataset.for === si));
  $('#refBox').classList.toggle('on', si === 0 && st >= 1);
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

// 접기 애니메이션: 새로 시작하거나 손으로 슬라이더를 잡으면 이전 것은 끝난 것으로 처리 (기다리던 쪽이 멈추지 않게)
function cancelFold() {
  if (!foldTw) return;
  const tw = foldTw; foldTw = null; tweens.delete(tw);
  if (tw.res) tw.res();
}
function animateT(to, sec) {
  return new Promise((res) => {
    cancelFold();
    const from = state.t;
    if (Math.abs(to - from) < 1e-4) { applyPose(to); res(); return; }
    const tw = tween(sec, (u) => applyPose(from + (to - from) * u), () => { if (foldTw === tw) foldTw = null; res(); });
    tw.res = res; foldTw = tw;
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
  if (si !== 4 && ps === 4) { clearMemberFilter(); setPreset(0); }
  if (si !== 2 && ps === 2) resetPreview();   // 3장면에서 바꾼 GH 입력값은 다른 장면에 남기지 않음   // 5장면에서 고른 부재·재료는 다른 장면에 남기지 않음
  // 기본값 (장면마다 같은 것을 같은 방식으로)
  setPlateMode(si === 1 && st === 0 ? 'data' : 'material');
  setWindows(!(si === 1 && st === 0));
  creaseLines.visible = si === 2 && $('#creaseToggle').checked;
  loadPath.group.visible = si === 3 && $('#loadToggle').checked;
  thrust.forEach((a) => { a.visible = si === 3 && st === 1; });
  setWeakTags(si === 3 && st >= 1, si === 3 && st === 2);
  for (const t of jointTags) t.on = si === 4 && !!state.joint && camKey === 'joint';
  personTag.on = si === 0 && st === 0 && !pov.on;
  $('#closing').classList.toggle('on', si === 4 && st === 3);
  showGlb();
  park.visible = si === 0 || si === 1 || (si === 4 && st === 3); grid.visible = !park.visible; FOG.park = park.visible;
  if (hourTw && si !== 1) { tweens.delete(hourTw); hourTw = null; }
  setSun(si === 1 ? +$('#sunHour').value : 15.5);          // 공원 표시가 정해진 뒤 빛 다시 계산
  spikes.visible = si === 1 && st === 0; updateSpikes();
  for (const t of dataTags) t.on = si === 1 && st === 0;
  for (const t of bandTags) t.on = si === 1 && st === 1;
  $('#barHelp').hidden = !(si === 1 && st === 0);
  if (!(si === 1 && st === 1)) { stopSweep(); state.extView = false; }
  if (si === 1 && st === 0 && state.night) { const r = $('#sunHour'); r.value = 13; r.style.setProperty('--p', (13 / 24 * 100) + '%'); setSun(13); }
  if (si !== 1 && kindsLive.some((k, i) => k !== kinds[i])) setThresholds(thr[0], thr[1], true);

  if (si !== ps) walk.dragged = false;
  if (!walk.dragged && si !== 0 && !(si === 4 && st === 3)) { person.position.copy(HOME); person.rotation.y = Math.PI; }
  if (!walk.dragged && (si === 0 || (si === 4 && st === 3))) walk.x = clamp(person.position.x, -10, 10);
  if (si !== 4) { if (state.joint) setJoint(false); if (explodeTw) { tweens.delete(explodeTw); explodeTw = null; } if (state.explode) setExplode(0); }
  state.wantFixes = (si === 3 && st === 2) || (si === 4 && state.assembled);
  IM.shoe.visible = !(si === 4 && !state.assembled);
  setHingeLook(si === 3 && st === 2 ? 'locked' : si === 4 ? (state.locked ? 'locked' : 'block') : 'steel');
  IM.hinge_gen.visible = IM.hinge_zig.visible = si >= 2;            // 아이디어·데이터 장면은 판과 창만
  controls.autoRotate = (si === 0 || (si === 4 && st === 3)) && !REDUCED;

  // 장면별 움직임
  if (si === 2) {
    if (st === 0 && ps !== 2) { state.userFold = false; applyPose(0); setTimeout(() => { if (run === runId && !state.userFold) animateT(1, 4.2); }, 900); }
  } else if (si === 3) {
    if (st === 1) animateT(0.72, 1.8);
    else animateT(1, 1.2);
  } else if (si === 4) {
    if (st === 2 && pst !== 2) playAssembly(run);
    else if (st !== 2 && state.t < 0.999) { state.assembling = false; animateT(1, 1.4); }
    if (st !== 2 && !state.assembled) { state.assembled = true; state.locked = false; IM.shoe.visible = true; state.wantFixes = true; setHingeLook('block'); }
    if (st === 0 && ps !== 4) { setExplode(0); setTimeout(() => { if (run === runId) animateExplode(0.75, 2.4); }, 600); }
    if (st < 2) { state.locked = false; setHingeLook('block'); }
    const wantJoint = st === 1;
    if (st >= 1 && state.explode) animateExplode(0, 0.9);
    if (state.joint !== wantJoint) setJoint(wantJoint, st >= 1 && state.explode ? 950 : 0);
  } else if (state.t < 0.999 && !foldTw) animateT(1, 1.2);
  if (si === 1 && st === 1 && !(ps === 1 && pst === 1)) { winShown.fill(false); state.sweeping = true; setTimeout(() => { if (run === runId) playSweep(); }, 500); }
  safe(refreshFixes);
  if (loadPath.group.visible) safe(buildLoadPath);
  if (creaseLines.visible) safe(updateCreaseLines);
  moveCamera();
  if (si === 4 && memberFilter) applyMemberFilter();
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
bindRange($('#sunHour'), (v) => { if (state.scene === 1) { if (hourTw) { tweens.delete(hourTw); hourTw = null; } setSun(v); if (state.extView) { state.extView = false; moveCamera(); } } });
// 3장면: GH 입력값(판 폭, 줄 수, 주름 각, 방향)을 바꾸면 판만 다시 접어 보는 미리보기
const GHP0 = { w: rig.w, n: rig.n, phi: rig.phi, rot: rig.rot };
var ghp = { ...GHP0 };
var preview = null;
const ghpFmt = { w: (v) => v.toFixed(2) + ' m', n: (v) => v + '줄', phi: (v) => v + '°', rot: (v) => v + '°' };
const ghpEl = { w: $('#ghpW'), n: $('#ghpN'), phi: $('#ghpPhi'), rot: $('#ghpRot') };
const ghpOut = { w: $('#ghpWOut'), n: $('#ghpNOut'), phi: $('#ghpPhiOut'), rot: $('#ghpRotOut') };
const ghpChanged = () => Object.keys(GHP0).some((k) => Math.abs(ghp[k] - GHP0[k]) > 1e-9);
function dropPreview() { if (!preview) return; pav.parent.remove(preview); preview.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); preview = null; }
function updatePreview() {
  if (!ghp) return;
  if (!ghpChanged()) { if (preview) { dropPreview(); pav.visible = true; shadowDirty(); } return; }
  let r;
  try { r = new Rig({ ...D.params, w: ghp.w, n: ghp.n, phi: ghp.phi, rot: ghp.rot }, 1.0); } catch (err) { console.error('[미리보기]', err); return; }
  const P = r.pose(state.t), pos = [];
  for (const f of P.frames) { const [a, b, c, d] = f.v; pos.push(...a, ...b, ...c, ...a, ...c, ...d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  dropPreview();
  preview = new THREE.Group();
  preview.position.copy(pav.position); preview.quaternion.copy(pav.quaternion); preview.scale.copy(pav.scale);
  const m = new THREE.Mesh(g, ghpMat); m.castShadow = true; m.receiveShadow = true; preview.add(m);
  preview.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 1), ghpLine));
  if ($('#creaseToggle').checked) {
    const idx = {}; P.frames.forEach((f) => { idx[f.band + ',' + f.j] = f; });
    const cM = new THREE.Color(tok('--signal')), cV = new THREE.Color(tok('--valley')), cp = [], cc = [];
    for (const c of r.creases) {
      const fa = c.kind === 'gen' ? idx[c.kb + ',' + (c.ja - 1)] : idx[c.ka + ',' + c.ja];
      const fb = c.kind === 'gen' ? idx[c.kb + ',' + c.ja] : idx[(c.ka + 1) + ',' + c.ja];
      const off = fa && fb ? V.mul(V.unit(V.add(fa.n, fb.n)), 0.03) : [0, 0, 0];
      cp.push(...V.add(P.B[c.ka][c.ja], off), ...V.add(P.B[c.kb][c.jb], off));
      const k = c.mv === 'M' ? cM : cV; cc.push(k.r, k.g, k.b, k.r, k.g, k.b);
    }
    const lg = new LineSegmentsGeometry(); lg.setPositions(cp); lg.setColors(cc);
    const cl = new LineSegments2(lg, creaseMat); cl.userData.noAO = true; preview.add(cl);
    $('#nM').textContent = r.creases.filter((c) => c.mv === 'M').length;
    $('#nV').textContent = r.creases.filter((c) => c.mv === 'V').length;
  }
  pav.parent.add(preview);
  pav.visible = false;
  $('#ghpNote').textContent = `미리보기: 판 ${r.N}띠 × ${r.n}줄 = ${r.N * r.n}장. 창과 힌지는 빼고 판만 보입니다. 다른 장면으로 넘어가면 GH 값으로 돌아갑니다.`;
  shadowDirty();
}
const ghpMat = new THREE.MeshStandardMaterial({ color: MAT.plate.color.clone(), roughness: 0.85, side: THREE.DoubleSide });
const ghpLine = new THREE.LineBasicMaterial({ color: 0x18202b, transparent: true, opacity: 0.35 });
function syncGhpInputs() {
  for (const k of Object.keys(ghpEl)) {
    const el = ghpEl[k]; el.value = ghp[k];
    el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
    ghpOut[k].textContent = ghpFmt[k](ghp[k]);
  }
}
function resetPreview() {
  Object.assign(ghp, GHP0); syncGhpInputs(); dropPreview(); pav.visible = true;
  $('#nM').textContent = rig.creases.filter((c) => c.mv === 'M').length;
  $('#nV').textContent = rig.creases.filter((c) => c.mv === 'V').length;
  $('#ghpNote').textContent = 'GH 와 같은 접기 공식으로 판만 다시 계산한 미리보기입니다. 다른 장면으로 넘어가면 GH 값으로 돌아갑니다.';
  shadowDirty();
}
syncGhpInputs();
for (const k of Object.keys(ghpEl)) {
  const el = ghpEl[k];
  el.addEventListener('input', () => {
    if (state.scene !== 2) return;
    ghp[k] = +el.value; syncGhpInputs();
    if (state.t < 0.999 || foldTw) { cancelFold(); applyPose(1); } else updatePreview();
  });
  el.addEventListener('pointerup', () => el.blur());
}
$('#ghpReset').addEventListener('click', () => resetPreview());
$('#creaseToggle').addEventListener('change', () => { if (preview) updatePreview(); });

bindRange($('#foldT'), (v) => { if (state.scene === 2) { state.userFold = true; cancelFold(); applyPose(v / 100); } });
bindRange($('#explode'), (v) => { if (state.scene === 4 && explodeTw) { tweens.delete(explodeTw); explodeTw = null; } if (state.scene === 4 && Math.abs(v / 100 - state.explode) > 1e-3) { state.explode = v / 100; $('#explodeOut').textContent = v + '%'; applyPose(state.t); if (state.joint) { camKey = null; moveCamera(); } } });
$('#foldPlay').addEventListener('click', () => { cancelFold(); applyPose(0); animateT(1, 4.2); });
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

// 실사 렌더 이미지 (assets/render.jpg 가 있으면 끝맺음 장면에서 보기 버튼)
const renderImg = new Image();
renderImg.addEventListener('load', () => { $('#renderBtn').hidden = false; $('#renderView img').src = renderImg.src; });
renderImg.src = './assets/render.jpg';
$('#renderBtn').addEventListener('click', () => $('#renderView').classList.add('on'));
$('#renderView').addEventListener('click', (e) => e.currentTarget.classList.remove('on'));

// GH 캡처 이미지
const ghImg = $('#ghImg');
ghImg.addEventListener('load', () => { ghImg.hidden = false; $('#ghEmpty').hidden = true; });
ghImg.src = './assets/gh_groups.png';
$('#lightbox').addEventListener('click', (e) => e.currentTarget.classList.remove('on'));
// 참고한 파빌리온 사진: 누르면 원본 크기, 못 불러오면 그 사진만 숨김
$$('#refBox img').forEach((im) => {
  im.addEventListener('click', () => { const lb = $('#lightbox'); lb.querySelector('img').src = im.dataset.full || im.src; lb.classList.add('on'); });
  im.addEventListener('error', () => { im.hidden = true; });
});

// 장면 안 키워드: 누르면 설명이 열림 (장면마다 하나씩만)
function closeTopics(scope = document) {
  $$('.topic', scope).forEach((b) => b.setAttribute('aria-expanded', 'false'));
  $$('.topic-body', scope).forEach((p) => { p.hidden = true; });
}
$$('.topic').forEach((b) => b.addEventListener('click', () => {
  const box = b.closest('.topics'), open = b.getAttribute('aria-expanded') !== 'true';
  closeTopics(box);
  if (open) { b.setAttribute('aria-expanded', 'true'); const p = $('#' + b.getAttribute('aria-controls')); p.hidden = false; p.scrollIntoView({ block: 'nearest' }); }
}));

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

// ------------------------------------------------------------------ 낮과 밤 (시간 슬라이더): 해, 달, 별, 가로등, 안쪽 등
const lamp = new THREE.PointLight('#ffc888', 0, 0, 2);          // 볼트 안 등불
lamp.castShadow = true; lamp.shadow.mapSize.set(LITE ? 512 : 1024, LITE ? 512 : 1024);
lamp.shadow.bias = -0.003; lamp.shadow.camera.near = 0.1; lamp.shadow.camera.far = 30;
{ const a = toWorld(V.mean(rig.B1[0])), b = toWorld(V.mean(rig.B1[N])); lamp.position.set(0, 2.1, (a.z + b.z) / 2); }
scene.add(lamp);
const plazaLights = PLAZA_LAMPS.map(([x, z]) => { const L = new THREE.PointLight('#ffd9a0', 0, 16, 1.6); L.position.set(x, 4.0, z); scene.add(L); return L; });
const moon = new THREE.DirectionalLight('#aebfff', 0);
moon.castShadow = false; moon.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
Object.assign(moon.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 5, far: 90 });
moon.shadow.bias = -0.0003; moon.shadow.normalBias = 0.02;
moon.target.position.set(0, 1.5, 0);
scene.add(moon, moon.target);
const glowTex = (inner, outer) => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(3.1, 24, 16), new THREE.MeshBasicMaterial({ color: '#f4f1e4', fog: false, toneMapped: false }));
const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(220,228,255,0.55)', 'rgba(220,228,255,0)'), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
moonGlow.scale.setScalar(22); moonDisc.add(moonGlow);
moonDisc.visible = false; scene.add(moonDisc);
const stars = (() => {
  let sd = 7; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const pos = []; for (let i = 0; i < 700; i++) { const az = r() * Math.PI * 2, el = Math.asin(0.08 + r() * 0.92); pos.push(Math.cos(el) * Math.cos(az) * 150, Math.sin(el) * 150, Math.cos(el) * Math.sin(az) * 150); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  p.visible = false; scene.add(p); return p;
})();
// 가로등 아래 빛 웅덩이 (공원과 함께 보임)
const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: glowTex('rgba(255,214,150,0.9)', 'rgba(255,214,150,0)'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), Math.max(parkLamps.length, 1));
parkLamps.forEach((l, i) => { const sz = l.plaza ? 9 : 6.5; _m.compose(new THREE.Vector3(l.x, 0.05, l.z), new THREE.Quaternion(), new THREE.Vector3(sz, 1, sz)); pools.setMatrixAt(i, _m); });
pools.count = parkLamps.length; pools.visible = false; pools.renderOrder = 2; park.add(pools);
const SKY = { dayBg: BG.clone(), nightBg: new THREE.Color('#0c1118'), dayGround: new THREE.Color(tok('--ground')), nightGround: new THREE.Color('#12171e'), f: 0 };
state.night = false;
function baseLight() {          // 장면마다 낮의 하늘빛, 반사 환경
  const inside = state.scene === 1 && state.step === 1, SH = CONFIG.shadow === 'sharp' ? 0.6 : 1;
  return { hemi: inside ? 0.42 * SH : HEMI, env: (inside ? 0.22 : (MAT.plate.metalness > 0.5 ? 0.8 : CONFIG.style === 'line' ? 0.7 : 0.45)) * SH };
}
function applySky(f, moonW, malt) {
  SKY.f = f;
  const was = state.night; state.night = f > 0.5;
  document.body.classList.toggle('night', state.night);
  scene.background.copy(SKY.dayBg).lerp(SKY.nightBg, f); scene.fog.color.copy(scene.background);
  if (typeof updateSky === 'function') updateSky();
  ground.material.color.copy(SKY.dayGround).lerp(SKY.nightGround, f);
  const L = baseLight();
  hemi.intensity = L.hemi * (1 - f) + 0.09 * f;
  scene.environmentIntensity = L.env * (1 - f) + 0.05 * f;
  lamp.intensity = 14 * f; lamp.visible = f > 0.01;                // 낮에는 빛 자체를 꺼서 계산을 줄임
  for (const p of plazaLights) { p.intensity = 9 * f; p.visible = park.visible && f > 0.01; }
  MAT.open.emissive.set('#ffcf96'); MAT.open.emissiveIntensity = 0.8 * f;
  if (parkLampMat) { parkLampMat.emissiveIntensity = 0.25 + 3.5 * f; }
  pools.material.opacity = 0.75 * f; pools.visible = f > 0.01;
  stars.visible = f > 0.05; stars.material.opacity = clamp((f - 0.3) / 0.7, 0, 1);
  const mUp = malt > 0;
  moon.position.copy(moonW).multiplyScalar(40).add(moon.target.position);
  moon.intensity = mUp ? 0.7 * clamp(Math.sin(malt) * 3, 0.25, 1) * f : 0;
  moon.visible = mUp && f > 0.02; moon.castShadow = moon.visible;
  moonDisc.visible = mUp && f > 0.15;
  moonGlow.material.opacity = f;
  $$('#dayNight button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.night === '1') === state.night)));
  if (was !== state.night && state.scene === 1 && state.step === 1) { camKey = null; moveCamera(); }
}
// 낮 / 밤 버튼: 시간을 13:00 또는 21:30 으로 옮김 (해와 달이 움직이는 모습)
let hourTw = null;
function animateHour(to, sec = 2.2) {
  if (hourTw) tweens.delete(hourTw);
  const r = $('#sunHour'), from = +r.value;
  hourTw = tween(sec, (u) => { const h = from + (to - from) * u; r.value = h; r.style.setProperty('--p', (h / 24 * 100) + '%'); setSun(h); }, () => { hourTw = null; });
}
if (CONFIG.night) {
  const box = document.createElement('div');
  box.className = 'seg'; box.id = 'dayNight'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', '낮과 밤');
  box.innerHTML = '<button type="button" data-night="0" aria-pressed="true">낮 13:00</button><button type="button" data-night="1" aria-pressed="false">밤 21:30</button>';
  $('.scene[data-scene="1"] .step[data-step="1"] h3').after(box);
  box.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || state.scene !== 1) return; state.extView = false; animateHour(b.dataset.night === '1' ? 21.5 : 13); });
}

// ------------------------------------------------------------------ 하늘: 그러데이션 돔, 해, 눈부심 (공원이 보이는 장면)
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(230, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color('#fff2d8') }, glow: { value: 0 } },
  vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float glow; varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir); float h = max(d.y, 0.0);
      vec3 c = mix(hor, top, pow(h, 0.55));
      float s = max(dot(d, sunDir), 0.0);
      c += sunCol * (pow(s, 48.0) * 0.9 + pow(s, 6.0) * 0.18) * glow;
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
skyDome.renderOrder = -10; skyDome.visible = false; scene.add(skyDome);
const SKYCOL = { dayTop: new THREE.Color('#9fb9d4'), dayHor: new THREE.Color('#dfe3e1'), duskTop: new THREE.Color('#58698a'), duskHor: new THREE.Color('#e9b98f'), nightTop: new THREE.Color('#05080e'), nightHor: new THREE.Color('#111824') };
const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(3.6, 24, 16), new THREE.MeshBasicMaterial({ color: '#fffbef', fog: false, toneMapped: false }));
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,244,214,0.95)', 'rgba(255,236,190,0)'), fog: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
sunGlow.scale.setScalar(46); sunDisc.add(sunGlow);
sunDisc.visible = false; scene.add(sunDisc);
function updateSky() {
  const on = park.visible;
  skyDome.visible = on;
  if (!on) { sunDisc.visible = false; return; }
  const f = SKY.f, dusk = clamp(1 - Math.abs(SUNNOW.alt * 180 / Math.PI - 2) / 10, 0, 1) * (1 - f * 0.6);   // 해 높이 -8°~12° 노을
  const u = skyDome.material.uniforms;
  u.top.value.copy(SKYCOL.dayTop).lerp(SKYCOL.duskTop, dusk * 0.6).lerp(SKYCOL.nightTop, f);
  u.hor.value.copy(SKYCOL.dayHor).lerp(SKYCOL.duskHor, dusk * 0.7).lerp(SKYCOL.nightHor, f);
  u.sunDir.value.copy(SUNNOW.w); u.glow.value = SUNNOW.alt > -0.05 ? 1 - f : 0;
  scene.fog.color.copy(u.hor.value); scene.background.copy(u.hor.value);
  sunDisc.visible = SUNNOW.alt > -0.02;
}
// 해와 달, 별은 카메라를 따라다님 (아무리 걸어도 같은 방향)
function followSky() {
  const c = rcam.position;
  skyDome.position.copy(c);
  sunDisc.position.copy(c).addScaledVector(SUNNOW.w, 180);
  moonDisc.position.copy(c).addScaledVector(SUNNOW.mw, 175);
  stars.position.copy(c);
}
// 눈부심: 해(또는 달)를 바라보는데 가리는 것이 없으면 화면이 하얗게 번짐. 파빌리온 안에서는 판이 가려 사라짐
const glareEl = $('#glare');
const glare = { g: 0, vis: 1, frame: 0, moon: false };
const glareRay = new THREE.Raycaster();
const _fw = new THREE.Vector3(), _gv = new THREE.Vector3(), _ga = new THREE.Vector3(), _gb = new THREE.Vector3();
function lightVisibility(L) {
  const occ = Object.keys(IM).filter((k) => k.startsWith('plate_') || k === 'win_solid' || k === 'win_perf').map((k) => IM[k]).filter((m) => m.visible).concat(parkOccluders);
  _ga.set(0, 1, 0).cross(L); if (_ga.lengthSq() < 1e-6) _ga.set(1, 0, 0); _ga.normalize(); _gb.copy(L).cross(_ga).normalize();
  const offs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  let free = 0;
  for (const [a, b] of offs) {
    _gv.copy(L).addScaledVector(_ga, a * 0.008).addScaledVector(_gb, b * 0.008).normalize();
    glareRay.set(rcam.position, _gv); glareRay.far = 170;
    if (!glareRay.intersectObjects(occ, false).length) free++;
  }
  return free / offs.length;
}
function updateGlare(dt) {
  let target = 0, L = null;
  const sunUp = SUNNOW.alt > 0.01, moonUp = SUNNOW.malt > 0.02 && SKY.f > 0.5;
  if (park.visible && (sunUp || moonUp) && !rcam.isOrthographicCamera) {
    L = sunUp ? SUNNOW.w : SUNNOW.mw; glare.moon = !sunUp;
    _fw.set(0, 0, -1).applyQuaternion(rcam.quaternion);
    const facing = _fw.dot(L), base = clamp((facing - 0.45) / 0.53, 0, 1);
    if (base > 0) {
      if (glare.frame++ % 3 === 0) glare.vis = lightVisibility(L);
      const strength = sunUp ? clamp(Math.sin(SUNNOW.alt) * 2.5, 0.45, 1) : 0.35;
      target = strength * Math.pow(base, 1.6) * glare.vis * 0.85;
    }
  }
  glare.g += (target - glare.g) * (1 - Math.exp(-dt * (target > glare.g ? 7 : 4)));   // 눈이 적응하는 속도
  const g = glare.g;
  if (g < 0.003) { if (glareEl.style.opacity !== '0') glareEl.style.opacity = 0; renderer.toneMappingExposure = BASE_EXPOSURE; return; }
  _gv.copy(rcam.position).addScaledVector(L || SUNNOW.w, 100).project(rcam);
  const x = (_gv.x + 1) / 2 * 100, y = (1 - _gv.y) / 2 * 100;
  glareEl.classList.toggle('moon', glare.moon);
  glareEl.style.opacity = g.toFixed(3);
  glareEl.style.setProperty('--gx', x.toFixed(1) + '%'); glareEl.style.setProperty('--gy', y.toFixed(1) + '%');
  glareEl.style.setProperty('--gw', (0.15 + 0.45 * g).toFixed(3));
  $$('.ghost', glareEl).forEach((el, k) => { const t = [0.55, 1.25, 1.7][k]; el.style.left = (x + (50 - x) * t * 2) + '%'; el.style.top = (y + (50 - y) * t * 2) + '%'; });
  renderer.toneMappingExposure = BASE_EXPOSURE * (1 + (glare.moon ? 0.3 : 0.7) * g);
}

// ------------------------------------------------------------------ 원근 / 평행 전환
function setOrtho(on) {
  state.ortho = on;
  $$('#camSeg button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.cam === 'ortho') === on)));
}
$$('#camSeg button').forEach((b) => b.addEventListener('click', () => { setOrtho(b.dataset.cam === 'ortho'); b.blur(); }));
setOrtho(state.ortho);

// ------------------------------------------------------------------ 키
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const inRange = e.target.matches && e.target.matches('input[type=range]');
  const k = e.key;
  if (pov.on && MOVE_KEYS.has(k)) { keys.add(k.length === 1 ? k.toLowerCase() : k); e.preventDefault(); return; }
  if ((k === 'ArrowRight' || k === 'PageDown') && !inRange) { e.preventDefault(); next(); }
  else if ((k === 'ArrowLeft' || k === 'PageUp') && !inRange) { e.preventDefault(); prev(); }
  else if (k >= '1' && k <= '5') go(+k - 1, 0);
  else if (k === 'r' || k === 'R') { if (pov.on) exitPov(); else { camKey = null; moveCamera(true); } }
  else if (k === 'n' || k === 'N') $('#notes').classList.toggle('on');
  else if (k === 'f' || k === 'F') { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
  else if (k === 'p' || k === 'P') { if (state.scene === 2) $('#foldPlay').click(); if (state.scene === 4) playAssembly(); }
  else if (k === 'o' || k === 'O') setOrtho(!state.ortho);
  else if (k === 'Escape') { $('#lightbox').classList.remove('on'); closeTopics(); exitPov(); }
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

const clock = new THREE.Clock(), pclock = new THREE.Clock();
renderer.setAnimationLoop((now) => {
  for (const tw of [...tweens]) {
    const u = clamp((now - tw.t0) / tw.dur, 0, 1);
    tw.fn(ease(u));
    if (u >= 1) { tweens.delete(tw); tw.done && tw.done(); }
  }
  controls.autoRotate = (state.scene === 0 || (state.scene === 4 && state.step === 3)) && !camTw && !REDUCED;
  if (!pov.on) controls.update();
  if (loadPath.group.visible) animateLoadPath(clock.getElapsedTime());
  const pdt = Math.min(pclock.getDelta(), 0.05);
  updatePerson(pdt);
  updatePov(pdt);
  syncCams();
  followSky();
  updateGlare(pdt);
  updateTags();
  if (composer) composer.render(); else renderer.render(scene, rcam);
});
window.__pav = { state, go, rig, applyPose, setExplode, camera, controls, person, enterPov, pov, walk, SUNNOW, glare, IM, lpDots: () => (loadPath.group.visible ? lpDots.count : -1), screenOf: (v) => { const p = v.clone().project(rcam); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; } };
