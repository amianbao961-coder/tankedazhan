import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no inline script found'); process.exit(1); }
const code = m[1];
try {
  new Function(code);
  console.log('PASS: inline JS syntax OK, length =', code.length);
} catch (e) {
  console.error('FAIL: JS syntax error:', e.message);
  process.exit(1);
}

// 校验地图：每个 map 数组 14 行、每行 14 字符
const maps = [...code.matchAll(/map:\s*\[([\s\S]*?)\],?\s*\n\s*\},/g)];
let ok = true;
if (maps.length === 0) {
  // 兼容末尾不带逗号
  const maps2 = [...code.matchAll(/map:\s*\[([\s\S]*?)\]/g)];
  if (maps2.length === 0) { console.error('FAIL: no maps found'); process.exit(1); }
  check(maps2);
} else {
  check(maps);
}
function check(list) {
  let i = 0;
  for (const entry of list) {
    i++;
    const rows = [...entry[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    if (rows.length !== 14) { console.error(`FAIL: map ${i} has ${rows.length} rows`); ok = false; }
    rows.forEach((row, idx) => {
      if (row.length !== 14) { console.error(`FAIL: map ${i} row ${idx} length ${row.length}: "${row}"`); ok = false; }
    });
    console.log(`map ${i}: ${rows.length} rows, widths ${[...new Set(rows.map(r => r.length))].join(',')}`);
  }
  console.log(ok ? 'PASS: all maps valid' : 'FAIL: map validation errors');
  if (!ok) process.exit(1);
}

// 检查必须存在的函数/ID
const required = ['function update(', 'function draw(', 'function init(', 'startGame', 'drawTank', 'drawBase', 'spawnPowerUp'];
for (const r of required) {
  if (!code.includes(r)) { console.error('FAIL: missing', r); ok = false; }
}
console.log(ok ? 'PASS: required symbols present' : 'FAIL: missing symbols');
process.exit(ok ? 0 : 1);
