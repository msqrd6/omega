/* ==============================================================
   CoreEntity.js: 防衛コア (Core) クラス
   ============================================================== */
import { BoardEntity } from './BoardEntity.js?v=20261024_11';

export class CoreEntity extends BoardEntity {
  constructor(owner, r, c) {
    super({
      typeKey: 'CORE',
      name: '防衛コア',
      icon: '💎',
      owner,
      hp: 100,
      maxHp: 100,
      r,
      c,
      classType: 'CORE'
    });
    this.atk = 0;
  }
}
