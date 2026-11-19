/* ==============================================================
   BoardEntity.js: 盤面上に存在する全エンティティの基底抽象クラス
   (5大クラス体系: Unit / Core / Object の共通インターフェース)
   ============================================================== */

let nextEntityUniqueId = 1;

export class BoardEntity {
  constructor({
    typeKey,
    name,
    icon,
    owner,
    hp,
    maxHp,
    r,
    c,
    classType = 'UNIT' // 'UNIT' | 'CORE' | 'OBJECT'
  }) {
    this.id = `${owner}_${typeKey}_${nextEntityUniqueId++}`;
    this.typeKey = typeKey;
    this.name = name;
    this.icon = icon;
    this.owner = owner;
    this.hp = hp;
    this.maxHp = maxHp;
    this.r = r;
    this.c = c;
    this.classType = classType;

    // バフ（シールド等はコアやオブジェクトにも付与される場合がある）
    this.buffs = {
      atk_up: null,
      shield: null,
      shadow_drain: null
    };

    // デバフ（通常はユニットのみ有効）
    this.debuffs = {
      vulnerable: null,
      disarm: null,
      bind: null,
      silence: null
    };
  }

  isUnit() {
    return this.classType === 'UNIT';
  }

  isCore() {
    return this.classType === 'CORE';
  }

  isObject() {
    return this.classType === 'OBJECT';
  }

  setPosition(r, c) {
    this.r = r;
    this.c = c;
  }

  getShieldVal() {
    return (this.buffs && this.buffs.shield) ? this.buffs.shield.val : 0;
  }

  hasBuff(key) {
    return !!(this.buffs && this.buffs[key] && this.buffs[key].turns > 0);
  }

  hasDebuff(key) {
    return !!(this.debuffs && this.debuffs[key] && this.debuffs[key].turns > 0);
  }

  applyBuff(key, val, turns) {
    if (this.isCore() && key !== 'shield') return; // コアはシールドのみ付与可能
    if (!this.buffs) this.buffs = {};
    this.buffs[key] = { val, turns };
  }

  applyDebuff(key, turns) {
    if (!this.isUnit()) return; // デバフはユニットのみ有効（コア・オブジェクトは無効）
    if (!this.debuffs) this.debuffs = {};
    const cur = this.debuffs[key];
    const curTurns = cur ? cur.turns : 0;
    this.debuffs[key] = { turns: Math.max(curTurns, turns) };
  }

  clearAllDebuffs() {
    if (!this.debuffs) return;
    this.debuffs = {
      vulnerable: null,
      disarm: null,
      bind: null,
      silence: null
    };
  }
}
