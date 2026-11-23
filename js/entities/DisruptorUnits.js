/* ==============================================================
   DisruptorUnits.js: ディスラプター (Disruptor) ロール ユニットクラス群
   (グリッチ, プリズム, ハイヴ)
   ============================================================== */
import { BeamUnit } from './BeamUnit.js?v=lab-white-1';
import { UnitEntity } from './UnitEntity.js?v=lab-white-1';
import { HERO_TYPES, inBounds, ROWS, COLS } from '../config.js?v=lab-white-1';

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
          if (ally && ally.owner === this.owner && ally.isUnit() && board.flat().some(enemy => enemy && enemy.owner !== this.owner && Math.max(Math.abs(enemy.r - ar), Math.abs(enemy.c - ac)) === 1)) {
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
    const { board, addLog, playPassivePopupFX } = context;
    const enemyOwner = (this.owner === 'P1') ? 'P2' : 'P1';

    if (!context.warpUnit(this, targetPos)) return;

    if (slot === 'A') {
      addLog(`🌀 ${this.name} が『グラビティ・ワープ』発動！味方アサルトの隣接マスへ空間跳躍！`, 'skill');
    } else if (slot === 'ULT') {
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
            u.applyDebuff('vulnerable', 1, { expiresOn: this.owner });
            if (slot === 'ULT') u.applyDebuff('disarm', 1);
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
// 2. プリズム (Cypher / PRISM)
// ==========================================
export class PrismUnit extends BeamUnit {
  constructor(owner, r, c) {
    const def = HERO_TYPES.PRISM;
    super({
      typeKey: 'PRISM',
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

  mark = 'trace';
  directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  getMarkedTargets(board, slot) {
    return this.getMarkedPieces(board).filter(piece =>
      piece.owner !== this.owner && (slot === 'ULT' || !piece.isAnchor()));
  }

  executeSkill(slot, targetPos, { board, dealDamage, checkDeath, onGameOver, playBeamFX, playCombatPopupFX, playMarkPulseFX }) {
    const ult = slot === 'ULT';
    const casterPos = { r: this.r, c: this.c };
    for (const enemy of this.getMarkedTargets(board, slot)) {
      const enemyPos = { r: enemy.r, c: enemy.c };
      enemy.applyDebuff(ult ? 'bind' : 'silence', 1, { allowNonUnit: true });
      const dealt = dealDamage(this, enemy, ult ? 20 : 10, enemyPos);
      checkDeath(enemyPos.r, enemyPos.c, this.owner, onGameOver, this);
      if (ult) {
        playMarkPulseFX?.(enemyPos, '#ff3ec8', 860);
        playBeamFX?.(casterPos, enemyPos, { kind: 'debuff', color: '#8d7bff', color2: '#ff3ec8', delayMs: 860 });
      } else {
        playMarkPulseFX?.(enemyPos, '#a855f7');
        playBeamFX?.(casterPos, enemyPos, { kind: 'debuff', color: '#a855f7', color2: '#f2b8ff' });
        playCombatPopupFX?.('dmg', enemyPos, dealt, casterPos, undefined, {
          skipLunge: true,
          delayMs: 80,
          color: '#a855f7',
          color2: '#f2b8ff',
          label: dealt > 0 ? `-${dealt} DMG · 阻害` : '🛡️ SHIELD · 阻害'
        });
      }
    }
  }
}

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

  getSkillTargets(slot, { board }) {
    const assaults = board.flat().filter(unit => unit?.owner === this.owner && unit.isAssault?.());
    return board.flatMap((row, r) => row.flatMap((piece, c) =>
      !piece && (slot === 'ULT' || assaults.some(unit => Math.max(Math.abs(r - unit.r), Math.abs(c - unit.c)) === 1))
        ? [{ r, c }] : []));
  }

  executeSkill(slot, target, { board, spawnUnit }) {
    const bit = spawnUnit('BIT', this.owner, target.r, target.c);
    bit.summonerId = this.id;
    if (slot === 'ULT') {
      for (const ally of board.flat()) {
        if (ally?.owner !== this.owner || ally.typeKey !== 'BIT') continue;
        ally.applyBuff('shield', 15, 1);
        ally.applyBuff('atk_up', 10, 1);
      }
    }
  }
}
