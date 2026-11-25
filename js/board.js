/* ==============================================================
   board.js: 盤面状態管理 & 状態効果管理 & 移動・射程・スキル対象計算
   (純粋ステート＆ロジックモジュール - UI/DOM非依存)
   ============================================================== */
import {
  ROWS,
  COLS,
  inBounds,
  HERO_TYPES,
  ULT_REQUIRED_DAMAGE,
  DEPLOYABLE_ROWS,
  DEFAULT_ROSTER,
  DEFAULT_ACTION_ORDERS
} from './config.js?v=lab-white-3';
import { createEntity } from './entities/EntityFactory.js?v=lab-white-3';
export { inBounds };

// 盤面・ハザード状態
export let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
export let poisonZones = [];  // [{ r, c, owner, sourceHeroId }]

// ローカルプレイヤーの陣営管理
export let localPlayerRole = 'P1';

export function setLocalPlayerRole(role) {
  localPlayerRole = role || 'P1';
}

export function isLocalPlayer(owner) {
  return owner === localPlayerRole;
}

// チーム共通ウルトゲージ（通常攻撃累計与ダメージ 0〜100）
export let teamUltGauge = { P1: 0, P2: 0 };

// 物体化オーダーリスト（チームごとの所持行動オーダー群）
export let playerOrders = {
  P1: [],
  P2: []
};

// チームごとのターン内行動オーダー集計
export let actionOrders = {
  P1: { move: DEFAULT_ACTION_ORDERS.MOVE, attack: DEFAULT_ACTION_ORDERS.ATK },
  P2: { move: DEFAULT_ACTION_ORDERS.MOVE, attack: DEFAULT_ACTION_ORDERS.ATK }
};

let nextUnitUniqueId = 1;

// ==========================================
// 行動オーダー管理
// ==========================================
export function getPlayerOrders(owner) {
  return playerOrders[owner] || [];
}

export function syncActionOrdersCount(owner) {
  if (!owner || !playerOrders[owner]) return;
  const list = playerOrders[owner];
  const moves = list.filter(t => t.type === 'move' && !t.used).length;
  const atks = list.filter(t => t.type === 'attack' && !t.used).length;
  actionOrders[owner] = { move: moves, attack: atks };
}

export function getActionOrders(owner) {
  syncActionOrdersCount(owner);
  return actionOrders[owner] || { move: 0, attack: 0 };
}

// オーダー対象スコープ判定ヘルパー
function matchesOrderScope(tokenScope, unit) {
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

// 行動オーダーを所持しているか判定（unit を渡すとそのユニットが使用可能なオーダーに限定して判定）
export function hasActionOrder(owner, type, amount = 1, unit = null) {
  if (!owner || !playerOrders[owner]) return false;
  const key = type.toLowerCase();
  const list = playerOrders[owner];

  if (unit) {
    const validCount = list.filter(t =>
      t.type === key &&
      !t.used &&
      matchesOrderScope(t.scope, unit)
    ).length;
    return validCount >= amount;
  } else {
    const count = list.filter(t => t.type === key && !t.used).length;
    return count >= amount;
  }
}

// 行動オーダーを消費（unit を渡すと専用オーダーがあれば優先消費）
export function consumeActionOrder(owner, type, amount = 1, unit = null) {
  const list = playerOrders[owner] || [];
  const available = list.filter(order =>
    order.type === type.toLowerCase() && !order.used && (unit ? matchesOrderScope(order.scope, unit) : order.scope === 'all'));
  const selected = [...available.filter(order => order.scope !== 'all'),
    ...available.filter(order => order.scope === 'all')].slice(0, amount);
  if (selected.length < amount) return null;
  selected.forEach(order => { order.used = true; });
  syncActionOrdersCount(owner);
  return selected;
}

export function addSpecialActionOrder(owner, tokenDef) {
  if (!owner || !playerOrders[owner]) return;
  playerOrders[owner].push(tokenDef);
  syncActionOrdersCount(owner);
}

function createBitAttackOrder(bit) {
  return {
    id: `${bit.owner}_atk_bit_${bit.id}`,
    type: 'attack',
    name: '攻撃',
    badgeText: 'EX ATK',
    scope: bit.id,
    unitType: 'BIT',
    unitName: bit.name,
    used: false,
    desc: 'ビットのパッシブ『セルフ・ドライブ』による専用攻撃オーダー。共通攻撃とは独立してこのビットのみが通常攻撃できます。'
  };
}

// ターン開始時：物体化オーダーを生成・補充（パッシブによる専用オーダーも生成）
export function resetActionOrders(owner, { playPassivePopupFX } = {}) {
  if (!owner) return;

  const tokens = [
    {
      id: `${owner}_move_common`,
      type: 'move',
      name: 'MOVE',
      badgeText: 'MOVE',
      scope: 'all',
      unitType: null,
      unitName: null,
      used: false,
      desc: '味方ユニットが1回移動できます。'
    },
    {
      id: `${owner}_attack_common`,
      type: 'attack',
      name: 'ATK',
      badgeText: 'ATK',
      scope: 'all',
      unitType: null,
      unitName: null,
      used: false,
      desc: '味方ユニットが1回通常攻撃できます。実際に減らしたHP分だけウルトゲージが蓄積します。'
    }
  ];

  // 盤面の味方ユニットを走査し、専用オーダーを付与
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (!u || u.owner !== owner) continue;

      // ビット生存時：各ビット専用攻撃オーダー+1
      if (u.typeKey === 'BIT' && !hasDebuff(u, 'silence')) {
        playPassivePopupFX?.({ r, c }, { label: 'EX ATK +1' });
        tokens.push(createBitAttackOrder(u));
      }
    }
  }

  playerOrders[owner] = tokens;
  syncActionOrdersCount(owner);
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
// 盤面・ハザード判定
// ==========================================
export function clearBoard() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      board[r][c] = null;
    }
  }
  poisonZones.length = 0;
  return board;
}

export function getHazardInfoAt(r, c) {
  const zone = poisonZones.find(zone => zone.r === r && zone.c === c);
  if (!zone) return null;
  return {
    type: 'poison',
    name: 'トキシック・ゾーン',
    icon: '🧪',
    owner: zone.owner,
    setter: 'スモッグ',
    impact: '両軍の手番終了時に5 DMG',
    desc: '両軍それぞれの手番終了時、ゾーン上の敵ユニットに5ダメージ。展開者が撃破されると消滅する。',
    category: 'ハザード'
  };
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
    spawnHero('ANCHOR', 'P1', 6, 3);
    for (let i = 0; i < Math.min(roster.length, slotsP1.length); i++) {
      spawnHero(roster[i], 'P1', slotsP1[i].r, slotsP1[i].c);
    }
  } else if (owner === 'P2') {
    spawnHero('ANCHOR', 'P2', 0, 3);
    for (let i = 0; i < Math.min(roster.length, slotsP2.length); i++) {
      spawnHero(roster[i], 'P2', slotsP2[i].r, slotsP2[i].c);
    }
  }
}

export function initBoard() {
  clearBoard();
  teamUltGauge = { P1: 0, P2: 0 };
  resetActionOrders('P1');
  resetActionOrders('P2');
  return board;
}

export function resetTurnPassives(owner, context) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (!u) continue;
      if (u.owner !== owner) continue;
      if (!hasDebuff(u, 'silence')) u.onTurnStart?.(board, { ...context, poisonZones });
    }
  }
}

export function spawnHero(typeKey, owner, r, c) {
  if (!inBounds(r, c)) return null;
  const entity = createEntity(typeKey, owner, r, c);
  if (!entity) return null;
  board[r][c] = entity;
  if (entity.typeKey === 'BIT' && !hasDebuff(entity, 'silence')) addSpecialActionOrder(owner, createBitAttackOrder(entity));
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
  return unit.typeKey !== 'ANCHOR' && unit.typeKey !== 'BARRICADE' && unit.typeKey !== 'TURRET';
}

export function isAnchor(unit) {
  if (!unit) return false;
  if (typeof unit.isAnchor === 'function') return unit.isAnchor();
  return unit.typeKey === 'ANCHOR';
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
// 盤面上のユニット現在座標を取得（unit.r/c が古い場合のフォールバック検索付き）
export function getUnitPos(unit) {
  if (!unit) return null;
  if (typeof unit.r === 'number' && typeof unit.c === 'number' && board[unit.r]?.[unit.c] === unit) {
    return { r: unit.r, c: unit.c };
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === unit) return { r, c };
    }
  }
  return null;
}

export function hasDebuff(unit, key) {
  return unit?.hasDebuff?.(key) ?? false;
}

export function hasAnyDebuff(unit) {
  return Boolean(unit?.debuffs?.length);
}

export function getAtkBonuses(unit) {
  return unit?.getAtkBonuses?.({ board, poisonZones }) ?? [];
}

export function getEffectiveAtk(unit) {
  return unit ? unit.atk + getAtkBonuses(unit).reduce((total, buff) => total + buff.val, 0) : 0;
}

export function getStatusEffects(unit) {
  return [...getAtkBonuses(unit), ...unit.buffs.filter(buff => buff.key === 'shield'), ...unit.debuffs];
}

export function getShieldVal(unit) {
  return unit?.getShieldVal?.() ?? 0;
}

export function findAnchor(owner) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.typeKey === 'ANCHOR' && u.owner === owner) return u;
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
    return unit.getValidMoves({ board, hasActionOrder });
  }

  if (hasDebuff(unit, 'bind')) return [];
  if (!hasActionOrder(unit.owner, 'move', 1, unit)) return [];

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
    return unit.getValidAttacks({ board, hasActionOrder });
  }

  if (unit.atk === 0) return [];
  if (hasDebuff(unit, 'disarm')) return [];
  if (!hasActionOrder(unit.owner, 'attack', 1, unit)) return [];

  const enemyOwner = (unit.owner === 'P1') ? 'P2' : 'P1';
  const rangeCells = getAttackRangeCells(r, c);

  return rangeCells.filter(cell => {
    const target = board[cell.r][cell.c];
    return target && target.owner === enemyOwner;
  });
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
    const targets = unit.getSkillTargets(slot, { board });
    if (targets && Array.isArray(targets)) {
      return targets;
    }
  }

  return [];
}
