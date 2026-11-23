/* ==============================================================
   AnchorEntity.js: アンカー (Anchor) クラス
   ============================================================== */
import { BoardEntity } from './BoardEntity.js?v=lab-white-1';
import { HERO_TYPES } from '../config.js?v=lab-white-1';

export class AnchorEntity extends BoardEntity {
  constructor(owner, r, c) {
    super({
      typeKey: 'ANCHOR',
      name: HERO_TYPES.ANCHOR.name,
      icon: '💎',
      owner,
      hp: 100,
      maxHp: 100,
      r,
      c,
      classType: 'ANCHOR'
    });
    this.atk = 0;
  }
}
