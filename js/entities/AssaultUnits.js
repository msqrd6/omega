/* ==============================================================
   AssaultUnits.js: アサルト (Assault) ロール ユニットクラス群
   (キネシス, フェイズ, ニトロ, ビット)
   ============================================================== */
import { UnitEntity } from './UnitEntity.js?v=20261024_11';
import { HERO_TYPES, inBounds } from '../config.js?v=20261024_11';

// ==========================================
// 1. キネシス (Kinesis / DUELIST)
// ==========================================
export class KinesisUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.KINESIS || HERO_TYPES.DUELIST;
    super({
      typeKey: 'KINESIS',
      name: def.name,
      icon: def.icon,
      owner,
      hp: def.maxHp,
      maxHp: def.maxHp,
      atk: def.atk,
      role: def.role,
      roleName: def.roleName,
      roleClass: def.roleClass,
      desc: def.desc,
      passive: def.passive,
      skills: def.skills,
      r,
      c
    });
  }

  getSkillTargets(slot) {
    if (slot === 'A' || slot === 'ULT') {
      return [{ r: this.r, c: this.c }];
    }
    return [];
  }

  executeSkill(slot, targetPos, context = {}) {
    const { showDamagePopup, addLog, addSpecialActionToken } = context;

    if (slot === 'A') {
      this.applyBuff('atk_up', 5, 1);
      showDamagePopup(this.r, this.c, `ATK+5 (このターン)!`, '#ff6600');
      addLog(`⚡ ${this.name} が『オーバードライブ』発動！【攻撃力増強 (+5 / このターン中)】を展開（ATK 25 ➔ 30）！`, 'skill');
    } else if (slot === 'ULT') {
      addSpecialActionToken(this.owner, {
        id: `${this.owner}_attack_kinesis_${Date.now()}`,
        type: 'attack',
        name: '攻撃',
        badgeText: '攻撃',
        scope: 'KINESIS',
        unitType: 'KINESIS',
        unitName: 'キネシス',
        used: false,
        desc: 'キネシスのウルト『ライトニング・ラッシュ』による専用攻撃トークン。キネシスのみが追加で1回通常攻撃できます。'
      });
      showDamagePopup(this.r, this.c, `⚡⚔️専用攻撃+1!`, '#00d2ff');
      addLog(`⚡⚔️ ${this.name} がウルト『ライトニング・ラッシュ』発動！キネシス専用の【追加攻撃トークン (+1 ATTACK)】を獲得！このターン通常攻撃を追加で1回行える！`, 'skill');
    }
  }

  isPassiveActive(context = {}) {
    const tokens = context.playerTokens ? context.playerTokens[this.owner] : [];
    return (tokens || []).some(t => t.type === 'move' && (t.scope === 'KINESIS' || t.scope === 'DUELIST') && !t.used);
  }

  getPassiveStatusText(context = {}) {
    return this.isPassiveActive(context) ? '✨ 移動可能' : '消費済';
  }
}

// ==========================================
// 2. フェイズ (Phase / PHANTOM)
// ==========================================
export class PhaseUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.PHASE || HERO_TYPES.PHANTOM;
    super({
      typeKey: 'PHASE',
      name: def.name,
      icon: def.icon,
      owner,
      hp: def.maxHp,
      maxHp: def.maxHp,
      atk: def.atk,
      role: def.role,
      roleName: def.roleName,
      roleClass: def.roleClass,
      desc: def.desc,
      passive: def.passive,
      skills: def.skills,
      r,
      c
    });
  }

  getSkillTargets(slot, context = {}) {
    const { phantomZones, board } = context;
    if (slot === 'A') {
      const targets = [];
      const myZones = (phantomZones || []).filter(pz => pz.owner === this.owner);
      for (const pz of myZones) {
        if (inBounds(pz.r, pz.c) && !board[pz.r][pz.c]) {
          targets.push({ r: pz.r, c: pz.c });
        }
      }
      return targets;
    } else if (slot === 'ULT') {
      return [{ r: this.r, c: this.c }];
    }
    return [];
  }

  executeSkill(slot, targetPos, context = {}) {
    const { board, showDamagePopup, addLog } = context;

    if (slot === 'A') {
      board[targetPos.r][targetPos.c] = this;
      board[this.r][this.c] = null;
      this.setPosition(targetPos.r, targetPos.c);
      showDamagePopup(targetPos.r, targetPos.c, `👻影転移!`, '#a855f7');
      addLog(`👻 ${this.name} が『テレポート』発動！自軍ディメンション・ゾーン (${targetPos.r}, ${targetPos.c}) へ瞬時に帰還！`, 'skill');
    } else if (slot === 'ULT') {
      const drainAmount = this.turnDamageDealt || 0;
      if (drainAmount > 0) {
        const actualHealed = Math.min(this.maxHp - this.hp, drainAmount);
        this.hp = Math.min(this.maxHp, this.hp + drainAmount);
        showDamagePopup(this.r, this.c, `+${actualHealed} HP吸収!`, '#10b981');
        addLog(`👤🩸 ${this.name} がウルト『シャドウ・ドレイン』発動！このターンに敵へ与えた ${drainAmount} DMG を吸収し、HPを ${actualHealed} 回復！(HP: ${this.hp}/${this.maxHp})`, 'skill');
      } else {
        showDamagePopup(this.r, this.c, `与ダメなし(回復0)`, '#94a3b8');
        addLog(`👤 ${this.name} がウルト『シャドウ・ドレイン』発動！しかしこのターンに敵へダメージを与えていないため回復量は 0 です。`, 'system');
      }
    }
  }
}

// ==========================================
// 3. ニトロ (Nitro / BOMBER)
// ==========================================
export class NitroUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.NITRO || HERO_TYPES.BOMBER;
    super({
      typeKey: 'NITRO',
      name: def.name,
      icon: def.icon,
      owner,
      hp: def.maxHp,
      maxHp: def.maxHp,
      atk: def.atk,
      role: def.role,
      roleName: def.roleName,
      roleClass: def.roleClass,
      desc: def.desc,
      passive: def.passive,
      skills: def.skills,
      r,
      c
    });
  }

  getSkillTargets(slot, context = {}) {
    const { board, hasHazardOrTrapAt } = context;
    if (slot === 'A') {
      const targets = [];
      const forwardDir = (this.owner === 'P1') ? -1 : 1;
      for (let step = 1; step <= 2; step++) {
        const nr = this.r + forwardDir * step;
        for (let dc = -1; dc <= 1; dc++) {
          const nc = this.c + dc;
          if (inBounds(nr, nc) && !board[nr][nc] && !hasHazardOrTrapAt(nr, nc)) {
            targets.push({ r: nr, c: nc });
          }
        }
      }
      return targets;
    } else if (slot === 'ULT') {
      return [{ r: this.r, c: this.c }];
    }
    return [];
  }

  executeSkill(slot, targetPos, context = {}) {
    const { board, traps, hasHazardOrTrapAt, isLocalPlayer, showDamagePopup, addLog, dealDamage, checkDeath, onGameOver } = context;

    if (slot === 'A') {
      if (!hasHazardOrTrapAt(targetPos.r, targetPos.c)) {
        traps.push({
          r: targetPos.r,
          c: targetPos.c,
          owner: this.owner,
          damage: 20,
          type: 'MINE',
          sourceHeroId: this.id
        });
        if (isLocalPlayer(this.owner)) {
          showDamagePopup(targetPos.r, targetPos.c, `💣マイン設置!`, '#f97316');
          addLog(`💣 ${this.name} が『マイン・プラント』発動！指定マスにマイン（20 DMGトラップ）を仕掛けた（自軍のみ視認可能・ニトロ破壊後も存続）！`, 'skill');
        } else {
          showDamagePopup(this.r, this.c, `💣マイン設置!`, '#f97316');
          addLog(`💣 敵の ${this.name} が『マイン・プラント』発動！いずれかのマスにマインを仕掛けた...！`, 'skill');
        }
      }
    } else if (slot === 'ULT') {
      const ultDmg = 20;
      showDamagePopup(this.r, this.c, `マキシマム・エクスプロージョン!!`, '#ff0055');
      addLog(`💥💣🔥 ${this.name} がウルト『マキシマム・エクスプロージョン』発動！自身を含む半径2マス全域へ ${ultDmg} ダメージの大爆破！`, 'skill');

      const affectedPositions = [];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = this.r + dr, nc = this.c + dc;
          if (inBounds(nr, nc)) {
            const u = board[nr][nc];
            if (u) affectedPositions.push({ r: nr, c: nc, unit: u });
          }
        }
      }

      affectedPositions.forEach(({ r: ar, c: ac, unit: targetUnit }) => {
        showDamagePopup(ar, ac, `-${ultDmg}💥`, '#ff0055');
        dealDamage(this, targetUnit, ultDmg, { r: ar, c: ac }, false);
        checkDeath(ar, ac, this.owner, onGameOver);
      });
    }
  }

  // パッシブ『カウンター・デトネーション』: 攻撃してきた敵に10ダメージの爆破反撃
  onAttacked(attacker, attackerPos, context = {}) {
    if (!attacker || !attacker.isUnit() || attacker.owner === this.owner) return;
    if (!attackerPos) return;
    const { showDamagePopup, addLog, dealDamage, checkDeath, onGameOver } = context;

    addLog(`💣💥 ニトロのパッシブ『カウンター・デトネーション』発動！攻撃してきた敵 ${attacker.name} に 10 ダメージの爆破反撃！`, 'skill');
    showDamagePopup(attackerPos.r, attackerPos.c, `💥カウンター 10!`, '#ff0055');
    dealDamage(this, attacker, 10, attackerPos, false);
    checkDeath(attackerPos.r, attackerPos.c, this.owner, onGameOver);
  }
}

// ==========================================
// 4. ビット (Bit / BIT)
// ==========================================
export class BitUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.BIT;
    super({
      typeKey: 'BIT',
      name: def.name,
      icon: def.icon,
      owner,
      hp: def.maxHp,
      maxHp: def.maxHp,
      atk: def.atk,
      role: def.role,
      roleName: def.roleName,
      roleClass: def.roleClass,
      desc: def.desc,
      passive: def.passive,
      skills: def.skills,
      r,
      c
    });
  }

  getSkillTargets(slot) {
    if (slot === 'A') {
      return [{ r: this.r, c: this.c }];
    }
    return [];
  }

  executeSkill(slot, targetPos, context = {}) {
    const { showDamagePopup, addLog, checkDeath, onGameOver } = context;
    if (slot === 'A') {
      showDamagePopup(this.r, this.c, `💥自壊!`, '#94a3b8');
      addLog(`🛰️💥 ${this.name} がスキル『自壊』を発動し、自身を破壊した！`, 'skill');
      this.hp = 0;
      checkDeath(this.r, this.c, this.owner, onGameOver);
    }
  }

  isPassiveActive(context = {}) {
    const tokens = context.playerTokens ? context.playerTokens[this.owner] : [];
    return (tokens || []).some(t => t.type === 'attack' && t.scope === this.id && !t.used);
  }

  getPassiveStatusText(context = {}) {
    return this.isPassiveActive(context) ? '✨ 自律行動可' : '消費済';
  }
}
