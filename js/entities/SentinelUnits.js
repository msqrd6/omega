/* ==============================================================
   SentinelUnits.js: センチネル (Sentinel) ロール ユニットクラス群
   (ウォーデン, ヴァルカン, スモッグ)
   ============================================================== */
import { UnitEntity } from './UnitEntity.js?v=lab-white-1';
import { HERO_TYPES, inBounds, ROWS, COLS } from '../config.js?v=lab-white-1';

// ==========================================
// 1. ウォーデン (Vector / SENTINEL)
// ==========================================
export class WardenUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.WARDEN || HERO_TYPES.SENTINEL;
    super({
      typeKey: 'WARDEN',
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

  // パッシブ『バンカー・スナイパー』: 味方オブジェクトまたは味方アンカーに隣接時、ATK +5
  isBunkerActive(board) {
    if (!board) return false;
    let ur = this.r, uc = this.c;
    if (!inBounds(ur, uc) || board[ur][uc] !== this) {
      ur = -1; uc = -1;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (board[r][c] === this) { ur = r; uc = c; break; }
        }
        if (ur !== -1) break;
      }
      if (ur === -1) return false;
      this.r = ur;
      this.c = uc;
    }
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = ur + dr, nc = uc + dc;
        if (inBounds(nr, nc)) {
          const neighbor = board[nr][nc];
          if (neighbor && neighbor.owner === this.owner && (neighbor.isAnchor() || neighbor.isObject())) {
            return true;
          }
        }
      }
    }
    return false;
  }

  getEffectiveAtk(context = {}) {
    let total = super.getEffectiveAtk(context);
    if (this.isBunkerActive(context.board)) {
      total += 5;
    }
    return total;
  }

  isPassiveActive(context = {}) {
    return this.isBunkerActive(context.board);
  }

  getPassiveStatusText(context = {}) {
    return this.isPassiveActive(context) ? '✨ 発動中 (ATK+5)' : '条件未達成';
  }

  getSkillTargets(slot, context = {}) {
    const { board } = context;
    if (slot === 'A') {
      const targets = [];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = this.r + dr, nc = this.c + dc;
          if (inBounds(nr, nc) && !board[nr][nc]) {
            targets.push({ r: nr, c: nc });
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
    const { board, spawnUnit, addLog } = context;
    if (slot === 'A') {
      spawnUnit('BARRICADE', this.owner, targetPos.r, targetPos.c);
      addLog(`🧱 ${this.name} が『フォース・バリケード』発動！指定マスに防壁（HP 30）を構築！`, 'skill');
    } else if (slot === 'ULT') {
      for (const ally of board.flat()) {
        if (ally?.owner !== this.owner) continue;
        ally.applyBuff('shield', 15, 2);
      }
    }
  }
}

// ==========================================
// 2. ヴァルカン (Vulcan / VULCAN)
// ==========================================
export class VulcanUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.VULCAN;
    super({
      typeKey: 'VULCAN',
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

  // パッシブ『クロスファイア・リンク』: タレットのストック保持時にATK +10
  isStockActive() {
    return (this.stockA ?? 0) > 0;
  }

  getEffectiveAtk(context = {}) {
    let total = super.getEffectiveAtk(context);
    if (this.isStockActive()) {
      total += 10;
    }
    return total;
  }

  isPassiveActive(context = {}) {
    return this.isStockActive();
  }

  getPassiveStatusText(context = {}) {
    return this.isPassiveActive(context) ? '✨ 発動中 (ATK+10)' : 'ストックなし';
  }

  getSkillTargets(slot, context = {}) {
    const { board, hasHazardOrTrapAt } = context;
    if (slot === 'A') {
      const targets = [];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = this.r + dr, nc = this.c + dc;
          if (inBounds(nr, nc) && !board[nr][nc] && !hasHazardOrTrapAt(nr, nc)) {
            targets.push({ r: nr, c: nc });
          }
        }
      }
      return targets;
    } else if (slot === 'ULT') {
      const targets = [];
      for (let tr = 0; tr < ROWS; tr++) {
        for (let tc = 0; tc < COLS; tc++) {
          const u = board[tr][tc];
          if (u && u.typeKey === 'TURRET' && u.owner === this.owner) {
            targets.push({ r: tr, c: tc });
          }
        }
      }
      return targets;
    }
    return [];
  }

  executeSkill(slot, targetPos, context = {}) {
    const { spawnUnit, addLog, board, dealDamage, checkDeath, onGameOver } = context;
    const enemyOwner = (this.owner === 'P1') ? 'P2' : 'P1';

    if (slot === 'A') {
      spawnUnit('TURRET', this.owner, targetPos.r, targetPos.c);
      addLog(`⚙️🗼 ${this.name} が『セントリー・タレット』発動！自動防衛タレット（HP 20, ATK 10）を構築！（ヴァルカン破壊後も存続）`, 'skill');
    } else if (slot === 'ULT') {
      let targetTurretPos = null;
      if (targetPos && inBounds(targetPos.r, targetPos.c)) {
        const chosen = board[targetPos.r][targetPos.c];
        if (chosen && chosen.owner === this.owner && chosen.typeKey === 'TURRET') {
          targetTurretPos = { r: targetPos.r, c: targetPos.c };
        }
      }
      if (!targetTurretPos) {
        for (let r = 0; r < ROWS && !targetTurretPos; r++) {
          for (let c = 0; c < COLS && !targetTurretPos; c++) {
            const u = board[r][c];
            if (u && u.owner === this.owner && u.typeKey === 'TURRET') {
              targetTurretPos = { r, c };
            }
          }
        }
      }
      if (!targetTurretPos) return;


      const blastTiles = new Set();
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = targetTurretPos.r + dr, nc = targetTurretPos.c + dc;
          if (inBounds(nr, nc)) blastTiles.add(`${nr},${nc}`);
        }
      }

      let hitCount = 0;
      blastTiles.forEach(key => {
        const [tr, tc] = key.split(',').map(Number);
        const t = board[tr][tc];
        if (t && t.owner === enemyOwner && !t.isAnchor() && (t.isUnit() || t.isObject())) {
          dealDamage(this, t, 25, { r: tr, c: tc }, false);
          checkDeath(tr, tc, this.owner, onGameOver);
          hitCount++;
        }
      });

      addLog(`⚙️🚀💥 ${this.name} がウルト『フォートレス・プロトコル』発動！セントリー・タレット周辺半径2マスへ空爆を要請し、敵 ${hitCount} 体に 25 DMGを爆砕！`, 'skill');
    }
  }
}

// ==========================================
// 3. スモッグ (Toxin / POISON)
// ==========================================
export class SmogUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.SMOG || HERO_TYPES.POISON;
    super({
      typeKey: 'SMOG',
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

  getEffectiveAtk({ poisonZones = [], target } = {}) {
    return super.getEffectiveAtk() + (poisonZones.some(zone =>
      (zone.r === this.r && zone.c === this.c) ||
      (target?.isUnit() && zone.r === target.r && zone.c === target.c)
    ) ? 10 : 0);
  }

  getSkillTargets(slot, { board, hasFriendlyTrapAt }) {
    if (slot === 'ULT') return [{ r: this.r, c: this.c }];
    const targets = [];
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const r = this.r + dr, c = this.c + dc;
        if (inBounds(r, c) && !board[r][c] && !hasFriendlyTrapAt(r, c)) targets.push({ r, c });
      }
    }
    return targets;
  }

  executeSkill(slot, target, context) {
    const { board, traps, placePoisonZone, dealDamage, checkDeath, onGameOver } = context;
    if (slot === 'A') {
      traps.push({ ...target, owner: this.owner, damage: 10, type: 'TOXIC_MINE', sourceHeroId: this.id });
      return;
    }
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = this.r + dr, c = this.c + dc;
        if (!inBounds(r, c)) continue;
        placePoisonZone(r, c, this.owner, this.id);
        const enemy = board[r][c];
        if (!enemy || enemy.owner === this.owner || !(enemy.isUnit() || enemy.isObject())) continue;
        dealDamage(this, enemy, 10, { r, c });
        checkDeath(r, c, this.owner, onGameOver, this);
      }
    }
  }
}
