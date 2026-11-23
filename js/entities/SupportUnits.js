/* ==============================================================
   SupportUnits.js: サポート (Support) ロール ユニットクラス群
   (リリー, ネクサス, オーラ)
   ============================================================== */
import { BeamUnit } from './BeamUnit.js?v=lab-white-1';
import { UnitEntity } from './UnitEntity.js?v=lab-white-1';
import { HERO_TYPES, inBounds, ROWS, COLS } from '../config.js?v=lab-white-1';

// ==========================================
// 1. リリー (Iris / MEDIC)
// ==========================================
export class LilyUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.LILY || HERO_TYPES.MEDIC;
    super({
      typeKey: 'LILY',
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
    const { board, addLog, addTeamUltDamage, playCombatPopupFX } = context;

    if (slot === 'A') {
      const target = board[targetPos.r][targetPos.c];
      if (target && target.isUnit()) {
        const oldHp = target.hp;
        target.hp = Math.min(target.maxHp, target.hp + 30);
        const healed = target.hp - oldHp;
        if (healed > 0) playCombatPopupFX('heal', targetPos, healed, this);
        addLog(`💉 ${this.name} が『ライフ・リペア』発動！${target.name} のHPを ${healed} 回復！`, 'skill');
      }
    } else if (slot === 'ULT') {
      const { heal, ultCharge } = this.skills.ULT;
      let totalHealed = 0;
      for (const ally of board.flat()) {
        if (ally?.owner !== this.owner || !ally.isUnit()) continue;
        const healed = Math.min(heal, ally.maxHp - ally.hp);
        ally.hp += healed;
        totalHealed += healed;
      }
      addTeamUltDamage(this.owner, ultCharge);
      addLog(`💉 味方ユニットのHPを合計 ${totalHealed} 回復。チームウルトゲージ +${ultCharge}`, 'skill');
    }
  }

  // パッシブ『ナノ・エンハンスメント』: 前方一直線上の最も近い負傷した味方を5回復
  onTurnEnd(context = {}) {
    const {
      board,

      addLog,
      playCombatPopupFX,
      playPassivePopupFX,
      playBeamFX
    } = context;
    const forwardDir = (this.owner === 'P1') ? -1 : 1;
    let closestAlly = null;
    let step = 1;

    while (true) {
      const nr = this.r + forwardDir * step;
      const nc = this.c;
      if (!inBounds(nr, nc)) break;
      const piece = board[nr][nc];
      if (piece) {
        if (piece.owner !== this.owner || piece.isAnchor() || piece.isObject()) {
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
      if (healed > 0) {
        if (playPassivePopupFX) {
          playPassivePopupFX({ r: this.r, c: this.c }, {
            label: 'ナノ回復',
            kind: 'heal',
            color: '#2ee59d',
            color2: '#b9ffe4'
          });
        }
        if (playBeamFX) {
          playBeamFX({ r: this.r, c: this.c }, { r: closestAlly.r, c: closestAlly.c }, {
            kind: 'heal',
            color: '#2ee59d',
            color2: '#b9ffe4'
          });
        }
        if (playCombatPopupFX) {
          playCombatPopupFX('heal', { r: closestAlly.r, c: closestAlly.c }, healed, { r: this.r, c: this.c }, undefined, {
            skipLunge: true,
            delayMs: 110
          });
        }
      }
      addLog(`💉✨ リリーのパッシブ『ナノ・エンハンスメント』発動！上一直線上の味方 ${closestAlly.unit.name} を ${healed} HP自動回復！(現在HP: ${closestAlly.unit.hp}/${closestAlly.unit.maxHp})`, 'skill');
    }
  }
}

// ==========================================
// 2. ネクサス (Nexus / HACKER)
// ==========================================
export class NexusUnit extends BeamUnit {
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

  mark = 'link';
  directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  getMarkedTargets(board, slot) {
    return this.getMarkedPieces(board).filter(piece =>
      piece.owner === this.owner && (slot === 'ULT' || !piece.isObject()));
  }

  executeSkill(slot, targetPos, { board, playBeamFX, playPassivePopupFX, playMarkPulseFX }) {
    const ult = slot === 'ULT';
    const shield = ult ? 25 : 10;
    const casterPos = { r: this.r, c: this.c };
    for (const ally of this.getMarkedTargets(board, slot)) {
      const allyPos = { r: ally.r, c: ally.c };
      ally.applyBuff('shield', shield, 2);
      if (ult && ally.isUnit()) {
        ally.clearAllDebuffs();
        ally.applyBuff('atk_up', 5, 2);
      }
      if (ult) {
        playMarkPulseFX?.(allyPos, '#38bdf8', 860);
        playBeamFX?.(casterPos, allyPos, { kind: 'heal', color: '#38bdf8', color2: '#38f6b4', delayMs: 860 });
      } else {
        playMarkPulseFX?.(allyPos, '#38bdf8');
        playBeamFX?.(casterPos, allyPos, { kind: 'heal', color: '#38bdf8', color2: '#b7f5ff' });
        playPassivePopupFX?.(allyPos, {
          label: `+${shield} SHIELD`,
          kind: 'ult',
          color: '#38bdf8',
          color2: '#b7f5ff',
          delayMs: 80
        });
      }
    }
  }
}

export class HaloUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.HALO;
    super({
      typeKey: 'HALO',
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
    const { board, addLog, playCombatPopupFX } = context;

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
              if (healed > 0 && slot === 'A') {
                playCombatPopupFX('heal', { r: nr, c: nc }, healed, this);
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
      if (!context.warpUnit(this, targetPos)) return;

      const healedCount = healAlliesAround(targetPos);
      addLog(`💫🌟 ${this.name} がアルティメット『レスキュー・ワープ』発動！味方の隣へ即時救援ワープし、着地点で『サンクチュアリ』を展開！周囲の味方 ${healedCount} 体のHPを 20 回復（ストック消費なし）！`, 'skill');
    }
  }

  // パッシブ『バイタル・オーラ』: ターン終了時、周囲1マス範囲の一番HPが少ない味方ユニットを5回復
  onTurnEnd(context = {}) {
    const {
      board,

      addLog,
      playCombatPopupFX,
      playPassivePopupFX,
      playBeamFX
    } = context;
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
      if (healed > 0) {
        const isSelf = (lowestAlly.r === this.r && lowestAlly.c === this.c);
        if (playPassivePopupFX) {
          playPassivePopupFX({ r: this.r, c: this.c }, {
            label: isSelf ? '' : 'バイタル・オーラ',
            kind: 'heal',
            color: '#e066ff',
            color2: '#a6ffdb'
          });
        }
        if (!isSelf && playBeamFX) {
          playBeamFX({ r: this.r, c: this.c }, { r: lowestAlly.r, c: lowestAlly.c }, {
            kind: 'heal',
            color: '#2ee59d',
            color2: '#e066ff'
          });
        }
        if (playCombatPopupFX) {
          playCombatPopupFX('heal', { r: lowestAlly.r, c: lowestAlly.c }, healed, { r: this.r, c: this.c }, undefined, {
            skipLunge: true,
            delayMs: isSelf ? 50 : 110
          });
        }
      }
      addLog(`💫✨ ヘイローのパッシブ『バイタル・オーラ』発動！周囲で最も負傷している ${lowestAlly.unit.name} を ${healed} HP自動回復！(現在HP: ${lowestAlly.unit.hp}/${lowestAlly.unit.maxHp})`, 'skill');
    }
  }
}
