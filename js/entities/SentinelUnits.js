/* ==============================================================
   SentinelUnits.js: センチネル (Sentinel) ロール ユニットクラス群
   (ウォーデン, ヴァルカン, スモッグ)
   ============================================================== */
import { UnitEntity } from './UnitEntity.js?v=lab-white-1';
import { HERO_TYPES } from '../config.js?v=lab-white-3';
import { boardCells, cellsInRadius, getSkillImpact, isEmptyAt, occupants } from '../battle-targets.js';

// ==========================================
// 1. ウォーデン (Vector / SENTINEL)
// ==========================================
export class WardenUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.WARDEN || HERO_TYPES.SENTINEL;
    super({
      typeKey: 'WARDEN',
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

  // パッシブ『バンカー・スタンス』: 味方オブジェクトまたは味方アンカーに隣接時、ATK +5
  getPassiveAtk({ board } = {}) {
    if (!board) return 0;
    return occupants(board, cellsInRadius(this, 1, false), this.owner, 'ally', ['OBJECT', 'ANCHOR']).length ? 5 : 0;
  }

  getSkillTargets(slot, { board }) {
    if (slot === 'ULT') return [{ r: this.r, c: this.c }];
    return cellsInRadius(this, this.skills.A.range).filter(pos => isEmptyAt(board, pos));
  }

  executeSkill(slot, target, { board, spawnUnit, playPassivePopupFX }) {
    if (slot === 'A') {
      spawnUnit('BARRICADE', this.owner, target.r, target.c);
      return;
    }
    const { shieldVal, shieldTurns } = this.skills.ULT;
    const { targets, shieldTargets } = getSkillImpact(this, slot, target, board);
    for (const ally of shieldTargets) {
      ally.applyBuff('shield', shieldVal, shieldTurns);
      playPassivePopupFX(ally, { label: `SHIELD +${shieldVal}` });
    }
    for (const enemy of targets) {
      for (const key of ['bind', 'disarm', 'silence']) enemy.applyDebuff(key, 1);
      playPassivePopupFX(enemy, { label: '行動・攻撃・スキル阻害', kind: 'debuff' });
    }
  }
}

// ==========================================
// 2. ヴァルカン (Vulcan / VULCAN)
// ==========================================
export class VulcanUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.VULCAN;
    super({
      typeKey: 'VULCAN',
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

  // パッシブ『クロスファイア・リンク』: タレットのストック保持時にATK +8
  getPassiveAtk() {
    return this.stockA > 0 ? 8 : 0;
  }

  // ターン開始時: 自身のタレットがスキルストックにも盤面にも存在しない時、ストックを1回復する
  onTurnStart(board, { playPassivePopupFX } = {}) {
    if (this.stockA > 0) return;
    const hasOwnTurret = board.some(row => row.some(piece =>
      piece?.typeKey === 'TURRET' &&
      piece.owner === this.owner &&
      piece.hp > 0 &&
      (!piece.summonerId || piece.summonerId === this.id)
    ));
    if (hasOwnTurret) return;
    const maxStock = this.skills?.A?.maxStock || HERO_TYPES.VULCAN?.skills?.A?.maxStock || 1;
    this.stockA = Math.min(maxStock, (this.stockA || 0) + 1);
    playPassivePopupFX?.(this, { label: '再装填 & ATK+8', kind: 'buff' });
  }

  getSkillTargets(slot, { board }) {
    if (slot === 'ULT') {
      return boardCells().filter(({ r, c }) => {
        const turret = board[r][c];
        return turret?.typeKey === 'TURRET' && turret.owner === this.owner && turret.hp > 0;
      });
    }
    return cellsInRadius(this, this.skills.A.range).filter(pos => isEmptyAt(board, pos));
  }

  executeSkill(slot, target, { board, spawnUnit, hit }) {
    if (slot === 'A') {
      spawnUnit('TURRET', this.owner, target.r, target.c).summonerId = this.id;
      return;
    }
    for (const enemy of getSkillImpact(this, slot, target, board).targets) {
      hit(this, enemy, this.skills.ULT.damage);
    }
  }
}

// ==========================================
// 3. スモッグ (Toxin / POISON)
// ==========================================
export class SmogUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.SMOG || HERO_TYPES.POISON;
    super({
      typeKey: 'SMOG',
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

  getPassiveAtk({ poisonZones = [] } = {}) {
    return poisonZones.some(zone => zone.owner === this.owner && zone.r === this.r && zone.c === this.c) ? 5 : 0;
  }

  onTurnStart(board, { poisonZones, playPassivePopupFX }) {
    if (!this.getPassiveAtk({ poisonZones })) return;
    this.applyBuff('shield', 10, 1);
    playPassivePopupFX?.(this, { label: 'SHIELD +10' });
  }

  getSkillTargets(slot) {
    return slot === 'A' ? cellsInRadius(this, this.skills.A.range) : [{ r: this.r, c: this.c }];
  }

  executeSkill(slot, target, { board, placePoisonZone, hit }) {
    const { cells, targets } = getSkillImpact(this, slot, target, board);
    for (const { r, c } of cells) placePoisonZone(r, c, this.owner, this.id);
    if (slot === 'ULT') {
      for (const enemy of targets) hit(this, enemy, 10);
    }
  }
}
