/* ==============================================================
   actions.js: ゲーム内アクション実行（移動・攻撃・スキル・撃破・ターン前後処理）
   ============================================================== */
import { HERO_TYPES, ROWS, COLS, ULT_REQUIRED_DAMAGE } from './config.js?v=lab-white-3';
import {
  board,
  inBounds,
  poisonZones,
  spawnHero,
  hasDebuff,
  getEffectiveAtk,
  getShieldVal,
  addTeamUltDamage,
  resetTeamUltGauge,
  getTeamUltGauge,
  consumeActionOrder,
  addSpecialActionOrder,
  getPlayerOrders,
  isUnit,
  isObject,
  isLocalPlayer,
  getUnitPos,
  syncActionOrdersCount,
  getValidSkillTargets,
  getValidMoves,
  getValidAttacks
} from './board.js?v=lab-white-3';
import { addLog } from './ui.js?v=lab-white-8';
import {
  playAttackLunge,
  playSkillPopupFX,
  playUltCutinFX,
  playPassivePopupFX,
  playBeamFX
} from './urban-ui.js?v=lab-white-5';
import { playCombatEffects } from './battle-effects.js?v=juice-1';
import { playBattleSound } from './battle-audio.js?v=juice-1';

let activeOrderOwner = 'P1';
let combat = null;

// Resolve a volley synchronously so shields, hazards and kill passives keep
// their rule order. Keep defeated pieces in their slots until the effect ends.
async function resolveCombat(resolve, onGameOver, { signal, render, cutinFinished } = {}) {
  if (signal?.aborted) return;
  const effects = { hits: [], readouts: [], passives: [], defeated: new Map(), hitsByTarget: new Map() };
  const removeDefeated = () => {
    for (const [unit, { r, c }] of effects.defeated) {
      if (board[r]?.[c] === unit) board[r][c] = null;
    }
    effects.defeated.clear();
    if (!signal?.aborted) render?.();
  };
  const recordOutcome = (winner, reason, context) => {
    if (!effects.outcome || (reason === 'anchor' && effects.outcome.reason !== 'anchor')) {
      effects.outcome = { winner, reason, context };
    }
  };
  let result;
  try {
    combat = effects;
    result = resolve(recordOutcome);
  } catch (error) {
    removeDefeated();
    throw error;
  } finally {
    combat = null;
  }
  const { hits, readouts, passives, defeated, outcome } = effects;
  const finalAnchor = outcome?.reason === 'anchor' ? outcome.context.targetPos : null;
  const visibleHits = finalAnchor
    ? hits.filter(({ pos }) => pos.r !== finalAnchor.r || pos.c !== finalAnchor.c)
    : hits;
  try {
    if (cutinFinished || outcome || hits.length || readouts.length || defeated.size) {
      render?.();
    }
    if (visibleHits.length || readouts.length || defeated.size) {
      await playCombatEffects({
        hits: visibleHits,
        readouts,
        passives,
        defeats: [...defeated.values()],
        removeDefeated
      }, signal);
    }
  } finally {
    if (defeated.size) removeDefeated();
  }
  if (cutinFinished) await cutinFinished;
  if (outcome && !signal?.aborted) onGameOver?.(outcome.winner, outcome.reason, outcome.context);
  return result;
}

function playCombatPopupFX(kind, pos, amount) {
  if (kind === 'heal' && amount > 0) combat?.readouts.push({ pos: { r: pos.r, c: pos.c }, amount });
}

function placePoisonZone(r, c, owner, sourceHeroId) {
  const index = poisonZones.findIndex(zone => zone.r === r && zone.c === c);
  if (index !== -1) poisonZones.splice(index, 1);
  poisonZones.push({ r, c, owner, sourceHeroId });
}

// ダメージ付与 ＆ 弱体化増幅 ＆ シールド吸収 ＆ チームウルトゲージチャージ処理
export function dealDamage(attacker, target, damage, targetPos, chargeUlt = false) {
  if (!target || combat?.defeated.has(target)) return 0;
  let dmg = Math.max(1, damage);

  // 1. 弱体化（vulnerable）チェック: 被ダメージ1.5倍
  const weakness = hasDebuff(target, 'vulnerable');
  if (weakness) {
    const bonus = Math.floor(dmg * 0.5);
    dmg += bonus;
  }

  const shieldBefore = target.getShieldVal();
  dmg = target.absorbDamage(dmg);
  if (shieldBefore > 0 && !target.getShieldVal()) {
    addLog(`🛡️ ${target.name} のシールドが破壊された！`, 'system');
  }

  // 3. 残余ダメージをHPから減算
  const hpBefore = target.hp;
  if (dmg > 0) {
    target.hp -= dmg;
  }
  const pos = targetPos && { r: targetPos.r, c: targetPos.c };
  if (pos && dmg > 0) combat?.hits.push({ pos, amount: dmg, weakness });
  else if (pos) combat?.readouts.push({ pos });

  // 4. 共通攻撃で実際に減ったHPのみをチームウルトゲージに加算
  if (chargeUlt && attacker && attacker.owner && isUnit(attacker)) {
    const beforeGauge = getTeamUltGauge(attacker.owner);
    const hpLost = Math.min(dmg, Math.max(0, hpBefore));
    addTeamUltDamage(attacker.owner, hpLost);
    const afterGauge = getTeamUltGauge(attacker.owner);
    if (beforeGauge < ULT_REQUIRED_DAMAGE && afterGauge >= ULT_REQUIRED_DAMAGE) {
      addLog(`🌟⚡【${isLocalPlayer(attacker.owner) ? '自軍' : '敵軍'}】通常攻撃によりウルトゲージ 100% 蓄積完了！ウルトが発動可能になりました！`, 'skill');
    }
  }

  if (dmg > 0) combat?.hitsByTarget.set(target, { attacker, dmg });

  return dmg;
}

// 撃破チェック & ハザード連動破壊処理 & パッシブ発動 & 勝利判定
export function checkDeath(r, c, attackerOwner, onGameOver, killerUnit = null, destructionMessage = null) {
  if (!inBounds(r, c)) return false;
  const target = board[r][c];
  if (!target || combat?.defeated.has(target)) return false;

  if (target.hp <= 0) {
    target.hp = 0;
    const hitMeta = combat?.hitsByTarget.get(target);
    killerUnit ??= hitMeta?.attacker;
    const killerPos = getUnitPos(killerUnit);
    const finisherContext = {
      targetPos: { r, c },
      attackerPos: killerPos,
      dmg: hitMeta?.dmg || 0,
      killedUnit: {
        typeKey: target.typeKey,
        owner: target.owner,
        name: target.name,
        hp: 0,
        maxHp: target.maxHp,
        atk: target.atk || 0
      }
    };

    if (target.typeKey === 'ANCHOR') {
      addLog('ANCHOR BROKEN', 'system');
      const winningOwner = (target.owner === 'P1') ? 'P2' : 'P1';
      if (typeof onGameOver === 'function') {
        onGameOver(winningOwner, 'anchor', finisherContext);
      }
      return true;
    }

    addLog(destructionMessage ?? `💀 ${target.name} は撃破された！`, 'system');

    if (isUnit(target)) {
      for (const order of getPlayerOrders(target.owner)) {
        if (order.scope === target.id) order.used = true;
      }
      syncActionOrdersCount(target.owner);
    }

    // 2. ハイヴの固有パッシブ『ニューロ・カウンター』
    if (target.typeKey === 'BIT') {
      const hive = board.flat().find(piece => piece?.typeKey === 'HIVE' && piece.id === target.summonerId);
      if (hive?.hp > 0 && !hasDebuff(hive, 'silence') &&
          killerUnit?.isUnit() && killerUnit.owner !== target.owner && killerUnit.hp > 0) {
        killerUnit.applyDebuff('disarm', activeOrderOwner === killerUnit.owner ? 2 : 1);
        showKillPassive(killerUnit, { label: '攻撃阻害', kind: 'debuff' });
        addLog('ニューロ・カウンター発動', 'skill');
      }
    }

    // 展開者が撃破されたトキシック・ゾーンを除去する。
    for (let i = poisonZones.length - 1; i >= 0; i--) {
      if (poisonZones[i].sourceHeroId === target.id) poisonZones.splice(i, 1);
    }

    const wasUnit = isUnit(target);
    const deadOwner = target.owner;
    if (combat) combat.defeated.set(target, { r, c });
    else board[r][c] = null;
    if (killerPos && killerUnit.hp > 0 && !hasDebuff(killerUnit, 'silence')) {
      killerUnit.onKill?.(target, {
        currentTurn: activeOrderOwner, addSpecialActionOrder, getPlayerOrders, addLog, playPassivePopupFX: showKillPassive
      });
    }

    // 4. 敵ユニット全滅判定
    if (wasUnit && typeof onGameOver === 'function') {
      let remainingDeadOwnerUnits = 0;
      let remainingOpponentUnits = 0;
      const opponentOwner = (deadOwner === 'P1') ? 'P2' : 'P1';

      for (let cr = 0; cr < ROWS; cr++) {
        for (let cc = 0; cc < COLS; cc++) {
          const u = board[cr][cc];
          if (u && !combat?.defeated.has(u) && isUnit(u)) {
            if (u.owner === deadOwner) remainingDeadOwnerUnits++;
            if (u.owner === opponentOwner) remainingOpponentUnits++;
          }
        }
      }

      if (remainingDeadOwnerUnits === 0) {
        const winningOwner = (remainingOpponentUnits === 0 && attackerOwner) ? attackerOwner : opponentOwner;
        addLog(`👑💥 【部隊全滅】 ${isLocalPlayer(deadOwner) ? '自軍' : '敵軍'} チームのユニットが全滅した！`, 'system');
        onGameOver(winningOwner, 'wipeout', finisherContext);
      }
    }

    return true;
  }
  return false;
}

function showKillPassive(pos, options) {
  if (combat) combat.passives.push({ pos: { r: pos.r, c: pos.c }, label: options.label, kind: options.kind });
  else playPassivePopupFX(pos, options);
}

// 移動の実行
function moveUnitTo(unit, destination) {
  board[unit.r][unit.c] = null;
  board[destination.r][destination.c] = unit;
  unit.setPosition(destination.r, destination.c);
  playBattleSound('select');
}

function triggerWarpPassive(unit) {
  if (!hasDebuff(unit, 'silence')) unit.onWarp?.({ board, playPassivePopupFX });
}

function warpUnit(unit, destination) {
  moveUnitTo(unit, destination);
  triggerWarpPassive(unit);
  return true;
}

function swapUnits(unit, ally) {
  const { r, c } = unit;
  board[r][c] = ally;
  board[ally.r][ally.c] = unit;
  unit.setPosition(ally.r, ally.c);
  ally.setPosition(r, c);
  playBattleSound('select');
  triggerWarpPassive(unit);
  triggerWarpPassive(ally);
}

export function executeMove(from, to, onGameOver, presentation) {
  return resolveCombat(() => move(from, to), onGameOver, presentation);
}

function move(from, to) {
  if (!from || !to || !inBounds(from.r, from.c) || !inBounds(to.r, to.c)) return null;
  const unit = board[from.r][from.c];
  if (!unit || !getValidMoves(from.r, from.c).some(pos => pos.r === to.r && pos.c === to.c)) return null;
  activeOrderOwner = unit.owner;

  const [order] = consumeActionOrder(unit.owner, 'move', 1, unit) || [];
  if (!order) return null;

  if (order.scope !== 'all') {
    addLog(`⚡ ${unit.name} が専用移動オーダー（EX MOVE）を消費して移動！チーム共通枠を温存！`, unit.owner.toLowerCase());
  } else {
    addLog(`${isLocalPlayer(unit.owner) ? '自軍' : '敵軍'}の ${unit.name} が移動しました (移動オーダー消費)`, unit.owner.toLowerCase());
  }

  moveUnitTo(unit, to);
  return { r: to.r, c: to.c };
}

function makeHit(onGameOver) {
  return (attacker, target, amount, owner = attacker?.owner) => {
    const dealt = dealDamage(attacker, target, amount, target);
    checkDeath(target.r, target.c, owner, onGameOver, attacker);
    return dealt;
  };
}

// 通常攻撃の実行
export function executeAttack(attackerPos, targetPos, onGameOver, presentation) {
  return resolveCombat(recordOutcome => attack(attackerPos, targetPos, recordOutcome), onGameOver, presentation);
}

function attack(attackerPos, targetPos, onGameOver) {
  if (!attackerPos || !targetPos || !inBounds(attackerPos.r, attackerPos.c) || !inBounds(targetPos.r, targetPos.c)) return;
  const attacker = board[attackerPos.r][attackerPos.c];
  const target = board[targetPos.r][targetPos.c];
  if (!attacker || !target || !getValidAttacks(attackerPos.r, attackerPos.c).some(pos => pos.r === targetPos.r && pos.c === targetPos.c)) return;
  activeOrderOwner = attacker.owner;

  if (typeof attacker.setPosition === 'function') {
    attacker.setPosition(attackerPos.r, attackerPos.c);
  } else {
    attacker.r = attackerPos.r;
    attacker.c = attackerPos.c;
  }
  if (typeof target.setPosition === 'function') {
    target.setPosition(targetPos.r, targetPos.c);
  } else {
    target.r = targetPos.r;
    target.c = targetPos.c;
  }

  const [order] = consumeActionOrder(attacker.owner, 'attack', 1, attacker) || [];
  if (!order) return;
  const common = order.scope === 'all';
  const attackPower = getEffectiveAtk(attacker, target);
  const shieldBefore = getShieldVal(target);
  const dmg = dealDamage(attacker, target, attackPower, targetPos, common);
  const absorbed = shieldBefore - getShieldVal(target);
  const shieldNote = absorbed > 0 ? ` / シールド吸収 ${absorbed}` : '';
  playAttackLunge(attackerPos, targetPos);
  addLog(`${isLocalPlayer(attacker.owner) ? '自軍' : '敵軍'}の ${attacker.name} が ${target.name} を攻撃！(${common ? 'ATK' : 'EX ATK'} ${attackPower}${shieldNote} / HPに ${dmg} DMG)`, attacker.owner.toLowerCase());

  // ブラストのパッシブ反撃判定
  if (!hasDebuff(target, 'silence')) {
    target.onAttacked?.(attacker, { hit: makeHit(onGameOver), addLog, playBeamFX, playPassivePopupFX });
  }

  // 撃破チェック
  checkDeath(targetPos.r, targetPos.c, attacker.owner, onGameOver, attacker);
}

// スキル（通常スキルA / ウルトULT）の実行
export async function executeSkill(heroPos, targetPos, slot, onGameOver, presentation) {
  const signal = presentation?.signal;
  if (signal?.aborted) return false;
  if (!heroPos || !inBounds(heroPos.r, heroPos.c)) return false;
  const hero = board[heroPos.r][heroPos.c];
  const def = hero && HERO_TYPES[hero.typeKey];
  const skillDef = def?.skills?.[slot];
  if (!skillDef) return false;

  const tPos = targetPos || heroPos;
  if (!getValidSkillTargets(heroPos.r, heroPos.c, slot).some(pos => pos.r === tPos.r && pos.c === tPos.c)) return false;
  presentation?.onStart?.();
  let cutinFinished;
  if (slot === 'ULT') {
    const cutin = playUltCutinFX(heroPos, hero, tPos, signal);
    cutinFinished = cutin.finished;
    await cutin.impact;
    if (signal?.aborted) return false;
  }
  return resolveCombat(recordOutcome => useSkill(hero, heroPos, tPos, slot, skillDef, recordOutcome), onGameOver, {
    ...presentation,
    cutinFinished
  });
}

function useSkill(hero, heroPos, tPos, slot, skillDef, onGameOver) {
  activeOrderOwner = hero.owner;

  // ストック消費 or ウルト消費
  if (slot === 'A') {
    hero.stockA = Math.max(0, (hero.stockA || 0) - 1);
  } else if (slot === 'ULT') {
    hero.ultUsed = true;
    resetTeamUltGauge(hero.owner);
    addLog(`✨ チームウルトゲージを消費しました。通常攻撃で再度ダメージを与えると再チャージされます！`, 'system');
  }

  addLog(`⚡ ${isLocalPlayer(hero.owner) ? '自軍' : '敵軍'}の ${hero.name} が『${skillDef.name}』発動！`, 'skill');

  if (slot === 'A') playSkillPopupFX(heroPos, tPos, hero);

  // クラスメソッドへの委譲（UnitEntity 派生クラス）
  if (typeof hero.executeSkill === 'function') {
    hero.r = heroPos.r;
    hero.c = heroPos.c;
    hero.executeSkill(slot, tPos, {
      board,
      hit: makeHit(onGameOver),
      checkDeath,
      addLog,
      addSpecialActionOrder,
      getPlayerOrders,
      spawnUnit: spawnHero,
      placePoisonZone,
      warpUnit,
      swapUnits,
      onGameOver,
      playCombatPopupFX,
      playPassivePopupFX,
      playBeamFX
    });
  }
  return true;
}

export function processTurnEnd(currentTurn, onGameOver, presentation) {
  return resolveCombat(recordOutcome => {
    activeOrderOwner = currentTurn;
    let decided = false;
    const finish = (...args) => {
      decided = true;
      recordOutcome(...args);
    };
    const context = {
      board, hit: makeHit(finish), addLog, playCombatPopupFX, playPassivePopupFX, playBeamFX
    };

    for (const typeKey of ['LILY', 'HALO', 'TURRET', 'PRISM']) {
      for (const piece of board.flat()) {
        if (piece?.typeKey !== typeKey || piece.owner !== currentTurn || piece.hp <= 0) continue;
        if (typeKey === 'TURRET') piece.triggerTurnEndAttack(context);
        else if (!hasDebuff(piece, 'silence')) piece.onTurnEnd(context);
        if (decided) return;
      }
    }

    for (const zone of [...poisonZones]) {
      if (!poisonZones.includes(zone)) continue;
      const target = board[zone.r][zone.c];
      if (!isUnit(target) || target.owner === zone.owner || target.hp <= 0) continue;
      const dealt = context.hit(null, target, 5, zone.owner);
      addLog(`🧪 トキシック・ゾーンから${target.name}に ${dealt} DMG。`, 'system');
      if (decided) return;
    }
  }, onGameOver, presentation);
}

export function tickTurnEffects() {
  for (const piece of board.flat()) piece?.expireEffects();
}

// 設置物の任意破壊はオーダーを消費せず、通常の撃破と同じパッシブを発動する。
export function destroyObject(r, c, owner, presentation) {
  return resolveCombat(() => {
    const object = board[r]?.[c];
    if (!isObject(object) || object.owner !== owner || object.hp <= 0) return false;
    object.hp = 0;
    const side = isLocalPlayer(owner) ? '自軍' : '敵軍';
    return checkDeath(r, c, owner, null, null, `💥 ${side}の${object.name}を破壊ボタンで破壊した！`);
  }, null, presentation);
}
