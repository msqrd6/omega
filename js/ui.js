/* ==============================================================
   ui.js: ビュー＆レンダリング層 (2D DOM / カード / ポップアップ / ログ)
   (将来3Dレンダラー等へ差し替え・拡張しやすいよう描画責務を集約)
   ============================================================== */
import {
  ROWS,
  COLS,
  HERO_TYPES,
  ULT_REQUIRED_DAMAGE,
  SELECTABLE_HERO_KEYS,
  DEFAULT_ROSTER
} from './config.js?v=urban-v1';
import {
  board,
  traps,
  phantomZones,
  poisonZones,
  findCore,
  getValidMoves,
  getValidAttacks,
  isUltReady,
  hasBuff,
  hasDebuff,
  getEffectiveAtk,
  getShieldVal,
  getTeamUltGauge,
  canDeployAt,
  getHazardInfoAt,
  hasActionToken,
  isVectorBunkerActive,
  isVulcanStockActive,
  getPlayerTokens,
  isLocalPlayer,
  isUnit
} from './board.js?v=urban-v1';

import { characterArt, renderUrbanHero, icon, roleIcon, roleKey, floorGraphicHtml, getSkillPreviewTargets, getUltPreviewTargets, isHealSkillHero } from './urban-ui.js?v=urban-v13';

export let tileElements = [];
export let isBoardFlipped = false;

// フェーズ案内テキスト更新ヘルパー
export function setPhaseInstruction(text) {
  const el = document.getElementById('phase-instruction');
  if (el) el.innerText = text;
}

// プレイヤー視点の設定（P2側なら自陣手前(flipped)に固定）
export function setBoardPerspective(flipped) {
  isBoardFlipped = !!flipped;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (tileElements[r] && tileElements[r][c]) {
        tileElements[r][c].style.order = isBoardFlipped
          ? (ROWS - 1 - r) * COLS + (COLS - 1 - c)
          : r * COLS + c;
      }
    }
  }

  const boardEl = document.getElementById('board');
  if (boardEl) {
    boardEl.classList.toggle('flipped-perspective', isBoardFlipped);
  }
  const coreBar = document.querySelector('.core-status-bar');
  if (coreBar) {
    coreBar.classList.toggle('flipped-bar', isBoardFlipped);
  }
  const battlefield = document.querySelector('.battlefield');
  if (battlefield) {
    battlefield.classList.toggle('flipped-perspective', isBoardFlipped);
  }
  document.querySelectorAll('#urban-coord-cols span').forEach((el, i) => el.textContent = 'ABCDEFG'[isBoardFlipped ? 6 - i : i]);
  document.querySelectorAll('#urban-coord-rows span').forEach((el, i) => el.textContent = isBoardFlipped ? i + 1 : 7 - i);
}

export function getHpClass(hp, max) {
  const pct = hp / max;
  if (pct <= 0.3) return 'critical';
  if (pct <= 0.6) return 'low';
  return '';
}

// 盤面DOMを最初に1回だけ構築 (ドラッグ＆ドロップリスナー付き)
export function createBoardDOMOnce({ onTileClickCallback, onPieceDropCallback, onTileHoverCallback }) {
  const boardEl = document.getElementById('board');
  if (!boardEl) return;
  boardEl.innerHTML = '';
  tileElements = [];

  if (onTileHoverCallback) {
    boardEl.addEventListener('mouseleave', () => onTileHoverCallback(null));
  }

  for (let r = 0; r < ROWS; r++) {
    tileElements[r] = [];
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.r = r;
      tile.dataset.c = c;
      tile.tabIndex = 0;
      tile.setAttribute('role', 'button');
      tile.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onTileClickCallback(r, c); }
      });
      tile.style.order = isBoardFlipped
        ? (ROWS - 1 - r) * COLS + (COLS - 1 - c)
        : r * COLS + c;

      tile.addEventListener('click', (e) => {
        e.stopPropagation();
        onTileClickCallback(r, c);
      });

      if (onTileHoverCallback) {
        tile.addEventListener('mouseenter', () => onTileHoverCallback({ r, c }));
        tile.addEventListener('focus', () => onTileHoverCallback({ r, c }));
      }

      tile.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
        }
        if (tile.classList.contains('movable') || tile.classList.contains('deploy-area-ally') || tile.classList.contains('deploy-area-p1') || tile.classList.contains('deploy-area-p2')) {
          tile.classList.add('drag-over-valid');
        } else if (tile.classList.contains('attackable')) {
          tile.classList.add('drag-over-attack');
        }
      });

      tile.addEventListener('dragleave', (e) => {
        if (!tile.contains(e.relatedTarget)) {
          tile.classList.remove('drag-over-valid', 'drag-over-attack');
        }
      });

      tile.addEventListener('drop', (e) => {
        e.preventDefault();
        tile.classList.remove('drag-over-valid', 'drag-over-attack');
        try {
          const raw = e.dataTransfer.getData('text/plain');
          if (raw) {
            const from = JSON.parse(raw);
            onPieceDropCallback(from.r, from.c, r, c);
          }
        } catch (err) {
          console.error("Drop error:", err);
        }
      });

      boardEl.appendChild(tile);
      tileElements[r][c] = tile;
    }
  }
}

// スキル・ULTの待機時＆ホバー効果範囲プレビュー更新（ピースDOM再構築なし）
export function updateTargetingPreview({
  turn,
  selectedPos,
  commandMode,
  validTargets = [],
  hoveredPos = null,
  gamePhase = 'BATTLE'
}) {
  const isDeployPhase = (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2');
  const stageEl = document.getElementById('battle-stage');
  const selHeroGlobal = (selectedPos && board[selectedPos.r]?.[selectedPos.c]) || null;
  const isMyActiveUnit = Boolean(!isDeployPhase && selHeroGlobal && selHeroGlobal.owner === turn && isUnit(selHeroGlobal));
  const isUltTargeting = Boolean(commandMode === 'SKILL_ULT' && isMyActiveUnit);
  const isSkillFocus = Boolean(commandMode === 'SKILL_A' && !isUltTargeting && isMyActiveUnit);

  if (stageEl) {
    stageEl.classList.toggle('is-ult-armed', isUltTargeting);
    stageEl.classList.toggle('is-skill-armed', isSkillFocus);
  }

  if (!isUltTargeting && !isSkillFocus) return;

  const validHoveredTarget = (hoveredPos && validTargets.some(t => t.r === hoveredPos.r && t.c === hoveredPos.c))
    ? hoveredPos
    : null;

  const ultPreviewTargets = isUltTargeting
    ? getUltPreviewTargets(selectedPos, selHeroGlobal, validHoveredTarget, true)
    : [];
  const ultPreviewMap = new Map(ultPreviewTargets.map(t => [`${t.r},${t.c}`, t]));

  const skillPreviewTargets = isSkillFocus
    ? getSkillPreviewTargets(selectedPos, selHeroGlobal, validHoveredTarget)
    : [];
  const skillPreviewMap = new Map(skillPreviewTargets.map(t => [`${t.r},${t.c}`, t]));

  const previewClasses = [
    'is-ult-caster', 'ult-zone', 'is-toxic-ult', 'ult-target',
    'skill-target', 'heal-target', 'skill-zone', 'is-heal-zone',
    'is-toxic-zone', 'is-debuff-zone', 'is-beam-zone', 'is-preview-hit'
  ];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = tileElements[r]?.[c];
      if (!tile) continue;

      tile.classList.remove(...previewClasses);

      let targetKind = null;
      let showUltMark = false;
      const isSelectableTarget = validTargets.some(t => t.r === r && t.c === c);

      if (isUltTargeting) {
        const isCaster = selectedPos && selectedPos.r === r && selectedPos.c === c;
        const uHit = ultPreviewMap.get(`${r},${c}`);
        if (isCaster) {
          tile.classList.add('is-ult-caster');
        }
        if (uHit && !isCaster) {
          tile.classList.add('ult-zone');
          if (selHeroGlobal.typeKey === 'TOXIN') tile.classList.add('is-toxic-ult');
        }
        if (uHit?.hitPiece) {
          tile.classList.add('is-preview-hit');
        }
        if (isSelectableTarget) {
          tile.classList.add('ult-target');
        }
        const isHoveredValid = Boolean(validHoveredTarget && validHoveredTarget.r === r && validHoveredTarget.c === c);
        if (validTargets.length <= 8) {
          if (isSelectableTarget) {
            showUltMark = true;
          }
        } else if (isHoveredValid) {
          showUltMark = true;
        }
      } else if (isSkillFocus) {
        const sHit = skillPreviewMap.get(`${r},${c}`);
        if (isSelectableTarget) {
          if (isHealSkillHero(selHeroGlobal)) {
            tile.classList.add('skill-target', 'heal-target');
            targetKind = 'heal';
          } else {
            tile.classList.add('skill-target');
            targetKind = 'skill';
          }
        }
        if (sHit) {
          tile.classList.add('skill-zone');
          if (sHit.kind === 'heal') tile.classList.add('is-heal-zone');
          else if (sHit.kind === 'toxic') tile.classList.add('is-toxic-zone');
          else if (sHit.kind === 'debuff') tile.classList.add('is-debuff-zone');
          else if (sHit.kind === 'beam') tile.classList.add('is-beam-zone');
          if (sHit.hitPiece) tile.classList.add('is-preview-hit');
        }
      }

      let markEl = tile.querySelector('.target-mark');
      if (targetKind) {
        if (!markEl) {
          markEl = document.createElement('span');
          markEl.className = 'target-mark';
          tile.appendChild(markEl);
        }
        markEl.innerHTML = icon(targetKind === 'attack' ? 'attack' : targetKind === 'move' ? 'move' : 'skill');
      } else if (markEl) {
        markEl.remove();
      }

      let ultMarkEl = tile.querySelector('.ult-target-mark');
      if (showUltMark) {
        if (!ultMarkEl) {
          ultMarkEl = document.createElement('span');
          ultMarkEl.className = 'ult-target-mark';
          tile.appendChild(ultMarkEl);
        }
        ultMarkEl.innerHTML = icon('ult');
      } else if (ultMarkEl) {
        ultMarkEl.remove();
      }
    }
  }
}

// 盤面ビューの更新
export function updateBoardView({
  turn,
  selectedPos,
  selectedHazardPos,
  commandMode,
  validTargets = [],
  hoveredPos = null,
  gamePhase = 'BATTLE',
  gameMode = 'pve',
  myOnlineRole = null,
  onPieceDragStartCallback,
  onPieceDragEndCallback
}) {
  const isDeployPhase = (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2');
  const deployOwner = (gamePhase === 'DEPLOY_P1') ? 'P1' : (gamePhase === 'DEPLOY_P2' ? 'P2' : null);
  const isMyDeployPhase = !isDeployPhase ? false : (gameMode !== 'online' || deployOwner === myOnlineRole);
  const stageEl = document.getElementById('battle-stage');
  const selHeroGlobal = (selectedPos && board[selectedPos.r]?.[selectedPos.c]) || null;
  const isUltTargeting = Boolean(
    commandMode === 'SKILL_ULT' && !isDeployPhase && selHeroGlobal && selHeroGlobal.owner === turn && isUnit(selHeroGlobal)
  );
  const isSkillFocus = Boolean(
    commandMode === 'SKILL_A' && !isUltTargeting && !isDeployPhase && selHeroGlobal && selHeroGlobal.owner === turn && isUnit(selHeroGlobal)
  );

  if (stageEl) {
    stageEl.classList.toggle('is-ult-armed', isUltTargeting);
    stageEl.classList.toggle('is-skill-armed', isSkillFocus);
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = tileElements[r]?.[c];
      if (!tile) continue;
      const unit = board[r][c];

      tile.className = 'tile';
      const topZoneRow = isBoardFlipped ? (r > 4) : (r < 2);
      const bottomZoneRow = isBoardFlipped ? (r < 2) : (r > 4);
      if (topZoneRow) tile.classList.add('enemy-zone');
      else if (bottomZoneRow) tile.classList.add('ally-zone');
      tile.title = '';

      // 1. 初期配置フェーズの枠線ガイドハイライト
      if (isDeployPhase && isMyDeployPhase && canDeployAt(deployOwner, r, c)) {
        tile.classList.add('deploy-area-ally');
      }

      // 2. トラップ・ハザード表示
      const trap = traps.find(tp => tp.r === r && tp.c === c && isLocalPlayer(tp.owner));
      const hasVisibleTrap = !!trap;
      if (hasVisibleTrap) {
        tile.classList.add('has-trap-ally');
        tile.title = 'マイン（地雷 / 自軍のみ視認可能）';
      }

      const fz = phantomZones.find(z => z.r === r && z.c === c);
      const pzn = poisonZones.find(z => z.r === r && z.c === c);

      if (fz) {
        tile.classList.add('has-hazard', 'phantom-zone', isLocalPlayer(fz.owner) ? 'hazard-owner-ally' : 'hazard-owner-enemy');
        tile.title = `👻 ディメンション・ゾーン (${isLocalPlayer(fz.owner) ? '自軍' : '敵軍'} / 侵入中は常に弱体化1.5倍 / フェイズ撃破で消滅)`;
      } else if (pzn) {
        tile.classList.add('has-hazard', 'poison-zone', isLocalPlayer(pzn.owner) ? 'hazard-owner-ally' : 'hazard-owner-enemy');
        tile.title = `🧪 トキシック・ゾーン (${isLocalPlayer(pzn.owner) ? '自軍' : '敵軍'} / ターン開始時10DMG / トキシン撃破で消滅)`;
      }

      if (selectedHazardPos && selectedHazardPos.r === r && selectedHazardPos.c === c) {
        tile.classList.add('selected', 'hazard-selected');
      }

      // フロアハザード・トラップバッジ描画
      let floorEl = tile.querySelector('.floor');
      const floorType = pzn ? 'toxic' : fz ? 'dimension' : hasVisibleTrap ? 'mine' : null;
      const floorOwner = pzn ? pzn.owner : fz ? fz.owner : hasVisibleTrap ? trap.owner : null;
      if (floorType) {
        if (!floorEl || floorEl.tagName !== 'DIV') {
          if (floorEl) floorEl.remove();
          floorEl = document.createElement('div');
          tile.prepend(floorEl);
        }
        floorEl.className = `floor ${floorType}`;
        floorEl.dataset.relation = isLocalPlayer(floorOwner) ? 'ally' : 'enemy';
        floorEl.innerHTML = floorGraphicHtml({ type: floorType, name: floorType === 'toxic' ? 'トキシック' : floorType === 'dimension' ? 'ディメンション' : 'マイン' });
      } else if (floorEl) {
        floorEl.remove();
      }

      // 4. 駒の描画
      let pieceEl = tile.querySelector('.piece');
      if (unit) {
        if (!pieceEl) {
          pieceEl = document.createElement('div');
          pieceEl.className = 'piece';
          tile.appendChild(pieceEl);
        }

        const isEnemy = !isLocalPlayer(unit.owner);
        const isStructure = !isUnit(unit);
        pieceEl.className = `piece ${isEnemy ? 'enemy' : 'ally'} ${isStructure ? 'structure' : ''} ${unit.typeKey.toLowerCase()}`;
        tile.setAttribute('aria-label', `${'ABCDEFG'[c]}${7 - r} ${unit.name} HP ${unit.hp}/${unit.maxHp}`);
        if (unit.typeKey === 'CORE') pieceEl.classList.add('core');

        const localTurn = gameMode === 'online' ? turn === myOnlineRole : turn === 'P1';
        const isCurrentTurnHero = (gamePhase === 'BATTLE' && localTurn && unit.owner === turn && isUnit(unit));
        const canDragInDeploy = (isDeployPhase && isMyDeployPhase && unit.owner === deployOwner);

        if (isCurrentTurnHero || canDragInDeploy) {
          pieceEl.draggable = true;
          pieceEl.classList.add('draggable');

          pieceEl.ondragstart = (e) => {
            e.stopPropagation();
            pieceEl.classList.add('dragging');
            e.dataTransfer.setData('text/plain', JSON.stringify({ r, c }));
            e.dataTransfer.effectAllowed = 'move';
            if (onPieceDragStartCallback) onPieceDragStartCallback(r, c);
          };

          pieceEl.ondragend = () => {
            pieceEl.classList.remove('dragging');
            if (onPieceDragEndCallback) onPieceDragEndCallback();
          };
        } else {
          pieceEl.draggable = false;
          pieceEl.classList.remove('draggable', 'dragging');
          pieceEl.ondragstart = null;
          pieceEl.ondragend = null;
        }

        if (selectedPos && selectedPos.r === r && selectedPos.c === c) {
          pieceEl.classList.add('selected');
        }

        const hasAnyDebuff = unit.debuffs && (
          hasDebuff(unit, 'vulnerable') ||
          hasDebuff(unit, 'disarm') ||
          hasDebuff(unit, 'bind') ||
          hasDebuff(unit, 'silence')
        );
        const hasAtkBuff = unit.buffs && (hasBuff(unit, 'atk_up') || hasBuff(unit, 'shadow_drain'));
        const statusIconHtml = hasAnyDebuff ? icon('debuff') : (hasAtkBuff ? icon('buff') : '');

        const shieldVal = getShieldVal(unit);
        const displayHp = unit.hp + shieldVal;
        const shieldHtml = shieldVal > 0 ? `<span class="piece-shield">${icon('shield')}${shieldVal}</span>` : '';
        const faceHtml = unit.typeKey === 'CORE'
          ? icon('core')
          : unit.typeKey === 'TURRET'
            ? icon('turret')
            : characterArt(unit.typeKey, unit.owner, unit.name);
        const atkVal = isUnit(unit)
          ? getEffectiveAtk(unit)
          : (unit.atk ? unit.atk : '');
        const baseAtk = isUnit(unit) ? (HERO_TYPES[unit.typeKey]?.atk ?? unit.atk ?? 0) : (unit.atk || 0);
        const hasAtk = atkVal !== '' && Number(atkVal) > 0;
        const isAtkBuffed = Boolean(hasAtk && (hasAtkBuff || Number(atkVal) > Number(baseAtk)));
        const atkText = hasAtk ? String(atkVal) : '—';
        const atkCls = hasAtk ? (isAtkBuffed ? 'is-buffed' : '') : 'is-none';
        const maxHp = Math.max(1, unit.maxHp || unit.hp || 1);
        const hpPct = Math.max(0, Math.min(100, (unit.hp / maxHp) * 100));
        const shieldUnits = (unit.hp < maxHp && shieldVal > 0) ? Math.min(maxHp - unit.hp, shieldVal) : 0;
        const shieldPct = Math.max(0, Math.min(100 - hpPct, (shieldUnits / maxHp) * 100));

        pieceEl.dataset.role = roleKey(unit);
        pieceEl.style.removeProperty('--hp-color');

        pieceEl.innerHTML = `
          <span class="piece-face">${faceHtml}</span>
          <span class="piece-role">${icon(roleIcon(unit))}</span>
          <span class="piece-status">${statusIconHtml}</span>
          ${shieldHtml}
          <span class="piece-readout">
            <svg class="piece-dock-svg" viewBox="0 0 80 35" preserveAspectRatio="none" aria-hidden="true">
              <path d="M 4,1 L 26,1 Q 28,1 28.8,3 L 31.2,15 Q 32,17 34,17 L 56.5,17 Q 58.5,17 59.3,15 L 60.8,7.5 Q 61.6,5.5 63.6,5.5 L 76,5.5 Q 79,5.5 79,8.5 L 79,30 Q 79,34 75,34 L 5,34 Q 1,34 1,30 L 1,4 Q 1,1 4,1 Z"/>
            </svg>
            <span class="piece-values">
              <b class="${shieldVal > 0 ? 'has-shield' : ''}">${displayHp}</b>
              <span class="${atkCls}">${atkText}</span>
            </span>
            <span class="piece-hp-track"><i style="width:${hpPct.toFixed(2)}%"></i>${shieldPct > 0 ? `<i class="shield-fill" style="width:${shieldPct.toFixed(2)}%"></i>` : ''}</span>
            <span class="piece-name">${unit.name}</span>
          </span>
        `;
      } else {
        if (pieceEl) pieceEl.remove();
        tile.setAttribute('aria-label', `${'ABCDEFG'[c]}${7 - r} 空きマス`);
      }

      // 5. 選択中のハイライト
      if (selectedPos && selectedPos.r === r && selectedPos.c === c) {
        tile.classList.add('selected');
      }

      // 6. 移動先・攻撃先のハイライト（スキル・ULT待機中は updateTargetingPreview へ委譲）
      if (!isUltTargeting && !isSkillFocus) {
        let targetKind = null;
        if (selectedPos && !isDeployPhase) {
          const selHero = board[selectedPos.r]?.[selectedPos.c];
          if (selHero && selHero.owner === turn && isUnit(selHero)) {
            const validMoves = getValidMoves(selectedPos.r, selectedPos.c);
            if (validMoves.some(t => t.r === r && t.c === c)) {
              tile.classList.add('movable', 'valid-move');
              targetKind = 'move';
            }
            const validAtks = getValidAttacks(selectedPos.r, selectedPos.c);
            if (validAtks.some(t => t.r === r && t.c === c)) {
              tile.classList.add('attackable', 'valid-attack');
              targetKind = 'attack';
            }
          }
        }

        let markEl = tile.querySelector('.target-mark');
        if (targetKind) {
          if (!markEl) {
            markEl = document.createElement('span');
            markEl.className = 'target-mark';
            tile.appendChild(markEl);
          }
          markEl.innerHTML = icon(targetKind === 'attack' ? 'attack' : 'move');
        } else if (markEl) {
          markEl.remove();
        }

        const ultMarkEl = tile.querySelector('.ult-target-mark');
        if (ultMarkEl) ultMarkEl.remove();
      }
    }
  }

  if (isUltTargeting || isSkillFocus) {
    updateTargetingPreview({
      turn,
      selectedPos,
      commandMode,
      validTargets,
      hoveredPos,
      gamePhase
    });
  }
}

// 物体化行動トークンバーの更新（TOKENS 案A: 2列スロット + EX帯）
export function updateRightsDisplay(turn, selectedPos = null, gamePhase = 'BATTLE') {
  const container = document.getElementById('action-tokens-container');
  const tokenBanner = document.getElementById('action-status-banner');
  if (!container) return;

  const isNonBattle = Boolean(gamePhase && (gamePhase.startsWith('DEPLOY') || gamePhase.startsWith('PICK')));
  const tokens = isNonBattle ? [] : (getPlayerTokens(turn) || []);
  const commonAtk = tokens.filter(t => t.scope === 'all' && t.type === 'attack');
  const commonMove = tokens.filter(t => t.scope === 'all' && t.type === 'move');
  const specialTokens = tokens.filter(t => t.scope !== 'all').sort((a, b) => {
    if (Boolean(a.used) !== Boolean(b.used)) return a.used ? 1 : -1;
    const typeOrder = { attack: 0, move: 1 };
    return (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
  });

  const atkUnused = commonAtk.filter(t => !t.used);
  const moveUnused = commonMove.filter(t => !t.used);
  const specialUnused = specialTokens.filter(t => !t.used);
  const atkUsed = atkUnused.length === 0;
  const moveUsed = moveUnused.length === 0;
  const totalReadyCount = commonAtk.length + commonMove.length + specialTokens.length;
  const readyCount = atkUnused.length + moveUnused.length + specialUnused.length;

  if (tokenBanner) {
    tokenBanner.classList.toggle('enemy-turn', !isLocalPlayer(turn));
    const titleEl = tokenBanner.querySelector('.tokens-banner-title');
    if (titleEl) {
      titleEl.textContent = 'TOKENS';
      if (isNonBattle) delete titleEl.dataset.ready;
      else titleEl.dataset.ready = `${readyCount}/${totalReadyCount}`;
    }
  }

  if (isNonBattle) {
    container.innerHTML = '';
    return;
  }

  const exHtml = specialTokens.map(t => {
    const lbl = t.type === 'move' ? 'EXTRA MOVE' : 'EXTRA ATK';
    const unitLabel = String(t.unitName || t.scope || '');
    const safeDesc = String(t.desc || `${unitLabel}専用トークン`).replace(/"/g, '&quot;');
    return `
      <div class="tk-ex-strip is-ex ${t.used ? 'is-used' : ''}" title="${safeDesc}">
        <span class="tk-ex-ico">${icon(t.type === 'move' ? 'move' : 'attack')}</span>
        <strong class="tk-ex-txt">${lbl}</strong>
        <span class="tk-ex-unit">${unitLabel}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="tk-slot-grid">
      <div class="tk-slot is-atk ${atkUsed ? 'is-used' : ''}" title="共通攻撃トークン (${atkUnused.length}/${commonAtk.length || 1})">
        <span class="tk-slot-ico">${icon('attack')}</span>
        <strong class="tk-slot-lbl">ATK</strong>
      </div>
      <div class="tk-slot is-move ${moveUsed ? 'is-used' : ''}" title="共通移動トークン (${moveUnused.length}/${commonMove.length || 1})">
        <span class="tk-slot-ico">${icon('move')}</span>
        <strong class="tk-slot-lbl">MOVE</strong>
      </div>
    </div>
    ${exHtml}
  `;
}

// コアHP & チームウルト & ターン表示の更新（Viewer-Relative: 自軍=下/Yellow, 敵軍=上/Red）
export function updateStatus(turn, gameMode, gamePhase = 'BATTLE', turnCount = 1) {
  const allyOwner = isLocalPlayer('P1') ? 'P1' : 'P2';
  const enemyOwner = allyOwner === 'P1' ? 'P2' : 'P1';

  const allyCore = findCore(allyOwner);
  const enemyCore = findCore(enemyOwner);

  if (allyCore) {
    const pctAlly = Math.max(0, (allyCore.hp / allyCore.maxHp) * 100);
    const barAlly = document.getElementById('ally-core-bar');
    const hpAlly = document.getElementById('ally-core-hp');
    if (barAlly) barAlly.style.width = `${pctAlly}%`;
    if (hpAlly) hpAlly.innerText = `${allyCore.hp}/${allyCore.maxHp}`;
  }

  if (enemyCore) {
    const pctEnemy = Math.max(0, (enemyCore.hp / enemyCore.maxHp) * 100);
    const barEnemy = document.getElementById('enemy-core-bar');
    const hpEnemy = document.getElementById('enemy-core-hp');
    if (barEnemy) barEnemy.style.width = `${pctEnemy}%`;
    if (hpEnemy) hpEnemy.innerText = `${enemyCore.hp}/${enemyCore.maxHp}`;
  }

  const ultAlly = getTeamUltGauge(allyOwner);
  const ultEnemy = getTeamUltGauge(enemyOwner);
  const ultPctAlly = Math.min(100, (ultAlly / ULT_REQUIRED_DAMAGE) * 100);
  const ultPctEnemy = Math.min(100, (ultEnemy / ULT_REQUIRED_DAMAGE) * 100);

  const allyUltBar = document.getElementById('ally-ult-bar');
  const enemyUltBar = document.getElementById('enemy-ult-bar');
  const allyUltText = document.getElementById('ally-ult-text');
  const enemyUltText = document.getElementById('enemy-ult-text');

  if (allyUltBar) allyUltBar.style.width = `${ultPctAlly}%`;
  if (enemyUltBar) enemyUltBar.style.width = `${ultPctEnemy}%`;

  if (allyUltText) {
    allyUltText.innerText = `${Math.round(ultPctAlly)}%`;
    allyUltText.className = (ultAlly >= ULT_REQUIRED_DAMAGE) ? 'ult-ready-text' : '';
  }
  if (enemyUltText) {
    enemyUltText.innerText = `${Math.round(ultPctEnemy)}%`;
    enemyUltText.className = (ultEnemy >= ULT_REQUIRED_DAMAGE) ? 'ult-ready-text' : '';
  }

  const coreBarAlly = document.getElementById('core-bar-ally');
  const coreBarEnemy = document.getElementById('core-bar-enemy');
  if (coreBarAlly) {
    coreBarAlly.classList.toggle('is-ult-full', ultAlly >= ULT_REQUIRED_DAMAGE);
    const tagEl = coreBarAlly.querySelector('.core-tag');
    if (tagEl) tagEl.textContent = 'ALLY ULT';
  }
  if (coreBarEnemy) {
    coreBarEnemy.classList.toggle('is-ult-full', ultEnemy >= ULT_REQUIRED_DAMAGE);
    const tagEl = coreBarEnemy.querySelector('.core-tag');
    if (tagEl) tagEl.textContent = 'ENEMY ULT';
  }

  const turnEyebrowEl = document.getElementById('turn-label-eyebrow');
  const turnCountEl = document.getElementById('turn-count-badge');
  if (turnCountEl) {
    if (gamePhase && gamePhase.startsWith('PICK')) {
      if (turnEyebrowEl) turnEyebrowEl.innerText = 'PHASE';
      turnCountEl.innerText = 'DR';
    } else if (gamePhase && gamePhase.startsWith('DEPLOY')) {
      if (turnEyebrowEl) turnEyebrowEl.innerText = 'PHASE';
      turnCountEl.innerText = 'DP';
    } else {
      if (turnEyebrowEl) turnEyebrowEl.innerText = 'TURN';
      turnCountEl.innerText = String(turnCount).padStart(2, '0');
    }
  }

  const turnBadge = document.getElementById('turn-badge');
  const turnDisplay = document.getElementById('turn-display-box');
  const activeOwner = (
    gamePhase === 'PICK_P1' || gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_WAIT_P1'
  ) ? 'P1' : (
    gamePhase === 'PICK_P2' || gamePhase === 'DEPLOY_P2' || gamePhase === 'DEPLOY_WAIT_P2'
  ) ? 'P2' : turn;
  const isEnemyActive = !isLocalPlayer(activeOwner);

  if (turnDisplay) {
    turnDisplay.classList.toggle('enemy-turn', isEnemyActive);
  }
  if (turnBadge) {
    turnBadge.className = `turn-owner-pill ${isEnemyActive ? 'turn-enemy' : 'turn-ally'}`;
    if (gamePhase === 'PICK_P1' || gamePhase === 'PICK_P2') {
      turnBadge.innerText = isEnemyActive ? 'ENEMY DRAFT' : 'YOUR DRAFT';
    } else if (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2') {
      turnBadge.innerText = isEnemyActive ? 'WAIT ENEMY' : 'YOUR DEPLOY';
    } else if (gamePhase === 'DEPLOY_WAIT_P1' || gamePhase === 'DEPLOY_WAIT_P2') {
      turnBadge.innerText = isEnemyActive ? 'WAIT ENEMY' : 'YOUR DEPLOY';
    } else {
      turnBadge.innerText = isEnemyActive ? 'ENEMY TURN' : 'YOUR TURN';
    }
  }

  const battleScreen = document.getElementById('screen-battle');
  if (battleScreen) {
    battleScreen.classList.toggle('turn-p1-bg', !isEnemyActive);
    battleScreen.classList.toggle('turn-p2-bg', isEnemyActive);
  }
}

// 初期配置フェーズ専用固定バーの更新
export function updateDeployControlBar({
  gamePhase,
  gameMode = 'pve',
  myOnlineRole = null
}) {
  const bar = document.getElementById('deploy-control-bar');
  const tokenBanner = document.getElementById('action-status-banner');
  if (!bar) return;

  const isDeployPhase = (
    gamePhase === 'DEPLOY_P1' ||
    gamePhase === 'DEPLOY_P2' ||
    gamePhase === 'DEPLOY_WAIT_P1' ||
    gamePhase === 'DEPLOY_WAIT_P2'
  );

  if (!isDeployPhase) {
    bar.style.display = 'none';
    if (tokenBanner && gamePhase === 'BATTLE') {
      tokenBanner.style.display = 'flex';
    }
    return;
  }

  bar.style.display = 'flex';
  if (tokenBanner) {
    tokenBanner.style.display = 'none';
  }

  const curOwner = (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_WAIT_P1') ? 'P1' : 'P2';
  const isDeployWait = (gameMode === 'online' && (
    gamePhase === 'DEPLOY_WAIT_P1' ||
    gamePhase === 'DEPLOY_WAIT_P2' ||
    (gamePhase === 'DEPLOY_P1' && myOnlineRole === 'P2') ||
    (gamePhase === 'DEPLOY_P2' && myOnlineRole === 'P1')
  ));
  const isEnemyColor = isDeployWait || !isLocalPlayer(curOwner);
  bar.className = `deploy-control-bar ${isEnemyColor ? 'is-enemy' : 'ally'}`;

  const descEl = document.getElementById('deploy-bar-instruction');
  if (descEl) {
    if (isDeployWait) {
      descEl.innerText = '相手プレイヤーが初期配置中です。完了までしばらくお待ちください...';
    } else if (curOwner === 'P1') {
      descEl.innerText = '手前2マスに味方ユニットとコアを配置してください。完了したら画面右下のボタンを長押し！';
    } else {
      descEl.innerText = '先行の布陣を確認し、対抗初期配置を完了したら画面右下のボタンを長押し！';
    }
  }
}

// 画面右下アクション確定ボタン（ターン終了 / 配置完了）の表示・状態更新
export function updateHoldActionButton({
  gamePhase,
  turn,
  gameMode = 'pve',
  myOnlineRole = null,
  isGameOver = false
}) {
  const btn = document.getElementById('btn-end-turn');
  if (!btn) return;

  const mainTextEl = document.getElementById('hold-main-text');
  const subTextEl = document.getElementById('hold-sub-text');
  const iconEl = document.getElementById('hold-icon-box');
  const mainInvEl = document.getElementById('hold-main-text-inv');
  const subInvEl = document.getElementById('hold-sub-text-inv');
  const iconInvEl = document.getElementById('hold-icon-box-inv');

  const setContent = (main, sub, iconName) => {
    if (mainTextEl) mainTextEl.innerText = main;
    if (subTextEl) subTextEl.innerText = sub;
    if (iconEl && iconName) iconEl.innerHTML = icon(iconName);
    if (mainInvEl) mainInvEl.innerText = main;
    if (subInvEl) subInvEl.innerText = sub;
    if (iconInvEl && iconName) iconInvEl.innerHTML = icon(iconName);
    btn.setAttribute('aria-label', `${main}。${sub}`);
  };

  const isDeployPhase = (
    gamePhase === 'DEPLOY_P1' ||
    gamePhase === 'DEPLOY_P2' ||
    gamePhase === 'DEPLOY_WAIT_P1' ||
    gamePhase === 'DEPLOY_WAIT_P2'
  );

  btn.classList.remove('ally', 'is-enemy', 'p1', 'p2', 'unusable');

  if (isGameOver) {
    btn.disabled = true;
    btn.classList.add('unusable');
    setContent('GAME OVER', '作戦終了', 'endturn');
    return;
  }

  if (isDeployPhase) {
    const curOwner = (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_WAIT_P1') ? 'P1' : 'P2';
    const isFirstDeployer = (curOwner === 'P1');
    const isDeployWait = (gameMode === 'online' && (
      gamePhase === 'DEPLOY_WAIT_P1' ||
      gamePhase === 'DEPLOY_WAIT_P2' ||
      (gamePhase === 'DEPLOY_P1' && myOnlineRole === 'P2') ||
      (gamePhase === 'DEPLOY_P2' && myOnlineRole === 'P1')
    ));
    const isEnemyBtn = isDeployWait || !isLocalPlayer(curOwner);

    btn.classList.add(isEnemyBtn ? 'is-enemy' : 'ally');

    if (isDeployWait) {
      btn.disabled = true;
      btn.classList.add('unusable');
      setContent('WAITING...', '相手の配置を待機中', 'time');
    } else {
      btn.disabled = false;
      if (isFirstDeployer) {
        const sub = (gameMode === 'online') ? '長押しで配置送信 ➔' : '長押しで配置確定 ➔';
        setContent('DEPLOY CONFIRM', sub, 'check');
      } else {
        setContent('START BATTLE', '長押しでバトル開始 ➔', 'attack');
      }
    }
    return;
  }

  if (gamePhase === 'BATTLE') {
    const isMyTurn = (gameMode === 'online') ? (turn === myOnlineRole) : isLocalPlayer(turn);
    btn.classList.add(isMyTurn ? 'ally' : 'is-enemy');

    if (isMyTurn) {
      btn.disabled = false;
      setContent('END TURN', '長押しで確定', 'endturn');
    } else {
      btn.disabled = true;
      btn.classList.add('unusable');
      const sub = (gameMode === 'online') ? '相手の手番中...' : 'AI思考中...';
      setContent('ENEMY TURN', sub, 'endturn');
    }
    return;
  }

  btn.disabled = true;
  btn.classList.add('unusable');
  setContent('STANDBY', '待機中', 'endturn');
}

// 一体型アクションカードサイドパネルのレンダリング
export function renderHeroControlPanel({
  turn,
  selectedPos,
  selectedHazardPos = null,
  commandMode,
  gamePhase = 'BATTLE',
  canControl = false
}) {
  if (document.getElementById('battle-stage')) {
    renderUrbanHero({ turn, selectedPos, selectedHazardPos, commandMode, gamePhase, canControl });
    return;
  }
  const isDeploy = (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2');
  const panel = document.getElementById('unit-detail-panel');
  if (!panel) return;

  // ハザード単体選択時
  if (!selectedPos && selectedHazardPos) {
    const hazard = getHazardInfoAt(selectedHazardPos.r, selectedHazardPos.c);
    if (hazard) {
      const occupiedUnit = board[selectedHazardPos.r]?.[selectedHazardPos.c] || null;

      panel.innerHTML = `
        <div class="hero-card-header theme-hazard">
          <div class="hch-top-bar">
            <div class="hch-icon-box">${hazard.icon}</div>
            <div class="hch-meta">
              <div class="hch-name-row">
                <span class="hch-name">${hazard.name}</span>
                ${hazard.owner ? (isLocalPlayer(hazard.owner) ? '<span class="hch-owner-tag p1">自軍</span>' : '<span class="hch-owner-tag p2">敵軍</span>') : '<span class="hch-owner-tag neutral">🌐 中立</span>'}
                <span class="hch-class-badge class-hazard">ハザード</span>
              </div>
            </div>
          </div>
        </div>

        ${occupiedUnit ? `
          <div class="hazard-on-unit-banner" style="margin-bottom: 8px;">
            <span class="hoa-icon">${occupiedUnit.icon}</span>
            <div class="hoa-info">
              <div class="hoa-title">👤 現在滞在中: ${occupiedUnit.name} (${isLocalPlayer(occupiedUnit.owner) ? '自軍' : '敵軍'})</div>
              <div class="hoa-desc">HP: ${occupiedUnit.hp}/${occupiedUnit.maxHp}</div>
            </div>
          </div>
        ` : ''}

        <div class="passive-ability-card">
          <div class="pac-header">
            <div class="pac-title-wrap">
              <span class="pac-icon">⚠️</span>
              <span class="pac-title">効果</span>
            </div>
          </div>
          <div class="pac-desc" style="font-size: 0.76rem; line-height: 1.45; color: #cbd5e1;">
            ${hazard.desc}
          </div>
        </div>
      `;
      return;
    }
  }

  if (!selectedPos) {
    panel.innerHTML = `
      <div class="empty-selection-guide">
        <div class="esg-icon">👆</div>
        <div class="esg-title">駒またはハザードを選択</div>
        <div class="esg-desc">
          盤面のキャラクターをクリックすると、詳細ステータスやスキルカードを確認できます。<br>
          移動と通常攻撃は駒を直接ドラッグ＆ドロップして行います。
        </div>
      </div>
    `;
    return;
  }

  const hero = board[selectedPos.r]?.[selectedPos.c];
  if (!hero) {
    panel.innerHTML = `<div class="empty-selection-guide">空のマスです</div>`;
    return;
  }

  const heroDef = HERO_TYPES[hero.typeKey];
  const isEnemy = (hero.owner !== turn);
  const isCoreUnit = (hero.typeKey === 'CORE');
  const isBarricade = (hero.typeKey === 'BARRICADE');
  const isTurret = (hero.typeKey === 'TURRET');

  // コア・オブジェクト選択時のカード
  if (isCoreUnit || isBarricade || isTurret) {
    const shieldVal = getShieldVal(hero);
    const hpPct = Math.max(0, Math.min(100, Math.round((hero.hp / hero.maxHp) * 100)));
    const shieldPct = shieldVal > 0 ? Math.min(50, Math.round((shieldVal / hero.maxHp) * 100)) : 0;
    const canDestroyBarricade = isBarricade && !isEnemy;

    let themeClass = 'theme-structure';
    let classNameText = 'オブジェクト';
    let classBadgeClass = 'class-structure';
    let statsGridHtml = '';
    let featureCardHtml = '';

    if (isCoreUnit) {
      themeClass = 'theme-core';
      classNameText = 'コア';
      classBadgeClass = 'class-core';
      statsGridHtml = `
        <div class="hch-stats-grid hch-stats-single">
          <div class="hch-stat-box hch-hp-box">
            <div class="hch-stat-label-row">
              <span class="hch-stat-label">💚 耐久値</span>
              <span class="hch-stat-value"><strong>${hero.hp}</strong> / ${hero.maxHp} ${shieldVal > 0 ? `<span class="hch-shield-text">(+${shieldVal}🛡️)</span>` : ''}</span>
            </div>
            <div class="hch-hp-bar-bg">
              <div class="hch-hp-bar-fill" style="width: ${hpPct}%;"></div>
              ${shieldPct > 0 ? `<div class="hch-shield-bar-fill" style="width: ${shieldPct}%;"></div>` : ''}
            </div>
          </div>
        </div>
      `;
      featureCardHtml = `
        <div class="passive-ability-card core-feature-card">
          <div class="pac-header">
            <div class="pac-title-wrap">
              <span class="pac-icon">👑</span>
              <span class="pac-title">コア破壊で決着</span>
            </div>
          </div>
          <div class="pac-desc" style="font-size: 0.76rem; line-height: 1.45; color: #cbd5e1;">
            自軍の防衛ターゲットです。耐久値(HP)が 0 になると即座に敗北します。自軍コアを護りつつ、敵軍コアの撃破または敵ユニットの全滅を狙いましょう。
          </div>
        </div>
      `;
    } else if (isBarricade) {
      statsGridHtml = `
        <div class="hch-stats-grid hch-stats-single">
          <div class="hch-stat-box hch-hp-box">
            <div class="hch-stat-label-row">
              <span class="hch-stat-label">💚 耐久値</span>
              <span class="hch-stat-value"><strong>${hero.hp}</strong> / ${hero.maxHp} ${shieldVal > 0 ? `<span class="hch-shield-text">(+${shieldVal}🛡️)</span>` : ''}</span>
            </div>
            <div class="hch-hp-bar-bg">
              <div class="hch-hp-bar-fill" style="width: ${hpPct}%;"></div>
              ${shieldPct > 0 ? `<div class="hch-shield-bar-fill" style="width: ${shieldPct}%;"></div>` : ''}
            </div>
          </div>
        </div>
      `;
      featureCardHtml = `
        <div class="passive-ability-card">
          <div class="pac-header">
            <div class="pac-title-wrap">
              <span class="pac-icon">🧱</span>
              <span class="pac-title">移動・射線遮断</span>
            </div>
          </div>
          <div class="pac-desc" style="font-size: 0.76rem; line-height: 1.45; color: #cbd5e1;">
            味方・敵双方の移動および直線射線を完全に遮断します。ベクターが隣接すると ATK+10 されます。
          </div>
        </div>
        ${canDestroyBarricade ? `
          <div class="action-card-btn acb-destroy-barricade" onclick="window.__onDestroyBarricade(${selectedPos.r}, ${selectedPos.c})">
            <div class="acb-header">
              <span class="acb-title">💥 防壁を破壊する</span>
              <span class="acb-badge badge-ready">即座に実行可能</span>
            </div>
            <div class="acb-desc">自軍ターン中にいつでも破壊可能（トークン消費なし）。通路を開放して味方を進軍させられます。</div>
          </div>
        ` : `<div class="odc-hint">※自軍ターン中に任意破壊が可能です</div>`}
      `;
    } else if (isTurret) {
      themeClass = 'theme-turret';
      statsGridHtml = `
        <div class="hch-stats-grid hch-stats-dual">
          <div class="hch-stat-box hch-hp-box">
            <div class="hch-stat-label-row">
              <span class="hch-stat-label">💚 耐久値</span>
              <span class="hch-stat-value"><strong>${hero.hp}</strong> / ${hero.maxHp} ${shieldVal > 0 ? `<span class="hch-shield-text">(+${shieldVal}🛡️)</span>` : ''}</span>
            </div>
            <div class="hch-hp-bar-bg">
              <div class="hch-hp-bar-fill" style="width: ${hpPct}%;"></div>
              ${shieldPct > 0 ? `<div class="hch-shield-bar-fill" style="width: ${shieldPct}%;"></div>` : ''}
            </div>
          </div>
          <div class="hch-stat-box hch-atk-box">
            <span class="hch-stat-label">⚔️ 迎撃ATK</span>
            <span class="hch-atk-number">${hero.atk || 10}</span>
          </div>
        </div>
      `;
      featureCardHtml = `
        <div class="passive-ability-card pac-active-glow">
          <div class="pac-header">
            <div class="pac-title-wrap">
              <span class="pac-icon">🗼</span>
              <span class="pac-title">自動迎撃</span>
            </div>
            <span class="pac-badge pac-badge-active">周囲8マス</span>
          </div>
          <div class="pac-desc" style="font-size: 0.76rem; line-height: 1.45; color: #cbd5e1;">
            自軍ターン終了時に周囲8マスのすべての敵ユニットに対して、自動で ${hero.atk || 10} DMG を迎撃射撃します。破壊されるとヴァルカンのタレットストックが1回復します。
          </div>
        </div>
      `;
    }

    panel.innerHTML = `
      <div class="hero-card-header ${themeClass}">
        <div class="hch-top-bar">
          <div class="hch-icon-box">${hero.icon}</div>
          <div class="hch-meta">
            <div class="hch-name-row">
              <span class="hch-name">${hero.name}</span>
              <span class="hch-owner-tag ${isLocalPlayer(hero.owner) ? 'p1' : 'p2'}">${isLocalPlayer(hero.owner) ? '自軍' : '敵軍'}</span>
              <span class="hch-class-badge ${classBadgeClass}">${classNameText}</span>
            </div>
          </div>
        </div>
        ${statsGridHtml}
      </div>
      ${featureCardHtml}
    `;
    return;
  }

  // ヒーロー（ユニット）の一体型アクションカード
  const skills = heroDef.skills || {};
  const effAtk = getEffectiveAtk(hero);
  const shield = getShieldVal(hero);

  const isSilenced = hasDebuff(hero, 'silence');
  const canSkillA = !isDeploy && !isEnemy && !isSilenced && (hero.stockA > 0);
  const ultReady = isUltReady(hero);
  const canUlt = !isDeploy && !isEnemy && !isSilenced && ultReady && !hero.ultUsed;

  const teamGauge = getTeamUltGauge(hero.owner);
  const ultPct = Math.min(100, (teamGauge / ULT_REQUIRED_DAMAGE) * 100);
  const hpPct = Math.max(0, Math.min(100, Math.round((hero.hp / hero.maxHp) * 100)));
  const shieldPct = shield > 0 ? Math.min(50, Math.round((shield / hero.maxHp) * 100)) : 0;
  const roleTheme = (heroDef.roleClass || '').replace('role-', '');
  const hazardOnUnit = getHazardInfoAt(selectedPos.r, selectedPos.c);

  let statusPillsHtml = '';
  if (hero.buffs) {
    if (hasBuff(hero, 'atk_up')) statusPillsHtml += `<span class="hch-pill buff" title="ATK+${hero.buffs.atk_up.val} (${hero.buffs.atk_up.turns}ターン)">🔥+${hero.buffs.atk_up.val} <small>${hero.buffs.atk_up.turns}T</small></span>`;
    if (hasBuff(hero, 'shield')) statusPillsHtml += `<span class="hch-pill buff" title="シールド+${hero.buffs.shield.val} (${hero.buffs.shield.turns}ターン)">🛡️+${hero.buffs.shield.val} <small>${hero.buffs.shield.turns}T</small></span>`;
    if (hasBuff(hero, 'shadow_drain')) statusPillsHtml += `<span class="hch-pill buff" title="シャドウ・ドレイン発動中: 与ダメージ分HP吸収 (${hero.buffs.shadow_drain.turns}ターン)">🩸ドレイン <small>${hero.buffs.shadow_drain.turns}T</small></span>`;
  }
  if (hero.debuffs) {
    if (hasDebuff(hero, 'vulnerable')) {
      const vTurns = hero.debuffs?.vulnerable?.turns;
      const vLabel = vTurns > 0 ? `${vTurns}T` : '滞在中';
      const vTitle = vTurns > 0 ? `弱体化: 被ダメ1.5倍 (${vTurns}ターン)` : '弱体化: 被ダメ1.5倍 (ディメンション・ゾーン滞在中)';
      statusPillsHtml += `<span class="hch-pill debuff" title="${vTitle}">🎯弱体 <small>${vLabel}</small></span>`;
    }
    if (hasDebuff(hero, 'disarm')) statusPillsHtml += `<span class="hch-pill debuff" title="攻撃阻害: 通常攻撃不可 (${hero.debuffs.disarm.turns}ターン)">💢阻害 <small>${hero.debuffs.disarm.turns}T</small></span>`;
    if (hasDebuff(hero, 'bind')) statusPillsHtml += `<span class="hch-pill debuff" title="行動阻害: 移動不可 (${hero.debuffs.bind.turns}ターン)">⛓️拘束 <small>${hero.debuffs.bind.turns}T</small></span>`;
    if (hasDebuff(hero, 'silence')) statusPillsHtml += `<span class="hch-pill debuff" title="スキル阻害: スキル使用不可 (${hero.debuffs.silence.turns}ターン)">🤐沈黙 <small>${hero.debuffs.silence.turns}T</small></span>`;
  }
  if (!statusPillsHtml) {
    statusPillsHtml = `<span class="hch-pill-none">なし (正常)</span>`;
  }

  const passive = heroDef.passive;
  let passiveLiveHtml = '';
  if (passive) {
    let isPassiveActive = false;
    let badgeText = '常時発動';

    if (typeof hero.isPassiveActive === 'function') {
      const pTokens = getPlayerTokens(hero.owner);
      const ctx = { board, playerTokens: { [hero.owner]: pTokens }, ROWS, COLS };
      isPassiveActive = hero.isPassiveActive(ctx);
      badgeText = (typeof hero.getPassiveStatusText === 'function') ? hero.getPassiveStatusText(ctx) : (isPassiveActive ? '発動中' : '未発動');
    } else if (hero.typeKey === 'KINESIS' || hero.typeKey === 'DUELIST') {
      const tokens = getPlayerTokens(hero.owner);
      isPassiveActive = tokens.some(t => t.type === 'move' && (t.scope === 'KINESIS' || t.scope === 'DUELIST') && !t.used);
      badgeText = isPassiveActive ? '✨ 移動可能' : '消費済';
    } else if (hero.typeKey === 'VECTOR' || hero.typeKey === 'SENTINEL') {
      isPassiveActive = isVectorBunkerActive(hero);
      badgeText = isPassiveActive ? '✨ 発動中 (ATK+10)' : '条件未達成';
    } else if (hero.typeKey === 'VULCAN') {
      isPassiveActive = isVulcanStockActive(hero);
      badgeText = isPassiveActive ? '✨ 発動中 (ATK+10)' : 'ストックなし';
    } else if (hero.typeKey === 'HIVE') {
      let bitCount = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const u = board[r][c];
          if (u && u.owner === hero.owner && u.typeKey === 'BIT') bitCount++;
        }
      }
      isPassiveActive = (bitCount > 0);
      badgeText = isPassiveActive ? `✨ 監視中 (${bitCount}機)` : 'ビット未展開';
    } else if (hero.typeKey === 'BIT') {
      const tokens = getPlayerTokens(hero.owner);
      isPassiveActive = tokens.some(t => t.type === 'attack' && t.scope === hero.id && !t.used);
      badgeText = isPassiveActive ? '✨ 自律攻撃可' : '消費済';
    }

    passiveLiveHtml = `
      <div class="passive-ability-card ${isPassiveActive ? 'pac-active-glow' : ''}">
        <div class="pac-header">
          <div class="pac-title-wrap">
            <span class="pac-icon">${passive.icon || '🔮'}</span>
            <span class="pac-title">パッシブ: ${passive.name}</span>
          </div>
          <span class="pac-badge ${isPassiveActive ? 'pac-badge-active' : ''}">${badgeText}</span>
        </div>
        <div class="pac-desc">${passive.desc}</div>
      </div>
    `;
  }

  panel.innerHTML = `
    <div class="hero-card-header theme-${roleTheme}">
      <div class="hch-top-bar">
        <div class="hch-icon-box">${hero.icon}</div>
        <div class="hch-meta">
          <div class="hch-name-row">
            <span class="hch-name">${hero.name}</span>
            <span class="hch-owner-tag ${isLocalPlayer(hero.owner) ? 'p1' : 'p2'}">${isLocalPlayer(hero.owner) ? '自軍' : '敵軍'}</span>
            <span class="hch-class-badge class-unit">ユニット</span>
            <span class="hch-role-badge ${heroDef.roleClass}">${heroDef.roleName}</span>
          </div>
        </div>
      </div>

      <div class="hch-stats-grid">
        <div class="hch-stat-box hch-hp-box">
          <div class="hch-stat-label-row">
            <span class="hch-stat-label">💚 HP</span>
            <span class="hch-stat-value"><strong>${hero.hp}</strong> / ${hero.maxHp} ${shield > 0 ? `<span class="hch-shield-text">(+${shield}🛡️)</span>` : ''}</span>
          </div>
          <div class="hch-hp-bar-bg">
            <div class="hch-hp-bar-fill" style="width: ${hpPct}%;"></div>
            ${shieldPct > 0 ? `<div class="hch-shield-bar-fill" style="width: ${shieldPct}%;"></div>` : ''}
          </div>
        </div>

        <div class="hch-stat-box hch-atk-box">
          <span class="hch-stat-label">⚔️ ATK</span>
          <span class="hch-atk-number">${effAtk}</span>
        </div>

        <div class="hch-stat-box hch-status-box">
          <span class="hch-stat-label">📊 状態効果</span>
          <div class="hch-status-pill-list">
            ${statusPillsHtml}
          </div>
        </div>
      </div>
    </div>

    ${hazardOnUnit ? `
      <div class="hazard-foot-simple" onclick="window.__onInspectHazardAt(${selectedPos.r}, ${selectedPos.c})" title="クリックしてハザード詳細を確認">
        <span class="hfs-icon">⚠️</span>
        <span class="hfs-text">足元ハザード: <strong>${hazardOnUnit.name}</strong></span>
      </div>
    ` : ''}

    ${passiveLiveHtml}

    <div class="skills-priority-section">
      <div class="action-card-list">
        ${skills.A ? `
          <div class="action-card-btn acb-skill-a ${commandMode === 'SKILL_A' ? 'active' : ''} ${!canSkillA ? 'disabled' : ''}"
               onclick="${canSkillA ? "setCommandMode('SKILL_A')" : ''}">
            <div class="acb-header">
              <span class="acb-title">⚡ スキル: ${skills.A.name}</span>
              <span class="acb-badge ${canSkillA ? 'badge-ready' : 'badge-used'}">
                ${isSilenced ? '🤐 スキル阻害中' : (hero.stockA <= 0 ? `ストック 0/${skills.A.maxStock}` : `ストック ${hero.stockA}/${skills.A.maxStock}`)}
              </span>
            </div>
            <div class="acb-desc">${skills.A.desc}</div>
          </div>
        ` : ''}

        ${skills.ULT ? `
          <div class="action-card-btn acb-ult ${commandMode === 'SKILL_ULT' ? 'active' : ''} ${!canUlt ? 'disabled' : ''} ${ultReady && !hero.ultUsed && !isEnemy ? 'ult-glow' : ''}"
               onclick="${canUlt ? "setCommandMode('SKILL_ULT')" : ''}">
            <div class="acb-header">
              <span class="acb-title">🌟 アルティメット: ${skills.ULT.name}</span>
              <span class="acb-badge ${hero.ultUsed ? 'badge-used' : (isSilenced ? 'badge-used' : (ultReady ? (isEnemy ? 'badge-enemy-ult' : 'badge-ult-ready') : 'badge-standby'))}">
                ${hero.ultUsed ? 'ストック 0/1' : (isSilenced ? '🤐 スキル阻害中' : (ultReady ? (isEnemy ? '⚠️ 敵アルティメット (ストック 1/1)' : 'ストック 1/1 (発動可能)') : 'ストック 1/1'))}
              </span>
            </div>
            <div class="ult-progress-bar-bg">
              <div class="ult-progress-bar-fill" style="width: ${ultPct}%;"></div>
            </div>
            <div class="acb-desc">${skills.ULT.desc}</div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// ダメージ・効果ポップアップ表示
export function showDamagePopup(r, c, text, color = '#ff3333') {
  const tile = tileElements[r]?.[c];
  if (!tile) return;

  const popup = document.createElement('div');
  popup.className = 'damage-popup';
  popup.innerText = text;
  popup.style.color = color;
  tile.appendChild(popup);

  setTimeout(() => popup.remove(), 900);
}

// ハザード効果トーストポップアップ
export function showHazardToast(r, c, hazard) {
  const tile = tileElements[r]?.[c];
  if (!tile) return;

  const oldToast = tile.querySelector('.hazard-popup');
  if (oldToast) oldToast.remove();

  const toast = document.createElement('div');
  toast.className = 'hazard-popup';
  toast.innerHTML = `
    <div class="hp-header">
      <span class="hp-icon">${hazard.icon}</span>
      <span class="hp-name">${hazard.name}</span>
    </div>
    <div class="hp-desc">${hazard.desc}</div>
  `;
  tile.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 2800);
}

// ログ出力
export function addLog(text, type = 'system') {
  const box = document.getElementById('log-box');
  if (!box) return;
  const raw = String(text ?? '');
  const isUlt = type === 'skill' && (raw.includes('ウルト') || raw.includes('ULT'));
  const kind = isUlt
    ? 'ult'
    : type === 'damage'
      ? 'attack'
      : type === 'skill'
        ? 'skill'
        : type === 'p1'
          ? (raw.includes('攻撃') ? 'attack' : 'move')
          : type === 'p2'
            ? (raw.includes('攻撃') ? 'attack' : 'move')
            : (raw.includes('DMG') || raw.includes('爆発') ? 'attack' : 'system');

  const badgeLabel = isUlt
    ? 'ULT'
    : type === 'damage'
      ? 'COMBAT'
      : type === 'skill'
        ? 'SKILL'
        : type === 'p1'
          ? (isLocalPlayer('P1') ? 'ALLY' : 'ENEMY')
          : type === 'p2'
            ? (isLocalPlayer('P2') ? 'ALLY' : 'ENEMY')
            : 'SYSTEM';

  const turnBadgeText = (document.getElementById('turn-count-badge')?.innerText || '01').trim();
  const cleanTurn = turnBadgeText.replace(/[<>&"']/g, '');
  const groupKey = cleanTurn;
  const groupTitle = cleanTurn === 'DR'
    ? 'DRAFT PHASE'
    : cleanTurn === 'DP'
      ? 'DEPLOY PHASE'
      : `TURN ${cleanTurn}`;

  let group = box.firstElementChild;
  if (!group || !group.classList.contains('ar-log-group') || group.dataset.turn !== groupKey) {
    group = document.createElement('section');
    group.className = 'ar-log-group';
    group.dataset.turn = groupKey;
    group.innerHTML = `<div class="ar-log-turn">${groupTitle}</div><div class="ar-log-rows"></div>`;
    box.prepend(group);
  }

  const rowsWrap = group.querySelector('.ar-log-rows') || group;
  const entry = document.createElement('div');
  entry.className = `ar-log-row log-entry log-${type}`;
  entry.dataset.kind = kind;

  const escaped = raw.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const highlighted = escaped
    .replace(/(\d+\s*DMG|\d+\s*ダメージ)/g, '<b class="dmg">$1</b>')
    .replace(/(HP\s*\+\d+(?:\s*回復)?|HPを\s*\d+\s*(?:大)?回復)/g, '<b class="heal">$1</b>')
    .replace(/(シールド\s*(?:増強)?\s*(?:\([^)]+\)|\+\d+)|ATK\s*\d+\s*➔\s*\d+)/g, '<b class="buff">$1</b>');

  entry.innerHTML = `<span class="ar-log-kind">${badgeLabel}</span><p>${highlighted}</p>`;
  rowsWrap.prepend(entry);

  const scroller = box.closest('.ar-log-scroll') || box;
  scroller.scrollTop = 0;
}

// 勝利モーダル（Viewer-Relative: 自軍勝利=Yellow, 敵軍勝利=Red）
export function showGameOverModal(winner, reason = 'core', myRole = null, gameMode = 'pve') {
  const modal = document.getElementById('victory-modal');
  const title = document.getElementById('winner-title');
  const desc = document.getElementById('winner-desc');
  if (!modal || !title || !desc) return;

  const isWipeout = (reason === 'wipeout');
  const isViewerWin = myRole ? (winner === myRole) : isLocalPlayer(winner);

  if (gameMode === 'local') {
    title.innerText = `${winner} VICTORY!`;
    title.style.color = isViewerWin ? 'var(--lime)' : 'var(--orange)';
    desc.innerText = isWipeout
      ? `${winner} が敵ユニットの全滅に成功しました！`
      : `${winner} が敵コアの完全破壊に成功しました！`;
  } else if (isViewerWin) {
    title.innerText = 'VICTORY!';
    title.style.color = 'var(--lime)';
    desc.innerText = isWipeout
      ? '敵ユニットの全滅に成功しました！自軍の勝利！'
      : '敵コアの完全破壊に成功しました！自軍の勝利！';
  } else {
    title.innerText = 'DEFEAT...';
    title.style.color = 'var(--orange)';
    desc.innerText = isWipeout
      ? '自軍ユニットが全滅しました...敗北...'
      : '自軍コアが破壊されました...敗北...';
  }

  modal.classList.add('active');
}

// 初期配置フェーズのオンライン待機パネル描画
export function renderDeployPanel({
  gamePhase,
  gameMode = 'pve',
  myOnlineRole = null
}) {
  const panel = document.getElementById('unit-detail-panel');
  if (!panel || gameMode !== 'online') return;

  if (gamePhase === 'DEPLOY_WAIT_P1' || (gamePhase === 'DEPLOY_P1' && myOnlineRole === 'P2')) {
    panel.innerHTML = `
      <div class="deploy-panel">
        <div class="deploy-header-banner is-enemy">
          <div class="deploy-title">⏳ 先行プレイヤーの初期配置を待機中</div>
          <div class="deploy-desc">
            ルールに基づき、後攻プレイヤーは先行の初期配置を視認した状態で対抗配置を行います。<br>
            先行プレイヤーの配置完了をお待ちください...
          </div>
          <div class="deploy-waiting-banner">
            <span class="deploy-waiting-spinner">⏳</span>
            <span>先行プレイヤーが初期配置中...</span>
          </div>
        </div>
      </div>
    `;
    return;
  }

  if (gamePhase === 'DEPLOY_WAIT_P2' || (gamePhase === 'DEPLOY_P2' && myOnlineRole === 'P1')) {
    panel.innerHTML = `
      <div class="deploy-panel">
        <div class="deploy-header-banner is-enemy">
          <div class="deploy-title">⏳ 後攻プレイヤーの初期配置を待機中</div>
          <div class="deploy-desc">
            あなたの初期配置が完了し相手へ送信されました。<br>
            後攻プレイヤーの対抗配置が完了すると、自動的にバトルが開戦します...
          </div>
          <div class="deploy-waiting-banner">
            <span class="deploy-waiting-spinner">⏳</span>
            <span>後攻プレイヤーが対抗初期配置中...</span>
          </div>
        </div>
      </div>
    `;
  }
}

// キャラクターピック画面の描画
export function renderPickModal({
  currentOwner = 'P1',
  selectedHeroes = [],
  myPickConfirmed = false,
  isOnline = false
}) {
  const cardsGrid = document.getElementById('pick-cards-grid');
  const slotsContainer = document.getElementById('draft-slots-container');
  const counterBadge = document.getElementById('draft-counter-badge');
  const confirmBtn = document.getElementById('pick-confirm-btn');

  if (!cardsGrid) return;

  const selCount = selectedHeroes.length;
  const isEnemyPicker = !isLocalPlayer(currentOwner);
  const ownerClass = isEnemyPicker ? 'p2' : 'p1';

  if (slotsContainer) {
    let slotsHtml = '';
    for (let i = 0; i < 5; i++) {
      const heroKey = selectedHeroes[i];
      if (heroKey) {
        const hero = HERO_TYPES[heroKey];
        slotsHtml += `
          <div class="draft-slot filled ${ownerClass}">
            <div class="draft-slot-icon">${characterArt(heroKey, currentOwner, hero.name)}</div>
            <div class="draft-slot-info">
              <div class="draft-slot-name">${hero.name}</div>
              <div class="draft-slot-role">${hero.roleName}</div>
            </div>
            ${!myPickConfirmed ? `<button class="draft-slot-remove" onclick="event.stopPropagation(); window.__onTogglePickHero('${heroKey}')" title="選択解除">✕</button>` : ''}
          </div>
        `;
      } else {
        slotsHtml += `
          <div class="draft-slot">
            <div class="draft-slot-empty">SLOT 0${i + 1}</div>
          </div>
        `;
      }
    }
    slotsContainer.innerHTML = slotsHtml;
  }

  if (counterBadge) {
    counterBadge.innerText = `${selCount} / 5 AGENTS`;
    counterBadge.classList.toggle('ready', selCount === 5);
  }

  if (confirmBtn) {
    if (isOnline && myPickConfirmed) {
      confirmBtn.disabled = true;
      confirmBtn.className = 'pick-btn-confirm waiting';
      confirmBtn.innerHTML = `<span>WAITING FOR OPPONENT...</span>`;
    } else {
      confirmBtn.disabled = (selCount !== 5);
      confirmBtn.className = 'pick-btn-confirm';
      confirmBtn.innerHTML = (selCount === 5)
        ? `<span>DEPLOY SQUAD // 出撃配置へ ➔</span>`
        : `<span>SELECT ${5 - selCount} MORE AGENT${5 - selCount === 1 ? '' : 'S'}</span>`;
    }
  }

  let cardsHtml = '';
  const slotNum = (key) => {
    const idx = selectedHeroes.indexOf(key);
    return idx >= 0 ? `0${idx + 1}` : '';
  };

  for (const key of SELECTABLE_HERO_KEYS) {
    const hero = HERO_TYPES[key];
    const isSelected = selectedHeroes.includes(key);
    const skills = hero.skills || {};

    cardsHtml += `
      <div class="pick-card ${isSelected ? 'selected ' + ownerClass : ''} ${myPickConfirmed ? 'disabled-pick' : ''}"
           onclick="${myPickConfirmed ? '' : `window.__onTogglePickHero('${key}')`}">
        <div class="pick-card-check">${isSelected ? slotNum(key) : '+'}</div>
        <div class="pick-card-top">
          <div class="pick-card-icon">${characterArt(key, currentOwner, hero.name)}</div>
          <div class="pick-card-identity">
            <span class="pick-card-code">${key}</span>
            <div class="pick-card-name">${hero.name}</div>
            <div class="pick-card-role-pill ${hero.roleClass}">${icon(roleIcon({ typeKey: key, roleName: hero.roleName }))}<span>${hero.roleName}</span></div>
          </div>
        </div>

        <div class="pick-card-stats">
          <span class="pcs-hp">${icon('hp')}<b>HP ${hero.maxHp}</b></span>
          <span class="pcs-atk">${icon('attack')}<b>ATK ${hero.atk}</b></span>
        </div>

        <div class="pick-card-skills-summary">
          ${hero.passive ? `
            <div class="pick-card-skill-line pick-card-passive-line">
              <span class="pcs-tag passive">PASSIVE</span>
              <strong>${hero.passive.name}</strong>
              <small>${hero.passive.desc}</small>
            </div>
          ` : ''}
          <div class="pick-card-skill-line">
            <span class="pcs-tag skill">SKILL</span>
            <strong>${skills.A ? skills.A.name : '-'}</strong>
            <small>${skills.A ? skills.A.desc : ''}</small>
          </div>
          <div class="pick-card-skill-line">
            <span class="pcs-tag ult">ULT</span>
            <strong>${skills.ULT ? skills.ULT.name : '-'}</strong>
            <small>${skills.ULT ? skills.ULT.desc : ''}</small>
          </div>
        </div>
      </div>
    `;
  }

  cardsGrid.innerHTML = cardsHtml;
}

// ルール解説モーダルの開閉
window.__toggleRulesModal = (isOpen) => {
  const modal = document.getElementById('rules-modal');
  if (modal) {
    modal.classList.toggle('active', !!isOpen);
  }
};
