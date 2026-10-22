/* ==============================================================
   board.js: 盤面状態管理 & バフ/デバフ管理 & 4大ロールの範囲・移動・スキル対象計算
   (大型アップデート: スキルトークン廃止・Bスキル廃止対応)
   ============================================================== */
import {
  ROWS,
  COLS,
  HERO_TYPES,
  ULT_REQUIRED_DAMAGE,
  DEPLOYABLE_ROWS,
  INITIAL_PIECE_KEYS,
  DEFAULT_ROSTER,
  DEFAULT_ACTION_TOKENS
} from './config.js?v=20261023_02';

export let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
export let traps = [];        // [{ r, c, owner, damage, type, sourceHeroId }]
export let plasmaZones = [];  // [{ r, c, owner, damage, dotDamage, sourceHeroId, sourceHeroType }]
export let phantomZones = []; // [{ r, c, owner, sourceHeroId, sourceHeroType }] (ハザード: 敵侵入時vulnerable付与)
export let poisonZones = [];  // [{ r, c, owner, sourceHeroId, sourceHeroType }] (ハザード: 敵侵入時ターン開始時5ダメージ)

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

// チームごとのターン内行動トークン (Move: 1, Atk: 1 / 後方互換オブジェクト)
export let actionTokens = {
  P1: { move: DEFAULT_ACTION_TOKENS.MOVE, attack: DEFAULT_ACTION_TOKENS.ATK },
  P2: { move: DEFAULT_ACTION_TOKENS.MOVE, attack: DEFAULT_ACTION_TOKENS.ATK }
};
export let maxActionTokens = {
  P1: { move: DEFAULT_ACTION_TOKENS.MOVE, attack: DEFAULT_ACTION_TOKENS.ATK },
  P2: { move: DEFAULT_ACTION_TOKENS.MOVE, attack: DEFAULT_ACTION_TOKENS.ATK }
};

let nextUnitUniqueId = 1;

// プレイヤーの物体化トークン配列を取得
export function getPlayerTokens(owner) {
  return playerTokens[owner] || [];
}

// 内部用：actionTokens 後方互換カウントの同期
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

export function getMaxActionTokens(owner) {
  return maxActionTokens[owner] || { move: 1, attack: 1 };
}

// 行動トークンを所持しているか判定（unit を渡すと専用トークンを含めて判定）
export function hasActionToken(owner, type, amount = 1, unit = null) {
  if (!owner || !playerTokens[owner]) return false;
  const key = type.toLowerCase();
  if (key === 'skill') return true; // スキルトークン廃止のため常に利用可能

  const list = playerTokens[owner];
  if (unit) {
    // ユニット指定時：そのユニットが使える未消費トークン（共通または専用）の枚数
    const validCount = list.filter(t =>
      t.type === key &&
      !t.used &&
      (t.scope === 'all' || t.scope === unit.typeKey)
    ).length;
    return validCount >= amount;
  } else {
    // チーム全体判定：そのタイプの未消費トークンが残っているか
    const count = list.filter(t => t.type === key && !t.used).length;
    return count >= amount;
  }
}

// 行動トークンを消費（unit を渡すと、専用トークンがあれば優先消費）
export function consumeActionToken(owner, type, amount = 1, unit = null) {
  if (!owner || !playerTokens[owner]) return false;
  const key = type.toLowerCase();
  if (key === 'skill') return true; // スキルトークン消費なし

  const list = playerTokens[owner];
  let consumed = 0;

  // 1. ユニット指定がある場合、まずそのユニット専用の未消費トークンを消費
  if (unit) {
    const specialTokens = list.filter(t => t.type === key && !t.used && t.scope === unit.typeKey);
    for (const t of specialTokens) {
      if (consumed < amount) {
        t.used = true;
        consumed++;
      }
    }
  }

  // 2. まだ不足していれば、共通トークン（scope === 'all'）を消費
  if (consumed < amount) {
    const commonTokens = list.filter(t => t.type === key && !t.used && t.scope === 'all');
    for (const t of commonTokens) {
      if (consumed < amount) {
        t.used = true;
        consumed++;
      }
    }
  }

  // 3. それでもユニット指定なしで不足していれば、任意の未消費トークンを消費
  if (consumed < amount && !unit) {
    const anyTokens = list.filter(t => t.type === key && !t.used);
    for (const t of anyTokens) {
      if (consumed < amount) {
        t.used = true;
        consumed++;
      }
    }
  }

  syncActionTokensCount(owner);
  return consumed >= amount;
}

// ターン開始時：物体化トークンを生成・補充（パッシブによる専用トークンもここで生成！）
export function resetActionTokens(owner) {
  if (!owner) return;

  const tokens = [
    {
      id: `${owner}_move_common`,
      type: 'move',
      name: '移動',
      badgeText: '移動',
      icon: '👟',
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
      icon: '⚔️',
      scope: 'all',
      unitType: null,
      unitName: null,
      used: false,
      desc: '味方ユニットが1回通常攻撃できます（ウルトゲージ蓄積）。'
    }
  ];

  // ★【固有パッシブ連動】盤面にキネシス（DUELIST）が生存している場合、「キネシス専用移動トークン」を追加！
  let kinesisAlive = false;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === owner && u.typeKey === 'DUELIST') {
        kinesisAlive = true;
        u.kinesisExtraMove = 1;
        u.zephyrExtraMove = 1; // 内部プロパティも同期
        break;
      }
    }
    if (kinesisAlive) break;
  }

  if (kinesisAlive) {
    tokens.push({
      id: `${owner}_move_kinesis`,
      type: 'move',
      name: 'キネシス専用移動',
      badgeText: 'キネシス専用移動',
      icon: '⚡👟',
      scope: 'DUELIST',
      unitType: 'DUELIST',
      unitName: 'キネシス',
      used: false,
      desc: 'キネシスのパッシブ『ライトニング・ステップ』による専用移動トークン。共通移動とは独立してキネシスのみが移動できます。'
    });
  }

  playerTokens[owner] = tokens;
  syncActionTokensCount(owner);
}

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

export function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

// 盤面をクリア（空にする）
export function clearBoard() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      board[r][c] = null;
    }
  }
  traps.length = 0;
  plasmaZones.length = 0;
  phantomZones.length = 0;
  poisonZones.length = 0;
  return board;
}

// 指定マスにハザードが存在するか判定
export function hasHazardAt(r, c) {
  return (
    plasmaZones.some(pz => pz.r === r && pz.c === c) ||
    phantomZones.some(pz => pz.r === r && pz.c === c) ||
    poisonZones.some(pz => pz.r === r && pz.c === c)
  );
}

// 指定マスにトラップが存在するか判定
export function hasTrapAt(r, c) {
  return traps.some(tp => tp.r === r && tp.c === c);
}

// 重ねがけ禁止判定（ハザードまたはトラップが既に存在するか）
export function hasHazardOrTrapAt(r, c) {
  return hasHazardAt(r, c) || hasTrapAt(r, c);
}

// 指定マスのハザード情報取得（タッチ・クリックで効果を確認するため）
export function getHazardInfoAt(r, c) {
  const pz = plasmaZones.find(z => z.r === r && z.c === c);
  if (pz) {
    return {
      type: 'plasma',
      name: 'プラズマゾーン',
      icon: '⚡',
      owner: pz.owner,
      desc: '持続ダメージゾーン。進入時に 18 ダメージ＋【衰弱(2T)】を付与、滞在時もターンごとに 18 ダメージ。展開ユニット撃破または消去スキルで消滅。',
      category: 'ハザード（展開者生存時永続 / 撃破時同時消滅）'
    };
  }
  const fz = phantomZones.find(z => z.r === r && z.c === c);
  if (fz) {
    return {
      type: 'phantom',
      name: 'ディメンション・ゾーン',
      icon: '👻',
      owner: fz.owner,
      desc: 'フェイズが展開したハザード。侵入した敵ユニット（コア除く）に【弱体化(1T / 被ダメ1.5倍)】を付与！フェイズ撃破時に同時消滅。',
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
      desc: '猛毒が立ち込める危険エリア。侵入した敵ユニット（コア除く）はターン開始時に 5 ダメージを受ける！トキシン撃破時に同時消滅。',
      category: 'ハザード（展開者生存時永続 / 撃破時同時消滅）'
    };
  }
  return null;
}

// 盤面から指定マスの駒を削除
export function removePiece(r, c) {
  if (inBounds(r, c)) {
    board[r][c] = null;
  }
}

// 指定オーナーの配置済み駒キー一覧を取得
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

// 指定マスがその陣営の初期配置可能マスか判定（自陣から縦3マス以内の空きマス）
export function canDeployAt(owner, r, c) {
  if (!inBounds(r, c)) return false;
  const validRows = DEPLOYABLE_ROWS[owner] || [];
  return validRows.includes(r) && !board[r][c];
}

// おすすめ・デフォルト初期配置の適用（各陣営縦3マス以内、選択された5体+コアを配置）
export function applyDefaultPlacement(owner, roster = DEFAULT_ROSTER) {
  // 指定オーナーの既存の駒を一旦全クリア
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] && board[r][c].owner === owner) {
        board[r][c] = null;
      }
    }
  }

  // 5体の配置スロット
  const slotsP1 = [
    { r: 5, c: 3 }, // 前衛中央
    { r: 6, c: 1 }, // 後衛左
    { r: 6, c: 2 }, // 後衛中左
    { r: 6, c: 4 }, // 後衛中右
    { r: 6, c: 5 }  // 後衛右
  ];
  const slotsP2 = [
    { r: 1, c: 3 }, // 前衛中央
    { r: 0, c: 1 }, // 最奥左
    { r: 0, c: 2 }, // 最奥中左
    { r: 0, c: 4 }, // 最奥中右
    { r: 0, c: 5 }  // 最奥右
  ];

  if (owner === 'P1') {
    // コア配置: 最奥中央
    spawnHero('CORE', 'P1', 6, 3);
    // 選択された5体を配置
    for (let i = 0; i < Math.min(roster.length, slotsP1.length); i++) {
      spawnHero(roster[i], 'P1', slotsP1[i].r, slotsP1[i].c);
    }
  } else if (owner === 'P2') {
    // コア配置: 最奥中央
    spawnHero('CORE', 'P2', 0, 3);
    // 選択された5体を配置
    for (let i = 0; i < Math.min(roster.length, slotsP2.length); i++) {
      spawnHero(roster[i], 'P2', slotsP2[i].r, slotsP2[i].c);
    }
  }
}

// ゲーム盤面全体の完全初期化
export function initBoard() {
  clearBoard();
  teamUltGauge = { P1: 0, P2: 0 };
  resetActionTokens('P1');
  resetActionTokens('P2');
  return board;
}

export function resetTurnPassives(owner) {
  const tokens = playerTokens[owner] || [];
  const kinesisToken = tokens.find(t => (t.id === `${owner}_move_kinesis` || t.id === `${owner}_move_zephyr`) && !t.used);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === owner && u.typeKey === 'DUELIST') {
        u.kinesisExtraMove = kinesisToken ? 1 : 0;
        u.zephyrExtraMove = u.kinesisExtraMove;
      }
    }
  }
}

export function spawnHero(typeKey, owner, r, c) {
  const type = HERO_TYPES[typeKey];
  const skills = type.skills || {};

  board[r][c] = {
    id: `${owner}_${typeKey}_${nextUnitUniqueId++}`,
    typeKey,
    name: type.name,
    icon: type.icon,
    owner,
    hp: type.maxHp,
    maxHp: type.maxHp,
    atk: type.atk,
    passive: type.passive || null,

    // キネシス専用追加移動トークン (ライトニング・ステップ)
    kinesisExtraMove: (typeKey === 'DUELIST' ? 1 : 0),
    zephyrExtraMove: (typeKey === 'DUELIST' ? 1 : 0),

    // バフ（持続ターン制）
    buffs: {
      atk_up: null,   // { val: number, turns: number }
      shield: null    // { val: number, turns: number }
    },

    // デバフ（持続ターン制）
    debuffs: {
      weakness: null,   // { turns: number } (現在HP50%減)
      vulnerable: null, // { turns: number } (被ダメージ1.5倍)
      disarm: null,     // { turns: number } (攻撃阻害 / 通常攻撃不可)
      bind: null,       // { turns: number } (行動阻害 / 移動不可)
      silence: null     // { turns: number } (スキル阻害 / スキル不可)
    },

    // スキルストック（Bスキル廃止に伴い stockA のみ）
    stockA: skills.A ? skills.A.maxStock : 0,
    damageDealt: 0,   // 累計与ダメージ
    ultUsed: false
  };
  return board[r][c];
}

// ==========================================
// 5大クラス体系の判定ヘルパー (コア・オブジェクト・ユニットの厳密分離)
// ==========================================
// 1. ユニット (Unit): プレイアブル駒
export function isUnit(unit) {
  return !!(unit && unit.typeKey !== 'CORE' && unit.typeKey !== 'BARRICADE' && unit.typeKey !== 'TURRET');
}

// 2. コア (Core): 最重要拠点
export function isCore(unit) {
  return !!(unit && unit.typeKey === 'CORE');
}

// 3. オブジェクト (Object): 設置物（防壁・タレット）
export function isObject(unit) {
  return !!(unit && (unit.typeKey === 'BARRICADE' || unit.typeKey === 'TURRET'));
}

// バフ付与ヘルパー（防壁・コアへのシールド付与も対応）
export function applyBuff(unit, key, val, turns) {
  if (!unit) return;
  // コアにはシールドバフのみ付与可能（攻撃力増強等は不可）
  if (unit.typeKey === 'CORE' && key !== 'shield') return;
  if (!unit.buffs) unit.buffs = {};
  unit.buffs[key] = { val, turns };
}

// デバフ付与ヘルパー（ユニットのみ有効。オブジェクトやコアにはデバフ無効）
export function applyDebuff(unit, key, turns) {
  if (!unit || !isUnit(unit)) return;
  if (!unit.debuffs) unit.debuffs = {};

  // 衰弱: 付与時に現在HPを50%減！減少したHPは解除時に復元するため記録
  if (key === 'weakness') {
    if (!unit.debuffs.weakness || !unit.debuffs.weakness.turns) {
      const oldHp = unit.hp;
      const newHp = Math.max(1, Math.floor(oldHp * 0.5));
      const lostHp = oldHp - newHp;
      unit.hp = newHp;
      unit.debuffs.weakness = { turns, lostHp };
      return;
    } else {
      // すでに衰弱中なら持続ターンを延長
      unit.debuffs.weakness.turns = Math.max(unit.debuffs.weakness.turns, turns);
      return;
    }
  }

  const cur = unit.debuffs[key];
  const curTurns = cur ? cur.turns : 0;
  unit.debuffs[key] = { turns: Math.max(curTurns, turns) };
}

// バフ判定ヘルパー
export function hasBuff(unit, key) {
  return !!(unit && unit.buffs && unit.buffs[key] && unit.buffs[key].turns > 0);
}

// デバフ判定ヘルパー
export function hasDebuff(unit, key) {
  return !!(unit && unit.debuffs && unit.debuffs[key] && unit.debuffs[key].turns > 0);
}

// 全デバフ解除（メディックの浄化）
export function clearAllDebuffs(unit) {
  if (!unit || !unit.debuffs) return 0;
  // 衰弱解除時: 減少していたHPを復元（最大HPを超えない範囲）
  let restored = 0;
  if (unit.debuffs.weakness && unit.debuffs.weakness.lostHp && unit.hp > 0) {
    const oldHp = unit.hp;
    unit.hp = Math.min(unit.maxHp, unit.hp + unit.debuffs.weakness.lostHp);
    restored = unit.hp - oldHp;
  }
  unit.debuffs = {
    weakness: null,
    vulnerable: null,
    disarm: null,
    bind: null,
    silence: null
  };
  return restored;
}

// ベクターのパッシブ『バンカー・スナイパー』判定 (オブジェクト隣接時に真)
export function isVectorBunkerActive(unit) {
  if (!unit || unit.typeKey !== 'SENTINEL') return false;
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
        if (neighbor && (neighbor.typeKey === 'CORE' || neighbor.typeKey === 'BARRICADE' || neighbor.typeKey === 'TURRET')) {
          return true;
        }
      }
    }
  }
  return false;
}

// 実効攻撃力計算（基本ATK ＋ 攻撃力増強バフ ＋ ベクターのバンカースナイパーパッシブ）
export function getEffectiveAtk(unit) {
  if (!unit) return 0;
  let total = unit.atk;
  if (hasBuff(unit, 'atk_up')) {
    total += unit.buffs.atk_up.val;
  }
  // ベクターのパッシブ: オブジェクト隣接で攻撃力 +4
  if (isVectorBunkerActive(unit)) {
    total += 4;
  }
  return total;
}

// シールド耐久値取得
export function getShieldVal(unit) {
  if (!unit) return 0;
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

// ウルトが発動可能か判定（通常攻撃でチーム累計与ダメージ100達成 ＆ 本人未使用 ＆ スキル阻害なし / スキルトークン消費なし）
export function isUltReady(hero) {
  if (!hero || hero.typeKey === 'CORE' || hero.typeKey === 'BARRICADE' || hero.typeKey === 'TURRET' || hero.ultUsed) return false;
  const heroDef = HERO_TYPES[hero.typeKey];
  if (!heroDef || !heroDef.skills || !heroDef.skills.ULT) return false;
  if (hasDebuff(hero, 'silence')) return false;
  return (teamUltGauge[hero.owner] || 0) >= ULT_REQUIRED_DAMAGE;
}

// 移動可能マス（通常: 周囲8方向1マス。キネシスは専用トークン保持時は共通トークン0でも移動可。行動阻害/バインド時は移動不可）
export function getValidMoves(r, c) {
  const unit = board[r][c];
  if (!unit || unit.typeKey === 'CORE' || unit.typeKey === 'BARRICADE' || unit.typeKey === 'TURRET') return [];
  if (hasDebuff(unit, 'bind')) return []; // 行動阻害中

  // 専用トークン（キネシス等）または共通移動トークンがあるか判定！
  if (!hasActionToken(unit.owner, 'move', 1, unit)) return []; // 移動トークン不足！

  const enemyOwner = (unit.owner === 'P1') ? 'P2' : 'P1';

  // 敵の要塞化（fortress）ユニットを検索
  const enemyFortresses = [];
  for (let tr = 0; tr < ROWS; tr++) {
    for (let tc = 0; tc < COLS; tc++) {
      const u = board[tr][tc];
      if (u && u.owner === enemyOwner && hasBuff(u, 'fortress')) {
        enemyFortresses.push({ r: tr, c: tc });
      }
    }
  }

  const range = hasBuff(unit, 'extended_move') ? 2 : 1;
  const moves = [];
  for (let dr = -range; dr <= range; dr++) {
    for (let dc = -range; dc <= range; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && !board[nr][nc]) {
        // 敵の要塞化ゾーン（周囲1マス）なら侵入不可
        const isBlockedByFortress = enemyFortresses.some(f => Math.abs(nr - f.r) <= 1 && Math.abs(nc - f.c) <= 1);
        if (!isBlockedByFortress) {
          moves.push({ r: nr, c: nc });
        }
      }
    }
  }

  return moves;
}

// 通常攻撃の射程セル（全キャラクター共通: 周囲8方向1マス、タレットは前方6マス）
export function getAttackRangeCells(r, c) {
  const unit = board[r][c];
  if (!unit || unit.atk === 0) return [];
  const cells = [];

  // タレットおよび全ヒーロー共通: 周囲8方向 1マス
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc)) cells.push({ r: nr, c: nc });
    }
  }

  return cells;
}

// 攻撃可能ターゲットマス（ユニットのみ手動攻撃可能。攻撃阻害/disarm中は通常攻撃不可！攻撃トークン必要）
export function getValidAttacks(r, c) {
  const unit = board[r][c];
  if (!unit || unit.atk === 0 || !isUnit(unit)) return [];
  if (hasDebuff(unit, 'disarm')) return []; // 攻撃阻害中！
  if (!hasActionToken(unit.owner, 'attack', 1)) return []; // 攻撃トークン不足！

  const enemyOwner = (unit.owner === 'P1') ? 'P2' : 'P1';
  const rangeCells = getAttackRangeCells(r, c);

  return rangeCells.filter(cell => {
    const target = board[cell.r][cell.c];
    return target && target.owner === enemyOwner;
  });
}

// スキル対象マス計算 (スキル阻害/silence中はスキル不可！スキルトークン消費はなし、ストックまたはウルト解放条件のみ)
export function getValidSkillTargets(r, c, slot) {
  const unit = board[r][c];
  if (!unit || unit.typeKey === 'CORE' || unit.typeKey === 'BARRICADE' || unit.typeKey === 'TURRET') return [];
  if (hasDebuff(unit, 'silence')) return []; // スキル阻害中！

  // 通常スキルAとウルトULTのみ有効
  if (slot !== 'A' && slot !== 'ULT') return [];

  const heroDef = HERO_TYPES[unit.typeKey];
  if (!heroDef || !heroDef.skills) return [];

  // ストックチェック / ウルト解放チェック
  if (slot === 'A' && unit.stockA <= 0) return [];
  if (slot === 'ULT' && (!isUltReady(unit) || unit.ultUsed)) return [];

  const enemyOwner = (unit.owner === 'P1') ? 'P2' : 'P1';
  const allies = unit.owner;
  const targets = [];

  switch (unit.typeKey) {
    // 1. アサルト (キネシス)
    case 'DUELIST': {
      if (slot === 'A') {
        // オーバードライブ: 自身に攻撃力+10 (自身発動)
        targets.push({ r, c });
      } else if (slot === 'ULT') {
        // オメガ・ストライク: 半径2マスの敵全員に20ダメージ (自身発動)
        targets.push({ r, c });
      }
      break;
    }

    // 1-2. アサルト (フェイズ)
    case 'PHANTOM': {
      if (slot === 'A') {
        // テレポート: 自軍ディメンション・ゾーンマスのうち、現在空いているマスへ転移
        const myZones = phantomZones.filter(pz => pz.owner === unit.owner);
        for (const pz of myZones) {
          if (inBounds(pz.r, pz.c) && !board[pz.r][pz.c]) {
            targets.push({ r: pz.r, c: pz.c });
          }
        }
      } else if (slot === 'ULT') {
        // フェイズ・カタストロフ: 自軍ディメンション・ゾーンマスおよび周囲8マスの敵全員に35ダメージ (自軍ディメンション・ゾーンが存在すれば自身発動)
        const hasMyZone = phantomZones.some(pz => pz.owner === unit.owner);
        if (hasMyZone) {
          targets.push({ r, c });
        }
      }
      break;
    }

    // 1-3. アサルト (ニトロ) ★アサルト
    case 'BOMBER': {
      if (slot === 'A') {
        // マイン・プラント: 前方6マスの指定空きマスにマイン（トラップ）を仕掛ける (ハザード・トラップ重複不可)
        const forwardDir = (unit.owner === 'P1') ? -1 : 1; // P1(青)は上方向(-1)、P2(赤)は下方向(+1)
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
        // マキシマム・エクスプロージョン: 自身中心半径2マスの全軍大爆発 (自身発動)
        targets.push({ r, c });
      }
      break;
    }

    // 2. センチネル (ベクター)
    case 'SENTINEL': {
      if (slot === 'A') {
        // フォース・バリケード: 半径2マス以内の空きマスに防壁設置
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
        // バリケード・バッファー: フォース・バリケードのストック全回復 (自身発動)
        targets.push({ r, c });
      }
      break;
    }

    // 2-2. センチネル (ヴァルカン)
    case 'VULCAN': {
      if (slot === 'A') {
        // セントリー・タレット: 半径2マスの空きマスにタレット設置
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
        // フォートレス・プロトコル: セントリー・タレットを中心とした空爆要請
        // 自軍のセントリー・タレットが存在する場合のみ発動可能（自身マスおよびタレットマスを選択可能）
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
          targets.push({ r, c }); // ヴァルカン自身でも発動可能
        }
      }
      break;
    }

    // 2-3. センチネル (トキシン)
    case 'POISON': {
      if (slot === 'A') {
        // トキシック・カーテン: 自身から右または左の直線方向
        if (inBounds(r, c + 1)) targets.push({ r, c: c + 1 });
        if (inBounds(r, c - 1)) targets.push({ r, c: c - 1 });
      } else if (slot === 'ULT') {
        // コア・プロテクト: 自コア周辺8マスにトキシック・ゾーンを展開 (自軍コアが存在すれば自身発動)
        const myCore = findCore(unit.owner);
        if (myCore) {
          targets.push({ r, c });
        }
      }
      break;
    }

    // 3. ディスラプター (グリッチ)
    case 'DISRUPTOR': {
      if (slot === 'A') {
        // グラビティ・ワープ: 自軍アサルト（キネシス、フェイズ、ニトロ）の周囲8マス内の空きマス
        for (let ar = 0; ar < ROWS; ar++) {
          for (let ac = 0; ac < COLS; ac++) {
            const ally = board[ar][ac];
            if (ally && ally.owner === allies && (ally.typeKey === 'DUELIST' || ally.typeKey === 'PHANTOM' || ally.typeKey === 'BOMBER')) {
              for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                  if (dr === 0 && dc === 0) continue;
                  const nr = ar + dr, nc = ac + dc;
                  if (inBounds(nr, nc) && !board[nr][nc]) {
                    if (!targets.some(t => t.r === nr && t.c === nc)) {
                      targets.push({ r: nr, c: nc });
                    }
                  }
                }
              }
            }
          }
        }
      } else if (slot === 'ULT') {
        // 緊急回避: 盤面の任意の空きマス
        for (let tr = 0; tr < ROWS; tr++) {
          for (let tc = 0; tc < COLS; tc++) {
            if (!board[tr][tc]) targets.push({ r: tr, c: tc });
          }
        }
      }
      break;
    }

    // 3-2. ディスラプター (サイファー)
    case 'CYPHER': {
      if (slot === 'A') {
        // シグナル・ジャミング: 自身の前方一直線上（P1は上一直線、P2は下一直線）のうち、一番最初に接触したユニット（味方ユニットなら攻撃+15、敵ユニットなら沈黙2T）
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
            break; // 障害物またはユニットに当たったら射線停止
          }
          step++;
        }
      } else if (slot === 'ULT') {
        // フルスペクトラム・ブラックアウト: 全敵ユニットに行動阻害＆攻撃阻害 (自身発動)
        targets.push({ r, c });
      }
      break;
    }

    // 4. サポート (アイリス)
    case 'MEDIC': {
      if (slot === 'A') {
        // ライフ・リペア: 半径3マス以内の味方ユニット1体（HP回復）
        for (let dr = -3; dr <= 3; dr++) {
          for (let dc = -3; dc <= 3; dc++) {
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc)) {
              const t = board[nr][nc];
              if (t && t.owner === allies && t.typeKey !== 'CORE' && t.typeKey !== 'BARRICADE' && t.typeKey !== 'TURRET') {
                targets.push({ r: nr, c: nc });
              }
            }
          }
        }
      } else if (slot === 'ULT') {
        // オーバーチャージ・オーラ: 自軍全軍にシールド+15/2T (自身発動)
        targets.push({ r, c });
      }
      break;
    }

    // 4-2. サポート (ネクサス)
    case 'HACKER': {
      if (slot === 'A') {
        // リモート・ハック: 距離無制限でユニット1体を選択（味方ユニットならHP15回復、敵ユニットなら行動阻害1T）
        for (let tr = 0; tr < ROWS; tr++) {
          for (let tc = 0; tc < COLS; tc++) {
            const t = board[tr][tc];
            if (t && t.typeKey !== 'CORE' && t.typeKey !== 'BARRICADE' && t.typeKey !== 'TURRET' && (tr !== r || tc !== c)) {
              targets.push({ r: tr, c: tc });
            }
          }
        }
      } else if (slot === 'ULT') {
        // EMP: フィールド上の任意の1マスを選択し、半径2マスの敵設置物・トラップ・ハザード破壊
        for (let tr = 0; tr < ROWS; tr++) {
          for (let tc = 0; tc < COLS; tc++) {
            targets.push({ r: tr, c: tc });
          }
        }
      }
      break;
    }
  }

  return targets;
}
