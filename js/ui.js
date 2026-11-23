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
  hasActionOrder,
  isWardenBunkerActive,
  isVulcanStockActive,
  getPlayerOrders,
  isLocalPlayer,
  isUnit
} from './board.js?v=urban-v1';

import { characterArt, renderUrbanHero, icon, roleIcon, roleKey, floorGraphicHtml, getSkillPreviewTargets, getUltPreviewTargets, isHealSkillHero, getBoardMarks } from './urban-ui.js?v=urban-v13';

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
          if (selHeroGlobal.typeKey === 'SMOG') tile.classList.add('is-toxic-ult');
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
      const trapName = trap?.type === 'TOXIC_MINE' ? 'トキシック・マイン' : 'ブラスト・マイン';
      if (hasVisibleTrap) {
        tile.classList.add('has-trap-ally');
        tile.title = `${trapName}（自軍のみ視認可能）`;
      }

      const fz = phantomZones.find(z => z.r === r && z.c === c);
      const pzn = poisonZones.find(z => z.r === r && z.c === c);

      if (fz) {
        tile.classList.add('has-hazard', 'phantom-zone', isLocalPlayer(fz.owner) ? 'hazard-owner-ally' : 'hazard-owner-enemy');
        tile.title = `👻 ディメンション・ゾーン (${isLocalPlayer(fz.owner) ? '自軍' : '敵軍'} / 侵入中は常に弱体化1.5倍 / ヴェイル撃破で消滅)`;
      } else if (pzn) {
        tile.classList.add('has-hazard', 'poison-zone', isLocalPlayer(pzn.owner) ? 'hazard-owner-ally' : 'hazard-owner-enemy');
        tile.title = `🧪 トキシック・ゾーン (${isLocalPlayer(pzn.owner) ? '自軍' : '敵軍'} / ターン開始時10DMG / スモッグ撃破で消滅)`;
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

      const mineOverlay = tile.querySelector('.tile-mine-overlay');
      if (hasVisibleTrap && (pzn || fz)) {
        tile.title += ` / ${trapName}（自軍のみ視認可能）`;
        if (!mineOverlay) {
          const badge = document.createElement('span');
          badge.className = 'tile-mine-overlay';
          badge.innerHTML = icon('hz_mine');
          tile.appendChild(badge);
        }
      } else {
        mineOverlay?.remove();
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
        const marks = getBoardMarks(unit);
        const markNames = marks.map(mark => mark.name).join('、');
        tile.setAttribute('aria-label', `${'ABCDEFG'[c]}${7 - r} ${unit.name} HP ${unit.hp}/${unit.maxHp}${markNames ? ` ${markNames}` : ''}`);
        if (unit.typeKey === 'ANCHOR') pieceEl.classList.add('core');

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
        const faceHtml = unit.typeKey === 'ANCHOR'
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
            <span class="piece-name-row">
              <span class="piece-name">${unit.name}</span>
              ${marks.map(mark => `<span class="piece-mark-icon" title="${mark.name}" style="--mark-color:${mark.color}">${icon(mark.icon)}</span>`).join('')}
            </span>
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

// 物体化行動オーダーバーの更新（ORDERS 案A: 2列スロット + EX帯）
export function updateRightsDisplay(turn, selectedPos = null, gamePhase = 'BATTLE') {
  const container = document.getElementById('action-tokens-container');
  const tokenBanner = document.getElementById('action-status-banner');
  if (!container) return;

  const isNonBattle = Boolean(gamePhase && (gamePhase.startsWith('DEPLOY') || gamePhase.startsWith('PICK')));
  const tokens = isNonBattle ? [] : (getPlayerOrders(turn) || []);
  const ordered = [...tokens].sort((a, b) =>
    Number(a.scope !== 'all') - Number(b.scope !== 'all') ||
    Number(a.type === 'move') - Number(b.type === 'move'));
  tokenBanner?.classList.toggle('enemy-turn', !isLocalPlayer(turn));
  const title = tokenBanner?.querySelector('.tokens-banner-title');
  if (title) title.dataset.ready = ` ${ordered.filter(order => !order.used).length}/${ordered.length}`.trim();
  container.innerHTML = ordered.map(order => {
    const move = order.type === 'move';
    const exclusive = order.scope !== 'all';
    const label = ` ${exclusive ? 'EX ' : ''}${move ? 'MOVE' : 'ATK'}`.trim();
    return `<span class="turn-token ${move ? 'is-move' : 'is-atk'} ${exclusive ? 'special is-ex' : ''} ${order.used ? 'is-used' : ''}"
      aria-label="${label} ${order.used ? '使用済み' : '使用可能'}">
      <span class="tk-def-ico">${icon(order.type)}</span><strong class="tk-def-lbl">${label}</strong>
      ${exclusive ? `<small>${order.unitName}</small>` : ''}
    </span>`;
  }).join('');
}

// アンカーHP & チームウルト & ターン表示の更新（Viewer-Relative: 自軍=下/Yellow, 敵軍=上/Red）
export function updateStatus(turn, gameMode, gamePhase = 'BATTLE', turnCount = 1) {
  const allyOwner = isLocalPlayer('P1') ? 'P1' : 'P2';
  const enemyOwner = allyOwner === 'P1' ? 'P2' : 'P1';

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

  const turnDisplay = document.getElementById('turn-display-box');
  const activeOwner = (
    gamePhase === 'PICK_P1' || gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_WAIT_P1'
  ) ? 'P1' : (
    gamePhase === 'PICK_P2' || gamePhase === 'DEPLOY_P2' || gamePhase === 'DEPLOY_WAIT_P2'
  ) ? 'P2' : turn;
  const isEnemyActive = !isLocalPlayer(activeOwner);

  if (turnDisplay) {
    turnDisplay.classList.toggle('enemy-turn', isEnemyActive);
    const phaseLabel = gamePhase.startsWith('DEPLOY') ? '配置' : gamePhase.startsWith('PICK') ? '編成' : `ターン ${turnCountEl.textContent}`;
    turnDisplay.setAttribute('aria-label', `${phaseLabel}、${isEnemyActive ? '敵軍' : '自軍'}`);
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
      descEl.innerText = '手前2マスに味方ユニットとアンカーを配置してください。完了したら長押しで配置を確定してください。';
    } else {
      descEl.innerText = '先行の布陣を確認し、対抗初期配置を完了したら長押しで配置を確定してください。';
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
        setContent('LOCK ANCHOR', sub, 'check');
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
  const isAnchorUnit = (hero.typeKey === 'ANCHOR');
  const isBarricade = (hero.typeKey === 'BARRICADE');
  const isTurret = (hero.typeKey === 'TURRET');

  // アンカー・オブジェクト選択時のカード
  if (isAnchorUnit || isBarricade || isTurret) {
    const shieldVal = getShieldVal(hero);
    const hpPct = Math.max(0, Math.min(100, Math.round((hero.hp / hero.maxHp) * 100)));
    const shieldPct = shieldVal > 0 ? Math.min(50, Math.round((shieldVal / hero.maxHp) * 100)) : 0;
    const canDestroyBarricade = isBarricade && !isEnemy;

    let themeClass = 'theme-structure';
    let classNameText = 'オブジェクト';
    let classBadgeClass = 'class-structure';
    let statsGridHtml = '';
    let featureCardHtml = '';

    if (isAnchorUnit) {
      themeClass = 'theme-core';
      classNameText = 'アンカー';
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
              <span class="pac-title">アンカー破壊で決着</span>
            </div>
          </div>
          <div class="pac-desc" style="font-size: 0.76rem; line-height: 1.45; color: #cbd5e1;">
            自軍の防衛ターゲットです。耐久値(HP)が 0 になると即座に敗北します。自軍アンカーを護りつつ、敵軍アンカーの撃破または敵ユニットの全滅を狙いましょう。
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
            味方・敵双方の移動および直線射線を完全に遮断します。ウォーデンが隣接すると ATK+5 されます。
          </div>
        </div>
        ${canDestroyBarricade ? `
          <div class="action-card-btn acb-destroy-barricade" onclick="window.__onDestroyBarricade(${selectedPos.r}, ${selectedPos.c})">
            <div class="acb-header">
              <span class="acb-title">💥 防壁を破壊する</span>
              <span class="acb-badge badge-ready">即座に実行可能</span>
            </div>
            <div class="acb-desc">自軍ターン中にいつでも破壊可能（オーダー消費なし）。通路を開放して味方を進軍させられます。</div>
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
      const pTokens = getPlayerOrders(hero.owner);
      const ctx = { board, playerOrders: { [hero.owner]: pTokens }, ROWS, COLS };
      isPassiveActive = hero.isPassiveActive(ctx);
      badgeText = (typeof hero.getPassiveStatusText === 'function') ? hero.getPassiveStatusText(ctx) : (isPassiveActive ? '発動中' : '未発動');
    } else if (hero.typeKey === 'KINESIS' || hero.typeKey === 'DUELIST') {
      const tokens = getPlayerOrders(hero.owner);
      isPassiveActive = tokens.some(t => t.type === 'move' && (t.scope === 'KINESIS' || t.scope === 'DUELIST') && !t.used);
      badgeText = isPassiveActive ? '✨ 移動可能' : '消費済';
    } else if (hero.typeKey === 'WARDEN' || hero.typeKey === 'SENTINEL') {
      isPassiveActive = isWardenBunkerActive(hero);
      badgeText = isPassiveActive ? '✨ 発動中 (ATK+5)' : '条件未達成';
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
      const tokens = getPlayerOrders(hero.owner);
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
export function showGameOverModal(winner, reason = 'anchor', myRole = null, gameMode = 'pve') {
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
      : `${winner} が敵アンカーの完全破壊に成功しました！`;
  } else if (isViewerWin) {
    title.innerText = 'VICTORY!';
    title.style.color = 'var(--lime)';
    desc.innerText = isWipeout
      ? '敵ユニットの全滅に成功しました！自軍の勝利！'
      : '敵アンカーの完全破壊に成功しました！自軍の勝利！';
  } else {
    title.innerText = 'DEFEAT...';
    title.style.color = 'var(--orange)';
    desc.innerText = isWipeout
      ? '自軍ユニットが全滅しました...敗北...'
      : '自軍アンカーが破壊されました...敗北...';
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
const lobbyQuotes = {
  KINESIS: '「ラプス内の速度なら、誰にも負けねえよ。いつでも出撃できるぜ、オブザーバー。」',
  VEIL: '「……向こうの世界線にも、同じ影が立っているはずだ。観測を続けよう。」',
  BLAST: '「白黒の区画なんて退屈だろ？派手に火花を散らしてこじ開けてやるよ！」',
  WARDEN: '「どんな異常領域でも、アンカーと仲間は俺が守り抜く。展開準備はできている。」',
  VULCAN: '「うちのタレット共の照準はバッチリさ。あんたは後ろで指揮に集中しな。」',
  SMOG: '「報酬に見合う仕事だ。境界線が毒で染まっても、俺のせいじゃないぜ。」',
  GLITCH: '「座標バグらせて跳ぶの、案外クセになるんだよね〜。準備できたら呼んで？」',
  PRISM: '「ノイズの波長がズレてきたな……。次の干渉、そろそろ始まるぞ。」',
  HIVE: '「群制御AIの同期率は99.8%。盤面はまるごとシミュレーション通りですよ。」',
  LILY: '「無茶をして怪我をしたらすぐ戻ってくださいね。ナノ医療パックは満タンです。」',
  NEXUS: '「……あー、アンカーとの並列接続は通ってる。あんたの指示待ちなんだけど。」',
  HALO: '「少しだけ深呼吸しましょう。……大丈夫、あなたの声は現場まで届いています。」',
};

export function initHomeView() {
  const root = document.getElementById('home-screen-view');
  if (!root) return;
  let lobbyIndex = 0;
  root.innerHTML = `
    <header class="hm-topbar">
      <div class="hm-glass hm-profile-pill">
        <div class="hm-avatar-ring"></div>
        <div class="hm-profile-meta">
          <div class="hm-profile-top"><strong class="hm-profile-name">OBSERVER</strong></div>
          <div class="hm-profile-sub"><span>MONOLITH DIVISION</span></div>
        </div>
      </div>
      <div class="hm-top-right">
        <div class="hm-glass hm-resource-pill"><i class="hm-res-dot"></i><span class="hm-res-lbl">UNIT ROSTER</span><strong class="hm-res-val">${SELECTABLE_HERO_KEYS.length}</strong></div>
        <button type="button" class="hm-glass hm-util-btn" onclick="window.__toggleRulesModal(true)" aria-label="ルール解説">${icon('help')}</button>
      </div>
    </header>
    <nav class="hm-side-rail" aria-label="ホームメニュー">
      <button type="button" class="hm-glass hm-rail-btn is-highlight" onclick="window.__startPvEMode()">${icon('assault')}<span>部隊編成</span></button>
      <button type="button" class="hm-glass hm-rail-btn" onclick="window.__toggleRulesModal(true)">${icon('help')}<span>戦術資料</span></button>
      <button type="button" class="hm-glass hm-rail-btn" data-lobby-step="1">${icon('move')}<span>看板交代</span></button>
    </nav>
    <section class="hm-showcase" aria-label="看板ユニット">
      <div class="hm-reticle-bg" aria-hidden="true"><div class="hm-reticle-ring"></div></div>
      <div class="hm-watermark" aria-hidden="true"><span>MONOLITH // LAPSE</span><strong></strong></div>
      <div class="hm-hero-art-wrap"></div>
      <div class="hm-dialogue-dock">
        <div class="hm-glass hm-dialogue-card" aria-live="polite">
          <div class="hm-dialogue-head"><div class="hm-char-tag-row"></div><span class="hm-char-code"></span></div>
          <p class="hm-quote"></p>
        </div>
        <div class="hm-glass hm-switcher-pill" aria-label="看板ユニット切り替え">
          <button type="button" class="hm-sw-btn" data-lobby-step="-1" aria-label="前の隊員">◀</button>
          <span class="hm-sw-label"></span>
          <button type="button" class="hm-sw-btn" data-lobby-step="1" aria-label="次の隊員">▶</button>
        </div>
      </div>
    </section>
    <section class="hm-command-deck" aria-label="対戦モード選択">
      <button id="btn-title-pve" type="button" class="hm-glass hm-mode-btn is-solo" onclick="window.__startPvEMode()">
        <div class="hm-mode-copy"><small>SOLO MODE</small><strong>ソロモード</strong></div><span class="hm-mode-arrow" aria-hidden="true">➔</span>
      </button>
      <button id="btn-title-online" type="button" class="hm-glass hm-mode-btn is-online" onclick="window.__startOnlineFromTitle()">
        <div class="hm-mode-copy"><small>NETWORK MATCH</small><strong>ネット対戦</strong></div><span class="hm-mode-arrow" aria-hidden="true">➔</span>
      </button>
    </section>`;

  function updateShowcase() {
    const key = SELECTABLE_HERO_KEYS[lobbyIndex];
    const unit = HERO_TYPES[key];
    const art = characterArt(key, 'P1', unit.name);
    root.querySelector('.hm-hero-art-wrap').innerHTML = art;
    root.querySelector('.hm-avatar-ring').innerHTML = art;
    root.querySelector('.hm-watermark strong').textContent = key;
    root.querySelector('.hm-char-code').textContent = key;
    root.querySelector('.hm-char-tag-row').innerHTML = `
      <span class="hm-char-role-pill">${icon(roleIcon({ typeKey: key, role: unit.role }))}<span>${unit.roleName}</span></span>
      <strong class="hm-char-name">${unit.name}</strong>`;
    root.querySelector('.hm-quote').textContent = lobbyQuotes[key];
    root.querySelector('.hm-sw-label').textContent = ` ${String(lobbyIndex + 1).padStart(2, '0')} / ${SELECTABLE_HERO_KEYS.length}`.trim();
  }
  for (const button of root.querySelectorAll('[data-lobby-step]')) {
    button.addEventListener('click', () => {
      const size = SELECTABLE_HERO_KEYS.length;
      lobbyIndex = (lobbyIndex + Number(button.dataset.lobbyStep) + size) % size;
      updateShowcase();
    });
  }
  updateShowcase();
}

const draftRoles = ['ASSAULT', 'SENTINEL', 'DISRUPTOR', 'SUPPORT'];
let draftRole = 'ALL';
let draftFocus = SELECTABLE_HERO_KEYS[0];

export function resetDraftView() {
  draftRole = 'ALL';
  draftFocus = SELECTABLE_HERO_KEYS[0];
}

export function renderPickModal({ currentOwner = 'P1', selectedHeroes = [], myPickConfirmed = false, isOnline = false }) {
  const root = document.getElementById('screen-pick');
  const cards = document.getElementById('pick-cards-grid');
  const slots = document.getElementById('draft-slots-container');
  const confirm = document.getElementById('pick-confirm-btn');
  const visible = SELECTABLE_HERO_KEYS.filter(key => draftRole === 'ALL' || HERO_TYPES[key].role === draftRole);
  const count = selectedHeroes.length;
  const waiting = isOnline && myPickConfirmed;
  const full = count === 5;

  const focusedControl = root.contains(document.activeElement) ? document.activeElement.dataset : null;
  document.getElementById('draft-counter-badge').textContent = ` ${count} / 5`.trim();
  document.getElementById('draft-counter-badge').classList.toggle('is-incomplete', !full);
  confirm.disabled = !full || waiting;
  document.getElementById('deploy-main-text').textContent = waiting ? '相手の編成を待機中' : '出撃開始';
  document.getElementById('deploy-sub-text').textContent = waiting ? 'WAITING FOR OPPONENT' : full ? '長押しで確定' : `あと ${5 - count} 体選択`;
  document.getElementById('pick-auto').disabled = waiting;
  document.getElementById('pick-clear').disabled = waiting || count === 0;

  document.getElementById('pick-role-mix').innerHTML = draftRoles.map(role => {
    const number = selectedHeroes.filter(key => HERO_TYPES[key].role === role).length;
    return `<span class="sel-mix-chip ${number ? 'is-nonzero' : ''}">${role}<b>${number}</b></span>`;
  }).join('');

  slots.innerHTML = Array.from({ length: 5 }, (_, index) => {
    const key = selectedHeroes[index];
    const unit = HERO_TYPES[key];
    const label = `<span class="sel-slot-num">SLOT 0${index + 1}</span>`;
    if (!unit) return `<div class="sel-slot is-empty">${label}<div class="sel-slot-empty-copy"><strong>UNASSIGNED</strong><span>下のユニット一覧から選択</span></div></div>`;
    return `<div class="sel-slot ${draftFocus === key ? 'is-focused' : ''}" data-role="${unit.role}">
      ${label}
      <button type="button" class="sel-slot-focus" data-pick-focus="${key}" aria-label="${unit.name}の詳細"></button>
      ${waiting ? '' : `<button type="button" class="sel-slot-remove" data-pick-toggle="${key}" aria-label="${unit.name}を編成から外す">×</button>`}
      <div class="sel-slot-face">${characterArt(key, currentOwner, unit.name)}</div>
      <div class="sel-slot-info">
        <span class="sel-slot-role"><i class="sel-slot-role-dot"></i>${unit.roleName}</span>
        <strong class="sel-slot-name">${unit.name}</strong>
        <div class="sel-slot-stats"><b>HP ${unit.maxHp}</b><span>ATK ${unit.atk}</span></div>
      </div></div>`;
  }).join('');

  document.getElementById('pick-role-filters').innerHTML = ['ALL', ...draftRoles].map(role => {
    const number = role === 'ALL' ? SELECTABLE_HERO_KEYS.length : SELECTABLE_HERO_KEYS.filter(key => HERO_TYPES[key].role === role).length;
    return `<button type="button" class="ar-filter-btn ${role === draftRole ? 'is-active' : ''}" aria-pressed="${role === draftRole}" data-pick-role="${role}">${role} (${number})</button>`;
  }).join('');

  cards.innerHTML = visible.map(key => {
    const unit = HERO_TYPES[key];
    const assigned = selectedHeroes.includes(key);
    const focused = key === draftFocus;
    return `<article class="sel-unit-tile ${focused ? 'is-focused' : ''} ${assigned ? 'is-in-squad' : ''}">
      <div class="sel-tile-top"><span class="sel-tile-role-lbl">${unit.roleName}</span></div>
      <button type="button" class="sel-piece-stage" data-pick-focus="${key}" aria-label="${unit.name}の詳細" aria-pressed="${focused}">
        <span class="piece unit ally" data-role="${unit.role}">
          <span class="piece-face">${characterArt(key, currentOwner, unit.name)}</span>
          <span class="piece-role">${icon(roleIcon({ typeKey: key, role: unit.role }))}</span>
          <span class="piece-readout">
            <svg class="piece-dock-svg" viewBox="0 0 80 35" preserveAspectRatio="none" aria-hidden="true"><path d="M 4,2 L 28,2 Q 30,2 30.8,4 L 33.2,15 Q 34,17 36,17 L 54,17 Q 56,17 56.8,15 L 58.8,5.5 Q 59.6,3.5 61.6,3.5 L 76,3.5 Q 79,3.5 79,6.5 L 79,30 Q 79,34 75,34 L 5,34 Q 1,34 1,30 L 1,5 Q 1,2 4,2 Z"/></svg>
            <span class="piece-values"><b>${unit.maxHp}</b><span>${unit.atk}</span></span>
            <span class="piece-hp-track"><i style="width:100%"></i></span>
            <span class="piece-name">${unit.name}</span>
          </span>
        </span>
      </button>
      <div class="sel-tile-foot"><button type="button" class="sel-tile-toggle ${assigned ? 'is-in' : ''}" data-pick-toggle="${key}" aria-label="${unit.name}を${assigned ? '編成から外す' : '編成に追加'}" aria-pressed="${assigned}" ${waiting || (full && !assigned) ? 'disabled' : ''}>${assigned ? '編成中' : '+ 編成'}</button></div>
    </article>`;
  }).join('');

  root.onclick = event => {
    const control = event.target.closest('[data-pick-role], [data-pick-focus], [data-pick-toggle]');
    if (!control) return;
    const { pickRole, pickFocus, pickToggle } = control.dataset;
    if (pickToggle) {
      draftFocus = pickToggle;
      window.__onTogglePickHero(pickToggle);
      return;
    }
    if (pickRole) {
      draftRole = pickRole;
      if (draftRole !== 'ALL' && HERO_TYPES[draftFocus].role !== draftRole) {
        draftFocus = SELECTABLE_HERO_KEYS.find(key => HERO_TYPES[key].role === draftRole);
      }
    } else {
      draftFocus = pickFocus;
    }
    renderPickModal({ currentOwner, selectedHeroes, myPickConfirmed, isOnline });
  };

  if (focusedControl) {
    const focus = [...root.querySelectorAll('[data-pick-role], [data-pick-focus], [data-pick-toggle]')].find(el =>
      Object.keys(focusedControl).some(key => el.dataset[key] === focusedControl[key]));
    focus?.focus({ preventScroll: true });
  }
  if (root.classList.contains('active')) {
    document.getElementById('urban-tab-details').click();
    renderUrbanHero({ turn: currentOwner, draftKey: draftFocus, gamePhase: 'PICK' });
  }
}

// ルール解説モーダルの開閉
window.__toggleRulesModal = (isOpen) => {
  const modal = document.getElementById('rules-modal');
  if (modal) {
    modal.classList.toggle('active', !!isOpen);
  }
};
