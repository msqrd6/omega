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
} from './config.js?v=20261024_11';
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
} from './board.js?v=20261024_11';

export let tileElements = [];
export let isBoardFlipped = false;

// フェーズ案内テキスト更新ヘルパー
export function setPhaseInstruction(text) {
  const el = document.getElementById('phase-instruction');
  if (el) el.innerText = text;
}

// プレイヤー視点の設定（RED側なら自陣手前(flipped)に固定）
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

  const coreBar = document.querySelector('.core-status-bar');
  if (coreBar) {
    coreBar.classList.toggle('flipped-bar', isBoardFlipped);
  }
}

export function getHpClass(hp, max) {
  const pct = hp / max;
  if (pct <= 0.3) return 'critical';
  if (pct <= 0.6) return 'low';
  return '';
}

// 盤面DOMを最初に1回だけ構築 (ドラッグ＆ドロップリスナー付き)
export function createBoardDOMOnce({ onTileClickCallback, onPieceDropCallback }) {
  const boardEl = document.getElementById('board');
  if (!boardEl) return;
  boardEl.innerHTML = '';
  tileElements = [];

  for (let r = 0; r < ROWS; r++) {
    tileElements[r] = [];
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.r = r;
      tile.dataset.c = c;
      tile.style.order = isBoardFlipped
        ? (ROWS - 1 - r) * COLS + (COLS - 1 - c)
        : r * COLS + c;

      tile.addEventListener('click', (e) => {
        e.stopPropagation();
        onTileClickCallback(r, c);
      });

      tile.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
        }
        if (tile.classList.contains('movable') || tile.classList.contains('deploy-area-p1') || tile.classList.contains('deploy-area-p2')) {
          tile.classList.add('drag-over-valid');
        } else if (tile.classList.contains('attackable')) {
          tile.classList.add('drag-over-attack');
        }
      });

      tile.addEventListener('dragleave', () => {
        tile.classList.remove('drag-over-valid', 'drag-over-attack');
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

// 盤面ビューの更新
export function updateBoardView({
  turn,
  selectedPos,
  selectedHazardPos,
  commandMode,
  validTargets = [],
  gamePhase = 'BATTLE',
  gameMode = 'pve',
  myOnlineRole = null,
  onPieceDragStartCallback,
  onPieceDragEndCallback
}) {
  const isDeployPhase = (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2');
  const deployOwner = (gamePhase === 'DEPLOY_P1') ? 'P1' : (gamePhase === 'DEPLOY_P2' ? 'P2' : null);
  const isMyDeployPhase = !isDeployPhase ? false : (gameMode !== 'online' || deployOwner === myOnlineRole);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = tileElements[r]?.[c];
      if (!tile) continue;
      const unit = board[r][c];

      tile.className = 'tile';
      tile.title = '';

      // 1. 初期配置フェーズの枠線ガイドハイライト
      if (isDeployPhase && isMyDeployPhase && canDeployAt(deployOwner, r, c)) {
        tile.classList.add(deployOwner === 'P1' ? 'deploy-area-p1' : 'deploy-area-p2');
      }

      // 2. トラップ表示（自軍トラップのみ常時表示、敵トラップは常時非表示）
      const trap = traps.find(tp => tp.r === r && tp.c === c);
      if (trap && isLocalPlayer(trap.owner)) {
        tile.classList.add(trap.owner === 'P1' ? 'has-trap-p1' : 'has-trap-p2');
        tile.title = 'マイン（地雷 / 自軍のみ視認可能）';
      }

      // 3. ハザード表示
      const fz = phantomZones.find(z => z.r === r && z.c === c);
      const pzn = poisonZones.find(z => z.r === r && z.c === c);

      if (fz) {
        tile.classList.add('has-hazard', 'phantom-zone', fz.owner === 'P1' ? 'hazard-owner-p1' : 'hazard-owner-p2');
        tile.title = `👻 ディメンション・ゾーン (${fz.owner === 'P1' ? 'BLUE' : 'RED'} / 侵入敵に弱体化1.5倍 / フェイズ撃破で消滅)`;
      } else if (pzn) {
        tile.classList.add('has-hazard', 'poison-zone', pzn.owner === 'P1' ? 'hazard-owner-p1' : 'hazard-owner-p2');
        tile.title = `🧪 トキシック・ゾーン (${pzn.owner === 'P1' ? 'BLUE' : 'RED'} / ターン開始時10DMG / トキシン撃破で消滅)`;
      }

      if (selectedHazardPos && selectedHazardPos.r === r && selectedHazardPos.c === c) {
        tile.classList.add('hazard-selected');
      }

      // 4. 駒の描画
      let pieceEl = tile.querySelector('.piece');
      if (unit) {
        if (!pieceEl) {
          pieceEl = document.createElement('div');
          pieceEl.className = 'piece';
          tile.appendChild(pieceEl);
        }

        pieceEl.className = `piece ${unit.owner.toLowerCase()} ${unit.typeKey.toLowerCase()}`;
        if (unit.typeKey === 'CORE') pieceEl.classList.add('core');

        const isCurrentTurnHero = (!isDeployPhase && unit.owner === turn && isUnit(unit));
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

        // バフ・デバフのインジケーターアイコン
        let statusBadgesHtml = '';
        if (unit.buffs) {
          if (hasBuff(unit, 'atk_up')) statusBadgesHtml += `<span class="status-badge badge-atk-up">🔥</span>`;
          if (hasBuff(unit, 'shield')) statusBadgesHtml += `<span class="status-badge badge-shield-buff">🛡️</span>`;
        }
        if (unit.debuffs) {
          if (hasDebuff(unit, 'vulnerable')) statusBadgesHtml += `<span class="status-badge badge-vulnerable">🎯</span>`;
          if (hasDebuff(unit, 'disarm')) statusBadgesHtml += `<span class="status-badge badge-disarm">💢</span>`;
          if (hasDebuff(unit, 'bind')) statusBadgesHtml += `<span class="status-badge badge-bind">⛓️</span>`;
          if (hasDebuff(unit, 'silence')) statusBadgesHtml += `<span class="status-badge badge-silence">🤐</span>`;
        }

        const hpPct = Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
        const hpClass = getHpClass(unit.hp, unit.maxHp);

        const shieldVal = getShieldVal(unit);
        let shieldBarHtml = '';
        let shieldBadgeHtml = '';
        if (shieldVal > 0) {
          const shieldPct = Math.max(0, Math.min(100, (shieldVal / unit.maxHp) * 100));
          shieldBarHtml = `<div class="piece-shield-bar" style="width: ${shieldPct}%;"></div>`;
          shieldBadgeHtml = `<div class="piece-shield-badge">🛡️${shieldVal}</div>`;
        }

        let ultBadgeHtml = '';
        if (isUnit(unit) && isUltReady(unit) && !unit.ultUsed) {
          ultBadgeHtml = `<div class="ult-ready-badge">ULT!</div>`;
        }

        pieceEl.innerHTML = `
          ${ultBadgeHtml}
          ${shieldBadgeHtml}
          <div class="piece-status-badges">${statusBadgesHtml}</div>
          <div class="piece-icon">${unit.icon}</div>
          <div class="piece-name">${unit.name}</div>
          <div class="piece-hp-container">
            <div class="piece-hp-bar ${hpClass}" style="width: ${hpPct}%;"></div>
          </div>
          ${shieldBarHtml}
          <div class="piece-hp-text">${unit.hp}/${unit.maxHp}</div>
        `;
      } else {
        if (pieceEl) pieceEl.remove();
      }

      // 5. 選択中のハイライト
      if (selectedPos && selectedPos.r === r && selectedPos.c === c) {
        tile.classList.add('selected');
      }

      // 6. 移動先・攻撃先・スキル対象のハイライト
      if (commandMode && commandMode.startsWith('SKILL_')) {
        if (validTargets.some(t => t.r === r && t.c === c)) {
          tile.classList.add('skill-target');
        }
      } else if (commandMode === 'MOVE') {
        if (validTargets.some(t => t.r === r && t.c === c)) {
          tile.classList.add('movable');
        }
      } else if (commandMode === 'ATTACK') {
        if (validTargets.some(t => t.r === r && t.c === c)) {
          tile.classList.add('attackable');
        }
      } else if (selectedPos && !isDeployPhase) {
        const selHero = board[selectedPos.r]?.[selectedPos.c];
        if (selHero && selHero.owner === turn && isUnit(selHero)) {
          const validMoves = getValidMoves(selectedPos.r, selectedPos.c);
          if (validMoves.some(t => t.r === r && t.c === c)) {
            tile.classList.add('movable');
          }
          const validAtks = getValidAttacks(selectedPos.r, selectedPos.c);
          if (validAtks.some(t => t.r === r && t.c === c)) {
            tile.classList.add('attackable');
          }
        }
      }
    }
  }
}

// 物体化行動トークンバーの更新
export function updateRightsDisplay(turn, selectedPos = null, gamePhase = 'BATTLE') {
  const container = document.getElementById('action-tokens-container');
  if (!container) return;

  if (gamePhase && (gamePhase.startsWith('DEPLOY') || gamePhase.startsWith('PICK'))) {
    container.innerHTML = '';
    return;
  }

  const tokens = getPlayerTokens(turn);
  // 専用トークンも含め、攻撃トークン -> 移動トークンの順にソート（同タイプ内は共通 -> 専用の順）
  const activeTokens = (tokens || []).filter(t => !t.used).sort((a, b) => {
    const typeOrder = { attack: 0, move: 1 };
    const orderA = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 99;
    const orderB = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 99;
    if (orderA !== orderB) return orderA - orderB;

    const specialA = (a.scope !== 'all') ? 1 : 0;
    const specialB = (b.scope !== 'all') ? 1 : 0;
    if (specialA !== specialB) return specialA - specialB;

    return 0;
  });

  if (activeTokens.length === 0) {
    container.innerHTML = `<span class="tokens-empty">所持トークンなし</span>`;
    return;
  }

  const selectedUnit = (selectedPos && board[selectedPos.r]) ? board[selectedPos.r][selectedPos.c] : null;

  let html = '';
  for (const t of activeTokens) {
    const isSpecial = (t.scope !== 'all');
    let isAvailable = true;

    if (selectedUnit) {
      if (selectedUnit.owner !== turn || !isUnit(selectedUnit)) {
        isAvailable = false;
      } else if (isSpecial && t.scope !== selectedUnit.typeKey && t.scope !== selectedUnit.id) {
        isAvailable = false;
      } else if (t.type === 'move') {
        const validMoves = getValidMoves(selectedPos.r, selectedPos.c);
        if (hasDebuff(selectedUnit, 'bind') || validMoves.length === 0) {
          isAvailable = false;
        }
      } else if (t.type === 'attack') {
        const validAttacks = getValidAttacks(selectedPos.r, selectedPos.c);
        if (hasDebuff(selectedUnit, 'disarm') || validAttacks.length === 0) {
          isAvailable = false;
        }
      }
    } else {
      let canAnyoneUse = false;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const u = board[r][c];
          if (u && u.owner === turn && isUnit(u)) {
            if (isSpecial && t.scope !== u.typeKey && t.scope !== u.id) continue;
            if (t.type === 'move' && !hasDebuff(u, 'bind') && getValidMoves(r, c).length > 0) {
              canAnyoneUse = true;
              break;
            }
            if (t.type === 'attack' && !hasDebuff(u, 'disarm') && getValidAttacks(r, c).length > 0) {
              canAnyoneUse = true;
              break;
            }
          }
        }
        if (canAnyoneUse) break;
      }
      isAvailable = canAnyoneUse;
    }

    const chipClass = [
      'token-chip',
      isAvailable ? 'token-active' : 'token-disabled',
      `token-type-${t.type}`,
      isSpecial ? 'token-special' : ''
    ].filter(Boolean).join(' ');

    const scopeBadge = isSpecial
      ? `<span class="token-chip-scope">${t.unitName || t.scope}</span>`
      : '';

    html += `
      <div class="${chipClass}" title="${t.desc}${!isAvailable ? ' (現在は実行不可)' : ''}">
        <span class="token-chip-name">${t.badgeText || t.name}</span>
        ${scopeBadge}
      </div>
    `;
  }

  container.innerHTML = html;
}

// コアHP & チームウルト & ターン表示の更新
export function updateStatus(turn, gameMode, gamePhase = 'BATTLE', turnCount = 1) {
  const p1Core = findCore('P1');
  const p2Core = findCore('P2');

  if (p1Core) {
    const pct1 = Math.max(0, (p1Core.hp / p1Core.maxHp) * 100);
    const bar1 = document.getElementById('p1-core-bar');
    const hp1 = document.getElementById('p1-core-hp');
    if (bar1) bar1.style.width = `${pct1}%`;
    if (hp1) hp1.innerText = `${p1Core.hp}/${p1Core.maxHp} HP`;
  }

  if (p2Core) {
    const pct2 = Math.max(0, (p2Core.hp / p2Core.maxHp) * 100);
    const bar2 = document.getElementById('p2-core-bar');
    const hp2 = document.getElementById('p2-core-hp');
    if (bar2) bar2.style.width = `${pct2}%`;
    if (hp2) hp2.innerText = `${p2Core.hp}/${p2Core.maxHp} HP`;
  }

  const ultP1 = getTeamUltGauge('P1');
  const ultP2 = getTeamUltGauge('P2');
  const ultPct1 = Math.min(100, (ultP1 / ULT_REQUIRED_DAMAGE) * 100);
  const ultPct2 = Math.min(100, (ultP2 / ULT_REQUIRED_DAMAGE) * 100);

  const p1UltBar = document.getElementById('p1-ult-bar');
  const p2UltBar = document.getElementById('p2-ult-bar');
  const p1UltText = document.getElementById('p1-ult-text');
  const p2UltText = document.getElementById('p2-ult-text');

  if (p1UltBar) p1UltBar.style.width = `${ultPct1}%`;
  if (p2UltBar) p2UltBar.style.width = `${ultPct2}%`;

  if (p1UltText) {
    p1UltText.innerText = (ultP1 >= ULT_REQUIRED_DAMAGE) ? "⚡ READY! (100)" : `${ultP1} / 100`;
    p1UltText.className = (ultP1 >= ULT_REQUIRED_DAMAGE) ? "ult-ready-text" : "";
  }
  if (p2UltText) {
    p2UltText.innerText = (ultP2 >= ULT_REQUIRED_DAMAGE) ? "⚡ READY! (100)" : `${ultP2} / 100`;
    p2UltText.className = (ultP2 >= ULT_REQUIRED_DAMAGE) ? "ult-ready-text" : "";
  }

  const turnCountEl = document.getElementById('turn-count-badge');
  if (turnCountEl) {
    if (gamePhase && gamePhase.startsWith('PICK')) {
      turnCountEl.innerText = "DRAFT";
    } else if (gamePhase && gamePhase.startsWith('DEPLOY')) {
      turnCountEl.innerText = "DEPLOY";
    } else {
      turnCountEl.innerText = `TURN ${turnCount}`;
    }
  }

  const turnBadge = document.getElementById('turn-badge');
  if (turnBadge) {
    if (gamePhase === 'PICK_P1') {
      turnBadge.className = 'turn-badge turn-p1';
      turnBadge.innerText = '先行 (BLUE) ピック中';
    } else if (gamePhase === 'PICK_P2') {
      turnBadge.className = 'turn-badge turn-p2';
      turnBadge.innerText = '後攻 (RED) ピック中';
    } else if (gamePhase === 'DEPLOY_P1') {
      turnBadge.className = 'turn-badge turn-p1';
      turnBadge.innerText = '先行 (BLUE) 初期配置';
    } else if (gamePhase === 'DEPLOY_P2') {
      turnBadge.className = 'turn-badge turn-p2';
      turnBadge.innerText = '後攻 (RED) 初期配置';
    } else if (gamePhase === 'DEPLOY_WAIT_P1') {
      turnBadge.className = 'turn-badge turn-p1';
      turnBadge.innerText = '先行 (BLUE) 配置中（待機）';
    } else if (gamePhase === 'DEPLOY_WAIT_P2') {
      turnBadge.className = 'turn-badge turn-p2';
      turnBadge.innerText = '後攻 (RED) 配置中（待機）';
    } else {
      turnBadge.className = `turn-badge turn-${turn.toLowerCase()}`;
      turnBadge.innerText = `${turn === 'P1' ? 'BLUE' : 'RED'} の手番`;
    }
  }

  const battleScreen = document.getElementById('screen-battle');
  if (battleScreen) {
    const isP1 = (gamePhase === 'DEPLOY_P1' || gamePhase === 'PICK_P1' || (gamePhase === 'BATTLE' && turn === 'P1'));
    const isP2 = (gamePhase === 'DEPLOY_P2' || gamePhase === 'PICK_P2' || (gamePhase === 'BATTLE' && turn === 'P2'));
    battleScreen.classList.toggle('turn-p1-bg', isP1);
    battleScreen.classList.toggle('turn-p2-bg', isP2);
  }
}

// 初期配置フェーズ専用固定バーの更新
export function updateDeployControlBar({
  gamePhase,
  gameMode = 'pve',
  myOnlineRole = null
}) {
  const bar = document.getElementById('deploy-control-bar');
  const tokenBanner = document.querySelector('.action-status-banner');
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

  const curOwner = (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_WAIT_P2') ? 'P1' : 'P2';
  const isP1 = (curOwner === 'P1');

  bar.className = 'deploy-control-bar';

  const confirmBtn = document.getElementById('btn-deploy-confirm');
  const confirmTextEl = document.getElementById('btn-deploy-confirm-text');

  const isDeployWait = (gameMode === 'online' && (
    gamePhase === 'DEPLOY_WAIT_P1' ||
    gamePhase === 'DEPLOY_WAIT_P2' ||
    (gamePhase === 'DEPLOY_P1' && myOnlineRole === 'P2') ||
    (gamePhase === 'DEPLOY_P2' && myOnlineRole === 'P1')
  ));

  if (confirmBtn) {
    confirmBtn.className = `btn-deploy-confirm ${isP1 ? 'p1' : 'p2'}`;

    if (isDeployWait) {
      confirmBtn.disabled = true;
      if (confirmTextEl) {
        confirmTextEl.innerText = '⏳ 相手の配置を待機中...';
      }
    } else {
      confirmBtn.disabled = false;
      if (confirmTextEl) {
        if (isP1) {
          confirmTextEl.innerText = (gameMode === 'online') ? '先行・配置完了（送信 ➔）' : '先行・配置完了（後攻へ ➔）';
        } else {
          confirmTextEl.innerText = '⚔️ バトル開始！';
        }
      }
    }
  }
}

// 一体型アクションカードサイドパネルのレンダリング
export function renderHeroControlPanel({
  turn,
  selectedPos,
  selectedHazardPos = null,
  commandMode,
  gamePhase = 'BATTLE'
}) {
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
                ${hazard.owner ? (hazard.owner === 'P1' ? '<span class="hch-owner-tag p1">🔷 BLUE</span>' : '<span class="hch-owner-tag p2">🔶 RED</span>') : '<span class="hch-owner-tag neutral">🌐 中立</span>'}
                <span class="hch-class-badge class-hazard">ハザード</span>
              </div>
            </div>
          </div>
        </div>

        ${occupiedUnit ? `
          <div class="hazard-on-unit-banner" style="margin-bottom: 8px;">
            <span class="hoa-icon">${occupiedUnit.icon}</span>
            <div class="hoa-info">
              <div class="hoa-title">👤 現在滞在中: ${occupiedUnit.name} (${occupiedUnit.owner === 'P1' ? 'BLUE' : 'RED'})</div>
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
          盤面のキャラクターをクリックすると、スキル・アルティメットのアクションカードが表示されます。<br>
          直接ドラッグすることで移動や通常攻撃も可能です。
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
              <span class="hch-owner-tag ${hero.owner.toLowerCase()}">${hero.owner === 'P1' ? '🔷 BLUE' : '🔶 RED'}</span>
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
  }
  if (hero.debuffs) {
    if (hasDebuff(hero, 'vulnerable')) statusPillsHtml += `<span class="hch-pill debuff" title="弱体化: 被ダメ1.5倍 (${hero.debuffs.vulnerable.turns}ターン)">🎯弱体 <small>${hero.debuffs.vulnerable.turns}T</small></span>`;
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
            <span class="hch-owner-tag ${hero.owner.toLowerCase()}">${hero.owner === 'P1' ? '🔷 BLUE' : '🔶 RED'}</span>
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
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.innerText = text;
  box.appendChild(entry);
  box.scrollTop = box.scrollHeight;
}

// 勝利モーダル
export function showGameOverModal(winner, reason = 'core', myRole = null, gameMode = 'pve') {
  const modal = document.getElementById('victory-modal');
  const title = document.getElementById('winner-title');
  const desc = document.getElementById('winner-desc');
  if (!modal || !title || !desc) return;

  const isWipeout = (reason === 'wipeout');

  if (winner === 'P1') {
    title.innerText = "BLUE VICTORY!";
    title.style.color = "var(--p1-color)";
    if (gameMode === 'local') {
      desc.innerText = isWipeout
        ? "ブルーチームが敵ユニットを全滅させました！ブルーチームの勝利！"
        : "ブルーチームが敵コアの完全破壊に成功しました！ブルーチームの勝利！";
    } else {
      desc.innerText = (myRole === 'P2')
        ? (isWipeout ? "自軍ユニットが全滅しました...ブルーチームの勝利！" : "自軍コアが破壊されました...ブルーチームの勝利！")
        : (isWipeout ? "敵ユニットの全滅に成功しました！ブルーチームの勝利！" : "敵コアの完全破壊に成功しました！ブルーチームの勝利！");
    }
  } else {
    title.innerText = "RED VICTORY!";
    title.style.color = "var(--p2-color)";
    if (gameMode === 'local') {
      desc.innerText = isWipeout
        ? "レッドチームが敵ユニットを全滅させました！レッドチームの勝利！"
        : "レッドチームが敵コアの完全破壊に成功しました！レッドチームの勝利！";
    } else {
      desc.innerText = (myRole === 'P2')
        ? (isWipeout ? "敵ユニットの全滅に成功しました！レッドチームの勝利！" : "敵コアの完全破壊に成功しました！レッドチームの勝利！")
        : (isWipeout ? "自軍ユニットが全滅しました...レッドチームの勝利！" : "自軍コアが破壊されました...レッドチームの勝利！");
    }
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
        <div class="deploy-header-banner p2">
          <div class="deploy-title">⏳ 先行 (BLUE) の初期配置を待機中</div>
          <div class="deploy-desc">
            ルールに基づき、後攻 (RED) は先行 (BLUE) の初期配置を視認した状態で対抗配置を行います。<br>
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
        <div class="deploy-header-banner p1">
          <div class="deploy-title">⏳ 後攻 (RED) の初期配置を待機中</div>
          <div class="deploy-desc">
            先行 (BLUE) の初期配置が完了し相手に送信されました。<br>
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

  if (slotsContainer) {
    let slotsHtml = '';
    const isP2 = (currentOwner === 'P2');
    for (let i = 0; i < 5; i++) {
      const heroKey = selectedHeroes[i];
      if (heroKey) {
        const hero = HERO_TYPES[heroKey];
        slotsHtml += `
          <div class="draft-slot filled ${isP2 ? 'p2' : ''}">
            <div class="draft-slot-icon">${hero.icon}</div>
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
            <div class="draft-slot-empty">+ SLOT 0${i + 1}</div>
          </div>
        `;
      }
    }
    slotsContainer.innerHTML = slotsHtml;
  }

  if (counterBadge) {
    counterBadge.innerText = `${selCount} / 5 体`;
    counterBadge.classList.toggle('ready', selCount === 5);
  }

  if (confirmBtn) {
    if (isOnline && myPickConfirmed) {
      confirmBtn.disabled = true;
      confirmBtn.className = 'pick-btn-confirm waiting';
      confirmBtn.innerHTML = `<span>⏳ 相手のチーム編成完了を待機中...</span>`;
    } else {
      confirmBtn.disabled = (selCount !== 5);
      confirmBtn.className = 'pick-btn-confirm';
      confirmBtn.innerHTML = (selCount === 5)
        ? `<span>🚀 この編成で決定（初期配置へ ➔）</span>`
        : `<span>⚠️ あと ${5 - selCount} 体 選択してください</span>`;
    }
  }

  let cardsHtml = '';
  const ownerClass = (currentOwner === 'P2') ? 'p2' : 'p1';
  for (const key of SELECTABLE_HERO_KEYS) {
    const hero = HERO_TYPES[key];
    const isSelected = selectedHeroes.includes(key);
    const skills = hero.skills || {};

    cardsHtml += `
      <div class="pick-card ${isSelected ? 'selected ' + ownerClass : ''} ${myPickConfirmed ? 'disabled-pick' : ''}"
           onclick="${myPickConfirmed ? '' : `window.__onTogglePickHero('${key}')`}">
        <div class="pick-card-check">${isSelected ? '✓' : ''}</div>
        <div class="pick-card-top">
          <div class="pick-card-icon">${hero.icon}</div>
          <div class="pick-card-identity">
            <div class="pick-card-name">${hero.name}</div>
            <div class="pick-card-role-pill ${hero.roleClass}">${hero.roleName}</div>
          </div>
        </div>

        <div class="pick-card-stats">
          <span class="pcs-hp">💚 HP: ${hero.maxHp}</span>
          <span class="pcs-atk">⚔️ ATK: ${hero.atk}</span>
        </div>

        <div class="pick-card-skills-summary">
          ${hero.passive ? `
            <div class="pick-card-skill-line pick-card-passive-line">
              <strong>🔮 パッシブ [${hero.passive.name}]:</strong> ${hero.passive.desc}
            </div>
          ` : ''}
          <div class="pick-card-skill-line">
            <strong>⚡ スキル [${skills.A ? skills.A.name : '-'}]:</strong> ${skills.A ? skills.A.desc : ''}
          </div>
          <div class="pick-card-skill-line">
            <strong>🌟 アルティメット [${skills.ULT ? skills.ULT.name : '-'}]:</strong> ${skills.ULT ? skills.ULT.desc : ''}
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
