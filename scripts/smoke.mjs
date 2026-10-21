// 无浏览器运行时冒烟测试：用 DOM/Canvas 桩驱动游戏 50 秒随机操作，捕获运行时异常。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeCtx() {
  const gradient = { addColorStop() {} };
  const ctx = {
    canvas: null, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt',
    globalAlpha: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    shadowColor: '', shadowBlur: 0,
    setTransform() {}, clearRect() {}, drawImage() {}, save() {}, restore() {},
    translate() {}, rotate() {}, scale() {},
    fillRect() {}, strokeRect() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    arc() {}, arcTo() {}, ellipse() {}, fill() {}, stroke() {}, clip() {},
    fillText() {}, strokeText() {}, measureText() { return { width: 10 }; },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    createPattern() { return null; },
  };
  return ctx;
}

function makeElement(id, extra = {}) {
  const listeners = new Map();
  const classes = new Set();
  const el = {
    id,
    tagName: extra.tagName || 'DIV',
    dataset: extra.dataset || {},
    style: {},
    textContent: '',
    innerHTML: '',
    hidden: false,
    classList: {
      add(...cs) { cs.forEach((c) => classes.add(c)); },
      remove(...cs) { cs.forEach((c) => classes.delete(c)); },
      toggle(c, force) {
        const on = force === undefined ? !classes.has(c) : !!force;
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
      contains(c) { return classes.has(c); },
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener() {},
    querySelectorAll(sel) { return extra.querySelectorAll ? extra.querySelectorAll(sel) : []; },
    getBoundingClientRect() { return extra.rect || { width: 760, height: 760, left: 0, top: 0 }; },
    setPointerCapture() {},
    releasePointerCapture() {},
    requestFullscreen() { return Promise.resolve(); },
    _fire(type, ev) { for (const fn of (listeners.get(type) || [])) fn(ev || {}); },
  };
  return el;
}

const ctx = makeCtx();
const canvasEl = makeElement('game', { tagName: 'CANVAS' });
canvasEl.width = 504;
canvasEl.height = 504;
canvasEl.getContext = () => ctx;

const stageEl = makeElement('stage', { rect: { width: 760, height: 760, left: 0, top: 0 } });
const elements = new Map();
for (const id of [
  'hud-stage', 'hud-score', 'hud-high', 'hud-lives', 'hud-power', 'hud-enemies',
  'overlay', 'screen-start', 'screen-pause', 'screen-clear', 'screen-over',
  'start-high', 'clear-title', 'clear-sub', 'clear-score',
  'over-reason', 'over-score', 'over-best',
  'btn-start', 'btn-resume', 'btn-next', 'btn-restart', 'btn-sound', 'btn-full', 'btn-fire',
  'touch', 'dpad',
]) elements.set(id, makeElement(id));
elements.set('stage', stageEl);
elements.set('game', canvasEl);

// dpad 按钮
const dpadButtons = [0, 1, 2, 3].map((d) => makeElement('dpad-' + d, { dataset: { dir: String(d) } }));
elements.get('dpad').querySelectorAll = () => dpadButtons;

const documentStub = {
  getElementById(id) { return elements.get(id) || null; },
  createElement(tag) {
    if (tag === 'canvas') {
      const c = makeElement('offscreen', { tagName: 'CANVAS' });
      c.width = 504; c.height = 504;
      c.getContext = () => makeCtx();
      return c;
    }
    return makeElement('el');
  },
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
  fullscreenElement: null,
  exitFullscreen() { return Promise.resolve(); },
  documentElement: { setAttribute() {}, removeAttribute() {} },
  body: makeElement('body'),
};

const winListeners = new Map();
const windowStub = {
  devicePixelRatio: 2,
  innerWidth: 1440,
  innerHeight: 1000,
  matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
  addEventListener(type, fn) {
    if (!winListeners.has(type)) winListeners.set(type, []);
    winListeners.get(type).push(fn);
  },
  removeEventListener() {},
  AudioContext: undefined,
  webkitAudioContext: undefined,
};

let rafCb = null;
const rafStub = (cb) => { rafCb = cb; return 1; };

class ResizeObserverStub {
  constructor(cb) { this.cb = cb; }
  observe() {}
  disconnect() {}
}

const storage = new Map();
const localStorageStub = {
  getItem(k) { return storage.has(k) ? storage.get(k) : null; },
  setItem(k, v) { storage.set(k, String(v)); },
  removeItem(k) { storage.delete(k); },
};

const fireWindow = (type, ev) => {
  for (const fn of (winListeners.get(type) || [])) fn(ev || {});
};

const sandbox = {
  console,
  window: windowStub,
  document: documentStub,
  localStorage: localStorageStub,
  requestAnimationFrame: rafStub,
  cancelAnimationFrame() {},
  ResizeObserver: ResizeObserverStub,
  URLSearchParams,
  location: { search: '' },
  navigator: { maxTouchPoints: 0, userAgent: 'node' },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
};
sandbox.globalThis = sandbox;

const context = vm.createContext(sandbox);
let fatal = null;
try {
  vm.runInContext(code, context, { filename: 'index.inline.js' });
} catch (e) {
  console.error('FAIL: 初始化抛出异常:', e && e.stack || e);
  process.exit(1);
}

if (!rafCb) {
  console.error('FAIL: 游戏没有启动 requestAnimationFrame 主循环');
  process.exit(1);
}

// 点击开始
const startBtn = elements.get('btn-start');
try {
  startBtn._fire('click', {});
} catch (e) {
  console.error('FAIL: 开始游戏抛出异常:', e && e.stack || e);
  process.exit(1);
}

// 随机操作 + 驱动帧
const dirCodes = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
let dirIdx = 0;
let ts = 0;
let frameCount = 0;
const errors = [];
const FRAMES = 3600; // 约 60 秒
let lastDir = null;

function keydown(code) {
  try {
    fireWindow('keydown', { code, preventDefault() {}, repeat: false });
  } catch (e) { errors.push('keydown ' + code + ': ' + (e && e.message)); }
}
function keyup(code) {
  try {
    fireWindow('keyup', { code, preventDefault() {} });
  } catch (e) { errors.push('keyup ' + code + ': ' + (e && e.message)); }
}

for (let i = 0; i < FRAMES; i++) {
  if (i % 40 === 0) {
    if (lastDir) keyup(lastDir);
    dirIdx = Math.floor(Math.random() * dirCodes.length);
    lastDir = dirCodes[dirIdx];
    keydown(lastDir);
  }
  if (i % 7 === 0) keydown('KeyJ');
  if (i % 7 === 3) keyup('KeyJ');
  if (i === 900) keydown('KeyP');
  if (i === 960) keydown('Enter');
  if (i % 1200 === 1100) keydown('Enter');
  if (i === 1800) keydown('KeyM');
  if (i === 1810) keydown('KeyM');

  ts += 1000 / 60;
  const cb = rafCb;
  if (!cb) { errors.push('rAF 回调丢失，frame=' + i); break; }
  try {
    cb(ts);
  } catch (e) {
    errors.push('frame ' + i + ': ' + (e && e.stack ? e.stack : e));
    if (errors.length > 3) break;
  }
  frameCount++;
  // 让出事件循环给 setTimeout（结算遮罩等）
  if (i % 300 === 0) await new Promise((r) => setImmediate(r));
}

// 再次点击结束遮罩按钮，确保绑定无异常
for (const id of ['btn-resume', 'btn-next', 'btn-restart']) {
  try { elements.get(id)._fire('click', {}); } catch (e) { errors.push(id + ' click: ' + e.message); }
}
// 暂停后继续/重开流程
try {
  elements.get('btn-restart')._fire('click', {});
  for (let i = 0; i < 120; i++) { ts += 1000 / 60; rafCb(ts); frameCount++; }
} catch (e) {
  errors.push('restart flow: ' + (e && e.stack || e));
}

const leftover = documentStub.documentElement.__error || null;
if (errors.length) {
  console.error('FAIL: 运行时错误:');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}
console.log(`PASS: 初始化、开局、${frameCount} 帧（约 ${(frameCount / 60).toFixed(0)} 秒）随机操作无异常`);
console.log('      覆盖：移动/开火/命中/爆炸/暂停/继续/重开/音效开关');
