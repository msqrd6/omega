/* ==============================================================
   SupportUnits.js: サポート (Support) ロール ユニットクラス群
   (リリー, ネクサス, オーラ)
   ============================================================== */
import { UnitEntity } from './UnitEntity.js?v=lab-white-1';
import { HERO_TYPES, ROWS } from '../config.js?v=lab-white-3';
import { allyLandingCells, boardCells, cellsInRadius, getSkillImpact, occupants } from '../battle-targets.js';

function heal(piece, amount, playCombatPopupFX) {
  const restored = Math.min(amount, piece.maxHp - piece.hp);
  piece.hp += restored;
  if (restored > 0) playCombatPopupFX('heal', piece, restored);
}

// ==========================================
// 1. リリー (Iris / MEDIC)
// ==========================================
export class LilyUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.LILY || HERO_TYPES.MEDIC;
    super({
      typeKey: 'LILY',
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
    if (slot === 'ULT') return [{ r: this.r, c: this.c }];
    return cellsInRadius(this, this.skills.A.range).filter(({ r, c }) => {
      const ally = board[r][c];
      return ally?.isUnit() && ally.owner === this.owner &&
        (ally.hp < ally.maxHp || ally.debuffs.length > 0);
    });
  }

  executeSkill(slot, target, { board, playCombatPopupFX, playPassivePopupFX }) {
    for (const ally of getSkillImpact(this, slot, target, board).targets) {
      const cleansed = ally.debuffs.length > 0;
      heal(ally, this.skills[slot].heal, playCombatPopupFX);
      ally.clearAllDebuffs();
      if (cleansed) playPassivePopupFX(ally, { label: 'デバフ解除', kind: 'heal' });
    }
  }

  onTurnEnd({ board, playBeamFX, playCombatPopupFX }) {
    const dir = this.owner === 'P1' ? -1 : 1;
    for (let r = this.r + dir; board[r]; r += dir) {
      const piece = board[r][this.c];
      if (!piece) continue;
      playBeamFX(this, piece, { kind: 'heal' });
      if (piece.owner === this.owner && (piece.isUnit() || piece.isObject())) {
        heal(piece, 5, playCombatPopupFX);
      }
      return;
    }
    playBeamFX(this, { r: dir < 0 ? 0 : ROWS - 1, c: this.c }, { kind: 'heal' });
  }
}

// ==========================================
// 2. ネクサス (Nexus / HACKER)
// ==========================================
export class NexusUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.NEXUS || HERO_TYPES.HACKER;
    super({
      typeKey: 'NEXUS',
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
    const count = board.flat().filter(ally => ally?.isUnit() && ally.owner === this.owner &&
      ally.hp > 0 && ally.getShieldVal() > 0).length;
    return Math.min(15, count * 3);
  }

  getSkillTargets(slot, { board }) {
    const cells = boardCells();
    if (slot === 'ULT') return cells;
    return occupants(board, cells, this.owner, 'ally', ['UNIT'])
      .map(({ r, c }) => ({ r, c }));
  }

  executeSkill(slot, target, { board, playPassivePopupFX }) {
    const { shieldVal, shieldTurns, atkBonus } = this.skills[slot];
    for (const ally of getSkillImpact(this, slot, target, board).targets) {
      ally.applyBuff('shield', shieldVal, shieldTurns);
      if (atkBonus) ally.applyBuff('atk_up', atkBonus);
      playPassivePopupFX(ally, { label: atkBonus ? `SHIELD +${shieldVal} / ATK +${atkBonus}` : `SHIELD +${shieldVal}` });
    }
  }
}

export class HaloUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.HALO;
    super({
      typeKey: 'HALO',
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
    return slot === 'A' ? [{ r: this.r, c: this.c }] : allyLandingCells(this, board, false);
  }

  executeSkill(slot, target, { board, warpUnit, playCombatPopupFX }) {
    if (slot === 'ULT' && !warpUnit(this, target)) return;
    for (const ally of getSkillImpact(this, slot, target, board).targets) {
      heal(ally, this.skills.A.heal, playCombatPopupFX);
    }
  }

  onTurnEnd({ board, playCombatPopupFX }) {
    const allies = occupants(board, cellsInRadius(this, 1), this.owner, 'ally', ['UNIT']);
    const wounded = allies.filter(ally => ally.hp < ally.maxHp).sort((a, b) => a.hp - b.hp);
    if (wounded.length) heal(wounded[0], 5, playCombatPopupFX);
  }
}
