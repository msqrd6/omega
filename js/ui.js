/* ==============================================================
   ui.js: UI・レンダリング・ダイアグラム・一体型アクションカード表示・DnD対応
   (大型アップデート: スキルトークン廃止・Bスキル廃止対応)
   ============================================================== */
import {
  ROWS,
  COLS,
  HERO_TYPES,
  STATUS_EFFECT_DEFS,
  ULT_REQUIRED_DAMAGE,
  DEPLOYABLE_ROWS,
  INITIAL_PIECE_KEYS,
  SELECTABLE_HERO_KEYS,
  DEFAULT_ROSTER
} from './config.js';
import {
  board,
  traps,
  plasmaZones,
  phantomZones,
  poisonZones,
  findCore,
  getValidMoves,
  getValidAttacks,
  getValidSkillTargets,
  getAttackRangeCells,
  isUltReady,
  hasBuff,
  hasDebuff,
  getEffectiveAtk,
  getShieldVal,
  getTeamUltGauge,
  getDeployedPieces,
  canDeployAt,
  getHazardInfoAt,
  getActionTokens,
  getMaxActionTokens,
  hasActionToken,
  isVectorBunkerActive,
  getPlayerTokens,
  isLocalPlayer
} from './board.js';

export let tileElements = [];
export let isBoardFlipped = false;

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

      // クリックイベント
      tile.addEventListener('click', (e) => {
        e.stopPropagation();
        onTileClickCallback(r, c);
      });

      // ドラッグオーバー（ドロップ可能マスで光る: 移動先は緑、攻撃対象は赤、配置エリアは緑）
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

      // ドロップ処理
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
  selectedDeployPiece = null,
  onPieceDragStartCallback,
  onPieceDragEndCallback
}) {
  const isDeployPhase = (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2');
  const deployOwner = (gamePhase === 'DEPLOY_P1') ? 'P1' : (gamePhase === 'DEPLOY_P2' ? 'P2' : null);
  const isMyDeployPhase = !isDeployPhase ? false : (gameMode !== 'online' || deployOwner === myOnlineRole);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = tileElements[r][c];
      const unit = board[r][c];

      // クラス初期化
      tile.className = 'tile';

      // 1. 初期配置フェーズの枠線ガイドハイライト
      if (isDeployPhase && isMyDeployPhase) {
        if (canDeployAt(deployOwner, r, c)) {
          tile.classList.add(deployOwner === 'P1' ? 'deploy-area-p1' : 'deploy-area-p2');
        }
      }

      // 古いインジケーター要素（以前のバージョンで追加されたもの）があれば完全除去（駒の位置ずれ防止）
      const oldIndicators = tile.querySelectorAll('.hazard-indicator, .trap-indicator');
      oldIndicators.forEach(el => el.remove());

      // 2. トラップ表示（自軍トラップのみ常時表示、敵トラップは常時非表示）
      const trap = traps.find(tp => tp.r === r && tp.c === c);
      if (trap && isLocalPlayer(trap.owner)) {
        tile.classList.add(trap.owner === 'P1' ? 'has-trap-p1' : 'has-trap-p2');
        tile.title = trap.type === 'SCRAMBLE_MINE' ? 'スクランブル・マイン（自軍のみ視認可能）' : 'マイン（地雷 / 自軍のみ視認可能）';
      }

      // 3. ハザード表示（敵味方ともに視認可能・マス全体をネオングローと発光枠線で鮮やかに強調）
      const pz = plasmaZones.find(z => z.r === r && z.c === c);
      const fz = phantomZones.find(z => z.r === r && z.c === c);
      const pzn = poisonZones.find(z => z.r === r && z.c === c);

      if (pz) {
        tile.classList.add('has-hazard', 'plasma-zone', pz.owner === 'P1' ? 'hazard-owner-p1' : 'hazard-owner-p2');
        tile.title = `⚡ プラズマゾーン (${pz.owner === 'P1' ? 'BLUE' : 'RED'} / 進入時18DMG+衰弱 / 展開者撃破で消滅)`;
      } else if (fz) {
        tile.classList.add('has-hazard', 'phantom-zone', fz.owner === 'P1' ? 'hazard-owner-p1' : 'hazard-owner-p2');
        tile.title = `👻 ディメンション・ゾーン (${fz.owner === 'P1' ? 'BLUE' : 'RED'} / 侵入敵に弱体化1.5倍 / フェイズ撃破で消滅)`;
      } else if (pzn) {
        tile.classList.add('has-hazard', 'poison-zone', pzn.owner === 'P1' ? 'hazard-owner-p1' : 'hazard-owner-p2');
        tile.title = `🧪 トキシック・ゾーン (${pzn.owner === 'P1' ? 'BLUE' : 'RED'} / ターン開始時5DMG / トキシン撃破で消滅)`;
      }

      // ハザード選択ハイライト
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

        // ドラッグ可能設定（バトル中自軍ターンかつ行動可能駒、または初期配置中）
        const isCurrentTurnHero = (!isDeployPhase && unit.owner === turn && unit.typeKey !== 'CORE' && unit.typeKey !== 'BARRICADE');
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

        // 選択中駒のハイライトクラス
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
          if (hasDebuff(unit, 'weakness')) statusBadgesHtml += `<span class="status-badge badge-weakness">💔</span>`;
          if (hasDebuff(unit, 'vulnerable')) statusBadgesHtml += `<span class="status-badge badge-vulnerable">🎯</span>`;
          if (hasDebuff(unit, 'disarm')) statusBadgesHtml += `<span class="status-badge badge-disarm">💢</span>`;
          if (hasDebuff(unit, 'bind')) statusBadgesHtml += `<span class="status-badge badge-bind">⛓️</span>`;
          if (hasDebuff(unit, 'silence')) statusBadgesHtml += `<span class="status-badge badge-silence">🤐</span>`;
        }

        // HPバー
        const hpPct = Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
        const hpClass = getHpClass(unit.hp, unit.maxHp);

        // シールドゲージ・バッジ
        const shieldVal = (unit.buffs && unit.buffs.shield) ? unit.buffs.shield.val : 0;
        let shieldBarHtml = '';
        let shieldBadgeHtml = '';
        if (shieldVal > 0) {
          const shieldPct = Math.max(0, Math.min(100, (shieldVal / unit.maxHp) * 100));
          shieldBarHtml = `<div class="piece-shield-bar" style="width: ${shieldPct}%;"></div>`;
          shieldBadgeHtml = `<div class="piece-shield-badge">🛡️${shieldVal}</div>`;
        }

        // ウルト発動可能バッジ
        let ultBadgeHtml = '';
        if (unit.typeKey !== 'CORE' && unit.typeKey !== 'BARRICADE' && isUltReady(unit) && !unit.ultUsed) {
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
        const isTarget = validTargets.some(t => t.r === r && t.c === c);
        if (isTarget) {
          tile.classList.add('skill-target');
        }
      } else if (commandMode === 'MOVE') {
        const isTarget = validTargets.some(t => t.r === r && t.c === c);
        if (isTarget) tile.classList.add('movable');
      } else if (commandMode === 'ATTACK') {
        const isTarget = validTargets.some(t => t.r === r && t.c === c);
        if (isTarget) tile.classList.add('attackable');
      } else if (selectedPos && !isDeployPhase) {
        // 自軍駒選択時の移動可能マス（緑）と攻撃対象マス（赤）の自動同時ハイライト
        const selHero = board[selectedPos.r][selectedPos.c];
        if (selHero && selHero.owner === turn && selHero.typeKey !== 'CORE' && selHero.typeKey !== 'BARRICADE') {
          const canMove = hasActionToken(turn, 'move', 1) && !hasDebuff(selHero, 'bind');
          const canAttack = hasActionToken(turn, 'attack', 1) && !hasDebuff(selHero, 'disarm');

          if (canMove) {
            const validMoves = getValidMoves(selectedPos.r, selectedPos.c);
            if (validMoves.some(t => t.r === r && t.c === c)) {
              tile.classList.add('movable');
            }
          }
          if (canAttack) {
            const validAtks = getValidAttacks(selectedPos.r, selectedPos.c);
            if (validAtks.some(t => t.r === r && t.c === c)) {
              tile.classList.add('attackable');
            }
          }
        }
      }
    }
  }
}

// 物体化行動トークンバーの更新 (Move / Attack / キネシス専用移動等の物理チップ描画)
export function updateRightsDisplay(turn) {
  const container = document.getElementById('action-tokens-container');
  if (!container) return;

  const tokens = getPlayerTokens(turn);

  if (!tokens || tokens.length === 0) {
    container.innerHTML = `<span class="tokens-empty">所持トークンなし</span>`;
    return;
  }

  let html = '';
  for (const t of tokens) {
    const isSpecial = (t.scope !== 'all');
    const isUsed = !!t.used;

    const chipClass = [
      'token-chip',
      isUsed ? 'token-used' : 'token-active',
      `token-type-${t.type}`,
      isSpecial ? 'token-special' : ''
    ].filter(Boolean).join(' ');

    const statusTag = isUsed
      ? `<span class="token-chip-status used">消費済</span>`
      : `<span class="token-chip-status active">可能</span>`;

    const scopeBadge = isSpecial
      ? `<span class="token-chip-scope">${t.unitName || t.scope}専用</span>`
      : '';

    html += `
      <div class="${chipClass}" title="${t.desc}">
        <span class="token-chip-icon">${t.icon}</span>
        <span class="token-chip-name">${t.badgeText || t.name}</span>
        ${scopeBadge}
        ${statusTag}
      </div>
    `;
  }

  container.innerHTML = html;
}

// コアHP & チームウルト & ターン表示の更新
export function updateStatus(turn, gameMode, gamePhase = 'BATTLE') {
  const p1Core = findCore('P1');
  const p2Core = findCore('P2');

  if (p1Core) {
    const pct1 = Math.max(0, (p1Core.hp / p1Core.maxHp) * 100);
    document.getElementById('p1-core-bar').style.width = `${pct1}%`;
    document.getElementById('p1-core-hp').innerText = `${p1Core.hp}/${p1Core.maxHp} HP`;
  }

  if (p2Core) {
    const pct2 = Math.max(0, (p2Core.hp / p2Core.maxHp) * 100);
    document.getElementById('p2-core-bar').style.width = `${pct2}%`;
    document.getElementById('p2-core-hp').innerText = `${p2Core.hp}/${p2Core.maxHp} HP`;
  }

  // チームウルトゲージ（累計通常攻撃DMG 0〜100）
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

  // ターンバッジ
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
      turnBadge.innerText = `${turn === 'P1' ? 'BLUE' : 'RED'} の番`;
    }
  }

  updateRightsDisplay(turn);
}

// 一体型アクションカードサイドパネルのレンダリング (固有スキル・ウルト最優先！)
export function renderHeroControlPanel({
  turn,
  selectedPos,
  selectedHazardPos = null,
  commandMode,
  moveRightAvailable,
  attackRightAvailable
}) {
  const panel = document.getElementById('unit-detail-panel');

  // ハザード単体選択時
  if (!selectedPos && selectedHazardPos) {
    const hazard = getHazardInfoAt(selectedHazardPos.r, selectedHazardPos.c);
    if (hazard) {
      panel.innerHTML = `
        <div class="hazard-detail-card">
          <div class="hdc-header">
            <span class="hdc-icon">${hazard.icon}</span>
            <div class="hdc-meta">
              <span class="hdc-title">${hazard.name}</span>
              <span class="hdc-category">${hazard.category}</span>
            </div>
          </div>
          <div class="hdc-body">
            <div class="hdc-desc">${hazard.desc}</div>
            <div class="hdc-pos">📍 座標: (${selectedHazardPos.r}, ${selectedHazardPos.c}) / 設置陣営: ${hazard.owner === 'P1' ? 'BLUE' : 'RED'}</div>
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
          盤面のキャラクターをクリックすると、固有スキル・ウルトのアクションカードが表示されます。<br>
          直接ドラッグすることで移動や通常攻撃も可能です。
        </div>
      </div>
    `;
    return;
  }

  const hero = board[selectedPos.r][selectedPos.c];
  if (!hero) {
    panel.innerHTML = `<div class="empty-selection-guide">空のマスです</div>`;
    return;
  }

  const heroDef = HERO_TYPES[hero.typeKey];
  const isEnemy = (hero.owner !== turn);
  const isCore = (hero.typeKey === 'CORE');
  const isBarricade = (hero.typeKey === 'BARRICADE');
  const isTurret = (hero.typeKey === 'TURRET');

  // コア・オブジェクト選択時のシンプルカード
  if (isCore || isBarricade || isTurret) {
    const shieldVal = getShieldVal(hero);
    panel.innerHTML = `
      <div class="object-detail-card">
        <div class="odc-header">
          <span class="odc-icon">${hero.icon}</span>
          <div class="odc-meta">
            <span class="odc-title">${hero.name}</span>
            <span class="odc-role">${heroDef.roleName} (${hero.owner === 'P1' ? 'BLUE' : 'RED'})</span>
          </div>
        </div>
        <div class="odc-stats">
          <div class="odc-stat-row">
            <span>💚 耐久値 (HP)</span>
            <span style="font-weight:bold;">${hero.hp} / ${hero.maxHp}</span>
          </div>
          ${shieldVal > 0 ? `
            <div class="odc-stat-row" style="color: #00d2ff;">
              <span>🛡️ シールド耐久値</span>
              <span style="font-weight:bold;">+${shieldVal}</span>
            </div>
          ` : ''}
          ${isTurret ? `
            <div class="odc-stat-row" style="color: #f59e0b;">
              <span>🗼 自動迎撃攻撃力</span>
              <span style="font-weight:bold;">${hero.atk} DMG</span>
            </div>
          ` : ''}
        </div>
        <div class="odc-desc">${heroDef.desc}</div>
      </div>
    `;
    return;
  }

  // ヒーロー（ユニット）の一体型アクションカード
  const skills = heroDef.skills || {};
  const effAtk = getEffectiveAtk(hero);
  const shield = getShieldVal(hero);
  const moves = getValidMoves(selectedPos.r, selectedPos.c);
  const atks = getValidAttacks(selectedPos.r, selectedPos.c);

  const isSilenced = hasDebuff(hero, 'silence');
  const isDisarmed = hasDebuff(hero, 'disarm');
  const isBound = hasDebuff(hero, 'bind');

  // スキルトークン廃止に伴い、ストックのみで発動可否を判定
  const canSkillA = !isEnemy && !isSilenced && (hero.stockA > 0);
  const ultReady = isUltReady(hero);
  const canUlt = !isEnemy && !isSilenced && ultReady && !hero.ultUsed;

  const hasAtkToken = hasActionToken(turn, 'attack', 1, hero);
  const canAttack = !isEnemy && !isDisarmed && hasAtkToken && atks.length > 0;
  const hasMoveToken = hasActionToken(turn, 'move', 1, hero);
  const canMove = !isEnemy && !isBound && hasMoveToken && moves.length > 0;

  const teamGauge = getTeamUltGauge(hero.owner);
  const ultPct = Math.min(100, (teamGauge / ULT_REQUIRED_DAMAGE) * 100);

  // 足元ハザード情報
  const hazardOnUnit = getHazardInfoAt(selectedPos.r, selectedPos.c);

  // バフ・デバフ一覧ピル
  let statusPillsHtml = '';
  if (hero.buffs) {
    if (hasBuff(hero, 'atk_up')) statusPillsHtml += `<span class="stat-pill buff">🔥 ATK+${hero.buffs.atk_up.val} (${hero.buffs.atk_up.turns}T)</span>`;
    if (hasBuff(hero, 'shield')) statusPillsHtml += `<span class="stat-pill buff">🛡️ シールド+${hero.buffs.shield.val} (${hero.buffs.shield.turns}T)</span>`;
    if (hasBuff(hero, 'fortress')) statusPillsHtml += `<span class="stat-pill buff">🏰 要塞化 (${hero.buffs.fortress.turns}T)</span>`;
    if (hasBuff(hero, 'extended_move')) statusPillsHtml += `<span class="stat-pill buff">👟 移動半径2 (1T)</span>`;
  }
  if (hero.debuffs) {
    if (hasDebuff(hero, 'weakness')) statusPillsHtml += `<span class="stat-pill debuff">💔 衰弱 (HP半減 / ${hero.debuffs.weakness.turns}T)</span>`;
    if (hasDebuff(hero, 'vulnerable')) statusPillsHtml += `<span class="stat-pill debuff">🎯 弱体化 (被ダメ1.5倍 / ${hero.debuffs.vulnerable.turns}T)</span>`;
    if (hasDebuff(hero, 'disarm')) statusPillsHtml += `<span class="stat-pill debuff">💢 攻撃阻害 (${hero.debuffs.disarm.turns}T)</span>`;
    if (hasDebuff(hero, 'bind')) statusPillsHtml += `<span class="stat-pill debuff">⛓️ 行動阻害 (${hero.debuffs.bind.turns}T)</span>`;
    if (hasDebuff(hero, 'silence')) statusPillsHtml += `<span class="stat-pill debuff">🤐 スキル阻害 (${hero.debuffs.silence.turns}T)</span>`;
  }
  if (!statusPillsHtml) {
    statusPillsHtml = `<span style="font-size:0.75rem; color:var(--text-muted);">なし (正常)</span>`;
  }

  // 固有パッシブのライブ状態補足
  const passive = heroDef.passive;
  let passiveLiveHtml = '';
  if (passive) {
    let note = '';
    if (hero.typeKey === 'DUELIST') {
      const extra = hero.kinesisExtraMove ?? hero.zephyrExtraMove ?? 0;
      note = (extra > 0)
        ? `<span class="pac-live-active">💨 専用移動可能: 残り${extra}回</span>`
        : `<span class="pac-live-used">💨 専用移動: 今ターン消費済</span>`;
    } else if (hero.typeKey === 'SENTINEL') {
      const isBunker = isVectorBunkerActive(hero);
      note = isBunker
        ? `<span class="pac-live-active">🏰 要塞隣接中: ATK+4発動中 (ATK 18➔22)</span>`
        : `<span class="pac-live-inactive">🏰 オブジェクト非隣接: 通常ATK 18</span>`;
    } else if (hero.typeKey === 'PHANTOM') {
      note = `<span class="pac-live-active">👤 全ハザード無効（毒床・プラズマ耐性）</span>`;
    } else if (hero.typeKey === 'BOMBER') {
      note = `<span class="pac-live-active">💣 撃破時に周囲8マスへ20自爆</span>`;
    } else if (hero.typeKey === 'POISON') {
      note = `<span class="pac-live-active">🧪 毒床上の敵へ通常攻撃時 +10 DMG</span>`;
    } else if (hero.typeKey === 'VULCAN') {
      note = `<span class="pac-live-active">🗼 タレット射程内の敵へ通常攻撃時 +8 DMG & ノックバック</span>`;
    } else if (hero.typeKey === 'CYPHER') {
      note = `<span class="pac-live-active">📡 デバフ状態の敵へ通常攻撃時 +5 DMG</span>`;
    } else if (hero.typeKey === 'DISRUPTOR') {
      note = `<span class="pac-live-active">🌀 ワープ着地時、周囲2マス敵全員に弱体化(1.5倍)付与</span>`;
    } else if (hero.typeKey === 'MEDIC') {
      note = `<span class="pac-live-active">💉 ターン終了時、直線上最寄り味方HP5自動回復</span>`;
    } else if (hero.typeKey === 'HACKER') {
      note = `<span class="pac-live-active">💻 生存中、ターン終了時にウルト+5直接チャージ</span>`;
    }

    passiveLiveHtml = `
      <div class="passive-ability-card">
        <div class="pac-header">
          <div class="pac-title-wrap">
            <span class="pac-icon">${passive.icon || '🔮'}</span>
            <span class="pac-title">固有パッシブ: ${passive.name}</span>
          </div>
          <span class="pac-badge">常時発動</span>
        </div>
        <div class="pac-desc">${passive.desc}</div>
        ${note ? `<div class="pac-live-status">${note}</div>` : ''}
      </div>
    `;
  }

  panel.innerHTML = `
    <!-- 1. 最上部: ヒーロー名 & 基本スペック -->
    <div class="hero-card-header ${heroDef.roleClass}">
      <div class="hch-main">
        <span class="hch-icon">${hero.icon}</span>
        <div class="hch-info">
          <div class="hch-name-row">
            <span class="hch-name">${hero.name}</span>
            <span class="hch-role-badge ${heroDef.roleClass}">${heroDef.roleName}</span>
          </div>
          <div class="hch-owner-tag ${hero.owner.toLowerCase()}">${hero.owner === 'P1' ? 'BLUE TEAM' : 'RED TEAM'}</div>
        </div>
      </div>
      <div class="hch-stats-summary">
        <span class="hch-hp-val">💚 ${hero.hp}/${hero.maxHp} HP ${shield > 0 ? `<strong style="color:#00d2ff;">(+${shield}🛡️)</strong>` : ''}</span>
        <span class="hch-atk-val">⚔️ ATK: <strong>${effAtk}</strong></span>
      </div>
    </div>

    ${hazardOnUnit ? `
      <div class="hazard-on-unit-banner">
        <span class="hoa-icon">${hazardOnUnit.icon}</span>
        <div class="hoa-info">
          <div class="hoa-title">⚠️ 足元ハザード: ${hazardOnUnit.name}</div>
          <div class="hoa-desc">${hazardOnUnit.desc}</div>
        </div>
      </div>
    ` : ''}

    <!-- 固有パッシブ表示カード -->
    ${passiveLiveHtml}

    <!-- 2. 【最優先・最上部固定】固有スキル ＆ ウルト アクションカード (Bスキル廃止版) -->
    <div class="skills-priority-section">
      <div class="skills-section-header">
        <span>⚡ 通常スキル & ウルト</span>
        <span style="font-size: 0.68rem; color: var(--text-muted);">（カードをクリックして対象を選択）</span>
      </div>

      ${isEnemy ? `
        <div class="enemy-inspect-box">
          🔍 <strong>敵ユニットを偵察中</strong><br>
          敵ユニットのためスキルは発動できません。<br>
          下のステータス欄でHP・シールドやデバフを確認できます。
        </div>
      ` : `
        <div class="action-card-list">
          <!-- 通常スキル (旧Aスキル) -->
          ${skills.A ? `
            <div class="action-card-btn acb-skill-a ${commandMode === 'SKILL_A' ? 'active' : ''} ${!canSkillA ? 'disabled' : ''}"
                 onclick="${canSkillA ? "setCommandMode('SKILL_A')" : ''}">
              <div class="acb-header">
                <span class="acb-title">⚡ 通常スキル: ${skills.A.name}</span>
                <span class="acb-badge ${canSkillA ? 'badge-ready' : 'badge-used'}">
                  ${isSilenced ? '🤐 スキル阻害中' : (hero.stockA <= 0 ? `ストック 0/${skills.A.maxStock}` : `ストック ${hero.stockA}/${skills.A.maxStock}`)}
                </span>
              </div>
              <div class="acb-desc">${skills.A.desc}</div>
            </div>
          ` : ''}

          <!-- ウルト (必殺技) -->
          ${skills.ULT ? `
            <div class="action-card-btn acb-ult ${commandMode === 'SKILL_ULT' ? 'active' : ''} ${!canUlt ? 'disabled' : ''} ${ultReady && !hero.ultUsed ? 'ult-glow' : ''}"
                 onclick="${canUlt ? "setCommandMode('SKILL_ULT')" : ''}">
              <div class="acb-header">
                <span class="acb-title">🌟 ULT: ${skills.ULT.name}</span>
                <span class="acb-badge ${hero.ultUsed ? 'badge-used' : (isSilenced ? 'badge-used' : (ultReady ? 'badge-ult-ready' : 'badge-used'))}">
                  ${hero.ultUsed ? '【使用済 (0/1)】' : (isSilenced ? '🤐 スキル阻害中' : (ultReady ? '⚡ READY! (発動可能)' : `ゲージ ${teamGauge}/100`))}
                </span>
              </div>
              <div class="ult-progress-bar-bg">
                <div class="ult-progress-bar-fill" style="width: ${ultPct}%;"></div>
              </div>
              <div class="acb-desc">${skills.ULT.desc}</div>
            </div>
          ` : ''}

          <!-- 移動 & 通常攻撃ガイド -->
          <div class="direct-action-guide-list">
            <div class="dag-item ${canMove ? 'dag-ready' : 'dag-used'}">
              <span class="dag-icon">👟</span>
              <div class="dag-info">
                <span class="dag-label">空きマスへドラッグ ➔ <strong>移動</strong></span>
                <span class="dag-badge ${canMove ? 'badge-ready' : 'badge-used'}">
                  ${isBound ? '⛓️ 行動阻害中' : (!hasMoveToken ? '👟 トークン消費済' : (moves.length > 0 ? (hero.typeKey === 'DUELIST' && hasActionToken(turn, 'move', 1, hero) && !hasActionToken(turn, 'move', 1) ? '⚡専用移動可能' : '可能') : '移動先なし'))}
                </span>
              </div>
            </div>
            <div class="dag-item ${canAttack ? 'dag-ready' : 'dag-used'}">
              <span class="dag-icon">⚔️</span>
              <div class="dag-info">
                <span class="dag-label">敵マスへドラッグ ➔ <strong>通常攻撃</strong> (${effAtk} DMG / ウルト蓄積)</span>
                <span class="dag-badge ${canAttack ? 'badge-ready' : 'badge-used'}">
                  ${isDisarmed ? '💢 攻撃阻害中' : (!hasAtkToken ? '⚔️ トークン消費済' : (atks.length > 0 ? '可能' : '射程内に敵なし'))}
                </span>
              </div>
            </div>
          </div>
        </div>
      `}
    </div>

    <!-- 3. キャラクターステータス (HP・シールド・ATK・バフ・デバフ一覧) -->
    <div class="hero-stats-section">
      <div class="stats-section-header">
        <span>📊 キャラクターステータス</span>
      </div>
      <div class="hero-stats-grid">
        ${statusPillsHtml}
      </div>
    </div>
  `;
}

// ポップアップ表示
export function showDamagePopup(r, c, text, color = '#ff3333') {
  const tile = tileElements[r] ? tileElements[r][c] : null;
  if (!tile) return;

  const popup = document.createElement('div');
  popup.className = 'damage-popup';
  popup.innerText = text;
  popup.style.color = color;
  tile.appendChild(popup);

  setTimeout(() => popup.remove(), 900);
}

// ハザード効果トーストポップアップ（タッチ・クリック時に盤面タイル上に表示）
export function showHazardToast(r, c, hazard) {
  const tile = tileElements[r] ? tileElements[r][c] : null;
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
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.innerText = text;
  box.appendChild(entry);
  box.scrollTop = box.scrollHeight;
}

// 勝利モーダル
export function showGameOverModal(winner) {
  const modal = document.getElementById('victory-modal');
  const title = document.getElementById('winner-title');
  const desc = document.getElementById('winner-desc');

  if (winner === 'P1') {
    title.innerText = "BLUE VICTORY!";
    title.style.color = "var(--p1-color)";
    desc.innerText = "敵コアの完全破壊に成功しました！ブルーチームの勝利！";
  } else {
    title.innerText = "RED VICTORY!";
    title.style.color = "var(--p2-color)";
    desc.innerText = "自軍コアが破壊されました...レッドチームの勝利！";
  }

  modal.classList.add('active');
}

// 初期配置フェーズ専用パネルの描画
export function renderDeployPanel({
  gamePhase,
  selectedDeployPiece,
  roster = DEFAULT_ROSTER,
  gameMode = 'pve',
  myOnlineRole = null
}) {
  const panel = document.getElementById('unit-detail-panel');
  if (!panel) return;

  // オンライン対戦時の待機中画面
  if (gameMode === 'online') {
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
      return;
    }
  }

  const currentOwner = (gamePhase === 'DEPLOY_P1') ? 'P1' : 'P2';
  const ownerLabel = (currentOwner === 'P1') ? '【先行・BLUE】' : '【後攻・RED】';
  const bannerClass = currentOwner.toLowerCase();

  // 配置対象の全駒リスト: コア + 選択した5体ヒーロー
  const pieceKeys = ['CORE', ...roster];

  const deployed = getDeployedPieces(currentOwner);
  const deployedKeys = deployed.map(p => p.typeKey);
  const remainingCount = pieceKeys.length - deployed.length;
  const isComplete = (remainingCount === 0);

  let pieceCardsHtml = '';
  for (const key of pieceKeys) {
    const heroDef = HERO_TYPES[key];
    const isPlaced = deployedKeys.includes(key);
    const isSelected = (selectedDeployPiece === key);

    const statusText = isPlaced ? '✅ 配置済' : '未配置';
    const statusClass = isPlaced ? 'placed' : 'unplaced';

    pieceCardsHtml += `
      <div class="deploy-piece-card ${isSelected ? 'selected' : ''} ${isPlaced ? 'placed' : ''}"
           onclick="window.__onSelectDeployPiece('${key}')">
        <div class="deploy-piece-icon">${heroDef.icon}</div>
        <div class="deploy-piece-info">
          <span class="deploy-piece-name">${heroDef.name}</span>
          <span class="deploy-piece-role">${heroDef.roleName} (HP:${heroDef.maxHp}${heroDef.atk > 0 ? ' ATK:' + heroDef.atk : ''})</span>
          <span class="deploy-piece-status ${statusClass}">${statusText}</span>
        </div>
      </div>
    `;
  }

  panel.innerHTML = `
    <div class="deploy-panel">
      <div class="deploy-header-banner ${bannerClass}">
        <div class="deploy-title">${ownerLabel} 初期配置フェーズ</div>
        <div class="deploy-desc">
          自陣の縦3マス以内（${currentOwner === 'P1' ? '青色破線枠: 行4〜6' : '赤色破線枠: 行0〜2'}）をクリックして配置してください。<br>
          配置済みの駒をクリックすると移動・再配置が可能です。
        </div>
        <div class="deploy-count-badge">
          ${isComplete ? '🎉 全6体 配置完了！' : `未配置: 残り ${remainingCount} 体`}
        </div>
      </div>

      <div class="deploy-piece-list">
        ${pieceCardsHtml}
      </div>

      <div class="deploy-actions-row">
        <button class="btn-deploy-sub" onclick="window.__onAutoDeploy()">🎲 おすすめ配置</button>
        <button class="btn-deploy-sub" onclick="window.__onClearDeploy()">🗑️ 全クリア</button>
      </div>

      <button class="btn-deploy-confirm ${bannerClass} ${isComplete ? '' : 'disabled'}"
              ${isComplete ? 'onclick="window.__onConfirmDeploy()"' : 'disabled'}>
        ${currentOwner === 'P1' 
          ? (gameMode === 'online' ? '先行・配置完了（後攻へ送信 ➔）' : '先行・配置完了（後攻の配置へ ➔）') 
          : '後攻・配置完了（⚔️ バトル開始！）'}
      </button>
    </div>
  `;
}

// キャラクター選択モーダル（ピックフェーズ）の描画
// キャラクターピック画面の描画 (フルスクリーン編成)
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

  // 1. 出撃編成スロット (5枠) のレンダリング
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

  // 2. カウンターバッジ更新
  if (counterBadge) {
    counterBadge.innerText = `${selCount} / 5 体`;
    counterBadge.classList.toggle('ready', selCount === 5);
  }

  // 3. 決定ボタン状態
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

  // 4. カード一覧生成 (全ヒーローカード)
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
            <strong>🌟 ULT [${skills.ULT ? skills.ULT.name : '-'}]:</strong> ${skills.ULT ? skills.ULT.desc : ''}
          </div>
        </div>
      </div>
    `;
  }

  cardsGrid.innerHTML = cardsHtml;
}

export function hidePickModal() {
  // フルスクリーン画面切り替えに統合されたため互換用
}

// ルール解説モーダルの開閉
window.__toggleRulesModal = (isOpen) => {
  const modal = document.getElementById('rules-modal');
  if (modal) {
    modal.classList.toggle('active', !!isOpen);
  }
};
