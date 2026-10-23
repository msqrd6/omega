/* ==============================================================
   actions.js: ゲーム内アクション（移動・攻撃・スキル・撃破・バフ/デバフ管理）
   (大型アップデート: スキルトークン廃止・Bスキル廃止・通常攻撃のみウルトチャージ・ハザード連動破壊対応)
   ============================================================== */
import { HERO_TYPES, ROWS, COLS, STATUS_EFFECT_DEFS, ULT_REQUIRED_DAMAGE } from './config.js?v=20261023_20';
import {
  board,
  inBounds,
  traps,
  plasmaZones,
  phantomZones,
  poisonZones,
  findCore,
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
  hasActionToken,
  addSpecialActionToken,
  getPlayerTokens,
  isUnit,
  isCore,
  isObject,
  isLocalPlayer
} from './board.js?v=20261023_20';
import { addLog, showDamagePopup } from './ui.js?v=20261023_20';

// ダメージ付与 ＆ 衰弱増幅 ＆ シールド吸収 ＆ チームウルトゲージチャージ処理
// ★isNormalAttack: true の場合のみチームウルトゲージに加算（スキルやウルト、設置物ダメージは除外）
export function dealDamage(attacker, target, damage, targetPos, isNormalAttack = false) {
  let dmg = Math.max(1, damage);

  // 1. 弱体化（vulnerable）チェック: 被ダメージ1.5倍！
  if (hasDebuff(target, 'vulnerable')) {
    const bonus = Math.floor(dmg * 0.5);
    dmg += bonus;
    showDamagePopup(targetPos.r, targetPos.c, `🎯被ダメ x1.5!`, '#ea580c');
  }

  // 2. シールド吸収チェック (耐久値消費)
  if (hasBuff(target, 'shield')) {
    const shieldObj = target.buffs.shield;
    const absorbed = Math.min(shieldObj.val, dmg);
    shieldObj.val -= absorbed;
    dmg -= absorbed;
    showDamagePopup(targetPos.r, targetPos.c, `🛡️-${absorbed}`, '#00d2ff');

    if (shieldObj.val <= 0) {
      target.buffs.shield = null;
      addLog(`🛡️ ${target.name} のシールドが破壊された！`, 'system');
    }
  }

  // 3. 残余ダメージをHPから減算
  if (dmg > 0) {
    target.hp -= dmg;
    showDamagePopup(targetPos.r, targetPos.c, `-${dmg}`, '#ff3333');
  }

  // 4. チーム共通ウルトゲージ（累計与ダメージ 0〜100）加算
  // ★重要ルール: プレイアブルユニットによる通常攻撃によって与えたダメージのみ加算！
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
// （設置したセントリー・タレットが破壊された際、セントリー・タレットのストックを1回復する）
export function handleTurretDestruction(turretOwner) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === turretOwner && u.typeKey === 'VULCAN') {
        const maxStock = (HERO_TYPES.VULCAN && HERO_TYPES.VULCAN.skills && HERO_TYPES.VULCAN.skills.A.maxStock) || 1;
        u.stockA = Math.min(maxStock, u.stockA + 1);
        showDamagePopup(r, c, `⚙️タレット再装填! [${u.stockA}]`, '#f59e0b');
        addLog(`⚙️🗼 ヴァルカンのパッシブ『クロスファイア・リンク』発動！タレット破壊に伴い、『セントリー・タレット』のストックを1回復（現在: ${u.stockA}/${maxStock}）！`, 'skill');
      }
    }
  }
}

// 撃破チェック & ハザード連動破壊処理 & ニトロのパッシブ自爆 & ヴァルカンのタレット破壊パッシブ
export function checkDeath(r, c, attackerOwner, onGameOver) {
  const target = board[r][c];
  if (!target) return false;

  if (target.hp <= 0) {
    target.hp = 0;
    if (target.typeKey === 'CORE') {
      onGameOver(attackerOwner);
      return true;
    } else {
      addLog(`💀 ${target.name} は撃破された！`, "system");

      // ★【ヴァルカンの固有パッシブ】クロスファイア・リンク:
      // 設置したセントリー・タレットが破壊された際、セントリー・タレットのストックを1回復する
      if (target.typeKey === 'TURRET') {
        handleTurretDestruction(target.owner);
      }



      // ★【大型アップデート】ハザード連動破壊仕様:
      // ハザードを展開したユニットが破壊された場合、盤面上のそのユニットのハザードは同時に破壊・消滅する
      // （※トラップやオブジェクトはそのまま存続する）
      let removedHazardCount = 0;

      // 1. ディメンション・ゾーンの連動破壊
      for (let i = phantomZones.length - 1; i >= 0; i--) {
        const z = phantomZones[i];
        if (z.sourceHeroId === target.id || (z.owner === target.owner && z.sourceHeroType === target.typeKey)) {
          showDamagePopup(z.r, z.c, `👻ハザード消滅!`, '#94a3b8');
          phantomZones.splice(i, 1);
          removedHazardCount++;
        }
      }

      // 2. トキシック・ゾーンの連動破壊
      for (let i = poisonZones.length - 1; i >= 0; i--) {
        const z = poisonZones[i];
        if (z.sourceHeroId === target.id || (z.owner === target.owner && z.sourceHeroType === target.typeKey)) {
          showDamagePopup(z.r, z.c, `🧪ハザード消滅!`, '#94a3b8');
          poisonZones.splice(i, 1);
          removedHazardCount++;
        }
      }

      // 3. プラズマゾーンの連動破壊
      for (let i = plasmaZones.length - 1; i >= 0; i--) {
        const z = plasmaZones[i];
        if (z.sourceHeroId === target.id || (z.owner === target.owner && z.sourceHeroType === target.typeKey)) {
          showDamagePopup(z.r, z.c, `⚡ハザード消滅!`, '#94a3b8');
          plasmaZones.splice(i, 1);
          removedHazardCount++;
        }
      }

      if (removedHazardCount > 0) {
        addLog(`💨 ${target.name} の破壊に伴い、展開されていたハザード (${removedHazardCount}箇所) が同時に破壊・消滅した！`, 'system');
      }

      board[r][c] = null;
      return true;
    }
  }
  return false;
}

// 移動の実行 (キネシス専用移動トークン消費 & ハザード/トラップ踏みチェック付き)
export function executeMove(from, to, onGameOver) {
  const unit = board[from.r][from.c];

  // 物体化トークンシステムで専用トークン優先消費
  const tokens = getPlayerTokens(unit.owner);
  const hadSpecial = tokens.some(t => t.type === 'move' && !t.used && t.scope === unit.typeKey);
  consumeActionToken(unit.owner, 'move', 1, unit);
  if (unit.typeKey === 'DUELIST') {
    unit.kinesisExtraMove = tokens.some(t => (t.id === `${unit.owner}_move_kinesis` || t.id === `${unit.owner}_move_zephyr`) && !t.used) ? 1 : 0;
    unit.zephyrExtraMove = unit.kinesisExtraMove;
  }

  if (hadSpecial) {
    showDamagePopup(to.r, to.c, `⚡専用MOVE消費`, '#ffd700');
    addLog(`⚡ ${unit.name} が専用移動トークン（ライトニング・ステップ）を消費して移動！チーム共通枠を温存！`, unit.owner.toLowerCase());
  } else {
    showDamagePopup(to.r, to.c, `👟MOVE消費`, '#00ffaa');
    addLog(`${unit.owner === 'P1' ? '青' : '赤'}の ${unit.name} が移動しました (移動トークン消費)`, unit.owner.toLowerCase());
  }

  board[to.r][to.c] = unit;
  board[from.r][from.c] = null;

  // 1. トラップ判定（トラップはフェイズでも作動）
  const enemyOwner = (unit.owner === 'P1') ? 'P2' : 'P1';
  const trapIdx = traps.findIndex(tp => tp.r === to.r && tp.c === to.c && tp.owner === enemyOwner);
  if (trapIdx !== -1) {
    const tp = traps[trapIdx];
    traps.splice(trapIdx, 1);
    if (tp.type === 'MINE') {
      addLog(`💥💣 【マイン爆発！】${unit.name} が地雷を踏み、${tp.damage} DMG！マインは消滅した！`, 'system');
      showDamagePopup(to.r, to.c, `💥マイン爆発! -${tp.damage}`, '#f97316');
      dealDamage(null, unit, tp.damage, to, false);
    } else if (tp.type === 'SCRAMBLE_MINE') {
      addLog(`💥🔇 【スクランブル・マイン作動！】${unit.name} がトラップを踏み、${tp.damage} DMG＋【スキル阻害(1T)】＆【行動阻害(1T)】！`, 'system');
      showDamagePopup(to.r, to.c, `🔇スクランブル! -${tp.damage}`, '#64748b');
      dealDamage(null, unit, tp.damage, to, false);
      applyDebuff(unit, 'silence', 1);
      applyDebuff(unit, 'bind', 1);
    } else {
      addLog(`💥 【トラップ発動！】${unit.name} は罠に掛かり、${tp.damage} DMG＋【行動阻害】＆【スキル阻害】＆【攻撃阻害】！`, 'system');
      dealDamage(null, unit, tp.damage, to, false);
      applyDebuff(unit, 'bind', 1);
      applyDebuff(unit, 'silence', 1);
      applyDebuff(unit, 'disarm', 1);
    }
    checkDeath(to.r, to.c, enemyOwner, onGameOver);
  }

  // 2. プラズマゾーン判定
  const inPlasma = plasmaZones.some(pz => pz.r === to.r && pz.c === to.c && pz.owner === enemyOwner);
  if (inPlasma) {
    const dmg = 18;
    addLog(`⚡ プラズマゾーン進入！${unit.name} に ${dmg} DMG＋【衰弱】付与！`, 'system');
    dealDamage(null, unit, dmg, to, false);
    applyDebuff(unit, 'weakness', 2);
    checkDeath(to.r, to.c, enemyOwner, onGameOver);
  }

  // 3. ディメンション・ゾーン（ハザード）判定: 侵入した敵に【弱体化 (1T)】
  const inPhantom = phantomZones.some(pz => pz.r === to.r && pz.c === to.c && pz.owner === enemyOwner);
  if (inPhantom) {
    addLog(`👻 ディメンション・ゾーン進入！${unit.name} に【弱体化 (このターン中 / 被ダメ1.5倍)】が付与された！`, 'system');
    applyDebuff(unit, 'vulnerable', 1);
    showDamagePopup(to.r, to.c, `🎯弱体化(このターン)!`, '#ea580c');
  }

  return { r: to.r, c: to.c };
}

// ★ニトロの固有パッシブ『カウンター・デトネーション』判定ヘルパー
// 自身が敵ユニットに攻撃された場合、攻撃してきた敵ユニットに即座に 10 ダメージの爆破反撃を行う！
export function checkAndTriggerNitroCounter(attacker, target, attackerPos, onGameOver) {
  if (!target || target.typeKey !== 'BOMBER') return;
  if (!attacker || !isUnit(attacker) || attacker.owner === target.owner) return;
  if (!attackerPos) return;

  addLog(`💣💥 ニトロのパッシブ『カウンター・デトネーション』発動！攻撃してきた敵 ${attacker.name} に 10 ダメージの爆破反撃！`, 'skill');
  showDamagePopup(attackerPos.r, attackerPos.c, `💥カウンター 10!`, '#ff0055');
  dealDamage(target, attacker, 10, attackerPos, false);
  checkDeath(attackerPos.r, attackerPos.c, target.owner, onGameOver);
}

// 通常攻撃の実行（★isNormalAttack = true で dealDamage を呼び出す ＆ パッシブシナジー判定）
export function executeAttack(attackerPos, targetPos, onGameOver) {
  const attacker = board[attackerPos.r][attackerPos.c];
  const target = board[targetPos.r][targetPos.c];

  consumeActionToken(attacker.owner, 'attack', 1, attacker);
  showDamagePopup(attackerPos.r, attackerPos.c, `⚔️ATK消費`, '#f59e0b');

  // 基本実効攻撃力（基本ATK ＋ 攻撃力増強バフ ＋ ベクターのオブジェクト隣接パッシブ）
  let totalAtk = getEffectiveAtk(attacker);

  // ★トキシンの固有パッシブ『トキシック・インフェクション』:
  // 敵が「トキシック・ゾーン」内に滞在している場合、ダメージ +10 (15➔25)
  if (attacker.typeKey === 'POISON') {
    const isTargetInPoison = poisonZones.some(pz => pz.r === targetPos.r && pz.c === targetPos.c);
    if (isTargetInPoison) {
      totalAtk += 10;
      showDamagePopup(attackerPos.r, attackerPos.c, `☣️毒シナジー +10!`, '#10b981');
      addLog(`☣️⚡ トキシンのパッシブ『トキシック・インフェクション』発動！毒エリア内の敵へ +10 DMG強打！`, 'skill');
    }
  }



  // 通常攻撃フラグ: true (ウルトゲージ蓄積対象)
  const dmg = dealDamage(attacker, target, totalAtk, targetPos, true);
  addLog(`${attacker.owner === 'P1' ? '青' : '赤'}の ${attacker.name} が ${target.name} を攻撃！(${dmg} DMG / チームウルト蓄積)`, attacker.owner.toLowerCase());

  // ★ニトロの固有パッシブ『カウンター・デトネーション』判定（被弾時に攻撃者へ10爆破反撃）
  checkAndTriggerNitroCounter(attacker, target, attackerPos, onGameOver);

  // 撃破チェック
  checkDeath(targetPos.r, targetPos.c, attacker.owner, onGameOver);
}

// スキル（通常スキルA / ウルトULT）の実行（スキルトークン消費なし）
export function executeSkill(heroPos, targetPos, slot, onGameOver, onResetMoveRight) {
  const hero = board[heroPos.r][heroPos.c];
  const heroDef = HERO_TYPES[hero.typeKey];
  const skillDef = heroDef.skills[slot];

  if (!skillDef) return;

  // ストック消費 or ウルト消費（スキルトークン消費はなし！）
  if (slot === 'A') {
    hero.stockA--;
  } else if (slot === 'ULT') {
    hero.ultUsed = true;
    resetTeamUltGauge(hero.owner);
    showDamagePopup(heroPos.r, heroPos.c, `🌟ULT解放!`, '#00d2ff');
    addLog(`✨ チームウルトゲージを消費しました。通常攻撃で再度ダメージを与えると再チャージされます！`, 'system');
  }

  addLog(`⚡ ${hero.owner === 'P1' ? '青' : '赤'}の ${hero.name} が『${skillDef.name}』発動！`, 'skill');

  const enemyOwner = (hero.owner === 'P1') ? 'P2' : 'P1';

  switch (hero.typeKey) {
    // ==========================================
    // 1. アサルト (キネシス)
    // ==========================================
    case 'DUELIST': {
      if (slot === 'A') {
        // オーバードライブ: 自身に攻撃力+5 (このターン中)
        applyBuff(hero, 'atk_up', 5, 1);
        showDamagePopup(heroPos.r, heroPos.c, `ATK+5 (このターン)!`, '#ff6600');
        addLog(`⚡ ${hero.name} が『オーバードライブ』発動！【攻撃力増強 (+5 / このターン中)】を展開（ATK 25 ➔ 30）！`, 'skill');
      } else if (slot === 'ULT') {
        // ライトニング・ラッシュ: キネシス専用追加攻撃トークンを即座に1枚付与！
        addSpecialActionToken(hero.owner, {
          id: `${hero.owner}_attack_kinesis_${Date.now()}`,
          type: 'attack',
          name: 'キネシス専用攻撃',
          badgeText: 'キネシス専用攻撃',
          icon: '⚡⚔️',
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

    // ==========================================
    // 1-2. アサルト (フェイズ)
    // ==========================================
    case 'PHANTOM': {
      if (slot === 'A') {
        // テレポート: 自軍ディメンション・ゾーンの空きマスへ即座に転移
        board[targetPos.r][targetPos.c] = hero;
        board[heroPos.r][heroPos.c] = null;
        showDamagePopup(targetPos.r, targetPos.c, `👻影転移!`, '#a855f7');
        addLog(`👻 ${hero.name} が『テレポート』発動！自軍ディメンション・ゾーン (${targetPos.r}, ${targetPos.c}) へ瞬時に帰還！`, 'skill');
      } else if (slot === 'ULT') {
        // シャドウ・ドレイン: この自軍ターン中に自身が敵に与えた合計ダメージ分、自身のHPを即座に回復（吸収）
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

    // ==========================================
    // 1-3. アサルト (ニトロ)
    // ==========================================
    case 'BOMBER': {
      if (slot === 'A') {
        // マイン・プラント: 前方6マスの指定空きマスにマイン設置
        if (!hasHazardOrTrapAt(targetPos.r, targetPos.c)) {
          traps.push({
            r: targetPos.r,
            c: targetPos.c,
            owner: hero.owner,
            damage: 20,
            type: 'MINE',
            sourceHeroId: hero.id
          });
          if (isLocalPlayer(hero.owner)) {
            showDamagePopup(targetPos.r, targetPos.c, `💣マイン設置!`, '#f97316');
            addLog(`💣 ${hero.name} が『マイン・プラント』発動！指定マスにマイン（20 DMGトラップ）を仕掛けた（自軍のみ視認可能・ニトロ破壊後も存続）！`, 'skill');
          } else {
            // 敵が設置した場合はマスを秘匿してニトロの上にポップアップ＆ログ
            showDamagePopup(heroPos.r, heroPos.c, `💣マイン設置!`, '#f97316');
            addLog(`💣 敵の ${hero.name} が『マイン・プラント』発動！いずれかのマスにマインを仕掛けた...！`, 'skill');
          }
        }
      } else if (slot === 'ULT') {
        // マキシマム・エクスプロージョン: 半径2マス全軍に 20 ダメージ（自身も被弾）
        const ultDmg = skillDef.damage || 20;
        showDamagePopup(heroPos.r, heroPos.c, `マキシマム・エクスプロージョン!!`, '#ff0055');
        addLog(`💥💣🔥 ${hero.name} がウルト『マキシマム・エクスプロージョン』発動！自身を含む半径2マス全域へ ${ultDmg} ダメージの大爆破！`, 'skill');

        const affectedPositions = [];
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = heroPos.r + dr, nc = heroPos.c + dc;
            if (inBounds(nr, nc)) {
              const u = board[nr][nc];
              if (u) {
                affectedPositions.push({ r: nr, c: nc, unit: u });
              }
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

    // ==========================================
    // 2. センチネル (ベクター)
    // ==========================================
    case 'SENTINEL': {
      if (slot === 'A') {
        // フォース・バリケード: 指定の空きマスに防壁（HP 30）設置
        spawnHero('BARRICADE', hero.owner, targetPos.r, targetPos.c);
        showDamagePopup(targetPos.r, targetPos.c, `防壁設置!`, '#10b981');
        addLog(`🧱 ${hero.name} が『フォース・バリケード』発動！指定マスに防壁（HP 30）を構築！`, 'skill');
      } else if (slot === 'ULT') {
        // バリケード・バッファー: フォース・バリケードのストックを全回復 (最大3回まで再装填)
        hero.stockA = 3;
        showDamagePopup(heroPos.r, heroPos.c, `ストック全回復 [3/3]!`, '#00d2ff');
        addLog(`🛡️ ${hero.name} がウルト『バリケード・バッファー』発動！『フォース・バリケード』のストックが全回復（最大3回まで再装填）した！`, 'skill');
      }
      break;
    }

    // ==========================================
    // 2-2. センチネル (ヴァルカン)
    // ==========================================
    case 'VULCAN': {
      if (slot === 'A') {
        // セントリー・タレット: 指定の空きマスにタレット設置
        spawnHero('TURRET', hero.owner, targetPos.r, targetPos.c);
        showDamagePopup(targetPos.r, targetPos.c, `🗼タレット設置!`, '#10b981');
        addLog(`⚙️🗼 ${hero.name} が『セントリー・タレット』発動！自動防衛タレット（HP 20, ATK 10）を構築！（ヴァルカン破壊後も存続）`, 'skill');
      } else if (slot === 'ULT') {
        // フォートレス・プロトコル: セントリー・タレットを中心とした半径2マスに空爆を要請！
        // 敵ユニット・敵オブジェクトに 25 ダメージを与える（防衛コアは対象外）
        showDamagePopup(heroPos.r, heroPos.c, `フォートレス・プロトコル!!`, '#f97316');

        // 盤面上の自軍セントリー・タレットを検索
        const myTurrets = [];
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const u = board[r][c];
            if (u && u.owner === hero.owner && u.typeKey === 'TURRET') {
              myTurrets.push({ r, c, turret: u });
            }
          }
        }

        // タレットを中心とした半径2マスの空爆範囲を収集（重複除外）
        const blastTiles = new Set();
        myTurrets.forEach(({ r: tr, c: tc }) => {
          showDamagePopup(tr, tc, `🎯空爆目標!`, '#f59e0b');
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const nr = tr + dr, nc = tc + dc;
              if (inBounds(nr, nc)) {
                blastTiles.add(`${nr},${nc}`);
              }
            }
          }
        });

        let hitCount = 0;
        blastTiles.forEach(key => {
          const [tr, tc] = key.split(',').map(Number);
          const t = board[tr][tc];
          // Whitelisting Rule: 敵ユニット・敵オブジェクトのみにダメージ（防衛コアは対象外）
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

    // ==========================================
    // 2-3. センチネル (トキシン)
    // ==========================================
    case 'POISON': {
      if (slot === 'A') {
        // トキシック・カーテン: 自身から指定した方向（右か左）に3マストキシック・ゾーンを展開
        const dir = (targetPos.c > heroPos.c) ? 1 : -1;
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
        // コア・プロテクト: 自コアの周辺8マスにトキシック・ゾーンを一斉展開
        const myCore = findCore(hero.owner);
        if (myCore) {
          let corePos = null;
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              if (board[r][c] === myCore) { corePos = { r, c }; break; }
            }
            if (corePos) break;
          }
          if (corePos) {
            showDamagePopup(corePos.r, corePos.c, `コア・プロテクト!!`, '#10b981');
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = corePos.r + dr, nc = corePos.c + dc;
                if (inBounds(nr, nc) && !hasHazardOrTrapAt(nr, nc)) {
                  poisonZones.push({
                    r: nr,
                    c: nc,
                    owner: hero.owner,
                    sourceHeroId: hero.id,
                    sourceHeroType: hero.typeKey
                  });
                  showDamagePopup(nr, nc, `🧪トキシック!`, '#10b981');
                }
              }
            }
          }
        }
        addLog(`🧪🛡️ ${hero.name} がウルト『コア・プロテクト』発動！自軍コア周辺8マスにトキシック・ゾーン（ハザード）を展開！`, 'skill');
      }
      break;
    }

    // ==========================================
    // 3. ディスラプター (グリッチ)
    // ==========================================
    case 'DISRUPTOR': {
      if (slot === 'A') {
        // グラビティ・ワープ: 自軍アサルトの周囲8マスの空きマスへワープ
        board[targetPos.r][targetPos.c] = hero;
        board[heroPos.r][heroPos.c] = null;
        showDamagePopup(targetPos.r, targetPos.c, `ワープ瞬動!`, '#a855f7');
        addLog(`🌀 ${hero.name} が『グラビティ・ワープ』発動！味方アサルトの隣接マスへ空間跳躍！`, 'skill');

        // ★【固有パッシブ】ディメンション・チャージ:
        // ワープ着地時、半径1マスの敵ユニット全員に【弱体化 (1T / 被ダメ1.5倍)】付与！
        triggerGlitchDimensionCharge(targetPos, enemyOwner);
      } else if (slot === 'ULT') {
        // 緊急回避: 盤面の任意の空きマスへ完全脱出ワープ
        board[targetPos.r][targetPos.c] = hero;
        board[heroPos.r][heroPos.c] = null;
        showDamagePopup(targetPos.r, targetPos.c, `緊急回避!`, '#c084fc');
        addLog(`✨ ${hero.name} がウルト『緊急回避』発動！任意の空きマスへ完全脱出！`, 'skill');

        // ★【固有パッシブ】ディメンション・チャージ:
        triggerGlitchDimensionCharge(targetPos, enemyOwner);
      }
      break;
    }

    // ==========================================
    // 3-2. ディスラプター (サイファー)
    // ==========================================
    case 'CYPHER': {
      if (slot === 'A') {
        // シグナル・ジャミング: 直線初弾ユニット。味方ユニットなら攻撃+15(1T)、敵ユニットなら沈黙(2T)
        const target = board[targetPos.r][targetPos.c];
        if (target && target.typeKey !== 'CORE' && target.typeKey !== 'BARRICADE' && target.typeKey !== 'TURRET') {
          if (target.owner === hero.owner) {
            applyBuff(target, 'atk_up', 15, 1);
            showDamagePopup(targetPos.r, targetPos.c, `🔥ATK+15(このターン)!`, '#ff6600');
            addLog(`🔇⚡ ${hero.name} の『シグナル・ジャミング』が味方 ${target.name} に命中！【攻撃力増強 (+15 / このターン中)】を付与！`, 'skill');
          } else {
            applyDebuff(target, 'disarm', 1);
            showDamagePopup(targetPos.r, targetPos.c, `💢攻撃阻害(1T)!`, '#f59e0b');
            addLog(`🔇⚡ ${hero.name} の『シグナル・ジャミング』が敵 ${target.name} に命中！【攻撃阻害 (1T)】を付与して次ターンの通常攻撃を完全封殺！`, 'skill');
          }
        }
      } else if (slot === 'ULT') {
        // フルスペクトラム・ブラックアウト: 全敵ユニットに行動阻害(1T)＆攻撃阻害(1T)
        showDamagePopup(heroPos.r, heroPos.c, `全軍ブラックアウト!!`, '#334155');
        let affectedCount = 0;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const t = board[r][c];
            if (t && t.owner === enemyOwner && t.typeKey !== 'CORE' && t.typeKey !== 'BARRICADE' && t.typeKey !== 'TURRET') {
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

    // ==========================================
    // 4. サポート (アイリス)
    // ==========================================
    case 'MEDIC': {
      if (slot === 'A') {
        // ライフ・リペア: 半径3マス内の味方ユニット1体を指定しHPを 30 回復する
        const target = board[targetPos.r][targetPos.c];
        if (target && target.typeKey !== 'CORE' && target.typeKey !== 'BARRICADE' && target.typeKey !== 'TURRET') {
          const oldHp = target.hp;
          target.hp = Math.min(target.maxHp, target.hp + (skillDef.heal || 30));
          const healed = target.hp - oldHp;
          showDamagePopup(targetPos.r, targetPos.c, `+${healed} HP`, '#00ffaa');
          addLog(`💉 ${hero.name} が『ライフ・リペア』発動！${target.name} のHPを ${healed} 回復！`, 'skill');
        }
      } else if (slot === 'ULT') {
        // オーバーチャージ・オーラ: 自軍の全ユニットおよび自軍コアに【シールド増強 (+15 / 2T)】を一斉付与！
        showDamagePopup(heroPos.r, heroPos.c, `オーバーチャージ!!`, '#00d2ff');
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const u = board[r][c];
            if (u && u.owner === hero.owner && u.typeKey !== 'BARRICADE' && u.typeKey !== 'TURRET') {
              applyBuff(u, 'shield', skillDef.shieldVal || 15, skillDef.shieldTurns || 2);
              showDamagePopup(r, c, `+15🛡️(2T)`, '#00d2ff');
            }
          }
        }
        addLog(`🌟 ${hero.name} がウルト『オーバーチャージ・オーラ』発動！自軍全ユニットおよび防衛コアに【シールド増強(+15/2T)】を一斉展開！`, 'skill');
      }
      break;
    }

    // ==========================================
    // 4-2. サポート (ネクサス)
    // ==========================================
    case 'HACKER': {
      if (slot === 'A') {
        // リモート・ハック: 距離無制限でユニットを選択（味方ユニットならHP15回復、敵ユニットなら行動阻害1T）
        const target = board[targetPos.r][targetPos.c];
        if (target && target.typeKey !== 'CORE' && target.typeKey !== 'BARRICADE' && target.typeKey !== 'TURRET') {
          if (target.owner === hero.owner) {
            const oldHp = target.hp;
            target.hp = Math.min(target.maxHp, target.hp + (skillDef.heal || 15));
            const healed = target.hp - oldHp;
            showDamagePopup(targetPos.r, targetPos.c, `+${healed} HP`, '#10b981');
            addLog(`💻💚 ${hero.name} が『リモート・ハック』発動！味方 ${target.name} のHPを ${healed} 回復！`, 'skill');
          } else {
            applyDebuff(target, 'bind', skillDef.bindTurns || 1);
            showDamagePopup(targetPos.r, targetPos.c, `⛓️行動阻害(1T)!`, '#a855f7');
            addLog(`💻⚡ ${hero.name} が『リモート・ハック』発動！敵 ${target.name} に【行動阻害(1T)】を付与して移動を封殺！`, 'skill');
          }
        }
      } else if (slot === 'ULT') {
        // EMP: フィールド上の任意の1マスを選択し、半径2マスにあるすべての敵オブジェクト・敵トラップ・敵ハザードを破壊
        showDamagePopup(targetPos.r, targetPos.c, `⚡EMP PULSE!!⚡`, '#38bdf8');
        let destroyedCount = 0;

        // 1. 半径2マスの敵オブジェクト（防壁・タレット）破壊
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = targetPos.r + dr, nc = targetPos.c + dc;
            if (inBounds(nr, nc)) {
              const u = board[nr][nc];
              if (u && u.owner === enemyOwner && (u.typeKey === 'BARRICADE' || u.typeKey === 'TURRET')) {
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
          if (tp.owner === enemyOwner && Math.abs(tp.r - targetPos.r) <= 2 && Math.abs(tp.c - targetPos.c) <= 2) {
            showDamagePopup(tp.r, tp.c, `🪤トラップ無効化!`, '#38bdf8');
            traps.splice(i, 1);
            destroyedCount++;
          }
        }

        // 3. 半径2マスの敵ハザード消去
        for (let i = plasmaZones.length - 1; i >= 0; i--) {
          const z = plasmaZones[i];
          if (z.owner === enemyOwner && Math.abs(z.r - targetPos.r) <= 2 && Math.abs(z.c - targetPos.c) <= 2) {
            showDamagePopup(z.r, z.c, `⚡ハザード消滅!`, '#38bdf8');
            plasmaZones.splice(i, 1);
            destroyedCount++;
          }
        }
        for (let i = phantomZones.length - 1; i >= 0; i--) {
          const z = phantomZones[i];
          if (z.owner === enemyOwner && Math.abs(z.r - targetPos.r) <= 2 && Math.abs(z.c - targetPos.c) <= 2) {
            showDamagePopup(z.r, z.c, `👻ハザード消滅!`, '#38bdf8');
            phantomZones.splice(i, 1);
            destroyedCount++;
          }
        }
        for (let i = poisonZones.length - 1; i >= 0; i--) {
          const z = poisonZones[i];
          if (z.owner === enemyOwner && Math.abs(z.r - targetPos.r) <= 2 && Math.abs(z.c - targetPos.c) <= 2) {
            showDamagePopup(z.r, z.c, `🧪ハザード消滅!`, '#38bdf8');
            poisonZones.splice(i, 1);
            destroyedCount++;
          }
        }

        addLog(`💻⚡💥 ${hero.name} がウルト『EMP』発動！指定地点から半径2マス以内の敵設置物・トラップ・ハザード ${destroyedCount} 件を完全消滅！`, 'skill');
      }
      break;
    }
  }
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
        if (u && u.owner === enemyOwner && u.typeKey !== 'CORE' && u.typeKey !== 'BARRICADE' && u.typeKey !== 'TURRET') {
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

// ターン終了時：パッシブ効果の自動発動（アイリスのナノ自動回復 & ネクサスのウルト自動チャージ）
export function processTurnEndPassives(currentTurn) {
  // 1. アイリスのパッシブ『ナノ・エンハンスメント』:
  // 自身の直線上にいる最も近い味方ユニット1体のHPを 5 自動回復
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === currentTurn && u.typeKey === 'MEDIC') {
        // 自軍の前方一直線上（P1は上一直線、P2は下一直線）のみを対象とする
        const forwardDir = (u.owner === 'P1') ? -1 : 1;
        let closestAlly = null;

        let step = 1;
        while (true) {
          const nr = r + forwardDir * step;
          const nc = c;
          if (!inBounds(nr, nc)) break;
          const piece = board[nr][nc];
          if (piece) {
            // 敵ユニット、防衛コア、オブジェクト（防壁・タレット）は障害物として射線を遮断
            if (piece.owner !== currentTurn || isCore(piece) || isObject(piece)) {
              break;
            }
            // 自軍ユニットの場合
            if (isUnit(piece) && piece.owner === currentTurn) {
              if (piece.hp < piece.maxHp) {
                // 負傷している味方を発見！
                closestAlly = { r: nr, c: nc, unit: piece };
                break; // 前方一直線で最も近い負傷味方を見つけたので終了
              }
              // HP満タンの味方の場合はナノマシンが通過（奥に負傷した味方がいれば届く）
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

  // 2. ネクサスのパッシブ『システム・オーバーライド』:
  // 生存中、ターン終了時にチームウルトゲージが直接 +5 チャージ
  let nexusAlive = false;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.owner === currentTurn && u.typeKey === 'HACKER') {
        nexusAlive = true;
        break;
      }
    }
    if (nexusAlive) break;
  }

  if (nexusAlive) {
    addTeamUltDamage(currentTurn, 5);
    addLog(`💻⚡ ネクサスのパッシブ『システム・オーバーライド』発動！チームウルトゲージが直接 +5 チャージされた！`, 'skill');
  }
}

// ターン終了時：持続効果（バフ・デバフ）のターン減算 & 解除処理
// ★重要ルール: 弱体化等の「自手番のみ有効な効果（このターン中）」は、手番プレイヤー (currentTurn) がターン終了した際に即座に解除されます。
export function tickTurnEffects(currentTurn, onGameOver) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (!u) continue;

      if (u.owner === currentTurn) {
        // A. 手番プレイヤーのユニット (自軍): バフ終了 & 自身が受けていた妨害デバフの経過消化
        // 1. バフのターン減算 (自ターン終了で1Tバフ等は消滅)
        if (u.buffs) {
          // 攻撃力増強
          if (u.buffs.atk_up) {
            u.buffs.atk_up.turns--;
            if (u.buffs.atk_up.turns <= 0) {
              u.buffs.atk_up = null;
              addLog(`💨 ${u.name} の【攻撃力増強】が終了しました`, 'system');
            }
          }
          // シールド増強
          if (u.buffs.shield) {
            u.buffs.shield.turns--;
            if (u.buffs.shield.turns <= 0) {
              u.buffs.shield = null;
              addLog(`💨 ${u.name} の【シールド増強】が時間経過で消滅しました`, 'system');
            }
          }
          // 移動範囲拡張
          if (u.buffs.extended_move) {
            u.buffs.extended_move.turns--;
            if (u.buffs.extended_move.turns <= 0) {
              u.buffs.extended_move = null;
            }
          }
        }

        // 2. 自軍ユニットのデバフターン減算 (手番を消費したため妨害解除)
        if (u.debuffs) {
          const debuffKeys = ['weakness', 'vulnerable', 'disarm', 'bind', 'silence'];
          for (const k of debuffKeys) {
            if (u.debuffs[k]) {
              u.debuffs[k].turns--;
              if (u.debuffs[k].turns <= 0) {
                if (k === 'weakness' && u.debuffs.weakness && u.debuffs.weakness.lostHp && u.hp > 0) {
                  const restored = u.debuffs.weakness.lostHp;
                  u.hp = Math.min(u.maxHp, u.hp + restored);
                  addLog(`✨ ${u.name} の【衰弱】が解除され、HPが ${restored} 回復（復元）しました！`, 'system');
                  showDamagePopup(r, c, `+${restored} HP`, '#10b981');
                } else {
                  const def = STATUS_EFFECT_DEFS[k];
                  addLog(`✨ ${u.name} の【${def ? def.name : k}】が解除されました`, 'system');
                }
                u.debuffs[k] = null;
              }
            }
          }
        }
      } else {
        // B. 非手番プレイヤーのユニット (敵軍):
        // 攻撃側の手番中のみ有効な異常状態【弱体化 (vulnerable)】は、攻撃側プレイヤー (currentTurn) が手番を終えた時点で解除！
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

  // 3. プラズマゾーンの滞在ダメージ（ウルト蓄積対象外）
  for (let i = plasmaZones.length - 1; i >= 0; i--) {
    const pz = plasmaZones[i];
    const u = board[pz.r][pz.c];
    if (u && u.owner === currentTurn) {
      addLog(`⚡ プラズマゾーン滞在！${u.name} に ${pz.dotDamage} DMG！`, 'system');
      dealDamage(null, u, pz.dotDamage, { r: pz.r, c: pz.c }, false);
      checkDeath(pz.r, pz.c, pz.owner, onGameOver);
    }
  }
}

// ターン終了時：自動防衛タレットの自動射撃（前方6マスのすべての敵ユニットに10 DMG、ウルト蓄積対象外）
export function processTurretAttacks(currentTurn, onGameOver) {
  const enemyOwner = (currentTurn === 'P1') ? 'P2' : 'P1';

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.typeKey === 'TURRET' && u.owner === currentTurn) {
        const hitEnemies = [];
        const forwardDir = (u.owner === 'P1') ? -1 : 1; // P1(青)は上方向(-1)、P2(赤)は下方向(+1)

        // 周囲8マス迎撃
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const fr = r + dr, fc = c + dc;
            if (inBounds(fr, fc)) {
              const t = board[fr][fc];
              // Whitelisting Rule: 「敵ユニット」のみ迎撃（コア・オブジェクトは対象外）
              if (t && t.owner === enemyOwner && isUnit(t)) {
                hitEnemies.push({ r: fr, c: fc, unit: t });
              }
            }
          }
        }

        if (hitEnemies.length > 0) {
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
}

// ターン開始時：トキシック・ゾーン（ハザード）にいる敵ユニットへのダメージ判定（ウルト蓄積対象外）
export function processTurnStartHazards(currentTurn, onGameOver) {
  const enemyOwner = (currentTurn === 'P1') ? 'P2' : 'P1';

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (!u || u.owner !== currentTurn || u.typeKey === 'CORE') continue;

      // 敵のトキシック・ゾーンに滞在している場合、ターン開始時に10ダメージを受ける
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

// バリケードの任意破壊（破壊ボタン機能）
export function destroyBarricade(r, c) {
  const unit = board[r]?.[c];
  if (!unit || unit.typeKey !== 'BARRICADE') return false;

  showDamagePopup(r, c, `💥防壁破壊!`, '#ef4444');
  addLog(`🧱💥 ${unit.owner === 'P1' ? 'BLUE' : 'RED'} の防壁（バリケード）が破壊ボタンにより破壊された！`, 'system');

  board[r][c] = null;
  return true;
}
