// ===== 게임 데이터 정의 =====
const DATA = {};

DATA.races = {
  human:    { name: '인간',       faction: '얼라이언스', emoji: '🧑', bonus: { str: 1, int: 1, sta: 1 }, desc: '균형 잡힌 능력치. 모든 직업에 무난합니다.' },
  dwarf:    { name: '드워프',     faction: '얼라이언스', emoji: '🧔', bonus: { sta: 3 }, desc: '체력이 높아 잘 죽지 않습니다.' },
  nightelf: { name: '나이트 엘프', faction: '얼라이언스', emoji: '🧝', bonus: { agi: 3 }, desc: '민첩이 높아 치명타가 잘 터집니다.' },
  orc:      { name: '오크',       faction: '호드',       emoji: '👹', bonus: { str: 3 }, desc: '힘이 강해 근접 피해가 높습니다.' },
  undead:   { name: '언데드',     faction: '호드',       emoji: '🧟', bonus: { int: 3 }, desc: '지능이 높아 마법 피해와 마나가 높습니다.' },
  troll:    { name: '트롤',       faction: '호드',       emoji: '🧌', bonus: { agi: 2, str: 1 }, desc: '민첩과 힘을 겸비했습니다.' },
};

// 자원: rage(분노, 0에서 시작, 공격/피격 시 증가), mana(마나), energy(기력, 매 턴 회복)
DATA.classes = {
  warrior: {
    name: '전사', emoji: '⚔️', resource: 'rage', primary: 'str', color: '#c79c6e',
    base: { str: 8, agi: 4, int: 2, sta: 8 }, perLevel: { str: 2, agi: 1, int: 0, sta: 2 },
    desc: '분노를 모아 강력한 근접 공격을 퍼붓는 탱커/딜러.',
    abilities: [
      { id: 'heroic', name: '영웅의 일격', lvl: 1, cost: 15, cd: 0, type: 'dmg', mult: 1.5, desc: '무기 피해의 150%를 입힙니다.' },
      { id: 'shieldblock', name: '방패 막기', lvl: 4, cost: 10, cd: 3, type: 'shield', mult: 1.2, desc: '공격력의 120%만큼 피해를 흡수하는 보호막.' },
      { id: 'thunder', name: '천둥벼락', lvl: 8, cost: 20, cd: 2, type: 'dot', mult: 0.5, turns: 3, desc: '3턴 동안 매 턴 피해를 입힙니다.' },
      { id: 'charge', name: '돌진', lvl: 12, cost: 0, cd: 4, type: 'stun', mult: 0.8, desc: '적을 1턴 기절시키고 피해를 줍니다. 분노 20 획득.', gain: 20 },
      { id: 'mortal', name: '필사의 일격', lvl: 18, cost: 30, cd: 2, type: 'dmg', mult: 2.6, desc: '치명적인 일격. 무기 피해의 260%.' },
      { id: 'bloodthirst', name: '피의 갈증', lvl: 24, cost: 25, cd: 3, type: 'drain', mult: 2.0, desc: '피해의 50%만큼 체력을 회복합니다.' },
    ],
    specs: [
      { id: 'arms', name: '무기', desc: '모든 피해 +3%/pt', stat: 'dmg', per: 0.03 },
      { id: 'fury', name: '분노', desc: '치명타 확률 +2%/pt', stat: 'crit', per: 2 },
      { id: 'prot', name: '방어', desc: '방어도 +8%/pt', stat: 'armor', per: 0.08 },
    ],
  },
  mage: {
    name: '마법사', emoji: '🔮', resource: 'mana', primary: 'int', color: '#69ccf0',
    base: { str: 2, agi: 3, int: 10, sta: 4 }, perLevel: { str: 0, agi: 1, int: 3, sta: 1 },
    desc: '강력한 화염과 냉기 마법으로 적을 태워버리는 원거리 딜러.',
    abilities: [
      { id: 'fireball', name: '화염구', lvl: 1, cost: 15, cd: 0, type: 'dmg', mult: 1.7, desc: '주문력의 170% 화염 피해.' },
      { id: 'frostbolt', name: '서리 화살', lvl: 4, cost: 18, cd: 1, type: 'slow', mult: 1.3, turns: 2, desc: '피해를 주고 2턴간 적 피해 -30%.' },
      { id: 'iceblock', name: '얼음 보호막', lvl: 8, cost: 25, cd: 4, type: 'shield', mult: 1.8, desc: '주문력의 180% 피해를 흡수.' },
      { id: 'blast', name: '불덩이 작렬', lvl: 12, cost: 30, cd: 2, type: 'dmg', mult: 2.8, desc: '엄청난 화염 피해.' },
      { id: 'living', name: '살아있는 폭탄', lvl: 18, cost: 28, cd: 3, type: 'dot', mult: 0.9, turns: 3, desc: '3턴간 매 턴 화염 피해.' },
      { id: 'pyro', name: '불기둥', lvl: 24, cost: 45, cd: 4, type: 'dmg', mult: 4.2, desc: '궁극의 화염 마법.' },
    ],
    specs: [
      { id: 'fire', name: '화염', desc: '모든 피해 +4%/pt', stat: 'dmg', per: 0.04 },
      { id: 'frost', name: '냉기', desc: '치명타 +2%/pt', stat: 'crit', per: 2 },
      { id: 'arcane', name: '비전', desc: '최대 마나 +8%/pt', stat: 'mana', per: 0.08 },
    ],
  },
  priest: {
    name: '사제', emoji: '✨', resource: 'mana', primary: 'int', color: '#ffffff',
    base: { str: 2, agi: 2, int: 9, sta: 6 }, perLevel: { str: 0, agi: 0, int: 3, sta: 2 },
    desc: '신성한 치유와 암흑 마법을 오가는 생존력 높은 캐스터.',
    abilities: [
      { id: 'smite', name: '성스러운 일격', lvl: 1, cost: 12, cd: 0, type: 'dmg', mult: 1.4, desc: '신성 피해를 입힙니다.' },
      { id: 'renew', name: '소생', lvl: 4, cost: 20, cd: 2, type: 'heal', mult: 1.8, desc: '주문력의 180%만큼 치유.' },
      { id: 'swp', name: '어둠의 권능: 고통', lvl: 8, cost: 18, cd: 1, type: 'dot', mult: 0.7, turns: 4, desc: '4턴간 암흑 피해.' },
      { id: 'pws', name: '신의 권능: 보호막', lvl: 12, cost: 25, cd: 3, type: 'shield', mult: 2.0, desc: '강력한 보호막.' },
      { id: 'mindblast', name: '정신 분열', lvl: 18, cost: 30, cd: 2, type: 'dmg', mult: 2.6, desc: '정신 피해.' },
      { id: 'holyfire', name: '신성한 불꽃', lvl: 24, cost: 40, cd: 3, type: 'drain', mult: 2.4, desc: '피해의 50%만큼 회복.' },
    ],
    specs: [
      { id: 'holy', name: '신성', desc: '치유량 +6%/pt', stat: 'heal', per: 0.06 },
      { id: 'shadow', name: '암흑', desc: '모든 피해 +4%/pt', stat: 'dmg', per: 0.04 },
      { id: 'disc', name: '수양', desc: '방어도 +6%/pt', stat: 'armor', per: 0.06 },
    ],
  },
  rogue: {
    name: '도적', emoji: '🗡️', resource: 'energy', primary: 'agi', color: '#fff569',
    base: { str: 5, agi: 9, int: 2, sta: 6 }, perLevel: { str: 1, agi: 3, int: 0, sta: 1 },
    desc: '기력을 사용해 빠르고 치명적인 연속 공격을 가하는 암살자.',
    abilities: [
      { id: 'sinister', name: '사악한 일격', lvl: 1, cost: 35, cd: 0, type: 'dmg', mult: 1.4, desc: '빠른 근접 공격.' },
      { id: 'evis', name: '절개', lvl: 4, cost: 50, cd: 1, type: 'dmg', mult: 2.2, desc: '강력한 마무리 일격.' },
      { id: 'kidney', name: '급소 가격', lvl: 8, cost: 40, cd: 3, type: 'stun', mult: 0.6, desc: '적을 1턴 기절시킵니다.' },
      { id: 'evasion', name: '회피', lvl: 12, cost: 30, cd: 4, type: 'shield', mult: 1.6, desc: '피해를 흡수합니다.' },
      { id: 'rupture', name: '파열', lvl: 18, cost: 45, cd: 2, type: 'dot', mult: 0.8, turns: 4, desc: '4턴간 출혈 피해.' },
      { id: 'ambush', name: '매복', lvl: 24, cost: 60, cd: 3, type: 'dmg', mult: 3.8, desc: '치명타 확률 +50%인 강습.', critBonus: 50 },
    ],
    specs: [
      { id: 'assass', name: '암살', desc: '치명타 +3%/pt', stat: 'crit', per: 3 },
      { id: 'combat', name: '전투', desc: '모든 피해 +3%/pt', stat: 'dmg', per: 0.03 },
      { id: 'sub', name: '잠행', desc: '방어도 +6%/pt', stat: 'armor', per: 0.06 },
    ],
  },
  hunter: {
    name: '사냥꾼', emoji: '🏹', resource: 'mana', primary: 'agi', color: '#abd473',
    base: { str: 4, agi: 8, int: 5, sta: 6 }, perLevel: { str: 1, agi: 3, int: 1, sta: 1 },
    desc: '충직한 야수와 함께 원거리에서 적을 사냥합니다.',
    abilities: [
      { id: 'arcaneshot', name: '신비한 사격', lvl: 1, cost: 12, cd: 0, type: 'dmg', mult: 1.5, desc: '비전 피해가 실린 화살.' },
      { id: 'serpent', name: '독사 쐐기', lvl: 4, cost: 15, cd: 1, type: 'dot', mult: 0.6, turns: 4, desc: '4턴간 독 피해.' },
      { id: 'pet', name: '야수 명령', lvl: 8, cost: 20, cd: 3, type: 'dot', mult: 0.9, turns: 3, desc: '야수가 3턴간 적을 물어뜯습니다.' },
      { id: 'trap', name: '얼음 덫', lvl: 12, cost: 18, cd: 4, type: 'stun', mult: 0.5, desc: '적을 1턴 얼립니다.' },
      { id: 'multishot', name: '일제 사격', lvl: 18, cost: 28, cd: 2, type: 'dmg', mult: 2.5, desc: '여러 발을 동시에 쏩니다.' },
      { id: 'aimed', name: '조준 사격', lvl: 24, cost: 40, cd: 3, type: 'dmg', mult: 3.8, desc: '치명타 확률 +30%.', critBonus: 30 },
    ],
    specs: [
      { id: 'bm', name: '야수', desc: '지속 피해 +10%/pt', stat: 'dot', per: 0.10 },
      { id: 'mm', name: '사격', desc: '치명타 +3%/pt', stat: 'crit', per: 3 },
      { id: 'surv', name: '생존', desc: '최대 체력 +5%/pt', stat: 'hp', per: 0.05 },
    ],
  },
  paladin: {
    name: '성기사', emoji: '🛡️', resource: 'mana', primary: 'str', color: '#f58cba',
    base: { str: 7, agi: 2, int: 5, sta: 8 }, perLevel: { str: 2, agi: 0, int: 1, sta: 2 },
    desc: '빛의 힘으로 자신을 치유하며 싸우는 성전사.',
    abilities: [
      { id: 'judge', name: '심판', lvl: 1, cost: 10, cd: 0, type: 'dmg', mult: 1.5, desc: '신성 피해.' },
      { id: 'fol', name: '빛의 섬광', lvl: 4, cost: 18, cd: 1, type: 'heal', mult: 1.5, desc: '빠른 치유.' },
      { id: 'cons', name: '신성화', lvl: 8, cost: 22, cd: 2, type: 'dot', mult: 0.6, turns: 3, desc: '3턴간 신성 피해.' },
      { id: 'ds', name: '신의 보호막', lvl: 12, cost: 30, cd: 5, type: 'shield', mult: 2.5, desc: '거대한 보호막.' },
      { id: 'hammer', name: '정의의 망치', lvl: 18, cost: 25, cd: 3, type: 'stun', mult: 1.2, desc: '적을 1턴 기절.' },
      { id: 'wrath', name: '응징의 격노', lvl: 24, cost: 40, cd: 3, type: 'drain', mult: 2.8, desc: '피해의 50%만큼 회복.' },
    ],
    specs: [
      { id: 'holy', name: '신성', desc: '치유량 +6%/pt', stat: 'heal', per: 0.06 },
      { id: 'prot', name: '보호', desc: '방어도 +8%/pt', stat: 'armor', per: 0.08 },
      { id: 'ret', name: '징벌', desc: '모든 피해 +3%/pt', stat: 'dmg', per: 0.03 },
    ],
  },
};

DATA.resourceInfo = {
  rage:   { name: '분노', color: '#c41f3b', max: 100 },
  mana:   { name: '마나', color: '#0070dd' },
  energy: { name: '기력', color: '#ffd100', max: 100 },
};

DATA.rarity = {
  common:   { name: '일반', color: '#ffffff', mult: 1.0, chance: 0.60 },
  uncommon: { name: '고급', color: '#1eff00', mult: 1.35, chance: 0.28 },
  rare:     { name: '희귀', color: '#0070dd', mult: 1.8, chance: 0.10 },
  epic:     { name: '영웅', color: '#a335ee', mult: 2.5, chance: 0.02 },
};

DATA.slots = {
  weapon: { name: '무기', emoji: '🗡️' }, head: { name: '머리', emoji: '🪖' }, chest: { name: '가슴', emoji: '🥋' },
  legs: { name: '다리', emoji: '👖' }, feet: { name: '발', emoji: '🥾' }, trinket: { name: '장신구', emoji: '💍' },
};

DATA.itemNames = {
  weapon: ['녹슨 검', '나무 지팡이', '사냥용 활', '강철 도끼', '룬 새김 검', '용의 이빨 단검', '서리한 검', '불꽃의 지팡이'],
  head: ['가죽 두건', '철제 투구', '마법사의 모자', '용비늘 투구', '왕관'],
  chest: ['누더기 옷', '가죽 갑옷', '사슬 갑옷', '판금 갑옷', '용비늘 흉갑'],
  legs: ['천 바지', '가죽 각반', '사슬 각반', '판금 다리보호대'],
  feet: ['닳은 신발', '가죽 장화', '철제 장화', '바람의 장화'],
  trinket: ['구리 반지', '은 목걸이', '호랑이 눈 반지', '불사조 깃털', '고대의 부적'],
};

DATA.consumables = {
  hpot_s: { name: '하급 치유 물약', emoji: '🧪', heal: 60, price: 15, desc: '체력 60 회복' },
  hpot_m: { name: '치유 물약', emoji: '🧪', heal: 180, price: 60, desc: '체력 180 회복' },
  hpot_l: { name: '상급 치유 물약', emoji: '🧪', heal: 450, price: 180, desc: '체력 450 회복' },
  mpot_s: { name: '하급 마나 물약', emoji: '💧', mana: 50, price: 15, desc: '마나/기력 50 회복' },
  mpot_m: { name: '마나 물약', emoji: '💧', mana: 150, price: 60, desc: '마나/기력 150 회복' },
  bread:  { name: '갓 구운 빵', emoji: '🍞', heal: 40, price: 5, desc: '체력 40 회복 (전투 밖에서만)' },
};

// ===== 지역 =====
// 몬스터: hp, dmg는 기본값(레벨에 따라 스케일). abil: 적 특수 능력.
DATA.zones = [
  {
    id: 'dawnwood', name: '새벽숲', minLvl: 1, maxLvl: 6, theme: { grass: '#4a7c3f', tree: '#2d5a27', water: '#3b6fa0', road: '#a08a5c', dark: '#3a6132' },
    intro: '평화로운 새벽숲. 하지만 최근 늑대 떼와 붉은가면 도적단이 마을을 위협하고 있습니다.',
    monsters: [
      { id: 'wolf', name: '굶주린 늑대', emoji: '🐺', lvl: [1, 3], hp: 35, dmg: 6, xp: 30, gold: [1, 4], drop: 'wolfpelt' },
      { id: 'kobold', name: '코볼트 광부', emoji: '👺', lvl: [2, 4], hp: 45, dmg: 7, xp: 40, gold: [2, 6], abil: 'candle', drop: 'candle' },
      { id: 'bandit', name: '붉은가면 도적', emoji: '🥷', lvl: [3, 6], hp: 60, dmg: 9, xp: 55, gold: [4, 10], abil: 'backstab', drop: 'redmask' },
    ],
    boss: { id: 'grak', name: '도적 두목 그락', emoji: '👿', lvl: 7, hp: 320, dmg: 16, xp: 400, gold: [40, 60], abil: 'cleave', boss: true },
    quests: [
      { id: 'q_wolf', name: '늑대 소탕', giver: '경비대장 마커스', type: 'kill', target: 'wolf', count: 6, xp: 150, gold: 20, text: '늑대들이 가축을 물어가고 있소. 굶주린 늑대 6마리를 처치해 주시오.', reward: { slot: 'weapon', rarity: 'uncommon' } },
      { id: 'q_candle', name: '빛나는 양초', giver: '경비대장 마커스', type: 'collect', target: 'candle', count: 4, xp: 200, gold: 30, text: '코볼트들이 광산의 양초를 훔쳐갔소. 커다란 양초 4개를 회수해 주시오.', reward: { slot: 'chest', rarity: 'uncommon' }, req: 'q_wolf' },
      { id: 'q_grak', name: '붉은가면의 두목', giver: '경비대장 마커스', type: 'kill', target: 'grak', count: 1, xp: 500, gold: 80, text: '도적단의 두목 그락이 숲 동쪽 은신처에 있소. 그를 처치하면 숲에 평화가 올 것이오.', reward: { slot: 'trinket', rarity: 'rare' }, req: 'q_candle' },
    ],
  },
  {
    id: 'barrens', name: '잿빛 황야', minLvl: 6, maxLvl: 12, theme: { grass: '#a8894a', tree: '#6e6a32', water: '#4a7fa8', road: '#c9b07a', dark: '#8d7340' },
    intro: '메마른 잿빛 황야. 켄타우로스 약탈자들이 대상단을 습격하고 하피들이 하늘을 맴돕니다.',
    monsters: [
      { id: 'boar', name: '가시멧돼지', emoji: '🐗', lvl: [6, 8], hp: 110, dmg: 14, xp: 80, gold: [5, 12], abil: 'charge', drop: 'tusk' },
      { id: 'centaur', name: '켄타우로스 약탈자', emoji: '🏇', lvl: [8, 10], hp: 150, dmg: 18, xp: 110, gold: [8, 18], abil: 'volley', drop: 'bracer' },
      { id: 'harpy', name: '바람발톱 하피', emoji: '🦅', lvl: [9, 12], hp: 170, dmg: 21, xp: 130, gold: [10, 20], abil: 'screech', drop: 'feather' },
    ],
    boss: { id: 'harpyqueen', name: '하피 여왕 세레나', emoji: '🦚', lvl: 13, hp: 900, dmg: 34, xp: 1000, gold: [100, 150], abil: 'screech', boss: true },
    quests: [
      { id: 'q_boar', name: '멧돼지 사냥', giver: '대상단장 자이라', type: 'kill', target: 'boar', count: 8, xp: 350, gold: 50, text: '멧돼지들이 우리 짐꾼들을 들이받고 있어요. 8마리를 처치해 주세요.', reward: { slot: 'legs', rarity: 'uncommon' } },
      { id: 'q_bracer', name: '약탈자의 팔보호구', giver: '대상단장 자이라', type: 'collect', target: 'bracer', count: 5, xp: 450, gold: 70, text: '켄타우로스에게 빼앗긴 팔보호구 5개를 되찾아 주세요.', reward: { slot: 'feet', rarity: 'rare' }, req: 'q_boar' },
      { id: 'q_queen', name: '하늘의 여왕', giver: '대상단장 자이라', type: 'kill', target: 'harpyqueen', count: 1, xp: 1200, gold: 200, text: '하피 여왕 세레나가 황야 동쪽 절벽 둥지에 있어요. 그녀를 처치하면 하늘길이 열릴 거예요.', reward: { slot: 'weapon', rarity: 'rare' }, req: 'q_bracer' },
    ],
  },
  {
    id: 'duskmire', name: '어둠골 습지', minLvl: 12, maxLvl: 18, theme: { grass: '#3f5a3a', tree: '#233a20', water: '#2a4f4a', road: '#6d6a4a', dark: '#2e4530' },
    intro: '안개 자욱한 습지. 나가 부족이 고대 사원을 점령하고 검은 의식을 준비하고 있습니다.',
    monsters: [
      { id: 'spider', name: '독송곳니 거미', emoji: '🕷️', lvl: [12, 14], hp: 260, dmg: 26, xp: 180, gold: [12, 25], abil: 'poison', drop: 'venom' },
      { id: 'bogbeast', name: '늪지 괴물', emoji: '🌿', lvl: [13, 16], hp: 340, dmg: 30, xp: 220, gold: [15, 30], abil: 'regen', drop: 'moss' },
      { id: 'naga', name: '나가 주술사', emoji: '🐍', lvl: [15, 18], hp: 380, dmg: 36, xp: 270, gold: [20, 40], abil: 'bolt', drop: 'scale' },
    ],
    boss: { id: 'nagapriest', name: '나가 해신관 아자라', emoji: '🧜', lvl: 19, hp: 2200, dmg: 58, xp: 2500, gold: [250, 350], abil: 'tidal', boss: true },
    quests: [
      { id: 'q_spider', name: '거미줄 제거', giver: '늪지 은둔자 엘드린', type: 'kill', target: 'spider', count: 8, xp: 700, gold: 100, text: '거미들이 길을 막고 있네. 독송곳니 거미 8마리를 처치해 주게.', reward: { slot: 'head', rarity: 'rare' } },
      { id: 'q_scale', name: '나가의 비늘', giver: '늪지 은둔자 엘드린', type: 'collect', target: 'scale', count: 6, xp: 900, gold: 140, text: '나가의 비늘 6개가 있으면 의식을 막을 부적을 만들 수 있네.', reward: { slot: 'chest', rarity: 'rare' }, req: 'q_spider' },
      { id: 'q_naga', name: '해신관의 최후', giver: '늪지 은둔자 엘드린', type: 'kill', target: 'nagapriest', count: 1, xp: 2800, gold: 400, text: '해신관 아자라가 사원 깊숙한 곳에서 의식을 진행 중이네. 늦기 전에 막아주게.', reward: { slot: 'trinket', rarity: 'epic' }, req: 'q_scale' },
    ],
  },
  {
    id: 'frostpeak', name: '서리봉 산맥', minLvl: 18, maxLvl: 25, theme: { grass: '#d7e3ea', tree: '#7f9aa6', water: '#7fb5d6', road: '#b6bfc4', dark: '#b8c8d1' },
    intro: '눈보라 몰아치는 산맥. 서리 트롤 부족이 얼음 거인을 깨웠다는 소문이 돕니다.',
    monsters: [
      { id: 'leopard', name: '눈표범', emoji: '🐆', lvl: [18, 20], hp: 520, dmg: 48, xp: 350, gold: [25, 45], abil: 'backstab', drop: 'fur' },
      { id: 'frosttroll', name: '서리 트롤 광전사', emoji: '🧌', lvl: [20, 23], hp: 680, dmg: 56, xp: 420, gold: [30, 55], abil: 'regen', drop: 'totem' },
      { id: 'iceelem', name: '얼음 정령', emoji: '❄️', lvl: [22, 25], hp: 740, dmg: 64, xp: 500, gold: [35, 65], abil: 'freeze', drop: 'core' },
    ],
    boss: { id: 'giant', name: '서리 거인 요르문', emoji: '🗿', lvl: 26, hp: 5200, dmg: 95, xp: 6000, gold: [500, 700], abil: 'stomp', boss: true },
    quests: [
      { id: 'q_troll', name: '광전사 격퇴', giver: '산악 정찰병 브란', type: 'kill', target: 'frosttroll', count: 8, xp: 1600, gold: 200, text: '서리 트롤 광전사들이 산길을 봉쇄했어. 8명을 처치해 줘.', reward: { slot: 'legs', rarity: 'rare' } },
      { id: 'q_core', name: '얼음의 핵', giver: '산악 정찰병 브란', type: 'collect', target: 'core', count: 5, xp: 2000, gold: 260, text: '얼음 정령의 핵 5개면 거인의 결계를 뚫을 수 있어.', reward: { slot: 'feet', rarity: 'epic' }, req: 'q_troll' },
      { id: 'q_giant', name: '거인 사냥', giver: '산악 정찰병 브란', type: 'kill', target: 'giant', count: 1, xp: 6500, gold: 800, text: '서리 거인 요르문이 산 정상에서 깨어났어. 녀석이 내려오기 전에 막아야 해.', reward: { slot: 'weapon', rarity: 'epic' }, req: 'q_core' },
    ],
  },
  {
    id: 'depths', name: '불타는 심연', minLvl: 25, maxLvl: 30, theme: { grass: '#5a2d1e', tree: '#3a1a10', water: '#d9531e', road: '#7a4b35', dark: '#4a2418' },
    intro: '지옥의 불길이 타오르는 심연. 불의 군주 라그나스가 세계를 불태우려 합니다. 마지막 결전입니다.',
    monsters: [
      { id: 'imp', name: '불꽃 임프', emoji: '👿', lvl: [25, 27], hp: 900, dmg: 78, xp: 650, gold: [40, 80], abil: 'bolt', drop: 'ember' },
      { id: 'felguard', name: '지옥수호병', emoji: '👹', lvl: [26, 29], hp: 1300, dmg: 92, xp: 800, gold: [50, 100], abil: 'cleave', drop: 'felsteel' },
      { id: 'warlock', name: '어둠의 흑마법사', emoji: '🧙', lvl: [28, 30], hp: 1200, dmg: 105, xp: 950, gold: [60, 120], abil: 'poison', drop: 'grimoire' },
    ],
    boss: { id: 'ragnas', name: '불의 군주 라그나스', emoji: '🔥', lvl: 32, hp: 14000, dmg: 160, xp: 20000, gold: [2000, 3000], abil: 'inferno', boss: true },
    quests: [
      { id: 'q_imp', name: '임프 소탕', giver: '대마법사 카엘', type: 'kill', target: 'imp', count: 10, xp: 4000, gold: 400, text: '임프들이 심연 입구를 지키고 있네. 10마리를 처치하게.', reward: { slot: 'head', rarity: 'epic' } },
      { id: 'q_grim', name: '금단의 마도서', giver: '대마법사 카엘', type: 'collect', target: 'grimoire', count: 4, xp: 5000, gold: 600, text: '흑마법사들의 마도서 4권을 가져오게. 라그나스의 약점이 적혀 있을 걸세.', reward: { slot: 'chest', rarity: 'epic' }, req: 'q_imp' },
      { id: 'q_ragnas', name: '불의 군주', giver: '대마법사 카엘', type: 'kill', target: 'ragnas', count: 1, xp: 30000, gold: 5000, text: '라그나스가 심연 중심에서 기다리고 있네. 세계의 운명이 자네에게 달렸어!', reward: { slot: 'trinket', rarity: 'epic' }, req: 'q_grim' },
    ],
  },
];

DATA.questItems = {
  wolfpelt: { name: '늑대 가죽', emoji: '🟫' }, candle: { name: '커다란 양초', emoji: '🕯️' }, redmask: { name: '붉은 가면', emoji: '🎭' },
  tusk: { name: '멧돼지 엄니', emoji: '🦷' }, bracer: { name: '약탈자의 팔보호구', emoji: '🧤' }, feather: { name: '하피 깃털', emoji: '🪶' },
  venom: { name: '거미 독', emoji: '☠️' }, moss: { name: '늪지 이끼', emoji: '🌱' }, scale: { name: '나가의 비늘', emoji: '🐚' },
  fur: { name: '눈표범 모피', emoji: '🤍' }, totem: { name: '트롤 토템', emoji: '🪵' }, core: { name: '얼음의 핵', emoji: '💎' },
  ember: { name: '불꽃 잔재', emoji: '🔥' }, felsteel: { name: '지옥강철', emoji: '⛓️' }, grimoire: { name: '금단의 마도서', emoji: '📕' },
};

// 적 특수 능력 (매 턴 25~35% 확률로 사용)
DATA.enemyAbilities = {
  candle:   { name: '양초 던지기', mult: 1.3, chance: 0.3 },
  backstab: { name: '기습', mult: 1.8, chance: 0.25 },
  cleave:   { name: '휩쓸기', mult: 1.6, chance: 0.35 },
  charge:   { name: '돌진', mult: 1.5, chance: 0.3, stun: true },
  volley:   { name: '화살 세례', mult: 1.4, chance: 0.35 },
  screech:  { name: '날카로운 비명', mult: 1.0, chance: 0.3, weaken: 2 },
  poison:   { name: '맹독', mult: 0.5, chance: 0.4, dot: 3 },
  regen:    { name: '재생', mult: 0, chance: 0.3, heal: 0.15 },
  bolt:     { name: '암흑 화살', mult: 1.7, chance: 0.3 },
  tidal:    { name: '해일', mult: 2.0, chance: 0.3 },
  freeze:   { name: '동결', mult: 1.2, chance: 0.25, stun: true },
  stomp:    { name: '대지 강타', mult: 2.2, chance: 0.3, stun: true },
  inferno:  { name: '지옥불', mult: 1.2, chance: 0.4, dot: 4 },
};

DATA.xpForLevel = lvl => Math.floor(80 * lvl * lvl + 120 * lvl);
DATA.maxLevel = 30;
