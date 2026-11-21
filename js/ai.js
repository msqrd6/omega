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
  hasActionToken,
  isUnit,
  isObject,
  isCore
} from './board.js?v=urban-v1';
import { executeMove, executeAttack, executeSkill } from './actions.js?v=urban-v13';
import { setPhaseInstruction } from './ui.js?v=urban-v1';

// RULEBOOK正式名と旧エイリアスの双方に対応する判定ヘルパー
const isType = (u, ...keys) => {
  if (!u || !u.typeKey) return false;
  const k = u.typeKey.toUpperCase();
  return keys.some(target => {
    const t = target.toUpperCase();
    if (t === 'IRIS' || t === 'MEDIC') return k === 'IRIS' || k === 'MEDIC';
    if (t === 'NEXUS' || t === 'HACKER') return k === 'NEXUS' || k === 'HACKER';
    if (t === 'KINESIS' || t === 'DUELIST') return k === 'KINESIS' || k === 'DUELIST';
    if (t === 'PHASE' || t === 'PHANTOM') return k === 'PHASE' || k === 'PHANTOM';
    if (t === 'VECTOR' || t === 'SENTINEL') return k === 'VECTOR' || k === 'SENTINEL';
    if (t === 'TOXIN' || t === 'POISON') return k === 'TOXIN' || k === 'POISON';
    if (t === 'GLITCH' || t === 'DISRUPTOR') return k === 'GLITCH' || k === 'DISRUPTOR';
    if (t === 'NITRO' || t === 'BOMBER') return k === 'NITRO' || k === 'BOMBER';
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
  const handleGameOver = (winner, reason = 'core', context = null) => {
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
    if (bestUlt && bestUlt.score >= 50) {
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
      if (!hasActionToken('P2', 'attack', 1)) break;
      const curHeroes = getMyHeroes();
      const bestAttack = evaluateBestAttack(curHeroes);
      if (!bestAttack) break;
      executeAttack(bestAttack.from, bestAttack.target, handleGameOver);
      if (gameOverTriggered) return;
      if (typeof updateViewCallback === 'function') updateViewCallback();
      await sleep(450);
    }

    // =============================================================
    // 4. 移動 (共通移動トークンおよび専用移動トークンを順次消費)
    // =============================================================
    for (let m = 0; m < 2; m++) {
      if (!hasActionToken('P2', 'move', 1)) break;
      const curHeroes = getMyHeroes();
      const bestMove = evaluateBestMove(curHeroes);
      if (!bestMove) break;
      executeMove(bestMove.from, bestMove.to, handleGameOver);
      if (gameOverTriggered) return;
      if (typeof updateViewCallback === 'function') updateViewCallback();
      await sleep(450);
    }

    // =============================================================
    // 5. 移動後の追撃通常攻撃 (まだ攻撃トークンが残っていれば実行)
    // =============================================================
    for (let atkStep = 0; atkStep < 3; atkStep++) {
      if (!hasActionToken('P2', 'attack', 1)) break;
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

// 個別スキルの有用性スコアリング
function scoreSkillAction(h, slot, tPos) {
  const hero = h.unit;
  let score = 0;

  // 1. 回復・支援スキル (アイリス A, ネクサス A)
  if ((isType(hero, 'IRIS') && slot === 'A') || (isType(hero, 'NEXUS') && slot === 'A')) {
    const ally = board[tPos.r]?.[tPos.c];
    if (ally) {
      const allyDebuffed = hasAnyDebuff(ally);
      const missingHp = ally.maxHp - ally.hp;
      if (missingHp > 0 || allyDebuffed) {
        const hpPct = ally.hp / ally.maxHp;
        score = (1 - hpPct) * 100;
        if (ally.hp <= 35) score += 60;
        if (isType(hero, 'NEXUS') && allyDebuffed) score += 45;
        if (missingHp < 10 && !allyDebuffed) score = 5;
      } else {
        score = -999;
      }
    } else {
      score = -999;
    }
  }

  // 2. 全体シールド (アイリス ULT)
  else if (isType(hero, 'IRIS') && slot === 'ULT') {
    let hurtAllies = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const u = board[r][c];
        if (u && u.owner === 'P2' && u.hp < u.maxHp) hurtAllies++;
      }
    }
    score = 30 + hurtAllies * 25;
  }

  // 3. EMP (ネクサス ULT)
  else if (isType(hero, 'NEXUS') && slot === 'ULT') {
    let targetCount = 0;
    let healCount = 0;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = tPos.r + dr, nc = tPos.c + dc;
        if (inBounds(nr, nc)) {
          const u = board[nr][nc];
          if (u && u.owner === 'P1' && isObject(u)) targetCount++;
          if (u && u.owner === 'P2' && isUnit(u) && u.hp < u.maxHp) healCount++;
          if (hasHazardAt(nr, nc)) targetCount++;
        }
      }
    }
    score = targetCount * 35 + healCount * 25;
  }

  // 3-2. サンクチュアリ (オーラ A)
  else if (isType(hero, 'AURA') && slot === 'A') {
    let hurtCount = 0;
    let totalMissing = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = h.r + dr, nc = h.c + dc;
        if (inBounds(nr, nc)) {
          const u = board[nr][nc];
          if (u && u.owner === hero.owner && isUnit(u) && u.hp < u.maxHp) {
            hurtCount++;
            totalMissing += Math.min(20, u.maxHp - u.hp);
          }
        }
      }
    }
    if (hurtCount === 0 || totalMissing < 10) {
      score = -999;
    } else {
      score = totalMissing * 3 + hurtCount * 25;
    }
  }

  // 3-3. レスキュー・ワープ (オーラ ULT)
  else if (isType(hero, 'AURA') && slot === 'ULT') {
    let baseScore = 30;
    let rescueScore = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = tPos.r + dr, nc = tPos.c + dc;
        if (inBounds(nr, nc)) {
          const u = board[nr][nc];
          if (u && u.owner === hero.owner && isUnit(u) && u.hp < u.maxHp) {
            const healPotential = Math.min(20, u.maxHp - u.hp);
            rescueScore += (healPotential / 20) * 50;
          }
        }
      }
    }
    score = baseScore + rescueScore;
  }

  // 4. オーバードライブ (キネシス A)
  else if (isType(hero, 'KINESIS') && slot === 'A') {
    let hasNearbyPrey = false;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = h.r + dr, nc = h.c + dc;
        if (inBounds(nr, nc)) {
          const e = board[nr][nc];
          if (e && e.owner === 'P1' && (e.typeKey === 'CORE' || e.hp <= 30)) {
            hasNearbyPrey = true;
          }
        }
      }
    }
    score = hasNearbyPrey ? 65 : 25;
  }

  // 5. ライトニング・ラッシュ (キネシス ULT)
  else if (isType(hero, 'KINESIS') && slot === 'ULT') {
    let hasTarget = false;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = h.r + dr, nc = h.c + dc;
        if (inBounds(nr, nc)) {
          const e = board[nr][nc];
          if (e && e.owner === 'P1') hasTarget = true;
        }
      }
    }
    score = hasTarget ? 90 : 30;
  }

  // 6. テレポート (フェイズ A)
  else if (isType(hero, 'PHASE') && slot === 'A') {
    score = (hero.hp <= 40) ? 65 : -999;
  }

  // 7. シャドウ・ドレイン (フェイズ ULT)
  else if (isType(hero, 'PHASE') && slot === 'ULT') {
    const needHeal = hero.maxHp - hero.hp;
    const canAttackThisTurn = hasActionToken('P2', 'attack', 1) && !hasDebuff(hero, 'disarm');
    const targetsInRange = canAttackThisTurn ? getValidAttacks(h.r, h.c).length : 0;
    score = (needHeal >= 15 && targetsInRange > 0) ? 85 : 0;
  }

  // 8. 防壁設置 (ベクター A)
  else if (isType(hero, 'VECTOR') && slot === 'A') {
    score = 40;
  }

  // 9. 防壁バッファー (ベクター ULT)
  else if (isType(hero, 'VECTOR') && slot === 'ULT') {
    score = (hero.stockA === 0) ? 65 : 20;
  }

  // 10. トキシック・カーテン (トキシン A)
  else if (isType(hero, 'TOXIN') && slot === 'A') {
    score = 45;
  }

  // 11. バイオハザード (トキシン ULT)
  else if (isType(hero, 'TOXIN') && slot === 'ULT') {
    let enemiesNear = 0;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = h.r + dr, nc = h.c + dc;
        if (inBounds(nr, nc)) {
          const e = board[nr][nc];
          if (e && e.owner === 'P1') enemiesNear++;
        }
      }
    }
    score = (enemiesNear > 0) ? 80 : 40;
  }

  // 12. タレット設置 (ヴァルカン A)
  else if (isType(hero, 'VULCAN') && slot === 'A') {
    score = 60;
  }

  // 13. フォートレス・プロトコル (ヴァルカン ULT)
  else if (isType(hero, 'VULCAN') && slot === 'ULT') {
    let hitCount = 0;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = tPos.r + dr, nc = tPos.c + dc;
        if (inBounds(nr, nc)) {
          const u = board[nr][nc];
          if (u && u.owner === 'P1' && !isCore(u) && (isUnit(u) || isObject(u))) hitCount++;
        }
      }
    }
    score = hitCount > 0 ? 50 + hitCount * 30 : 0;
  }

  // 14. グラビティ・ワープ (グリッチ A)
  else if (isType(hero, 'GLITCH') && slot === 'A') {
    let enemiesAtLanding = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = tPos.r + dr, nc = tPos.c + dc;
        if (inBounds(nr, nc)) {
          const u = board[nr][nc];
          if (u && u.owner === 'P1' && isUnit(u)) enemiesAtLanding++;
        }
      }
    }
    score = enemiesAtLanding > 0 ? 45 + enemiesAtLanding * 25 : 15;
  }

  // 15. 緊急回避 (グリッチ ULT)
  else if (isType(hero, 'GLITCH') && slot === 'ULT') {
    score = (hero.hp < 40) ? 90 : 10;
  }

  // 16. ビット・デプロイ (ハイヴ A)
  else if (isType(hero, 'HIVE') && slot === 'A') {
    let enemiesNear = 0;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = tPos.r + dr, nc = tPos.c + dc;
        if (inBounds(nr, nc)) {
          const u = board[nr][nc];
          if (u && u.owner !== hero.owner) enemiesNear++;
        }
      }
    }
    score = 50 + enemiesNear * 15;
  }

  // 17. スウォーム・オーバードライブ (ハイヴ ULT)
  else if (isType(hero, 'HIVE') && slot === 'ULT') {
    let bitCount = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const u = board[r][c];
        if (u && u.owner === hero.owner && u.typeKey === 'BIT') bitCount++;
      }
    }
    score = bitCount * 40;
  }

  // 18. 自壊 (ビット A)
  else if (isType(hero, 'BIT') && slot === 'A') {
    score = -999;
  }

  // 19. 地雷設置 (ニトロ A)
  else if (isType(hero, 'NITRO') && slot === 'A') {
    score = 45;
  }

  // 20. 大爆破 (ニトロ ULT)
  else if (isType(hero, 'NITRO') && slot === 'ULT') {
    let enemies = 0;
    let allies = 0;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = h.r + dr, nc = h.c + dc;
        if (inBounds(nr, nc)) {
          const u = board[nr][nc];
          if (u && u.owner === 'P1') enemies++;
          if (u && u.owner === 'P2' && u !== hero) allies++;
        }
      }
    }
    score = enemies * 45 - allies * 30;
  }

  // 21. シグナル・ジャミング (サイファー A)
  else if (isType(hero, 'CYPHER') && slot === 'A') {
    const target = board[tPos.r]?.[tPos.c];
    if (target) {
      if (target.owner === 'P1') {
        if (!hasDebuff(target, 'disarm')) {
          score = 60;
          if (isType(target, 'KINESIS') || isType(target, 'PHASE')) score += 25;
        }
      } else if (target.owner === 'P2') {
        score = 50;
      }
    }
  }

  // 22. フルスペクトラム・ブラックアウト (サイファー ULT)
  else if (isType(hero, 'CYPHER') && slot === 'ULT') {
    score = 70;
  }

  return score;
}

// -------------------------------------------------------------
// 通常攻撃候補の評価
// -------------------------------------------------------------
function evaluateBestAttack(myHeroes) {
  let best = null;
  let highestScore = -9999;

  for (const h of myHeroes) {
    if (hasDebuff(h.unit, 'disarm')) continue;
    if (!hasActionToken(h.unit.owner, 'attack', 1, h.unit)) continue;

    const attacks = getValidAttacks(h.r, h.c);
    for (const at of attacks) {
      const target = board[at.r]?.[at.c];
      if (!target || target.owner !== 'P1') continue;

      let score = 0;
      const effAtk = getEffectiveAtk(h.unit);

      if (target.typeKey === 'CORE') {
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
            if (isType(target, 'IRIS')) score += 120;
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
      if (u && u.typeKey === 'CORE' && u.owner === 'P1') {
        enemyCorePos = { r, c };
        break;
      }
    }
    if (enemyCorePos) break;
  }

  for (const h of myHeroes) {
    if (hasDebuff(h.unit, 'bind')) continue;
    if (!hasActionToken(h.unit.owner, 'move', 1, h.unit)) continue;

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
          if (u.typeKey === 'CORE') canAttackCore = true;
        }
      }

      if (canAttackCore) score += 250;
      else if (canAttackEnemy) score += 90;

      // 3. 敵コアへの接近
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
