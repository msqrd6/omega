/* ==========================================================================
   ui.js: UI Coordinator for 3D Battlefield & Cybernetic HUD
   ========================================================================== */
import {
  ROWS,
  COLS,
  HERO_TYPES,
  ULT_REQUIRED_DAMAGE,
  SELECTABLE_HERO_KEYS,
  DEFAULT_ROSTER
} from './config.js';

import {
  board,
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
  getPlayerTokens,
  hasActionToken,
  traps,
  phantomZones,
  poisonZones,
  isLocalPlayer,
  isUnit,
  getHazardInfoAt
} from './board.js';

import { Renderer3D } from './renderer_3d.js';

export let tileElements = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
export let isBoardFlipped = false;
export const renderer3D = new Renderer3D();

let lastRenderedHeroId = null;

export function setPhaseInstruction(text) {
  const el = document.getElementById('phase-instruction');
  if (el) el.innerText = text;
}

export function setBoardPerspective(flipped) {
  isBoardFlipped = !!flipped;
  renderer3D.setPerspective(isBoardFlipped);
}

export function getHpClass(hp, max) {
  const pct = hp / max;
  if (pct <= 0.3) return 'critical';
  if (pct <= 0.6) return 'low';
  return '';
}

/* ------------------------------------------------------------------------
   1. BOARD INITIALIZATION (3D WEBGL INITIALIZATION)
   ------------------------------------------------------------------------ */
export function createBoardDOMOnce({
  onTileClickCallback,
  onPieceDropCallback,
  onPieceDragStartCallback,
  onPieceDragEndCallback
}) {
  const viewportEl = document.getElementById('board-viewport');
  const canvasContainer = document.getElementById('webgl-canvas');
  const labelsContainer = document.getElementById('piece-labels-container');

  if (viewportEl && canvasContainer && labelsContainer) {
    renderer3D.init(viewportEl, canvasContainer, labelsContainer, {
      onTileClick: (r, c) => {
        if (onTileClickCallback) onTileClickCallback(r, c);
      },
      onPieceDrop: (fromR, fromC, toR, toC) => {
        if (onPieceDropCallback) onPieceDropCallback(fromR, fromC, toR, toC);
      },
      onPieceDragStart: (r, c) => {
        if (onPieceDragStartCallback) onPieceDragStartCallback(r, c);
      },
      onPieceDragEnd: () => {
        if (onPieceDragEndCallback) onPieceDragEndCallback();
      }
    });
  }

  // Setup Hold/Click-to-confirm Phase End Button
  initPhaseEndButton();
}

function initPhaseEndButton() {
  const btn = document.getElementById('btn-end-turn');
  const peHoldFill = document.getElementById('pe-hold-fill');
  const peRingMeter = document.getElementById('pe-ring-meter');
  const peHintText = document.getElementById('pe-hint-text');
  if (!btn) return;

  const HOLD_DURATION = 350;
  const RING_CIRCUMFERENCE = 81.68;
  let isHolding = false;
  let holdStartTime = 0;
  let holdAnimFrame = null;
  let justTriggeredByHold = false;

  function resetHoldProgress() {
    if (holdAnimFrame) {
      cancelAnimationFrame(holdAnimFrame);
      holdAnimFrame = null;
    }
    isHolding = false;
    btn.classList.remove('is-holding');
    if (peHoldFill) {
      peHoldFill.style.transition = 'width 0.16s ease-out';
      peHoldFill.style.width = '0%';
    }
    if (peRingMeter) {
      peRingMeter.style.transition = 'stroke-dashoffset 0.16s ease-out';
      peRingMeter.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;
    }
    if (peHintText) {
      peHintText.innerText = 'HOLD 0.35s ▶▶';
    }
  }

  function executePhaseEnd() {
    btn.classList.add('pe-flash');
    if (peHintText) peHintText.innerText = 'COMPLETE';
    setTimeout(() => {
      btn.classList.remove('pe-flash');
      resetHoldProgress();
    }, 350);

    if (window.manualEndTurn) {
      window.manualEndTurn();
    }
  }

  function updateHoldLoop() {
    if (!isHolding) return;
    const elapsed = performance.now() - holdStartTime;
    const progress = Math.min(elapsed / HOLD_DURATION, 1.0);

    if (peHoldFill) {
      peHoldFill.style.transition = 'none';
      peHoldFill.style.width = `${progress * 100}%`;
    }
    if (peRingMeter) {
      peRingMeter.style.transition = 'none';
      peRingMeter.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - progress)}`;
    }

    if (progress >= 1.0) {
      isHolding = false;
      justTriggeredByHold = true;
      executePhaseEnd();
    } else {
      holdAnimFrame = requestAnimationFrame(updateHoldLoop);
    }
  }

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || btn.disabled) return;
    justTriggeredByHold = false;
    isHolding = true;
    holdStartTime = performance.now();
    btn.classList.add('is-holding');
    if (peHintText) peHintText.innerText = 'HOLDING...';
    updateHoldLoop();
  });

  btn.addEventListener('pointerup', resetHoldProgress);
  btn.addEventListener('pointerleave', resetHoldProgress);
  btn.addEventListener('pointercancel', resetHoldProgress);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    if (justTriggeredByHold) {
      justTriggeredByHold = false;
      return;
    }
    executePhaseEnd();
  });
}

/* ------------------------------------------------------------------------
   2. VIEW UPDATES (SYNC WITH 3D RENDERER)
   ------------------------------------------------------------------------ */
export function updateBoardView({
  turn,
  selectedPos,
  selectedHazardPos,
  commandMode,
  validTargets = [],
  gamePhase = 'BATTLE',
  gameMode = 'pve',
  myOnlineRole = null
}) {
  const isDeployPhase = (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2');
  const deployOwner = (gamePhase === 'DEPLOY_P1') ? 'P1' : (gamePhase === 'DEPLOY_P2' ? 'P2' : null);

  let moveTargets = [];
  let attackTargets = [];
  let skillTargets = [];

  if (!isDeployPhase && gamePhase === 'BATTLE' && selectedPos) {
    const selUnit = board[selectedPos.r]?.[selectedPos.c];
    const canControl = (gameMode === 'online')
      ? (turn === myOnlineRole && selUnit && selUnit.owner === turn)
      : (turn === 'P1' && selUnit && selUnit.owner === 'P1');

    if (commandMode && commandMode.startsWith('SKILL_')) {
      skillTargets = validTargets || [];
    } else if (commandMode === 'MOVE') {
      moveTargets = validTargets || [];
    } else if (commandMode === 'ATTACK') {
      attackTargets = validTargets || [];
    } else if (selUnit && isUnit(selUnit) && canControl) {
      if (hasActionToken(turn, 'move', 1, selUnit) && !hasDebuff(selUnit, 'bind')) {
        moveTargets = getValidMoves(selectedPos.r, selectedPos.c);
      }
      if (hasActionToken(turn, 'attack', 1, selUnit) && !hasDebuff(selUnit, 'disarm')) {
        attackTargets = getValidAttacks(selectedPos.r, selectedPos.c);
      }
    }
  }

  // Sync 3D Scene
  renderer3D.syncBoard({
    board,
    turn,
    selectedPos,
    selectedHazardPos,
    commandMode,
    validTargets,
    moveTargets,
    attackTargets,
    skillTargets,
    phantomZones,
    poisonZones,
    traps,
    gamePhase,
    deployOwner
  });
}

/* ------------------------------------------------------------------------
   3. ACTION TOKENS BAR (CYBER PILLS)
   ------------------------------------------------------------------------ */
export function updateRightsDisplay(turn, selectedPos = null, gamePhase = 'BATTLE') {
  const container = document.getElementById('action-tokens-container') || document.querySelector('.tokens-horizontal-bar');
  if (!container) return;

  if (gamePhase && (gamePhase.startsWith('DEPLOY') || gamePhase.startsWith('PICK'))) {
    container.innerHTML = '';
    return;
  }

  const tokens = getPlayerTokens(turn) || [];
  const selectedUnit = (selectedPos && board[selectedPos.r]) ? board[selectedPos.r][selectedPos.c] : null;

  let html = '';
  tokens.forEach(t => {
    const isSpecial = (t.scope !== 'all');
    let isAvailable = !t.used;

    if (selectedUnit && isAvailable) {
      if (selectedUnit.owner !== turn || !isUnit(selectedUnit)) {
        isAvailable = false;
      } else if (isSpecial && t.scope !== selectedUnit.typeKey && t.scope !== selectedUnit.id) {
        isAvailable = false;
      } else if (t.type === 'move' && hasDebuff(selectedUnit, 'bind')) {
        isAvailable = false;
      } else if (t.type === 'attack' && hasDebuff(selectedUnit, 'disarm')) {
        isAvailable = false;
      }
    }

    const typeClass = t.type === 'attack' ? 'atk' : (isSpecial ? 'special' : 'move');
    const usedClass = (t.used || !isAvailable) ? 'used' : '';
    const mainText = t.type === 'attack' ? 'ATK' : 'MOVE';
    const subText = t.badgeText ? t.badgeText : (isSpecial ? 'SPECIFIC' : 'COMMON');

    html += `
      <div class="token-pill ${typeClass} ${usedClass}" title="${t.desc || ''}">
        <div class="tok-main">${mainText}</div>
        <div class="tok-sub">${subText}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/* ------------------------------------------------------------------------
   4. STATUS (TURN, TEAMS & CORE GAUGES)
   ------------------------------------------------------------------------ */
export function updateStatus(turn, gameMode, gamePhase = 'BATTLE', turnCount = 1) {
  // Top-Left Turn HUD
  const turnBanner = document.getElementById('turn-banner-text');
  const teamBadge = document.getElementById('turn-team-badge');

  if (turnBanner) {
    if (gamePhase && gamePhase.startsWith('PICK')) {
      turnBanner.innerText = 'DRAFT';
    } else if (gamePhase && gamePhase.startsWith('DEPLOY')) {
      turnBanner.innerText = 'DEPLOY';
    } else {
      turnBanner.innerText = turnCount < 10 ? `0${turnCount}` : `${turnCount}`;
    }
  }

  if (teamBadge) {
    const isBlue = (turn === 'P1' || gamePhase === 'DEPLOY_P1' || gamePhase === 'PICK_P1');
    teamBadge.className = `turn-team-tag ${isBlue ? 'blue' : 'red'}`;
    teamBadge.innerHTML = `<span>${isBlue ? 'BLUE TURN' : 'RED TURN'}</span>`;
  }

  // Fixed Board Top/Bottom Team ULT Gauges
  const isBlueAlly = !isBoardFlipped;
  const allyUlt = getTeamUltGauge(isBlueAlly ? 'P1' : 'P2') || 0;
  const enemyUlt = getTeamUltGauge(isBlueAlly ? 'P2' : 'P1') || 0;
  renderer3D.updateUltGauges(allyUlt, enemyUlt, isBlueAlly);
}

/* ------------------------------------------------------------------------
   5. DEPLOY CONTROL BAR
   ------------------------------------------------------------------------ */
export function updateDeployControlBar({ gamePhase, gameMode = 'pve', myOnlineRole = null }) {
  const bar = document.getElementById('deploy-control-bar');
  const endTurnBtn = document.getElementById('btn-end-turn');

  const isDeployPhase = (
    gamePhase === 'DEPLOY_P1' ||
    gamePhase === 'DEPLOY_P2' ||
    gamePhase === 'DEPLOY_WAIT_P1' ||
    gamePhase === 'DEPLOY_WAIT_P2'
  );

  const allyHud = document.getElementById('ally-ult-hud');
  const enemyHud = document.getElementById('enemy-ult-hud');
  if (allyHud) allyHud.style.display = isDeployPhase ? 'none' : 'flex';
  if (enemyHud) enemyHud.style.display = isDeployPhase ? 'none' : 'flex';

  if (endTurnBtn) {
    endTurnBtn.style.display = (gamePhase === 'BATTLE') ? 'flex' : 'none';
  }

  if (!bar) return;
  bar.style.display = isDeployPhase ? 'flex' : 'none';

  const confirmBtn = document.getElementById('btn-deploy-confirm');
  const confirmText = document.getElementById('btn-deploy-confirm-text');

  if (confirmBtn && confirmText) {
    if (gamePhase === 'DEPLOY_WAIT_P1' || gamePhase === 'DEPLOY_WAIT_P2') {
      confirmBtn.disabled = true;
      confirmText.innerText = '⏳ 相手プレイヤーの配置完了を待機中...';
    } else if (gamePhase === 'DEPLOY_P1') {
      confirmBtn.disabled = false;
      confirmText.innerText = '✅ 先行 (BLUE) 配置完了 ➔';
    } else if (gamePhase === 'DEPLOY_P2') {
      confirmBtn.disabled = false;
      confirmText.innerText = '⚔️ 配置完了・バトル開始！';
    }
  }
}

/* ------------------------------------------------------------------------
   6. UNIT INSPECTOR & TACTICAL SKILLS CONSOLE (CYBER NEO-BRUTALIST)
   ------------------------------------------------------------------------ */
function renderHazardInspector(hazard, pos, turn) {
  const inspector = document.getElementById('unit-inspector');
  if (!inspector) return;

  const isTrap = (hazard.type === 'trap');
  inspector.dataset.category = isTrap ? 'TRAP' : 'HAZARD';
  inspector.classList.remove('enemy-theme');
  inspector.classList.add('hazard-theme');

  // Portrait
  const dossierImg = document.getElementById('dossier-img');
  let targetSrc = 'assets/kinesis.jpg';
  if (hazard.sourceHeroType === 'PHASE' || hazard.type === 'phantom') {
    targetSrc = 'assets/phase.jpg';
  } else if (hazard.sourceHeroType === 'TOXIN' || hazard.type === 'poison') {
    targetSrc = 'assets/toxin.jpg';
  } else if (hazard.sourceHeroType === 'NITRO' || hazard.type === 'trap') {
    targetSrc = 'assets/nitro.jpg';
  }

  const hazardKey = `hazard_${hazard.type}_${pos.r}_${pos.c}`;
  if (dossierImg && (!dossierImg.src.endsWith(targetSrc) || lastRenderedHeroId !== hazardKey)) {
    lastRenderedHeroId = hazardKey;
    if (window.gsap) {
      window.gsap.fromTo(dossierImg, { opacity: 0.35, scale: 1.04 }, { opacity: 1, scale: 1.0, duration: 0.28, ease: 'power2.out' });
    }
    dossierImg.src = targetSrc;
  }

  // Tags
  const classTag = document.getElementById('sheet-class-tag');
  if (classTag) {
    classTag.className = `r2-tag ${isTrap ? 'class-trap' : 'class-haz'}`;
    classTag.innerHTML = `<span>${isTrap ? 'トラップ' : 'ハザード'}</span>`;
  }
  const roleTag = document.getElementById('dossier-role');
  if (roleTag) {
    roleTag.innerHTML = `<span>${hazard.icon || '⚠️'} ZONE</span>`;
  }
  const teamTag = document.getElementById('sheet-team-tag');
  if (teamTag) {
    const isRed = hazard.owner === 'P2';
    const teamLabel = hazard.owner ? (hazard.owner === 'P1' ? 'BLUE' : 'RED') : 'NEUTRAL';
    teamTag.className = `r2-tag team-badge ${isRed ? 'red' : ''}`;
    teamTag.innerHTML = `<span>${teamLabel}</span>`;
  }

  // Name
  document.getElementById('dossier-name').innerText = hazard.name;

  // Stats Strip (Hidden for Hazard & Trap)
  const statsStrip = document.getElementById('sheet-stats-strip');
  if (statsStrip) statsStrip.style.display = 'none';

  // Status Bar (Hidden for Hazard & Trap)
  const statusBar = document.getElementById('sheet-status-bar');
  if (statusBar) statusBar.style.display = 'none';

  // Passive / Effect Block
  const pTag = document.getElementById('dossier-passive-tag');
  if (pTag) pTag.innerText = isTrap ? 'TRIGGER' : 'EFFECT';
  document.getElementById('dossier-passive-title').innerText = hazard.name;
  document.getElementById('dossier-passive-desc').innerText = `${hazard.desc}\n【マス座標】 (${pos.r}, ${pos.c})`;

  // Commands Stack (Hidden for Hazard & Trap)
  const skillCard = document.getElementById('card-cmd-skill');
  const ultCard = document.getElementById('card-cmd-ult');
  if (skillCard) {
    skillCard.style.display = 'none';
    skillCard.onclick = null;
  }
  if (ultCard) {
    ultCard.style.display = 'none';
    ultCard.onclick = null;
  }
}

export function renderHeroControlPanel({
  selectedPos,
  selectedHazardPos,
  turn,
  commandMode,
  gamePhase = 'BATTLE'
}) {
  const inspector = document.getElementById('unit-inspector');
  if (!inspector) return;

  const unit = (selectedPos && board[selectedPos.r]) ? board[selectedPos.r][selectedPos.c] : null;

  if (!unit) {
    // If a hazard tile is selected, render Hazard & Trap Inspector details!
    if (selectedHazardPos) {
      const hazard = getHazardInfoAt(selectedHazardPos.r, selectedHazardPos.c);
      if (hazard) {
        renderHazardInspector(hazard, selectedHazardPos, turn);
        return;
      }
    }

    // Default / Standby Inspector
    inspector.dataset.category = 'UNIT';
    inspector.classList.remove('enemy-theme', 'hazard-theme');

    const classTag = document.getElementById('sheet-class-tag');
    if (classTag) {
      classTag.className = 'r2-tag class-unit';
      classTag.innerHTML = '<span>待機中</span>';
    }
    const roleTag = document.getElementById('dossier-role');
    if (roleTag) roleTag.innerHTML = '<span>⚡ TACTICAL</span>';
    const teamTag = document.getElementById('sheet-team-tag');
    if (teamTag) {
      teamTag.className = 'r2-tag team-badge';
      teamTag.innerHTML = '<span>OPERATOR</span>';
    }

    document.getElementById('dossier-name').innerText = '作戦待機中';

    // Stats Strip
    const statsStrip = document.getElementById('sheet-stats-strip');
    if (statsStrip) statsStrip.style.display = 'grid';

    const cellHp = document.getElementById('cell-hp');
    if (cellHp) cellHp.classList.remove('shield-active');
    const numHp = document.getElementById('num-hp');
    if (numHp) numHp.className = 'r2-num';
    document.getElementById('dossier-hp').innerText = '--';
    document.getElementById('dossier-maxhp').innerText = '';
    const shieldBarWrap = document.getElementById('shield-bar-wrap');
    if (shieldBarWrap) shieldBarWrap.style.display = 'none';
    const barHp = document.getElementById('bar-hp');
    if (barHp) barHp.style.width = '0%';
    const numAtk = document.getElementById('num-atk');
    if (numAtk) numAtk.className = 'r2-num';
    document.getElementById('dossier-atk').innerText = '--';

    // Status Bar
    const statusBar = document.getElementById('sheet-status-bar');
    if (statusBar) statusBar.style.display = 'none';

    // Passive Block
    const pTag = document.getElementById('dossier-passive-tag');
    if (pTag) pTag.innerText = 'INFO';
    document.getElementById('dossier-passive-title').innerText = '作戦指示待機中';
    document.getElementById('dossier-passive-desc').innerText = '盤面上の味方・敵ユニット、オブジェクト、またはハザードマスをクリックして詳細情報とコマンドを展開してください。';

    const skillCard = document.getElementById('card-cmd-skill');
    const ultCard = document.getElementById('card-cmd-ult');
    if (skillCard) {
      skillCard.style.display = 'flex';
      skillCard.classList.add('disabled');
      skillCard.classList.remove('active-targeting');
      document.getElementById('card-skill-title').innerText = 'コマンド待機中';
      document.getElementById('card-skill-desc').innerText = 'ユニットを選択してください。';
      document.getElementById('card-skill-stock').innerText = '--';
      skillCard.onclick = null;
    }
    if (ultCard) {
      ultCard.style.display = 'flex';
      ultCard.classList.add('disabled');
      ultCard.classList.remove('active-targeting');
      document.getElementById('card-ult-title').innerText = 'EXスキル待機中';
      document.getElementById('card-ult-desc').innerText = 'ユニットを選択してください。';
      document.getElementById('card-ult-stock').innerText = '--';
      ultCard.onclick = null;
    }
    return;
  }

  // --- AN ENTITY IS SELECTED ---
  inspector.classList.remove('hazard-theme');
  const isEnemy = unit.owner !== 'P1';
  inspector.classList.toggle('enemy-theme', isEnemy);

  // Check if Object or Unit
  const isObj = (unit.typeKey === 'BARRICADE' || unit.typeKey === 'TURRET');
  inspector.dataset.category = isObj ? 'OBJECT' : 'UNIT';

  // Update Portrait
  const dossierImg = document.getElementById('dossier-img');
  const targetSrc = renderer3D.getHeroImageSrc(unit);
  if (dossierImg && (!dossierImg.src.endsWith(targetSrc) || lastRenderedHeroId !== unit.id)) {
    lastRenderedHeroId = unit.id;
    if (window.gsap) {
      window.gsap.fromTo(dossierImg, { opacity: 0.35, scale: 1.04 }, { opacity: 1, scale: 1.0, duration: 0.28, ease: 'power2.out' });
    }
    dossierImg.src = targetSrc;
  }

  // Tags
  const classTag = document.getElementById('sheet-class-tag');
  if (classTag) {
    classTag.className = `r2-tag ${isObj ? 'class-obj' : 'class-unit'}`;
    classTag.innerHTML = `<span>${isObj ? 'オブジェクト' : 'ユニット'}</span>`;
  }
  const roleTag = document.getElementById('dossier-role');
  if (roleTag) {
    roleTag.innerHTML = `<span>${unit.icon || (isObj ? '🧱' : '⚡')} ${unit.role || unit.typeKey}</span>`;
  }
  const teamTag = document.getElementById('sheet-team-tag');
  if (teamTag) {
    teamTag.className = `r2-tag team-badge ${isEnemy ? 'red' : ''}`;
    teamTag.innerHTML = `<span>${unit.owner === 'P1' ? 'BLUE' : 'RED'}</span>`;
  }

  // Name
  document.getElementById('dossier-name').innerText = unit.name;

  // Stats Strip (Unified HP + Shield, Natural ATK)
  const statsStrip = document.getElementById('sheet-stats-strip');
  if (statsStrip) statsStrip.style.display = 'grid';

  const def = HERO_TYPES[unit.typeKey];
  const maxHp = unit.maxHp || def?.hp || 100;
  const shieldVal = getShieldVal(unit) || 0;
  const totalHp = unit.hp + shieldVal;

  const cellHp = document.getElementById('cell-hp');
  const numHp = document.getElementById('num-hp');
  const shieldBarWrap = document.getElementById('shield-bar-wrap');
  const barShield = document.getElementById('bar-shield');
  const barHp = document.getElementById('bar-hp');

  document.getElementById('dossier-hp').innerText = `${totalHp}`;
  document.getElementById('dossier-maxhp').innerText = `/ ${maxHp}`;
  if (barHp) {
    barHp.style.width = `${Math.max(0, Math.min(100, (unit.hp / maxHp) * 100))}%`;
  }

  if (shieldVal > 0) {
    if (cellHp) cellHp.classList.add('shield-active');
    if (numHp) numHp.className = 'r2-num cyan';
    if (shieldBarWrap) shieldBarWrap.style.display = 'block';
    if (barShield) {
      barShield.style.width = `${Math.max(0, Math.min(100, (shieldVal / maxHp) * 100))}%`;
    }
  } else {
    if (cellHp) cellHp.classList.remove('shield-active');
    if (numHp) numHp.className = 'r2-num';
    if (shieldBarWrap) shieldBarWrap.style.display = 'none';
    if (barShield) barShield.style.width = '0%';
  }

  // ATK
  const effectiveAtk = getEffectiveAtk(unit);
  const baseAtk = def?.atk !== undefined ? def.atk : (unit.atk || 0);
  const numAtk = document.getElementById('num-atk');
  if (numAtk) {
    numAtk.className = effectiveAtk > baseAtk ? 'r2-num buffed' : 'r2-num';
  }
  document.getElementById('dossier-atk').innerText = `${effectiveAtk}`;

  // Status Bar (STATE //) - Shown for UNIT, Hidden for OBJECT
  const statusBar = document.getElementById('sheet-status-bar');
  const statusContainer = document.getElementById('status-badges-container');
  if (!isObj) {
    if (statusBar) statusBar.style.display = 'flex';
    if (statusContainer) {
      const badges = [];
      if (hasDebuff(unit, 'bind')) badges.push({ type: 'debuff', label: '束縛' });
      if (hasDebuff(unit, 'disarm')) badges.push({ type: 'debuff', label: '武装解除' });
      if (hasDebuff(unit, 'vulnerable')) badges.push({ type: 'debuff', label: '脆弱' });
      if (hasDebuff(unit, 'silence')) badges.push({ type: 'debuff', label: '沈黙' });
      if (hasBuff(unit, 'atk_up')) badges.push({ type: 'buff', label: `ATK UP (+${unit.buffs?.atk_up?.val || 0})` });
      if (shieldVal > 0) badges.push({ type: 'shield', label: `SHIELD (${shieldVal})` });

      if (badges.length > 0) {
        statusContainer.innerHTML = badges.map(b => `<span class="status-badge ${b.type}"><span>${b.label}</span></span>`).join('');
      } else {
        statusContainer.innerHTML = '<span class="status-none">状態異常なし</span>';
      }
    }
  } else {
    if (statusBar) statusBar.style.display = 'none';
  }

  // Passive / Spec Block
  const pTag = document.getElementById('dossier-passive-tag');
  if (pTag) pTag.innerText = isObj ? 'SPEC' : 'PASSIVE';

  const passive = def?.passive || {
    name: isObj ? '設置オブジェクト' : '防衛拠点',
    desc: isObj ? '障害物オブジェクト。射線を遮り、ユニットの進路を阻みます。' : '自軍の最重要目標。耐久値が0になると敗北。'
  };

  const footHazard = getHazardInfoAt(selectedPos.r, selectedPos.c);
  if (footHazard) {
    document.getElementById('dossier-passive-title').innerText = `${passive.name} ⚠️【足元に${footHazard.name}】`;
    document.getElementById('dossier-passive-desc').innerText = `${passive.desc}\n⚠️【現在足元の環境効果】: ${footHazard.icon} ${footHazard.name} (${footHazard.desc})`;
  } else {
    document.getElementById('dossier-passive-title').innerText = passive.name;
    document.getElementById('dossier-passive-desc').innerText = passive.desc;
  }

  // Commands Stack
  const skillCard = document.getElementById('card-cmd-skill');
  const ultCard = document.getElementById('card-cmd-ult');
  const isBattle = (gamePhase === 'BATTLE');
  const isMyTurn = isBattle && (unit.owner === turn && isUnit(unit));

  // Friendly Barricade Destruction
  if (unit.typeKey === 'BARRICADE' && isBattle && unit.owner === turn) {
    if (skillCard) {
      skillCard.style.display = 'flex';
      skillCard.classList.remove('disabled', 'active-targeting');
      document.getElementById('card-skill-title').innerText = '🧱 防壁を撤去（自壊）';
      document.getElementById('card-skill-desc').innerText = '行動権を消費せずにこの防壁を即座に破壊して射線や進路を空けます。';
      document.getElementById('card-skill-stock').innerText = 'FREE';
      skillCard.onclick = () => {
        if (window.__onDestroyBarricade) {
          window.__onDestroyBarricade(selectedPos.r, selectedPos.c);
        }
      };
    }
    if (ultCard) {
      ultCard.style.display = 'none';
      ultCard.onclick = null;
    }
    return;
  }

  if (isObj) {
    // Non-controllable object
    if (skillCard) skillCard.style.display = 'none';
    if (ultCard) ultCard.style.display = 'none';
    return;
  }

  // 1. Tactical Skill Card
  const skillA = def?.skills?.A;
  if (skillCard) {
    skillCard.style.display = 'flex';
    if (skillA) {
      const isTargetingA = (commandMode === 'SKILL_A');
      document.getElementById('card-skill-title').innerText = isTargetingA ? `${skillA.name} [対象選択中]` : skillA.name;
      document.getElementById('card-skill-desc').innerText = isTargetingA
        ? '盤面の黄色く光る対象マスをクリック（自己強化はもう一度このカードを押すか自身をクリック）で発動！'
        : skillA.desc;

      const maxStockA = skillA.stock || 2;
      const curStockA = unit.stockA !== undefined ? unit.stockA : maxStockA;
      const dotsA = '●'.repeat(Math.max(0, curStockA)) + '○'.repeat(Math.max(0, maxStockA - curStockA));
      document.getElementById('card-skill-stock').innerText = dotsA;

      const canUseSkill = isMyTurn && (unit.stockA > 0);
      skillCard.classList.toggle('disabled', !canUseSkill);
      skillCard.classList.toggle('active-targeting', isTargetingA);

      skillCard.onclick = () => {
        if (!canUseSkill) return;
        if (window.setCommandMode) window.setCommandMode('SKILL_A');
      };
    } else {
      document.getElementById('card-skill-title').innerText = 'コマンドなし';
      document.getElementById('card-skill-desc').innerText = 'このユニットは行使可能な通常スキルを所持していません。';
      document.getElementById('card-skill-stock').innerText = 'ー';
      skillCard.classList.add('disabled');
      skillCard.classList.remove('active-targeting');
      skillCard.onclick = null;
    }
  }

  // 2. Ultimate Skill Card
  const skillUlt = def?.skills?.ULT;
  if (ultCard) {
    ultCard.style.display = 'flex';
    if (skillUlt) {
      const isTargetingUlt = (commandMode === 'SKILL_ULT');
      document.getElementById('card-ult-title').innerText = isTargetingUlt ? `${skillUlt.name} [対象選択中]` : skillUlt.name;
      document.getElementById('card-ult-desc').innerText = isTargetingUlt
        ? '盤面の黄色く光る対象マスをクリック（自己/全体発動はもう一度このカードを押すか自身をクリック）で発動！'
        : skillUlt.desc;

      const isReady = isUltReady(unit) && !unit.ultUsed;
      const ultDots = unit.ultUsed ? '○' : (isReady ? '●' : '○');
      document.getElementById('card-ult-stock').innerText = ultDots;

      const canUseUlt = isMyTurn && isReady;
      ultCard.classList.toggle('disabled', !canUseUlt);
      ultCard.classList.toggle('active-targeting', isTargetingUlt);

      ultCard.onclick = () => {
        if (!canUseUlt) return;
        if (window.setCommandMode) window.setCommandMode('SKILL_ULT');
      };
    } else {
      document.getElementById('card-ult-title').innerText = 'EXスキルなし';
      document.getElementById('card-ult-desc').innerText = 'このユニットはアルティメットスキルを所持していません。';
      document.getElementById('card-ult-stock').innerText = 'ー';
      ultCard.classList.add('disabled');
      ultCard.classList.remove('active-targeting');
      ultCard.onclick = null;
    }
  }
}

export function renderDeployPanel() {}

/* ------------------------------------------------------------------------
   7. HERO DRAFT SCREEN (PICK MODAL)
   ------------------------------------------------------------------------ */
export function renderPickModal({
  currentOwner = 'P1',
  selectedHeroes = [],
  myPickConfirmed = false,
  isOnline = false,
  selectableHeroKeys = SELECTABLE_HERO_KEYS
} = {}) {
  const slotsContainer = document.getElementById('draft-slots-container');
  const cardsGrid = document.getElementById('pick-cards-grid');
  const counterBadge = document.getElementById('draft-counter-badge');
  const confirmBtn = document.getElementById('pick-confirm-btn');

  const roster = Array.isArray(selectedHeroes) ? selectedHeroes : [];

  if (counterBadge) counterBadge.innerText = `${roster.length} / 5 体`;
  if (confirmBtn) {
    confirmBtn.disabled = (roster.length !== 5 || myPickConfirmed);
    const span = confirmBtn.querySelector('span');
    if (span) {
      span.innerText = myPickConfirmed
        ? '⏳ 相手の編成完了を待機中...'
        : '✅ この編成で決定（初期配置へ ➔）';
    }
  }

  // Render 5 Draft Slots
  if (slotsContainer) {
    let slotsHtml = '';
    for (let i = 0; i < 5; i++) {
      const key = roster[i];
      if (key && HERO_TYPES[key]) {
        const h = HERO_TYPES[key];
        const src = renderer3D.getHeroImageSrc({ typeKey: key });
        slotsHtml += `
          <div class="draft-slot-card filled" onclick="window.__onTogglePickHero('${key}')" title="クリックで選択解除">
            <img class="slot-thumb" src="${src}" alt="${h.name}">
            <div class="slot-info">
              <span class="slot-name">${h.name}</span>
              <span class="slot-role">${h.icon} ${h.role}</span>
            </div>
          </div>
        `;
      } else {
        slotsHtml += `
          <div class="draft-slot-card">
            <span class="slot-empty-text">SLOT 0${i + 1}</span>
          </div>
        `;
      }
    }
    slotsContainer.innerHTML = slotsHtml;
  }

  // Render Hero Cards Grid
  if (cardsGrid) {
    let cardsHtml = '';
    selectableHeroKeys.forEach(key => {
      const h = HERO_TYPES[key];
      if (!h) return;
      const isSelected = roster.includes(key);
      const src = renderer3D.getHeroImageSrc({ typeKey: key });

      cardsHtml += `
        <div class="pick-hero-card ${isSelected ? 'selected' : ''}" onclick="window.__onTogglePickHero('${key}')">
          <img class="pick-card-img" src="${src}" alt="${h.name}">
          <div class="pick-card-overlay"></div>
          <div class="pick-card-content">
            <span class="pick-card-badge">${h.icon} ${h.role}</span>
            <span class="pick-card-name">${h.name}</span>
            <div class="pick-card-stats">
              <span>HP <strong class="pick-stat-hp">${h.maxHp}</strong></span>
              <span>ATK <strong class="pick-stat-atk">${h.atk}</strong></span>
            </div>
          </div>
        </div>
      `;
    });
    cardsGrid.innerHTML = cardsHtml;
  }
}

/* ------------------------------------------------------------------------
   8. MODALS & COMBAT NOTIFICATIONS
   ------------------------------------------------------------------------ */
export function showGameOverModal(winner, reason) {
  const modal = document.getElementById('victory-modal');
  const title = document.getElementById('winner-title');
  const desc = document.getElementById('winner-desc');

  if (title) title.innerText = `${winner === 'P1' ? 'BLUE' : 'RED'} WIN!`;
  if (desc) {
    if (reason === 'annihilation') {
      desc.innerText = `${winner === 'P1' ? 'BLUE' : 'RED'} チームが敵部隊をすべて撃破（部隊全滅）し、作戦勝利を収めました！`;
    } else {
      desc.innerText = `${winner === 'P1' ? 'BLUE' : 'RED'} チームが敵コアを完全破壊し、作戦勝利を収めました！`;
    }
  }
  if (modal) modal.classList.add('active');
}

export function showHazardToast(message) {
  addLog(message, 'system');
}

export function addLog(message, type = 'system') {
  const logBox = document.getElementById('log-box');
  if (!logBox) return;

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerText = message;
  logBox.prepend(entry);
}

export function showDamagePopup(r, c, text, color = '#ffffff') {
  renderer3D.spawnDamagePopup(r, c, text, color);
}

export function playAttackAnimation(attackerPos, targetPos, isUlt = false, onComplete) {
  renderer3D.playAttackAnimation(attackerPos, targetPos, isUlt, onComplete);
}

export function playCutin(unit, isUlt = true, onComplete) {
  renderer3D.playCutin(unit, isUlt, onComplete);
}
