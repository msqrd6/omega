/* ==============================================================
   actions.js: ゲーム内アクション実行（移動・攻撃・スキル・撃破・ターン前後処理）
   ============================================================== */
import { HERO_TYPES, ROWS, COLS, ULT_REQUIRED_DAMAGE } from './config.js?v=urban-v1';
import {
  board,
  inBounds,
  traps,
  phantomZones,
  poisonZones,
  spawnHero,
  applyBuff,
  applyDebuff,
  hasBuff,
  hasDebuff,
  getEffectiveAtk,
  getShieldVal,
  addTeamUltDamage,
  resetTeamUltGauge,
  getTeamUltGauge,
  hasHazardAt,
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
} from './board.js?v=urban-v1';
import { addLog } from './ui.js?v=urban-v13';
import {
  playCombatPopupFX,
  playSkillPopupFX,
  playUltCutinFX,
  playPassivePopupFX,
  playBeamFX,
  playMarkPulseFX
} from './urban-ui.js?v=urban-v13';

let lastLethalHit = null;
let activeOrderOwner = 'P1';

function placePoisonZone(r, c, owner, sourceHeroId) {
  for (const zones of [phantomZones, poisonZones]) {
    const index = zones.findIndex(zone => zone.r === r && zone.c === c);
    if (index !== -1) zones.splice(index, 1);
  }
  poisonZones.push({ r, c, owner, sourceHeroId, sourceHeroType: 'SMOG' });
}

function triggerEntryTrap(unit, onGameOver) {
  const { r, c } = unit;
  const index = traps.findIndex(trap => trap.r === r && trap.c === c && trap.owner !== unit.owner);
  if (index === -1 || !unit.isUnit()) return;
  const [trap] = traps.splice(index, 1);
  const name = trap.type === 'TOXIC_MINE' ? 'トキシック・マイン' : 'ブラスト・マイン';
  const dealt = dealDamage(null, unit, trap.damage, { r, c });
  const toxic = trap.type === 'TOXIC_MINE';
  playCombatPopupFX('dmg', { r, c }, dealt, null, undefined, {
    color: toxic ? '#2ee59d' : '#ff5a26',
    color2: toxic ? '#c4ff4d' : '#ffd447'
  });
  addLog(`${name} 起動、${unit.name} のHPに ${dealt} DMG`, 'system');
  if (toxic && !hasHazardAt(r, c) &&
      board.flat().some(piece => piece?.id === trap.sourceHeroId && piece.hp > 0)) {
    placePoisonZone(r, c, trap.owner, trap.sourceHeroId);
  }
  checkDeath(r, c, trap.owner, onGameOver);
}

// ダメージ付与 ＆ 弱体化増幅 ＆ シールド吸収 ＆ チームウルトゲージチャージ処理
export function dealDamage(attacker, target, damage, _targetPos, chargeUlt = false) {
  if (!target) return 0;
  let dmg = Math.max(1, damage);

  // 1. 弱体化（vulnerable）チェック: 被ダメージ1.5倍
  if (hasDebuff(target, 'vulnerable')) {
    const bonus = Math.floor(dmg * 0.5);
    dmg += bonus;
  }

  // 2. シールド吸収チェック
  if (hasBuff(target, 'shield')) {
    const shieldObj = target.buffs.shield;
    const absorbed = Math.min(shieldObj.val, dmg);
    shieldObj.val -= absorbed;
    dmg -= absorbed;

    if (shieldObj.val <= 0) {
      target.buffs.shield = null;
      addLog(`🛡️ ${target.name} のシールドが破壊された！`, 'system');
    }
  }

  // 3. 残余ダメージをHPから減算
  if (dmg > 0) {
    target.hp -= dmg;
  }

  // 4. チーム共通ウルトゲージ（通常攻撃のみ加算）
  if (chargeUlt && attacker && attacker.owner && isUnit(attacker)) {
    const beforeGauge = getTeamUltGauge(attacker.owner);
    addTeamUltDamage(attacker.owner, dmg);
    const afterGauge = getTeamUltGauge(attacker.owner);
    if (beforeGauge < ULT_REQUIRED_DAMAGE && afterGauge >= ULT_REQUIRED_DAMAGE) {
      addLog(`🌟⚡【${isLocalPlayer(attacker.owner) ? '自軍' : '敵軍'}】通常攻撃によりウルトゲージ 100% 蓄積完了！ウルトが発動可能になりました！`, 'skill');
    }
  }

  // 5. 攻撃者のターン中累計与ダメージ加算 ＆ シャドウ・ドレイン発動中のダメージ吸収回復
  if (attacker && isUnit(attacker)) {
    attacker.turnDamageDealt = (attacker.turnDamageDealt || 0) + dmg;
    if (target.owner !== attacker.owner && dmg > 0 && hasBuff(attacker, 'shadow_drain')) {
      const actualHealed = Math.min(Math.max(0, attacker.maxHp - attacker.hp), dmg);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + dmg);
      if (actualHealed > 0) {
        const atkPos = getUnitPos(attacker);
        if (atkPos) {
          playCombatPopupFX('heal', atkPos, actualHealed);
        }
        addLog(`👤🩸 ${attacker.name} の『シャドウ・ドレイン』！${dmg} DMG を与えて HP を ${actualHealed} 吸収回復！(HP: ${attacker.hp}/${attacker.maxHp})`, 'skill');
      }
    }
  }

  if (dmg > 0) {
    lastLethalHit = {
      targetId: target.id,
      attacker,
      attackerPos: attacker ? getUnitPos(attacker) : null,
      dmg
    };
  }

  return dmg;
}

// タレット破壊時のパッシブ処理: ヴァルカンの『クロスファイア・リンク』
export function handleTurretDestruction(turretOwner) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === turretOwner && u.typeKey === 'VULCAN') {
        const maxStock = HERO_TYPES.VULCAN?.skills?.A?.maxStock || 1;
        u.stockA = Math.min(maxStock, u.stockA + 1);
        playPassivePopupFX({ r, c }, {
          label: '再装填 & ATK+10',
          kind: 'buff',
          color: '#f59e0b',
          color2: '#ffe07d',
          delayMs: 120
        });
        addLog(`⚙️🗼 ヴァルカンのパッシブ『クロスファイア・リンク』発動！タレット破壊に伴い、『セントリー・タレット』のストックを1回復（現在: ${u.stockA}/${maxStock}）！さらにストック保持により攻撃力増強 (+10) が有効化！`, 'skill');
      }
    }
  }
}

// 撃破チェック & ハザード連動破壊処理 & パッシブ発動 & 勝利判定
export function checkDeath(r, c, attackerOwner, onGameOver, killerUnit = null) {
  if (!inBounds(r, c)) return false;
  const target = board[r][c];
  if (!target) return false;

  if (target.hp <= 0) {
    target.hp = 0;
    const hitMeta = (lastLethalHit && lastLethalHit.targetId === target.id) ? lastLethalHit : null;
    killerUnit ??= hitMeta?.attacker;
    const killerPos = killerUnit ? getUnitPos(killerUnit) : (hitMeta?.attackerPos || null);
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

    addLog(`💀 ${target.name} は撃破された！`, "system");

    // 1. ヴァルカンの固有パッシブ『クロスファイア・リンク』
    if (target.typeKey === 'TURRET') {
      handleTurretDestruction(target.owner);
    }

    // 2. ハイヴの固有パッシブ『ニューロ・カウンター』
    if (target.typeKey === 'BIT') {
      const pTokens = getPlayerOrders(target.owner);
      if (pTokens) {
        pTokens.forEach(t => {
          if (t.scope === target.id) t.used = true;
        });
        syncActionOrdersCount(target.owner);
      }

      const hive = board.flat().find(piece => piece?.typeKey === 'HIVE' && piece.id === target.summonerId);
      if (hive && killerUnit?.isUnit() && killerUnit.owner !== target.owner && killerUnit.hp > 0) {
        killerUnit.applyDebuff('bind', 1, { skipEnd: activeOrderOwner === killerUnit.owner });
        playPassivePopupFX(killerUnit, { label: '行動阻害 (1T)', kind: 'debuff' });
        addLog('ニューロ・カウンター発動', 'skill');
      }
    }

    // 3. 展開者が撃破されたハザードの連動破壊（ディメンション・ゾーン / トキシック・ゾーン）
    let removedHazardCount = 0;

    for (let i = phantomZones.length - 1; i >= 0; i--) {
      const z = phantomZones[i];
      if (z.sourceHeroId === target.id || (!z.sourceHeroId && z.owner === target.owner && z.sourceHeroType === target.typeKey)) {
        phantomZones.splice(i, 1);
        removedHazardCount++;
      }
    }

    for (let i = poisonZones.length - 1; i >= 0; i--) {
      const z = poisonZones[i];
      if (z.sourceHeroId === target.id || (!z.sourceHeroId && z.owner === target.owner && z.sourceHeroType === target.typeKey)) {
        poisonZones.splice(i, 1);
        removedHazardCount++;
      }
    }

    if (removedHazardCount > 0) {
      addLog(`💨 ${target.name} の破壊に伴い、展開されていたハザード (${removedHazardCount}箇所) が同時に破壊・消滅した！`, 'system');
    }

    const wasUnit = isUnit(target);
    const deadOwner = target.owner;
    board[r][c] = null;

    // 4. 敵ユニット全滅判定
    if (wasUnit && typeof onGameOver === 'function') {
      let remainingDeadOwnerUnits = 0;
      let remainingOpponentUnits = 0;
      const opponentOwner = (deadOwner === 'P1') ? 'P2' : 'P1';

      for (let cr = 0; cr < ROWS; cr++) {
        for (let cc = 0; cc < COLS; cc++) {
          const u = board[cr][cc];
          if (u && isUnit(u)) {
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

// 移動の実行
function moveUnitTo(unit, destination, onGameOver) {
  board[unit.r][unit.c] = null;
  board[destination.r][destination.c] = unit;
  unit.setPosition(destination.r, destination.c);
  triggerEntryTrap(unit, onGameOver);
  return unit.hp > 0;
}

export function executeMove(from, to, onGameOver) {
  if (!from || !to || !inBounds(from.r, from.c) || !inBounds(to.r, to.c)) return null;
  const unit = board[from.r][from.c];
  if (!unit || !getValidMoves(from.r, from.c).some(pos => pos.r === to.r && pos.c === to.c)) return null;
  activeOrderOwner = unit.owner;

  const tokens = getPlayerOrders(unit.owner);
  const hadSpecial = tokens.some(t => t.type === 'move' && !t.used && (t.scope === unit.typeKey || t.scope === unit.id));
  consumeActionOrder(unit.owner, 'move', 1, unit);

  if (hadSpecial) {
    addLog(`⚡ ${unit.name} が専用移動オーダー（ライトニング・ステップ）を消費して移動！チーム共通枠を温存！`, unit.owner.toLowerCase());
  } else {
    addLog(`${isLocalPlayer(unit.owner) ? '自軍' : '敵軍'}の ${unit.name} が移動しました (移動オーダー消費)`, unit.owner.toLowerCase());
  }

  moveUnitTo(unit, to, onGameOver);
  const enemyOwner = unit.owner === 'P1' ? 'P2' : 'P1';

  // 2. ディメンション・ゾーン（ヴェイルのハザード）進入判定
  if (board[to.r][to.c] && isUnit(unit)) {
    const inPhantomZone = phantomZones.some(pz => pz.r === to.r && pz.c === to.c && pz.owner === enemyOwner);
    if (inPhantomZone) {
      playPassivePopupFX(to, {
        label: '弱体化 x1.5',
        kind: 'debuff',
        color: '#a855f7',
        color2: '#f2b8ff',
        delayMs: 80
      });
      addLog(`👻 ディメンション・ゾーン侵入！${unit.name} はゾーン内に滞在しているあいだ【弱体化 (被ダメ1.5倍)】状態になります！`, 'system');
    }
  }

  return board[to.r][to.c] ? { r: to.r, c: to.c } : null;
}

// ブラストのパッシブ『カウンター・デトネーション』
export function checkAndTriggerBlastCounter(attacker, target, attackerPos, onGameOver) {
  if (!target) return;
  if (!attacker || !isUnit(attacker) || attacker.owner === target.owner) return;
  if (!attackerPos) return;

  if (typeof target.onAttacked === 'function') {
    target.onAttacked(attacker, attackerPos, {
      dealDamage,
      checkDeath,

      addLog,
      onGameOver,
      playCombatPopupFX,
      playPassivePopupFX,
      playBeamFX
    });
    return;
  }

  if (target.typeKey !== 'BLAST' && target.typeKey !== 'BOMBER') return;

  const targetPos = getUnitPos(target);
  addLog(`💣💥 ブラストのパッシブ『カウンター・デトネーション』発動！攻撃してきた敵 ${attacker.name} に 10 ダメージの爆破反撃！`, 'skill');
  if (targetPos) {
    playPassivePopupFX(targetPos, {
      label: '反撃爆破!',
      kind: 'attack',
      color: '#ff5a26',
      color2: '#ffd447',
      delayMs: 180
    });
    playBeamFX(targetPos, attackerPos, {
      kind: 'attack',
      color: '#ff5a26',
      color2: '#ffd447',
      delayMs: 200
    });
  }
  const dealt = dealDamage(target, attacker, 10, attackerPos, false);
  playCombatPopupFX('dmg', attackerPos, dealt, targetPos, undefined, {
    skipLunge: true,
    delayMs: 240,
    label: dealt > 0 ? `💥 -${dealt} DMG` : null
  });
  checkDeath(attackerPos.r, attackerPos.c, target.owner, onGameOver, target);
}

// 通常攻撃の実行
export function executeAttack(attackerPos, targetPos, onGameOver) {
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
  playCombatPopupFX('dmg', targetPos, dmg, attackerPos);
  addLog(`${isLocalPlayer(attacker.owner) ? '自軍' : '敵軍'}の ${attacker.name} が ${target.name} を攻撃！(${common ? 'ATK' : 'EX ATK'} ${attackPower}${shieldNote} / HPに ${dmg} DMG)`, attacker.owner.toLowerCase());

  // ブラストのパッシブ反撃判定
  checkAndTriggerBlastCounter(attacker, target, attackerPos, onGameOver);

  // 撃破チェック
  checkDeath(targetPos.r, targetPos.c, attacker.owner, onGameOver, attacker);
}

// スキル（通常スキルA / ウルトULT）の実行
export function executeSkill(heroPos, targetPos, slot, onGameOver) {
  if (!heroPos || !inBounds(heroPos.r, heroPos.c)) return false;
  const hero = board[heroPos.r][heroPos.c];
  const skillDef = hero && HERO_TYPES[hero.typeKey]?.skills?.[slot];
  if (!skillDef) return false;

  const tPos = targetPos || heroPos;
  if (!getValidSkillTargets(heroPos.r, heroPos.c, slot).some(pos => pos.r === tPos.r && pos.c === tPos.c)) return false;
  const isMineSkill = skillDef.type === 'PLACE_MINE_TRAP' || skillDef.type === 'TOXIC_MINE';
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

  // スキル / ULT 演出（updateBoardView() の前にターゲットをスナップショット）
  const isEnemyStealthMine = isMineSkill && !isLocalPlayer(hero.owner);
  if (slot === 'ULT') {
    playUltCutinFX(heroPos, hero, tPos);
  } else if (slot === 'A') {
    playSkillPopupFX(heroPos, isEnemyStealthMine ? heroPos : tPos, hero);
  }

  // クラスメソッドへの委譲（UnitEntity 派生クラス）
  if (typeof hero.executeSkill === 'function') {
    let outcome;
    const recordOutcome = (winner, reason, context) => {
      if (!outcome || (reason === 'anchor' && outcome.reason !== 'anchor')) {
        outcome = { winner, reason, context };
      }
    };
    hero.r = heroPos.r;
    hero.c = heroPos.c;
    hero.executeSkill(slot, tPos, {
      board,
      traps,
      phantomZones,
      poisonZones,
      dealDamage,
      checkDeath,
      addLog,
      addSpecialActionOrder,
      spawnHero,
      spawnUnit: spawnHero,
      addTeamUltDamage,
      placePoisonZone,
      warpUnit: (unit, destination) => moveUnitTo(unit, destination, recordOutcome),
      onGameOver: recordOutcome,
      isLocalPlayer,
      applyBuff,
      applyDebuff,
      playCombatPopupFX,
      playPassivePopupFX,
      playBeamFX,
      playMarkPulseFX
    });
    if (outcome) onGameOver?.(outcome.winner, outcome.reason, outcome.context);
  }
  return true;
}

export function processTurnEndPassives(currentTurn, fx = { playCombatPopupFX, playPassivePopupFX, playBeamFX }) {
  for (const unit of board.flat()) {
    if (unit?.owner === currentTurn) {
      unit.onTurnEnd?.({ board, addLog, ...fx });
    }
  }
}

export function tickTurnEffects(currentTurn) {
  for (const unit of board.flat()) {
    if (!unit) continue;
    for (const [source, mark] of unit.marks) {
      if (mark.owner === currentTurn) unit.marks.delete(source);
    }
    if (unit.owner === currentTurn) {
      for (const [key, buff] of Object.entries(unit.buffs)) {
        if (buff && --buff.turns <= 0) unit.buffs[key] = null;
      }
    }
    for (const [key, debuff] of Object.entries(unit.debuffs)) {
      if (!debuff || (debuff.expiresOn ?? unit.owner) !== currentTurn) continue;
      if (debuff.skipEnd) debuff.skipEnd = false;
      else if (--debuff.turns <= 0) unit.debuffs[key] = null;
    }
  }
}

export function processTurretAttacks(currentTurn, onGameOver, fx = { playCombatPopupFX, playPassivePopupFX, playBeamFX }) {
  const { playCombatPopupFX, playPassivePopupFX, playBeamFX } = fx;
  activeOrderOwner = currentTurn;
  const enemyOwner = (currentTurn === 'P1') ? 'P2' : 'P1';

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.typeKey === 'TURRET' && u.owner === currentTurn) {
        if (typeof u.triggerTurnEndAttack === 'function') {
          u.r = r;
          u.c = c;
          u.triggerTurnEndAttack({
            board,
            dealDamage,
            addLog,
            checkDeath,
            onGameOver,
            playCombatPopupFX,
            playPassivePopupFX,
            playBeamFX
          });
          continue;
        }

        const hitEnemies = [];
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const fr = r + dr, fc = c + dc;
            if (inBounds(fr, fc)) {
              const t = board[fr][fc];
              if (t && t.owner === enemyOwner && isUnit(t)) {
                hitEnemies.push({ r: fr, c: fc, unit: t });
              }
            }
          }
        }

        if (hitEnemies.length > 0) {
          playPassivePopupFX({ r, c }, {
            label: '自動迎撃!',
            kind: 'turret',
            color: '#ff5a26',
            color2: '#ffd447'
          });
        }

        hitEnemies.forEach(({ r: er, c: ec, unit: eu }) => {
          const dealt = dealDamage(u, eu, u.atk, { r: er, c: ec }, false);
          playBeamFX({ r, c }, { r: er, c: ec }, {
            kind: 'attack',
            color: '#ff5a26',
            color2: '#ffd447'
          });
          playCombatPopupFX('dmg', { r: er, c: ec }, dealt, { r, c }, undefined, {
            skipLunge: true,
            delayMs: 90,
            label: dealt > 0 ? `-${dealt} DMG` : null
          });
          addLog(`🗼 自動防衛タレットが周囲迎撃ゾーンの敵ユニット ${eu.name} に自動迎撃！(${u.atk} DMG)`, 'skill');
          checkDeath(er, ec, u.owner, onGameOver);
        });
      }
    }
  }
}

// ターン開始時：トキシック・ゾーン（ハザード）滞在ダメージ
export function processTurnStartHazards(currentTurn, onGameOver, fx = { playCombatPopupFX }) {
  const enemyOwner = (currentTurn === 'P1') ? 'P2' : 'P1';

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (!u || u.owner !== currentTurn || !isUnit(u)) continue;

      const inEnemyPoison = poisonZones.some(pz => pz.r === r && pz.c === c && pz.owner === enemyOwner);
      if (inEnemyPoison) {
        const dealt = dealDamage(null, u, 10, { r, c }, false);
        fx.playCombatPopupFX('dmg', { r, c }, dealt, null, undefined, {
          delayMs: 220,
          color: '#2ee59d',
          color2: '#c4ff4d',
          label: dealt > 0 ? `🧪 -${dealt} DMG` : null
        });
        addLog(`🧪 トキシック・ゾーン汚染！ターン開始時に ${u.name} のHPに ${dealt} DMG`, 'system');
        checkDeath(r, c, enemyOwner, onGameOver);
      }
    }
  }
}

// バリケードの任意破壊
export function destroyBarricade(r, c) {
  const unit = board[r]?.[c];
  if (!unit || unit.typeKey !== 'BARRICADE') return false;

  playPassivePopupFX({ r, c }, { label: '防壁撤去', kind: 'skill' });

  addLog(`🧱💥 ${isLocalPlayer(unit.owner) ? '自軍' : '敵軍'} の防壁（バリケード）が破壊ボタンにより破壊された！`, 'system');

  board[r][c] = null;
  return true;
}
