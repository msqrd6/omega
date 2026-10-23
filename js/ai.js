/* ==============================================================
   ai.js: CPU (AI) 思考ルーチン - スマート連携・キル優先・ハザード回避対応
   (大型アップデート: スキルトークン廃止・Bスキル廃止対応)
   ============================================================== */
import { ROWS, COLS } from './config.js?v=20261023_20';
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
  hasActionToken,
  getActionTokens
} from './board.js?v=20261023_20';
import { executeMove, executeAttack, executeSkill } from './actions.js?v=20261023_20';
import { addLog } from './ui.js?v=20261023_20';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getMyHeroes() {
  const heroes = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === 'P2' && u.typeKey !== 'CORE' && u.typeKey !== 'BARRICADE' && u.typeKey !== 'TURRET') {
        heroes.push({ r, c, unit: u });
      }
    }
  }
  return heroes;
}

export async function runAITurn({ onGameOver, onEndTurnCallback, updateViewCallback }) {
  document.getElementById('phase-instruction').innerText = "RED AI思考中...";
  await sleep(400);

  const usedSkillUnitIds = new Set();

  // =============================================================
  // 1. ウルト判定 (チーム通常攻撃100 DMG蓄積で解放される必殺技)
  // =============================================================
  const curHeroesForUlt = getMyHeroes();
  const bestUlt = evaluateBestUlt(curHeroesForUlt);
  if (bestUlt && bestUlt.score >= 50) {
    executeSkill(bestUlt.heroPos, bestUlt.targetPos, 'ULT', onGameOver);
    usedSkillUnitIds.add(board[bestUlt.heroPos.r][bestUlt.heroPos.c]?.id);
    updateViewCallback();
    await sleep(500);
  }

  // =============================================================
  // 2. 通常スキル使用判定 (1ターンにユニット各1回、有効な状況で使用)
  // =============================================================
  for (let step = 0; step < 2; step++) {
    const curHeroes = getMyHeroes().filter(h => !usedSkillUnitIds.has(h.unit.id));
    const bestSkill = evaluateBestNormalSkill(curHeroes);
    if (!bestSkill || bestSkill.score <= 0) break;

    executeSkill(bestSkill.heroPos, bestSkill.targetPos, 'A', onGameOver);
    usedSkillUnitIds.add(board[bestSkill.heroPos.r][bestSkill.heroPos.c]?.id);
    updateViewCallback();
    await sleep(400);
  }

  // =============================================================
  // 3. 通常攻撃 (攻撃トークンが1枚以上あれば実行)
  // =============================================================
  if (hasActionToken('P2', 'attack', 1)) {
    const curHeroes = getMyHeroes();
    const bestAttack = evaluateBestAttack(curHeroes);
    if (bestAttack) {
      executeAttack(bestAttack.from, bestAttack.target, onGameOver);
      updateViewCallback();
      await sleep(500);
    }
  }

  // =============================================================
  // 4. 移動 (共通移動トークンおよび専用移動トークンを順次消費)
  // =============================================================
  for (let m = 0; m < 2; m++) {
    if (!hasActionToken('P2', 'move', 1)) break;
    const curHeroes = getMyHeroes();
    const bestMove = evaluateBestMove(curHeroes);
    if (!bestMove) break;
    executeMove(bestMove.from, bestMove.to, onGameOver);
    updateViewCallback();
    await sleep(500);
  }

  // =============================================================
  // 5. 移動後の追撃通常攻撃 (まだ攻撃トークンが残っていれば実行)
  // =============================================================
  if (hasActionToken('P2', 'attack', 1)) {
    const curHeroes = getMyHeroes();
    const bestAttack = evaluateBestAttack(curHeroes);
    if (bestAttack) {
      executeAttack(bestAttack.from, bestAttack.target, onGameOver);
      updateViewCallback();
      await sleep(500);
    }
  }

  // =============================================================
  // 6. 移動後の追加通常スキル (まだ未使用のユニットで有効なものがあれば)
  // =============================================================
  const remainingHeroes = getMyHeroes().filter(h => !usedSkillUnitIds.has(h.unit.id));
  const bestPostSkill = evaluateBestNormalSkill(remainingHeroes);
  if (bestPostSkill && bestPostSkill.score > 20) {
    executeSkill(bestPostSkill.heroPos, bestPostSkill.targetPos, 'A', onGameOver);
    updateViewCallback();
    await sleep(400);
  }

  // 7. AIターン終了
  await sleep(400);
  onEndTurnCallback();
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
// 通常スキル候補の評価: 通常スキル(A)の中から最も効果的なものを1つ選定
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

  // 1. 回復スキル (アイリス A, ネクサス A)
  if ((hero.typeKey === 'MEDIC' && slot === 'A') || (hero.typeKey === 'HACKER' && slot === 'A')) {
    const ally = board[tPos.r][tPos.c];
    if (ally && ally.hp < ally.maxHp) {
      const missingHp = ally.maxHp - ally.hp;
      const hpPct = ally.hp / ally.maxHp;
      score = (1 - hpPct) * 100;
      if (ally.hp <= 35) score += 60; // ピンチの味方を救助
      if (missingHp < 10) score = 5;  // ほぼ満タンなら温存
    } else {
      score = -999;
    }
  }

  // 2. 全体シールド (アイリス ULT)
  else if (hero.typeKey === 'MEDIC' && slot === 'ULT') {
    let hurtAllies = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const u = board[r][c];
        if (u && u.owner === 'P2' && u.hp < u.maxHp) hurtAllies++;
      }
    }
    score = 30 + hurtAllies * 25;
  }

  // 3. EMP (ネクサス ULT) - 半径2マスの敵設置物・トラップ・ハザード破壊
  else if (hero.typeKey === 'HACKER' && slot === 'ULT') {
    let targetCount = 0;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = tPos.r + dr, nc = tPos.c + dc;
        if (inBounds(nr, nc)) {
          const u = board[nr][nc];
          if (u && u.owner === 'P1' && (u.typeKey === 'BARRICADE' || u.typeKey === 'TURRET')) targetCount++;
          if (hasHazardAt(nr, nc)) targetCount++;
        }
      }
    }
    score = targetCount * 35;
  }

  // 4. 移動拡張 (キネシス A: オーバードライブ)
  else if (hero.typeKey === 'DUELIST' && slot === 'A') {
    // 敵コアまたは瀕死の敵が近くにいれば高評価
    let hasNearbyPrey = false;
    for (let dr = -3; dr <= 3; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
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

  // 5. 追加攻撃トークン (キネシス ULT: ライトニング・ラッシュ)
  else if (hero.typeKey === 'DUELIST' && slot === 'ULT') {
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
  else if (hero.typeKey === 'PHANTOM' && slot === 'A') {
    score = 45;
  }

  // 7. シャドウ・ドレイン (フェイズ ULT)
  else if (hero.typeKey === 'PHANTOM' && slot === 'ULT') {
    const drain = hero.turnDamageDealt || 0;
    const needHeal = hero.maxHp - hero.hp;
    score = (drain > 0 && needHeal >= 15) ? 85 : 0;
  }

  // 8. 防壁設置 (ベクター A)
  else if (hero.typeKey === 'SENTINEL' && slot === 'A') {
    score = 40;
  }

  // 11. 防壁バッファー (ベクター ULT)
  else if (hero.typeKey === 'SENTINEL' && slot === 'ULT') {
    score = 60;
  }

  // 12. トキシック・カーテン (トキシン A)
  else if (hero.typeKey === 'POISON' && slot === 'A') {
    score = 45;
  }

  // 13. コア・プロテクト (トキシン ULT)
  else if (hero.typeKey === 'POISON' && slot === 'ULT') {
    score = 70;
  }

  // 14. タレット設置 (ヴァルカン A)
  else if (hero.typeKey === 'VULCAN' && slot === 'A') {
    score = 60;
  }

  // 15. フォートレス・プロトコル (ヴァルカン ULT)
  else if (hero.typeKey === 'VULCAN' && slot === 'ULT') {
    score = 70;
  }

  // 16. グラビティ・ワープ (グリッチ A)
  else if (hero.typeKey === 'DISRUPTOR' && slot === 'A') {
    score = 40;
  }

  // 17. 緊急回避 (グリッチ ULT)
  else if (hero.typeKey === 'DISRUPTOR' && slot === 'ULT') {
    score = (hero.hp < 40) ? 90 : 10;
  }

  // 18. 地雷設置 (ニトロ A)
  else if (hero.typeKey === 'BOMBER' && slot === 'A') {
    score = 45;
  }

  // 19. 大爆破 (ニトロ ULT)
  else if (hero.typeKey === 'BOMBER' && slot === 'ULT') {
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

  // 20. シグナル・ジャミング (サイファー A)
  else if (hero.typeKey === 'CYPHER' && slot === 'A') {
    const target = board[tPos.r][tPos.c];
    if (target) {
      if (target.owner === 'P1') {
        // 敵なら攻撃阻害 (1T)
        if (!hasDebuff(target, 'disarm')) {
          score = 60;
          if (target.typeKey === 'DUELIST' || target.typeKey === 'PHANTOM') score += 25;
        }
      } else if (target.owner === 'P2') {
        // 味方なら攻撃力増強 (+15)
        score = 50;
      }
    }
  }

  // 21. フルスペクトラム・ブラックアウト (サイファー ULT)
  else if (hero.typeKey === 'CYPHER' && slot === 'ULT') {
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

    const attacks = getValidAttacks(h.r, h.c);
    for (const at of attacks) {
      const target = board[at.r][at.c];
      if (!target || target.owner !== 'P1') continue;

      let score = 0;
      const effAtk = getEffectiveAtk(h.unit);

      // 敵コア破壊は最優先（即勝利）
      if (target.typeKey === 'CORE') {
        score += 1000;
        if (target.hp <= effAtk) score += 5000; // コアトドメ
      } else {
        // 敵ユニット撃破可能なら大優先
        if (target.hp <= effAtk) {
          score += 300;
          if (target.typeKey === 'DUELIST') score += 150;
          if (target.typeKey === 'MEDIC') score += 120;
        } else {
          // 残りHPが低い敵を集中砲火
          score += 100 + (100 - target.hp);
        }
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

  // 敵コアの位置を特定
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
      const mockRange = getAttackRangeCells(m.r, m.c);
      for (const cell of mockRange) {
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

      // 4. ピンチの味方の後退（HPが低い駒は無理な突撃を避ける）
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
