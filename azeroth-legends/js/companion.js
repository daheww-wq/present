// ===== LLM 동료: 견습 마법사 렌 =====
'use strict';
const CO = { name: '렌', x: 0, y: 0, facing: 1, frame: 0, animT: 0, moving: false, bubble: null, sample: null, sampleReady: false, turns: [], busy: false, ctl: null, lastAuto: 0, healCd: 0, stuckT: 0, lowHpT: 0, autoLLM: false, hint: null, stance: 'assist', order: null, atkCd: 0, atkAnim: 0, target: null };
const CO_STANCE = { passive: '수동', assist: '보조', aggressive: '선공' };
const CO_LOOK = { race: 'nightelf', cls: 'mage', equip: { chest: { tier: 0 }, weapon: { rarity: 'uncommon' } } };
const CO_LINES = {
  greet: ['안녕! 난 렌이야. 같이 모험하자!', '오늘도 잘 부탁해, 대장!'],
  levelup: ['레벨 업! 점점 강해지는데?', '오, 새 레벨! 기술 탭 확인해 봐.', '이 기세면 만렙도 금방이겠어!'],
  boss_aggro: ['조심해! 저건 우두머리야!', '물약 준비해! 큰 놈이 온다!', '기절기 아껴 뒀지? 지금이야!'],
  low_hp: ['체력이 위험해! Q로 물약 마셔!', '뒤로 빠져! 내가 시간 벌게!', '무리하지 마, 마을로 돌아가도 돼.'],
  quest_done: ['퀘스트 완료! 보상 챙겼어?', '역시 대장이야. 다음 의뢰도 받자!'],
  death: ['...괜찮아. 다시 일어나면 돼.', '마을에서 장비 정비하고 다시 가자.'],
  zone: ['새로운 땅이야! 몬스터 레벨 확인해.', '여기 공기가 달라... 조심해서 가자.'],
  epic: ['우와, 영웅 장비잖아! 당장 입어봐!', '보라색 아이템이야! 대박!'],
  boss_dead: ['해냈다!! 포탈이 열렸어!', '우두머리를 쓰러뜨렸어! 다음 지역으로!'],
};
function companionInit() {
  CO.x = S.px - 50; CO.y = S.py + 10; CO.turns = []; CO.bubble = null;
  companionSay(pick(CO_LINES.greet));
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('sample').then(fn => { CO.sample = fn || null; CO.sampleReady = true; renderCompanionPanel(); }).catch(() => { CO.sampleReady = true; renderCompanionPanel(); });
  } else { CO.sampleReady = true; }
  renderCompanionPanel();
}
function companionSay(text, life) { if (!text || !text.trim()) return; CO.bubble = { text: text.trim(), t: 0, life: life || 4.5 }; }
function companionEvent(kind, detail) {
  if (!S || !CO) return;
  if (kind === 'low_hp') { if (CO.lowHpT > 0) return; CO.lowHpT = 30; }
  const scripted = CO_LINES[kind] ? pick(CO_LINES[kind]) : null;
  if (CO.autoLLM && CO.sample && !CO.busy && performance.now() - CO.lastAuto > 40000) {
    CO.lastAuto = performance.now();
    const prompt = companionRules() + `\n\n[방금 일어난 일] ${kind}${detail ? ': ' + detail : ''}\n이 상황에 렌이 대장에게 외칠 한마디를 25자 이내 한국어로만 출력해.`;
    CO.sample(prompt, { modelTier: 'quick', cache: false }).then(r => companionSay(r.text.trim().slice(0, 40), 5)).catch(() => { if (scripted) companionSay(scripted); });
  } else if (scripted) companionSay(scripted);
}
function companionDamage() { return Math.floor((6 + S.level * 3.2) * (0.9 + Math.random() * 0.2)); }
function companionPickTarget() {
  if (CO.order && CO.order.type === 'attack') { const m = CO.order.target; if (m && W.monsters.includes(m)) return m; CO.order = null; }
  if (CO.stance === 'passive') return null;
  let best = null, bd = 1e9;
  W.monsters.forEach(m => { const dp = dist(m.x, m.y, S.px, S.py); const hostile = m.state === 'chase' || m.state === 'attack' || m === P.target; if (hostile && dp < 420) { if (dp < bd) { bd = dp; best = m; } } });
  if (best) return best;
  if (CO.stance === 'aggressive') { W.monsters.forEach(m => { if (m.boss) return; const dp = dist(m.x, m.y, S.px, S.py); if (dp < 300 && dp < bd) { bd = dp; best = m; } }); }
  return best;
}
function companionOrderAttack(spec) {
  spec = (spec || 'nearest').toString().toLowerCase(); let m = null, bd = 1e9;
  if (/boss|보스|우두머리/.test(spec)) m = W.monsters.find(x => x.boss) || null;
  else W.monsters.forEach(x => { if (spec !== 'nearest' && !x.def.name.toLowerCase().includes(spec)) return; const d = dist(x.x, x.y, S.px, S.py); if (d < 520 && d < bd) { bd = d; m = x; } });
  if (!m) throw new Error(spec === 'nearest' ? '520px(8칸) 안에 공격할 몬스터가 없음. 대장이 몬스터 쪽으로 이동해야 함' : `'${spec}'에 해당하는 몬스터가 근처에 없음`);
  CO.order = { type: 'attack', target: m }; CO.target = m; CO.hint = { x: m.x, y: m.y, t: 2.5, label: m.def.name };
  return { target: m.def.name, level: m.lvl, boss: m.boss, tiles: Math.round(dist(m.x, m.y, S.px, S.py) / TILE), hp: m.hp };
}
function companionSetStance(s) { s = String(s); if (!CO_STANCE[s]) throw new Error('stance는 passive/assist/aggressive 중 하나'); CO.stance = s; if (s === 'passive') CO.order = null; renderCompanionPanel(true); return { stance: s, label: CO_STANCE[s] }; }
function companionComeBack() { CO.order = null; CO.target = null; return { ok: true, distance_tiles: Math.round(dist(CO.x, CO.y, S.px, S.py) / TILE) }; }
function companionHeal() { if (CO.healCd > 0) throw new Error(`재사용 대기 ${Math.ceil(CO.healCd)}초 남음`); const st = getStats(); const h = Math.floor(st.maxHp * 0.3); S.hp = Math.min(st.maxHp, S.hp + h); CO.healCd = 30; floatText(S.px, S.py - 70, `+${h} (렌의 치유)`, '#2ecc40'); burst(S.px, S.py - 30, '#9be89b', 14); renderHUD(); return { healed: h, hp: Math.floor(S.hp), maxHp: st.maxHp }; }
function updateCompanion(dt) {
  CO.healCd = Math.max(0, CO.healCd - dt); CO.lowHpT = Math.max(0, CO.lowHpT - dt); CO.atkCd = Math.max(0, CO.atkCd - dt); CO.atkAnim = Math.max(0, CO.atkAnim - dt);
  if (CO.bubble) { CO.bubble.t += dt; if (CO.bubble.t > CO.bubble.life) CO.bubble = null; }
  const tgt = companionPickTarget(); CO.target = tgt;
  const dp = dist(CO.x, CO.y, S.px, S.py);
  let goal = null;
  if (tgt) {
    const dt2 = dist(CO.x, CO.y, tgt.x, tgt.y), leash = CO.order ? 560 : 380;
    if (dt2 > 230 && dist(tgt.x, tgt.y, S.px, S.py) < leash + 230) goal = { x: tgt.x, y: tgt.y, stop: 210 };
    else if (dp > leash) goal = { x: S.px, y: S.py, stop: 60 };
    if (dt2 <= 260 && CO.atkCd <= 0) {
      CO.atkCd = 1.1; CO.atkAnim = 0.3; CO.facing = tgt.x >= CO.x ? 1 : -1;
      const ang = Math.atan2(tgt.y - 20 - (CO.y - 28), tgt.x - CO.x);
      W.projs.push({ x: CO.x + CO.facing * 8, y: CO.y - 28, vx: Math.cos(ang) * 480, vy: Math.sin(ang) * 480, t: 0, life: 0.9, mine: true, fixed: { dmg: companionDamage(), crit: Math.random() < 0.08 }, color: '#9be89b', emoji: '✦', onhit: m => { if (m.state === 'idle') { m.state = 'chase'; floatText(m.x, m.y - 60, '!', '#ff5555', 0.6); } } });
    }
  }
  if (!goal && !tgt && dp > 70) goal = { x: S.px, y: S.py, stop: 60 };
  if (goal && dist(CO.x, CO.y, goal.x, goal.y) > goal.stop) {
    const ang = Math.atan2(goal.y - CO.y, goal.x - CO.x), sp = dp > 200 ? 270 : 200;
    const nx = CO.x + Math.cos(ang) * sp * dt, ny = CO.y + Math.sin(ang) * sp * dt; let moved = false;
    if (freeCircle(nx, CO.y, 12)) { CO.x = nx; moved = true; } if (freeCircle(CO.x, ny, 12)) { CO.y = ny; moved = true; }
    CO.facing = goal.x >= CO.x ? 1 : -1; CO.moving = moved;
    if (!moved || dp > 640) { CO.stuckT += dt; if (CO.stuckT > 1.2) { CO.x = S.px - P.facing * 40; CO.y = S.py + 8; CO.stuckT = 0; } } else CO.stuckT = 0;
    CO.animT += dt; if (CO.animT > 0.12) { CO.animT = 0; CO.frame = (CO.frame + 1) % 4; }
  } else { CO.moving = false; CO.frame = 0; CO.stuckT = 0; if (!tgt && P.moving) CO.facing = P.facing; }
}
function drawCompanion(ctx) {
  drawHero(ctx, CO.x, CO.y, { race: CO_LOOK.race, cls: CO_LOOK.cls, equip: CO_LOOK.equip, facing: CO.facing, moving: CO.moving, frame: CO.frame, scale: 0.85, attackT: CO.atkAnim > 0 ? 1 - CO.atkAnim / 0.3 : 0 });
  drawLabel(ctx, CO.x, CO.y - 68, `${CO.name} (${CO.order ? '⚔️ ' + CO.order.target.def.name : CO_STANCE[CO.stance]})`, CO.target ? '#ffb347' : '#9be89b', 'bold 11px sans-serif');
  if (CO.bubble) {
    const lines = wrapText(ctx, CO.bubble.text, 190, '13px sans-serif'); const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 20, h = lines.length * 17 + 12;
    const bx = CO.x - w / 2, by = CO.y - 84 - h; const a = CO.bubble.t < 0.15 ? CO.bubble.t / 0.15 : CO.bubble.t > CO.bubble.life - 0.4 ? (CO.bubble.life - CO.bubble.t) / 0.4 : 1;
    ctx.globalAlpha = clamp(a, 0, 1); ctx.fillStyle = '#fffbe6'; ctx.strokeStyle = '#8a6d3b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(bx, by, w, h, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CO.x - 6, by + h); ctx.lineTo(CO.x + 6, by + h); ctx.lineTo(CO.x, by + h + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a1f0e'; ctx.font = '13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; lines.forEach((l, i) => ctx.fillText(l, bx + 10, by + 7 + i * 17)); ctx.globalAlpha = 1;
  }
}
function wrapText(ctx, text, maxW, font) { ctx.font = font; const out = []; let line = ''; for (const ch of text) { if (ch === '\n' || ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch === '\n' ? '' : ch; } else line += ch; } if (line) out.push(line); return out.slice(0, 4); }

// ===== 상황 정보 & 대화 =====
function companionRules() {
  const cls = DATA.classes[S.cls], z = DATA.zones[S.zone], st = getStats();
  const active = []; DATA.zones.forEach(zz => zz.quests.forEach(q => { const s = S.quests[q.id]; if (s && s.status === 'active') active.push(`${q.name}(${questTargetName(q)} ${Math.min(s.progress, q.count)}/${q.count}${s.progress >= q.count ? ', 완료 가능→' + q.giver : ''})`); }));
  const avail = z.quests.filter(q => questAvailable(q)).map(q => q.name);
  const near = W.monsters.filter(m => dist(m.x, m.y, S.px, S.py) < 400).slice(0, 5).map(m => `${m.def.name} Lv${m.lvl}${m.boss ? '(우두머리)' : ''}`);
  const skills = knownAbilities().map((a, i) => `${i + 1}번 ${a.name}(${a.desc})`).join(', ');
  const logs = Array.from($('#log').children).slice(-5).map(d => d.textContent).join(' / ');
  return `너는 브라우저 RPG '아제로스 레전드'의 동료 캐릭터 '렌'이다. 쾌활하고 장난기 있는 나이트 엘프 견습 마법사이며, 플레이어를 '대장'이라고 부른다. 반말로, 2~3문장 이내로 짧게 한국어로만 말한다. 게임 밖 이야기는 게임 세계관에 맞게 받아넘긴다. 대장이 행동을 요구하면(힐/치유, 공격/선공/잡아/쳐, 따라와/돌아와/멈춰, 태세 변경, 어디/길) 말로만 답하지 말고 반드시 해당 도구를 호출한 뒤 결과를 바탕으로 짧게 말한다. 메시지에 '[페이지가 이미 실행한 행동]'이 붙어 있으면 그 행동은 이미 끝난 것이니 다시 호출하지 말고 결과만 말한다.
[게임 규칙] 5개 지역(새벽숲→잿빛 황야→어둠골 습지→서리봉 산맥→불타는 심연). 각 지역 우두머리(은신처, 미니맵 빨간 칸)를 처치해야 동쪽 포탈이 열림. 마을에 📜퀘스트 NPC, 🧑‍🌾상인, 🍺여관(무료 회복+저장). 조작: WASD 이동, Space 공격, 1~6 기술, Q 물약, E 대화. 레벨10부터 특성.
[대장 상태] 이름 ${S.name}, Lv${S.level} ${DATA.races[S.race].name} ${cls.name}(${DATA.resourceInfo[cls.resource].name} 사용), 체력 ${Math.floor(S.hp)}/${st.maxHp}, 골드 ${S.gold}, 물약 ${Object.entries(S.consum).filter(([k, v]) => v > 0 && k.startsWith('hpot')).map(([k, v]) => DATA.consumables[k].name + ' ' + v + '개').join(', ') || '없음'}, 기술: ${skills || '없음'}, 무기: ${S.equip.weapon ? S.equip.weapon.name : '없음(맨손!)'}, 특성 포인트 ${S.talentPts}
[렌 상태] 태세 ${CO_STANCE[CO.stance]}(passive=따라만 다님, assist=대장을 공격하는 적만 공격, aggressive=근처 적을 먼저 공격), 현재 명령: ${CO.order ? CO.order.target.def.name + ' 공격 중' : '없음'}, 치유 ${CO.healCd > 0 ? Math.ceil(CO.healCd) + '초 대기' : '가능'}
[현재 지역] ${z.name}(Lv${z.minLvl}-${z.maxLvl}) 우두머리 ${z.boss.name} Lv${z.boss.lvl} ${S.bossDead[z.id] ? '처치함' : '아직 살아있음'}. 근처 몬스터: ${near.join(', ') || '없음'}
[퀘스트] 진행 중: ${active.join('; ') || '없음'}. 받을 수 있음: ${avail.join(', ') || '없음'}
[최근 로그] ${logs}`;
}
function companionTools() {
  return [
    { name: 'heal_player', description: '렌이 치유 마법으로 대장의 체력을 최대치의 30% 회복시킨다. 재사용 대기 30초. 성공하면 회복 후 체력을, 대기 중이면 남은 초를 돌려준다.', execute: () => companionHeal() },
    { name: 'attack', description: '렌이 지정한 몬스터에게 달려가 마법 화살로 공격을 시작한다(선공/어그로 끌기). target: "nearest"(가장 가까운 적), "boss"(우두머리), 또는 몬스터 이름 일부. 8칸 안에 대상이 없으면 오류.', inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] }, execute: input => companionOrderAttack(input.target) },
    { name: 'set_stance', description: '렌의 전투 태세를 바꾼다. passive=따라만 다님, assist=대장을 공격하는 적만 공격(기본), aggressive=근처 적을 먼저 공격(선공).', inputSchema: { type: 'object', properties: { stance: { type: 'string', enum: ['passive', 'assist', 'aggressive'] } }, required: ['stance'] }, execute: input => companionSetStance(input.stance) },
    { name: 'come_back', description: '렌이 공격을 멈추고 대장 곁으로 돌아온다.', execute: () => companionComeBack() },
    { name: 'find_direction', description: '대장 위치에서 목표까지의 방향과 거리(칸)를 알려준다. target: quest(진행 중 퀘스트 목표 몬스터), boss(우두머리 은신처), portal(다음 지역 포탈), npc(퀘스트 NPC), vendor(상인), inn(여관). 화면에 3초간 화살표도 표시된다.', inputSchema: { type: 'object', properties: { target: { type: 'string', enum: ['quest', 'boss', 'portal', 'npc', 'vendor', 'inn'] } }, required: ['target'] }, execute: input => { const t = String(input.target); let pt = null, label = ''; if (t === 'boss') { pt = { x: (W.lair.x + 0.5) * TILE, y: (W.lair.y + 0.5) * TILE }; label = '우두머리 은신처'; } else if (t === 'portal') { pt = { x: (W.portal.x + 0.5) * TILE, y: (W.portal.y + 0.5) * TILE }; label = '포탈'; } else if (t === 'npc' || t === 'vendor' || t === 'inn') { const n = W.npcs.find(n => n.kind === (t === 'npc' ? 'quest' : t)); pt = { x: n.x, y: n.y }; label = n.name; } else { const targets = []; DATA.zones.forEach(zz => zz.quests.forEach(q => { const s = S.quests[q.id]; if (s && s.status === 'active' && s.progress < q.count) targets.push(q.type === 'collect' ? q.target : q.target); })); let best = null, bd = 1e9; W.monsters.forEach(m => { if (targets.includes(m.def.id) || targets.includes(m.def.drop)) { const d = dist(m.x, m.y, S.px, S.py); if (d < bd) { bd = d; best = m; } } }); if (!best) throw new Error('진행 중인 퀘스트 목표 몬스터가 지금 화면 근처에 없음. 조금 돌아다니면 다시 나타남'); pt = { x: best.x, y: best.y }; label = best.def.name; } const dx = pt.x - S.px, dy = pt.y - S.py; const dirs = []; if (Math.abs(dy) > 40) dirs.push(dy < 0 ? '북' : '남'); if (Math.abs(dx) > 40) dirs.push(dx < 0 ? '서' : '동'); CO.hint = { x: pt.x, y: pt.y, t: 3, label }; return { target: label, direction: dirs.join('') + '쪽' || '바로 옆', tiles: Math.round(Math.hypot(dx, dy) / TILE) }; } },
  ];
}
function companionPreAct(msg) {
  const m = msg.toLowerCase(); const acts = [];
  const run = (label, fn) => { try { const r = fn(); acts.push({ ok: true, label, r }); } catch (e) { acts.push({ ok: false, label, err: e.message }); } };
  if (/힐|치유|회복/.test(m) && !/하지 ?마/.test(m)) run('치유', companionHeal);
  if (/선공/.test(m)) run('태세 변경', () => companionSetStance('aggressive'));
  if (/공격|선공|쳐|잡아|싸워|처치|죽여|attack/.test(m) && !/하지 ?마|그만|멈춰/.test(m)) run('공격 명령', () => companionOrderAttack(/보스|우두머리/.test(m) ? 'boss' : 'nearest'));
  if (/따라와|돌아와|그만|멈춰|물러|후퇴|스톱|stop/.test(m)) { run('복귀', companionComeBack); if (/수동|가만|싸우지/.test(m)) run('태세 변경', () => companionSetStance('passive')); }
  else if (/수동|가만히|싸우지 ?마/.test(m)) run('태세 변경', () => companionSetStance('passive'));
  else if (/보조|지켜|방어|수비/.test(m)) run('태세 변경', () => companionSetStance('assist'));
  return acts;
}
function actsToText(acts) {
  return acts.map(a => {
    if (!a.ok) return `${a.label} 실패: ${a.err}`;
    if (a.label === '치유') return `치유 마법! 체력 ${a.r.healed} 회복 (${a.r.hp}/${a.r.maxHp})`;
    if (a.label === '공격 명령') return `${a.r.target}${a.r.boss ? '(우두머리)' : ''} Lv${a.r.level}에게 돌격! (${a.r.tiles}칸)`;
    if (a.label === '태세 변경') return `태세를 '${a.r.label}'(으)로 바꿨어`;
    if (a.label === '복귀') return '알았어, 대장 옆으로 돌아갈게';
    return a.label;
  }).join('. ');
}
function companionFallback(msg) {
  const m = msg.toLowerCase();
  if (/안녕|hi|hello/.test(m)) return '안녕, 대장! 오늘은 어디로 갈까?';
  if (/체력|아파|피/.test(m)) { try { const r = companionHeal(); return `치유 마법! 체력 ${r.healed} 회복했어.`; } catch (e) { return `치유는 ${Math.ceil(CO.healCd)}초 뒤에 다시 쓸 수 있어. 물약(Q) 마셔!`; } }
  if (/보스|우두머리/.test(m)) { const z = DATA.zones[S.zone]; return S.bossDead[z.id] ? '이 지역 우두머리는 이미 잡았잖아! 동쪽 포탈로 가자.' : `${z.boss.name}(Lv${z.boss.lvl})은 미니맵 빨간 칸, 지도 오른쪽 위 은신처에 있어. 권장 레벨 ${z.boss.lvl - 1} 이상이야.`; }
  if (/퀘스트|의뢰|뭐 해|뭐해|할 일/.test(m)) { const act = []; DATA.zones.forEach(zz => zz.quests.forEach(q => { const s = S.quests[q.id]; if (s && s.status === 'active') act.push(`${q.name} ${Math.min(s.progress, q.count)}/${q.count}`); })); return act.length ? `진행 중: ${act.join(', ')}. 힘내!` : '받은 퀘스트가 없어. 마을의 📜 NPC한테 가서 E를 눌러봐!'; }
  if (/어디|길|방향/.test(m)) return '퀘스트 NPC는 마을 위쪽, 상인은 왼쪽 아래, 여관은 오른쪽 아래, 우두머리는 지도 오른쪽 위 은신처야.';
  if (/장비|아이템|무기/.test(m)) return S.equip.weapon ? '가방(I) 열어서 더 좋은 장비 있으면 갈아입어. 보라색이 제일 좋아!' : '무기가 없잖아! 가방(I)에서 장착하거나 상인한테 사자.';
  return '음... 그건 잘 모르겠어. (LLM 대화는 claude.ai에서 열었을 때만 돼! 지금은 대본으로만 대답해.)';
}
async function companionChat(msg) {
  msg = msg.trim(); if (!msg || CO.busy) return;
  const list = $('#co-msgs'); addChatMsg('me', msg);
  const acts = companionPreAct(msg); const actText = acts.length ? actsToText(acts) : '';
  if (!CO.sample) { const r = actText ? actText + '.' : companionFallback(msg); addChatMsg('co', r); companionSay(r.slice(0, 50), 6); return; }
  CO.busy = true; CO.ctl = new AbortController(); const el = addChatMsg('co', '생각 중...'); el.classList.add('pending'); renderCompanionPanel(true);
  const userMsg = actText ? `${msg}\n[페이지가 이미 실행한 행동] ${actText}` : msg;
  const turns = [{ role: 'user', content: companionRules() }, ...CO.turns.slice(-10), { role: 'user', content: userMsg }];
  try {
    const r = await CO.sample(turns, { modelTier: 'quick', signal: CO.ctl.signal, tools: companionTools(), onText: ({ text }) => { el.textContent = text; el.classList.remove('pending'); list.scrollTop = list.scrollHeight; } });
    const text = r.text.trim(); el.textContent = text; el.classList.remove('pending'); CO.turns.push({ role: 'user', content: msg }, { role: 'assistant', content: text }); companionSay(text.split('\n').pop().slice(0, 60), 6);
  } catch (e) {
    const code = e && e.code; const keep = e && e.text;
    if (code === 'cancelled') { el.textContent = keep || '(중단)'; }
    else if (code === 'not_granted' || code === 'sampling_disabled' || code === 'not_declared' || code === 'capability_disabled') { CO.sample = null; el.textContent = companionFallback(msg); }
    else if (code === 'rate_limited') el.textContent = '헉, 너무 빨리 말 걸었어. 잠깐 쉬었다 다시 물어봐!';
    else if (code === 'refused') el.textContent = '그건 대답하기 곤란해... 다른 걸 물어봐!';
    else el.textContent = (keep ? keep + ' ' : '') + '(연결이 끊겼어. 다시 보내봐!)';
    el.classList.remove('pending');
  } finally { CO.busy = false; CO.ctl = null; renderCompanionPanel(true); list.scrollTop = list.scrollHeight; }
}
function addChatMsg(who, text) { const list = $('#co-msgs'); const d = document.createElement('div'); d.className = 'cm ' + who; d.textContent = text; list.appendChild(d); while (list.children.length > 40) list.removeChild(list.firstChild); list.scrollTop = list.scrollHeight; return d; }
function renderCompanionPanel(keep) {
  const head = $('#co-head'); if (!head) return;
  const mode = !CO.sampleReady ? '연결 확인 중...' : CO.sample ? '🟢 LLM 대화 (Claude)' : '⚪ 대본 대화 (claude.ai에서 열면 LLM)';
  head.innerHTML = `<canvas id="co-preview" width="56" height="70"></canvas><div><b>렌</b> <span class="muted small">나이트 엘프 견습 마법사</span><div class="small muted">${mode}</div><div class="stance">${Object.entries(CO_STANCE).map(([k, v]) => `<button class="sm ${CO.stance === k ? 'on' : ''}" data-stance="${k}">${v}</button>`).join('')}<button class="sm" id="co-atk">⚔️ 선공!</button></div><label class="small"><input type="checkbox" id="co-auto" ${CO.autoLLM ? 'checked' : ''} ${CO.sample ? '' : 'disabled'}> 이벤트 반응도 LLM으로 (사용량 소모)</label></div>`;
  $('#co-auto').onchange = e => { CO.autoLLM = e.target.checked; };
  head.querySelectorAll('[data-stance]').forEach(b => b.onclick = () => { companionSetStance(b.dataset.stance); companionSay(`태세: ${CO_STANCE[CO.stance]}`, 2); });
  $('#co-atk').onclick = () => { try { const r = companionOrderAttack('nearest'); companionSay(`${r.target}에게 돌격!`, 3); } catch (e) { companionSay('근처에 적이 없어!', 2.5); } };
  const cv = $('#co-preview'); const ctx = cv.getContext('2d'); drawHero(ctx, 28, 62, { ...CO_LOOK, scale: 0.75, facing: 1 });
  $('#co-send').disabled = CO.busy; $('#co-stop').style.display = CO.busy ? '' : 'none';
  if (!keep && CO.sampleReady && !$('#co-msgs').children.length) addChatMsg('co', CO.sample ? '안녕, 대장! 뭐든 물어봐. 힐도 해주고 길도 알려줄게.' : '안녕! 지금은 대본으로만 대답할 수 있어. 힐, 퀘스트, 보스, 길 같은 걸 물어봐.');
}
function drawCompanionHint(ctx) {
  if (!CO.hint) return; CO.hint.t -= 1 / 60; if (CO.hint.t <= 0) { CO.hint = null; return; }
  const ang = Math.atan2(CO.hint.y - S.py, CO.hint.x - S.px); const ax = S.px + Math.cos(ang) * 70, ay = S.py - 30 + Math.sin(ang) * 70;
  ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang); ctx.fillStyle = '#ffd100'; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-4, 0); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill(); ctx.restore();
  drawLabel(ctx, ax, ay - 22, `${CO.hint.label} →`, '#ffd100');
}
