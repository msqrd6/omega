/* ==============================================================
   AssaultUnits.js: アサルト (Assault) ロール ユニットクラス群
   (キネシス, ヴェイル, ブラスト, ビット)
   ============================================================== */
import { UnitEntity } from './UnitEntity.js?v=lab-white-1';
import { HERO_TYPES } from '../config.js?v=lab-white-3';
import { cellsInRadius, getSkillImpact, isEmptyAt } from '../battle-targets.js';

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
      this.grantMoveOrder(this.skills.A.name, context);
    } else if (slot === 'ULT') {
      addSpecialActionOrder(this.owner, {
        id: `${this.id}_ex_atk`,
        type: 'attack',
        name: '攻撃',
        badgeText: 'EX ATK',
        scope: this.id,
        unitType: this.typeKey,
        unitName: this.name,
        used: false,
        desc: 'キネシスのウルト『ライトニング・ラッシュ』による専用攻撃オーダー。キネシスのみが追加で1回通常攻撃できます。'
      });
      addLog(`⚡⚔️ ${this.name} がウルト『ライトニング・ラッシュ』発動！キネシス専用の【追加攻撃オーダー (+1 ATTACK)】を獲得！このターン通常攻撃を追加で1回行える！`, 'skill');
    }
  }

  onKill(target, context) {
    if (context.currentTurn !== this.owner || target.owner === this.owner || !target.isUnit()) return;
    this.grantMoveOrder(this.passive.name, context);
    context.playPassivePopupFX?.(this, { label: '+1 EX MOVE' });
    context.addLog(`⚡ ${this.name} の『${this.passive.name}』発動！専用移動オーダー (+1 EX MOVE) を獲得！`, 'skill');
  }

  grantMoveOrder(source, { addSpecialActionOrder, getPlayerOrders }) {
    addSpecialActionOrder(this.owner, {
      id: `${this.id}_ex_move_${getPlayerOrders(this.owner).length}`,
      type: 'move',
      name: '移動',
      badgeText: 'EX MOVE',
      scope: this.id,
      unitType: this.typeKey,
      unitName: this.name,
      used: false,
      desc: `『${source}』によるキネシス専用の移動オーダー。`
    });
  }

  isPassiveActive(context = {}) {
    const tokens = context.playerOrders ? context.playerOrders[this.owner] : [];
    return (tokens || []).some(t => t.type === 'move' && t.scope === this.id && !t.used);
  }

  getPassiveStatusText(context = {}) {
    return this.isPassiveActive(context) ? 'EX MOVE 保有中' : 'EX MOVE なし';
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

  getPassiveAtk({ board } = {}) {
    if (!board) return 0;
    return cellsInRadius(this, 1, false).some(({ r, c }) => {
      const ally = board[r][c];
      return ally?.owner === this.owner && ally.hp > 0;
    }) ? 0 : this.passive.atkBonus;
  }

  getSkillTargets(slot, { board }) {
    if (slot === 'ULT') return [{ r: this.r, c: this.c }];
    return cellsInRadius(this, this.skills.A.range).filter(pos => isEmptyAt(board, pos));
  }

  executeSkill(slot, target, { warpUnit, playPassivePopupFX }) {
    if (slot === 'A') {
      warpUnit(this, target);
    } else {
      const { atkBonus, shieldVal, shieldTurns } = this.skills.ULT;
      this.applyBuff('atk_up', atkBonus);
      this.applyBuff('shield', shieldVal, shieldTurns);
      playPassivePopupFX(this, { label: `ATK +${atkBonus} / SHIELD +${shieldVal}` });
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

  getSkillTargets(slot, { board }) {
    const cells = cellsInRadius(this, this.skills[slot].range);
    if (slot === 'ULT') return cells;
    return cells.filter(pos => getSkillImpact(this, slot, pos, board).targets.length > 0);
  }

  executeSkill(slot, target, { board, hit, playBeamFX }) {
    const { targets } = getSkillImpact(this, slot, target, board);
    if (slot === 'A') playBeamFX(this, target, { kind: 'attack' });
    for (const piece of targets) hit(this, piece, this.skills[slot].damage);
  }

  onAttacked(attacker, { hit, addLog, playBeamFX, playPassivePopupFX }) {
    addLog(`💣 ${this.passive.name}発動！${attacker.name}に5 DMG。`, 'skill');
    playPassivePopupFX(this, { label: '反撃爆破', kind: 'attack' });
    playBeamFX(this, attacker, { kind: 'attack' });
    hit(this, attacker, 5);
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
      addLog(`🛰️💥 ${this.name} がスキル『デリート』を発動し、自身を破壊した！`, 'skill');
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
