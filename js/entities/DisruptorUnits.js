/* ==============================================================
   DisruptorUnits.js: ディスラプター (Disruptor) ロール ユニットクラス群
   (グリッチ, プリズム, ハイヴ)
   ============================================================== */
import { UnitEntity } from './UnitEntity.js?v=lab-white-1';
import { HERO_TYPES } from '../config.js?v=lab-white-3';
import { allyLandingCells, boardCells, diagonalDirections, diagonalRay, getSkillImpact, isEmptyAt, occupants } from '../battle-targets.js';

// ==========================================
// 1. グリッチ (Glitch / DISRUPTOR)
// ==========================================
export class GlitchUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.GLITCH || HERO_TYPES.DISRUPTOR;
    super({
      typeKey: 'GLITCH',
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
    const cells = boardCells();
    if (slot === 'ULT') return cells.filter(pos => isEmptyAt(board, pos));
    return occupants(board, cells, this.owner, 'ally', ['UNIT'])
      .filter(ally => ally !== this)
      .map(({ r, c }) => ({ r, c }));
  }

  executeSkill(slot, target, { board, warpUnit, swapUnits, playPassivePopupFX }) {
    if (slot === 'A') {
      swapUnits(this, board[target.r][target.c]);
      return;
    }
    warpUnit(this, target);
    const { targets } = getSkillImpact(this, slot, target, board);
    for (const enemy of targets) {
      enemy.applyDebuff('silence', 1);
      playPassivePopupFX(enemy, { label: 'スキル阻害', kind: 'debuff', delayMs: 220 });
    }
  }

  onWarp({ board, playPassivePopupFX }) {
    const { targets } = getSkillImpact(this, 'A', this, board);
    for (const enemy of targets) {
      enemy.applyDebuff('vulnerable');
      playPassivePopupFX(enemy, { label: '弱体化 ×1.5', kind: 'debuff', color: '#ea580c' });
    }
  }
}

// ==========================================
// 2. プリズム (Cypher / PRISM)
// ==========================================
export class PrismUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.PRISM;
    super({
      typeKey: 'PRISM',
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

  getSkillTargets() {
    return diagonalDirections(this);
  }

  executeSkill(slot, target, { board, hit, playBeamFX, playPassivePopupFX }) {
    const { cells, targets } = getSkillImpact(this, slot, target, board);
    playBeamFX(this, cells.at(-1), { kind: slot === 'ULT' ? 'attack' : 'debuff', color: '#a855f7' });
    for (const piece of targets) {
      if (slot === 'ULT') hit(this, piece, this.skills.ULT.damage);
      else {
        piece.applyDebuff('bind', 1);
        playPassivePopupFX(piece, { label: '行動阻害', kind: 'debuff' });
      }
    }
  }

  onTurnEnd({ board, hit, playBeamFX }) {
    for (const direction of diagonalDirections(this)) {
      const cells = diagonalRay(this, direction);
      playBeamFX(this, cells.at(-1), { kind: 'attack', color: '#a855f7' });
      for (const piece of occupants(board, cells, this.owner, 'enemy', ['UNIT', 'OBJECT'])) {
        hit(this, piece, 5);
      }
    }
  }
}

export class HiveUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.HIVE;
    super({
      typeKey: 'HIVE',
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
    return slot === 'A'
      ? allyLandingCells(this, board, true)
      : boardCells().filter(pos => isEmptyAt(board, pos));
  }

  executeSkill(slot, target, { board, spawnUnit, playPassivePopupFX }) {
    const bit = spawnUnit('BIT', this.owner, target.r, target.c);
    bit.summonerId = this.id;
    if (slot !== 'ULT') return;

    const { shieldVal, atkBonus } = this.skills.ULT;
    const { targets } = getSkillImpact(this, slot, target, board);
    for (const ally of targets) {
      ally.applyBuff('shield', shieldVal, 1);
      ally.applyBuff('atk_up', atkBonus);
      playPassivePopupFX(ally, { label: `SHIELD +${shieldVal} / ATK +${atkBonus}` });
    }
  }
}
