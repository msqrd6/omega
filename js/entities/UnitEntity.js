/* ==============================================================
   UnitEntity.js: プレイアブル駒・召喚子機の共通基底ユニットクラス
   (Unit Class: 移動・攻撃・スキル・パッシブフックのインターフェース)
   ============================================================== */
import { BoardEntity } from './BoardEntity.js?v=lab-white-1';
import { inBounds, ULT_REQUIRED_DAMAGE } from '../config.js?v=lab-white-1';

export class UnitEntity extends BoardEntity {
  constructor({
    typeKey,
    name,
    icon,
    owner,
    hp,
    maxHp,
    atk,
    role,
    roleName,
    roleClass,
    desc,
    passive,
    skills,
    r,
    c
  }) {
    super({
      typeKey,
      name,
      icon,
      owner,
      hp,
      maxHp,
      r,
      c,
      classType: 'UNIT'
    });

    this.role = role;
    this.roleName = roleName;
    this.roleClass = roleClass;
    this.desc = desc;
    this.atk = atk;
    this.passive = passive || null;
    this.skills = skills || {};

    this.stockA = skills?.A?.maxStock || 0;
    this.turnDamageDealt = 0;
    this.ultUsed = false;
  }

  isAssault() {
    return this.role === 'ASSAULT';
  }

  // 実効攻撃力計算（基本ATK ＋ 攻撃力増強バフ ＋ 固有パッシブ）
  getEffectiveAtk(context = {}) {
    let total = this.atk;
    if (this.hasBuff('atk_up')) {
      total += this.buffs.atk_up.val;
    }
    return total;
  }

  // ウルト発動可能判定
  isUltReady(teamGauge) {
    if (this.ultUsed) return false;
    if (this.hasDebuff('silence')) return false;
    return (teamGauge || 0) >= ULT_REQUIRED_DAMAGE;
  }

  // 基本移動可能マス計算（周囲8マス空きマス）
  getValidMoves(context = {}) {
    if (this.hasDebuff('bind')) return [];
    const { board, hasActionOrder } = context;
    if (hasActionOrder && !hasActionOrder(this.owner, 'move', 1, this)) return [];

    const moves = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = this.r + dr, nc = this.c + dc;
        if (inBounds(nr, nc) && !board[nr][nc]) {
          moves.push({ r: nr, c: nc });
        }
      }
    }
    return moves;
  }

  // 基本攻撃可能ターゲットマス計算（周囲8マス敵ターゲット）
  getValidAttacks(context = {}) {
    if (this.atk === 0) return [];
    if (this.hasDebuff('disarm')) return [];
    const { board, hasActionOrder } = context;
    if (hasActionOrder && !hasActionOrder(this.owner, 'attack', 1, this)) return [];

    const enemyOwner = (this.owner === 'P1') ? 'P2' : 'P1';
    const attacks = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = this.r + dr, nc = this.c + dc;
        if (inBounds(nr, nc)) {
          const target = board[nr][nc];
          if (target && target.owner === enemyOwner) {
            attacks.push({ r: nr, c: nc });
          }
        }
      }
    }
    return attacks;
  }

  // スキル対象マス計算（各キャラクターのサブクラスでオーバーライド）
  getSkillTargets(slot, context = {}) {
    return [];
  }

  // スキル実行（各キャラクターのサブクラスでオーバーライド）
  executeSkill(slot, targetPos, context = {}) {
    // Subclass implementation
  }

  // ターン終了時パッシブフック（リリー・ネクサス・オーラ等）
  onTurnEnd(context = {}) {
    // Subclass implementation
  }

  // 被弾時パッシブフック（ブラスト等）
  onAttacked(attacker, attackerPos, context = {}) {
    // Subclass implementation
  }

  // 撃破時パッシブフック（ビット等）
  onDestroyed(killerUnit, context = {}) {
    // Subclass implementation
  }

  // パッシブの稼働状態（UIカード用表示）
  isPassiveActive(context = {}) {
    return true;
  }

  getPassiveStatusText(context = {}) {
    return '常時発動';
  }
}
