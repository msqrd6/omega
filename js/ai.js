/* ==============================================================
   ai.js: CPU (AI) 思考ルーチン - スマート連携・キル優先・ハザード回避対応
   (UI/DOM直接参照を排除し、エラーハンドリングを完全装備)
   ============================================================== */
import { ROWS, COLS } from './config.js?v=urban-v1';
import {
  board,
  inBounds,
  getValidMoves,
  getValidAttacks,
  getValidSkillTargets,
  getAttackRangeCells,
  getEffectiveAtk,
  hasHazardAt,
  isUltReady,
  hasDebuff,
  hasAnyDebuff,
  hasActionOrder,
  isUnit,
  isObject,
  isAnchor
} from './board.js?v=urban-v1';
import { executeMove, executeAttack, executeSkill } from './actions.js?v=urban-v13';
import { setPhaseInstruction } from './ui.js?v=urban-v13';

// RULEBOOK正式名と旧エイリアスの双方に対応する判定ヘルパー
const isType = (u, ...keys) => {
  if (!u || !u.typeKey) return false;
  const k = u.typeKey.toUpperCase();
  return keys.some(target => {
    const t = target.toUpperCase();
    if (t === 'LILY' || t === 'MEDIC') return k === 'LILY' || k === 'MEDIC';
    if (t === 'NEXUS' || t === 'HACKER') return k === 'NEXUS' || k === 'HACKER';
    if (t === 'KINESIS' || t === 'DUELIST') return k === 'KINESIS' || k === 'DUELIST';
    if (t === 'VEIL' || t === 'PHANTOM') return k === 'VEIL' || k === 'PHANTOM';
    if (t === 'WARDEN' || t === 'SENTINEL') return k === 'WARDEN' || k === 'SENTINEL';
    if (t === 'SMOG' || t === 'POISON') return k === 'SMOG' || k === 'POISON';
    if (t === 'GLITCH' || t === 'DISRUPTOR') return k === 'GLITCH' || k === 'DISRUPTOR';
    if (t === 'BLAST' || t === 'BOMBER') return k === 'BLAST' || k === 'BOMBER';
    return k === t;
  });
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getMyHeroes() {
  const heroes = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === 'P2' && isUnit(u)) {
        heroes.push({ r, c, unit: u });
      }
    }
  }
  return heroes;
}

export async function runAITurn({ onGameOver, onEndTurnCallback, updateViewCallback }) {
  let gameOverTriggered = false;
  const handleGameOver = (winner, reason = 'anchor', context = null) => {
    gameOverTriggered = true;
    if (typeof onGameOver === 'function') {
      onGameOver(winner, reason, context);
    }
  };

  try {
    setPhaseInstruction("ENEMY AI思考中...");
    await sleep(400);

    const usedSkillUnitIds = new Set();

    // =============================================================
    // 1. ウルト判定
    // =============================================================
    const curHeroesForUlt = getMyHeroes();
    const bestUlt = evaluateBestUlt(curHeroesForUlt);
    if (bestUlt && bestUlt.score >= 25) {
      const casterId = board[bestUlt.heroPos.r]?.[bestUlt.heroPos.c]?.id;
      executeSkill(bestUlt.heroPos, bestUlt.targetPos, 'ULT', handleGameOver);
      if (gameOverTriggered) return;
      if (casterId) usedSkillUnitIds.add(casterId);
      if (typeof updateViewCallback === 'function') updateViewCallback();
      await sleep(500);
    }

    // =============================================================
    // 2. 通常スキル使用判定 (1ターンにユニット各1回、有効な状況で使用)
    // =============================================================
    for (let step = 0; step < 2; step++) {
      const curHeroes = getMyHeroes().filter(h => !usedSkillUnitIds.has(h.unit.id));
      const bestSkill = evaluateBestNormalSkill(curHeroes);
      if (!bestSkill || bestSkill.score <= 0) break;

      const casterId = board[bestSkill.heroPos.r]?.[bestSkill.heroPos.c]?.id;
      executeSkill(bestSkill.heroPos, bestSkill.targetPos, 'A', handleGameOver);
      if (gameOverTriggered) return;
      if (casterId) usedSkillUnitIds.add(casterId);
      if (typeof updateViewCallback === 'function') updateViewCallback();
      await sleep(400);
    }

    // =============================================================
    // 3. 通常攻撃 (移動前)
    // =============================================================
    for (let atkStep = 0; atkStep < 3; atkStep++) {
      if (!hasActionOrder('P2', 'attack', 1)) break;
      const curHeroes = getMyHeroes();
      const bestAttack = evaluateBestAttack(curHeroes);
      if (!bestAttack) break;
      executeAttack(bestAttack.from, bestAttack.target, handleGameOver);
      if (gameOverTriggered) return;
      if (typeof updateViewCallback === 'function') updateViewCallback();
      await sleep(450);
    }

    // =============================================================
    // 4. 移動 (共通移動オーダーおよび専用移動オーダーを順次消費)
    // =============================================================
    for (let m = 0; m < 2; m++) {
      if (!hasActionOrder('P2', 'move', 1)) break;
      const curHeroes = getMyHeroes();
      const bestMove = evaluateBestMove(curHeroes);
      if (!bestMove) break;
      executeMove(bestMove.from, bestMove.to, handleGameOver);
      if (gameOverTriggered) return;
      if (typeof updateViewCallback === 'function') updateViewCallback();
      await sleep(450);
    }

    // =============================================================
    // 5. 移動後の追撃通常攻撃 (まだ攻撃オーダーが残っていれば実行)
    // =============================================================
    for (let atkStep = 0; atkStep < 3; atkStep++) {
      if (!hasActionOrder('P2', 'attack', 1)) break;
      const curHeroes = getMyHeroes();
      const bestAttack = evaluateBestAttack(curHeroes);
      if (!bestAttack) break;
      executeAttack(bestAttack.from, bestAttack.target, handleGameOver);
      if (gameOverTriggered) return;
      if (typeof updateViewCallback === 'function') updateViewCallback();
      await sleep(450);
    }

    // =============================================================
    // 6. 移動後の追加通常スキル (まだ未使用のユニットで有効なものがあれば)
    // =============================================================
    const remainingHeroes = getMyHeroes().filter(h => !usedSkillUnitIds.has(h.unit.id));
    const bestPostSkill = evaluateBestNormalSkill(remainingHeroes);
    if (bestPostSkill && bestPostSkill.score > 20) {
      const casterId = board[bestPostSkill.heroPos.r]?.[bestPostSkill.heroPos.c]?.id;
      executeSkill(bestPostSkill.heroPos, bestPostSkill.targetPos, 'A', handleGameOver);
      if (gameOverTriggered) return;
      if (casterId) usedSkillUnitIds.add(casterId);
      if (typeof updateViewCallback === 'function') updateViewCallback();
      await sleep(400);
    }
  } catch (err) {
    console.error("AI turn encountered an error:", err);
  } finally {
    if (!gameOverTriggered) {
      await sleep(250);
      if (typeof onEndTurnCallback === 'function') {
        onEndTurnCallback();
      }
    }
  }
}

// -------------------------------------------------------------
// ウルト候補の評価
// -------------------------------------------------------------
function evaluateBestUlt(myHeroes) {
  let best = null;
  let highestScore = 0;

  for (const h of myHeroes) {
    if (hasDebuff(h.unit, 'silence')) continue;
    if (!isUltReady(h.unit) || h.unit.ultUsed) continue;

    const targets = getValidSkillTargets(h.r, h.c, 'ULT');
    if (!targets || targets.length === 0) continue;

    for (const tPos of targets) {
      const score = scoreSkillAction(h, 'ULT', tPos);
      if (score > highestScore) {
        highestScore = score;
        best = { heroPos: { r: h.r, c: h.c }, targetPos: tPos, slot: 'ULT', score };
      }
    }
  }

  return best;
}

// -------------------------------------------------------------
// 通常スキル候補の評価
// -------------------------------------------------------------
function evaluateBestNormalSkill(myHeroes) {
  let best = null;
  let highestScore = 0;

  for (const h of myHeroes) {
    if (hasDebuff(h.unit, 'silence')) continue;
    if (h.unit.stockA <= 0) continue;

    const targets = getValidSkillTargets(h.r, h.c, 'A');
    if (!targets || targets.length === 0) continue;

    for (const tPos of targets) {
      const score = scoreSkillAction(h, 'A', tPos);
      if (score > highestScore) {
        highestScore = score;
        best = { heroPos: { r: h.r, c: h.c }, targetPos: tPos, slot: 'A', score };
      }
    }
  }

  return best;
}

// 個別スキルの有用性スアンカーリング
function scoreSkillAction(h, slot, tPos) {
  const hero = h.unit;
  const pieces = board.flat().filter(Boolean);
  const allies = pieces.filter(piece => piece.owner === hero.owner);
  const enemies = pieces.filter(piece => piece.owner !== hero.owner);
  const distance = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
  const near = (pieces, center, radius) => pieces.filter(piece => distance(piece, center) <= radius);
  const heal = (pieces, amount) => pieces.reduce((sum, piece) =>
    sum + (isUnit(piece) ? Math.min(amount, piece.maxHp - piece.hp) : 0), 0);
  const damage = (pieces, amount) => pieces.reduce((sum, piece) =>
    sum + amount + (piece.hp + piece.getShieldVal() <= amount ? (piece.isAnchor() ? 1000 : 35) : 0), 0);
  const shields = (pieces, amount) => pieces.reduce((sum, piece) =>
    sum + (near(enemies.filter(isUnit), piece, 2).length ? Math.max(0, amount - piece.getShieldVal()) : 0), 0);
  const ult = slot === 'ULT';

  switch (hero.typeKey) {
    case 'PRISM': return damage(hero.getMarkedTargets(board, slot), ult ? 20 : 10);
    case 'NEXUS': {
      const linked = hero.getMarkedTargets(board, slot);
      return shields(linked, ult ? 25 : 10) + (ult ? linked.filter(piece => isUnit(piece) && hasAnyDebuff(piece)).length * 20 : 0);
    }
    case 'LILY': return ult ? heal(allies, 15) + 10 : heal([board[tPos.r][tPos.c]], 30);
    case 'WARDEN': return ult ? shields(allies, 15) : (near(enemies, tPos, 1).length ? 12 : 0);
    case 'BLAST': return ult ? damage(near(enemies, hero, 2), 20) - (hero.hp <= 10 ? 35 : 10) : (near(enemies, tPos, 1).length ? 15 : 0);
    case 'SMOG': return ult ? damage(near(enemies.filter(piece => !piece.isAnchor()), hero, 1), 10) : (near(enemies, tPos, 1).length ? 12 : 0);
    case 'GLITCH': return near(enemies.filter(isUnit), tPos, 1).length * (ult ? 23 : 13);
    case 'HIVE': return near(enemies, tPos, 1).length * 12 + (ult ? shields(allies.filter(piece => piece.typeKey === 'BIT'), 15) : 0);
    case 'VULCAN': return ult ? damage(near(enemies.filter(piece => !piece.isAnchor()), tPos, 2), 25) : near(enemies.filter(isUnit), tPos, 1).length * 10;
    case 'HALO': return heal(near(allies, ult ? tPos : hero, 1), 20);
    case 'KINESIS': return near(enemies, hero, 1).length ? (ult ? 30 : 13) : 0;
    case 'VEIL': {
      if (!ult) return hero.hp <= 40 ? 65 : 0;
      return hero.maxHp - hero.hp >= 15 && getValidAttacks(hero.r, hero.c).length ? 45 : 0;
    }
    default: return 0;
  }
}

// -------------------------------------------------------------
// 通常攻撃候補の評価
// -------------------------------------------------------------
function evaluateBestAttack(myHeroes) {
  let best = null;
  let highestScore = -9999;

  for (const h of myHeroes) {
    if (hasDebuff(h.unit, 'disarm')) continue;
    if (!hasActionOrder(h.unit.owner, 'attack', 1, h.unit)) continue;

    const attacks = getValidAttacks(h.r, h.c);
    for (const at of attacks) {
      const target = board[at.r]?.[at.c];
      if (!target || target.owner !== 'P1') continue;

      let score = 0;
      const effAtk = getEffectiveAtk(h.unit, target);

      if (target.typeKey === 'ANCHOR') {
        score += 1000;
        if (target.hp <= effAtk) score += 5000;
      } else if (isUnit(target)) {
        if (target.hp <= effAtk) {
          let enemyUnitsCount = 0;
          for (let er = 0; er < ROWS; er++) {
            for (let ec = 0; ec < COLS; ec++) {
              const eu = board[er][ec];
              if (eu && eu.owner === 'P1' && isUnit(eu)) {
                enemyUnitsCount++;
              }
            }
          }
          if (enemyUnitsCount === 1) {
            score += 5000;
          } else {
            score += 300;
            if (isType(target, 'KINESIS')) score += 150;
            if (isType(target, 'LILY')) score += 120;
          }
        } else {
          score += 100 + (100 - target.hp);
        }
      } else if (isObject(target)) {
        score += 40;
      }

      if (score > highestScore) {
        highestScore = score;
        best = { from: { r: h.r, c: h.c }, target: at, score };
      }
    }
  }

  return best;
}

// -------------------------------------------------------------
// 移動候補の評価
// -------------------------------------------------------------
function evaluateBestMove(myHeroes) {
  let best = null;
  let highestScore = -9999;

  let enemyCorePos = null;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.typeKey === 'ANCHOR' && u.owner === 'P1') {
        enemyCorePos = { r, c };
        break;
      }
    }
    if (enemyCorePos) break;
  }

  for (const h of myHeroes) {
    if (hasDebuff(h.unit, 'bind')) continue;
    if (!hasActionOrder(h.unit.owner, 'move', 1, h.unit)) continue;

    const moves = getValidMoves(h.r, h.c);
    for (const m of moves) {
      let score = 0;

      // 1. ハザードマスの回避
      if (hasHazardAt(m.r, m.c)) {
        score -= 80;
      }

      // 2. 移動後に通常攻撃可能な敵がいるか
      let canAttackEnemy = false;
      let canAttackCore = false;
      const rangeCells = getAttackRangeCells(m.r, m.c);
      for (const cell of rangeCells) {
        const u = board[cell.r][cell.c];
        if (u && u.owner === 'P1') {
          canAttackEnemy = true;
          if (u.typeKey === 'ANCHOR') canAttackCore = true;
        }
      }

      if (canAttackCore) score += 250;
      else if (canAttackEnemy) score += 90;

      // 3. 敵アンカーへの接近
      if (enemyCorePos) {
        const oldDist = Math.abs(h.r - enemyCorePos.r) + Math.abs(h.c - enemyCorePos.c);
        const newDist = Math.abs(m.r - enemyCorePos.r) + Math.abs(m.c - enemyCorePos.c);
        if (newDist < oldDist) {
          score += 20 * (oldDist - newDist);
        }
      }

      // 4. ピンチの味方の後退
      if (h.unit.hp <= 25 && canAttackEnemy) {
        score -= 40;
      }

      if (score > highestScore) {
        highestScore = score;
        best = { from: { r: h.r, c: h.c }, to: m, score };
      }
    }
  }

  return best;
}
