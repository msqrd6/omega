/* ==============================================================
   DisruptorUnits.js: ディスラプター (Disruptor) ロール ユニットクラス群
   (グリッチ, サイファー, ハイヴ)
   ============================================================== */
import { UnitEntity } from './UnitEntity.js?v=urban-v1';
import { HERO_TYPES, inBounds, ROWS, COLS } from '../config.js?v=urban-v1';

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

  getSkillTargets(slot, context = {}) {
    const { board } = context;
    if (slot === 'A') {
      const targets = [];
      for (let ar = 0; ar < ROWS; ar++) {
        for (let ac = 0; ac < COLS; ac++) {
          const ally = board[ar][ac];
          if (ally && ally.owner === this.owner && ally.isUnit() && ally.isAssault() && ally.typeKey !== 'BIT') {
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = ar + dr, nc = ac + dc;
                if (inBounds(nr, nc) && !board[nr][nc]) {
                  if (!targets.some(t => t.r === nr && t.c === nc)) {
                    targets.push({ r: nr, c: nc });
                  }
                }
              }
            }
          }
        }
      }
      return targets;
    } else if (slot === 'ULT') {
      const targets = [];
      for (let tr = 0; tr < ROWS; tr++) {
        for (let tc = 0; tc < COLS; tc++) {
          if (!board[tr][tc]) targets.push({ r: tr, c: tc });
        }
      }
      return targets;
    }
    return [];
  }

  executeSkill(slot, targetPos, context = {}) {
    const { board, showDamagePopup, addLog, playPassivePopupFX } = context;
    const enemyOwner = (this.owner === 'P1') ? 'P2' : 'P1';

    board[targetPos.r][targetPos.c] = this;
    board[this.r][this.c] = null;
    this.setPosition(targetPos.r, targetPos.c);

    if (slot === 'A') {
      showDamagePopup(targetPos.r, targetPos.c, `ワープ瞬動!`, '#a855f7');
      addLog(`🌀 ${this.name} が『グラビティ・ワープ』発動！味方アサルトの隣接マスへ空間跳躍！`, 'skill');
    } else if (slot === 'ULT') {
      showDamagePopup(targetPos.r, targetPos.c, `緊急回避!`, '#c084fc');
      addLog(`✨ ${this.name} がウルト『緊急回避』発動！任意の空きマスへ完全脱出！`, 'skill');
    }

    // パッシブ『ディメンション・チャージ』: ワープ着地時、半径1マスの敵ユニットに弱体化付与
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = targetPos.r + dr, nc = targetPos.c + dc;
        if (inBounds(nr, nc)) {
          const u = board[nr][nc];
          if (u && u.owner === enemyOwner && u.isUnit()) {
            u.applyDebuff('vulnerable', 1);
            showDamagePopup(nr, nc, `🎯弱体化(このターン)!`, '#ea580c');
            if (playPassivePopupFX) {
              playPassivePopupFX({ r: nr, c: nc }, {
                label: '弱体化 x1.5!',
                kind: 'debuff',
                color: '#ea580c',
                color2: '#ffd447',
                delayMs: 160
              });
            }
            count++;
          }
        }
      }
    }
    if (count > 0) {
      addLog(`🌀⚡ グリッチのパッシブ『ディメンション・チャージ』発動！ワープ着地点周囲の敵 ${count} 体に【弱体化 (このターン中 / 被ダメ1.5倍)】を付与！`, 'skill');
    }
  }
}

// ==========================================
// 2. サイファー (Cypher / CYPHER)
// ==========================================
export class CypherUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.CYPHER;
    super({
      typeKey: 'CYPHER',
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

  // パッシブ『ホライゾン・シフト』: 周囲8マス移動に加え、左右横一直線に無制限スライド移動
  getValidMoves(context = {}) {
    const moves = super.getValidMoves(context);
    if (this.hasDebuff('bind')) return [];
    const { board, hasActionToken } = context;
    if (hasActionToken && !hasActionToken(this.owner, 'move', 1, this)) return [];

    // 左方向
    for (let nc = this.c - 1; nc >= 0; nc--) {
      if (board[this.r][nc]) break;
      if (!moves.some(m => m.r === this.r && m.c === nc)) moves.push({ r: this.r, c: nc });
    }
    // 右方向
    for (let nc = this.c + 1; nc < COLS; nc++) {
      if (board[this.r][nc]) break;
      if (!moves.some(m => m.r === this.r && m.c === nc)) moves.push({ r: this.r, c: nc });
    }
    return moves;
  }

  getSkillTargets(slot, context = {}) {
    const { board } = context;
    if (slot === 'A') {
      const targets = [];
      const forwardDir = (this.owner === 'P1') ? -1 : 1;
      let step = 1;
      while (true) {
        const nr = this.r + forwardDir * step;
        const nc = this.c;
        if (!inBounds(nr, nc)) break;
        const targetUnit = board[nr][nc];
        if (targetUnit) {
          if (targetUnit.isUnit()) {
            targets.push({ r: nr, c: nc });
          }
          break;
        }
        step++;
      }
      return targets;
    } else if (slot === 'ULT') {
      return [{ r: this.r, c: this.c }];
    }
    return [];
  }

  executeSkill(slot, targetPos, context = {}) {
    const { board, showDamagePopup, addLog } = context;
    const enemyOwner = (this.owner === 'P1') ? 'P2' : 'P1';

    if (slot === 'A') {
      const target = board[targetPos.r][targetPos.c];
      if (target && target.isUnit()) {
        if (target.owner === this.owner) {
          target.applyBuff('atk_up', 15, 1);
          showDamagePopup(targetPos.r, targetPos.c, `🔥ATK+15(このターン)!`, '#ff6600');
          addLog(`🔇⚡ ${this.name} の『シグナル・ジャミング』が味方 ${target.name} に命中！【攻撃力増強 (+15 / このターン中)】を付与！`, 'skill');
        } else {
          target.applyDebuff('disarm', 1);
          showDamagePopup(targetPos.r, targetPos.c, `💢攻撃阻害(1T)!`, '#f59e0b');
          addLog(`🔇⚡ ${this.name} の『シグナル・ジャミング』が敵 ${target.name} に命中！【攻撃阻害 (1T)】を付与して次ターンの通常攻撃を完全封殺！`, 'skill');
        }
      }
    } else if (slot === 'ULT') {
      showDamagePopup(this.r, this.c, `全軍ブラックアウト!!`, '#334155');
      let affectedCount = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const t = board[r][c];
          if (t && t.owner === enemyOwner && t.isUnit()) {
            t.applyDebuff('bind', 1);
            t.applyDebuff('disarm', 1);
            showDamagePopup(r, c, `⛓️拘束&💢攻撃停止!`, '#f59e0b');
            affectedCount++;
          }
        }
      }
      addLog(`🔇🌌 ${this.name} がウルト『フルスペクトラム・ブラックアウト』発動！敵 ${affectedCount} 体に【行動阻害(1T)】および【攻撃阻害(1T)】を一斉付与！次ターンの行動を完全封殺！`, 'skill');
    }
  }
}

// ==========================================
// 3. ハイヴ (Hive / HIVE)
// ==========================================
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

  getSkillTargets(slot, context = {}) {
    const { board } = context;
    if (slot === 'A') {
      const targets = [];
      for (let ar = 0; ar < ROWS; ar++) {
        for (let ac = 0; ac < COLS; ac++) {
          const ally = board[ar][ac];
          if (ally && ally.owner === this.owner && ally.isUnit() && ally.isAssault()) {
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = ar + dr, nc = ac + dc;
                if (inBounds(nr, nc) && !board[nr][nc]) {
                  if (!targets.some(t => t.r === nr && t.c === nc)) {
                    targets.push({ r: nr, c: nc });
                  }
                }
              }
            }
          }
        }
      }
      // 自軍アサルトが盤面に存在しない場合のフォールバック（ハイヴ自身の周囲8マス）
      if (targets.length === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = this.r + dr, nc = this.c + dc;
            if (inBounds(nr, nc) && !board[nr][nc]) {
              targets.push({ r: nr, c: nc });
            }
          }
        }
      }
      return targets;
    } else if (slot === 'ULT') {
      return [{ r: this.r, c: this.c }];
    }
    return [];
  }

  executeSkill(slot, targetPos, context = {}) {
    const { spawnUnit, addSpecialActionToken, showDamagePopup, addLog, board } = context;

    if (slot === 'A') {
      const bit = spawnUnit('BIT', this.owner, targetPos.r, targetPos.c);
      if (bit) {
        showDamagePopup(targetPos.r, targetPos.c, `🛰️ビット召喚!`, '#00d2ff');
        addSpecialActionToken(this.owner, {
          id: `${this.owner}_atk_bit_${bit.id}`,
          type: 'attack',
          name: '攻撃',
          badgeText: '攻撃',
          scope: bit.id,
          unitType: 'BIT',
          unitName: 'ビット',
          used: false,
          desc: 'ビットのパッシブ『自律アサルト・ドライブ』による専用攻撃トークン。'
        });
        addLog(`🛸✨ ${this.name} が通常スキル『ビット・デプロイ』発動！指定マスに自律戦闘子機『ビット』を召喚！専用攻撃トークンで即時自律攻撃可能！`, 'skill');
      }
    } else if (slot === 'ULT') {
      let bitCount = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const u = board[r][c];
          if (u && u.owner === this.owner && u.typeKey === 'BIT') {
            u.applyBuff('shield', 30, 2);
            u.applyBuff('atk_up', 10, 2);
            showDamagePopup(r, c, `🛡️+30 ⚔️+10!`, '#38bdf8');
            bitCount++;
          }
        }
      }
      addLog(`🛸🌟 ${this.name} がアルティメット『スウォーム・オーバードライブ』発動！全ビット (${bitCount}体) に【シールド (+30/2T)】および【攻撃力増強 (+10/2T)】を一斉付与！`, 'skill');
    }
  }

  isPassiveActive(context = {}) {
    const board = context.board;
    if (!board) return false;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const u = board[r][c];
        if (u && u.owner === this.owner && u.typeKey === 'BIT') return true;
      }
    }
    return false;
  }

  getPassiveStatusText(context = {}) {
    return this.isPassiveActive(context) ? '✨ 監視中' : 'ビット未展開';
  }
}
