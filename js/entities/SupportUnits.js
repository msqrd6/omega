/* ==============================================================
   SupportUnits.js: サポート (Support) ロール ユニットクラス群
   (アイリス, ネクサス, オーラ)
   ============================================================== */
import { UnitEntity } from './UnitEntity.js?v=20261024_11';
import { HERO_TYPES, inBounds, ROWS, COLS } from '../config.js?v=20261024_11';

// ==========================================
// 1. アイリス (Iris / MEDIC)
// ==========================================
export class IrisUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.IRIS || HERO_TYPES.MEDIC;
    super({
      typeKey: 'IRIS',
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
      for (let dr = -3; dr <= 3; dr++) {
        for (let dc = -3; dc <= 3; dc++) {
          const nr = this.r + dr, nc = this.c + dc;
          if (inBounds(nr, nc)) {
            const t = board[nr][nc];
            if (t && t.owner === this.owner && t.isUnit()) {
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
    const { board, showDamagePopup, addLog } = context;

    if (slot === 'A') {
      const target = board[targetPos.r][targetPos.c];
      if (target && target.isUnit()) {
        const oldHp = target.hp;
        target.hp = Math.min(target.maxHp, target.hp + 30);
        const healed = target.hp - oldHp;
        showDamagePopup(targetPos.r, targetPos.c, `+${healed} HP`, '#00ffaa');
        addLog(`💉 ${this.name} が『ライフ・リペア』発動！${target.name} のHPを ${healed} 回復！`, 'skill');
      }
    } else if (slot === 'ULT') {
      showDamagePopup(this.r, this.c, `オーバーチャージ!!`, '#00d2ff');
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const u = board[r][c];
          if (u && u.owner === this.owner && !u.isObject()) {
            u.applyBuff('shield', 15, 2);
            showDamagePopup(r, c, `+15🛡️(2T)`, '#00d2ff');
          }
        }
      }
      addLog(`🌟 ${this.name} がウルト『オーバーチャージ・オーラ』発動！自軍全ユニットおよび防衛コアに【シールド増強(+15/2T)】を一斉展開！`, 'skill');
    }
  }

  // パッシブ『ナノ・エンハンスメント』: 前方一直線上の最も近い負傷した味方を5回復
  onTurnEnd(context = {}) {
    const { board, showDamagePopup, addLog } = context;
    const forwardDir = (this.owner === 'P1') ? -1 : 1;
    let closestAlly = null;
    let step = 1;

    while (true) {
      const nr = this.r + forwardDir * step;
      const nc = this.c;
      if (!inBounds(nr, nc)) break;
      const piece = board[nr][nc];
      if (piece) {
        if (piece.owner !== this.owner || piece.isCore() || piece.isObject()) {
          break;
        }
        if (piece.isUnit() && piece.owner === this.owner && piece.hp < piece.maxHp) {
          closestAlly = { r: nr, c: nc, unit: piece };
          break;
        }
      }
      step++;
    }

    if (closestAlly) {
      const oldHp = closestAlly.unit.hp;
      closestAlly.unit.hp = Math.min(closestAlly.unit.maxHp, closestAlly.unit.hp + 5);
      const healed = closestAlly.unit.hp - oldHp;
      showDamagePopup(closestAlly.r, closestAlly.c, `💉ナノ回復 +${healed}`, '#00ffaa');
      addLog(`💉✨ アイリスのパッシブ『ナノ・エンハンスメント』発動！上一直線上の味方 ${closestAlly.unit.name} を ${healed} HP自動回復！(現在HP: ${closestAlly.unit.hp}/${closestAlly.unit.maxHp})`, 'skill');
    }
  }
}

// ==========================================
// 2. ネクサス (Nexus / HACKER)
// ==========================================
export class NexusUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.NEXUS || HERO_TYPES.HACKER;
    super({
      typeKey: 'NEXUS',
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
      for (let tr = 0; tr < ROWS; tr++) {
        for (let tc = 0; tc < COLS; tc++) {
          const t = board[tr][tc];
          if (t && t.owner === this.owner && t.isUnit()) {
            targets.push({ r: tr, c: tc });
          }
        }
      }
      return targets;
    } else if (slot === 'ULT') {
      const targets = [];
      for (let tr = 0; tr < ROWS; tr++) {
        for (let tc = 0; tc < COLS; tc++) {
          targets.push({ r: tr, c: tc });
        }
      }
      return targets;
    }
    return [];
  }

  executeSkill(slot, targetPos, context = {}) {
    const { board, traps, phantomZones, poisonZones, showDamagePopup, addLog } = context;
    const enemyOwner = (this.owner === 'P1') ? 'P2' : 'P1';

    if (slot === 'A') {
      const target = board[targetPos.r][targetPos.c];
      if (target && target.owner === this.owner && target.isUnit()) {
        const oldHp = target.hp;
        target.hp = Math.min(target.maxHp, target.hp + 15);
        const healed = target.hp - oldHp;
        target.clearAllDebuffs();
        showDamagePopup(targetPos.r, targetPos.c, `+${healed} HP & 状態異常回復!`, '#10b981');
        addLog(`💻💚 ${this.name} が『リモート・ハック』発動！味方 ${target.name} のHPを ${healed} 回復し、すべての異常状態（デバフ）を完全回復！`, 'skill');
      }
    } else if (slot === 'ULT') {
      showDamagePopup(targetPos.r, targetPos.c, `⚡EMP PULSE!!⚡`, '#38bdf8');
      let destroyedCount = 0;

      // 1. 半径2マスの敵オブジェクト破壊
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = targetPos.r + dr, nc = targetPos.c + dc;
          if (inBounds(nr, nc)) {
            const u = board[nr][nc];
            if (u && u.owner === enemyOwner && u.isObject()) {
              showDamagePopup(nr, nc, `💥EMP破壊!`, '#38bdf8');
              board[nr][nc] = null;
              destroyedCount++;
            }
          }
        }
      }

      // 2. 半径2マスの敵トラップ消去
      for (let i = traps.length - 1; i >= 0; i--) {
        const tp = traps[i];
        if (tp.owner === enemyOwner && Math.abs(tp.r - targetPos.r) <= 2 && Math.abs(tp.c - targetPos.c) <= 2) {
          showDamagePopup(tp.r, tp.c, `🪤トラップ無効化!`, '#38bdf8');
          traps.splice(i, 1);
          destroyedCount++;
        }
      }

      // 3. 半径2マスの敵ハザード消去
      for (let i = phantomZones.length - 1; i >= 0; i--) {
        const z = phantomZones[i];
        if (z.owner === enemyOwner && Math.abs(z.r - targetPos.r) <= 2 && Math.abs(z.c - targetPos.c) <= 2) {
          showDamagePopup(z.r, z.c, `👻ハザード消滅!`, '#38bdf8');
          phantomZones.splice(i, 1);
          destroyedCount++;
        }
      }
      for (let i = poisonZones.length - 1; i >= 0; i--) {
        const z = poisonZones[i];
        if (z.owner === enemyOwner && Math.abs(z.r - targetPos.r) <= 2 && Math.abs(z.c - targetPos.c) <= 2) {
          showDamagePopup(z.r, z.c, `🧪ハザード消滅!`, '#38bdf8');
          poisonZones.splice(i, 1);
          destroyedCount++;
        }
      }

      // 4. 半径2マス以内の味方ユニットのHPを10回復
      let healedAlliesCount = 0;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = targetPos.r + dr, nc = targetPos.c + dc;
          if (inBounds(nr, nc)) {
            const u = board[nr][nc];
            if (u && u.owner === this.owner && u.isUnit()) {
              const oldHp = u.hp;
              u.hp = Math.min(u.maxHp, u.hp + 10);
              const healed = u.hp - oldHp;
              showDamagePopup(nr, nc, `+${healed} HP!`, '#10b981');
              healedAlliesCount++;
            }
          }
        }
      }

      addLog(`💻⚡💥 ${this.name} がアルティメット『EMP』発動！指定地点から半径2マスの敵設置物・トラップ・ハザード ${destroyedCount} 件を完全消滅させ、味方 ${healedAlliesCount} 体のHPを 10 回復！`, 'skill');
    }
  }

  // パッシブ『システム・オーバーライド』: 毎ターン終了時、ウルトゲージを直接 +10 チャージ
  onTurnEnd(context = {}) {
    const { addTeamUltDamage, addLog } = context;
    if (addTeamUltDamage) {
      addTeamUltDamage(this.owner, 10);
      addLog(`💻⚡ ネクサスのパッシブ『システム・オーバーライド』発動！チームウルトゲージが直接 +10 チャージされた！`, 'skill');
    }
  }
}

// ==========================================
// 3. オーラ (Aura / AURA)
// ==========================================
export class AuraUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.AURA;
    super({
      typeKey: 'AURA',
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
      return [{ r: this.r, c: this.c }];
    } else if (slot === 'ULT') {
      const targets = [];
      for (let ar = 0; ar < ROWS; ar++) {
        for (let ac = 0; ac < COLS; ac++) {
          const ally = board[ar][ac];
          if (ally && ally.owner === this.owner && (ar !== this.r || ac !== this.c) && ally.isUnit()) {
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
    }
    return [];
  }

  executeSkill(slot, targetPos, context = {}) {
    const { board, showDamagePopup, addLog } = context;

    const healAlliesAround = (centerPos) => {
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = centerPos.r + dr, nc = centerPos.c + dc;
          if (inBounds(nr, nc)) {
            const u = board[nr][nc];
            if (u && u.owner === this.owner && u.isUnit()) {
              const oldHp = u.hp;
              u.hp = Math.min(u.maxHp, u.hp + 20);
              const healed = u.hp - oldHp;
              if (healed > 0) {
                showDamagePopup(nr, nc, `+${healed} HP!`, '#10b981');
              }
              count++;
            }
          }
        }
      }
      return count;
    };

    if (slot === 'A') {
      const healedCount = healAlliesAround(this);
      addLog(`💫✨ ${this.name} が通常スキル『サンクチュアリ』発動！周囲1マス範囲の味方 ${healedCount} 体のHPを 20 回復！`, 'skill');
    } else if (slot === 'ULT') {
      board[targetPos.r][targetPos.c] = this;
      board[this.r][this.c] = null;
      this.setPosition(targetPos.r, targetPos.c);
      showDamagePopup(targetPos.r, targetPos.c, `💫救援ワープ!`, '#e066ff');

      const healedCount = healAlliesAround(targetPos);
      addLog(`💫🌟 ${this.name} がアルティメット『レスキュー・ワープ』発動！味方の隣へ即時救援ワープし、着地点で『サンクチュアリ』を展開！周囲の味方 ${healedCount} 体のHPを 20 回復（ストック消費なし）！`, 'skill');
    }
  }

  // パッシブ『バイタル・オーラ』: ターン終了時、周囲1マス範囲の一番HPが少ない味方ユニットを5回復
  onTurnEnd(context = {}) {
    const { board, showDamagePopup, addLog } = context;
    let lowestAlly = null;
    let lowestHp = Infinity;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = this.r + dr, nc = this.c + dc;
        if (inBounds(nr, nc)) {
          const ally = board[nr][nc];
          if (ally && ally.owner === this.owner && ally.isUnit() && ally.hp < ally.maxHp) {
            if (ally.hp < lowestHp) {
              lowestHp = ally.hp;
              lowestAlly = { r: nr, c: nc, unit: ally };
            }
          }
        }
      }
    }

    if (lowestAlly) {
      const oldHp = lowestAlly.unit.hp;
      lowestAlly.unit.hp = Math.min(lowestAlly.unit.maxHp, lowestAlly.unit.hp + 5);
      const healed = lowestAlly.unit.hp - oldHp;
      showDamagePopup(lowestAlly.r, lowestAlly.c, `💫オーラ回復 +${healed}`, '#e066ff');
      addLog(`💫✨ オーラのパッシブ『バイタル・オーラ』発動！周囲で最も負傷している ${lowestAlly.unit.name} を ${healed} HP自動回復！(現在HP: ${lowestAlly.unit.hp}/${lowestAlly.unit.maxHp})`, 'skill');
    }
  }
}
