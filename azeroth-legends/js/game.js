// ===== 아제로스 레전드: 실시간 액션 RPG 엔진 =====
'use strict';

const TILE = 64, MAP_W = 28, MAP_H = 18;
const T = { GRASS: 0, TREE: 1, WATER: 2, ROAD: 3, TOWN: 4, PORTAL: 5, BACK: 6, LAIR: 7 };
const SAVE_KEY = 'azeroth_legends_save_v2';
const PLAYER_SPEED = 190, PLAYER_R = 14;

const $ = sel => document.querySelector(sel);
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function mulberry32(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ===== 상태 =====
let S = null;   // 저장되는 상태
let W = null;   // 월드 (지도, 몬스터, 전리품, 투사체)
let P = null;   // 플레이어 런타임 (쿨다운, 효과, 애니메이션)
let uiTab = 'char', paused = false, lastT = 0, keys = {}, camX = 0, camY = 0, shake = 0, dead = null;
let itemSeq = 1000;

function newState(name, race, cls) {
  return {
    name, race, cls, level: 1, xp: 0, gold: 10, hp: 0, res: null,
    zone: 0, px: 3.5 * TILE, py: 8.5 * TILE,
    equip: {}, bag: [], consum: { hpot_s: 3, bread: 2 }, questItems: {},
    quests: {}, kills: {}, bossDead: {}, talents: {}, talentPts: 0,
    stats: { deaths: 0, killsTotal: 0, playtime: 0 },
  };
}
function newRuntime() { return { facing: 1, moving: false, frame: 0, animT: 0, atkCd: 0, atkAnim: 0, cds: {}, shield: 0, stunT: 0, dots: [], weakT: 0, dotTick: 0, flash: 0, target: null, potCd: 0 }; }

// ===== 능력치 =====
function getStats() {
  const cls = DATA.classes[S.cls], race = DATA.races[S.race];
  const st = { str: cls.base.str, agi: cls.base.agi, int: cls.base.int, sta: cls.base.sta, armor: 0, wdmg: 0 };
  for (const k of ['str', 'agi', 'int', 'sta']) st[k] += cls.perLevel[k] * (S.level - 1) + (race.bonus[k] || 0);
  for (const slot in S.equip) { const it = S.equip[slot]; if (!it) continue; for (const k in it.stats) st[k] = (st[k] || 0) + it.stats[k]; }
  const tal = {}; cls.specs.forEach(sp => { const p = S.talents[sp.id] || 0; tal[sp.stat] = (tal[sp.stat] || 0) + p * sp.per; });
  st.maxHp = Math.floor((40 + st.sta * 10 + S.level * 12) * (1 + (tal.hp || 0)));
  st.maxRes = cls.resource === 'mana' ? Math.floor((40 + st.int * 12 + S.level * 5) * (1 + (tal.mana || 0))) : 100;
  st.ap = st[cls.primary] * 2 + st.wdmg + S.level * 2;
  st.crit = 5 + st.agi * 0.25 + (tal.crit || 0);
  st.armor = Math.floor(st.armor * (1 + (tal.armor || 0)));
  st.dmgMult = 1 + (tal.dmg || 0); st.healMult = 1 + (tal.heal || 0); st.dotMult = 1 + (tal.dot || 0);
  return st;
}
function armorReduction(armor, atkLvl) { return armor / (armor + 90 + 18 * atkLvl); }
function knownAbilities() { return DATA.classes[S.cls].abilities.filter(a => a.lvl <= S.level); }
function isRanged() { return ['mage', 'priest', 'hunter'].includes(S.cls); }

// ===== 아이템 =====
function genItem(lvl, slot, rarity) {
  slot = slot || pick(Object.keys(DATA.slots));
  if (!rarity) { const r = Math.random(); let acc = 0; for (const k of ['epic', 'rare', 'uncommon', 'common']) { acc += DATA.rarity[k].chance; if (r < acc) { rarity = k; break; } } rarity = rarity || 'common'; }
  const rm = DATA.rarity[rarity].mult, names = DATA.itemNames[slot];
  const tier = clamp(Math.floor((lvl / DATA.maxLevel) * names.length + (rarity === 'epic' ? 1 : 0)), 0, names.length - 1);
  const stats = {};
  if (slot === 'weapon') stats.wdmg = Math.floor((5 + lvl * 1.7) * rm); else if (slot !== 'trinket') stats.armor = Math.floor((4 + lvl * 1.5) * rm);
  const cls = DATA.classes[S.cls], pool = ['str', 'agi', 'int', 'sta'], nStats = rarity === 'common' ? 1 : rarity === 'uncommon' ? 2 : 3;
  for (let i = 0; i < nStats; i++) { const k = i === 0 && Math.random() < 0.75 ? cls.primary : pick(pool); stats[k] = (stats[k] || 0) + Math.max(1, Math.floor((1 + lvl * 0.45) * rm * (0.7 + Math.random() * 0.6))); }
  const prefix = rarity === 'epic' ? '전설적인 ' : rarity === 'rare' ? '빛나는 ' : rarity === 'uncommon' ? '견고한 ' : '';
  return { id: 'it' + (itemSeq++) + '_' + Date.now(), name: prefix + names[tier], slot, rarity, lvl, tier, stats, price: Math.floor((6 + lvl * 4) * rm * rm) };
}
function itemHtml(it, small) {
  const r = DATA.rarity[it.rarity], st = Object.entries(it.stats).map(([k, v]) => `${statName(k)} +${v}`).join(', ');
  return `<span style="color:${r.color}">${DATA.slots[it.slot].emoji} ${it.name}</span>${small ? '' : ` <small>(Lv${it.lvl} ${DATA.slots[it.slot].name}) ${st}</small>`}`;
}
function statName(k) { return { str: '힘', agi: '민첩', int: '지능', sta: '체력', armor: '방어도', wdmg: '무기 피해' }[k] || k; }

// ===== 월드 =====
function buildWorld(zoneIdx) {
  const z = DATA.zones[zoneIdx], rand = mulberry32(777 + zoneIdx * 1313);
  const g = []; for (let y = 0; y < MAP_H; y++) { g.push([]); for (let x = 0; x < MAP_W; x++) g[y].push(T.GRASS); }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) g[y][x] = T.TREE; else if (rand() < 0.11) g[y][x] = T.TREE;
  for (let i = 0; i < 4; i++) { const cx = 8 + Math.floor(rand() * 15), cy = 2 + Math.floor(rand() * 13); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 2; dx++) if (rand() < 0.75) { const yy = cy + dy, xx = cx + dx; if (xx > 0 && xx < MAP_W - 1 && yy > 0 && yy < MAP_H - 1) g[yy][xx] = T.WATER; } }
  for (let y = 6; y <= 11; y++) for (let x = 1; x <= 6; x++) g[y][x] = T.TOWN;
  let ry = 8; for (let x = 7; x < MAP_W - 1; x++) { g[ry][x] = T.ROAD; if (rand() < 0.3) { ry = clamp(ry + (rand() < 0.5 ? -1 : 1), 7, MAP_H - 3); g[ry][x] = T.ROAD; } }
  for (let yy = 1; yy <= 5; yy++) for (let xx = MAP_W - 7; xx <= MAP_W - 2; xx++) g[yy][xx] = (yy === 1 || xx === MAP_W - 2 || xx === MAP_W - 7) && rand() < 0.5 ? T.TREE : T.GRASS;
  g[ry][MAP_W - 3] = T.ROAD; g[8][1] = T.BACK; g[ry][MAP_W - 2] = T.PORTAL;
  g[2][MAP_W - 4] = T.LAIR; g[3][MAP_W - 4] = T.ROAD; g[4][MAP_W - 4] = T.ROAD; g[5][MAP_W - 4] = T.ROAD;
  const npcs = [
    { kind: 'quest', name: z.quests[0].giver, emoji: '📜', x: 3.5 * TILE, y: 7.5 * TILE },
    { kind: 'vendor', name: '상인', emoji: '🧑‍🌾', x: 2.5 * TILE, y: 10.5 * TILE },
    { kind: 'inn', name: '여관주인', emoji: '🍺', x: 5.5 * TILE, y: 10.5 * TILE },
  ];
  W = { zone: zoneIdx, grid: g, npcs, monsters: [], loot: [], projs: [], fx: [], texts: [], portal: { x: MAP_W - 2, y: ry }, lair: { x: MAP_W - 4, y: 2 }, town: { x: 3.5 * TILE, y: 8.5 * TILE }, spawnT: 0 };
  for (let i = 0; i < 12; i++) spawnMonster(true);
  if (!S.bossDead[z.id]) spawnBoss();
}
function tileAt(px, py) { const x = Math.floor(px / TILE), y = Math.floor(py / TILE); if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return T.TREE; return W.grid[y][x]; }
function solid(px, py) { const t = tileAt(px, py); return t === T.TREE || t === T.WATER; }
function freeCircle(px, py, r) { return !solid(px - r, py - r) && !solid(px + r, py - r) && !solid(px - r, py + r) && !solid(px + r, py + r); }
function makeMonster(def, lvl, x, y) {
  const scale = def.boss ? 1 : 1 + (lvl - def.lvl[0]) * 0.12;
  return { def, lvl, x, y, hx: x, hy: y, hp: Math.floor(def.hp * scale), maxHp: Math.floor(def.hp * scale), dmg: Math.floor(def.dmg * scale * 1.15), boss: !!def.boss, abil: def.abil ? DATA.enemyAbilities[def.abil] : null,
    state: 'idle', atkT: 0, windup: 0, wanderT: 0, vx: 0, vy: 0, stunT: 0, weakT: 0, dots: [], dotTick: 0, flash: 0, facing: 1, frame: 0, r: def.boss ? 26 : 16, aggroR: def.boss ? 230 : 210 };
}
function spawnMonster(initial) {
  const z = DATA.zones[W.zone];
  for (let tries = 0; tries < 60; tries++) {
    const x = rnd(8, MAP_W - 2) * TILE + TILE / 2, y = rnd(1, MAP_H - 2) * TILE + TILE / 2;
    if (!freeCircle(x, y, 16) || tileAt(x, y) === T.LAIR || tileAt(x, y) === T.PORTAL) continue;
    if (dist(x, y, S.px, S.py) < (initial ? 260 : 420)) continue;
    if (W.monsters.some(m => dist(m.x, m.y, x, y) < 70)) continue;
    const def = pick(z.monsters); W.monsters.push(makeMonster(def, rnd(def.lvl[0], def.lvl[1]), x, y)); return;
  }
}
function spawnBoss() { const z = DATA.zones[W.zone]; W.monsters.push(makeMonster(z.boss, z.boss.lvl, (W.lair.x + 0.5) * TILE, (W.lair.y + 0.5) * TILE + 20)); }

// ===== 로그 / HUD =====
function log(msg, cls) { const el = $('#log'); const d = document.createElement('div'); d.className = cls || ''; d.innerHTML = msg; el.appendChild(d); while (el.children.length > 60) el.removeChild(el.firstChild); el.scrollTop = el.scrollHeight; }
function bar(sel, cur, max, color, label) { const el = $(sel); el.querySelector('.fill').style.width = clamp(cur / max * 100, 0, 100) + '%'; el.querySelector('.fill').style.background = color; el.querySelector('.txt').textContent = `${label} ${Math.floor(cur)} / ${Math.floor(max)}`; }
function renderHUD() {
  const st = getStats(), cls = DATA.classes[S.cls], z = DATA.zones[S.zone];
  S.hp = clamp(S.hp, 0, st.maxHp); S.res = clamp(S.res, 0, st.maxRes);
  $('#hud-name').innerHTML = `${cls.emoji} <b>${S.name}</b> <span class="muted">Lv${S.level} ${DATA.races[S.race].name} ${cls.name}</span>`;
  $('#hud-zone').textContent = `📍 ${z.name} (Lv ${z.minLvl}-${z.maxLvl})`; $('#hud-gold').textContent = `💰 ${S.gold}`;
  bar('#bar-hp', S.hp, st.maxHp, '#2ecc40', '체력'); bar('#bar-res', S.res, st.maxRes, DATA.resourceInfo[cls.resource].color, DATA.resourceInfo[cls.resource].name);
  bar('#bar-xp', S.xp, DATA.xpForLevel(S.level), '#b56aff', S.level >= DATA.maxLevel ? '최대 레벨' : '경험치');
  $('#tab-btn-talent').textContent = '특성' + (S.talentPts > 0 ? ` (${S.talentPts})` : '');
  renderPanel(); buildActionBar();
}
function setTab(t) { uiTab = t; document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === t)); renderPanel(); }
function renderPanel() {
  const p = $('#panel');
  if (uiTab === 'char') { p.innerHTML = renderChar(); drawPreview($('#preview')); }
  else if (uiTab === 'bag') p.innerHTML = renderBag(); else if (uiTab === 'quest') p.innerHTML = renderQuests();
  else if (uiTab === 'talent') p.innerHTML = renderTalents(); else if (uiTab === 'skill') p.innerHTML = renderSkills();
}
function drawPreview(cv, race, cls, equip) {
  if (!cv) return; const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
  drawHero(ctx, cv.width / 2, cv.height - 14, { race: race || S.race, cls: cls || S.cls, equip: equip || S.equip, scale: cv.height / 100, facing: 1, frame: 0 });
}
function renderChar() {
  const st = getStats();
  let h = `<div class="charhead"><canvas id="preview" width="110" height="130"></canvas><div class="grid2">
    <div>힘 <b>${st.str}</b></div><div>민첩 <b>${st.agi}</b></div><div>지능 <b>${st.int}</b></div><div>체력 <b>${st.sta}</b></div>
    <div>공격력 <b>${st.ap}</b></div><div>방어도 <b>${st.armor}</b></div><div>치명타 <b>${st.crit.toFixed(1)}%</b></div><div>피해 <b>+${Math.round((st.dmgMult - 1) * 100)}%</b></div></div></div><h4>장비</h4>`;
  for (const slot in DATA.slots) { const it = S.equip[slot]; h += `<div class="row">${DATA.slots[slot].emoji} <span class="muted">${DATA.slots[slot].name}:</span> ${it ? itemHtml(it) + ` <button class="sm" onclick="unequip('${slot}')">해제</button>` : '<span class="muted">비어 있음</span>'}</div>`; }
  h += `<h4>기록</h4><div class="muted">처치 ${S.stats.killsTotal} · 사망 ${S.stats.deaths} · 플레이 ${Math.floor(S.stats.playtime / 60)}분</div><div class="row"><button onclick="saveGame(true)">💾 저장</button> <button onclick="confirmNew()">🆕 새 캐릭터</button></div>`;
  return h;
}
function renderBag() {
  let h = `<h4>소모품</h4>`; const cons = Object.entries(S.consum).filter(([, n]) => n > 0);
  h += cons.length ? cons.map(([id, n]) => { const c = DATA.consumables[id]; return `<div class="row">${c.emoji} ${c.name} ×${n} <small class="muted">${c.desc}</small> <button class="sm" onclick="useConsumable('${id}')">사용</button></div>`; }).join('') : '<div class="muted">없음</div>';
  h += `<h4>장비 (${S.bag.length}/24)</h4>`;
  h += S.bag.length ? S.bag.map((it, i) => `<div class="row">${itemHtml(it)} <button class="sm" onclick="equipItem(${i})">장착</button><button class="sm" onclick="sellItem(${i}, false)">버리기</button></div>`).join('') : '<div class="muted">비어 있음</div>';
  const qi = Object.entries(S.questItems).filter(([, n]) => n > 0);
  if (qi.length) h += `<h4>퀘스트 아이템</h4>` + qi.map(([id, n]) => `<div class="row">${DATA.questItems[id].emoji} ${DATA.questItems[id].name} ×${n}</div>`).join('');
  return h;
}
function renderQuests() {
  const active = [], done = [];
  DATA.zones.forEach(z => z.quests.forEach(q => { const st = S.quests[q.id]; if (!st) return; (st.status === 'done' ? done : active).push({ q, z, st }); }));
  let h = `<h4>진행 중 (${active.length})</h4>`;
  h += active.length ? active.map(({ q, z, st }) => `<div class="quest"><b>${q.name}</b> <span class="muted">(${z.name})</span><div class="muted">${q.text}</div><div>${questTargetName(q)}: <b class="${st.progress >= q.count ? 'ok' : ''}">${Math.min(st.progress, q.count)} / ${q.count}</b>${st.progress >= q.count ? ' ✅ ' + q.giver + '에게 돌아가세요' : ''}</div></div>`).join('') : '<div class="muted">없음. 마을의 📜 NPC를 찾아가세요.</div>';
  h += `<h4>완료 (${done.length})</h4><div class="muted">${done.map(d => d.q.name).join(', ') || '없음'}</div>`; return h;
}
function questTargetName(q) { if (q.type === 'collect') return DATA.questItems[q.target].name; for (const z of DATA.zones) { if (z.boss.id === q.target) return z.boss.name; const m = z.monsters.find(m => m.id === q.target); if (m) return m.name; } return q.target; }
function renderTalents() {
  const cls = DATA.classes[S.cls];
  if (S.level < 10) return `<div class="muted">특성은 레벨 10부터 사용할 수 있습니다. 레벨 10 이후 매 레벨마다 특성 포인트 1개를 얻습니다.</div>`;
  let h = `<div>남은 특성 포인트: <b class="ok">${S.talentPts}</b></div>`;
  cls.specs.forEach(sp => { const p = S.talents[sp.id] || 0; h += `<div class="quest"><b>${sp.name}</b> <span class="muted">${sp.desc}</span><div>${'●'.repeat(p)}${'○'.repeat(10 - p)} ${p}/10 ${S.talentPts > 0 && p < 10 ? `<button class="sm" onclick="spendTalent('${sp.id}')">+1</button>` : ''}</div></div>`; });
  return h + `<div class="row"><button class="sm" onclick="resetTalents()">특성 초기화 (${S.level * 5}골드)</button></div>`;
}
function renderSkills() { const cls = DATA.classes[S.cls]; return cls.abilities.map((a, i) => `<div class="quest ${a.lvl > S.level ? 'locked' : ''}"><b>[${i + 1}] ${a.name}</b> <span class="muted">Lv${a.lvl} · ${DATA.resourceInfo[cls.resource].name} ${a.cost} · 재사용 ${cdSec(a)}초</span><div class="muted">${a.desc}</div></div>`).join(''); }
function cdSec(a) { return a.cd ? a.cd * 1.6 : 0.8; }

// ===== 액션 바 =====
function buildActionBar() {
  const bar = $('#actionbar'); const cls = DATA.classes[S.cls]; let h = '';
  h += `<div class="ab" data-act="attack"><div class="cd"></div><span class="ic">👊</span><span class="key">Space</span><span class="nm">공격</span></div>`;
  cls.abilities.forEach((a, i) => { const known = a.lvl <= S.level; h += `<div class="ab ${known ? '' : 'locked'}" data-act="skill" data-i="${i}" title="${a.name}: ${a.desc}"><div class="cd"></div><span class="ic">${abilityIcon(a)}</span><span class="key">${i + 1}</span><span class="nm">${known ? a.name : 'Lv' + a.lvl}</span></div>`; });
  const pot = bestPotion(); h += `<div class="ab ${pot ? '' : 'locked'}" data-act="potion"><div class="cd"></div><span class="ic">🧪</span><span class="key">Q</span><span class="nm">물약 ${pot ? '×' + S.consum[pot] : ''}</span></div>`;
  h += `<div class="ab" data-act="interact"><div class="cd"></div><span class="ic">💬</span><span class="key">E</span><span class="nm">대화</span></div>`;
  bar.innerHTML = h;
  bar.querySelectorAll('.ab').forEach(el => el.onpointerdown = e => { e.preventDefault(); const act = el.dataset.act; if (act === 'attack') doAttack(); else if (act === 'skill') useAbility(DATA.classes[S.cls].abilities[+el.dataset.i]); else if (act === 'potion') quickPotion(); else if (act === 'interact') interactNearby(); });
}
function abilityIcon(a) { return { dmg: '💥', heal: '💚', shield: '🛡️', dot: '☠️', stun: '💫', slow: '🐌', drain: '🩸' }[a.type] || '✨'; }
function bestPotion() { for (const id of ['hpot_l', 'hpot_m', 'hpot_s']) if (S.consum[id] > 0) return id; return null; }
function updateActionBar() {
  const bar = $('#actionbar'); if (!bar.children.length) return;
  bar.querySelectorAll('.ab').forEach(el => {
    const act = el.dataset.act; let frac = 0;
    if (act === 'attack') frac = P.atkCd / 0.5; else if (act === 'skill') { const a = DATA.classes[S.cls].abilities[+el.dataset.i]; frac = (P.cds[a.id] || 0) / cdSec(a); el.classList.toggle('nores', a.lvl <= S.level && S.res < a.cost); } else if (act === 'potion') frac = P.potCd / 4;
    el.querySelector('.cd').style.height = clamp(frac, 0, 1) * 100 + '%';
  });
}

// ===== 인벤토리 =====
function equipItem(i) { const it = S.bag[i]; if (!it) return; if (it.lvl > S.level + 3) { log(`레벨이 부족합니다. (필요 Lv${it.lvl - 3})`, 'bad'); return; } const old = S.equip[it.slot]; S.bag.splice(i, 1); S.equip[it.slot] = it; if (old) S.bag.push(old); log(`${itemHtml(it, true)} 장착.`); renderHUD(); }
function unequip(slot) { const it = S.equip[slot]; if (!it) return; if (S.bag.length >= 24) { log('가방이 가득 찼습니다.', 'bad'); return; } delete S.equip[slot]; S.bag.push(it); renderHUD(); }
function sellItem(i, sell) { const it = S.bag[i]; if (!it) return; if (sell) { S.gold += Math.floor(it.price / 3); log(`${itemHtml(it, true)} 판매 (+${Math.floor(it.price / 3)}골드)`); } else log(`${itemHtml(it, true)} 버림.`); S.bag.splice(i, 1); renderHUD(); if (sell) openVendor(); }
function addItem(it) { if (S.bag.length >= 24) { log(`가방이 가득 차서 ${itemHtml(it, true)}을(를) 놓쳤습니다.`, 'bad'); return false; } S.bag.push(it); return true; }
function useConsumable(id) {
  const c = DATA.consumables[id]; if (!S.consum[id]) return; const st = getStats();
  if (c.heal) { S.hp = Math.min(st.maxHp, S.hp + c.heal); floatText(S.px, S.py - 60, `+${c.heal}`, '#2ecc40'); }
  if (c.mana) { S.res = Math.min(st.maxRes, S.res + c.mana); floatText(S.px, S.py - 60, `+${c.mana}`, '#4aa3ff'); }
  S.consum[id]--; log(`${c.emoji} ${c.name} 사용`, 'good'); renderHUD();
}
function quickPotion() { if (P.potCd > 0) return; const id = bestPotion(); if (!id) { log('치유 물약이 없습니다. 상인에게 구매하세요.', 'bad'); return; } useConsumable(id); P.potCd = 4; }
function spendTalent(id) { if (S.talentPts <= 0 || (S.talents[id] || 0) >= 10) return; S.talents[id] = (S.talents[id] || 0) + 1; S.talentPts--; renderHUD(); }
function resetTalents() { const cost = S.level * 5; if (S.gold < cost) { log('골드가 부족합니다.', 'bad'); return; } const total = Object.values(S.talents).reduce((a, b) => a + b, 0); S.gold -= cost; S.talents = {}; S.talentPts += total; log('특성을 초기화했습니다.'); renderHUD(); }

// ===== 대화창 =====
function openDialog(title, body, buttons) {
  $('#dialog-title').innerHTML = title; $('#dialog-body').innerHTML = body; const bb = $('#dialog-buttons'); bb.innerHTML = '';
  (buttons || [{ t: '닫기', f: closeDialog }]).forEach(b => { const el = document.createElement('button'); el.textContent = b.t; el.onclick = b.f; bb.appendChild(el); });
  $('#dialog').classList.add('open'); paused = true; keys = {};
}
function closeDialog() { $('#dialog').classList.remove('open'); paused = false; }
function questAvailable(q) { const st = S.quests[q.id]; if (st) return false; if (q.req && (!S.quests[q.req] || S.quests[q.req].status !== 'done')) return false; return true; }
function questMarker() { const z = DATA.zones[W.zone]; for (const q of z.quests) { const st = S.quests[q.id]; if (st && st.status === 'active' && st.progress >= q.count) return '?'; } for (const q of z.quests) if (questAvailable(q)) return '!'; return null; }
function openQuestDialog(n) {
  const z = DATA.zones[W.zone]; let h = ''; const btns = [];
  z.quests.forEach(q => {
    const st = S.quests[q.id];
    if (questAvailable(q)) { h += `<div class="quest"><b>! ${q.name}</b><div>${q.text}</div><div class="muted">보상: ${q.xp} XP, ${q.gold}골드, ${DATA.rarity[q.reward.rarity].name} ${DATA.slots[q.reward.slot].name}</div></div>`; btns.push({ t: `수락: ${q.name}`, f: () => { acceptQuest(q); openQuestDialog(n); } }); }
    else if (st && st.status === 'active') { if (st.progress >= q.count) { h += `<div class="quest"><b>? ${q.name}</b> <span class="ok">완료 가능!</span></div>`; btns.push({ t: `완료: ${q.name}`, f: () => { completeQuest(q); openQuestDialog(n); } }); } else h += `<div class="quest"><b>${q.name}</b> <span class="muted">${questTargetName(q)} ${Math.min(st.progress, q.count)}/${q.count}</span></div>`; }
  });
  if (!h) h = `<p>"${z.name}에 평화를 가져다 줘서 고맙소. ${W.zone < DATA.zones.length - 1 ? '동쪽 포탈을 통해 다음 지역으로 가시오.' : '당신은 진정한 영웅이오!'}"</p>`;
  btns.push({ t: '닫기', f: closeDialog }); openDialog(`📜 ${n.name}`, h, btns);
}
function acceptQuest(q) { S.quests[q.id] = { status: 'active', progress: q.type === 'collect' ? (S.questItems[q.target] || 0) : 0 }; log(`📜 퀘스트 수락: <b>${q.name}</b>`, 'sys'); renderHUD(); }
function completeQuest(q) {
  S.quests[q.id].status = 'done'; if (q.type === 'collect') S.questItems[q.target] = Math.max(0, (S.questItems[q.target] || 0) - q.count);
  const it = genItem(Math.max(S.level, DATA.zones[W.zone].minLvl) + 1, q.reward.slot, q.reward.rarity); S.gold += q.gold; addItem(it);
  log(`✅ 퀘스트 완료: <b>${q.name}</b> — +${q.xp} XP, +${q.gold}골드, ${itemHtml(it, true)}`, 'good'); gainXp(q.xp); renderHUD();
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
function openInn() { openDialog('🍺 여관주인', `<p>"어서 오시오, 모험가. 푹 쉬고 가시구려."</p><p class="muted">휴식하면 체력과 자원이 모두 회복되고 게임이 저장됩니다.</p>`, [{ t: '🛏️ 휴식 (무료)', f: () => { const st = getStats(); S.hp = st.maxHp; S.res = DATA.classes[S.cls].resource === 'rage' ? 0 : st.maxRes; saveGame(true); log('여관에서 휴식하여 완전히 회복했습니다.', 'good'); renderHUD(); closeDialog(); } }, { t: '닫기', f: closeDialog }]); }
function confirmNew() { openDialog('새 캐릭터', '<p>현재 캐릭터의 저장 데이터가 삭제됩니다. 계속할까요?</p>', [{ t: '삭제하고 새로 시작', f: () => { localStorage.removeItem(SAVE_KEY); location.reload(); } }, { t: '취소', f: closeDialog }]); }
function nearestNpc() { let best = null, bd = 80; W.npcs.forEach(n => { const d = dist(n.x, n.y, S.px, S.py); if (d < bd) { bd = d; best = n; } }); return best; }
function interactNearby() { if (paused || dead) return; const n = nearestNpc(); if (!n) { log('근처에 대화할 NPC가 없습니다.', 'muted'); return; } if (n.kind === 'quest') openQuestDialog(n); else if (n.kind === 'vendor') openVendor(); else openInn(); }

// ===== 경험치 =====
function gainXp(n) {
  if (S.level >= DATA.maxLevel) return; S.xp += n; floatText(S.px, S.py - 70, `+${n} XP`, '#c8a6ff');
  while (S.level < DATA.maxLevel && S.xp >= DATA.xpForLevel(S.level)) {
    S.xp -= DATA.xpForLevel(S.level); S.level++; const st = getStats(); S.hp = st.maxHp; if (DATA.classes[S.cls].resource !== 'rage') S.res = st.maxRes;
    if (S.level >= 10) S.talentPts++; log(`🎉 <b>레벨 업! 레벨 ${S.level}</b>`, 'lvl'); floatText(S.px, S.py - 90, `LEVEL UP! ${S.level}`, '#ffd100', 2.2); burst(S.px, S.py - 30, '#ffd100', 24);
    DATA.classes[S.cls].abilities.filter(a => a.lvl === S.level).forEach(a => log(`✨ 새 기술 습득: <b>${a.name}</b> — ${a.desc}`, 'lvl'));
    if (S.level === 10) log('🌟 특성 시스템이 열렸습니다! 특성 탭에서 포인트를 투자하세요.', 'lvl');
  }
  if (S.level >= DATA.maxLevel) S.xp = 0;
}

// ===== 이펙트 =====
function floatText(x, y, text, color, life) { W.texts.push({ x, y, text, color, t: 0, life: life || 1.1, vy: -40 }); }
function burst(x, y, color, n) { for (let i = 0; i < (n || 10); i++) { const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 140; W.fx.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.4 + Math.random() * 0.3, color, r: 2 + Math.random() * 3 }); } }
function slashFx(x, y, dir, color) { W.fx.push({ slash: true, x, y, dir, t: 0, life: 0.18, color }); }

// ===== 전투 =====
function playerDamage(mult, critBonus) { const st = getStats(); let dmg = st.ap * mult * st.dmgMult * (0.9 + Math.random() * 0.2); const crit = Math.random() * 100 < st.crit + (critBonus || 0); if (crit) dmg *= 2; return { dmg: Math.max(1, Math.floor(dmg)), crit }; }
function hitMonster(m, dmg, crit, label) {
  m.hp -= dmg; m.flash = 0.12; P.target = m;
  floatText(m.x + rnd(-10, 10), m.y - 50, `${dmg}${crit ? '!' : ''}`, crit ? '#ffb347' : '#fff', crit ? 1.3 : 0.9);
  if (crit) { shake = Math.max(shake, 6); burst(m.x, m.y - 20, '#ffb347', 8); } else burst(m.x, m.y - 20, '#ff6b6b', 4);
  if (m.state === 'idle') { m.state = 'chase'; }
  if (label) { /* 로그 과다 방지: 치명타/처치만 기록 */ }
  if (m.hp <= 0) killMonster(m);
}
function nearestMonster(range, needLos) { let best = null, bd = range; W.monsters.forEach(m => { const d = dist(m.x, m.y, S.px, S.py); if (d < bd) { bd = d; best = m; } }); return best; }
function doAttack() {
  if (paused || dead || P.atkCd > 0 || P.stunT > 0) return;
  const cls = DATA.classes[S.cls]; P.atkCd = 0.5; P.atkAnim = 0.3;
  if (isRanged()) {
    const tgt = nearestMonster(360); const ang = tgt ? Math.atan2(tgt.y - S.py, tgt.x - S.px) : (P.facing > 0 ? 0 : Math.PI);
    if (tgt) P.facing = tgt.x >= S.px ? 1 : -1;
    W.projs.push({ x: S.px + P.facing * 10, y: S.py - 30, vx: Math.cos(ang) * 520, vy: Math.sin(ang) * 520, t: 0, life: 0.8, mine: true, mult: 1.0, color: cls.color, emoji: S.cls === 'hunter' ? '➶' : S.cls === 'mage' ? '🔥' : '✨' });
  } else {
    slashFx(S.px + P.facing * 26, S.py - 28, P.facing, cls.color); let hit = 0;
    W.monsters.forEach(m => { const d = dist(m.x, m.y, S.px, S.py); const facingOk = (m.x - S.px) * P.facing > -20; if (d < 70 + m.r && facingOk) { const { dmg, crit } = playerDamage(1.0); hitMonster(m, dmg, crit); hit++; } });
    if (hit && cls.resource === 'rage') S.res = Math.min(100, S.res + 12);
  }
}
function useAbility(a) {
  if (paused || dead || !a || a.lvl > S.level || P.stunT > 0) return;
  const cls = DATA.classes[S.cls], st = getStats();
  if ((P.cds[a.id] || 0) > 0) return; if (S.res < a.cost) { floatText(S.px, S.py - 70, `${DATA.resourceInfo[cls.resource].name} 부족`, '#ff7b7b', 0.7); return; }
  const range = isRanged() ? 380 : 95;
  const needTarget = ['dmg', 'drain', 'stun', 'slow', 'dot'].includes(a.type);
  const tgt = needTarget ? nearestMonster(range + 20) : null;
  if (needTarget && !tgt) { floatText(S.px, S.py - 70, '사거리 안에 적이 없습니다', '#ff7b7b', 0.8); return; }
  S.res -= a.cost; P.cds[a.id] = cdSec(a); P.atkAnim = 0.3; if (a.gain) S.res = Math.min(100, S.res + a.gain);
  if (tgt) P.facing = tgt.x >= S.px ? 1 : -1;
  if (a.type === 'dmg' || a.type === 'drain' || a.type === 'stun' || a.type === 'slow') {
    const { dmg, crit } = playerDamage(a.mult, a.critBonus);
    if (isRanged()) { const ang = Math.atan2(tgt.y - S.py, tgt.x - S.px); W.projs.push({ x: S.px, y: S.py - 30, vx: Math.cos(ang) * 600, vy: Math.sin(ang) * 600, t: 0, life: 1, mine: true, fixed: { dmg, crit }, big: true, color: '#ffd100', emoji: abilityIcon(a), onhit: m => applyAbilityEffect(a, m, dmg) }); }
    else { slashFx(S.px + P.facing * 30, S.py - 30, P.facing, '#ffd100'); shake = Math.max(shake, 3); if (a.mult >= 2) W.monsters.forEach(m => { if (m !== tgt && dist(m.x, m.y, S.px, S.py) < 90) { const r2 = playerDamage(a.mult * 0.5); hitMonster(m, r2.dmg, r2.crit); } }); hitMonster(tgt, dmg, crit); applyAbilityEffect(a, tgt, dmg); }
  } else if (a.type === 'heal') { const h = Math.floor(st.ap * a.mult * st.healMult); S.hp = Math.min(st.maxHp, S.hp + h); floatText(S.px, S.py - 70, `+${h}`, '#2ecc40'); burst(S.px, S.py - 30, '#2ecc40', 10); }
  else if (a.type === 'shield') { P.shield += Math.floor(st.ap * a.mult); floatText(S.px, S.py - 70, `🛡️ ${P.shield}`, '#7fd3ff'); burst(S.px, S.py - 30, '#7fd3ff', 10); }
  else if (a.type === 'dot') { const per = Math.floor(st.ap * a.mult * st.dmgMult * st.dotMult * 0.7); const ex = tgt.dots.find(d => d.name === a.name); if (ex) { ex.t = a.turns * 1.2; ex.per = per; } else tgt.dots.push({ name: a.name, t: a.turns * 1.2, per }); if (isRanged()) { const ang = Math.atan2(tgt.y - S.py, tgt.x - S.px); W.projs.push({ x: S.px, y: S.py - 30, vx: Math.cos(ang) * 600, vy: Math.sin(ang) * 600, t: 0, life: 1, mine: true, fixed: { dmg: Math.floor(per * 0.5), crit: false }, color: '#9be89b', emoji: '☠️' }); } else hitMonster(tgt, Math.floor(per * 0.5), false); floatText(tgt.x, tgt.y - 70, `☠️ ${a.name}`, '#9be89b', 0.9); }
  renderHUD();
}
function applyAbilityEffect(a, m, dmg) {
  const st = getStats();
  if (a.type === 'drain') { const h = Math.floor(dmg * 0.5 * st.healMult); S.hp = Math.min(st.maxHp, S.hp + h); floatText(S.px, S.py - 70, `+${h}`, '#2ecc40'); }
  if (a.type === 'stun') { if (!m.boss || Math.random() < 0.5) { m.stunT = m.boss ? 1.0 : 1.8; floatText(m.x, m.y - 70, '💫 기절', '#ffd100', 0.9); } else floatText(m.x, m.y - 70, '저항', '#aaa', 0.7); }
  if (a.type === 'slow') { m.weakT = a.turns * 1.5; floatText(m.x, m.y - 70, '🐌 약화', '#7fd3ff', 0.9); }
}
function damagePlayer(raw, src, label) {
  const st = getStats(); let dmg = raw * (1 - armorReduction(st.armor, src ? src.lvl : S.level)); dmg = Math.max(1, Math.floor(dmg));
  if (P.shield > 0) { const ab = Math.min(P.shield, dmg); P.shield -= ab; dmg -= ab; floatText(S.px, S.py - 60, `🛡️ -${ab}`, '#7fd3ff', 0.7); }
  if (dmg <= 0) return; S.hp -= dmg; P.flash = 0.15; shake = Math.max(shake, 3);
  floatText(S.px + rnd(-8, 8), S.py - 60, `-${dmg}`, '#ff5c5c'); if (DATA.classes[S.cls].resource === 'rage') S.res = Math.min(100, S.res + 5);
  if (S.hp <= 0) die(src);
}
function die(src) {
  S.hp = 0; S.stats.deaths++; const lost = Math.floor(S.gold * 0.1); S.gold -= lost; dead = 2.5; keys = {};
  log(`💀 ${src ? src.def.name + '에게 ' : ''}쓰러졌습니다. 영혼 치유사가 마을에서 되살립니다. (골드 -${lost})`, 'bad');
}
function respawn() { const st = getStats(); S.hp = Math.floor(st.maxHp * 0.6); S.res = DATA.classes[S.cls].resource === 'rage' ? 0 : Math.floor(st.maxRes * 0.6); S.px = W.town.x; S.py = W.town.y; P.dots = []; P.stunT = 0; dead = null; W.monsters.forEach(m => { if (!m.boss) m.state = 'idle'; else { m.state = 'idle'; m.x = m.hx; m.y = m.hy; m.hp = m.maxHp; } }); renderHUD(); }
function killMonster(m) {
  const z = DATA.zones[W.zone]; W.monsters = W.monsters.filter(x => x !== m); if (P.target === m) P.target = null;
  let xp = m.def.xp * (m.boss ? 1 : 1 + (m.lvl - m.def.lvl[0]) * 0.12); const ld = S.level - m.lvl; if (ld > 5) xp *= 0.3; else if (ld > 3) xp *= 0.6; xp = Math.floor(xp);
  S.stats.killsTotal++; S.kills[m.def.id] = (S.kills[m.def.id] || 0) + 1; burst(m.x, m.y - 20, '#ff4444', 16);
  const gold = rnd(m.def.gold[0], m.def.gold[1]); W.loot.push({ x: m.x + rnd(-14, 14), y: m.y + rnd(-6, 10), kind: 'gold', n: gold, t: 0 });
  DATA.zones.forEach(zz => zz.quests.forEach(q => { const st = S.quests[q.id]; if (!st || st.status !== 'active') return;
    if (q.type === 'kill' && q.target === m.def.id) { st.progress++; floatText(m.x, m.y - 30, `📜 ${Math.min(st.progress, q.count)}/${q.count}`, '#c8b6ff', 1.2); if (st.progress === q.count) log(`📜 <b>${q.name}</b> 목표 달성! ${q.giver}에게 돌아가세요.`, 'sys'); }
    if (q.type === 'collect' && q.target === m.def.drop && st.progress < q.count && Math.random() < 0.65) W.loot.push({ x: m.x + rnd(-14, 14), y: m.y + rnd(-6, 10), kind: 'quest', id: m.def.drop, t: 0 });
  }));
  if (m.boss || Math.random() < 0.22) W.loot.push({ x: m.x + rnd(-20, 20), y: m.y + rnd(-6, 10), kind: 'item', item: genItem(m.lvl, null, m.boss ? (Math.random() < 0.35 ? 'epic' : 'rare') : null), t: 0 });
  if (Math.random() < 0.15) W.loot.push({ x: m.x + rnd(-20, 20), y: m.y + rnd(-6, 10), kind: 'cons', id: m.lvl < 10 ? 'hpot_s' : m.lvl < 20 ? 'hpot_m' : 'hpot_l', t: 0 });
  log(`🏆 ${m.def.name} 처치 (+${xp} XP)`, 'good'); gainXp(xp);
  if (m.boss) { S.bossDead[z.id] = true; shake = 14; log(`👑 <b>${z.name}</b>의 우두머리 ${m.def.name}을(를) 물리쳤습니다! 동쪽 포탈이 열렸습니다.`, 'lvl');
    if (W.zone === DATA.zones.length - 1) setTimeout(() => openDialog('🏆 승리!', `<p><b>${S.name}</b>, 당신은 불의 군주를 물리치고 세계를 구했습니다!</p><p>총 처치 ${S.stats.killsTotal}, 사망 ${S.stats.deaths}, 레벨 ${S.level}.</p><p class="muted">게임은 계속 즐길 수 있습니다. 만렙 30까지 도전해 보세요!</p>`), 800); }
  saveGame(); renderHUD();
}

// ===== 업데이트 =====
function update(dt) {
  const st = getStats(), cls = DATA.classes[S.cls];
  if (dead !== null) { dead -= dt; if (dead <= 0) respawn(); updateFx(dt); return; }
  if (paused) return;
  // 쿨다운/효과
  P.atkCd = Math.max(0, P.atkCd - dt); P.atkAnim = Math.max(0, P.atkAnim - dt); P.potCd = Math.max(0, P.potCd - dt); P.flash = Math.max(0, P.flash - dt); P.stunT = Math.max(0, P.stunT - dt); P.weakT = Math.max(0, P.weakT - dt);
  for (const k in P.cds) P.cds[k] = Math.max(0, P.cds[k] - dt);
  P.dotTick += dt; if (P.dotTick >= 1) { P.dotTick -= 1; P.dots.forEach(d => { damagePlayer(d.per, null); d.t -= 1; }); P.dots = P.dots.filter(d => d.t > 0); if (S.hp <= 0) return; }
  // 자원 회복
  const inCombat = W.monsters.some(m => m.state === 'chase' || m.state === 'attack');
  if (cls.resource === 'energy') S.res = Math.min(100, S.res + 22 * dt); else if (cls.resource === 'mana') S.res = Math.min(st.maxRes, S.res + st.maxRes * (inCombat ? 0.03 : 0.08) * dt); else if (!inCombat) S.res = Math.max(0, S.res - 4 * dt);
  if (!inCombat) S.hp = Math.min(st.maxHp, S.hp + st.maxHp * 0.02 * dt);
  // 이동
  let dx = 0, dy = 0;
  if (keys.ArrowLeft || keys.a || keys.A) dx -= 1; if (keys.ArrowRight || keys.d || keys.D) dx += 1; if (keys.ArrowUp || keys.w || keys.W) dy -= 1; if (keys.ArrowDown || keys.s || keys.S) dy += 1;
  P.moving = (dx || dy) && P.stunT <= 0;
  if (P.moving) {
    const len = Math.hypot(dx, dy); dx /= len; dy /= len; if (dx) P.facing = dx > 0 ? 1 : -1;
    const nx = S.px + dx * PLAYER_SPEED * dt, ny = S.py + dy * PLAYER_SPEED * dt;
    if (freeCircle(nx, S.py, PLAYER_R)) S.px = nx; if (freeCircle(S.px, ny, PLAYER_R)) S.py = ny;
    P.animT += dt; if (P.animT > 0.12) { P.animT = 0; P.frame = (P.frame + 1) % 4; }
    const t = tileAt(S.px, S.py);
    if (t === T.PORTAL) { travel(1); return; } if (t === T.BACK && W.zone > 0) { travel(-1); return; }
  } else P.frame = 0;
  // 전리품 줍기
  W.loot = W.loot.filter(l => { l.t += dt; if (dist(l.x, l.y, S.px, S.py) < 30) { pickLoot(l); return false; } return true; });
  // 몬스터
  W.monsters.forEach(m => updateMonster(m, dt));
  // 투사체
  W.projs = W.projs.filter(p => {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t > p.life || solid(p.x, p.y + 20)) return false;
    if (p.mine) { for (const m of W.monsters) if (dist(m.x, m.y - 20, p.x, p.y) < m.r + 10) { const r = p.fixed || playerDamage(p.mult); hitMonster(m, r.dmg, r.crit); if (p.onhit) p.onhit(m); if (p.big) shake = Math.max(shake, 3); return false; } }
    else if (dist(S.px, S.py - 25, p.x, p.y) < PLAYER_R + 12) { damagePlayer(p.dmg, p.src); if (p.stun && Math.random() < 0.5) P.stunT = 1; return false; }
    return true;
  });
  W.spawnT += dt; if (W.spawnT > 4 && W.monsters.filter(m => !m.boss).length < 12) { W.spawnT = 0; spawnMonster(); }
  updateFx(dt);
}
function updateFx(dt) {
  W.texts = W.texts.filter(t => { t.t += dt; t.y += t.vy * dt; return t.t < t.life; });
  W.fx = W.fx.filter(f => { f.t += dt; if (!f.slash) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 200 * dt; } return f.t < f.life; });
  shake = Math.max(0, shake - dt * 30);
}
function pickLoot(l) {
  if (l.kind === 'gold') { S.gold += l.n; floatText(S.px, S.py - 60, `+${l.n}💰`, '#ffd100', 0.8); }
  else if (l.kind === 'quest') { S.questItems[l.id] = (S.questItems[l.id] || 0) + 1; DATA.zones.forEach(z => z.quests.forEach(q => { const st = S.quests[q.id]; if (st && st.status === 'active' && q.type === 'collect' && q.target === l.id) { st.progress = S.questItems[l.id]; if (st.progress === q.count) log(`📜 <b>${q.name}</b> 목표 달성! ${q.giver}에게 돌아가세요.`, 'sys'); } })); floatText(S.px, S.py - 60, `📦 ${DATA.questItems[l.id].name}`, '#c8b6ff'); }
  else if (l.kind === 'cons') { S.consum[l.id] = (S.consum[l.id] || 0) + 1; floatText(S.px, S.py - 60, `🧪 ${DATA.consumables[l.id].name}`, '#9be89b'); }
  else if (l.kind === 'item') { if (addItem(l.item)) { log(`🎁 획득: ${itemHtml(l.item)}`, 'lvl'); floatText(S.px, S.py - 60, `🎁 ${l.item.name}`, DATA.rarity[l.item.rarity].color, 1.4); } }
  renderHUD();
}
function updateMonster(m, dt) {
  m.flash = Math.max(0, m.flash - dt); m.weakT = Math.max(0, m.weakT - dt);
  m.dotTick += dt; if (m.dotTick >= 1) { m.dotTick -= 1; m.dots.forEach(d => { m.hp -= d.per; floatText(m.x + rnd(-8, 8), m.y - 50, `${d.per}`, '#9be89b', 0.7); d.t -= 1; }); m.dots = m.dots.filter(d => d.t > 0); if (m.hp <= 0) { killMonster(m); return; } }
  if (m.stunT > 0) { m.stunT -= dt; return; }
  const d = dist(m.x, m.y, S.px, S.py);
  const atkRange = m.abil && ['bolt', 'volley', 'candle'].includes(m.def.abil) ? 240 : 46 + m.r;
  if (m.state === 'idle') {
    if (d < m.aggroR && (!m.boss || d < 200)) { m.state = 'chase'; floatText(m.x, m.y - 60, '!', '#ff5555', 0.6); if (m.boss) log(`👑 <b>${m.def.name}</b>이(가) 당신을 노려봅니다!`, 'bad'); }
    else { m.wanderT -= dt; if (m.wanderT <= 0) { m.wanderT = 1 + Math.random() * 2; if (m.boss || Math.random() < 0.4) { m.vx = 0; m.vy = 0; } else { const a = Math.random() * Math.PI * 2; m.vx = Math.cos(a) * 50; m.vy = Math.sin(a) * 50; } } moveMonster(m, dt, 1, true); }
  } else if (m.state === 'chase' || m.state === 'attack') {
    if (d > m.aggroR * 2.2 || dist(m.x, m.y, m.hx, m.hy) > (m.boss ? 400 : 900)) { m.state = 'idle'; m.windup = 0; if (m.boss) { m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.02); } return; }
    if (d > atkRange) { const ang = Math.atan2(S.py - m.y, S.px - m.x); const sp = m.boss ? 120 : 110 + m.lvl * 2; m.vx = Math.cos(ang) * sp; m.vy = Math.sin(ang) * sp; moveMonster(m, dt, 1, false); m.windup = 0; m.state = 'chase'; }
    else {
      m.state = 'attack'; m.vx = 0; m.vy = 0; m.facing = S.px >= m.x ? 1 : -1;
      m.atkT += dt; const interval = m.boss ? 1.6 : 1.35;
      if (m.atkT >= interval - 0.4 && m.windup === 0) m.windup = 0.01;
      if (m.windup > 0) m.windup += dt;
      if (m.atkT >= interval) {
        m.atkT = 0; m.windup = 0;
        let mult = 1, ab = null; if (m.abil && Math.random() < m.abil.chance) { ab = m.abil; mult = ab.mult; }
        if (ab && ab.heal) { const h = Math.floor(m.maxHp * ab.heal); m.hp = Math.min(m.maxHp, m.hp + h); floatText(m.x, m.y - 60, `${ab.name} +${h}`, '#2ecc40', 0.9); return; }
        let dmg = m.dmg * mult * (0.85 + Math.random() * 0.3); if (m.weakT > 0) dmg *= 0.7;
        if (ab) floatText(m.x, m.y - 64, `🔥 ${ab.name}`, '#ff9955', 0.9);
        if (atkRange > 100) { const ang = Math.atan2(S.py - 25 - m.y + 20, S.px - m.x); W.projs.push({ x: m.x, y: m.y - 20, vx: Math.cos(ang) * 320, vy: Math.sin(ang) * 320, t: 0, life: 1.2, mine: false, dmg, src: m, stun: ab && ab.stun, color: '#ff5555', emoji: '•' }); }
        else if (d < atkRange + 24) { damagePlayer(dmg, m); if (ab && ab.stun && Math.random() < 0.6) { P.stunT = 1.2; floatText(S.px, S.py - 80, '💫 기절!', '#ffd100'); } if (ab && ab.dot) P.dots.push({ name: ab.name, t: ab.dot, per: Math.max(1, Math.floor(m.dmg * 0.25)) }); if (ab && ab.weaken) P.weakT = ab.weaken * 1.5; }
      }
    }
  }
}
function moveMonster(m, dt, mult, avoidTown) {
  if (!m.vx && !m.vy) return; const nx = m.x + m.vx * dt * mult, ny = m.y + m.vy * dt * mult; if (m.vx) m.facing = m.vx > 0 ? 1 : -1;
  const okTile = (x, y) => freeCircle(x, y, m.r) && (!avoidTown || tileAt(x, y) !== T.TOWN) && !(m.boss && dist(x, y, m.hx, m.hy) > 420) && !(!m.boss && (tileAt(x, y) === T.LAIR));
  if (okTile(nx, m.y)) m.x = nx; else m.vx = -m.vx; if (okTile(m.x, ny)) m.y = ny; else m.vy = -m.vy;
  if (!m.boss && tileAt(m.x, m.y) === T.TOWN) { m.state = 'idle'; }
  W.monsters.forEach(o => { if (o !== m) { const d = dist(o.x, o.y, m.x, m.y); if (d < m.r + o.r && d > 0) { const push = (m.r + o.r - d) / 2; m.x += (m.x - o.x) / d * push; m.y += (m.y - o.y) / d * push; } } });
  m.frame = (m.frame + dt * 8) % 4;
}
function travel(dir) {
  const z = DATA.zones[W.zone];
  if (dir > 0) {
    if (W.zone >= DATA.zones.length - 1) { log('이곳이 세계의 끝입니다.'); S.px -= 40; return; }
    if (!S.bossDead[z.id]) { log(`🔒 이 지역의 우두머리 <b>${z.boss.name}</b>을(를) 처치해야 다음 지역으로 갈 수 있습니다. (미니맵의 빨간 칸)`, 'bad'); floatText(S.px, S.py - 70, '🔒 포탈이 잠겨 있습니다', '#ff7b7b', 1.2); S.px -= 40; return; }
  }
  S.zone = W.zone + dir; buildWorld(S.zone);
  if (dir > 0) { S.px = 2.5 * TILE; S.py = 8.5 * TILE; } else { S.px = (W.portal.x - 1.5) * TILE; S.py = (W.portal.y + 0.5) * TILE; }
  const nz = DATA.zones[S.zone]; log(`🌀 <b>${nz.name}</b>에 도착했습니다. ${nz.intro}`, 'sys'); camX = S.px; camY = S.py; saveGame(); renderHUD();
}

// ===== 렌더링 =====
function drawLabel(ctx, cx, cy, text, color, font) { ctx.font = font || 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const w = ctx.measureText(text).width + 10; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - 9, w, 18, 6); ctx.fill(); ctx.fillStyle = color; ctx.fillText(text, cx, cy); }
function hpBar(ctx, x, y, w, frac, color) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6); ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), 4); }
function draw() {
  const cv = $('#canvas'), ctx = cv.getContext('2d'); if (!W) return;
  const z = DATA.zones[W.zone], th = z.theme, cls = DATA.classes[S.cls];
  const tx = clamp(S.px - cv.width / 2, 0, MAP_W * TILE - cv.width), ty = clamp(S.py - cv.height / 2, 0, MAP_H * TILE - cv.height);
  camX += (tx - camX) * 0.12; camY += (ty - camY) * 0.12;
  const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
  ctx.clearRect(0, 0, cv.width, cv.height); ctx.save(); ctx.translate(-Math.round(camX + sx), -Math.round(camY + sy));
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE)), x1 = Math.min(MAP_W - 1, Math.ceil((camX + cv.width) / TILE)), y1 = Math.min(MAP_H - 1, Math.ceil((camY + cv.height) / TILE));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = W.grid[y][x]; let col = th.grass;
    if (t === T.TREE) col = th.dark; else if (t === T.WATER) col = th.water; else if (t === T.ROAD) col = th.road; else if (t === T.TOWN) col = '#8b6b4a'; else if (t === T.PORTAL || t === T.BACK) col = '#5b3fa6'; else if (t === T.LAIR) col = '#6b1d1d';
    ctx.fillStyle = col; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    const px = x * TILE, py = y * TILE;
    if (t === T.GRASS && (x * 7 + y * 13) % 5 === 0) { ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(px + 12, py + 40, 6, 3); ctx.fillRect(px + 40, py + 18, 6, 3); }
    else if (t === T.WATER) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; const o = Math.sin(performance.now() / 500 + x + y) * 4; ctx.fillRect(px + 10 + o, py + 20, 22, 3); ctx.fillRect(px + 30 - o, py + 42, 20, 3); }
    else if (t === T.TOWN) { ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.strokeRect(px + 0.5, py + 0.5, TILE, TILE); }
    else if (t === T.ROAD) { ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(px + 8, py + 30, 10, 4); ctx.fillRect(px + 38, py + 14, 12, 4); }
  }
  // 정렬된 오브젝트 그리기 (y 순서)
  const ents = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const t = W.grid[y][x]; if (t === T.TREE) ents.push({ y: y * TILE + 56, f: () => drawTree(ctx, x * TILE + 32, y * TILE + 32, th) }); else if (t === T.PORTAL || t === T.BACK || t === T.LAIR) ents.push({ y: y * TILE + 20, f: () => drawSpecial(ctx, t, x, y, z) }); }
  W.loot.forEach(l => ents.push({ y: l.y, f: () => drawLoot(ctx, l) }));
  W.npcs.forEach(n => ents.push({ y: n.y, f: () => { ctx.font = '46px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(n.x, n.y + 2, 18, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillText(n.emoji, n.x, n.y - 24); drawLabel(ctx, n.x, n.y + 14, n.name, '#ffe9a8', 'bold 11px sans-serif'); if (n.kind === 'quest') { const st = questMarker(); if (st) { ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = '#000'; ctx.fillText(st, n.x + 1, n.y - 57); ctx.fillStyle = '#ffd100'; ctx.fillText(st, n.x, n.y - 58); } } if (dist(n.x, n.y, S.px, S.py) < 80) drawLabel(ctx, n.x, n.y - 78, '[E] 대화', '#fff', 'bold 11px sans-serif'); } }));
  W.monsters.forEach(m => ents.push({ y: m.y, f: () => drawMonster(ctx, m) }));
  ents.push({ y: S.py, f: () => {
    if (P.flash > 0) { ctx.fillStyle = 'rgba(255,0,0,0.25)'; ctx.beginPath(); ctx.arc(S.px, S.py - 28, 34, 0, Math.PI * 2); ctx.fill(); }
    if (P.shield > 0) { ctx.strokeStyle = 'rgba(127,211,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(S.px, S.py - 28, 34, 0, Math.PI * 2); ctx.stroke(); }
    drawHero(ctx, S.px, S.py, { race: S.race, cls: S.cls, equip: S.equip, facing: P.facing, moving: P.moving, frame: P.frame, attackT: P.atkAnim > 0 ? 1 - P.atkAnim / 0.3 : 0 });
    drawLabel(ctx, S.px, S.py - 78, `${S.name} Lv${S.level}`, cls.color, 'bold 13px sans-serif');
    if (P.stunT > 0) drawLabel(ctx, S.px, S.py - 96, '💫 기절', '#ffd100');
  } });
  W.projs.forEach(p => ents.push({ y: p.y + 30, f: () => { ctx.font = (p.big ? 28 : 20) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = p.color; ctx.shadowBlur = 12; ctx.fillStyle = p.color; if (p.emoji === '•') { ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); } else ctx.fillText(p.emoji, p.x, p.y); ctx.shadowBlur = 0; } }));
  ents.sort((a, b) => a.y - b.y).forEach(e => e.f());
  // 이펙트
  W.fx.forEach(f => { const a = 1 - f.t / f.life; if (f.slash) { ctx.strokeStyle = f.color; ctx.globalAlpha = a; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x - f.dir * 20, f.y, 34, f.dir > 0 ? -1.1 : Math.PI - 1.1, f.dir > 0 ? 1.1 : Math.PI + 1.1); ctx.stroke(); ctx.globalAlpha = 1; } else { ctx.globalAlpha = a; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; } });
  W.texts.forEach(t => { const a = 1 - Math.pow(t.t / t.life, 2); ctx.globalAlpha = a; ctx.font = `bold ${t.text.length > 8 ? 13 : 17}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(t.text, t.x, t.y); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y); ctx.globalAlpha = 1; });
  ctx.restore();
  drawMinimap(ctx, cv, th, z); drawTargetFrame(ctx);
  if (dead !== null) { ctx.fillStyle = 'rgba(60,0,0,0.55)'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.fillStyle = '#fff'; ctx.font = 'bold 40px serif'; ctx.textAlign = 'center'; ctx.fillText('💀 쓰러졌습니다', cv.width / 2, cv.height / 2 - 10); ctx.font = '16px sans-serif'; ctx.fillText('마을에서 되살아납니다...', cv.width / 2, cv.height / 2 + 26); }
  if (P.stunT > 0 || P.weakT > 0 || P.dots.length) { let s = ''; if (P.weakT > 0) s += '🐌 약화 '; P.dots.forEach(d => s += `☠️ ${d.name} `); if (s) drawLabel(ctx, cv.width / 2, cv.height - 16, s.trim(), '#ff9955'); }
}
function drawTree(ctx, cx, cy, th) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + 22, 20, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#5a3a1a'; ctx.fillRect(cx - 4, cy + 6, 8, 18); ctx.fillStyle = th.tree; ctx.beginPath(); ctx.arc(cx, cy - 6, 22, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx - 7, cy - 13, 9, 0, Math.PI * 2); ctx.fill(); }
function drawSpecial(ctx, t, x, y, z) {
  const cx = x * TILE + 32, cy = y * TILE + 32; ctx.font = '44px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (t === T.PORTAL) { const open = S.bossDead[z.id] || W.zone === DATA.zones.length - 1; ctx.save(); ctx.translate(cx, cy); if (open) ctx.rotate(performance.now() / 600); ctx.fillText(open ? '🌀' : '🔒', 0, 0); ctx.restore(); drawLabel(ctx, cx, cy + 34, W.zone < DATA.zones.length - 1 ? '→ ' + DATA.zones[W.zone + 1].name : '세계의 끝', '#e0c8ff'); }
  else if (t === T.BACK) { ctx.fillText(W.zone > 0 ? '🌀' : '🏠', cx, cy); if (W.zone > 0) drawLabel(ctx, cx, cy + 34, '← ' + DATA.zones[W.zone - 1].name, '#e0c8ff'); }
  else if (t === T.LAIR) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx - 32, cy - 32, 64, 64); ctx.fillText(S.bossDead[z.id] ? '💀' : '🏴', cx, cy); drawLabel(ctx, cx, cy - 40, S.bossDead[z.id] ? '정복한 은신처' : '⚠️ 우두머리 은신처', '#ff8080'); }
}
function drawLoot(ctx, l) { const bob = Math.sin(l.t * 5) * 3; ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(l.x, l.y + 4, 9, 3, 0, 0, Math.PI * 2); ctx.fill(); const em = l.kind === 'gold' ? '💰' : l.kind === 'quest' ? DATA.questItems[l.id].emoji : l.kind === 'cons' ? '🧪' : '🎁'; if (l.kind === 'item') { ctx.shadowColor = DATA.rarity[l.item.rarity].color; ctx.shadowBlur = 14; } ctx.fillText(em, l.x, l.y - 10 + bob); ctx.shadowBlur = 0; }
function drawMonster(ctx, m) {
  const size = m.boss ? 84 : 48; ctx.save(); ctx.translate(m.x, m.y); const bob = (m.state !== 'idle' || m.vx || m.vy) ? Math.abs(Math.sin(m.frame * Math.PI / 2)) * -4 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 2, size * 0.4, size * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  if (m.boss) { const g = ctx.createRadialGradient(0, -30, 10, 0, -30, 60); g.addColorStop(0, 'rgba(255,60,60,0.35)'); g.addColorStop(1, 'rgba(255,60,60,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -30, 60, 0, Math.PI * 2); ctx.fill(); }
  ctx.scale(m.facing, 1); ctx.font = `${size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (m.flash > 0) { ctx.filter = 'brightness(3)'; } ctx.fillText(m.def.emoji, 0, -size / 2 + 4 + bob); ctx.filter = 'none'; ctx.restore();
  if (m.windup > 0) { ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff3030'; ctx.fillText('!', m.x, m.y - size - 24); }
  const col = m.boss ? '#ff6060' : m.lvl > S.level + 2 ? '#ff6060' : m.lvl < S.level - 3 ? '#bbb' : '#ffd100';
  drawLabel(ctx, m.x, m.y - size - 6, `${m.boss ? '👑 ' : ''}Lv${m.lvl} ${m.def.name}`, col, 'bold 11px sans-serif');
  if (m.hp < m.maxHp || m.state !== 'idle') hpBar(ctx, m.x, m.y - size + 6, m.boss ? 80 : 44, m.hp / m.maxHp, '#e74c3c');
  if (m.stunT > 0) { ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.fillText('💫', m.x, m.y - size - 26); }
  if (m.dots.length) { ctx.font = '12px serif'; ctx.textAlign = 'center'; ctx.fillText('☠️'.repeat(Math.min(3, m.dots.length)), m.x + 26, m.y - size + 2); }
}
function drawMinimap(ctx, cv, th, z) {
  const mw = 140, mh = 90, mx = cv.width - mw - 8, my = 8, sx = mw / MAP_W, sy = mh / MAP_H;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) { const t = W.grid[y][x]; let col = th.grass; if (t === T.TREE) col = th.dark; else if (t === T.WATER) col = th.water; else if (t === T.ROAD) col = th.road; else if (t === T.TOWN) col = '#8b6b4a'; else if (t === T.PORTAL || t === T.BACK) col = '#b08cff'; else if (t === T.LAIR) col = S.bossDead[z.id] ? '#555' : '#ff3030'; ctx.fillStyle = col; ctx.fillRect(mx + x * sx, my + y * sy, sx, sy); }
  W.monsters.forEach(m => { ctx.fillStyle = m.boss ? '#ff3030' : '#ff8080'; ctx.fillRect(mx + m.x / TILE * sx - 1.5, my + m.y / TILE * sy - 1.5, 3, 3); });
  ctx.fillStyle = '#ffd100'; W.npcs.forEach(n => ctx.fillRect(mx + n.x / TILE * sx - 1.5, my + n.y / TILE * sy - 1.5, 3, 3));
  ctx.fillStyle = '#fff'; ctx.fillRect(mx + S.px / TILE * sx - 2, my + S.py / TILE * sy - 2, 4, 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(mx + camX / TILE * sx, my + camY / TILE * sy, cv.width / TILE * sx, cv.height / TILE * sy);
}
function drawTargetFrame(ctx) {
  const m = P.target; if (!m || !W.monsters.includes(m)) return;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.roundRect(8, 8, 220, 44, 6); ctx.fill();
  ctx.font = '26px serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(m.def.emoji, 14, 30);
  ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(`${m.boss ? '👑 ' : ''}${m.def.name} Lv${m.lvl}`, 50, 20);
  ctx.fillStyle = '#400'; ctx.fillRect(50, 30, 170, 12); ctx.fillStyle = '#e74c3c'; ctx.fillRect(50, 30, 170 * clamp(m.hp / m.maxHp, 0, 1), 12);
  ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${Math.max(0, Math.floor(m.hp))} / ${m.maxHp}`, 135, 36);
}

// ===== 루프 =====
function loop(t) {
  if (!S) return; const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
  update(dt); draw(); updateActionBar();
  if (Math.floor(t / 250) !== Math.floor((t - dt * 1000) / 250)) { const st = getStats(); bar('#bar-hp', S.hp, st.maxHp, '#2ecc40', '체력'); bar('#bar-res', S.res, st.maxRes, DATA.resourceInfo[DATA.classes[S.cls].resource].color, DATA.resourceInfo[DATA.classes[S.cls].resource].name); }
  requestAnimationFrame(loop);
}

// ===== 저장 =====
function saveGame(notify) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); if (notify) log('💾 저장되었습니다.', 'sys'); } catch (e) { if (notify) log('저장 실패: ' + e.message, 'bad'); } }
function loadGame() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

// ===== 시작 =====
function startGame(state) {
  S = state; P = newRuntime(); if (S.px === undefined) { S.px = 3.5 * TILE; S.py = 8.5 * TILE; }
  buildWorld(S.zone); const st = getStats(); if (!S.hp) S.hp = st.maxHp; if (S.res === null || S.res === undefined) S.res = DATA.classes[S.cls].resource === 'rage' ? 0 : st.maxRes;
  if (!freeCircle(S.px, S.py, PLAYER_R)) { S.px = W.town.x; S.py = W.town.y; } camX = S.px; camY = S.py;
  $('#screen-create').classList.remove('open'); $('#screen-game').classList.add('open');
  const z = DATA.zones[S.zone]; log(`<b>${z.name}</b>에 오신 것을 환영합니다, ${S.name}. ${z.intro}`, 'sys');
  log('WASD/방향키로 이동, Space로 공격, 1~6 기술, Q 물약, E로 NPC 대화. 📜 퀘스트 NPC부터 만나보세요!', 'muted');
  setTab('char'); renderHUD(); lastT = performance.now(); requestAnimationFrame(loop);
  setInterval(() => { if (S) S.stats.playtime++; }, 1000); setInterval(() => { if (S && !dead) saveGame(); }, 30000);
}
let selRace = 'human', selCls = 'warrior';
function renderCreate() {
  $('#race-list').innerHTML = Object.entries(DATA.races).map(([id, r]) => `<div class="card ${id === selRace ? 'sel' : ''}" onclick="selRace='${id}';renderCreate()"><div class="big">${r.emoji}</div><b>${r.name}</b><div class="muted small">${r.faction}</div><div class="small">${r.desc}</div></div>`).join('');
  $('#class-list').innerHTML = Object.entries(DATA.classes).map(([id, c]) => `<div class="card ${id === selCls ? 'sel' : ''}" style="border-color:${id === selCls ? c.color : ''}" onclick="selCls='${id}';renderCreate()"><div class="big">${c.emoji}</div><b style="color:${c.color}">${c.name}</b><div class="muted small">${DATA.resourceInfo[c.resource].name} 사용</div><div class="small">${c.desc}</div></div>`).join('');
  const saved = loadGame(); const lb = $('#btn-load'); if (saved) { lb.style.display = ''; lb.textContent = `▶ 이어하기: ${saved.name} (Lv${saved.level} ${DATA.classes[saved.cls].name})`; } else lb.style.display = 'none';
  const demoEq = { weapon: { rarity: 'rare' }, chest: { tier: 1 } }; drawPreview($('#create-preview'), selRace, selCls, demoEq);
}
function createChar() { const name = $('#inp-name').value.trim() || '모험가'; startGame(newState(name, selRace, selCls)); saveGame(); }

document.addEventListener('DOMContentLoaded', () => {
  renderCreate(); $('#btn-create').onclick = createChar; $('#btn-load').onclick = () => { const s = loadGame(); if (s) startGame(s); };
  $('#inp-name').addEventListener('keydown', e => { if (e.key === 'Enter') createChar(); });
  document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  document.querySelectorAll('[data-key]').forEach(b => { const k = b.dataset.key; const on = e => { e.preventDefault(); keys[k] = true; }; const off = e => { e.preventDefault(); keys[k] = false; }; b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off); });
  $('#btn-attack').addEventListener('pointerdown', e => { e.preventDefault(); doAttack(); });
  document.addEventListener('keydown', e => {
    if (!S) return; if (e.target.tagName === 'INPUT') return;
    if ($('#dialog').classList.contains('open')) { if (e.key === 'Escape' || e.key === 'e' || e.key === 'E') closeDialog(); return; }
    if (e.key === ' ') { e.preventDefault(); doAttack(); return; }
    const n = parseInt(e.key); if (n >= 1 && n <= 6) { useAbility(DATA.classes[S.cls].abilities[n - 1]); return; }
    if (e.key === 'q' || e.key === 'Q') { quickPotion(); return; } if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') { interactNearby(); return; }
    if (e.key === 'i' || e.key === 'I') setTab('bag'); if (e.key === 'l' || e.key === 'L') setTab('quest'); if (e.key === 'n' || e.key === 'N') setTab('talent'); if (e.key === 'c' || e.key === 'C') setTab('char'); if (e.key === 'k' || e.key === 'K') setTab('skill');
    if (e.key.startsWith('Arrow')) e.preventDefault(); keys[e.key] = true;
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });
  window.addEventListener('blur', () => { keys = {}; });
});
