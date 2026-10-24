/* ==============================================================
   actions.js: ゲーム内アクション実行（移動・攻撃・スキル・撃破・ターン前後処理）
   ============================================================== */
import { HERO_TYPES, ROWS, COLS, STATUS_EFFECT_DEFS, ULT_REQUIRED_DAMAGE } from './config.js?v=20261024_11';
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
  clearAllDebuffs,
  getEffectiveAtk,
  addTeamUltDamage,
  resetTeamUltGauge,
  getTeamUltGauge,
  hasHazardOrTrapAt,
  consumeActionToken,
  addSpecialActionToken,
  getPlayerTokens,
  isUnit,
  isCore,
  isObject,
  isLocalPlayer,
  syncActionTokensCount,
  findCore
} from './board.js?v=20261024_11';
import { addLog, showDamagePopup } from './ui.js?v=20261024_11';

// ダメージ付与 ＆ 弱体化増幅 ＆ シールド吸収 ＆ チームウルトゲージチャージ処理
export function dealDamage(attacker, target, damage, targetPos, isNormalAttack = false) {
  if (!target) return 0;
  let dmg = Math.max(1, damage);

  // 1. 弱体化（vulnerable）チェック: 被ダメージ1.5倍
  if (hasDebuff(target, 'vulnerable')) {
    const bonus = Math.floor(dmg * 0.5);
    dmg += bonus;
    if (targetPos) showDamagePopup(targetPos.r, targetPos.c, `🎯被ダメ x1.5!`, '#ea580c');
  }

  // 2. シールド吸収チェック
  if (hasBuff(target, 'shield')) {
    const shieldObj = target.buffs.shield;
    const absorbed = Math.min(shieldObj.val, dmg);
    shieldObj.val -= absorbed;
    dmg -= absorbed;
    if (targetPos) showDamagePopup(targetPos.r, targetPos.c, `🛡️-${absorbed}`, '#00d2ff');

    if (shieldObj.val <= 0) {
      target.buffs.shield = null;
      addLog(`🛡️ ${target.name} のシールドが破壊された！`, 'system');
    }
  }

  // 3. 残余ダメージをHPから減算
  if (dmg > 0) {
    target.hp -= dmg;
    if (targetPos) showDamagePopup(targetPos.r, targetPos.c, `-${dmg}`, '#ff3333');
  }

  // 4. チーム共通ウルトゲージ（通常攻撃のみ加算）
  if (isNormalAttack && attacker && attacker.owner && isUnit(attacker)) {
    const beforeGauge = getTeamUltGauge(attacker.owner);
    addTeamUltDamage(attacker.owner, dmg);
    const afterGauge = getTeamUltGauge(attacker.owner);
    if (beforeGauge < ULT_REQUIRED_DAMAGE && afterGauge >= ULT_REQUIRED_DAMAGE) {
      addLog(`🌟⚡【${attacker.owner === 'P1' ? 'BLUE' : 'RED'}】通常攻撃によりウルトゲージ 100% 蓄積完了！ウルトが発動可能になりました！`, 'skill');
    }
  }

  // 5. 攻撃者のターン中累計与ダメージを加算（フェイズのウルト吸収等）
  if (attacker && isUnit(attacker)) {
    attacker.turnDamageDealt = (attacker.turnDamageDealt || 0) + dmg;
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
        showDamagePopup(r, c, `⚙️再装填 & ATK+10!`, '#f59e0b');
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
    if (target.typeKey === 'CORE') {
      const winningOwner = (target.owner === 'P1') ? 'P2' : 'P1';
      if (typeof onGameOver === 'function') {
        onGameOver(winningOwner, 'core');
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
      const pTokens = getPlayerTokens(target.owner);
      if (pTokens) {
        pTokens.forEach(t => {
          if (t.scope === target.id) t.used = true;
        });
        syncActionTokensCount(target.owner);
      }

      let hiveAlive = false;
      for (let hr = 0; hr < ROWS; hr++) {
        for (let hc = 0; hc < COLS; hc++) {
          const hu = board[hr][hc];
          if (hu && hu.owner === target.owner && hu.typeKey === 'HIVE') {
            hiveAlive = true;
            break;
          }
        }
        if (hiveAlive) break;
      }

      if (hiveAlive && killerUnit && isUnit(killerUnit) && killerUnit.owner !== target.owner && killerUnit.hp > 0) {
        applyDebuff(killerUnit, 'vulnerable', 2);
        applyDebuff(killerUnit, 'silence', 2);
        for (let kr = 0; kr < ROWS; kr++) {
          for (let kc = 0; kc < COLS; kc++) {
            if (board[kr][kc] === killerUnit) {
              showDamagePopup(kr, kc, `🎯弱体&🤐沈黙(2T)!`, '#a855f7');
            }
          }
        }
        addLog(`🛸⚡ ハイヴのパッシブ『ニューロ・カウンター』発動！ビットを破壊した敵 ${killerUnit.name} に【弱体化 (2T)】および【スキル阻害 (2T)】を付与！`, 'skill');
      }
    }

    // 3. 展開者が撃破されたハザードの連動破壊（ディメンション・ゾーン / トキシック・ゾーン）
    let removedHazardCount = 0;

    for (let i = phantomZones.length - 1; i >= 0; i--) {
      const z = phantomZones[i];
      if (z.sourceHeroId === target.id || (z.owner === target.owner && z.sourceHeroType === target.typeKey)) {
        showDamagePopup(z.r, z.c, `👻ハザード消滅!`, '#94a3b8');
        phantomZones.splice(i, 1);
        removedHazardCount++;
      }
    }

    for (let i = poisonZones.length - 1; i >= 0; i--) {
      const z = poisonZones[i];
      if (z.sourceHeroId === target.id || (z.owner === target.owner && z.sourceHeroType === target.typeKey)) {
        showDamagePopup(z.r, z.c, `🧪ハザード消滅!`, '#94a3b8');
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
        addLog(`👑💥 【部隊全滅】 ${deadOwner === 'P1' ? 'BLUE' : 'RED'} チームのユニットが全滅した！`, 'system');
        onGameOver(winningOwner, 'wipeout');
      }
    }

    return true;
  }
  return false;
}

// 移動の実行
export function executeMove(from, to, onGameOver) {
  if (!from || !to || !inBounds(from.r, from.c) || !inBounds(to.r, to.c)) return null;
  const unit = board[from.r][from.c];
  if (!unit) return null;

  const tokens = getPlayerTokens(unit.owner);
  const hadSpecial = tokens.some(t => t.type === 'move' && !t.used && (t.scope === unit.typeKey || t.scope === unit.id));
  consumeActionToken(unit.owner, 'move', 1, unit);

  if (hadSpecial) {
    showDamagePopup(to.r, to.c, `⚡専用MOVE消費`, '#ffd700');
    addLog(`⚡ ${unit.name} が専用移動トークン（ライトニング・ステップ）を消費して移動！チーム共通枠を温存！`, unit.owner.toLowerCase());
  } else {
    showDamagePopup(to.r, to.c, `👟MOVE消費`, '#00ffaa');
    addLog(`${unit.owner === 'P1' ? '青' : '赤'}の ${unit.name} が移動しました (移動トークン消費)`, unit.owner.toLowerCase());
  }

  board[to.r][to.c] = unit;
  board[from.r][from.c] = null;

  const enemyOwner = (unit.owner === 'P1') ? 'P2' : 'P1';

  // 1. トラップ判定（マイン）
  const trapIdx = traps.findIndex(tp => tp.r === to.r && tp.c === to.c && tp.owner === enemyOwner);
  if (trapIdx !== -1) {
    const tp = traps[trapIdx];
    traps.splice(trapIdx, 1);
    addLog(`💥💣 【マイン爆発！】${unit.name} が地雷を踏み、${tp.damage} DMG！マインは消滅した！`, 'system');
    showDamagePopup(to.r, to.c, `💥マイン爆発! -${tp.damage}`, '#f97316');
    dealDamage(null, unit, tp.damage, to, false);
    checkDeath(to.r, to.c, enemyOwner, onGameOver);
  }

  // 2. ディメンション・ゾーン（フェイズのハザード）進入判定
  if (board[to.r][to.c] && isUnit(unit)) {
    const inPhantomZone = phantomZones.some(pz => pz.r === to.r && pz.c === to.c && pz.owner === enemyOwner);
    if (inPhantomZone) {
      applyDebuff(unit, 'vulnerable', 1);
      showDamagePopup(to.r, to.c, `👻弱体化(このターン)!`, '#a855f7');
      addLog(`👻 ディメンション・ゾーン侵入！${unit.name} に【弱体化 (このターン中 / 被ダメ1.5倍)】が付与された！`, 'system');
    }
  }

  return board[to.r][to.c] ? { r: to.r, c: to.c } : null;
}

// ニトロのパッシブ『カウンター・デトネーション』
export function checkAndTriggerNitroCounter(attacker, target, attackerPos, onGameOver) {
  if (!target) return;
  if (!attacker || !isUnit(attacker) || attacker.owner === target.owner) return;
  if (!attackerPos) return;

  if (typeof target.onAttacked === 'function') {
    target.onAttacked(attacker, attackerPos, {
      dealDamage,
      checkDeath,
      showDamagePopup,
      addLog,
      onGameOver
    });
    return;
  }

  if (target.typeKey !== 'NITRO' && target.typeKey !== 'BOMBER') return;

  addLog(`💣💥 ニトロのパッシブ『カウンター・デトネーション』発動！攻撃してきた敵 ${attacker.name} に 10 ダメージの爆破反撃！`, 'skill');
  showDamagePopup(attackerPos.r, attackerPos.c, `💥カウンター 10!`, '#ff0055');
  dealDamage(target, attacker, 10, attackerPos, false);
  checkDeath(attackerPos.r, attackerPos.c, target.owner, onGameOver);
}

// 通常攻撃の実行
export function executeAttack(attackerPos, targetPos, onGameOver) {
  if (!attackerPos || !targetPos || !inBounds(attackerPos.r, attackerPos.c) || !inBounds(targetPos.r, targetPos.c)) return;
  const attacker = board[attackerPos.r][attackerPos.c];
  const target = board[targetPos.r][targetPos.c];
  if (!attacker || !target) return;

  consumeActionToken(attacker.owner, 'attack', 1, attacker);
  showDamagePopup(attackerPos.r, attackerPos.c, `⚔️ATK消費`, '#f59e0b');

  let totalAtk = getEffectiveAtk(attacker);

  // トキシンの固有パッシブ『トキシック・インフェクション』
  if (attacker.typeKey === 'TOXIN' || attacker.typeKey === 'POISON') {
    const isTargetInPoison = poisonZones.some(pz => pz.r === targetPos.r && pz.c === targetPos.c);
    if (isTargetInPoison) {
      totalAtk += 10;
      showDamagePopup(attackerPos.r, attackerPos.c, `☣️毒シナジー +10!`, '#10b981');
      addLog(`☣️⚡ トキシンのパッシブ『トキシック・インフェクション』発動！毒エリア内の敵へ +10 DMG強打！`, 'skill');
    }
  }

  const dmg = dealDamage(attacker, target, totalAtk, targetPos, true);
  addLog(`${attacker.owner === 'P1' ? '青' : '赤'}の ${attacker.name} が ${target.name} を攻撃！(${dmg} DMG / チームウルト蓄積)`, attacker.owner.toLowerCase());

  // ニトロのパッシブ反撃判定
  checkAndTriggerNitroCounter(attacker, target, attackerPos, onGameOver);

  // 撃破チェック
  checkDeath(targetPos.r, targetPos.c, attacker.owner, onGameOver, attacker);
}

// スキル（通常スキルA / ウルトULT）の実行
export function executeSkill(heroPos, targetPos, slot, onGameOver) {
  if (!heroPos || !inBounds(heroPos.r, heroPos.c)) return;
  const hero = board[heroPos.r][heroPos.c];
  if (!hero) return;

  const heroDef = HERO_TYPES[hero.typeKey];
  if (!heroDef || !heroDef.skills) return;
  const skillDef = heroDef.skills[slot];
  if (!skillDef) return;

  const tPos = targetPos || heroPos;

  // ストック消費 or ウルト消費
  if (slot === 'A') {
    hero.stockA = Math.max(0, (hero.stockA || 0) - 1);
  } else if (slot === 'ULT') {
    hero.ultUsed = true;
    resetTeamUltGauge(hero.owner);
    showDamagePopup(heroPos.r, heroPos.c, `🌟ULT解放!`, '#00d2ff');
    addLog(`✨ チームウルトゲージを消費しました。通常攻撃で再度ダメージを与えると再チャージされます！`, 'system');
  }

  addLog(`⚡ ${hero.owner === 'P1' ? '青' : '赤'}の ${hero.name} が『${skillDef.name}』発動！`, 'skill');

  // クラスメソッドへの委譲（UnitEntity 派生クラス）
  if (typeof hero.executeSkill === 'function') {
    hero.r = heroPos.r;
    hero.c = heroPos.c;
    hero.executeSkill(slot, tPos, {
      board,
      traps,
      phantomZones,
      poisonZones,
      dealDamage,
      checkDeath,
      showDamagePopup,
      addLog,
      addSpecialActionToken,
      spawnHero,
      spawnUnit: spawnHero,
      onGameOver,
      hasHazardOrTrapAt,
      isLocalPlayer,
      applyBuff,
      applyDebuff,
      clearAllDebuffs,
      getEffectiveAtk,
      findCore
    });
    return;
  }

  const enemyOwner = (hero.owner === 'P1') ? 'P2' : 'P1';

  switch (hero.typeKey) {
    case 'DUELIST': {
      if (slot === 'A') {
        applyBuff(hero, 'atk_up', 5, 1);
        showDamagePopup(heroPos.r, heroPos.c, `ATK+5 (このターン)!`, '#ff6600');
        addLog(`⚡ ${hero.name} が『オーバードライブ』発動！【攻撃力増強 (+5 / このターン中)】を展開（ATK 25 ➔ 30）！`, 'skill');
      } else if (slot === 'ULT') {
        addSpecialActionToken(hero.owner, {
          id: `${hero.owner}_attack_kinesis_${Date.now()}`,
          type: 'attack',
          name: '攻撃',
          badgeText: '攻撃',
          scope: 'DUELIST',
          unitType: 'DUELIST',
          unitName: 'キネシス',
          used: false,
          desc: 'キネシスのウルト『ライトニング・ラッシュ』による専用攻撃トークン。キネシスのみが追加で1回通常攻撃できます。'
        });
        showDamagePopup(heroPos.r, heroPos.c, `⚡⚔️専用攻撃+1!`, '#00d2ff');
        addLog(`⚡⚔️ ${hero.name} がウルト『ライトニング・ラッシュ』発動！キネシス専用の【追加攻撃トークン (+1 ATTACK)】を獲得！このターン通常攻撃を追加で1回行える！`, 'skill');
      }
      break;
    }

    case 'PHANTOM': {
      if (slot === 'A') {
        board[tPos.r][tPos.c] = hero;
        board[heroPos.r][heroPos.c] = null;
        showDamagePopup(tPos.r, tPos.c, `👻影転移!`, '#a855f7');
        addLog(`👻 ${hero.name} が『テレポート』発動！自軍ディメンション・ゾーン (${tPos.r}, ${tPos.c}) へ瞬時に帰還！`, 'skill');
      } else if (slot === 'ULT') {
        const drainAmount = hero.turnDamageDealt || 0;
        if (drainAmount > 0) {
          const actualHealed = Math.min(hero.maxHp - hero.hp, drainAmount);
          hero.hp = Math.min(hero.maxHp, hero.hp + drainAmount);
          showDamagePopup(heroPos.r, heroPos.c, `+${actualHealed} HP吸収!`, '#10b981');
          addLog(`👤🩸 ${hero.name} がウルト『シャドウ・ドレイン』発動！このターンに敵へ与えた ${drainAmount} DMG を吸収し、HPを ${actualHealed} 回復！(HP: ${hero.hp}/${hero.maxHp})`, 'skill');
        } else {
          showDamagePopup(heroPos.r, heroPos.c, `与ダメなし(回復0)`, '#94a3b8');
          addLog(`👤 ${hero.name} がウルト『シャドウ・ドレイン』発動！しかしこのターンに敵へダメージを与えていないため回復量は 0 です。`, 'system');
        }
      }
      break;
    }

    case 'BOMBER': {
      if (slot === 'A') {
        if (!hasHazardOrTrapAt(tPos.r, tPos.c)) {
          traps.push({
            r: tPos.r,
            c: tPos.c,
            owner: hero.owner,
            damage: 20,
            type: 'MINE',
            sourceHeroId: hero.id
          });
          if (isLocalPlayer(hero.owner)) {
            showDamagePopup(tPos.r, tPos.c, `💣マイン設置!`, '#f97316');
            addLog(`💣 ${hero.name} が『マイン・プラント』発動！指定マスにマイン（20 DMGトラップ）を仕掛けた（自軍のみ視認可能・ニトロ破壊後も存続）！`, 'skill');
          } else {
            showDamagePopup(heroPos.r, heroPos.c, `💣マイン設置!`, '#f97316');
            addLog(`💣 敵の ${hero.name} が『マイン・プラント』発動！いずれかのマスにマインを仕掛けた...！`, 'skill');
          }
        }
      } else if (slot === 'ULT') {
        const ultDmg = skillDef.damage || 20;
        showDamagePopup(heroPos.r, heroPos.c, `マキシマム・エクスプロージョン!!`, '#ff0055');
        addLog(`💥💣🔥 ${hero.name} がウルト『マキシマム・エクスプロージョン』発動！自身を含む半径2マス全域へ ${ultDmg} ダメージの大爆破！`, 'skill');

        const affectedPositions = [];
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = heroPos.r + dr, nc = heroPos.c + dc;
            if (inBounds(nr, nc)) {
              const u = board[nr][nc];
              if (u) affectedPositions.push({ r: nr, c: nc, unit: u });
            }
          }
        }

        affectedPositions.forEach(({ r: ar, c: ac, unit: targetUnit }) => {
          showDamagePopup(ar, ac, `-${ultDmg}💥`, '#ff0055');
          dealDamage(hero, targetUnit, ultDmg, { r: ar, c: ac }, false);
          checkDeath(ar, ac, hero.owner, onGameOver);
        });
      }
      break;
    }

    case 'SENTINEL': {
      if (slot === 'A') {
        spawnHero('BARRICADE', hero.owner, tPos.r, tPos.c);
        showDamagePopup(tPos.r, tPos.c, `防壁設置!`, '#10b981');
        addLog(`🧱 ${hero.name} が『フォース・バリケード』発動！指定マスに防壁（HP 30）を構築！`, 'skill');
      } else if (slot === 'ULT') {
        hero.stockA = 3;
        showDamagePopup(heroPos.r, heroPos.c, `ストック全回復 [3/3]!`, '#00d2ff');
        addLog(`🛡️ ${hero.name} がウルト『バリケード・バッファー』発動！『フォース・バリケード』のストックが全回復（最大3回まで再装填）した！`, 'skill');
      }
      break;
    }

    case 'VULCAN': {
      if (slot === 'A') {
        spawnHero('TURRET', hero.owner, tPos.r, tPos.c);
        showDamagePopup(tPos.r, tPos.c, `🗼タレット設置!`, '#10b981');
        addLog(`⚙️🗼 ${hero.name} が『セントリー・タレット』発動！自動防衛タレット（HP 20, ATK 10）を構築！（ヴァルカン破壊後も存続）`, 'skill');
      } else if (slot === 'ULT') {
        showDamagePopup(heroPos.r, heroPos.c, `フォートレス・プロトコル!!`, '#f97316');

        const myTurrets = [];
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const u = board[r][c];
            if (u && u.owner === hero.owner && u.typeKey === 'TURRET') {
              myTurrets.push({ r, c, turret: u });
            }
          }
        }

        const blastTiles = new Set();
        myTurrets.forEach(({ r: tr, c: tc }) => {
          showDamagePopup(tr, tc, `🎯空爆目標!`, '#f59e0b');
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const nr = tr + dr, nc = tc + dc;
              if (inBounds(nr, nc)) blastTiles.add(`${nr},${nc}`);
            }
          }
        });

        let hitCount = 0;
        blastTiles.forEach(key => {
          const [tr, tc] = key.split(',').map(Number);
          const t = board[tr][tc];
          if (t && t.owner === enemyOwner && !isCore(t) && (isUnit(t) || isObject(t))) {
            dealDamage(hero, t, skillDef.damage || 25, { r: tr, c: tc }, false);
            showDamagePopup(tr, tc, `💥空爆! -${skillDef.damage || 25}`, '#ff0055');
            checkDeath(tr, tc, hero.owner, onGameOver);
            hitCount++;
          }
        });

        addLog(`⚙️🚀💥 ${hero.name} がウルト『フォートレス・プロトコル』発動！セントリー・タレット周辺半径2マスへ空爆を要請し、敵 ${hitCount} 体に 25 DMGを爆砕！`, 'skill');
      }
      break;
    }

    case 'POISON': {
      if (slot === 'A') {
        const dir = (tPos.c > heroPos.c) ? 1 : -1;
        let placedCount = 0;
        let step = 1;
        const maxLen = skillDef.length || 3;
        while (placedCount < maxLen) {
          const nc = heroPos.c + dir * step;
          if (!inBounds(heroPos.r, nc)) break;
          if (!hasHazardOrTrapAt(heroPos.r, nc)) {
            poisonZones.push({
              r: heroPos.r,
              c: nc,
              owner: hero.owner,
              sourceHeroId: hero.id,
              sourceHeroType: hero.typeKey
            });
            showDamagePopup(heroPos.r, nc, `🧪トキシック!`, '#10b981');
            placedCount++;
          }
          step++;
        }
        addLog(`🧪 ${hero.name} が『トキシック・カーテン』発動！${dir > 0 ? '右' : '左'}方向へ3マスのトキシック・ゾーンを展開（トキシン撃破時に消滅）！`, 'skill');
      } else if (slot === 'ULT') {
        showDamagePopup(heroPos.r, heroPos.c, `バイオハザード!!`, '#10b981');
        let placedCount = 0;
        let overwrittenCount = 0;

        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = heroPos.r + dr, nc = heroPos.c + dc;
            if (!inBounds(nr, nc)) continue;

            for (let i = phantomZones.length - 1; i >= 0; i--) {
              if (phantomZones[i].r === nr && phantomZones[i].c === nc) {
                phantomZones.splice(i, 1);
                overwrittenCount++;
              }
            }
            for (let i = poisonZones.length - 1; i >= 0; i--) {
              if (poisonZones[i].r === nr && poisonZones[i].c === nc) {
                poisonZones.splice(i, 1);
              }
            }

            poisonZones.push({
              r: nr,
              c: nc,
              owner: hero.owner,
              sourceHeroId: hero.id,
              sourceHeroType: hero.typeKey
            });
            showDamagePopup(nr, nc, `🧪トキシック!`, '#10b981');
            placedCount++;
          }
        }
        addLog(`🧪☣️ ${hero.name} がウルト『バイオハザード』発動！自身の足元および周囲8マス（計${placedCount}マス）にトキシック・ゾーンを一斉展開${overwrittenCount > 0 ? `（既存ハザード${overwrittenCount}箇所を上書き）` : ''}！`, 'skill');
      }
      break;
    }

    case 'DISRUPTOR': {
      if (slot === 'A') {
        board[tPos.r][tPos.c] = hero;
        board[heroPos.r][heroPos.c] = null;
        showDamagePopup(tPos.r, tPos.c, `ワープ瞬動!`, '#a855f7');
        addLog(`🌀 ${hero.name} が『グラビティ・ワープ』発動！味方アサルトの隣接マスへ空間跳躍！`, 'skill');
        triggerGlitchDimensionCharge(tPos, enemyOwner);
      } else if (slot === 'ULT') {
        board[tPos.r][tPos.c] = hero;
        board[heroPos.r][heroPos.c] = null;
        showDamagePopup(tPos.r, tPos.c, `緊急回避!`, '#c084fc');
        addLog(`✨ ${hero.name} がウルト『緊急回避』発動！任意の空きマスへ完全脱出！`, 'skill');
        triggerGlitchDimensionCharge(tPos, enemyOwner);
      }
      break;
    }

    case 'CYPHER': {
      if (slot === 'A') {
        const target = board[tPos.r][tPos.c];
        if (target && isUnit(target)) {
          if (target.owner === hero.owner) {
            applyBuff(target, 'atk_up', 15, 1);
            showDamagePopup(tPos.r, tPos.c, `🔥ATK+15(このターン)!`, '#ff6600');
            addLog(`🔇⚡ ${hero.name} の『シグナル・ジャミング』が味方 ${target.name} に命中！【攻撃力増強 (+15 / このターン中)】を付与！`, 'skill');
          } else {
            applyDebuff(target, 'disarm', 1);
            showDamagePopup(tPos.r, tPos.c, `💢攻撃阻害(1T)!`, '#f59e0b');
            addLog(`🔇⚡ ${hero.name} の『シグナル・ジャミング』が敵 ${target.name} に命中！【攻撃阻害 (1T)】を付与して次ターンの通常攻撃を完全封殺！`, 'skill');
          }
        }
      } else if (slot === 'ULT') {
        showDamagePopup(heroPos.r, heroPos.c, `全軍ブラックアウト!!`, '#334155');
        let affectedCount = 0;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const t = board[r][c];
            if (t && t.owner === enemyOwner && isUnit(t)) {
              applyDebuff(t, 'bind', 1);
              applyDebuff(t, 'disarm', 1);
              showDamagePopup(r, c, `⛓️拘束&💢攻撃停止!`, '#f59e0b');
              affectedCount++;
            }
          }
        }
        addLog(`🔇🌌 ${hero.name} がウルト『フルスペクトラム・ブラックアウト』発動！敵 ${affectedCount} 体に【行動阻害(1T)】および【攻撃阻害(1T)】を一斉付与！次ターンの行動を完全封殺！`, 'skill');
      }
      break;
    }

    case 'HIVE': {
      if (slot === 'A') {
        const bit = spawnHero('BIT', hero.owner, tPos.r, tPos.c);
        if (bit) {
          showDamagePopup(tPos.r, tPos.c, `🛰️ビット召喚!`, '#00d2ff');
          addSpecialActionToken(hero.owner, {
            id: `${hero.owner}_atk_bit_${bit.id}`,
            type: 'attack',
            name: '攻撃',
            badgeText: '攻撃',
            scope: bit.id,
            unitType: 'BIT',
            unitName: 'ビット',
            used: false,
            desc: 'ビットのパッシブ『自律アサルト・ドライブ』による専用攻撃トークン。'
          });
          addLog(`🛸✨ ${hero.name} が通常スキル『ビット・デプロイ』発動！指定マスに自律戦闘子機『ビット』を召喚！専用攻撃トークンで即時自律攻撃可能！`, 'skill');
        }
      } else if (slot === 'ULT') {
        let bitCount = 0;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const u = board[r][c];
            if (u && u.owner === hero.owner && u.typeKey === 'BIT') {
              applyBuff(u, 'shield', 30, 2);
              applyBuff(u, 'atk_up', 10, 2);
              showDamagePopup(r, c, `🛡️+30 ⚔️+10!`, '#38bdf8');
              bitCount++;
            }
          }
        }
        addLog(`🛸🌟 ${hero.name} がアルティメット『スウォーム・オーバードライブ』発動！全ビット (${bitCount}体) に【シールド (+30/2T)】および【攻撃力増強 (+10/2T)】を一斉付与！`, 'skill');
      }
      break;
    }

    case 'BIT': {
      if (slot === 'A') {
        showDamagePopup(heroPos.r, heroPos.c, `💥自壊!`, '#94a3b8');
        addLog(`🛰️💥 ${hero.name} がスキル『自壊』を発動し、自身を破壊した！`, 'skill');
        hero.hp = 0;
        checkDeath(heroPos.r, heroPos.c, hero.owner, onGameOver);
      }
      break;
    }

    case 'MEDIC': {
      if (slot === 'A') {
        const target = board[tPos.r][tPos.c];
        if (target && isUnit(target)) {
          const oldHp = target.hp;
          target.hp = Math.min(target.maxHp, target.hp + (skillDef.heal || 30));
          const healed = target.hp - oldHp;
          showDamagePopup(tPos.r, tPos.c, `+${healed} HP`, '#00ffaa');
          addLog(`💉 ${hero.name} が『ライフ・リペア』発動！${target.name} のHPを ${healed} 回復！`, 'skill');
        }
      } else if (slot === 'ULT') {
        showDamagePopup(heroPos.r, heroPos.c, `オーバーチャージ!!`, '#00d2ff');
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const u = board[r][c];
            if (u && u.owner === hero.owner && !isObject(u)) {
              applyBuff(u, 'shield', skillDef.shieldVal || 15, skillDef.shieldTurns || 2);
              showDamagePopup(r, c, `+15🛡️(2T)`, '#00d2ff');
            }
          }
        }
        addLog(`🌟 ${hero.name} がウルト『オーバーチャージ・オーラ』発動！自軍全ユニットおよび防衛コアに【シールド増強(+15/2T)】を一斉展開！`, 'skill');
      }
      break;
    }

    case 'HACKER': {
      if (slot === 'A') {
        const target = board[tPos.r][tPos.c];
        if (target && target.owner === hero.owner && isUnit(target)) {
          const oldHp = target.hp;
          target.hp = Math.min(target.maxHp, target.hp + (skillDef.heal || 15));
          const healed = target.hp - oldHp;
          clearAllDebuffs(target);
          showDamagePopup(tPos.r, tPos.c, `+${healed} HP & 状態異常回復!`, '#10b981');
          addLog(`💻💚 ${hero.name} が『リモート・ハック』発動！味方 ${target.name} のHPを ${healed} 回復し、すべての異常状態（デバフ）を完全回復！`, 'skill');
        }
      } else if (slot === 'ULT') {
        showDamagePopup(tPos.r, tPos.c, `⚡EMP PULSE!!⚡`, '#38bdf8');
        let destroyedCount = 0;

        // 1. 半径2マスの敵オブジェクト（防壁・タレット）破壊
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = tPos.r + dr, nc = tPos.c + dc;
            if (inBounds(nr, nc)) {
              const u = board[nr][nc];
              if (u && u.owner === enemyOwner && isObject(u)) {
                showDamagePopup(nr, nc, `💥EMP破壊!`, '#38bdf8');
                if (u.typeKey === 'TURRET') {
                  handleTurretDestruction(u.owner);
                }
                board[nr][nc] = null;
                destroyedCount++;
              }
            }
          }
        }

        // 2. 半径2マスの敵トラップ消去
        for (let i = traps.length - 1; i >= 0; i--) {
          const tp = traps[i];
          if (tp.owner === enemyOwner && Math.abs(tp.r - tPos.r) <= 2 && Math.abs(tp.c - tPos.c) <= 2) {
            showDamagePopup(tp.r, tp.c, `🪤トラップ無効化!`, '#38bdf8');
            traps.splice(i, 1);
            destroyedCount++;
          }
        }

        // 3. 半径2マスの敵ハザード消去
        for (let i = phantomZones.length - 1; i >= 0; i--) {
          const z = phantomZones[i];
          if (z.owner === enemyOwner && Math.abs(z.r - tPos.r) <= 2 && Math.abs(z.c - tPos.c) <= 2) {
            showDamagePopup(z.r, z.c, `👻ハザード消滅!`, '#38bdf8');
            phantomZones.splice(i, 1);
            destroyedCount++;
          }
        }
        for (let i = poisonZones.length - 1; i >= 0; i--) {
          const z = poisonZones[i];
          if (z.owner === enemyOwner && Math.abs(z.r - tPos.r) <= 2 && Math.abs(z.c - tPos.c) <= 2) {
            showDamagePopup(z.r, z.c, `🧪ハザード消滅!`, '#38bdf8');
            poisonZones.splice(i, 1);
            destroyedCount++;
          }
        }

        // 4. 半径2マス以内の味方ユニットのHPを10回復
        let healedAlliesCount = 0;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = tPos.r + dr, nc = tPos.c + dc;
            if (inBounds(nr, nc)) {
              const u = board[nr][nc];
              if (u && u.owner === hero.owner && isUnit(u)) {
                const oldHp = u.hp;
                u.hp = Math.min(u.maxHp, u.hp + (skillDef.heal || 10));
                const healed = u.hp - oldHp;
                showDamagePopup(nr, nc, `+${healed} HP!`, '#10b981');
                healedAlliesCount++;
              }
            }
          }
        }

        addLog(`💻⚡💥 ${hero.name} がアルティメット『EMP』発動！指定地点から半径2マスの敵設置物・トラップ・ハザード ${destroyedCount} 件を完全消滅させ、味方 ${healedAlliesCount} 体のHPを 10 回復！`, 'skill');
      }
      break;
    }

    case 'AURA': {
      if (slot === 'A') {
        const healedAlliesCount = healAlliesAround(heroPos, hero.owner, skillDef.heal || 20);
        addLog(`💫✨ ${hero.name} が通常スキル『サンクチュアリ』発動！周囲1マス範囲の味方 ${healedAlliesCount} 体のHPを 20 回復！`, 'skill');
      } else if (slot === 'ULT') {
        board[tPos.r][tPos.c] = hero;
        board[heroPos.r][heroPos.c] = null;
        showDamagePopup(tPos.r, tPos.c, `💫救援ワープ!`, '#e066ff');

        const healedAlliesCount = healAlliesAround(tPos, hero.owner, 20);
        addLog(`💫🌟 ${hero.name} がアルティメット『レスキュー・ワープ』発動！味方の隣へ即時救援ワープし、着地点で『サンクチュアリ』を展開！周囲の味方 ${healedAlliesCount} 体のHPを 20 回復（ストック消費なし）！`, 'skill');
      }
      break;
    }
  }
}

// オーラの周囲1マス回復ヘルパー
function healAlliesAround(centerPos, owner, healAmount) {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = centerPos.r + dr, nc = centerPos.c + dc;
      if (inBounds(nr, nc)) {
        const u = board[nr][nc];
        if (u && u.owner === owner && isUnit(u)) {
          const oldHp = u.hp;
          u.hp = Math.min(u.maxHp, u.hp + healAmount);
          const healed = u.hp - oldHp;
          if (healed > 0) {
            showDamagePopup(nr, nc, `+${healed} HP!`, '#10b981');
          }
          count++;
        }
      }
    }
  }
  return count;
}

// グリッチの固有パッシブ『ディメンション・チャージ』処理ヘルパー
function triggerGlitchDimensionCharge(landingPos, enemyOwner) {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = landingPos.r + dr, nc = landingPos.c + dc;
      if (inBounds(nr, nc)) {
        const u = board[nr][nc];
        if (u && u.owner === enemyOwner && isUnit(u)) {
          applyDebuff(u, 'vulnerable', 1);
          showDamagePopup(nr, nc, `🎯弱体化(このターン)!`, '#ea580c');
          count++;
        }
      }
    }
  }
  if (count > 0) {
    addLog(`🌀⚡ グリッチのパッシブ『ディメンション・チャージ』発動！ワープ着地点周囲の敵 ${count} 体に【弱体化 (このターン中 / 被ダメ1.5倍)】を付与！`, 'skill');
  }
}

// ターン終了時：パッシブ効果の自動発動（アイリス・ネクサス・オーラ）
export function processTurnEndPassives(currentTurn) {
  // 1. 各ユニットの onTurnEnd クラスフックを実行
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === currentTurn && isUnit(u)) {
        if (typeof u.onTurnEnd === 'function') {
          u.r = r;
          u.c = c;
          u.onTurnEnd({
            board,
            showDamagePopup,
            addLog,
            addTeamUltDamage,
            inBounds
          });
        }
      }
    }
  }

  // 2. クラスメソッド未実装ユニット向けのフォールバック処理
  // 2-1. アイリスのパッシブ『ナノ・エンハンスメント』
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === currentTurn && (u.typeKey === 'MEDIC' || u.typeKey === 'IRIS') && typeof u.onTurnEnd !== 'function') {
        const forwardDir = (u.owner === 'P1') ? -1 : 1;
        let closestAlly = null;
        let step = 1;

        while (true) {
          const nr = r + forwardDir * step;
          const nc = c;
          if (!inBounds(nr, nc)) break;
          const piece = board[nr][nc];
          if (piece) {
            if (piece.owner !== currentTurn || isCore(piece) || isObject(piece)) {
              break;
            }
            if (isUnit(piece) && piece.owner === currentTurn && piece.hp < piece.maxHp) {
              closestAlly = { r: nr, c: nc, unit: piece };
              break;
            }
          }
          step++;
        }

        if (closestAlly) {
          const oldHp = closestAlly.unit.hp;
          closestAlly.unit.hp = Math.min(closestAlly.unit.maxHp, closestAlly.unit.hp + 5);
          const healed = closestAlly.unit.hp - oldHp;
          showDamagePopup(closestAlly.r, closestAlly.c, `💉ナノ回復 +${healed}`, '#00ffaa');
          addLog(`💉✨ アイリスのパッシブ『ナノ・エンハンスメント』発動！上一直線上の味方 ${closestAlly.unit.name} を ${healed} HP自動回復！(現在HP: ${closestAlly.unit.hp}/${closestAlly.unit.maxHp})`, 'skill');
        }
      }
    }
  }

  // 2-2. ネクサスのパッシブ『システム・オーバーライド』
  let nexusAliveFallback = false;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === currentTurn && (u.typeKey === 'HACKER' || u.typeKey === 'NEXUS') && typeof u.onTurnEnd !== 'function') {
        nexusAliveFallback = true;
        break;
      }
    }
    if (nexusAliveFallback) break;
  }

  if (nexusAliveFallback) {
    addTeamUltDamage(currentTurn, 10);
    addLog(`💻⚡ ネクサスのパッシブ『システム・オーバーライド』発動！チームウルトゲージが直接 +10 チャージされた！`, 'skill');
  }

  // 2-3. オーラのパッシブ『バイタル・オーラ』
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === currentTurn && u.typeKey === 'AURA' && typeof u.onTurnEnd !== 'function') {
        let lowestAlly = null;
        let lowestHp = Infinity;

        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc)) {
              const ally = board[nr][nc];
              if (ally && ally.owner === currentTurn && isUnit(ally) && ally.hp < ally.maxHp) {
                if (ally.hp < lowestHp) {
                  lowestHp = ally.hp;
                  lowestAlly = { r: nr, c: nc, unit: ally };
                }
              }
            }
          }
        }

        if (lowestAlly) {
          const oldHp = lowestAlly.unit.hp;
          lowestAlly.unit.hp = Math.min(lowestAlly.unit.maxHp, lowestAlly.unit.hp + 5);
          const healed = lowestAlly.unit.hp - oldHp;
          showDamagePopup(lowestAlly.r, lowestAlly.c, `💫オーラ回復 +${healed}`, '#e066ff');
          addLog(`💫✨ オーラのパッシブ『バイタル・オーラ』発動！周囲で最も負傷している ${lowestAlly.unit.name} を ${healed} HP自動回復！(現在HP: ${lowestAlly.unit.hp}/${lowestAlly.unit.maxHp})`, 'skill');
        }
      }
    }
  }
}

// ターン終了時：持続効果（バフ・デバフ）のターン減算 & 解除処理
export function tickTurnEffects(currentTurn) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (!u) continue;

      if (u.owner === currentTurn) {
        if (u.buffs) {
          if (u.buffs.atk_up) {
            u.buffs.atk_up.turns--;
            if (u.buffs.atk_up.turns <= 0) {
              u.buffs.atk_up = null;
              addLog(`💨 ${u.name} の【攻撃力増強】が終了しました`, 'system');
            }
          }
          if (u.buffs.shield) {
            u.buffs.shield.turns--;
            if (u.buffs.shield.turns <= 0) {
              u.buffs.shield = null;
              addLog(`💨 ${u.name} の【シールド増強】が時間経過で消滅しました`, 'system');
            }
          }
        }

        if (u.debuffs) {
          const debuffKeys = ['vulnerable', 'disarm', 'bind', 'silence'];
          for (const k of debuffKeys) {
            if (u.debuffs[k]) {
              u.debuffs[k].turns--;
              if (u.debuffs[k].turns <= 0) {
                const def = STATUS_EFFECT_DEFS[k];
                addLog(`✨ ${u.name} の【${def ? def.name : k}】が解除されました`, 'system');
                u.debuffs[k] = null;
              }
            }
          }
        }
      } else {
        // 非手番プレイヤーのユニット：攻撃側手番終了時に弱体化を減算
        if (u.debuffs && u.debuffs.vulnerable) {
          u.debuffs.vulnerable.turns--;
          if (u.debuffs.vulnerable.turns <= 0) {
            u.debuffs.vulnerable = null;
            addLog(`✨ ${u.name} の【弱体化】が解除されました（ターン終了）`, 'system');
          }
        }
      }
    }
  }
}

// ターン終了時：自動防衛タレットの自動射撃
export function processTurretAttacks(currentTurn, onGameOver) {
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
            showDamagePopup,
            addLog,
            checkDeath,
            onGameOver
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

        hitEnemies.forEach(({ r: er, c: ec, unit: eu }) => {
          dealDamage(u, eu, u.atk, { r: er, c: ec }, false);
          showDamagePopup(er, ec, `🗼迎撃! -${u.atk}`, '#f43f5e');
          addLog(`🗼 自動防衛タレットが周囲迎撃ゾーンの敵ユニット ${eu.name} に自動迎撃！(${u.atk} DMG)`, 'skill');
          checkDeath(er, ec, u.owner, onGameOver);
        });
      }
    }
  }
}

// ターン開始時：トキシック・ゾーン（ハザード）滞在ダメージ
export function processTurnStartHazards(currentTurn, onGameOver) {
  const enemyOwner = (currentTurn === 'P1') ? 'P2' : 'P1';

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (!u || u.owner !== currentTurn || isCore(u)) continue;

      const inEnemyPoison = poisonZones.some(pz => pz.r === r && pz.c === c && pz.owner === enemyOwner);
      if (inEnemyPoison) {
        dealDamage(null, u, 10, { r, c }, false);
        showDamagePopup(r, c, `毒 -10`, '#10b981');
        addLog(`🧪 トキシック・ゾーン汚染！${u.name} がターン開始時に 10 DMG を受けた！`, 'system');
        checkDeath(r, c, enemyOwner, onGameOver);
      }
    }
  }
}

// バリケードの任意破壊
export function destroyBarricade(r, c) {
  const unit = board[r]?.[c];
  if (!unit || unit.typeKey !== 'BARRICADE') return false;

  showDamagePopup(r, c, `💥防壁破壊!`, '#ef4444');
  addLog(`🧱💥 ${unit.owner === 'P1' ? 'BLUE' : 'RED'} の防壁（バリケード）が破壊ボタンにより破壊された！`, 'system');

  board[r][c] = null;
  return true;
}
