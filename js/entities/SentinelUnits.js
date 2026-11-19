/* ==============================================================
   SentinelUnits.js: センチネル (Sentinel) ロール ユニットクラス群
   (ベクター, ヴァルカン, トキシン)
   ============================================================== */
import { UnitEntity } from './UnitEntity.js?v=urban-v1';
import { HERO_TYPES, inBounds, ROWS, COLS } from '../config.js?v=urban-v1';

// ==========================================
// 1. ベクター (Vector / SENTINEL)
// ==========================================
export class VectorUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.VECTOR || HERO_TYPES.SENTINEL;
    super({
      typeKey: 'VECTOR',
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

  // パッシブ『バンカー・スナイパー』: オブジェクトまたはコアに隣接時、ATK +10
  isBunkerActive(board) {
    if (!board) return false;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = this.r + dr, nc = this.c + dc;
        if (inBounds(nr, nc)) {
          const neighbor = board[nr][nc];
          if (neighbor && (neighbor.isCore() || neighbor.isObject())) {
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
      total += 10;
    }
    return total;
  }

  isPassiveActive(context = {}) {
    return this.isBunkerActive(context.board);
  }

  getPassiveStatusText(context = {}) {
    return this.isPassiveActive(context) ? '✨ 発動中 (ATK+10)' : '条件未達成';
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
    const { spawnUnit, showDamagePopup, addLog } = context;
    if (slot === 'A') {
      spawnUnit('BARRICADE', this.owner, targetPos.r, targetPos.c);
      showDamagePopup(targetPos.r, targetPos.c, `防壁設置!`, '#10b981');
      addLog(`🧱 ${this.name} が『フォース・バリケード』発動！指定マスに防壁（HP 30）を構築！`, 'skill');
    } else if (slot === 'ULT') {
      this.stockA = 3;
      showDamagePopup(this.r, this.c, `ストック全回復 [3/3]!`, '#00d2ff');
      addLog(`🛡️ ${this.name} がウルト『バリケード・バッファー』発動！『フォース・バリケード』のストックが全回復（最大3回まで再装填）した！`, 'skill');
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
    const { spawnUnit, showDamagePopup, addLog, board, dealDamage, checkDeath, onGameOver } = context;
    const enemyOwner = (this.owner === 'P1') ? 'P2' : 'P1';

    if (slot === 'A') {
      spawnUnit('TURRET', this.owner, targetPos.r, targetPos.c);
      showDamagePopup(targetPos.r, targetPos.c, `🗼タレット設置!`, '#10b981');
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

      showDamagePopup(this.r, this.c, `フォートレス・プロトコル!!`, '#f97316');
      showDamagePopup(targetTurretPos.r, targetTurretPos.c, `🎯空爆目標!`, '#f59e0b');

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
        if (t && t.owner === enemyOwner && !t.isCore() && (t.isUnit() || t.isObject())) {
          dealDamage(this, t, 25, { r: tr, c: tc }, false);
          showDamagePopup(tr, tc, `💥空爆! -25`, '#ff0055');
          checkDeath(tr, tc, this.owner, onGameOver);
          hitCount++;
        }
      });

      addLog(`⚙️🚀💥 ${this.name} がウルト『フォートレス・プロトコル』発動！セントリー・タレット周辺半径2マスへ空爆を要請し、敵 ${hitCount} 体に 25 DMGを爆砕！`, 'skill');
    }
  }
}

// ==========================================
// 3. トキシン (Toxin / POISON)
// ==========================================
export class ToxinUnit extends UnitEntity {
  constructor(owner, r, c) {
    const def = HERO_TYPES.TOXIN || HERO_TYPES.POISON;
    super({
      typeKey: 'TOXIN',
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

  getSkillTargets(slot) {
    if (slot === 'A') {
      const targets = [];
      if (inBounds(this.r, this.c + 1)) targets.push({ r: this.r, c: this.c + 1 });
      if (inBounds(this.r, this.c - 1)) targets.push({ r: this.r, c: this.c - 1 });
      return targets;
    } else if (slot === 'ULT') {
      return [{ r: this.r, c: this.c }];
    }
    return [];
  }

  executeSkill(slot, targetPos, context = {}) {
    const { poisonZones, phantomZones, hasHazardOrTrapAt, showDamagePopup, addLog } = context;

    if (slot === 'A') {
      const dir = (targetPos.c > this.c) ? 1 : -1;
      let placedCount = 0;
      let step = 1;
      const maxLen = 3;

      while (placedCount < maxLen) {
        const nc = this.c + dir * step;
        if (!inBounds(this.r, nc)) break;
        if (!hasHazardOrTrapAt(this.r, nc)) {
          poisonZones.push({
            r: this.r,
            c: nc,
            owner: this.owner,
            sourceHeroId: this.id,
            sourceHeroType: this.typeKey
          });
          showDamagePopup(this.r, nc, `🧪トキシック!`, '#10b981');
          placedCount++;
        }
        step++;
      }
      addLog(`🧪 ${this.name} が『トキシック・カーテン』発動！${dir > 0 ? '右' : '左'}方向へ3マスのトキシック・ゾーンを展開（トキシン撃破時に消滅）！`, 'skill');
    } else if (slot === 'ULT') {
      showDamagePopup(this.r, this.c, `バイオハザード!!`, '#10b981');
      let placedCount = 0;
      let overwrittenCount = 0;

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = this.r + dr, nc = this.c + dc;
          if (!inBounds(nr, nc)) continue;

          for (let i = phantomZones.length - 1; i >= 0; i--) {
            if (phantomZones[i].r === nr && phantomZones[i].c === nc) {
              phantomZones.splice(i, 1);
              overwrittenCount++;
            }
          }
          for (let i = poisonZones.length - 1; i >= 0; i--) {
            if (poisonZones[i].r === nr && poisonZones[i].c === nc) {
              poisonZones.splice(i, 1);
            }
          }

          poisonZones.push({
            r: nr,
            c: nc,
            owner: this.owner,
            sourceHeroId: this.id,
            sourceHeroType: this.typeKey
          });
          showDamagePopup(nr, nc, `🧪トキシック!`, '#10b981');
          placedCount++;
        }
      }
      addLog(`🧪☣️ ${this.name} がウルト『バイオハザード』発動！自身の足元および周囲8マス（計${placedCount}マス）にトキシック・ゾーンを一斉展開${overwrittenCount > 0 ? `（既存ハザード${overwrittenCount}箇所を上書き）` : ''}！`, 'skill');
    }
  }
}
