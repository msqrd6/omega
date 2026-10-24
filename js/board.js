/* ==============================================================
   board.js: 盤面状態管理 & 状態効果管理 & 移動・射程・スキル対象計算
   (純粋ステート＆ロジックモジュール - UI/DOM非依存)
   ============================================================== */
import {
  ROWS,
  COLS,
  HERO_TYPES,
  ULT_REQUIRED_DAMAGE,
  DEPLOYABLE_ROWS,
  DEFAULT_ROSTER,
  DEFAULT_ACTION_TOKENS
} from './config.js?v=20261024_11';
import { createEntity } from './entities/EntityFactory.js?v=20261024_11';

// 盤面・トラップ・ハザード状態
export let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
export let traps = [];        // [{ r, c, owner, damage, type, sourceHeroId }]
export let phantomZones = []; // [{ r, c, owner, sourceHeroId, sourceHeroType }]
export let poisonZones = [];  // [{ r, c, owner, sourceHeroId, sourceHeroType }]

// ローカルプレイヤーの陣営管理（トラップの可視・不可視判定等で使用）
export let localPlayerRole = 'P1';

export function setLocalPlayerRole(role) {
  localPlayerRole = role || 'P1';
}

export function isLocalPlayer(owner) {
  return owner === localPlayerRole;
}

// チーム共通ウルトゲージ（通常攻撃累計与ダメージ 0〜100）
export let teamUltGauge = { P1: 0, P2: 0 };

// 物体化トークンリスト（チームごとの所持行動トークン群）
export let playerTokens = {
  P1: [],
  P2: []
};

// チームごとのターン内行動トークン集計
export let actionTokens = {
  P1: { move: DEFAULT_ACTION_TOKENS.MOVE, attack: DEFAULT_ACTION_TOKENS.ATK },
  P2: { move: DEFAULT_ACTION_TOKENS.MOVE, attack: DEFAULT_ACTION_TOKENS.ATK }
};

let nextUnitUniqueId = 1;

// ==========================================
// 行動トークン管理
// ==========================================
export function getPlayerTokens(owner) {
  return playerTokens[owner] || [];
}

export function syncActionTokensCount(owner) {
  if (!owner || !playerTokens[owner]) return;
  const list = playerTokens[owner];
  const moves = list.filter(t => t.type === 'move' && !t.used).length;
  const atks = list.filter(t => t.type === 'attack' && !t.used).length;
  actionTokens[owner] = { move: moves, attack: atks };
}

export function getActionTokens(owner) {
  syncActionTokensCount(owner);
  return actionTokens[owner] || { move: 0, attack: 0 };
}

// トークン対象スコープ判定ヘルパー
function matchesTokenScope(tokenScope, unit) {
  if (tokenScope === 'all') return true;
  if (!unit) return false;
  if (tokenScope === unit.id || tokenScope === unit.typeKey) return true;
  // キネシスの新旧エイリアス対応
  if ((tokenScope === 'KINESIS' || tokenScope === 'DUELIST') &&
      (unit.typeKey === 'KINESIS' || unit.typeKey === 'DUELIST')) {
    return true;
  }
  return false;
}

// 行動トークンを所持しているか判定（unit を渡すとそのユニットが使用可能なトークンに限定して判定）
export function hasActionToken(owner, type, amount = 1, unit = null) {
  if (!owner || !playerTokens[owner]) return false;
  const key = type.toLowerCase();
  const list = playerTokens[owner];

  if (unit) {
    const validCount = list.filter(t =>
      t.type === key &&
      !t.used &&
      matchesTokenScope(t.scope, unit)
    ).length;
    return validCount >= amount;
  } else {
    const count = list.filter(t => t.type === key && !t.used).length;
    return count >= amount;
  }
}

// 行動トークンを消費（unit を渡すと専用トークンがあれば優先消費）
export function consumeActionToken(owner, type, amount = 1, unit = null) {
  if (!owner || !playerTokens[owner]) return false;
  const key = type.toLowerCase();
  const list = playerTokens[owner];
  let consumed = 0;

  // 1. ユニット指定がある場合、まずそのユニット専用の未消費トークンを優先消費
  if (unit) {
    const specialTokens = list.filter(t =>
      t.type === key &&
      !t.used &&
      t.scope !== 'all' &&
      matchesTokenScope(t.scope, unit)
    );
    for (const t of specialTokens) {
      if (consumed < amount) {
        t.used = true;
        consumed++;
      }
    }
  }

  // 2. まだ不足していれば共通トークン（scope === 'all'）を消費
  if (consumed < amount) {
    const commonTokens = list.filter(t => t.type === key && !t.used && t.scope === 'all');
    for (const t of commonTokens) {
      if (consumed < amount) {
        t.used = true;
        consumed++;
      }
    }
  }

  syncActionTokensCount(owner);
  return consumed >= amount;
}

// 専用行動トークンの動的追加（キネシスのウルト・ビット召喚時など）
export function addSpecialActionToken(owner, tokenDef) {
  if (!owner || !playerTokens[owner]) return;
  playerTokens[owner].push(tokenDef);
  syncActionTokensCount(owner);
}

// ターン開始時：物体化トークンを生成・補充（パッシブによる専用トークンも生成）
export function resetActionTokens(owner) {
  if (!owner) return;

  const tokens = [
    {
      id: `${owner}_move_common`,
      type: 'move',
      name: '移動',
      badgeText: '移動',
      scope: 'all',
      unitType: null,
      unitName: null,
      used: false,
      desc: '味方ユニットが1回移動できます。'
    },
    {
      id: `${owner}_attack_common`,
      type: 'attack',
      name: '攻撃',
      badgeText: '攻撃',
      scope: 'all',
      unitType: null,
      unitName: null,
      used: false,
      desc: '味方ユニットが1回通常攻撃できます（ウルトゲージ蓄積）。'
    }
  ];

  // 盤面の味方ユニットを走査し、専用トークンを付与
  let kinesisTokenAdded = false;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (!u || u.owner !== owner) continue;

      // キネシス生存時：キネシス専用移動トークン+1
      if ((u.typeKey === 'KINESIS' || u.typeKey === 'DUELIST') && !kinesisTokenAdded) {
        kinesisTokenAdded = true;
        tokens.push({
          id: `${owner}_move_kinesis`,
          type: 'move',
          name: '移動',
          badgeText: '移動',
          scope: 'KINESIS',
          unitType: 'KINESIS',
          unitName: 'キネシス',
          used: false,
          desc: 'キネシスのパッシブ『ライトニング・ステップ』による専用移動トークン。共通移動とは独立してキネシスのみが移動できます。'
        });
      }

      // ビット生存時：各ビット専用攻撃トークン+1
      if (u.typeKey === 'BIT') {
        tokens.push({
          id: `${owner}_atk_bit_${u.id}`,
          type: 'attack',
          name: '攻撃',
          badgeText: '攻撃',
          scope: u.id,
          unitType: 'BIT',
          unitName: 'ビット',
          used: false,
          desc: 'ビットのパッシブ『自律アサルト・ドライブ』による専用攻撃トークン。共通攻撃とは独立してこのビットのみが通常攻撃できます。'
        });
      }
    }
  }

  playerTokens[owner] = tokens;
  syncActionTokensCount(owner);
}

// ==========================================
// チームウルトゲージ管理
// ==========================================
export function getTeamUltGauge(owner) {
  return teamUltGauge[owner] || 0;
}

export function addTeamUltDamage(owner, dmg) {
  if (!owner || (owner !== 'P1' && owner !== 'P2')) return;
  teamUltGauge[owner] = Math.min(ULT_REQUIRED_DAMAGE, (teamUltGauge[owner] || 0) + dmg);
}

export function resetTeamUltGauge(owner) {
  if (owner && teamUltGauge[owner] !== undefined) {
    teamUltGauge[owner] = 0;
  }
}

// ==========================================
// 盤面・ハザード・トラップ判定
// ==========================================
export function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

export function clearBoard() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      board[r][c] = null;
    }
  }
  traps.length = 0;
  phantomZones.length = 0;
  poisonZones.length = 0;
  return board;
}

export function hasHazardAt(r, c) {
  return (
    phantomZones.some(pz => pz.r === r && pz.c === c) ||
    poisonZones.some(pz => pz.r === r && pz.c === c)
  );
}

export function hasTrapAt(r, c) {
  return traps.some(tp => tp.r === r && tp.c === c);
}

export function hasHazardOrTrapAt(r, c) {
  return hasHazardAt(r, c) || hasTrapAt(r, c);
}

export function getHazardInfoAt(r, c) {
  const fz = phantomZones.find(z => z.r === r && z.c === c);
  if (fz) {
    return {
      type: 'phantom',
      name: 'ディメンション・ゾーン',
      icon: '👻',
      owner: fz.owner,
      desc: 'フェイズが展開したハザード。侵入した敵ユニット（コア除く）に【弱体化(このターン中 / 被ダメ1.5倍)】を付与！フェイズ撃破時に同時消滅。',
      category: 'ハザード（展開者生存時永続 / 撃破時同時消滅）'
    };
  }
  const pzn = poisonZones.find(z => z.r === r && z.c === c);
  if (pzn) {
    return {
      type: 'poison',
      name: 'トキシック・ゾーン',
      icon: '🧪',
      owner: pzn.owner,
      desc: '猛毒が立ち込める危険エリア。滞在している敵ユニット（コア除く）は自軍ターン開始時に 10 ダメージを受ける！トキシン撃破時に同時消滅。',
      category: 'ハザード（展開者生存時永続 / 撃破時同時消滅）'
    };
  }
  return null;
}

// ==========================================
// 初期配置・スポーン管理
// ==========================================
export function getDeployedPieces(owner) {
  const deployed = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === owner) {
        deployed.push({ typeKey: u.typeKey, r, c, name: u.name, icon: u.icon, id: u.id });
      }
    }
  }
  return deployed;
}

export function canDeployAt(owner, r, c) {
  if (!inBounds(r, c)) return false;
  const validRows = DEPLOYABLE_ROWS[owner] || [];
  return validRows.includes(r) && !board[r][c];
}

export function applyDefaultPlacement(owner, roster = DEFAULT_ROSTER) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] && board[r][c].owner === owner) {
        board[r][c] = null;
      }
    }
  }

  const slotsP1 = [
    { r: 5, c: 3 },
    { r: 6, c: 1 },
    { r: 6, c: 2 },
    { r: 6, c: 4 },
    { r: 6, c: 5 }
  ];
  const slotsP2 = [
    { r: 1, c: 3 },
    { r: 0, c: 1 },
    { r: 0, c: 2 },
    { r: 0, c: 4 },
    { r: 0, c: 5 }
  ];

  if (owner === 'P1') {
    spawnHero('CORE', 'P1', 6, 3);
    for (let i = 0; i < Math.min(roster.length, slotsP1.length); i++) {
      spawnHero(roster[i], 'P1', slotsP1[i].r, slotsP1[i].c);
    }
  } else if (owner === 'P2') {
    spawnHero('CORE', 'P2', 0, 3);
    for (let i = 0; i < Math.min(roster.length, slotsP2.length); i++) {
      spawnHero(roster[i], 'P2', slotsP2[i].r, slotsP2[i].c);
    }
  }
}

export function initBoard() {
  clearBoard();
  teamUltGauge = { P1: 0, P2: 0 };
  resetActionTokens('P1');
  resetActionTokens('P2');
  return board;
}

export function resetTurnPassives(owner) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (!u) continue;
      u.turnDamageDealt = 0;
    }
  }
}

export function spawnHero(typeKey, owner, r, c) {
  if (!inBounds(r, c)) return null;
  const entity = createEntity(typeKey, owner, r, c);
  if (!entity) return null;
  board[r][c] = entity;
  return entity;
}

// RULEBOOK正式用語エイリアス
export const spawnUnit = spawnHero;

// ==========================================
// クラス・ロール判定ヘルパー
// ==========================================
export function isUnit(unit) {
  if (!unit) return false;
  if (typeof unit.isUnit === 'function') return unit.isUnit();
  return unit.typeKey !== 'CORE' && unit.typeKey !== 'BARRICADE' && unit.typeKey !== 'TURRET';
}

export function isCore(unit) {
  if (!unit) return false;
  if (typeof unit.isCore === 'function') return unit.isCore();
  return unit.typeKey === 'CORE';
}

export function isObject(unit) {
  if (!unit) return false;
  if (typeof unit.isObject === 'function') return unit.isObject();
  return unit.typeKey === 'BARRICADE' || unit.typeKey === 'TURRET';
}

export function isAssault(unit) {
  if (!unit || !isUnit(unit)) return false;
  if (typeof unit.isAssault === 'function') return unit.isAssault();
  return HERO_TYPES[unit.typeKey]?.role === 'ASSAULT';
}

// ==========================================
// バフ・デバフ・ステータス計算ヘルパー
// ==========================================
export function applyBuff(unit, key, val, turns) {
  if (!unit) return;
  if (typeof unit.applyBuff === 'function') {
    unit.applyBuff(key, val, turns);
    return;
  }
  if (unit.typeKey === 'CORE' && key !== 'shield') return;
  if (!unit.buffs) unit.buffs = {};
  unit.buffs[key] = { val, turns };
}

export function applyDebuff(unit, key, turns) {
  if (!unit || !isUnit(unit)) return;
  if (typeof unit.applyDebuff === 'function') {
    unit.applyDebuff(key, turns);
    return;
  }
  if (!unit.debuffs) unit.debuffs = {};
  const cur = unit.debuffs[key];
  const curTurns = cur ? cur.turns : 0;
  unit.debuffs[key] = { turns: Math.max(curTurns, turns) };
}

export function hasBuff(unit, key) {
  if (!unit) return false;
  if (typeof unit.hasBuff === 'function') return unit.hasBuff(key);
  return !!(unit.buffs && unit.buffs[key] && unit.buffs[key].turns > 0);
}

export function hasDebuff(unit, key) {
  if (!unit) return false;
  if (typeof unit.hasDebuff === 'function') return unit.hasDebuff(key);
  return !!(unit.debuffs && unit.debuffs[key] && unit.debuffs[key].turns > 0);
}

export function hasAnyDebuff(unit) {
  if (!unit) return false;
  if (typeof unit.hasAnyDebuff === 'function') return unit.hasAnyDebuff();
  if (!unit.debuffs) return false;
  return Object.values(unit.debuffs).some(d => d && d.turns > 0);
}

export function clearAllDebuffs(unit) {
  if (!unit) return;
  if (typeof unit.clearAllDebuffs === 'function') {
    unit.clearAllDebuffs();
    return;
  }
  unit.debuffs = {
    vulnerable: null,
    disarm: null,
    bind: null,
    silence: null
  };
}

// ベクターのパッシブ『バンカー・スナイパー』判定 (オブジェクトまたはコア隣接時に真)
export function isVectorBunkerActive(unit) {
  if (!unit || (unit.typeKey !== 'VECTOR' && unit.typeKey !== 'SENTINEL')) return false;
  let ur = -1, uc = -1;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === unit) { ur = r; uc = c; break; }
    }
    if (ur !== -1) break;
  }
  if (ur === -1) return false;

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = ur + dr, nc = uc + dc;
      if (inBounds(nr, nc)) {
        const neighbor = board[nr][nc];
        if (neighbor && (isCore(neighbor) || isObject(neighbor))) {
          return true;
        }
      }
    }
  }
  return false;
}

// ヴァルカンのパッシブ『クロスファイア・リンク』判定 (セントリー・タレットのストック保持時に真)
export function isVulcanStockActive(unit) {
  if (!unit || unit.typeKey !== 'VULCAN') return false;
  return (unit.stockA ?? 0) > 0;
}

// 実効攻撃力計算（基本ATK ＋ 攻撃力増強バフ ＋ パッシブ攻撃力増強）
export function getEffectiveAtk(unit) {
  if (!unit) return 0;
  if (typeof unit.getEffectiveAtk === 'function') {
    return unit.getEffectiveAtk({ board });
  }
  let total = unit.atk;
  if (hasBuff(unit, 'atk_up')) {
    total += unit.buffs.atk_up.val;
  }
  if (isVectorBunkerActive(unit)) {
    total += 10;
  }
  if (isVulcanStockActive(unit)) {
    total += 10;
  }
  return total;
}

export function getShieldVal(unit) {
  if (!unit) return 0;
  if (typeof unit.getShieldVal === 'function') return unit.getShieldVal();
  return hasBuff(unit, 'shield') ? unit.buffs.shield.val : 0;
}

export function findCore(owner) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.typeKey === 'CORE' && u.owner === owner) return u;
    }
  }
  return null;
}

export function isUltReady(hero) {
  if (!hero || !isUnit(hero) || hero.ultUsed) return false;
  if (typeof hero.isUltReady === 'function') {
    return hero.isUltReady(teamUltGauge[hero.owner]);
  }
  const heroDef = HERO_TYPES[hero.typeKey];
  if (!heroDef || !heroDef.skills || !heroDef.skills.ULT) return false;
  if (hasDebuff(hero, 'silence')) return false;
  return (teamUltGauge[hero.owner] || 0) >= ULT_REQUIRED_DAMAGE;
}

// ==========================================
// 移動・攻撃・スキル対象マス計算
// ==========================================
export function getValidMoves(r, c) {
  const unit = board[r]?.[c];
  if (!unit || !isUnit(unit)) return [];
  if (typeof unit.getValidMoves === 'function') {
    unit.r = r;
    unit.c = c;
    return unit.getValidMoves({ board, hasActionToken });
  }

  if (hasDebuff(unit, 'bind')) return [];
  if (!hasActionToken(unit.owner, 'move', 1, unit)) return [];

  const moves = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && !board[nr][nc]) {
        moves.push({ r: nr, c: nc });
      }
    }
  }

  // サイファー固有パッシブ『ホライゾン・シフト』
  if (unit.typeKey === 'CYPHER') {
    for (let nc = c - 1; nc >= 0; nc--) {
      if (board[r][nc]) break;
      if (!moves.some(m => m.r === r && m.c === nc)) moves.push({ r, c: nc });
    }
    for (let nc = c + 1; nc < COLS; nc++) {
      if (board[r][nc]) break;
      if (!moves.some(m => m.r === r && m.c === nc)) moves.push({ r, c: nc });
    }
  }

  return moves;
}

export function getAttackRangeCells(r, c) {
  const cells = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc)) cells.push({ r: nr, c: nc });
    }
  }
  return cells;
}

export function getValidAttacks(r, c) {
  const unit = board[r]?.[c];
  if (!unit || !isUnit(unit)) return [];
  if (typeof unit.getValidAttacks === 'function') {
    unit.r = r;
    unit.c = c;
    return unit.getValidAttacks({ board, hasActionToken });
  }

  if (unit.atk === 0) return [];
  if (hasDebuff(unit, 'disarm')) return [];
  if (!hasActionToken(unit.owner, 'attack', 1, unit)) return [];

  const enemyOwner = (unit.owner === 'P1') ? 'P2' : 'P1';
  const rangeCells = getAttackRangeCells(r, c);

  return rangeCells.filter(cell => {
    const target = board[cell.r][cell.c];
    return target && target.owner === enemyOwner;
  });
}

// 指定条件を満たす味方ユニットの周囲8マスの空きマスを収集する共通ヘルパー
function getEmptyCellsAroundMatchingUnits(filterFn) {
  const result = [];
  for (let ar = 0; ar < ROWS; ar++) {
    for (let ac = 0; ac < COLS; ac++) {
      const u = board[ar][ac];
      if (u && filterFn(u, ar, ac)) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = ar + dr, nc = ac + dc;
            if (inBounds(nr, nc) && !board[nr][nc]) {
              if (!result.some(t => t.r === nr && t.c === nc)) {
                result.push({ r: nr, c: nc });
              }
            }
          }
        }
      }
    }
  }
  return result;
}

export function getValidSkillTargets(r, c, slot) {
  const unit = board[r]?.[c];
  if (!unit || !isUnit(unit)) return [];
  if (hasDebuff(unit, 'silence')) return [];
  if (slot !== 'A' && slot !== 'ULT') return [];

  const heroDef = HERO_TYPES[unit.typeKey];
  if (!heroDef || !heroDef.skills || !heroDef.skills[slot]) return [];

  if (slot === 'A' && unit.stockA <= 0) return [];
  if (slot === 'ULT' && (!isUltReady(unit) || unit.ultUsed)) return [];

  if (typeof unit.getSkillTargets === 'function') {
    unit.r = r;
    unit.c = c;
    const targets = unit.getSkillTargets(slot, {
      board,
      phantomZones,
      poisonZones,
      traps,
      hasHazardOrTrapAt
    });
    if (targets && Array.isArray(targets)) {
      return targets;
    }
  }

  const allies = unit.owner;
  const targets = [];

  switch (unit.typeKey) {
    case 'DUELIST': {
      targets.push({ r, c });
      break;
    }

    case 'PHANTOM': {
      if (slot === 'A') {
        const myZones = phantomZones.filter(pz => pz.owner === unit.owner);
        for (const pz of myZones) {
          if (inBounds(pz.r, pz.c) && !board[pz.r][pz.c]) {
            targets.push({ r: pz.r, c: pz.c });
          }
        }
      } else if (slot === 'ULT') {
        targets.push({ r, c });
      }
      break;
    }

    case 'BOMBER': {
      if (slot === 'A') {
        const forwardDir = (unit.owner === 'P1') ? -1 : 1;
        for (let step = 1; step <= 2; step++) {
          const nr = r + forwardDir * step;
          for (let dc = -1; dc <= 1; dc++) {
            const nc = c + dc;
            if (inBounds(nr, nc) && !board[nr][nc] && !hasHazardOrTrapAt(nr, nc)) {
              targets.push({ r: nr, c: nc });
            }
          }
        }
      } else if (slot === 'ULT') {
        targets.push({ r, c });
      }
      break;
    }

    case 'SENTINEL': {
      if (slot === 'A') {
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc) && !board[nr][nc]) {
              targets.push({ r: nr, c: nc });
            }
          }
        }
      } else if (slot === 'ULT') {
        targets.push({ r, c });
      }
      break;
    }

    case 'VULCAN': {
      if (slot === 'A') {
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc) && !board[nr][nc] && !hasHazardOrTrapAt(nr, nc)) {
              targets.push({ r: nr, c: nc });
            }
          }
        }
      } else if (slot === 'ULT') {
        let hasTurret = false;
        for (let tr = 0; tr < ROWS; tr++) {
          for (let tc = 0; tc < COLS; tc++) {
            const u = board[tr][tc];
            if (u && u.typeKey === 'TURRET' && u.owner === unit.owner) {
              targets.push({ r: tr, c: tc });
              hasTurret = true;
            }
          }
        }
        if (hasTurret) {
          targets.push({ r, c });
        }
      }
      break;
    }

    case 'POISON': {
      if (slot === 'A') {
        if (inBounds(r, c + 1)) targets.push({ r, c: c + 1 });
        if (inBounds(r, c - 1)) targets.push({ r, c: c - 1 });
      } else if (slot === 'ULT') {
        targets.push({ r, c });
      }
      break;
    }

    case 'DISRUPTOR': {
      if (slot === 'A') {
        const cells = getEmptyCellsAroundMatchingUnits(u => u.owner === allies && isAssault(u) && u.typeKey !== 'BIT');
        targets.push(...cells);
      } else if (slot === 'ULT') {
        for (let tr = 0; tr < ROWS; tr++) {
          for (let tc = 0; tc < COLS; tc++) {
            if (!board[tr][tc]) targets.push({ r: tr, c: tc });
          }
        }
      }
      break;
    }

    case 'CYPHER': {
      if (slot === 'A') {
        const forwardDir = (unit.owner === 'P1') ? -1 : 1;
        let step = 1;
        while (true) {
          const nr = r + forwardDir * step;
          const nc = c;
          if (!inBounds(nr, nc)) break;
          const targetUnit = board[nr][nc];
          if (targetUnit) {
            if (isUnit(targetUnit)) {
              targets.push({ r: nr, c: nc });
            }
            break;
          }
          step++;
        }
      } else if (slot === 'ULT') {
        targets.push({ r, c });
      }
      break;
    }

    case 'HIVE': {
      if (slot === 'A') {
        const cells = getEmptyCellsAroundMatchingUnits(u => u.owner === allies && isAssault(u));
        if (cells.length > 0) {
          targets.push(...cells);
        } else {
          // 盤面に自軍アサルト不在時のフォールバック（ハイヴ自身の周囲8マス）
          const selfCells = getEmptyCellsAroundMatchingUnits((u, ar, ac) => ar === r && ac === c);
          targets.push(...selfCells);
        }
      } else if (slot === 'ULT') {
        targets.push({ r, c });
      }
      break;
    }

    case 'BIT': {
      if (slot === 'A') {
        targets.push({ r, c });
      }
      break;
    }

    case 'MEDIC': {
      if (slot === 'A') {
        for (let dr = -3; dr <= 3; dr++) {
          for (let dc = -3; dc <= 3; dc++) {
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc)) {
              const t = board[nr][nc];
              if (t && t.owner === allies && isUnit(t)) {
                targets.push({ r: nr, c: nc });
              }
            }
          }
        }
      } else if (slot === 'ULT') {
        targets.push({ r, c });
      }
      break;
    }

    case 'HACKER': {
      if (slot === 'A') {
        for (let tr = 0; tr < ROWS; tr++) {
          for (let tc = 0; tc < COLS; tc++) {
            const t = board[tr][tc];
            if (t && t.owner === allies && isUnit(t)) {
              targets.push({ r: tr, c: tc });
            }
          }
        }
      } else if (slot === 'ULT') {
        for (let tr = 0; tr < ROWS; tr++) {
          for (let tc = 0; tc < COLS; tc++) {
            targets.push({ r: tr, c: tc });
          }
        }
      }
      break;
    }

    case 'AURA': {
      if (slot === 'A') {
        targets.push({ r, c });
      } else if (slot === 'ULT') {
        const cells = getEmptyCellsAroundMatchingUnits((u, ar, ac) => u.owner === allies && (ar !== r || ac !== c) && isUnit(u));
        targets.push(...cells);
      }
      break;
    }
  }

  return targets;
}
