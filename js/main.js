/* ==============================================================
   main.js: ゲーム進行コントローラー (フェーズ管理・入力制御・通信連携)
   ============================================================== */
import {
  ROWS,
  COLS,
  DEPLOYABLE_ROWS,
  SELECTABLE_HERO_KEYS,
  DEFAULT_ROSTER,
  DEFAULT_AI_ROSTER,
  HERO_TYPES
} from './config.js?v=urban-v1';
import {
  board,
  initBoard,
  getValidMoves,
  getValidAttacks,
  getValidSkillTargets,
  hasDebuff,
  spawnHero,
  getDeployedPieces,
  applyDefaultPlacement,
  getHazardInfoAt,
  hasActionToken,
  resetActionTokens,
  resetTurnPassives,
  phantomZones,
  isUnit,
  isLocalPlayer,
  setLocalPlayerRole
} from './board.js?v=urban-v1';
import {
  executeMove,
  executeAttack,
  executeSkill,
  destroyBarricade,
  tickTurnEffects,
  processTurretAttacks,
  processTurnStartHazards,
  processTurnEndPassives
} from './actions.js?v=urban-v13';
import {
  tileElements,
  createBoardDOMOnce,
  updateBoardView,
  updateTargetingPreview,
  updateRightsDisplay,
  updateStatus,
  updateDeployControlBar,
  updateHoldActionButton,
  renderHeroControlPanel,
  renderDeployPanel,
  renderPickModal,
  showGameOverModal,
  showHazardToast,
  addLog,
  setBoardPerspective,
  setPhaseInstruction
} from './ui.js?v=urban-v13';
import { runAITurn } from './ai.js?v=urban-v13';
import { network } from './network.js?v=urban-v1';
import { initUrbanUI, clearUltFxState, playFinisherFX } from './urban-ui.js?v=urban-v13';

// ゲーム進行ステート
// 'TITLE' -> 'PICK_P1' -> 'DEPLOY_P1' -> 'DEPLOY_P2' -> 'BATTLE'
let gamePhase = 'TITLE';
let turn = 'P1';
let turnCount = 1;
let gameMode = 'pve';     // 'pve' or 'online'
let myOnlineRole = null;  // 'P1' (先行/ホスト) or 'P2' (後攻/ゲスト) or null
let isGameOver = false;
let aiTurnTimeoutId = null;

// オンラインピックの同期状態
let myPickConfirmed = false;
let opponentPickConfirmed = false;

// チームごとの選択キャラクター（各チーム5体）
let teamRoster = {
  P1: [...DEFAULT_ROSTER],
  P2: [...DEFAULT_AI_ROSTER]
};
let tempPickedHeroes = [];

// 選択・コマンドステート
let selectedPos = null;
let selectedHazardPos = null;
let selectedDeployPos = null;
let commandMode = null; // 'MOVE', 'ATTACK', 'SKILL_A', 'SKILL_ULT'
let validTargets = [];
let hoveredPos = null;

function clearAITimeout() {
  if (aiTurnTimeoutId) {
    clearTimeout(aiTurnTimeoutId);
    aiTurnTimeoutId = null;
  }
}

function selectFirstDeployPiece(owner) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] && board[r][c].owner === owner) {
        selectedPos = { r, c };
        selectedDeployPos = { r, c };
        return;
      }
    }
  }
}

export function updateModeBadge() {
  const badge = document.getElementById('current-mode-badge');
  if (!badge) return;
  if (gameMode === 'online') {
    const roleText = (myOnlineRole === 'P1') ? 'P1' : (myOnlineRole === 'P2' ? 'P2' : 'WAIT');
    badge.className = `mode-pill current-mode-badge ${myOnlineRole === 'P1' ? 'online-p1' : (myOnlineRole === 'P2' ? 'online-p2' : '')}`;
    badge.innerText = `ONLINE // ${roleText}`;
  } else {
    badge.className = 'mode-pill current-mode-badge';
    badge.innerText = 'SOLO // vs AI';
  }
}

export function initGame() {
  clearAITimeout();
  clearUltFxState();
  initBoard();
  resetActionTokens('P1');
  resetActionTokens('P2');

  setLocalPlayerRole('P1');
  gamePhase = 'PICK_P1';
  turn = 'P1';
  turnCount = 1;
  isGameOver = false;

  myPickConfirmed = false;
  opponentPickConfirmed = false;

  teamRoster = {
    P1: [...DEFAULT_ROSTER],
    P2: [...DEFAULT_AI_ROSTER]
  };
  tempPickedHeroes = [...DEFAULT_ROSTER];

  selectedPos = null;
  selectedHazardPos = null;
  selectedDeployPos = null;
  commandMode = null;
  validTargets = [];

  const logBox = document.getElementById('log-box');
  if (logBox) logBox.innerHTML = '';
  addLog("🎮 CYBER TACTICS へようこそ！", "system");
  addLog("【先行・自軍】キャラクター選択フェーズ：全ロールから自由に5体を選んでください。", "system");
  setPhaseInstruction("【キャラクター選択】全ロールの中から好きな5体を選んで [この編成で決定] を押してください");

  const victoryModal = document.getElementById('victory-modal');
  if (victoryModal) victoryModal.classList.remove('active');

  renderAll();
  renderPickModal({
    currentOwner: 'P1',
    selectedHeroes: tempPickedHeroes
  });
}

function renderAll() {
  updateModeBadge();
  const isDeployPhase = (
    gamePhase === 'DEPLOY_P1' ||
    gamePhase === 'DEPLOY_P2' ||
    gamePhase === 'DEPLOY_WAIT_P1' ||
    gamePhase === 'DEPLOY_WAIT_P2'
  );
  const isPickPhase = (gamePhase === 'PICK_P1' || gamePhase === 'PICK_P2');

  const bannerEl = document.getElementById('action-status-banner');
  if (bannerEl) {
    bannerEl.style.display = (isDeployPhase || isPickPhase) ? 'none' : 'flex';
  }

  const isDeployWait = (gameMode === 'online' && (
    gamePhase === 'DEPLOY_WAIT_P1' ||
    gamePhase === 'DEPLOY_WAIT_P2' ||
    (gamePhase === 'DEPLOY_P1' && myOnlineRole === 'P2') ||
    (gamePhase === 'DEPLOY_P2' && myOnlineRole === 'P1')
  ));

  if (isDeployWait) {
    renderDeployPanel({
      gamePhase,
      gameMode,
      myOnlineRole
    });
  } else if (!isPickPhase) {
    const curOwner = (gamePhase === 'DEPLOY_P1') ? 'P1' : ((gamePhase === 'DEPLOY_P2') ? 'P2' : turn);
    if (!isDeployPhase) {
      updateRightsDisplay(turn, selectedPos, gamePhase);
    }
    renderHeroControlPanel({
      turn: curOwner,
      selectedPos,
      selectedHazardPos,
      commandMode: isDeployPhase ? null : commandMode,
      gamePhase,
      canControl: !isGameOver && gamePhase === 'BATTLE' && (gameMode === 'online' ? turn === myOnlineRole : turn === 'P1')
    });
  }

  updateStatus(turn, gameMode, gamePhase, turnCount);
  updateDeployControlBar({ gamePhase, gameMode, myOnlineRole });
  updateHoldActionButton({ gamePhase, turn, gameMode, myOnlineRole, isGameOver });

  // オンライン対戦時の相手手番案内調整（#turn-badge は updateStatus の YOUR TURN / ENEMY TURN を使用）
  if (gameMode === 'online') {
    if (gamePhase === 'BATTLE' && turn !== myOnlineRole) {
      setPhaseInstruction("⏳ 相手のターンです（思考中... 相手の駒をクリックすると偵察可能）");
    }
  }

  const curViewTurn = (gamePhase === 'DEPLOY_P1' || gamePhase === 'PICK_P1' || gamePhase === 'DEPLOY_WAIT_P2')
    ? 'P1'
    : ((gamePhase === 'DEPLOY_P2' || gamePhase === 'PICK_P2' || gamePhase === 'DEPLOY_WAIT_P1') ? 'P2' : turn);

  updateBoardView({
    turn: curViewTurn,
    selectedPos,
    selectedHazardPos,
    commandMode,
    validTargets,
    hoveredPos,
    gameMode,
    myOnlineRole,
    gamePhase,
    onPieceDragStartCallback: onPieceDragStart,
    onPieceDragEndCallback: onPieceDragEnd
  });
}

function onTileHover(pos) {
  const prev = hoveredPos;
  hoveredPos = pos;
  if (!commandMode || !commandMode.startsWith('SKILL_')) return;
  if (prev?.r === pos?.r && prev?.c === pos?.c) return;
  if (gamePhase !== 'BATTLE' || (gameMode === 'pve' && turn === 'P2')) return;
  if (gameMode === 'online' && turn !== myOnlineRole) return;
  updateTargetingPreview({
    turn,
    selectedPos,
    commandMode,
    validTargets,
    hoveredPos,
    gamePhase
  });
}

// タイルクリック処理 (移動・攻撃のクリック実行は廃止され、ドラッグ＆ドロップのみ)
function onTileClick(r, c) {
  if (isGameOver) return;

  // =============================================================
  // 1. 初期配置フェーズ
  // =============================================================
  if (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2' || gamePhase === 'DEPLOY_WAIT_P1' || gamePhase === 'DEPLOY_WAIT_P2') {
    if (gameMode === 'online') {
      if (gamePhase === 'DEPLOY_P1' && myOnlineRole !== 'P1') return;
      if (gamePhase === 'DEPLOY_P2' && myOnlineRole !== 'P2') return;
      if (gamePhase === 'DEPLOY_WAIT_P1' || gamePhase === 'DEPLOY_WAIT_P2') return;
    }
    const curOwner = (gamePhase === 'DEPLOY_P1') ? 'P1' : 'P2';
    const clickedUnit = board[r][c];

    if (clickedUnit) {
      if (clickedUnit.owner === curOwner) {
        if (selectedDeployPos && selectedDeployPos.r === r && selectedDeployPos.c === c) {
          selectedDeployPos = null;
          clearSelection();
          return;
        }
        selectedDeployPos = { r, c };
        selectedPos = { r, c };
        addLog(`📌 ${clickedUnit.name} を選択中。自陣内の空きマスへドラッグ、または味方へドラッグで位置スワップできます。`, curOwner.toLowerCase());
        renderAll();
      } else {
        selectedPos = { r, c };
        addLog(`🔍 ${isLocalPlayer(clickedUnit.owner) ? '自軍' : '敵軍'}の ${clickedUnit.name} を偵察中。`, 'system');
        renderAll();
      }
      return;
    }

    // 空きマスをクリックした場合は選択解除 (配置変更はドラッグ＆ドロップのみ)
    selectedDeployPos = null;
    clearSelection();
    return;
  }

  // =============================================================
  // 2. 通常バトルフェーズ (BATTLE)
  // =============================================================
  if (gameMode === 'pve' && turn === 'P2') return;
  const isOnlineOpponentTurn = (gameMode === 'online' && turn !== myOnlineRole);

  const clickedUnit = board[r][c];

  // A. スキル対象選択中 (SKILL_A, SKILL_ULT)
  if (commandMode && commandMode.startsWith('SKILL_')) {
    if (isOnlineOpponentTurn) return;
    const isTarget = validTargets.some(t => t.r === r && t.c === c);

    if (isTarget) {
      const slot = commandMode.replace('SKILL_', '');
      if (gameMode === 'online') {
        network.send('ACTION', {
          action: 'SKILL',
          heroPos: { r: selectedPos.r, c: selectedPos.c },
          targetPos: { r, c },
          slot
        });
      }

      const casterUnit = board[selectedPos.r]?.[selectedPos.c];
      const casterId = casterUnit ? casterUnit.id : null;

      executeSkill(selectedPos, { r, c }, slot, triggerGameOver);

      let newHeroPos = null;
      if (casterId) {
        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            if (board[row][col] && board[row][col].id === casterId) {
              newHeroPos = { r: row, c: col };
              break;
            }
          }
          if (newHeroPos) break;
        }
      }

      selectedPos = newHeroPos;
      commandMode = null;
      validTargets = [];
      hoveredPos = null;
      setPhaseInstruction("スキル発動完了！続けて他の駒をドラッグして操作するか、他に行動がなければ [ターン終了] を押してください");
      renderAll();
      return;
    } else {
      if (clickedUnit && clickedUnit.owner === turn) {
        selectHero(r, c);
        return;
      }
      commandMode = null;
      validTargets = [];
      hoveredPos = null;
      renderAll();
      setPhaseInstruction("行動を選んでください（駒をドラッグして移動/攻撃、またはスキルカード）");
      return;
    }
  }

  // B. クリック操作 (移動・攻撃のクリック実行は廃止され、ドラッグ＆ドロップのみ)
  // 選択中の駒を再度クリックした場合は選択解除
  if (selectedPos && selectedPos.r === r && selectedPos.c === c) {
    clearSelection();
    return;
  }

  // 駒（自軍・敵軍・防壁・コア）をクリックした場合は選択/偵察切り替え
  if (clickedUnit) {
    selectedHazardPos = null;
    selectHero(r, c);
    return;
  }

  // 空きマスをクリックした場合：ハザードの確認、または選択解除
  const hazard = getHazardInfoAt(r, c);
  if (hazard) {
    selectedHazardPos = { r, c };
    selectedPos = null;
    commandMode = null;
    validTargets = [];
    setPhaseInstruction(`${hazard.icon} 【${hazard.name}】(${hazard.category}): ${hazard.desc}`);
    addLog(`📌 [${r},${c}] のハザード確認: ${hazard.icon} ${hazard.name} (${hazard.owner ? (isLocalPlayer(hazard.owner) ? '自軍' : '敵軍') : '中立'}) - ${hazard.desc}`, 'system');
    renderAll();
    showHazardToast(r, c, hazard);
  } else {
    clearSelection();
  }
}

function selectHero(r, c) {
  selectedPos = { r, c };
  selectedHazardPos = null;
  commandMode = null;
  validTargets = [];
  hoveredPos = null;

  const unit = board[r]?.[c];
  if (!unit) return;

  const footHazard = getHazardInfoAt(r, c);
  const hazardNote = footHazard ? ` 【足元: ${footHazard.icon}${footHazard.name}】` : '';

  if (unit.owner !== turn) {
    setPhaseInstruction(`🔍 ${unit.name} (敵${unit.typeKey === 'BARRICADE' ? '防壁' : 'ユニット'}) を偵察中。${hazardNote}ステータスを確認できます`);
  } else if (unit.typeKey === 'BARRICADE') {
    setPhaseInstruction(`🧱 ${unit.name} を選択中。${hazardNote}「防壁を破壊する」ボタンで撤去できます`);
  } else {
    setPhaseInstruction(`${unit.name} を選択中。${hazardNote}緑枠へドラッグで移動、赤枠の敵へドラッグで攻撃、またはスキルカードを使用！`);
  }

  renderAll();
}

export function clearSelection() {
  selectedPos = null;
  selectedHazardPos = null;
  commandMode = null;
  validTargets = [];
  hoveredPos = null;
  setPhaseInstruction("自軍キャラクターをドラッグ＆ドロップで移動/攻撃、またはクリックでステータス・スキル確認");
  renderAll();
}

export function setCommandMode(mode) {
  if (isGameOver || gamePhase !== 'BATTLE' || (gameMode === 'pve' && turn !== 'P1')) return;
  if (gameMode === 'online' && turn !== myOnlineRole) return;
  if (!selectedPos) return;
  const { r, c } = selectedPos;
  if (!board[r]?.[c] || board[r][c].owner !== turn || !isUnit(board[r][c])) return;

  if (commandMode === mode) {
    commandMode = null;
    validTargets = [];
    hoveredPos = null;
    setPhaseInstruction("スキルの選択を解除しました");
    renderAll();
    return;
  }

  hoveredPos = null;

  if (mode === 'SKILL_A') {
    const targets = getValidSkillTargets(r, c, 'A');
    if (targets.length === 0) {
      commandMode = null;
      validTargets = [];
      setPhaseInstruction("⚠️ 現在このスキルの有効な対象が盤面にありません");
      addLog(`⚠️ ${board[r][c].name} のスキルは現在有効な対象がないため発動できません。`, 'system');
      renderAll();
      return;
    }
    commandMode = mode;
    validTargets = targets;
    setPhaseInstruction("🅰️ スキルの対象をクリックしてください（もう一度押すと解除）");
  } else if (mode === 'SKILL_ULT') {
    const targets = getValidSkillTargets(r, c, 'ULT');
    if (targets.length === 0) {
      commandMode = null;
      validTargets = [];
      setPhaseInstruction("⚠️ 現在このアルティメットの有効な対象が盤面にありません");
      addLog(`⚠️ ${board[r][c].name} のアルティメットは現在有効な対象がないため発動できません。`, 'system');
      renderAll();
      return;
    }
    commandMode = mode;
    validTargets = targets;
    setPhaseInstruction("🌟 アルティメットの対象をクリックしてください！（もう一度押すと解除）");
  }

  renderAll();
}

export function handleDestroyBarricade(r, c) {
  if (isGameOver) return;
  if (gamePhase !== 'BATTLE') return;
  if (gameMode === 'online' && turn !== myOnlineRole) return;

  const unit = board[r]?.[c];
  if (!unit || unit.typeKey !== 'BARRICADE' || unit.owner !== turn) return;

  if (gameMode === 'online') {
    network.send('ACTION', {
      action: 'DESTROY_BARRICADE',
      pos: { r, c }
    });
  }

  destroyBarricade(r, c);
  clearSelection();
}

window.__onDestroyBarricade = (r, c) => {
  if (r !== undefined && c !== undefined) {
    handleDestroyBarricade(r, c);
  } else if (selectedPos) {
    handleDestroyBarricade(selectedPos.r, selectedPos.c);
  }
};

window.__onInspectHazardAt = (r, c) => {
  const hazard = getHazardInfoAt(r, c);
  if (hazard) {
    selectedHazardPos = { r, c };
    selectedPos = null;
    commandMode = null;
    validTargets = [];
    setPhaseInstruction(`${hazard.icon} 【${hazard.name}】(${hazard.category}): ${hazard.desc}`);
    addLog(`📌 [${r},${c}] のハザード確認: ${hazard.icon} ${hazard.name} (${hazard.owner ? (isLocalPlayer(hazard.owner) ? '自軍' : '敵軍') : '中立'}) - ${hazard.desc}`, 'system');
    renderAll();
    showHazardToast(r, c, hazard);
  }
};

window.__onSelectUnitAt = (r, c) => {
  if (board[r]?.[c]) {
    selectHero(r, c);
  }
};

export function manualEndTurn() {
  if (isGameOver) return;
  if (gamePhase !== 'BATTLE') return;

  if (gameMode === 'pve' && turn === 'P2') return;

  if (gameMode === 'online' && turn !== myOnlineRole) return;

  if (gameMode === 'online' && turn === myOnlineRole) {
    network.send('ACTION', { action: 'END_TURN' });
  }

  addLog(`${isLocalPlayer(turn) ? '自軍' : '敵軍'} がターンを終了しました`, turn.toLowerCase());
  executeTurnChange();
}

function executeTurnChange() {
  clearAITimeout();

  // 1. 直前の手番プレイヤーのタレット自動射撃
  processTurretAttacks(turn, triggerGameOver);
  if (isGameOver) return;

  // 2. 直前の手番プレイヤーのターン終了時パッシブ効果
  processTurnEndPassives(turn);

  // 3. 直前の手番プレイヤーのバフ・デバフ持続ターン減算
  tickTurnEffects(turn);
  if (isGameOver) return;

  selectedPos = null;
  commandMode = null;
  validTargets = [];

  // 手番交代
  if (turn === 'P1') {
    turn = 'P2';
  } else {
    turn = 'P1';
    turnCount++;
  }

  // 新手番プレイヤーの行動トークンを全回復
  resetActionTokens(turn);

  // 新手番プレイヤーのターン開始時パッシブ状態を更新
  resetTurnPassives(turn);

  // 4. ターン開始時ハザード効果
  processTurnStartHazards(turn, triggerGameOver);
  if (isGameOver) return;

  renderAll();

  setPhaseInstruction(
    isLocalPlayer(turn)
      ? "自軍ターン: キャラクターを持ち上げてドラッグ（移動/攻撃）、またはクリックでスキル確認"
      : "敵軍ターン: 相手の行動を確認してください"
  );

  if (gameMode === 'pve' && turn === 'P2' && !isGameOver) {
    // AIウォッチドッグタイマー: 万一8秒以内にAIが終了しない場合は強制的にP1へ手番を戻す
    aiTurnTimeoutId = setTimeout(() => {
      if (gameMode === 'pve' && turn === 'P2' && !isGameOver) {
        console.warn("AI turn watchdog triggered: forcing turn change back to P1.");
        aiTurnTimeoutId = null;
        executeTurnChange();
      }
    }, 8000);

    runAITurn({
      onGameOver: (winner, reason, context) => {
        clearAITimeout();
        triggerGameOver(winner, reason, context);
      },
      onEndTurnCallback: () => {
        clearAITimeout();
        if (gameMode === 'pve' && turn === 'P2' && !isGameOver) {
          executeTurnChange();
        }
      },
      updateViewCallback: renderAll
    });
  }
}

function triggerGameOver(winner, reason = 'core', context = null) {
  if (isGameOver) return;
  isGameOver = true;
  clearAITimeout();
  if (document.getElementById('finisher-overlay')) {
    playFinisherFX({
      winner,
      reason,
      myRole: myOnlineRole,
      gameMode,
      context,
      onPlayAgain: resetGame,
      onTitle: showTitleScreen
    });
  } else {
    showGameOverModal(winner, reason, myOnlineRole, gameMode);
  }
}

export function switchScreen(screenName) {
  const screens = {
    title: document.getElementById('screen-title'),
    pick: document.getElementById('screen-pick'),
    battle: document.getElementById('screen-battle')
  };
  for (const [key, el] of Object.entries(screens)) {
    if (el) {
      el.classList.toggle('active', key === screenName);
    }
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function showTitleScreen() {
  clearAITimeout();
  clearUltFxState();
  switchScreen('title');
  const victoryModal = document.getElementById('victory-modal');
  if (victoryModal) victoryModal.classList.remove('active');
  network.close();
  myOnlineRole = null;
  gamePhase = 'TITLE';
  setLocalPlayerRole('P1');
  setBoardPerspective(false);
}

export function resetGame() {
  clearAITimeout();
  clearUltFxState();
  if (gameMode === 'online') {
    showTitleScreen();
  } else {
    switchScreen('pick');
    initGame();
  }
}

// ドラッグ開始 (駒をつかんだ時)
function onPieceDragStart(r, c) {
  if (isGameOver) return;

  if (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2') {
    if (gameMode === 'online') {
      if (gamePhase === 'DEPLOY_P1' && myOnlineRole !== 'P1') return;
      if (gamePhase === 'DEPLOY_P2' && myOnlineRole !== 'P2') return;
    }
    const curOwner = (gamePhase === 'DEPLOY_P1') ? 'P1' : 'P2';
    const u = board[r][c];
    if (!u || u.owner !== curOwner) return;

    selectedDeployPos = { r, c };
    setPhaseInstruction(`${u.name} を自陣の空きマスへドラッグ＆ドロップ！`);
    renderAll();
    return;
  }

  if (gameMode === 'pve' && turn === 'P2') return;
  if (gameMode === 'online' && turn !== myOnlineRole) return;

  const hero = board[r][c];
  if (!hero || hero.owner !== turn || !isUnit(hero)) return;

  selectedPos = { r, c };
  commandMode = null;
  validTargets = [];

  const canMove = hasActionToken(turn, 'move', 1, hero) && !hasDebuff(hero, 'bind');
  const canAttack = hasActionToken(turn, 'attack', 1, hero) && !hasDebuff(hero, 'disarm');

  renderAll();

  if (canMove && canAttack) {
    setPhaseInstruction(`${hero.name}: 緑枠へドロップで移動、赤枠の敵へドロップで攻撃！`);
  } else if (canMove) {
    setPhaseInstruction(`${hero.name}: 緑枠へドロップで移動！`);
  } else if (canAttack) {
    setPhaseInstruction(`${hero.name}: 赤枠の敵へドロップで攻撃！`);
  }
}

// ドラッグ終了
function onPieceDragEnd() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      tileElements[r]?.[c]?.classList.remove('drag-over-valid', 'drag-over-attack');
    }
  }
  renderAll();
}

// ドロップ処理
function onPieceDrop(fromR, fromC, toR, toC) {
  if (isGameOver) return;

  if (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2') {
    if (gameMode === 'online') {
      if (gamePhase === 'DEPLOY_P1' && myOnlineRole !== 'P1') return;
      if (gamePhase === 'DEPLOY_P2' && myOnlineRole !== 'P2') return;
    }
    const curOwner = (gamePhase === 'DEPLOY_P1') ? 'P1' : 'P2';
    const unit = board[fromR][fromC];
    if (!unit || unit.owner !== curOwner) return;

    if (!DEPLOYABLE_ROWS[curOwner].includes(toR)) {
      addLog(`⚠️ そこは自陣の縦2マス以内ではありません！`, 'system');
      return;
    }

    if (fromR === toR && fromC === toC) {
      selectedPos = { r: toR, c: toC };
      selectedDeployPos = { r: toR, c: toC };
      renderAll();
      return;
    }

    const targetUnit = board[toR][toC];
    if (!targetUnit) {
      board[toR][toC] = unit;
      board[fromR][fromC] = null;
      if (typeof unit.setPosition === 'function') {
        unit.setPosition(toR, toC);
      } else {
        unit.r = toR;
        unit.c = toC;
      }
      addLog(`🔄 ${unit.name} の位置を変更しました。`, curOwner.toLowerCase());
      selectedPos = { r: toR, c: toC };
      selectedDeployPos = { r: toR, c: toC };
      renderAll();
    } else if (targetUnit.owner === curOwner) {
      board[toR][toC] = unit;
      board[fromR][fromC] = targetUnit;
      if (typeof unit.setPosition === 'function') {
        unit.setPosition(toR, toC);
      } else {
        unit.r = toR;
        unit.c = toC;
      }
      if (typeof targetUnit.setPosition === 'function') {
        targetUnit.setPosition(fromR, fromC);
      } else {
        targetUnit.r = fromR;
        targetUnit.c = fromC;
      }
      addLog(`🔀 ${unit.name} と ${targetUnit.name} の配置位置を入れ替えました！`, curOwner.toLowerCase());
      selectedPos = { r: toR, c: toC };
      selectedDeployPos = { r: toR, c: toC };
      renderAll();
    } else {
      addLog(`⚠️ 相手の駒の上には配置できません！`, 'system');
    }
    return;
  }

  // バトル中のドロップ
  if (gameMode === 'pve' && turn === 'P2') return;
  if (gameMode === 'online' && turn !== myOnlineRole) return;

  const hero = board[fromR][fromC];
  if (!hero || hero.owner !== turn || !isUnit(hero)) return;

  const destUnit = board[toR][toC];
  const enemyOwner = (turn === 'P1') ? 'P2' : 'P1';

  // 1. 敵の上へドロップ ➔ 通常攻撃
  if (destUnit && destUnit.owner === enemyOwner) {
    if (!hasActionToken(turn, 'attack', 1, hero)) {
      addLog(`⚠️ このターンの攻撃トークンはすでに消費済みです！`, 'system');
      renderAll();
      return;
    }
    if (hasDebuff(hero, 'disarm')) {
      addLog(`💢 ${hero.name} は【攻撃阻害】のため攻撃できません！`, 'system');
      renderAll();
      return;
    }

    const validAtks = getValidAttacks(fromR, fromC);
    if (validAtks.some(a => a.r === toR && a.c === toC)) {
      if (gameMode === 'online' && turn === myOnlineRole) {
        network.send('ACTION', {
          action: 'ATTACK',
          from: { r: fromR, c: fromC },
          to: { r: toR, c: toC }
        });
      }
      executeAttack({ r: fromR, c: fromC }, { r: toR, c: toC }, triggerGameOver);
      setPhaseInstruction("攻撃完了！続けて [移動] または [スキルカード]、他に行動がなければ [ターン終了] を選べます");
      renderAll();
    } else {
      addLog(`そこは ${hero.name} の通常攻撃の射程外です`, 'system');
      renderAll();
    }
    return;
  }

  // 2. 空きマスへドロップ ➔ 移動
  if (!destUnit) {
    if (!hasActionToken(turn, 'move', 1, hero)) {
      addLog(`⚠️ このターンの移動トークン（専用トークン含む）はすでに消費済みです！`, 'system');
      renderAll();
      return;
    }
    if (hasDebuff(hero, 'bind')) {
      addLog(`⛓️ ${hero.name} は【行動阻害】のため移動できません！`, 'system');
      renderAll();
      return;
    }

    const validMoves = getValidMoves(fromR, fromC);
    if (validMoves.some(m => m.r === toR && m.c === toC)) {
      if (gameMode === 'online' && turn === myOnlineRole) {
        network.send('ACTION', {
          action: 'MOVE',
          from: { r: fromR, c: fromC },
          to: { r: toR, c: toC }
        });
      }
      selectedPos = executeMove({ r: fromR, c: fromC }, { r: toR, c: toC }, triggerGameOver);
      setPhaseInstruction("移動完了！続けて [敵へドラッグして通常攻撃] または [スキルカード]、他に行動がなければ [ターン終了] を選べます");
      renderAll();
    } else {
      addLog(`そこは ${hero.name} の移動範囲外です`, 'system');
      renderAll();
    }
  }
}

// ==============================================================
// キャラクターピック＆初期配置ハンドラー
// ==============================================================
window.__onTogglePickHero = (key) => {
  if (gameMode === 'online' && myPickConfirmed) return;

  if (tempPickedHeroes.includes(key)) {
    tempPickedHeroes = tempPickedHeroes.filter(k => k !== key);
  } else if (tempPickedHeroes.length < 5) {
    tempPickedHeroes.push(key);
  } else {
    alert("選択できるユニットは最大5体です。不要なユニットの選択を解除してください。");
    return;
  }

  const curOwner = (gameMode === 'online') ? myOnlineRole : 'P1';
  renderPickModal({
    currentOwner: curOwner,
    selectedHeroes: tempPickedHeroes,
    myPickConfirmed,
    isOnline: (gameMode === 'online')
  });
};

window.__onAutoPick = () => {
  if (gameMode === 'online' && myPickConfirmed) return;
  const pool = [...SELECTABLE_HERO_KEYS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  tempPickedHeroes = pool.slice(0, 5);
  const curOwner = (gameMode === 'online') ? myOnlineRole : 'P1';
  renderPickModal({
    currentOwner: curOwner,
    selectedHeroes: tempPickedHeroes,
    myPickConfirmed,
    isOnline: (gameMode === 'online')
  });
};

window.__onClearPick = () => {
  if (gameMode === 'online' && myPickConfirmed) return;
  tempPickedHeroes = [];
  const curOwner = (gameMode === 'online') ? myOnlineRole : 'P1';
  renderPickModal({
    currentOwner: curOwner,
    selectedHeroes: tempPickedHeroes,
    myPickConfirmed,
    isOnline: (gameMode === 'online')
  });
};

window.__onConfirmPick = () => {
  if (tempPickedHeroes.length !== 5) {
    alert("5体のユニットを選択してください！");
    return;
  }

  if (gameMode === 'online') {
    teamRoster[myOnlineRole] = [...tempPickedHeroes];
    myPickConfirmed = true;
    addLog(`✅ 【自軍 (${myOnlineRole})】チーム編成決定: ${teamRoster[myOnlineRole].map(k => HERO_TYPES[k].name).join(', ')}`, myOnlineRole.toLowerCase());

    network.send('ONLINE_PICK_CONFIRM', { roster: teamRoster[myOnlineRole] });

    if (opponentPickConfirmed) {
      startOnlineDeployPhase();
    } else {
      addLog(`⏳ 相手プレイヤーのチーム編成完了を待機中...`, 'system');
      renderPickModal({
        currentOwner: myOnlineRole,
        selectedHeroes: tempPickedHeroes,
        myPickConfirmed: true,
        isOnline: true
      });
    }
    return;
  }

  // vs AI (ソロプレイ)
  teamRoster.P1 = [...tempPickedHeroes];
  addLog(`✅ 自軍 チーム編成決定: ${teamRoster.P1.map(k => HERO_TYPES[k].name).join(', ')}`, 'p1');

  teamRoster.P2 = [...DEFAULT_AI_ROSTER];
  addLog(`🤖 敵軍 (AI) 編成決定: ${teamRoster.P2.map(k => HERO_TYPES[k].name).join(', ')}`, 'p2');

  switchScreen('battle');
  gamePhase = 'DEPLOY_P1';
  applyDefaultPlacement('P1', teamRoster.P1);
  selectFirstDeployPiece('P1');

  addLog("【先行・自軍】初期配置フェーズ：自陣（縦2マス以内）に配置してください。", "system");
  setPhaseInstruction("【先行・自軍 初期配置】この布陣で良ければ「配置完了」を押してください（駒のドラッグで位置調整も可能）");
  renderAll();
};

window.__onAutoDeploy = () => {
  const curOwner = (gameMode === 'online') ? myOnlineRole : ((gamePhase === 'DEPLOY_P1') ? 'P1' : 'P2');
  if (gameMode === 'online') {
    if (myOnlineRole === 'P1' && gamePhase !== 'DEPLOY_P1') return;
    if (myOnlineRole === 'P2' && gamePhase !== 'DEPLOY_P2') return;
  }
  applyDefaultPlacement(curOwner, teamRoster[curOwner]);
  selectedDeployPos = null;
  addLog(`🎲 ${isLocalPlayer(curOwner) ? '自軍' : '敵軍'} のおすすめ配置を展開しました！`, curOwner.toLowerCase());
  renderAll();
};

window.__onClearDeploy = () => {
  const curOwner = (gameMode === 'online') ? myOnlineRole : ((gamePhase === 'DEPLOY_P1') ? 'P1' : 'P2');
  if (gameMode === 'online') {
    if (myOnlineRole === 'P1' && gamePhase !== 'DEPLOY_P1') return;
    if (myOnlineRole === 'P2' && gamePhase !== 'DEPLOY_P2') return;
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] && board[r][c].owner === curOwner) {
        board[r][c] = null;
      }
    }
  }
  selectedDeployPos = null;
  addLog(`🗑️ ${isLocalPlayer(curOwner) ? '自軍' : '敵軍'} の配置を全クリアしました。`, curOwner.toLowerCase());
  renderAll();
};

window.__onConfirmDeploy = () => {
  if (gameMode === 'online') {
    if (myOnlineRole === 'P1' && gamePhase === 'DEPLOY_P1') {
      const deployed = getDeployedPieces('P1');
      const expectedCount = teamRoster.P1.length + 1;
      if (deployed.length < expectedCount) {
        alert(`6体すべてのユニット（コア＋選択した5ヒーロー）を自陣に配置してください！(現在: ${deployed.length}/${expectedCount})`);
        return;
      }

      const pieces = deployed.map(d => ({ typeKey: d.typeKey, owner: 'P1', r: d.r, c: d.c }));
      network.send('DEPLOY_P1_DONE', { pieces });
      gamePhase = 'DEPLOY_WAIT_P2';
      addLog("✅ 自軍 (先行・P1) の初期配置を確定・送信しました！相手 (後攻・P2) の対抗配置を待っています...", 'p1');
      setPhaseInstruction("⏳ 相手 (後攻・P2) が初期配置中... 相手の配置完了をお待ちください");
      renderAll();
      return;
    }

    if (myOnlineRole === 'P2' && gamePhase === 'DEPLOY_P2') {
      const deployed = getDeployedPieces('P2');
      const expectedCount = teamRoster.P2.length + 1;
      if (deployed.length < expectedCount) {
        alert(`6体すべてのユニット（コア＋選択した5ヒーロー）を自陣に配置してください！(現在: ${deployed.length}/${expectedCount})`);
        return;
      }

      const pieces = deployed.map(d => ({ typeKey: d.typeKey, owner: 'P2', r: d.r, c: d.c }));
      network.send('DEPLOY_P2_DONE', { pieces });
      addLog("✅ 自軍 (後攻・P2) の配置が確定しました！", 'p2');
      addLog("⚔️ 両軍の初期配置が完了！少数精鋭コア破壊バトルが始まります！", 'system');
      startBattlePhase();
      return;
    }
    return;
  }

  // vs AI (ソロプレイ)
  if (gamePhase === 'DEPLOY_P1') {
    const deployed = getDeployedPieces('P1');
    const expectedCount = teamRoster.P1.length + 1;
    if (deployed.length < expectedCount) {
      alert(`6体すべてのユニット（コア＋選択した5ヒーロー）を自陣に配置してください！(現在: ${deployed.length}/${expectedCount})`);
      return;
    }

    addLog("✅ 先行 (自軍) の配置が確定しました！", 'p1');
    addLog("【後攻・敵軍】初期配置フェーズ：自軍の配置が見えた状態で、上側2マス以内に配置してください。", 'system');

    gamePhase = 'DEPLOY_P2';
    applyDefaultPlacement('P2', teamRoster.P2);
    selectFirstDeployPiece('P2');
    addLog("🤖 敵軍 (AI) の対抗初期配置が展開されました。「バトル開始！」を押すとバトルが始まります。", 'p2');
    setPhaseInstruction("【後攻・敵軍】AIの初期配置が展開されました。調整するか「バトル開始！」を押してください");

    renderAll();
  } else if (gamePhase === 'DEPLOY_P2') {
    const deployed = getDeployedPieces('P2');
    const expectedCount = teamRoster.P2.length + 1;
    if (deployed.length < expectedCount) {
      alert(`6体すべてのユニット（コア＋選択した5ヒーロー）を自陣に配置してください！(現在: ${deployed.length}/${expectedCount})`);
      return;
    }

    addLog("✅ 後攻 (敵軍) の配置が確定しました！", 'p2');
    addLog("⚔️ 両軍の初期配置が完了！少数精鋭コア破壊バトルが始まります！", 'system');
    addLog("先行・自軍の手番です。自軍キャラをドラッグして移動/攻撃、またはクリックでスキル確認。", 'p1');

    startBattlePhase();
  }
};

// 長押し完了トリガー（配置フェーズなら配置決定、バトルならターンエンド）
window.__triggerHoldAction = () => {
  if (isGameOver) return;
  const isDeployPhase = (
    gamePhase === 'DEPLOY_P1' ||
    gamePhase === 'DEPLOY_P2' ||
    gamePhase === 'DEPLOY_WAIT_P1' ||
    gamePhase === 'DEPLOY_WAIT_P2'
  );
  if (isDeployPhase) {
    if (typeof window.__onConfirmDeploy === 'function') {
      window.__onConfirmDeploy();
    }
  } else if (gamePhase === 'BATTLE') {
    manualEndTurn();
  }
};

// HTMLグローバル公開
window.setCommandMode = setCommandMode;
window.clearSelection = clearSelection;
window.manualEndTurn = manualEndTurn;
window.showTitleScreen = showTitleScreen;
window.switchScreen = switchScreen;
window.resetGame = resetGame;

// ==============================================================
// 🌐 オンライン対戦 (P2P / PeerJS) 統括ロジック
// ==============================================================
export function startOnlinePick(role) {
  myOnlineRole = role;
  gameMode = 'online';
  setLocalPlayerRole(role);
  myPickConfirmed = false;
  opponentPickConfirmed = false;

  window.__closeOnlineModal();
  switchScreen('pick');
  updateModeBadge();
  setBoardPerspective(role === 'P2');

  tempPickedHeroes = (role === 'P1') ? [...DEFAULT_ROSTER] : [...DEFAULT_AI_ROSTER];

  const badgeEl = document.getElementById('pick-header-badge');
  const titleEl = document.getElementById('pick-screen-title');
  const descEl = document.getElementById('pick-screen-desc');
  if (badgeEl) {
    badgeEl.innerText = (role === 'P1')
      ? '🌐 ONLINE MATCH // ALLY SQUAD (先行・P1)'
      : '🌐 ONLINE MATCH // ALLY SQUAD (後攻・P2)';
    badgeEl.className = `pick-header-badge online-${role.toLowerCase()}`;
  }
  if (titleEl) {
    titleEl.innerText = (role === 'P1')
      ? '【先行・P1】自軍チーム編成'
      : '【後攻・P2】自軍チーム編成';
  }
  if (descEl) {
    descEl.innerHTML = `全ヒーローから自由に <strong>5体</strong> を選抜せよ（相手の編成とは重複可能・同ロール複数可）`;
  }

  addLog(`🌐 オンライン対戦に接続しました！あなたは 【${role === 'P1' ? '先行・P1 (自軍)' : '後攻・P2 (自軍)'}】 です。`, role.toLowerCase());
  addLog(`全ヒーローから出撃させる5体を選抜して「この編成で決定」を押してください。`, 'system');

  renderPickModal({
    currentOwner: role,
    selectedHeroes: tempPickedHeroes,
    myPickConfirmed: false,
    isOnline: true
  });
}

export function startOnlineDeployPhase() {
  switchScreen('battle');
  updateModeBadge();
  setLocalPlayerRole(myOnlineRole);
  setBoardPerspective(myOnlineRole === 'P2');
  initBoard();

  selectedDeployPos = null;

  if (myOnlineRole === 'P1') {
    gamePhase = 'DEPLOY_P1';
    applyDefaultPlacement('P1', teamRoster.P1);
    selectFirstDeployPiece('P1');
    addLog("【先行・自軍】初期配置フェーズ：自陣（手前2マス以内）に味方とコアを配置してください。", "p1");
    setPhaseInstruction("【先行・自軍 初期配置】自陣（手前2マス）に味方とコアを配置してください。完了したら「配置完了」を押してください");
  } else if (myOnlineRole === 'P2') {
    gamePhase = 'DEPLOY_WAIT_P1';
    addLog("⏳ 相手 (先行・P1) が初期配置を行っています。相手の配置が完了するまでお待ちください...", "system");
    setPhaseInstruction("⏳ 相手 (先行・P1) が初期配置中... 相手の配置完了をお待ちください");
  }

  renderAll();
}

function startBattlePhase() {
  clearAITimeout();
  clearUltFxState();
  gamePhase = 'BATTLE';
  turn = 'P1';
  turnCount = 1;
  isGameOver = false;

  const endTurnBtn = document.getElementById('btn-end-turn');
  if (endTurnBtn) {
    endTurnBtn.onclick = null;
  }
  const bTitle = document.querySelector('.tokens-banner-title');
  if (bTitle) bTitle.innerText = 'TOKENS';

  resetActionTokens('P1');
  resetActionTokens('P2');
  resetTurnPassives('P1');
  resetTurnPassives('P2');

  setBoardPerspective(gameMode === 'online' && myOnlineRole === 'P2');
  setLocalPlayerRole(gameMode === 'online' ? myOnlineRole : 'P1');

  // フェイズのパッシブ展開
  phantomZones.length = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && (u.typeKey === 'PHASE' || u.typeKey === 'PHANTOM')) {
        phantomZones.push({
          r,
          c,
          owner: u.owner,
          sourceHeroId: u.id,
          sourceHeroType: u.typeKey
        });
        addLog(`👻 ${u.name} のパッシブ『シャドウ・オリジン』発動！初期配置マス(${r}, ${c})にディメンション・ゾーンを展開！`, 'skill');
      }
    }
  }

  selectedPos = null;
  commandMode = null;
  validTargets = [];

  if (gameMode === 'online' && myOnlineRole) {
    const roleName = (myOnlineRole === 'P1') ? '先行 (P1)' : '後攻 (P2)';
    addLog(`⚔️ 🌐 オンライン対戦開始！あなたは 【${roleName}】 です！`, myOnlineRole.toLowerCase());
    if (myOnlineRole === 'P1') {
      setPhaseInstruction("先行・あなたのターンです！キャラクターを持ち上げてドラッグ（移動/攻撃）、またはクリックでスキル確認");
    } else {
      setPhaseInstruction("相手（先行・P1）の手番です（思考中... 相手の駒をクリックすると偵察可能）");
    }
  } else {
    addLog(`⚔️ バトルフェーズ開始！`, 'system');
  }

  renderAll();
}

// ネットワークイベントリスナー
network.onStatusChange = (statusText, isError) => {
  const el = document.getElementById('online-conn-status');
  if (el) {
    el.style.display = 'block';
    el.className = `online-status-banner ${isError ? 'error' : 'success'}`;
    el.innerText = statusText;
  }
};

network.onConnected = (role) => {
  startOnlinePick(role);
};

network.onMessage = (msg) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'ONLINE_PICK_CONFIRM') {
    const oppRole = (myOnlineRole === 'P1') ? 'P2' : 'P1';
    teamRoster[oppRole] = [...msg.payload.roster];
    opponentPickConfirmed = true;
    addLog(`相手（${oppRole === 'P1' ? '先行・P1' : '後攻・P2'}）のチーム編成が完了しました！`, 'system');

    if (myPickConfirmed) {
      startOnlineDeployPhase();
    }
  } else if (msg.type === 'DEPLOY_P1_DONE') {
    if (myOnlineRole === 'P2') {
      msg.payload.pieces.forEach(p => {
        spawnHero(p.typeKey, p.owner, p.r, p.c);
      });

      gamePhase = 'DEPLOY_P2';
      applyDefaultPlacement('P2', teamRoster.P2);
      selectedDeployPos = null;

      addLog("相手の初期配置が完了しました！相手の配置を確認しながら自陣（手前2マス）に味方とコアを配置してください。", 'p2');
      setPhaseInstruction("【後攻・自軍 初期配置】相手の配置を確認しながら自陣に配置してください。「バトル開始！」を押すと開戦します");
      renderAll();
    }
  } else if (msg.type === 'DEPLOY_P2_DONE') {
    if (myOnlineRole === 'P1') {
      msg.payload.pieces.forEach(p => {
        spawnHero(p.typeKey, p.owner, p.r, p.c);
      });

      addLog("相手（後攻・P2）の初期配置が完了しました！", 'p2');
      addLog("⚔️ 両軍の初期配置が完了！少数精鋭コア破壊バトルが始まります！", 'system');
      startBattlePhase();
    }
  } else if (msg.type === 'ACTION') {
    const { action } = msg.payload;
    if (action === 'MOVE') {
      executeMove(msg.payload.from, msg.payload.to, triggerGameOver);
      renderAll();
    } else if (action === 'ATTACK') {
      executeAttack(msg.payload.from, msg.payload.to, triggerGameOver);
      renderAll();
    } else if (action === 'SKILL') {
      executeSkill(msg.payload.heroPos, msg.payload.targetPos, msg.payload.slot, triggerGameOver);
      renderAll();
    } else if (action === 'DESTROY_BARRICADE') {
      const { pos } = msg.payload;
      destroyBarricade(pos.r, pos.c);
      if (selectedPos && selectedPos.r === pos.r && selectedPos.c === pos.c) {
        clearSelection();
      } else {
        renderAll();
      }
    } else if (action === 'END_TURN') {
      addLog(`${isLocalPlayer(turn) ? '自軍' : '敵軍'} がターンを終了しました`, turn.toLowerCase());
      executeTurnChange();
      renderAll();
    }
  }
};

network.onDisconnected = () => {
  addLog(`⚠️ 対戦相手との通信が切断されました。`, 'system');
  alert('対戦相手との接続が切断されました。');
};

// オンラインモーダル操作
window.__openOnlineModal = () => {
  document.getElementById('online-modal')?.classList.add('active');
};

window.__closeOnlineModal = () => {
  document.getElementById('online-modal')?.classList.remove('active');
};

window.__switchOnlineTab = (tab) => {
  document.getElementById('tab-host')?.classList.toggle('active', tab === 'host');
  document.getElementById('tab-join')?.classList.toggle('active', tab === 'join');
  const hostPanel = document.getElementById('panel-host');
  const joinPanel = document.getElementById('panel-join');
  if (hostPanel) hostPanel.style.display = (tab === 'host') ? 'block' : 'none';
  if (joinPanel) joinPanel.style.display = (tab === 'join') ? 'block' : 'none';
};

window.__createOnlineRoom = async () => {
  const btn = document.getElementById('btn-create-room');
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerText = '部屋を生成中...';
    }
    const roomId = await network.createRoom();
    const input = document.getElementById('host-room-id-input');
    const info = document.getElementById('host-room-info');
    if (input) input.value = roomId;
    if (info) info.style.display = 'block';
    if (btn) btn.style.display = 'none';
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.innerText = '🎲 部屋を作成する';
    }
  }
};

window.__copyRoomLink = () => {
  const roomId = document.getElementById('host-room-id-input')?.value;
  if (!roomId) return;
  const inviteUrl = network.getInviteUrl(roomId);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      alert(`招待URLをコピーしました！対戦相手に送ってください。\n\n${inviteUrl}`);
    }).catch(() => {
      prompt('以下のURLをコピーして相手に送ってください:', inviteUrl);
    });
  } else {
    prompt('以下のURLをコピーして相手に送ってください:', inviteUrl);
  }
};

window.__joinOnlineRoom = async () => {
  const input = document.getElementById('join-room-id-input');
  const roomId = input ? input.value.trim() : '';
  if (!roomId) {
    alert('合言葉 (Room ID) を入力してください。');
    return;
  }
  const btn = document.getElementById('btn-join-room');
  const waitMsg = document.getElementById('join-waiting-msg');
  if (btn) btn.disabled = true;
  if (waitMsg) waitMsg.style.display = 'block';

  try {
    await network.joinRoom(roomId);
  } catch (e) {
    if (btn) btn.disabled = false;
    if (waitMsg) waitMsg.style.display = 'none';
  }
};

// タイトル画面関連ハンドラー
window.__startPvEMode = () => {
  gameMode = 'pve';
  myOnlineRole = null;
  setLocalPlayerRole('P1');
  myPickConfirmed = false;
  opponentPickConfirmed = false;

  const badgeEl = document.getElementById('pick-header-badge');
  const titleEl = document.getElementById('pick-screen-title');
  const descEl = document.getElementById('pick-screen-desc');
  if (badgeEl) {
    badgeEl.innerText = 'PHASE 01 // HERO DRAFT';
    badgeEl.className = 'pick-header-badge';
  }
  if (titleEl) {
    titleEl.innerText = 'チーム編成フェーズ';
  }
  if (descEl) {
    descEl.innerHTML = '全ヒーローから自由に <strong>5体</strong> を選抜して出撃せよ（ロール縛りなし・同ロール複数可）';
  }

  switchScreen('pick');
  initGame();
};

window.__startOnlineFromTitle = () => {
  window.__openOnlineModal();
};

window.__returnToTitle = () => {
  if (gamePhase !== 'TITLE') {
    if (!confirm('対戦を終了してタイトル画面に戻りますか？')) {
      return;
    }
  }
  showTitleScreen();
};

// URLパラメータ ?room=xxxx があれば自動参加モーダルを開く
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');
if (roomParam) {
  setTimeout(() => {
    window.__openOnlineModal();
    window.__switchOnlineTab('join');
    const input = document.getElementById('join-room-id-input');
    if (input) {
      input.value = roomParam;
    }
  }, 300);
}

// 起動
createBoardDOMOnce({
  onTileClickCallback: onTileClick,
  onPieceDropCallback: onPieceDrop,
  onTileHoverCallback: onTileHover
});

initUrbanUI();
initBoard();
showTitleScreen();
renderAll();
