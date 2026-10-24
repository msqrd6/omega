/* ==============================================================
   Structures.js: 設置物 (Object) クラス群 (防壁・自動タレット)
   ============================================================== */
import { BoardEntity } from './BoardEntity.js?v=20261024_11';
import { inBounds } from '../config.js?v=20261024_11';

// 1. 防壁 (バリケード)
export class BarricadeEntity extends BoardEntity {
  constructor(owner, r, c) {
    super({
      typeKey: 'BARRICADE',
      name: '防壁',
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

// 2. 自動タレット
export class TurretEntity extends BoardEntity {
  constructor(owner, r, c) {
    super({
      typeKey: 'TURRET',
      name: '自動タレット',
      icon: '🗼',
      owner,
      hp: 20,
      maxHp: 20,
      r,
      c,
      classType: 'OBJECT'
    });
    this.atk = 10;
  }

  // ターン終了時の自動迎撃射撃（周囲8マスの敵ユニットに10 DMG）
  triggerTurnEndAttack({ board, dealDamage, showDamagePopup, addLog, checkDeath, onGameOver }) {
    const enemyOwner = (this.owner === 'P1') ? 'P2' : 'P1';
    const hitEnemies = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const fr = this.r + dr, fc = this.c + dc;
        if (inBounds(fr, fc)) {
          const target = board[fr][fc];
          if (target && target.owner === enemyOwner && target.isUnit()) {
            hitEnemies.push({ r: fr, c: fc, unit: target });
          }
        }
      }
    }

    hitEnemies.forEach(({ r: er, c: ec, unit: eu }) => {
      dealDamage(this, eu, this.atk, { r: er, c: ec }, false);
      showDamagePopup(er, ec, `🗼迎撃! -${this.atk}`, '#f43f5e');
      addLog(`🗼 自動防衛タレットが周囲迎撃ゾーンの敵ユニット ${eu.name} に自動迎撃！(${this.atk} DMG)`, 'skill');
      checkDeath(er, ec, this.owner, onGameOver);
    });
  }
}
