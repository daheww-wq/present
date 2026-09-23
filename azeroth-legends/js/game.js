// ===== 아제로스 레전드: 게임 엔진 =====
'use strict';

const TILE = 64, MAP_W = 24, MAP_H = 16;
const T = { GRASS: 0, TREE: 1, WATER: 2, ROAD: 3, TOWN: 4, PORTAL: 5, BACK: 6, LAIR: 7 };
const SAVE_KEY = 'azeroth_legends_save_v1';

const $ = sel => document.querySelector(sel);
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ===== 상태 =====
let S = null;        // 영구 상태 (저장 대상)
let W = null;        // 월드(현재 지역 지도, 몬스터) - 재생성 가능
let C = null;        // 전투 상태
let uiTab = 'char';
let aiTimer = null;

function newState(name, race, cls) {
  return {
    name, race, cls, level: 1, xp: 0, gold: 10,
    hp: 0, res: null,
    zone: 0, pos: { x: 3, y: 8 },
    equip: {}, bag: [], consum: { hpot_s: 3, bread: 2 }, questItems: {},
    quests: {},          // id -> { status: 'active'|'done', progress }
    kills: {},           // 몬스터 id -> 수
    bossDead: {},        // zone id -> true
    talents: {},         // spec id -> pts
    talentPts: 0,
    stats: { deaths: 0, killsTotal: 0, playtime: 0 },
  };
}

// ===== 능력치 계산 =====
function getStats() {
  const cls = DATA.classes[S.cls], race = DATA.races[S.race];
  const st = { str: cls.base.str, agi: cls.base.agi, int: cls.base.int, sta: cls.base.sta, armor: 0, wdmg: 0 };
  for (const k of ['str', 'agi', 'int', 'sta']) st[k] += cls.perLevel[k] * (S.level - 1) + (race.bonus[k] || 0);
  for (const slot in S.equip) {
    const it = S.equip[slot]; if (!it) continue;
    for (const k in it.stats) st[k] = (st[k] || 0) + it.stats[k];
  }
  const tal = {};
  cls.specs.forEach(sp => { const p = S.talents[sp.id] || 0; tal[sp.stat] = (tal[sp.stat] || 0) + p * sp.per; });
  st.maxHp = Math.floor((40 + st.sta * 10 + S.level * 12) * (1 + (tal.hp || 0)));
  st.maxRes = cls.resource === 'mana' ? Math.floor((40 + st.int * 12 + S.level * 5) * (1 + (tal.mana || 0))) : 100;
  st.ap = st[cls.primary] * 2 + st.wdmg + S.level * 2;
  st.crit = 5 + st.agi * 0.25 + (tal.crit || 0);
  st.armor = Math.floor(st.armor * (1 + (tal.armor || 0)));
  st.dmgMult = 1 + (tal.dmg || 0);
  st.healMult = 1 + (tal.heal || 0);
  st.dotMult = 1 + (tal.dot || 0);
  return st;
}
function armorReduction(armor, atkLvl) { return armor / (armor + 90 + 18 * atkLvl); }
function knownAbilities() { return DATA.classes[S.cls].abilities.filter(a => a.lvl <= S.level); }

// ===== 아이템 =====
let itemSeq = 1;
function genItem(lvl, slot, rarity) {
  slot = slot || pick(Object.keys(DATA.slots));
  if (!rarity) {
    const r = Math.random(); let acc = 0;
    for (const k of ['epic', 'rare', 'uncommon', 'common']) { acc += DATA.rarity[k].chance; if (r < acc) { rarity = k; break; } }
    rarity = rarity || 'common';
  }
  const rm = DATA.rarity[rarity].mult;
  const names = DATA.itemNames[slot];
  const nameIdx = clamp(Math.floor((lvl / DATA.maxLevel) * names.length + (rarity === 'epic' ? 1 : 0)), 0, names.length - 1);
  const stats = {};
  if (slot === 'weapon') stats.wdmg = Math.floor((5 + lvl * 1.7) * rm);
  else if (slot !== 'trinket') stats.armor = Math.floor((4 + lvl * 1.5) * rm);
  const cls = DATA.classes[S.cls];
  const pool = ['str', 'agi', 'int', 'sta'];
  const nStats = rarity === 'common' ? 1 : rarity === 'uncommon' ? 2 : 3;
  for (let i = 0; i < nStats; i++) {
    const k = i === 0 && Math.random() < 0.75 ? cls.primary : pick(pool);
    stats[k] = (stats[k] || 0) + Math.max(1, Math.floor((1 + lvl * 0.45) * rm * (0.7 + Math.random() * 0.6)));
  }
  const prefix = rarity === 'epic' ? '전설적인 ' : rarity === 'rare' ? '빛나는 ' : rarity === 'uncommon' ? '견고한 ' : '';
  return { id: 'it' + (itemSeq++) + '_' + Date.now(), name: prefix + names[nameIdx], slot, rarity, lvl, stats, price: Math.floor((6 + lvl * 4) * rm * rm) };
}
function itemHtml(it, small) {
  const r = DATA.rarity[it.rarity];
  const st = Object.entries(it.stats).map(([k, v]) => `${statName(k)} +${v}`).join(', ');
  return `<span style="color:${r.color}">${DATA.slots[it.slot].emoji} ${it.name}</span>${small ? '' : ` <small>(Lv${it.lvl} ${DATA.slots[it.slot].name}) ${st}</small>`}`;
}
function statName(k) { return { str: '힘', agi: '민첩', int: '지능', sta: '체력', armor: '방어도', wdmg: '무기 피해' }[k] || k; }

// ===== 월드 생성 =====
function buildWorld(zoneIdx) {
  const z = DATA.zones[zoneIdx];
  const rand = mulberry32(1234 + zoneIdx * 999);
  const g = [];
  for (let y = 0; y < MAP_H; y++) { g.push([]); for (let x = 0; x < MAP_W; x++) g[y].push(T.GRASS); }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) g[y][x] = T.TREE;
    else if (rand() < 0.13) g[y][x] = T.TREE;
  }
  // 물
  for (let i = 0; i < 3; i++) {
    const cx = 7 + Math.floor(rand() * 12), cy = 2 + Math.floor(rand() * 11);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 2; dx++) if (rand() < 0.75) { const yy = cy + dy, xx = cx + dx; if (xx > 0 && xx < MAP_W - 1 && yy > 0 && yy < MAP_H - 1) g[yy][xx] = T.WATER; }
  }
  // 마을 (좌측)
  for (let y = 6; y <= 10; y++) for (let x = 1; x <= 5; x++) g[y][x] = T.TOWN;
  // 길: 마을 -> 동쪽
  let ry = 8;
  for (let x = 6; x < MAP_W - 1; x++) { g[ry][x] = T.ROAD; if (rand() < 0.3) { ry = clamp(ry + (rand() < 0.5 ? -1 : 1), 2, MAP_H - 3); g[ry][x] = T.ROAD; } }
  // 포탈
  g[8][1] = T.BACK; g[ry][MAP_W - 2] = T.PORTAL;
  // 보스 은신처 (우상단)
  g[2][MAP_W - 3] = T.LAIR; g[3][MAP_W - 3] = T.ROAD; g[2][MAP_W - 4] = T.ROAD;
  for (let yy = 1; yy <= 4; yy++) for (let xx = MAP_W - 5; xx <= MAP_W - 2; xx++) if (g[yy][xx] === T.TREE && !(yy === 1 || xx === MAP_W - 1)) g[yy][xx] = T.GRASS;
  // 접근 가능하게: 나무를 좀 정리 (길 주변)
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) if (g[y][x] === T.TREE && rand() < 0.35) g[y][x] = T.GRASS;

  const npcs = [
    { kind: 'quest', name: z.quests[0].giver, emoji: '📜', x: 3, y: 7 },
    { kind: 'vendor', name: '상인', emoji: '🧑‍🌾', x: 2, y: 9 },
    { kind: 'inn', name: '여관주인', emoji: '🍺', x: 4, y: 9 },
  ];
  npcs.forEach(n => g[n.y][n.x] = T.TOWN);
  W = { zone: zoneIdx, grid: g, npcs, monsters: [], portal: { x: MAP_W - 2, y: ry }, lair: { x: MAP_W - 3, y: 2 }, town: { x: 3, y: 8 } };
  for (let i = 0; i < 9; i++) spawnMonster();
}
function passable(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  const t = W.grid[y][x]; return t !== T.TREE && t !== T.WATER;
}
function spawnMonster() {
  const z = DATA.zones[W.zone];
  for (let tries = 0; tries < 50; tries++) {
    const x = rnd(7, MAP_W - 2), y = rnd(1, MAP_H - 2);
    if (!passable(x, y) || W.grid[y][x] === T.LAIR || W.grid[y][x] === T.PORTAL) continue;
    if (Math.abs(x - S.pos.x) + Math.abs(y - S.pos.y) < 4) continue;
    if (W.monsters.some(m => m.x === x && m.y === y)) continue;
    const def = pick(z.monsters);
    W.monsters.push({ def, x, y, lvl: rnd(def.lvl[0], def.lvl[1]) });
    return;
  }
}
function monsterAt(x, y) { return W.monsters.find(m => m.x === x && m.y === y); }
function npcAt(x, y) { return W.npcs.find(n => n.x === x && n.y === y); }

// ===== 렌더링 =====
const canvas = () => $('#canvas');
function drawFigure(ctx, cx, cy, emoji, size) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, cy + size * 0.42, size * 0.42, size * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.font = `${size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
  ctx.fillText(emoji, cx, cy);
}
function drawLabel(ctx, cx, cy, text, color, font) {
  ctx.font = font || 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - 9, w, 18, 6); ctx.fill();
  ctx.fillStyle = color; ctx.fillText(text, cx, cy);
}
function draw() {
  const cv = canvas(), ctx = cv.getContext('2d');
  const z = DATA.zones[W.zone], th = z.theme, cls = DATA.classes[S.cls];
  const camX = clamp(S.pos.x * TILE + TILE / 2 - cv.width / 2, 0, MAP_W * TILE - cv.width);
  const camY = clamp(S.pos.y * TILE + TILE / 2 - cv.height / 2, 0, MAP_H * TILE - cv.height);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.save(); ctx.translate(-camX, -camY);
  const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE), x1 = Math.min(MAP_W - 1, Math.ceil((camX + cv.width) / TILE)), y1 = Math.min(MAP_H - 1, Math.ceil((camY + cv.height) / TILE));
  // 바닥
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = W.grid[y][x]; let col = th.grass;
    if (t === T.TREE) col = th.dark; else if (t === T.WATER) col = th.water; else if (t === T.ROAD) col = th.road; else if (t === T.TOWN) col = '#8b6b4a';
    else if (t === T.PORTAL || t === T.BACK) col = '#5b3fa6'; else if (t === T.LAIR) col = '#6b1d1d';
    ctx.fillStyle = col; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    const px = x * TILE, py = y * TILE, cx = px + TILE / 2, cy = py + TILE / 2;
    if (t === T.GRASS && (x * 7 + y * 13) % 5 === 0) { ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(px + 12, py + 40, 6, 3); ctx.fillRect(px + 40, py + 18, 6, 3); }
    else if (t === T.WATER) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(px + 10, py + 20, 22, 3); ctx.fillRect(px + 30, py + 42, 20, 3); }
    else if (t === T.TOWN) { ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.strokeRect(px + 0.5, py + 0.5, TILE, TILE); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8); }
    else if (t === T.ROAD) { ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(px + 8, py + 30, 10, 4); ctx.fillRect(px + 38, py + 14, 12, 4); }
  }
  // 오브젝트 (나무, 포탈, 은신처)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = W.grid[y][x], cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
    if (t === T.TREE) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + 22, 20, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(cx - 4, cy + 6, 8, 18);
      ctx.fillStyle = th.tree; ctx.beginPath(); ctx.arc(cx, cy - 6, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx - 7, cy - 13, 9, 0, Math.PI * 2); ctx.fill();
    }
    else if (t === T.PORTAL) { ctx.font = '44px serif'; ctx.fillText(S.bossDead[z.id] || W.zone === DATA.zones.length - 1 ? '🌀' : '🔒', cx, cy); drawLabel(ctx, cx, cy + 30, W.zone < DATA.zones.length - 1 ? DATA.zones[W.zone + 1].name : '세계의 끝', '#e0c8ff'); }
    else if (t === T.BACK) { ctx.font = '44px serif'; ctx.fillText(W.zone > 0 ? '🌀' : '🏠', cx, cy); if (W.zone > 0) drawLabel(ctx, cx, cy + 30, DATA.zones[W.zone - 1].name, '#e0c8ff'); }
    else if (t === T.LAIR) { if (S.bossDead[z.id]) { ctx.font = '44px serif'; ctx.fillText('💀', cx, cy); } else { drawFigure(ctx, cx, cy, z.boss.emoji, 54); drawLabel(ctx, cx, cy - 36, `👑 ${z.boss.name} Lv${z.boss.lvl}`, '#ff8080'); } }
  }
  // NPC
  W.npcs.forEach(n => {
    const cx = n.x * TILE + TILE / 2, cy = n.y * TILE + TILE / 2;
    drawFigure(ctx, cx, cy, n.emoji, 46);
    drawLabel(ctx, cx, cy + 32, n.name, '#ffe9a8', 'bold 11px sans-serif');
    if (n.kind === 'quest') { const st = questMarker(); if (st) { ctx.font = 'bold 26px sans-serif'; ctx.fillStyle = '#000'; ctx.fillText(st, cx + 1, cy - 33); ctx.fillStyle = '#ffd100'; ctx.fillText(st, cx, cy - 34); } }
  });
  // 몬스터
  W.monsters.forEach(m => {
    const cx = m.x * TILE + TILE / 2, cy = m.y * TILE + TILE / 2;
    drawFigure(ctx, cx, cy, m.def.emoji, 46);
    const col = m.lvl > S.level + 2 ? '#ff6060' : m.lvl < S.level - 3 ? '#bbb' : '#ffd100';
    drawLabel(ctx, cx, cy - 32, `Lv${m.lvl} ${m.def.name}`, col, 'bold 11px sans-serif');
  });
  // 플레이어
  const px = S.pos.x * TILE + TILE / 2, py = S.pos.y * TILE + TILE / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(px, py + 4, 28, 0, Math.PI * 2); ctx.fill();
  drawFigure(ctx, px, py, DATA.races[S.race].emoji, 50);
  ctx.font = '22px serif'; ctx.fillText(cls.emoji, px + 20, py + 10);
  drawLabel(ctx, px, py - 36, `${S.name} Lv${S.level}`, cls.color, 'bold 13px sans-serif');
  ctx.restore();
  // 미니맵
  const mw = 120, mh = 80, mx = cv.width - mw - 8, my = 8, sx = mw / MAP_W, sy = mh / MAP_H;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const t = W.grid[y][x]; let col = th.grass;
    if (t === T.TREE) col = th.dark; else if (t === T.WATER) col = th.water; else if (t === T.ROAD) col = th.road; else if (t === T.TOWN) col = '#8b6b4a';
    else if (t === T.PORTAL || t === T.BACK) col = '#b08cff'; else if (t === T.LAIR) col = '#ff3030';
    ctx.fillStyle = col; ctx.fillRect(mx + x * sx, my + y * sy, sx, sy);
  }
  ctx.fillStyle = '#ff5050'; W.monsters.forEach(m => ctx.fillRect(mx + m.x * sx + 1, my + m.y * sy + 1, sx - 2, sy - 2));
  ctx.fillStyle = '#ffd100'; W.npcs.forEach(n => ctx.fillRect(mx + n.x * sx + 1, my + n.y * sy + 1, sx - 2, sy - 2));
  ctx.fillStyle = '#fff'; ctx.fillRect(mx + S.pos.x * sx, my + S.pos.y * sy, sx, sy);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(mx + camX / TILE * sx, my + camY / TILE * sy, cv.width / TILE * sx, cv.height / TILE * sy);
}
function questMarker() {
  const z = DATA.zones[W.zone];
  for (const q of z.quests) { const st = S.quests[q.id]; if (st && st.status === 'active' && st.progress >= q.count) return '?'; }
  for (const q of z.quests) if (questAvailable(q)) return '!';
  return null;
}

// ===== HUD / 패널 =====
function log(msg, cls) {
  const el = $('#log'); const d = document.createElement('div'); d.className = cls || ''; d.innerHTML = msg; el.appendChild(d);
  while (el.children.length > 80) el.removeChild(el.firstChild); el.scrollTop = el.scrollHeight;
}
function bar(sel, cur, max, color, label) {
  const el = $(sel); el.querySelector('.fill').style.width = clamp(cur / max * 100, 0, 100) + '%';
  el.querySelector('.fill').style.background = color; el.querySelector('.txt').textContent = `${label} ${Math.floor(cur)} / ${Math.floor(max)}`;
}
function renderHUD() {
  const st = getStats(), cls = DATA.classes[S.cls], z = DATA.zones[S.zone];
  S.hp = clamp(S.hp, 0, st.maxHp); S.res = clamp(S.res, 0, st.maxRes);
  $('#hud-name').innerHTML = `${cls.emoji} <b>${S.name}</b> <span class="muted">Lv${S.level} ${DATA.races[S.race].name} ${cls.name}</span>`;
  $('#hud-zone').textContent = `📍 ${z.name} (Lv ${z.minLvl}-${z.maxLvl})`;
  $('#hud-gold').textContent = `💰 ${S.gold}`;
  bar('#bar-hp', S.hp, st.maxHp, '#2ecc40', '체력');
  bar('#bar-res', S.res, st.maxRes, DATA.resourceInfo[cls.resource].color, DATA.resourceInfo[cls.resource].name);
  bar('#bar-xp', S.xp, DATA.xpForLevel(S.level), '#b56aff', S.level >= DATA.maxLevel ? '최대 레벨' : '경험치');
  const tb = $('#tab-btn-talent'); tb.textContent = '특성' + (S.talentPts > 0 ? ` (${S.talentPts})` : '');
  renderPanel();
}
function setTab(t) { uiTab = t; document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === t)); renderPanel(); }
function renderPanel() {
  const p = $('#panel');
  if (uiTab === 'char') p.innerHTML = renderChar();
  else if (uiTab === 'bag') p.innerHTML = renderBag();
  else if (uiTab === 'quest') p.innerHTML = renderQuests();
  else if (uiTab === 'talent') p.innerHTML = renderTalents();
  else if (uiTab === 'skill') p.innerHTML = renderSkills();
}
function renderChar() {
  const st = getStats(), cls = DATA.classes[S.cls];
  let h = `<div class="grid2">
    <div>힘 <b>${st.str}</b></div><div>민첩 <b>${st.agi}</b></div><div>지능 <b>${st.int}</b></div><div>체력 <b>${st.sta}</b></div>
    <div>공격력 <b>${st.ap}</b></div><div>방어도 <b>${st.armor}</b></div><div>치명타 <b>${st.crit.toFixed(1)}%</b></div><div>피해 증가 <b>${Math.round((st.dmgMult - 1) * 100)}%</b></div>
  </div><h4>장비</h4>`;
  for (const slot in DATA.slots) {
    const it = S.equip[slot];
    h += `<div class="row">${DATA.slots[slot].emoji} <span class="muted">${DATA.slots[slot].name}:</span> ${it ? itemHtml(it) + ` <button class="sm" onclick="unequip('${slot}')">해제</button>` : '<span class="muted">비어 있음</span>'}</div>`;
  }
  h += `<h4>기록</h4><div class="muted">처치 ${S.stats.killsTotal} · 사망 ${S.stats.deaths}</div>
  <div class="row"><button onclick="saveGame(true)">💾 저장</button> <button onclick="confirmNew()">🆕 새 캐릭터</button></div>`;
  return h;
}
function renderBag() {
  let h = `<h4>소모품</h4>`;
  const cons = Object.entries(S.consum).filter(([, n]) => n > 0);
  h += cons.length ? cons.map(([id, n]) => { const c = DATA.consumables[id]; return `<div class="row">${c.emoji} ${c.name} ×${n} <small class="muted">${c.desc}</small> <button class="sm" onclick="useConsumable('${id}')">사용</button></div>`; }).join('') : '<div class="muted">없음</div>';
  h += `<h4>장비 (${S.bag.length}/24)</h4>`;
  h += S.bag.length ? S.bag.map((it, i) => `<div class="row">${itemHtml(it)} <button class="sm" onclick="equipItem(${i})">장착</button><button class="sm" onclick="sellItem(${i}, false)">버리기</button></div>`).join('') : '<div class="muted">비어 있음</div>';
  const qi = Object.entries(S.questItems).filter(([, n]) => n > 0);
  if (qi.length) h += `<h4>퀘스트 아이템</h4>` + qi.map(([id, n]) => `<div class="row">${DATA.questItems[id].emoji} ${DATA.questItems[id].name} ×${n}</div>`).join('');
  return h;
}
function renderQuests() {
  let h = '';
  const active = [], done = [];
  DATA.zones.forEach(z => z.quests.forEach(q => { const st = S.quests[q.id]; if (!st) return; (st.status === 'done' ? done : active).push({ q, z, st }); }));
  h += `<h4>진행 중 (${active.length})</h4>`;
  h += active.length ? active.map(({ q, z, st }) => `<div class="quest"><b>${q.name}</b> <span class="muted">(${z.name})</span><div class="muted">${q.text}</div><div>${questTargetName(q)}: <b class="${st.progress >= q.count ? 'ok' : ''}">${Math.min(st.progress, q.count)} / ${q.count}</b>${st.progress >= q.count ? ' ✅ ' + q.giver + '에게 돌아가세요' : ''}</div></div>`).join('') : '<div class="muted">없음. 마을의 📜 NPC를 찾아가세요.</div>';
  h += `<h4>완료 (${done.length})</h4><div class="muted">${done.map(d => d.q.name).join(', ') || '없음'}</div>`;
  return h;
}
function questTargetName(q) {
  if (q.type === 'collect') return DATA.questItems[q.target].name;
  for (const z of DATA.zones) { if (z.boss.id === q.target) return z.boss.name; const m = z.monsters.find(m => m.id === q.target); if (m) return m.name; }
  return q.target;
}
function renderTalents() {
  const cls = DATA.classes[S.cls];
  if (S.level < 10 && S.talentPts === 0 && !Object.keys(S.talents).length) return `<div class="muted">특성은 레벨 10부터 사용할 수 있습니다. 레벨 10 이후 매 레벨마다 특성 포인트 1개를 얻습니다.</div>`;
  let h = `<div>남은 특성 포인트: <b class="ok">${S.talentPts}</b></div>`;
  cls.specs.forEach(sp => {
    const p = S.talents[sp.id] || 0;
    h += `<div class="quest"><b>${sp.name}</b> <span class="muted">${sp.desc}</span><div>${'●'.repeat(p)}${'○'.repeat(10 - p)} ${p}/10 ${S.talentPts > 0 && p < 10 ? `<button class="sm" onclick="spendTalent('${sp.id}')">+1</button>` : ''}</div></div>`;
  });
  h += `<div class="row"><button class="sm" onclick="resetTalents()">특성 초기화 (${S.level * 5}골드)</button></div>`;
  return h;
}
function renderSkills() {
  const cls = DATA.classes[S.cls];
  return cls.abilities.map(a => `<div class="quest ${a.lvl > S.level ? 'locked' : ''}"><b>${a.name}</b> <span class="muted">Lv${a.lvl} · ${DATA.resourceInfo[cls.resource].name} ${a.cost}${a.cd ? ` · 재사용 ${a.cd}턴` : ''}</span><div class="muted">${a.desc}</div></div>`).join('');
}

// ===== 인벤토리 조작 =====
function equipItem(i) {
  const it = S.bag[i]; if (!it) return;
  if (it.lvl > S.level + 3) { log(`레벨이 부족합니다. (필요 Lv${it.lvl - 3})`, 'bad'); return; }
  const old = S.equip[it.slot]; S.bag.splice(i, 1); S.equip[it.slot] = it; if (old) S.bag.push(old);
  log(`${itemHtml(it, true)} 장착.`); renderHUD();
}
function unequip(slot) { const it = S.equip[slot]; if (!it) return; if (S.bag.length >= 24) { log('가방이 가득 찼습니다.', 'bad'); return; } delete S.equip[slot]; S.bag.push(it); renderHUD(); }
function sellItem(i, sell) {
  const it = S.bag[i]; if (!it) return;
  if (sell) { S.gold += Math.floor(it.price / 3); log(`${itemHtml(it, true)} 판매 (+${Math.floor(it.price / 3)}골드)`); }
  else log(`${itemHtml(it, true)} 버림.`);
  S.bag.splice(i, 1); renderHUD(); if (sell) openVendor();
}
function addItem(it) { if (S.bag.length >= 24) { log(`가방이 가득 차서 ${itemHtml(it, true)}을(를) 버렸습니다.`, 'bad'); return false; } S.bag.push(it); return true; }
function useConsumable(id) {
  const c = DATA.consumables[id]; if (!S.consum[id]) return;
  if (id === 'bread' && C) { log('전투 중에는 먹을 수 없습니다.', 'bad'); return; }
  const st = getStats();
  if (c.heal) { S.hp = Math.min(st.maxHp, S.hp + c.heal); log(`${c.emoji} ${c.name} 사용: 체력 +${c.heal}`, 'good'); }
  if (c.mana) { S.res = Math.min(st.maxRes, S.res + c.mana); log(`${c.emoji} ${c.name} 사용: ${DATA.resourceInfo[DATA.classes[S.cls].resource].name} +${c.mana}`, 'good'); }
  S.consum[id]--; renderHUD();
  if (C) { clog(`${c.emoji} ${c.name}을(를) 사용했습니다.`, 'good'); endPlayerTurn(); }
}

// ===== 특성 =====
function spendTalent(id) { if (S.talentPts <= 0 || (S.talents[id] || 0) >= 10) return; S.talents[id] = (S.talents[id] || 0) + 1; S.talentPts--; renderHUD(); }
function resetTalents() {
  const cost = S.level * 5; if (S.gold < cost) { log('골드가 부족합니다.', 'bad'); return; }
  const total = Object.values(S.talents).reduce((a, b) => a + b, 0); S.gold -= cost; S.talents = {}; S.talentPts += total; log('특성을 초기화했습니다.'); renderHUD();
}

// ===== 이동 & 월드 상호작용 =====
function tryMove(dx, dy) {
  if (C || $('#dialog').classList.contains('open')) return;
  const nx = S.pos.x + dx, ny = S.pos.y + dy;
  if (!passable(nx, ny)) return;
  const m = monsterAt(nx, ny); if (m) { startCombat(m); return; }
  const n = npcAt(nx, ny); if (n) { interact(n); return; }
  S.pos.x = nx; S.pos.y = ny;
  const t = W.grid[ny][nx];
  if (t === T.PORTAL) { travel(1); return; }
  if (t === T.BACK && W.zone > 0) { travel(-1); return; }
  if (t === T.LAIR) { enterLair(); return; }
  draw();
}
function travel(dir) {
  const z = DATA.zones[W.zone];
  if (dir > 0) {
    if (W.zone >= DATA.zones.length - 1) { log('이곳이 세계의 끝입니다.'); S.pos.x--; draw(); return; }
    if (!S.bossDead[z.id]) { log(`🔒 이 지역의 우두머리 <b>${z.boss.name}</b>을(를) 처치해야 다음 지역으로 갈 수 있습니다.`, 'bad'); S.pos.x--; draw(); return; }
  }
  S.zone = W.zone + dir; buildWorld(S.zone);
  S.pos = dir > 0 ? { x: 2, y: 8 } : { x: W.portal.x - 1, y: W.portal.y };
  const nz = DATA.zones[S.zone];
  log(`🌀 <b>${nz.name}</b>에 도착했습니다. ${nz.intro}`, 'sys');
  saveGame(); renderHUD(); draw();
}
function enterLair() {
  const z = DATA.zones[W.zone];
  if (S.bossDead[z.id]) { log('이미 우두머리를 처치한 은신처입니다.'); draw(); return; }
  openDialog(`${z.boss.emoji} ${z.boss.name} (Lv${z.boss.lvl})`, `<p>강력한 우두머리의 기운이 느껴집니다. 체력 ${z.boss.hp}, 권장 레벨 ${z.boss.lvl - 1} 이상.</p><p class="muted">전투 중 도망칠 수 없습니다.</p>`,
    [{ t: '⚔️ 도전한다', f: () => { closeDialog(); startCombat({ def: z.boss, lvl: z.boss.lvl, boss: true }); } }, { t: '물러난다', f: () => { closeDialog(); S.pos.x--; draw(); } }]);
}
function interact(n) {
  if (n.kind === 'quest') openQuestDialog(n); else if (n.kind === 'vendor') openVendor(); else if (n.kind === 'inn') openInn();
}
function aiTick() {
  if (!S || !W || C) return;
  let engaged = null;
  W.monsters.forEach(m => {
    const d = Math.abs(m.x - S.pos.x) + Math.abs(m.y - S.pos.y);
    let dx = 0, dy = 0;
    if (d <= 4 && Math.random() < 0.6) { dx = Math.sign(S.pos.x - m.x); dy = Math.sign(S.pos.y - m.y); if (dx && dy) { if (Math.random() < 0.5) dx = 0; else dy = 0; } }
    else if (Math.random() < 0.3) { if (Math.random() < 0.5) dx = pick([-1, 1]); else dy = pick([-1, 1]); }
    if (!dx && !dy) return;
    const nx = m.x + dx, ny = m.y + dy;
    if (nx === S.pos.x && ny === S.pos.y) { if (!engaged) engaged = m; return; }
    if (!passable(nx, ny) || monsterAt(nx, ny) || npcAt(nx, ny) || nx < 6) return;
    const t = W.grid[ny][nx]; if (t === T.LAIR || t === T.PORTAL || t === T.TOWN) return;
    m.x = nx; m.y = ny;
  });
  if (W.monsters.length < 9 && Math.random() < 0.15) spawnMonster();
  if (engaged) startCombat(engaged); else draw();
}

// ===== 대화창 =====
function openDialog(title, body, buttons) {
  $('#dialog-title').innerHTML = title; $('#dialog-body').innerHTML = body;
  const bb = $('#dialog-buttons'); bb.innerHTML = '';
  (buttons || [{ t: '닫기', f: closeDialog }]).forEach(b => { const el = document.createElement('button'); el.textContent = b.t; el.onclick = b.f; bb.appendChild(el); });
  $('#dialog').classList.add('open');
}
function closeDialog() { $('#dialog').classList.remove('open'); draw(); }
function questAvailable(q) { const st = S.quests[q.id]; if (st) return false; if (q.req && (!S.quests[q.req] || S.quests[q.req].status !== 'done')) return false; return true; }
function openQuestDialog(n) {
  const z = DATA.zones[W.zone]; let h = ''; const btns = [];
  z.quests.forEach(q => {
    const st = S.quests[q.id];
    if (questAvailable(q)) { h += `<div class="quest"><b>! ${q.name}</b><div>${q.text}</div><div class="muted">보상: ${q.xp} XP, ${q.gold}골드, ${DATA.rarity[q.reward.rarity].name} ${DATA.slots[q.reward.slot].name}</div></div>`; btns.push({ t: `수락: ${q.name}`, f: () => { acceptQuest(q); openQuestDialog(n); } }); }
    else if (st && st.status === 'active') {
      if (st.progress >= q.count) { h += `<div class="quest"><b>? ${q.name}</b> <span class="ok">완료 가능!</span></div>`; btns.push({ t: `완료: ${q.name}`, f: () => { completeQuest(q); openQuestDialog(n); } }); }
      else h += `<div class="quest"><b>${q.name}</b> <span class="muted">${questTargetName(q)} ${Math.min(st.progress, q.count)}/${q.count}</span></div>`;
    }
  });
  if (!h) h = `<p>"${z.name}에 평화를 가져다 줘서 고맙소. ${W.zone < DATA.zones.length - 1 ? '동쪽 포탈을 통해 다음 지역으로 가시오.' : '당신은 진정한 영웅이오!'}"</p>`;
  btns.push({ t: '닫기', f: closeDialog });
  openDialog(`📜 ${n.name}`, h, btns);
}
function acceptQuest(q) {
  const prog = q.type === 'collect' ? (S.questItems[q.target] || 0) : 0;
  S.quests[q.id] = { status: 'active', progress: prog }; log(`📜 퀘스트 수락: <b>${q.name}</b>`, 'sys'); renderHUD();
}
function completeQuest(q) {
  S.quests[q.id].status = 'done';
  if (q.type === 'collect') S.questItems[q.target] = Math.max(0, (S.questItems[q.target] || 0) - q.count);
  const it = genItem(Math.max(S.level, DATA.zones[W.zone].minLvl) + 1, q.reward.slot, q.reward.rarity);
  S.gold += q.gold; addItem(it);
  log(`✅ 퀘스트 완료: <b>${q.name}</b> — +${q.xp} XP, +${q.gold}골드, ${itemHtml(it, true)}`, 'good');
  gainXp(q.xp); renderHUD();
}
function openVendor() {
  const z = DATA.zones[W.zone];
  if (!W.stock) { W.stock = []; for (let i = 0; i < 4; i++) W.stock.push(genItem(rnd(z.minLvl, z.maxLvl), null, Math.random() < 0.3 ? 'rare' : 'uncommon')); }
  const consIds = W.zone === 0 ? ['hpot_s', 'mpot_s', 'bread'] : W.zone < 3 ? ['hpot_s', 'hpot_m', 'mpot_s', 'mpot_m', 'bread'] : ['hpot_m', 'hpot_l', 'mpot_m', 'bread'];
  let h = `<div class="muted">💰 소지 골드: ${S.gold}</div><h4>구매 - 소모품</h4>`;
  h += consIds.map(id => { const c = DATA.consumables[id]; return `<div class="row">${c.emoji} ${c.name} <small class="muted">${c.desc}</small> <b>${c.price}g</b> <button class="sm" onclick="buyCons('${id}')">구매</button></div>`; }).join('');
  h += `<h4>구매 - 장비</h4>` + (W.stock.length ? W.stock.map((it, i) => `<div class="row">${itemHtml(it)} <b>${it.price}g</b> <button class="sm" onclick="buyItem(${i})">구매</button></div>`).join('') : '<div class="muted">품절</div>');
  h += `<h4>판매 (가격의 1/3)</h4>` + (S.bag.length ? S.bag.map((it, i) => `<div class="row">${itemHtml(it)} <b>${Math.floor(it.price / 3)}g</b> <button class="sm" onclick="sellItem(${i}, true)">판매</button></div>`).join('') : '<div class="muted">판매할 장비 없음</div>');
  openDialog('🧑‍🌾 상인', h);
}
function buyCons(id) { const c = DATA.consumables[id]; if (S.gold < c.price) { log('골드가 부족합니다.', 'bad'); return; } S.gold -= c.price; S.consum[id] = (S.consum[id] || 0) + 1; renderHUD(); openVendor(); }
function buyItem(i) { const it = W.stock[i]; if (S.gold < it.price) { log('골드가 부족합니다.', 'bad'); return; } if (S.bag.length >= 24) { log('가방이 가득 찼습니다.', 'bad'); return; } S.gold -= it.price; W.stock.splice(i, 1); S.bag.push(it); log(`${itemHtml(it, true)} 구매.`); renderHUD(); openVendor(); }
function openInn() {
  openDialog('🍺 여관주인', `<p>"어서 오시오, 모험가. 푹 쉬고 가시구려."</p><p class="muted">휴식하면 체력과 자원이 모두 회복되고 게임이 저장됩니다.</p>`,
    [{ t: '🛏️ 휴식 (무료)', f: () => { const st = getStats(); S.hp = st.maxHp; S.res = DATA.classes[S.cls].resource === 'rage' ? 0 : st.maxRes; saveGame(true); log('여관에서 휴식하여 완전히 회복했습니다.', 'good'); renderHUD(); closeDialog(); } }, { t: '닫기', f: closeDialog }]);
}

// ===== 경험치 / 레벨 =====
function gainXp(n) {
  if (S.level >= DATA.maxLevel) return;
  S.xp += n;
  while (S.level < DATA.maxLevel && S.xp >= DATA.xpForLevel(S.level)) {
    S.xp -= DATA.xpForLevel(S.level); S.level++;
    const st = getStats(); S.hp = st.maxHp; if (DATA.classes[S.cls].resource !== 'rage') S.res = st.maxRes;
    if (S.level >= 10) S.talentPts++;
    log(`🎉 <b>레벨 업! 레벨 ${S.level}</b>이 되었습니다!`, 'lvl');
    DATA.classes[S.cls].abilities.filter(a => a.lvl === S.level).forEach(a => log(`✨ 새 기술 습득: <b>${a.name}</b> — ${a.desc}`, 'lvl'));
    if (S.level === 10) log('🌟 특성 시스템이 열렸습니다! 특성 탭에서 포인트를 투자하세요.', 'lvl');
  }
  if (S.level >= DATA.maxLevel) S.xp = 0;
}

// ===== 전투 =====
function scaledEnemy(m) {
  const d = m.def, lvl = m.lvl, base = d.lvl ? d.lvl[0] : d.lvl;
  const scale = d.boss ? 1 : 1 + (lvl - d.lvl[0]) * 0.12;
  return { id: d.id, name: d.name, emoji: d.emoji, lvl, boss: !!d.boss, hp: Math.floor(d.hp * scale), maxHp: Math.floor(d.hp * scale), dmg: Math.floor(d.dmg * scale), abil: d.abil ? DATA.enemyAbilities[d.abil] : null, xp: Math.floor(d.xp * scale), gold: d.gold, drop: d.drop, ref: m };
}
function startCombat(m) {
  const e = scaledEnemy(m);
  C = { e, turn: 1, cds: {}, pShield: 0, pStun: 0, pDots: [], pWeak: 0, eStun: 0, eDots: [], eWeak: 0, over: false };
  if (DATA.classes[S.cls].resource === 'rage') S.res = Math.min(S.res, 30);
  $('#combat').classList.add('open'); $('#clog').innerHTML = '';
  clog(`⚔️ <b>${e.name}</b> (Lv${e.lvl})이(가) 나타났습니다!`, 'sys');
  renderCombat();
}
function clog(msg, cls) { const el = $('#clog'); const d = document.createElement('div'); d.className = cls || ''; d.innerHTML = msg; el.appendChild(d); el.scrollTop = el.scrollHeight; }
function renderCombat() {
  const e = C.e, st = getStats(), cls = DATA.classes[S.cls];
  S.hp = clamp(S.hp, 0, st.maxHp);
  $('#c-enemy').innerHTML = `<div class="c-emoji">${e.emoji}</div><div><b>${e.name}</b> <span class="muted">Lv${e.lvl}${e.boss ? ' 👑 우두머리' : ''}</span>${e.abil ? `<div class="muted small">특수: ${e.abil.name}</div>` : ''}<div class="effects">${C.eStun ? '<span class="eff">💫 기절</span>' : ''}${C.eWeak ? `<span class="eff">🐌 약화 ${C.eWeak}턴</span>` : ''}${C.eDots.map(d => `<span class="eff">☠️ ${d.name} ${d.turns}턴</span>`).join('')}</div></div>`;
  bar('#c-ehp', e.hp, e.maxHp, '#e74c3c', '체력');
  $('#c-player').innerHTML = `<div class="c-emoji">${DATA.races[S.race].emoji}</div><div><b>${S.name}</b> <span class="muted">Lv${S.level} ${cls.name}</span><div class="effects">${C.pShield ? `<span class="eff">🛡️ 보호막 ${C.pShield}</span>` : ''}${C.pStun ? '<span class="eff">💫 기절</span>' : ''}${C.pWeak ? `<span class="eff">🐌 약화 ${C.pWeak}턴</span>` : ''}${C.pDots.map(d => `<span class="eff">☠️ ${d.name} ${d.turns}턴</span>`).join('')}</div></div>`;
  bar('#c-php', S.hp, st.maxHp, '#2ecc40', '체력');
  bar('#c-pres', S.res, st.maxRes, DATA.resourceInfo[cls.resource].color, DATA.resourceInfo[cls.resource].name);
  if (C.over) return;
  const acts = $('#c-actions'); acts.innerHTML = '';
  const mk = (label, sub, fn, dis, title) => { const b = document.createElement('button'); b.innerHTML = `${label}<small>${sub}</small>`; b.disabled = !!dis; b.title = title || ''; b.onclick = fn; acts.appendChild(b); };
  mk('👊 기본 공격', cls.resource === 'rage' ? '분노 +15' : '무료', () => playerAction(null));
  knownAbilities().forEach((a, i) => {
    const cd = C.cds[a.id] || 0, noRes = S.res < a.cost;
    mk(`${i + 1}. ${a.name}`, cd ? `재사용 ${cd}턴` : `${DATA.resourceInfo[cls.resource].name} ${a.cost}`, () => playerAction(a), cd || noRes, a.desc);
  });
  Object.entries(S.consum).filter(([id, n]) => n > 0 && id !== 'bread').forEach(([id, n]) => { const c = DATA.consumables[id]; mk(`${c.emoji} ${c.name}`, `×${n}`, () => useConsumable(id)); });
  mk('🏃 도망', e.boss ? '불가' : '50%', flee, e.boss);
}
function playerDamage(mult, critBonus) {
  const st = getStats();
  let dmg = st.ap * mult * st.dmgMult * (0.9 + Math.random() * 0.2);
  const crit = Math.random() * 100 < st.crit + (critBonus || 0);
  if (crit) dmg *= 2;
  return { dmg: Math.max(1, Math.floor(dmg)), crit };
}
function hitEnemy(dmg, label, crit) {
  C.e.hp = Math.max(0, C.e.hp - dmg);
  clog(`${label} → <b class="${crit ? 'crit' : ''}">${dmg}</b> 피해${crit ? ' 💥치명타!' : ''}`, 'good');
}
function playerAction(a) {
  if (!C || C.over) return;
  const cls = DATA.classes[S.cls], st = getStats();
  if (C.pStun) { clog('💫 기절 상태라 행동할 수 없습니다!', 'bad'); endPlayerTurn(); return; }
  if (!a) {
    const { dmg, crit } = playerDamage(1.0); hitEnemy(dmg, '👊 기본 공격', crit);
    if (cls.resource === 'rage') S.res = Math.min(100, S.res + 15);
  } else {
    if ((C.cds[a.id] || 0) > 0 || S.res < a.cost) return;
    S.res -= a.cost; if (a.cd) C.cds[a.id] = a.cd + 1;
    if (a.gain) S.res = Math.min(100, S.res + a.gain);
    if (a.type === 'dmg' || a.type === 'drain' || a.type === 'stun' || a.type === 'slow') {
      const { dmg, crit } = playerDamage(a.mult, a.critBonus); hitEnemy(dmg, `✨ ${a.name}`, crit);
      if (a.type === 'drain') { const h = Math.floor(dmg * 0.5 * st.healMult); S.hp = Math.min(st.maxHp, S.hp + h); clog(`💚 체력 ${h} 회복`, 'good'); }
      if (a.type === 'stun' && !C.e.boss || (a.type === 'stun' && Math.random() < 0.5)) { C.eStun = 1; clog(`💫 ${C.e.name}이(가) 기절했습니다!`, 'good'); }
      else if (a.type === 'stun') clog(`${C.e.name}은(는) 기절에 저항했습니다.`, 'muted');
      if (a.type === 'slow') { C.eWeak = a.turns; clog(`🐌 ${C.e.name}의 피해가 ${a.turns}턴간 30% 감소합니다.`, 'good'); }
    } else if (a.type === 'heal') {
      const h = Math.floor(st.ap * a.mult * st.healMult); S.hp = Math.min(st.maxHp, S.hp + h); clog(`💚 ${a.name}: 체력 ${h} 회복`, 'good');
    } else if (a.type === 'shield') {
      C.pShield += Math.floor(st.ap * a.mult); clog(`🛡️ ${a.name}: 보호막 ${C.pShield}`, 'good');
    } else if (a.type === 'dot') {
      const per = Math.floor(st.ap * a.mult * st.dmgMult * st.dotMult);
      const ex = C.eDots.find(d => d.name === a.name); if (ex) { ex.turns = a.turns; ex.per = per; } else C.eDots.push({ name: a.name, turns: a.turns, per });
      clog(`☠️ ${a.name}: ${a.turns}턴간 매 턴 ${per} 피해`, 'good');
    }
  }
  endPlayerTurn();
}
function endPlayerTurn() {
  // 적에게 걸린 지속 피해
  C.eDots.forEach(d => { hitEnemy(d.per, `☠️ ${d.name}`); d.turns--; });
  C.eDots = C.eDots.filter(d => d.turns > 0);
  if (C.e.hp <= 0) { winCombat(); return; }
  setTimeout(enemyTurn, 350);
}
function enemyTurn() {
  const e = C.e, st = getStats();
  if (C.eStun) { clog(`💫 ${e.name}은(는) 기절해서 움직이지 못합니다.`, 'muted'); C.eStun = 0; }
  else {
    let mult = 1.0, label = '👊 공격', ab = null;
    if (e.abil && Math.random() < e.abil.chance) { ab = e.abil; mult = ab.mult; label = `🔥 ${ab.name}`; }
    if (ab && ab.heal) { const h = Math.floor(e.maxHp * ab.heal); e.hp = Math.min(e.maxHp, e.hp + h); clog(`${label}: ${e.name}이(가) 체력 ${h}을 회복했습니다.`, 'bad'); }
    else {
      if (mult > 0) {
        let dmg = e.dmg * mult * (0.85 + Math.random() * 0.3);
        if (C.eWeak) dmg *= 0.7;
        dmg *= 1 - armorReduction(st.armor, e.lvl);
        dmg = Math.max(1, Math.floor(dmg));
        if (Math.random() < 0.05) { dmg *= 2; label += ' 💥'; }
        if (C.pShield > 0) { const ab2 = Math.min(C.pShield, dmg); C.pShield -= ab2; dmg -= ab2; clog(`🛡️ 보호막이 ${ab2} 흡수`, 'muted'); }
        S.hp -= dmg; clog(`${label} → 당신에게 <b>${dmg}</b> 피해`, 'bad');
      }
      if (ab && ab.stun && Math.random() < 0.6) { C.pStun = 1; clog(`💫 기절했습니다! 다음 턴을 잃습니다.`, 'bad'); }
      if (ab && ab.dot) { C.pDots.push({ name: ab.name, turns: ab.dot, per: Math.max(1, Math.floor(e.dmg * 0.35)) }); clog(`☠️ ${ab.name}: ${ab.dot}턴간 지속 피해!`, 'bad'); }
      if (ab && ab.weaken) { C.pWeak = ab.weaken; clog(`🐌 ${ab.weaken}턴간 당신의 피해가 감소합니다.`, 'bad'); }
    }
  }
  if (C.eWeak) C.eWeak--;
  if (S.hp <= 0) { loseCombat(); return; }
  // 플레이어 턴 시작: 지속 피해, 자원 회복, 재사용 대기시간
  C.pDots.forEach(d => { S.hp -= d.per; clog(`☠️ ${d.name}으로 ${d.per} 피해`, 'bad'); d.turns--; });
  C.pDots = C.pDots.filter(d => d.turns > 0);
  if (S.hp <= 0) { loseCombat(); return; }
  const cls = DATA.classes[S.cls];
  if (cls.resource === 'energy') S.res = Math.min(100, S.res + 30);
  else if (cls.resource === 'mana') S.res = Math.min(st.maxRes, S.res + Math.floor(st.maxRes * 0.07) + 3);
  else S.res = Math.min(100, S.res + 5);
  for (const k in C.cds) if (C.cds[k] > 0) C.cds[k]--;
  if (C.pWeak) C.pWeak--;
  C.turn++;
  renderCombat(); renderHUD();
}
function winCombat() {
  const e = C.e; C.over = true;
  const z = DATA.zones[W.zone];
  let xp = e.xp; const ld = S.level - e.lvl; if (ld > 5) xp = Math.floor(xp * 0.3); else if (ld > 3) xp = Math.floor(xp * 0.6);
  const gold = rnd(e.gold[0], e.gold[1]);
  S.gold += gold; S.stats.killsTotal++; S.kills[e.id] = (S.kills[e.id] || 0) + 1;
  clog(`🏆 <b>${e.name}</b>을(를) 처치했습니다! +${xp} XP, +${gold}골드`, 'lvl');
  log(`🏆 ${e.name} 처치 (+${xp} XP, +${gold}골드)`, 'good');
  // 퀘스트 진행
  DATA.zones.forEach(zz => zz.quests.forEach(q => {
    const st = S.quests[q.id]; if (!st || st.status !== 'active') return;
    if (q.type === 'kill' && q.target === e.id) { st.progress++; clog(`📜 ${q.name}: ${Math.min(st.progress, q.count)}/${q.count}`, 'sys'); }
    if (q.type === 'collect' && q.target === e.drop && st.progress < q.count && Math.random() < 0.65) { S.questItems[e.drop] = (S.questItems[e.drop] || 0) + 1; st.progress = S.questItems[e.drop]; clog(`📦 ${DATA.questItems[e.drop].name} 획득 (${Math.min(st.progress, q.count)}/${q.count})`, 'sys'); }
  }));
  // 전리품
  if (e.boss || Math.random() < 0.22) {
    const it = genItem(e.lvl, null, e.boss ? (Math.random() < 0.35 ? 'epic' : 'rare') : null);
    if (addItem(it)) clog(`🎁 전리품: ${itemHtml(it)}`, 'lvl');
  }
  if (Math.random() < 0.15) { const id = e.lvl < 10 ? 'hpot_s' : e.lvl < 20 ? 'hpot_m' : 'hpot_l'; S.consum[id] = (S.consum[id] || 0) + 1; clog(`🧪 ${DATA.consumables[id].name} 획득`, 'sys'); }
  if (e.boss) { S.bossDead[z.id] = true; clog(`👑 <b>${z.name}</b>의 우두머리를 물리쳤습니다! 동쪽 포탈이 열렸습니다.`, 'lvl'); log(`👑 ${z.name}의 우두머리 ${e.name} 처치! 포탈이 열렸습니다.`, 'lvl');
    if (W.zone === DATA.zones.length - 1) setTimeout(() => openDialog('🏆 승리!', `<p><b>${S.name}</b>, 당신은 불의 군주를 물리치고 세계를 구했습니다!</p><p>총 처치 ${S.stats.killsTotal + 1}, 사망 ${S.stats.deaths}, 레벨 ${S.level}.</p><p class="muted">게임은 계속 즐길 수 있습니다. 만렙 30까지 도전해 보세요!</p>`), 800); }
  else if (e.ref) W.monsters = W.monsters.filter(m => m !== e.ref);
  gainXp(xp);
  const acts = $('#c-actions'); acts.innerHTML = ''; const b = document.createElement('button'); b.className = 'primary'; b.textContent = '계속'; b.onclick = endCombat; acts.appendChild(b);
  renderCombat(); renderHUD();
}
function loseCombat() {
  C.over = true; S.stats.deaths++;
  const lost = Math.floor(S.gold * 0.1); S.gold -= lost;
  clog(`💀 <b>쓰러졌습니다...</b> 영혼 치유사가 당신을 마을에서 되살립니다. (골드 -${lost})`, 'bad');
  log(`💀 ${C.e.name}에게 패배. 마을에서 부활했습니다. (골드 -${lost})`, 'bad');
  const acts = $('#c-actions'); acts.innerHTML = ''; const b = document.createElement('button'); b.className = 'primary'; b.textContent = '부활'; b.onclick = () => { const st = getStats(); S.hp = Math.floor(st.maxHp * 0.5); S.res = DATA.classes[S.cls].resource === 'rage' ? 0 : Math.floor(st.maxRes * 0.5); S.pos = { ...W.town }; endCombat(); }; acts.appendChild(b);
  renderCombat();
}
function flee() {
  if (Math.random() < 0.5) { clog('🏃 무사히 도망쳤습니다!', 'sys'); log('전투에서 도망쳤습니다.'); C.over = true;
    // 플레이어를 한 칸 물러나게
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dx, dy]) => passable(S.pos.x + dx, S.pos.y + dy) && !monsterAt(S.pos.x + dx, S.pos.y + dy) && !npcAt(S.pos.x + dx, S.pos.y + dy));
    if (dirs.length) { const [dx, dy] = pick(dirs); S.pos.x += dx; S.pos.y += dy; }
    endCombat(); }
  else { clog('🏃 도망에 실패했습니다!', 'bad'); setTimeout(enemyTurn, 300); }
}
function endCombat() { C = null; $('#combat').classList.remove('open'); if (S.hp <= 0) S.hp = 1; saveGame(); renderHUD(); draw(); }

// ===== 저장 / 불러오기 =====
function saveGame(notify) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); if (notify) log('💾 저장되었습니다.', 'sys'); } catch (e) { if (notify) log('저장 실패: ' + e.message, 'bad'); } }
function loadGame() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function confirmNew() { openDialog('새 캐릭터', '<p>현재 캐릭터의 저장 데이터가 삭제됩니다. 계속할까요?</p>', [{ t: '삭제하고 새로 시작', f: () => { localStorage.removeItem(SAVE_KEY); location.reload(); } }, { t: '취소', f: closeDialog }]); }

// ===== 시작 =====
function startGame(state) {
  S = state; if (itemSeq === 1) itemSeq = 1000;
  buildWorld(S.zone);
  const st = getStats(); if (!S.hp) S.hp = st.maxHp; if (S.res === null || S.res === undefined) S.res = DATA.classes[S.cls].resource === 'rage' ? 0 : st.maxRes;
  if (!passable(S.pos.x, S.pos.y) || monsterAt(S.pos.x, S.pos.y)) S.pos = { ...W.town };
  $('#screen-create').classList.remove('open'); $('#screen-game').classList.add('open');
  const z = DATA.zones[S.zone];
  log(`<b>${z.name}</b>에 오신 것을 환영합니다, ${S.name}. ${z.intro}`, 'sys');
  log('방향키/WASD로 이동. 몬스터에게 다가가면 전투, NPC에게 다가가면 대화합니다. 📜 퀘스트 NPC부터 만나보세요!', 'muted');
  setTab('char'); renderHUD(); draw();
  if (aiTimer) clearInterval(aiTimer); aiTimer = setInterval(aiTick, 700);
  setInterval(() => { if (S) S.stats.playtime++; }, 1000);
}

// 캐릭터 생성 화면
let selRace = 'human', selCls = 'warrior';
function renderCreate() {
  $('#race-list').innerHTML = Object.entries(DATA.races).map(([id, r]) => `<div class="card ${id === selRace ? 'sel' : ''}" onclick="selRace='${id}';renderCreate()"><div class="big">${r.emoji}</div><b>${r.name}</b><div class="muted small">${r.faction}</div><div class="small">${r.desc}</div></div>`).join('');
  $('#class-list').innerHTML = Object.entries(DATA.classes).map(([id, c]) => `<div class="card ${id === selCls ? 'sel' : ''}" style="border-color:${id === selCls ? c.color : ''}" onclick="selCls='${id}';renderCreate()"><div class="big">${c.emoji}</div><b style="color:${c.color}">${c.name}</b><div class="muted small">${DATA.resourceInfo[c.resource].name} 사용</div><div class="small">${c.desc}</div></div>`).join('');
  const saved = loadGame(); const lb = $('#btn-load');
  if (saved) { lb.style.display = ''; lb.textContent = `▶ 이어하기: ${saved.name} (Lv${saved.level} ${DATA.classes[saved.cls].name})`; } else lb.style.display = 'none';
}
function createChar() {
  const name = $('#inp-name').value.trim() || '모험가';
  const s = newState(name, selRace, selCls); startGame(s); saveGame();
}

document.addEventListener('DOMContentLoaded', () => {
  renderCreate();
  $('#btn-create').onclick = createChar;
  $('#btn-load').onclick = () => { const s = loadGame(); if (s) startGame(s); };
  $('#inp-name').addEventListener('keydown', e => { if (e.key === 'Enter') createChar(); });
  document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  document.querySelectorAll('[data-move]').forEach(b => b.onclick = () => { const [dx, dy] = b.dataset.move.split(',').map(Number); tryMove(dx, dy); });
  document.addEventListener('keydown', e => {
    if (!S) return;
    if (C && !C.over) { const n = parseInt(e.key); if (n >= 1 && n <= 6) { const a = knownAbilities()[n - 1]; if (a) playerAction(a); } else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); playerAction(null); } return; }
    if (C && C.over && (e.key === ' ' || e.key === 'Enter')) { $('#c-actions button')?.click(); return; }
    if ($('#dialog').classList.contains('open')) { if (e.key === 'Escape') closeDialog(); return; }
    const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] };
    if (map[e.key]) { e.preventDefault(); tryMove(...map[e.key]); }
    if (e.key === 'i' || e.key === 'I') setTab('bag'); if (e.key === 'l' || e.key === 'L') setTab('quest'); if (e.key === 'n' || e.key === 'N') setTab('talent'); if (e.key === 'c' || e.key === 'C') setTab('char'); if (e.key === 'k' || e.key === 'K') setTab('skill');
  });
});
