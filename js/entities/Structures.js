/* ==============================================================
   Structures.js: 設置物 (Object) クラス群 (バリケード・タレット)
   ============================================================== */
import { BoardEntity } from './BoardEntity.js?v=lab-white-1';
import { HERO_TYPES } from '../config.js?v=lab-white-3';
import { cellsInRadius, occupants } from '../battle-targets.js';

// 1. バリケード
export class BarricadeEntity extends BoardEntity {
  constructor(owner, r, c) {
    super({
      typeKey: 'BARRICADE',
      name: HERO_TYPES.BARRICADE.name,
      icon: '🧱',
      owner,
      hp: 30,
      maxHp: 30,
      r,
      c,
      classType: 'OBJECT'
    });
    this.atk = 0;
  }
}

// 2. タレット
export class TurretEntity extends BoardEntity {
  constructor(owner, r, c) {
    const { name, icon, maxHp, atk } = HERO_TYPES.TURRET;
    super({
      typeKey: 'TURRET',
      name,
      icon,
      owner,
      hp: maxHp,
      maxHp,
      r,
      c,
      classType: 'OBJECT'
    });
    this.atk = atk;
  }

  // ターン終了時の自動迎撃射撃（周囲8マスの敵ユニットに10 DMG）
  triggerTurnEndAttack({ board, hit, playPassivePopupFX, playBeamFX, addLog }) {
    const targets = occupants(board, cellsInRadius(this, 1, false), this.owner, 'enemy', ['UNIT']);
    if (targets.length) playPassivePopupFX(this, { label: '自動迎撃', kind: 'turret' });
    for (const target of targets) {
      playBeamFX(this, target, { kind: 'attack', color: '#ff5a26' });
      const damage = hit(this, target, this.atk);
      addLog(`🗼 ${this.name}が ${target.name} を迎撃（${damage} DMG）。`, 'skill');
    }
  }
}
