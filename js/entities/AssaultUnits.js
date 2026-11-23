/* ==============================================================
   AssaultUnits.js: アサルト (Assault) ロール ユニットクラス群
   (キネシス, ヴェイル, ブラスト, ビット)
   ============================================================== */
import { UnitEntity } from './UnitEntity.js?v=urban-v1';
import { HERO_TYPES, inBounds } from '../config.js?v=urban-v1';

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
    const { addLog, addSpecialActionOrder } = context;

    if (slot === 'A') {
      this.applyBuff('atk_up', 5, 1);
      addLog(`⚡ ${this.name} が『オーバードライブ』発動！【攻撃力増強 (+5 / このターン中)】を展開（ATK 25 ➔ 30）！`, 'skill');
    } else if (slot === 'ULT') {
      addSpecialActionOrder(this.owner, {
        id: `${this.owner}_attack_kinesis_${Date.now()}`,
        type: 'attack',
        name: '攻撃',
        badgeText: 'EX ATK',
        scope: 'KINESIS',
        unitType: 'KINESIS',
        unitName: 'キネシス',
        used: false,
        desc: 'キネシスのウルト『ライトニング・ラッシュ』による専用攻撃オーダー。キネシスのみが追加で1回通常攻撃できます。'
      });
      addLog(`⚡⚔️ ${this.name} がウルト『ライトニング・ラッシュ』発動！キネシス専用の【追加攻撃オーダー (+1 ATTACK)】を獲得！このターン通常攻撃を追加で1回行える！`, 'skill');
    }
  }

  isPassiveActive(context = {}) {
    const tokens = context.playerOrders ? context.playerOrders[this.owner] : [];
    return (tokens || []).some(t => t.type === 'move' && (t.scope === 'KINESIS' || t.scope === 'DUELIST') && !t.used);
  }

  getPassiveStatusText(context = {}) {
    return this.isPassiveActive(context) ? '✨ 移動可能' : '消費済';
  }
}

// ==========================================
// 2. ヴェイル (Phase / PHANTOM)
// ==========================================
export class VeilUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.VEIL || HERO_TYPES.PHANTOM;
    super({
      typeKey: 'VEIL',
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
    const { addLog } = context;

    if (slot === 'A') {
      if (!context.warpUnit(this, targetPos)) return;
      addLog(`👻 ${this.name} が『テレポート』発動！自軍ディメンション・ゾーン (${targetPos.r}, ${targetPos.c}) へ瞬時に帰還！`, 'skill');
    } else if (slot === 'ULT') {
      this.applyBuff('shadow_drain', 1, 1);
      addLog(`👤🩸 ${this.name} がウルト『シャドウ・ドレイン』発動！このターン中、自身が敵に与えたダメージ分だけHPを吸収・回復する状態になった！`, 'skill');
    }
  }
}

// ==========================================
// 3. ブラスト (Nitro / BOMBER)
// ==========================================
export class BlastUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.BLAST || HERO_TYPES.BOMBER;
    super({
      typeKey: 'BLAST',
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
    const { board, hasFriendlyTrapAt } = context;
    if (slot === 'A') {
      const targets = [];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const r = this.r + dr, c = this.c + dc;
          if (inBounds(r, c) && !board[r][c] && !hasFriendlyTrapAt(r, c)) targets.push({ r, c });
        }
      }
      return targets;
    } else if (slot === 'ULT') {
      return [{ r: this.r, c: this.c }];
    }
    return [];
  }

  executeSkill(slot, targetPos, context = {}) {
    const { board, traps, isLocalPlayer, addLog, dealDamage, checkDeath, onGameOver } = context;

    if (slot === 'A') {
      traps.push({
        r: targetPos.r,
        c: targetPos.c,
        owner: this.owner,
        damage: 20,
        type: 'MINE',
        sourceHeroId: this.id
      });
      if (isLocalPlayer(this.owner)) {
        addLog(`💣 ${this.name} が『マイン・プラント』発動！指定マスにマイン（20 DMGトラップ）を仕掛けた（自軍のみ視認可能・ブラスト破壊後も存続）！`, 'skill');
      } else {
        addLog(`💣 敵の ${this.name} が『マイン・プラント』発動！いずれかのマスにマインを仕掛けた...！`, 'skill');
      }
    } else if (slot === 'ULT') {
      dealDamage(null, this, 10, { r: this.r, c: this.c });
      for (const target of board.flat()) {
        if (!target || target.owner === this.owner || Math.max(Math.abs(target.r - this.r), Math.abs(target.c - this.c)) > 2) continue;
        if (target.isUnit()) target.applyDebuff('silence', 1);
        dealDamage(this, target, 20, target);
        checkDeath(target.r, target.c, this.owner, onGameOver, this);
      }
      checkDeath(this.r, this.c, this.owner === 'P1' ? 'P2' : 'P1', onGameOver);
    }
  }
}

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
    const { addLog, checkDeath, onGameOver } = context;
    if (slot === 'A') {
      addLog(`🛰️💥 ${this.name} がスキル『自壊』を発動し、自身を破壊した！`, 'skill');
      this.hp = 0;
      checkDeath(this.r, this.c, this.owner, onGameOver);
    }
  }

  isPassiveActive(context = {}) {
    const tokens = context.playerOrders ? context.playerOrders[this.owner] : [];
    return (tokens || []).some(t => t.type === 'attack' && t.scope === this.id && !t.used);
  }

  getPassiveStatusText(context = {}) {
    return this.isPassiveActive(context) ? '✨ 自律行動可' : '消費済';
  }
}
