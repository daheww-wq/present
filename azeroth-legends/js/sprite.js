// ===== 캐릭터 스프라이트 (장비 반영) =====
'use strict';
const SPR = {
  skin: { human: '#f1c27d', dwarf: '#e8b88a', nightelf: '#b48be0', orc: '#7cb35e', undead: '#9aa5b1', troll: '#6fb7b0' },
  hair: { human: '#5a3a1a', dwarf: '#c0392b', nightelf: '#2e8b57', orc: '#1a1a1a', undead: '#3a3f46', troll: '#e74c3c' },
  chest: ['#8a6d4b', '#7a4f2a', '#8c8c94', '#c9ccd6', '#b03a2e'],
  legs: ['#6b5a45', '#5c3d21', '#7d7d85', '#b5b8c2'],
  feet: ['#4a3b2e', '#3c2a1c', '#6f6f78', '#5ec8e8'],
  rarityGlow: { common: null, uncommon: '#1eff00', rare: '#0070dd', epic: '#a335ee' },
};
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16); let r = (n >> 16) + amt, g = (n >> 8 & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
// cx, cy: 발 밑 중심. scale: 1 = 약 56px 높이. frame: 걷기 프레임(0..3). facing: 1 오른쪽, -1 왼쪽
function drawHero(ctx, cx, cy, o) {
  const sc = o.scale || 1, race = o.race, cls = DATA.classes[o.cls], eq = o.equip || {};
  const skin = SPR.skin[race], hair = SPR.hair[race];
  const walking = o.moving, f = o.frame || 0;
  const legSwing = walking ? [4, 0, -4, 0][f % 4] : 0;
  const bob = walking ? [0, -1, 0, -1][f % 4] : 0;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sc * (o.facing || 1), sc);
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 2, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
  // 오라 (영웅 장비)
  const epic = Object.values(eq).some(it => it && it.rarity === 'epic');
  if (epic) { const g = ctx.createRadialGradient(0, -26, 4, 0, -26, 34); g.addColorStop(0, 'rgba(163,53,238,0.35)'); g.addColorStop(1, 'rgba(163,53,238,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -26, 34, 0, Math.PI * 2); ctx.fill(); }
  ctx.translate(0, bob);
  // 다리
  const legC = eq.legs ? SPR.legs[Math.min(eq.legs.tier || 0, SPR.legs.length - 1)] : '#4b3d30';
  const footC = eq.feet ? SPR.feet[Math.min(eq.feet.tier || 0, SPR.feet.length - 1)] : shade(skin, -40);
  px(-9, -18, 8, 14 + legSwing / 2, legC); px(1, -18, 8, 14 - legSwing / 2, legC);
  px(-10, -5 + legSwing / 2, 10, 5, footC); px(0, -5 - legSwing / 2, 10, 5, footC);
  // 몸통
  const chestC = eq.chest ? SPR.chest[Math.min(eq.chest.tier || 0, SPR.chest.length - 1)] : shade(cls.color, -60);
  px(-11, -38, 22, 21, chestC); px(-11, -38, 22, 3, shade(chestC, 30)); px(-3, -36, 6, 17, shade(chestC, -25));
  if (eq.chest && (eq.chest.tier || 0) >= 2) { px(-11, -38, 22, 2, shade(chestC, 60)); px(-12, -37, 4, 8, shade(chestC, 40)); px(8, -37, 4, 8, shade(chestC, 40)); }
  // 팔
  px(-15, -36, 5, 14, chestC); px(-15, -23, 5, 5, skin);
  px(10, -36, 5, 14, chestC); px(10, -23, 5, 5, skin);
  // 머리
  px(-9, -56, 18, 18, skin);
  if (race === 'undead') { px(-6, -50, 4, 4, '#2b2f36'); px(3, -50, 4, 4, '#2b2f36'); px(-4, -42, 9, 2, '#2b2f36'); }
  else { px(-6, -49, 3, 3, '#1a1a1a'); px(4, -49, 3, 3, '#1a1a1a'); px(-2, -42, 6, 1, shade(skin, -60)); }
  if (race === 'nightelf') { px(-13, -52, 4, 6, skin); px(10, -52, 4, 6, skin); }
  if (race === 'orc') { px(-5, -41, 2, 3, '#fff'); px(4, -41, 2, 3, '#fff'); }
  if (race === 'troll') { px(-7, -41, 3, 4, '#fff'); px(5, -41, 3, 4, '#fff'); }
  // 머리카락 / 투구
  const head = eq.head, ht = head ? (head.tier || 0) : -1;
  if (ht < 0) {
    if (race === 'troll') px(-3, -66, 6, 12, hair);
    else if (race === 'undead') px(-9, -58, 18, 4, hair);
    else { px(-10, -59, 20, 6, hair); px(-10, -55, 3, 8, hair); px(8, -55, 3, 8, hair); }
    if (race === 'dwarf') { px(-8, -42, 16, 8, hair); }
  } else if (ht === 0) { px(-10, -60, 20, 8, '#6b4a2a'); px(-11, -54, 22, 3, '#6b4a2a'); }
  else if (ht === 1) { px(-10, -60, 20, 10, '#9a9aa5'); px(-10, -52, 20, 2, '#6f6f78'); px(-2, -64, 4, 5, '#c0392b'); }
  else if (ht === 2) { px(-12, -57, 24, 4, '#2f5fb3'); px(-8, -68, 16, 11, '#2f5fb3'); px(-4, -76, 8, 8, '#2f5fb3'); px(-1, -72, 3, 3, '#ffd100'); }
  else if (ht === 3) { px(-10, -60, 20, 10, '#8e2b22'); px(-14, -66, 4, 9, '#e8d5a3'); px(10, -66, 4, 9, '#e8d5a3'); }
  else { px(-10, -59, 20, 4, '#ffd100'); px(-10, -64, 4, 5, '#ffd100'); px(-2, -65, 4, 6, '#ffd100'); px(6, -64, 4, 5, '#ffd100'); px(-1, -63, 2, 2, '#e74c3c'); }
  // 무기 (오른손: 화면 기준 앞쪽)
  const w = eq.weapon, wc = w ? (SPR.rarityGlow[w.rarity] || '#c8ccd4') : null;
  const type = ['warrior', 'paladin'].includes(o.cls) ? 'sword' : ['mage', 'priest'].includes(o.cls) ? 'staff' : o.cls === 'hunter' ? 'bow' : 'dagger';
  if (w) {
    const swing = o.attackT ? Math.sin(o.attackT * Math.PI) * 20 : 0;
    ctx.save(); ctx.translate(13, -22); ctx.rotate((-30 + swing * 3) * Math.PI / 180);
    if (type === 'sword') { px(-1.5, -30, 3, 30, wc); px(-1.5, -30, 3, 30, 'rgba(255,255,255,0.25)'); px(-5, -2, 10, 3, '#8a6d3b'); px(-1.5, 1, 3, 8, '#5a3a1a'); }
    else if (type === 'dagger') { px(-1.5, -16, 3, 16, wc); px(-4, -1, 8, 2, '#8a6d3b'); px(-1.5, 1, 3, 6, '#5a3a1a'); }
    else if (type === 'staff') { px(-1.5, -34, 3, 46, '#7a4f2a'); ctx.fillStyle = wc; ctx.beginPath(); ctx.arc(0, -36, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(-1.5, -37.5, 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.strokeStyle = '#7a4f2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -8, 16, -Math.PI / 2, Math.PI / 2); ctx.stroke(); ctx.strokeStyle = wc; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, 8); ctx.stroke(); }
    ctx.restore();
  }
  // 장신구
  if (eq.trinket) { ctx.fillStyle = SPR.rarityGlow[eq.trinket.rarity] || '#ddd'; ctx.beginPath(); ctx.arc(0, -35, 2.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
