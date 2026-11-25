/* ==============================================================
   ai.js: CPU (AI) 思考ルーチン - スマート連携・キル優先・ハザード回避対応
   (UI/DOM直接参照を排除し、エラーハンドリングを完全装備)
   ============================================================== */
import { ROWS, COLS } from './config.js?v=lab-white-3';
import {
  board,
  getValidMoves,
  getValidAttacks,
  getValidSkillTargets,
  getAttackRangeCells,
  getEffectiveAtk,
  getHazardInfoAt,
  isUltReady,
  hasDebuff,
  hasAnyDebuff,
  hasActionOrder,
  isUnit,
  isObject
} from './board.js?v=lab-white-3';
import { getSkillImpact } from './battle-targets.js';
import { executeMove, executeAttack, executeSkill } from './actions.js?v=lab-white-3';
import { setPhaseInstruction } from './ui.js?v=lab-white-8';

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

function getMyHeroes(aiOwner = 'P2') {
  const heroes = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === aiOwner && isUnit(u)) {
        heroes.push({ r, c, unit: u });
      }
    }
  }
  return heroes;
}

export async function runAITurn({ aiOwner = 'P2', signal, performAction, onGameOver, onEndTurnCallback, updateViewCallback }) {
  const humanOwner = aiOwner === 'P1' ? 'P2' : 'P1';
  let gameOverTriggered = false;
  const handleGameOver = (winner, reason = 'anchor', context = null) => {
    gameOverTriggered = true;
    if (typeof onGameOver === 'function') {
      onGameOver(winner, reason, context);
    }
  };
  const act = async (execute, args, delay) => {
    await Promise.all([
      performAction(async presentation => {
        await execute(...args, handleGameOver, presentation);
        if (!signal.aborted && !gameOverTriggered) updateViewCallback?.();
      }),
      sleep(delay)
    ]);
    return !signal.aborted && !gameOverTriggered;
  };

  try {
    setPhaseInstruction("ENEMY AI思考中...");
    await sleep(400);
    if (signal.aborted) return;

    const usedSkillUnitIds = new Set();

    // =============================================================
    // 1. ウルト判定
    // =============================================================
    const curHeroesForUlt = getMyHeroes(aiOwner);
    const bestUlt = evaluateBestUlt(curHeroesForUlt);
    if (bestUlt && bestUlt.score >= 25) {
      const casterId = board[bestUlt.heroPos.r]?.[bestUlt.heroPos.c]?.id;
      if (!await act(executeSkill, [bestUlt.heroPos, bestUlt.targetPos, 'ULT'], 500)) return;
      if (casterId) usedSkillUnitIds.add(casterId);
    }

    // =============================================================
    // 2. 通常スキル使用判定 (1ターンにユニット各1回、有効な状況で使用)
    // =============================================================
    for (let step = 0; step < 2; step++) {
      const curHeroes = getMyHeroes(aiOwner).filter(h => !usedSkillUnitIds.has(h.unit.id));
      const bestSkill = evaluateBestNormalSkill(curHeroes);
      if (!bestSkill || bestSkill.score <= 0) break;

      const casterId = board[bestSkill.heroPos.r]?.[bestSkill.heroPos.c]?.id;
      if (!await act(executeSkill, [bestSkill.heroPos, bestSkill.targetPos, 'A'], 400)) return;
      if (casterId) usedSkillUnitIds.add(casterId);
    }

    // =============================================================
    // 3. 通常攻撃 (移動前)
    // =============================================================
    for (let atkStep = 0; atkStep < 3; atkStep++) {
      if (!hasActionOrder(aiOwner, 'attack', 1)) break;
      const curHeroes = getMyHeroes(aiOwner);
      const bestAttack = evaluateBestAttack(curHeroes, humanOwner);
      if (!bestAttack) break;
      if (!await act(executeAttack, [bestAttack.from, bestAttack.target], 450)) return;
    }

    // =============================================================
    // 4. 移動 (共通移動オーダーおよび専用移動オーダーを順次消費)
    // =============================================================
    for (let m = 0; m < 2; m++) {
      if (!hasActionOrder(aiOwner, 'move', 1)) break;
      const curHeroes = getMyHeroes(aiOwner);
      const bestMove = evaluateBestMove(curHeroes, humanOwner);
      if (!bestMove) break;
      if (!await act(executeMove, [bestMove.from, bestMove.to], 450)) return;
    }

    // =============================================================
    // 5. 移動後の追撃通常攻撃 (まだ攻撃オーダーが残っていれば実行)
    // =============================================================
    for (let atkStep = 0; atkStep < 3; atkStep++) {
      if (!hasActionOrder(aiOwner, 'attack', 1)) break;
      const curHeroes = getMyHeroes(aiOwner);
      const bestAttack = evaluateBestAttack(curHeroes, humanOwner);
      if (!bestAttack) break;
      if (!await act(executeAttack, [bestAttack.from, bestAttack.target], 450)) return;
    }

    // =============================================================
    // 6. 移動後の追加通常スキル (まだ未使用のユニットで有効なものがあれば)
    // =============================================================
    const remainingHeroes = getMyHeroes(aiOwner).filter(h => !usedSkillUnitIds.has(h.unit.id));
    const bestPostSkill = evaluateBestNormalSkill(remainingHeroes);
    if (bestPostSkill && bestPostSkill.score > 20) {
      const casterId = board[bestPostSkill.heroPos.r]?.[bestPostSkill.heroPos.c]?.id;
      if (!await act(executeSkill, [bestPostSkill.heroPos, bestPostSkill.targetPos, 'A'], 400)) return;
      if (casterId) usedSkillUnitIds.add(casterId);
    }
  } catch (err) {
    console.error("AI turn encountered an error:", err);
  } finally {
    if (!signal.aborted && !gameOverTriggered) {
      await sleep(250);
      if (!signal.aborted) onEndTurnCallback?.();
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
  const heal = (pieces, amount) => pieces.reduce((sum, piece) => sum + Math.min(amount, piece.maxHp - piece.hp), 0);
  const cleanse = pieces => pieces.filter(hasAnyDebuff).length * 20;
  const damage = (pieces, amount) => pieces.reduce((sum, piece) => {
    const potential = hasDebuff(piece, 'vulnerable') ? Math.floor(amount * 1.5) : amount;
    return sum + Math.min(potential, piece.hp + piece.getShieldVal()) +
      (piece.hp + piece.getShieldVal() <= potential ? (piece.isAnchor() ? 1000 : 35) : 0);
  }, 0);
  const shields = (pieces, amount) => pieces.reduce((sum, piece) =>
    sum + (near(enemies.filter(isUnit), piece, 2).length ? amount : 0), 0);
  const ult = slot === 'ULT';
  const { targets, shieldTargets } = getSkillImpact(hero, slot, tPos, board);

  switch (hero.typeKey) {
    case 'PRISM': return ult ? damage(targets, hero.skills.ULT.damage) :
      targets.filter(piece => !hasDebuff(piece, 'bind')).length * 17;
    case 'NEXUS': return shields(targets, hero.skills[slot].shieldVal) +
      (ult ? 0 : targets.filter(piece => near(enemies, piece, 1).length).length * 5);
    case 'LILY': return heal(targets, hero.skills[slot].heal) + cleanse(targets);
    case 'WARDEN': return ult ? targets.length * 23 + shields(shieldTargets, hero.skills.ULT.shieldVal) :
      (near(enemies, tPos, 1).length ? 12 : 0);
    case 'BLAST': return damage(targets, hero.skills[slot].damage);
    case 'SMOG': {
      if (ult) return damage(targets, 10) + targets.length * 7;
      const target = board[tPos.r][tPos.c];
      if (target && target.owner !== hero.owner && target.isUnit()) return 14 + damage([target], 5);
      const atCaster = tPos.r === hero.r && tPos.c === hero.c;
      return atCaster && getHazardInfoAt(hero.r, hero.c)?.owner !== hero.owner ? 11 : 0;
    }
    case 'GLITCH': return targets.length * (ult ? 23 : 13);
    case 'HIVE': return near(enemies, tPos, 1).length * 12 + (ult ? 12 + shields(targets, hero.skills.ULT.shieldVal) : 0);
    case 'VULCAN': return ult ? damage(targets, hero.skills.ULT.damage) : near(enemies.filter(isUnit), tPos, 1).length * 10;
    case 'HALO': return ult ? heal([hero, ...targets.filter(piece => piece !== hero)], 20) : heal(targets, 20);
    case 'KINESIS':
      return ult ? (near(enemies, hero, 1).length ? 30 : 0) :
        (hero.getValidMoves({ board }).some(pos => near(enemies, pos, 1).length) ? 13 : 0);
    case 'VEIL': {
      const currentThreats = near(enemies.filter(isUnit), hero, 1).length;
      if (ult) return currentThreats * 15 + (currentThreats && hero.hp <= 40 ? 15 : 0);
      const threats = near(enemies.filter(isUnit), tPos, 1).length;
      if (hero.hp <= 40) return (currentThreats - threats) * 20;
      return near(enemies, tPos, 1).length && !near(allies.filter(piece => piece !== hero), tPos, 1).length ? 12 : 0;
    }
    default: return 0;
  }
}

// -------------------------------------------------------------
// 通常攻撃候補の評価
// -------------------------------------------------------------
function evaluateBestAttack(myHeroes, humanOwner = 'P1') {
  let best = null;
  let highestScore = -9999;

  for (const h of myHeroes) {
    if (hasDebuff(h.unit, 'disarm')) continue;
    if (!hasActionOrder(h.unit.owner, 'attack', 1, h.unit)) continue;

    const attacks = getValidAttacks(h.r, h.c);
    for (const at of attacks) {
      const target = board[at.r]?.[at.c];
      if (!target || target.owner !== humanOwner) continue;

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
              if (eu && eu.owner === humanOwner && isUnit(eu)) {
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
function evaluateBestMove(myHeroes, humanOwner = 'P1') {
  let best = null;
  let highestScore = -9999;

  let enemyCorePos = null;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.typeKey === 'ANCHOR' && u.owner === humanOwner) {
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
      const zone = getHazardInfoAt(m.r, m.c);
      if (zone && zone.owner !== h.unit.owner) score -= 15;
      if (zone?.owner === h.unit.owner && h.unit.typeKey === 'SMOG') score += 10;

      // 2. 移動後に通常攻撃可能な敵がいるか
      let canAttackEnemy = false;
      let canAttackCore = false;
      const rangeCells = getAttackRangeCells(m.r, m.c);
      for (const cell of rangeCells) {
        const u = board[cell.r][cell.c];
        if (u && u.owner === humanOwner) {
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
