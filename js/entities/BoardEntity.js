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
    classType = 'UNIT' // 'UNIT' | 'ANCHOR' | 'OBJECT'
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
    this.buffs = [];
    this.debuffs = [];
  }

  isUnit() {
    return this.classType === 'UNIT';
  }

  isAnchor() {
    return this.classType === 'ANCHOR';
  }

  isObject() {
    return this.classType === 'OBJECT';
  }

  setPosition(r, c) {
    this.r = r;
    this.c = c;
  }

  getShieldVal() {
    return this.buffs.reduce((total, buff) => total + (buff.key === 'shield' ? buff.val : 0), 0);
  }

  hasBuff(key) {
    return this.buffs.some(buff => buff.key === key);
  }

  hasDebuff(key) {
    return this.debuffs.some(debuff => debuff.key === key);
  }

  applyBuff(key, val, turns = 0) {
    if (this.isUnit() || key === 'shield') this.buffs.push({ key, val, turns });
  }

  applyDebuff(key, turns = 0) {
    if (this.isUnit()) this.debuffs.push({ key, turns });
  }

  clearAllDebuffs() {
    this.debuffs = [];
  }

  absorbDamage(damage) {
    // Stable sort keeps application order when two shields expire together.
    const shields = this.buffs.filter(buff => buff.key === 'shield').sort((a, b) => a.turns - b.turns);
    for (const shield of shields) {
      if (damage === 0) break;
      const absorbed = Math.min(shield.val, damage);
      shield.val -= absorbed;
      damage -= absorbed;
    }
    this.buffs = this.buffs.filter(buff => buff.val > 0);
    return damage;
  }

  expireEffects() {
    // A value of zero keeps an effect active through the current hand.
    this.buffs = this.buffs.filter(buff => --buff.turns >= 0);
    this.debuffs = this.debuffs.filter(debuff => --debuff.turns >= 0);
  }
}
