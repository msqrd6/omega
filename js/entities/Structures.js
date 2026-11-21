/* ==============================================================
   Structures.js: 設置物 (Object) クラス群 (防壁・自動タレット)
   ============================================================== */
import { BoardEntity } from './BoardEntity.js?v=urban-v1';
import { inBounds } from '../config.js?v=urban-v1';

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
  triggerTurnEndAttack({
    board,
    dealDamage,
    showDamagePopup,
    addLog,
    checkDeath,
    onGameOver,
    playCombatPopupFX,
    playPassivePopupFX,
    playBeamFX
  }) {
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

    if (hitEnemies.length > 0 && playPassivePopupFX) {
      playPassivePopupFX({ r: this.r, c: this.c }, {
        label: '自動迎撃!',
        kind: 'turret',
        color: '#ff5a26',
        color2: '#ffd447'
      });
    }

    hitEnemies.forEach(({ r: er, c: ec, unit: eu }) => {
      const dealt = dealDamage(this, eu, this.atk, { r: er, c: ec }, false);
      showDamagePopup(er, ec, `🗼迎撃! -${this.atk}`, '#f43f5e');
      if (playBeamFX) {
        playBeamFX({ r: this.r, c: this.c }, { r: er, c: ec }, {
          kind: 'attack',
          color: '#ff5a26',
          color2: '#ffd447'
        });
      }
      if (playCombatPopupFX) {
        playCombatPopupFX('dmg', { r: er, c: ec }, dealt, { r: this.r, c: this.c }, undefined, {
          skipLunge: true,
          delayMs: 90,
          label: dealt > 0 ? `-${dealt} DMG` : null
        });
      }
      addLog(`🗼 自動防衛タレットが周囲迎撃ゾーンの敵ユニット ${eu.name} に自動迎撃！(${this.atk} DMG)`, 'skill');
      checkDeath(er, ec, this.owner, onGameOver);
    });
  }
}
