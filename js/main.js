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
} from './config.js?v=lab-white-3';
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
  hasActionOrder,
  resetActionOrders,
  resetTurnPassives,
  isUnit,
  isObject,
  isLocalPlayer,
  getUnitPos,
  setLocalPlayerRole
} from './board.js?v=lab-white-3';
import {
  executeMove,
  executeAttack,
  executeSkill,
  destroyObject,
  tickTurnEffects,
  processTurnEnd
} from './actions.js?v=lab-white-3';
import {
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
  initHomeView,
  resetDraftView,
  showGameOverModal,
  addLog,
  setBoardPerspective,
  setPhaseInstruction
} from './ui.js?v=lab-white-8';
import { runAITurn } from './ai.js?v=lab-white-5';
import { network } from './network.js?v=lab-white-1';
import { initUrbanUI, clearBattlePresentation, clearTurnCutin, createTurnFxQueue, playTurnTransition, playFinisherFX } from './urban-ui.js?v=lab-white-5';
import { initBattleAudio, playBattleSound } from './battle-audio.js?v=juice-1';

// ゲーム進行ステート
// 'TITLE' -> 'PICK_P1' -> 'DEPLOY_P1' -> 'DEPLOY_P2' -> 'BATTLE'
let gamePhase = 'TITLE';
let turn = 'P1';
let turnCount = 1;
let gameMode = 'pve';     // 'pve' or 'online'
let myOnlineRole = null;  // 'P1' (先行/ホスト) or 'P2' (後攻/ゲスト) or null
let isGameOver = false;
let aiTurnTimeoutId = null;
let battleSession = new AbortController();
let activeBattleOperation = null;
let incomingBattleActions = Promise.resolve();

// オンラインピックの同期状態
let myPickConfirmed = false;
let opponentPickConfirmed = false;
let myRematchReady = false;
let opponentRematchReady = false;

// チームごとの選択キャラクター（各チーム5体）
let teamRoster = {
  P1: [...DEFAULT_ROSTER],
  P2: [...DEFAULT_AI_ROSTER]
};
let soloSquads = {
  ALLY: [...DEFAULT_ROSTER],
  ENEMY: [...DEFAULT_AI_ROSTER]
};
let tempPickedHeroes = [];
let soloPickTeam = 'ALLY';
let soloHumanRole = 'P1';
const getSoloAiRole = () => (soloHumanRole === 'P1' ? 'P2' : 'P1');
const getActiveHumanRole = () => (gameMode === 'online' ? myOnlineRole : soloHumanRole);

const DRAFT_ROLES = ['ASSAULT', 'SENTINEL', 'DISRUPTOR', 'SUPPORT'];

function pickRandomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** 4ロール各1体以上を保証し、残り1枠とスロット順をランダムに決定する5体編成を生成 */
function createBalancedRandomRoster() {
  const chosen = DRAFT_ROLES.map(role => {
    const candidates = SELECTABLE_HERO_KEYS.filter(key => HERO_TYPES[key].role === role);
    return pickRandomItem(candidates);
  });
  const remainingPool = SELECTABLE_HERO_KEYS.filter(key => !chosen.includes(key));
  chosen.push(pickRandomItem(remainingPool));
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen;
}

// 選択・コマンドステート
let selectedPos = null;
let selectedHazardPos = null;
let selectedDeployPos = null;
let commandMode = null; // 'MOVE', 'ATTACK', 'SKILL_A', 'SKILL_ULT'
let validTargets = [];
let hoveredPos = null;

function resetBattleSession() {
  battleSession.abort();
  battleSession = new AbortController();
  incomingBattleActions = Promise.resolve();
  activeBattleOperation = null;
  document.getElementById('screen-battle').removeAttribute('aria-busy');
}

function runBattleOperation(operation) {
  const signal = battleSession.signal;
  const screen = document.getElementById('screen-battle');
  screen.setAttribute('aria-busy', 'true');
  const completion = Promise.resolve().then(() => {
    if (!signal.aborted) return operation({ signal, render: renderAll });
  }).catch(error => {
    console.error('Battle action failed:', error);
  }).finally(() => {
    if (activeBattleOperation !== completion) return;
    activeBattleOperation = null;
    screen.removeAttribute('aria-busy');
  });
  activeBattleOperation = completion;
  return completion;
}

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

export function initGame() {
  clearAITimeout();
  resetBattleSession();
  clearBattlePresentation();
  initBoard();
  resetActionOrders('P1');
  resetActionOrders('P2');

  soloHumanRole = 'P1';
  setLocalPlayerRole('P1');
  setBoardPerspective(false);
  gamePhase = 'PICK_P1';
  turn = 'P1';
  turnCount = 1;
  isGameOver = false;

  myPickConfirmed = false;
  opponentPickConfirmed = false;

  const enemyRandomRoster = createBalancedRandomRoster();
  teamRoster = {
    P1: [...DEFAULT_ROSTER],
    P2: [...enemyRandomRoster]
  };
  soloSquads = {
    ALLY: [...DEFAULT_ROSTER],
    ENEMY: [...enemyRandomRoster]
  };
  tempPickedHeroes = [...DEFAULT_ROSTER];
  soloPickTeam = 'ALLY';
  resetDraftView();

  selectedPos = null;
  selectedHazardPos = null;
  selectedDeployPos = null;
  commandMode = null;
  validTargets = [];

  const logBox = document.getElementById('log-box');
  if (logBox) logBox.innerHTML = '';
  addLog("🎮 CYBER TACTICS へようこそ！", "system");
  addLog("【キャラクター選択】自軍・敵軍の5体を選んで「出撃開始」を押してください。", "system");
  setPhaseInstruction("【キャラクター選択】自軍・敵軍の編成を調整して [出撃開始] を押してください");

  document.getElementById('disconnect-modal')?.classList.remove('active');
  const victoryModal = document.getElementById('victory-modal');
  if (victoryModal) victoryModal.classList.remove('active');

  renderAll();
  renderCurrentPickModal();
}

function renderAll() {
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
      canControl: !isGameOver && gamePhase === 'BATTLE' && turn === getActiveHumanRole()
    });
  }

  updateStatus(turn, gameMode, gamePhase, turnCount);
  updateDeployControlBar({ gamePhase, gameMode, myOnlineRole });
  updateHoldActionButton({ gamePhase, turn, gameMode, myOnlineRole, isGameOver });

  // オンライン対戦時の相手手番を読み上げる
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
    onPieceDragEndCallback: clearDragHighlights
  });
}

function onTileHover(pos) {
  if (activeBattleOperation || isGameOver) return;
  const prev = hoveredPos;
  hoveredPos = pos;
  if (!commandMode || !commandMode.startsWith('SKILL_')) return;
  if (prev?.r === pos?.r && prev?.c === pos?.c) return;
  if (gamePhase !== 'BATTLE' || (gameMode === 'pve' && turn !== soloHumanRole)) return;
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
  if (isGameOver || activeBattleOperation) return;

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
        playBattleSound('select');
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
  if (gameMode === 'pve' && turn !== soloHumanRole) return;
  const isOnlineOpponentTurn = (gameMode === 'online' && turn !== myOnlineRole);

  const clickedUnit = board[r][c];

  // A. スキル対象選択中 (SKILL_A, SKILL_ULT)
  if (commandMode && commandMode.startsWith('SKILL_')) {
    if (isOnlineOpponentTurn) return;
    const isTarget = validTargets.some(t => t.r === r && t.c === c);

    if (isTarget) {
      const slot = commandMode.replace('SKILL_', '');
      const heroPos = selectedPos;
      const targetPos = { r, c };
      const caster = board[heroPos.r]?.[heroPos.c];
      runBattleOperation(async presentation => {
        const executed = await executeSkill(heroPos, targetPos, slot, triggerGameOver, {
          ...presentation,
          onStart: () => {
            if (gameMode === 'online') network.send('ACTION', { action: 'SKILL', heroPos, targetPos, slot });
          }
        });
        if (presentation.signal.aborted || isGameOver) return;

        selectedPos = getUnitPos(caster);
        commandMode = null;
        validTargets = [];
        hoveredPos = null;
        setPhaseInstruction(executed
          ? "スキル発動完了！続けて他の駒をドラッグして操作するか、他に行動がなければ [ターン終了] を押してください"
          : "このマスにはスキルを発動できません。スキルストックは消費されません。");
        renderAll();
      });
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

  // 駒（ユニット・設置物・アンカー）をクリックした場合は選択/偵察切り替え
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
  } else {
    clearSelection();
  }
}

function selectHero(r, c) {
  if (activeBattleOperation || isGameOver) return;
  selectedPos = { r, c };
  selectedHazardPos = null;
  commandMode = null;
  validTargets = [];
  hoveredPos = null;

  const unit = board[r]?.[c];
  if (!unit) return;
  playBattleSound('select');

  const footHazard = getHazardInfoAt(r, c);
  const hazardNote = footHazard ? ` 【足元: ${footHazard.icon}${footHazard.name}】` : '';

  if (!isLocalPlayer(unit.owner)) {
    setPhaseInstruction(`🔍 敵軍の${unit.name}を偵察中。${hazardNote}ステータスを確認できます`);
  } else if (isObject(unit)) {
    const destroyHint = unit.owner === turn ? `「${unit.name}を破壊する」ボタンで破壊できます` : '自軍のターン中に破壊できます';
    setPhaseInstruction(`${unit.icon} ${unit.name}を選択中。${hazardNote}${destroyHint}`);
  } else {
    setPhaseInstruction(`${unit.name} を選択中。${hazardNote}黄枠へドラッグで移動、紫枠の敵へドラッグで攻撃。能力は右のカードから使用できます。`);
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
  if (activeBattleOperation || isGameOver || gamePhase !== 'BATTLE' || (gameMode === 'pve' && turn !== soloHumanRole)) return;
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

export function handleDestroyObject(r, c) {
  if (isGameOver || activeBattleOperation) return;
  if (gamePhase !== 'BATTLE' || !isLocalPlayer(turn)) return;

  const object = board[r]?.[c];
  if (!isObject(object) || object.owner !== turn || object.hp <= 0) return;

  runBattleOperation(async presentation => {
    if (gameMode === 'online') {
      const action = object.typeKey === 'BARRICADE' ? 'DESTROY_BARRICADE' : 'DESTROY_OBJECT';
      network.send('ACTION', { action, pos: { r, c } });
    }
    const destroyed = await destroyObject(r, c, turn, presentation);
    if (destroyed && !presentation.signal.aborted) clearSelection();
  });
}

window.__onDestroyObject = handleDestroyObject;

window.__onInspectHazardAt = (r, c) => {
  if (isGameOver || activeBattleOperation) return;
  const hazard = getHazardInfoAt(r, c);
  if (hazard) {
    selectedHazardPos = { r, c };
    selectedPos = null;
    commandMode = null;
    validTargets = [];
    setPhaseInstruction(`${hazard.icon} 【${hazard.name}】(${hazard.category}): ${hazard.desc}`);
    addLog(`📌 [${r},${c}] のハザード確認: ${hazard.icon} ${hazard.name} (${hazard.owner ? (isLocalPlayer(hazard.owner) ? '自軍' : '敵軍') : '中立'}) - ${hazard.desc}`, 'system');
    renderAll();
  }
};

window.__onSelectUnitAt = (r, c) => {
  if (board[r]?.[c]) {
    selectHero(r, c);
  }
};

export function manualEndTurn() {
  if (isGameOver || activeBattleOperation) return;
  if (gamePhase !== 'BATTLE') return;

  if (gameMode === 'pve' && turn !== soloHumanRole) return;

  if (gameMode === 'online' && turn !== myOnlineRole) return;

  if (gameMode === 'online' && turn === myOnlineRole) {
    network.send('ACTION', { action: 'END_TURN' });
  }

  addLog(`${isLocalPlayer(turn) ? '自軍' : '敵軍'} がターンを終了しました`, turn.toLowerCase());
  runBattleOperation(executeTurnChange);
}

async function executeTurnChange(presentation) {
  clearAITimeout();
  const startingFx = createTurnFxQueue();
  const hasEnded = () => isGameOver || presentation.signal.aborted;

  await processTurnEnd(turn, triggerGameOver, presentation);
  if (hasEnded()) return;
  tickTurnEffects();

  selectedPos = null;
  commandMode = null;
  validTargets = [];

  turn = turn === 'P1' ? 'P2' : 'P1';
  turnCount++;

  // 新手番プレイヤーの行動オーダーを全回復
  resetActionOrders(turn, startingFx);

  // 新手番プレイヤーのターン開始時パッシブ状態を更新
  resetTurnPassives(turn, startingFx);

  renderAll();

  playTurnTransition(turn, turnCount, startingFx.effects, startEnemyAiTurn);
  setPhaseInstruction(
    isLocalPlayer(turn)
      ? "自軍ターン: キャラクターを持ち上げてドラッグ（移動/攻撃）、またはクリックでスキル確認"
      : "敵軍ターン: 相手の行動を確認してください"
  );
}

function startEnemyAiTurn() {
  const aiRole = getSoloAiRole();
  const humanRole = soloHumanRole;
  if (gameMode === 'pve' && gamePhase === 'BATTLE' && turn === aiRole && !isGameOver) {
    const signal = battleSession.signal;
    // Allow for the cut-in and combat animations during longer AI turns.
    aiTurnTimeoutId = setTimeout(() => {
      if (!signal.aborted && gameMode === 'pve' && turn === aiRole && !isGameOver) {
        console.warn(`AI turn watchdog triggered: forcing turn change back to ${humanRole}.`);
        resetBattleSession();
        runBattleOperation(executeTurnChange);
      }
    }, 12000);

    runAITurn({
      aiOwner: aiRole,
      signal,
      performAction: runBattleOperation,
      onGameOver: (winner, reason, context) => {
        clearAITimeout();
        triggerGameOver(winner, reason, context);
      },
      onEndTurnCallback: () => {
        clearAITimeout();
        if (!signal.aborted && gameMode === 'pve' && turn === aiRole && !isGameOver) {
          runBattleOperation(executeTurnChange);
        }
      },
      updateViewCallback: renderAll
    });
  }
}

function triggerGameOver(winner, reason = 'anchor', context = null) {
  if (isGameOver) return;
  isGameOver = true;
  clearAITimeout();
  clearTurnCutin();
  document.getElementById('fn-rematch-status').hidden = true;
  document.getElementById('fn-btn-again').disabled = false;
  if (document.getElementById('finisher-overlay')) {
    playFinisherFX({
      winner,
      reason,
      myRole: myOnlineRole,
      gameMode,
      context,
      onPlayAgain: gameMode === 'online' ? requestOnlineRematch : resetGame,
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
  document.getElementById('battle-stage').dataset.screen = { title: 'home', pick: 'select', battle: 'battle' }[screenName];
  clearTurnCutin();
  document.getElementById('urban-tab-details').click();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function showTitleScreen() {
  clearAITimeout();
  resetBattleSession();
  clearBattlePresentation();
  switchScreen('title');
  document.getElementById('disconnect-modal')?.classList.remove('active');
  const victoryModal = document.getElementById('victory-modal');
  if (victoryModal) victoryModal.classList.remove('active');
  myOnlineRole = null;
  gamePhase = 'TITLE';
  network.close();
  setLocalPlayerRole('P1');
  setBoardPerspective(false);
}

export function resetGame() {
  clearAITimeout();
  clearBattlePresentation();
  if (gameMode === 'online') {
    showTitleScreen();
  } else {
    switchScreen('pick');
    initGame();
  }
}

function updateRematch() {
  if (myRematchReady && opponentRematchReady) {
    clearBattlePresentation();
    startOnlinePick(myOnlineRole);
    return;
  }
  const status = document.getElementById('fn-rematch-status');
  status.hidden = false;
  status.textContent = myRematchReady ? '相手の再戦確認を待っています。' : '相手が再戦を希望しています。';
  document.getElementById('fn-btn-again').disabled = myRematchReady;
}

function requestOnlineRematch() {
  if (myRematchReady) return;
  if (!network.isConnected || !network.send('REMATCH_READY')) {
    network.onDisconnected();
    return;
  }
  myRematchReady = true;
  updateRematch();
}

// ドラッグ開始 (駒をつかんだ時)
function onPieceDragStart(r, c) {
  if (isGameOver || activeBattleOperation) return;

  if (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2') {
    if (gameMode === 'online') {
      if (gamePhase === 'DEPLOY_P1' && myOnlineRole !== 'P1') return;
      if (gamePhase === 'DEPLOY_P2' && myOnlineRole !== 'P2') return;
    }
    const curOwner = (gamePhase === 'DEPLOY_P1') ? 'P1' : 'P2';
    const u = board[r][c];
    if (!u || u.owner !== curOwner) return;

    playBattleSound('select');
    selectedDeployPos = { r, c };
    setPhaseInstruction(`${u.name} を自陣の空きマスへドラッグ＆ドロップ！`);
    renderAll();
    return;
  }

  if (gameMode === 'pve' && turn !== soloHumanRole) return;
  if (gameMode === 'online' && turn !== myOnlineRole) return;

  const hero = board[r][c];
  if (!hero || hero.owner !== turn || !isUnit(hero)) return;
  playBattleSound('select');

  selectedPos = { r, c };
  commandMode = null;
  validTargets = [];

  const canMove = hasActionOrder(turn, 'move', 1, hero) && !hasDebuff(hero, 'bind');
  const canAttack = hasActionOrder(turn, 'attack', 1, hero) && !hasDebuff(hero, 'disarm');

  renderAll();

  if (canMove && canAttack) {
    setPhaseInstruction(`${hero.name}。黄枠へドロップで移動、紫枠の敵へドロップで攻撃。`);
  } else if (canMove) {
    setPhaseInstruction(`${hero.name}。黄枠へドロップで移動。`);
  } else if (canAttack) {
    setPhaseInstruction(`${hero.name}。紫枠の敵へドロップで攻撃。`);
  }
}

function clearDragHighlights() {
  document.querySelectorAll('#board .drag-over-valid, #board .drag-over-attack').forEach(tile => {
    tile.classList.remove('drag-over-valid', 'drag-over-attack');
  });
}

// ドロップ処理
function onPieceDrop(fromR, fromC, toR, toC) {
  clearDragHighlights();
  if (isGameOver || activeBattleOperation) return;

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
      playBattleSound('select');
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
      playBattleSound('select');
      selectedPos = { r: toR, c: toC };
      selectedDeployPos = { r: toR, c: toC };
      renderAll();
    } else {
      addLog(`⚠️ 相手の駒の上には配置できません！`, 'system');
    }
    return;
  }

  // バトル中のドロップ
  if (gameMode === 'pve' && turn !== soloHumanRole) return;
  if (gameMode === 'online' && turn !== myOnlineRole) return;

  const hero = board[fromR][fromC];
  if (!hero || hero.owner !== turn || !isUnit(hero)) return;

  const destUnit = board[toR][toC];
  const enemyOwner = (turn === 'P1') ? 'P2' : 'P1';

  // 1. 敵の上へドロップ ➔ 通常攻撃
  if (destUnit && destUnit.owner === enemyOwner) {
    if (!hasActionOrder(turn, 'attack', 1, hero)) {
      addLog(`⚠️ このターンの攻撃オーダーはすでに消費済みです！`, 'system');
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
      runBattleOperation(async presentation => {
        await executeAttack({ r: fromR, c: fromC }, { r: toR, c: toC }, triggerGameOver, presentation);
        if (presentation.signal.aborted || isGameOver) return;
        setPhaseInstruction("攻撃完了！続けて [移動] または [スキルカード]、他に行動がなければ [ターン終了] を選べます");
        renderAll();
      });
    } else {
      addLog(`そこは ${hero.name} の通常攻撃の射程外です`, 'system');
      renderAll();
    }
    return;
  }

  // 2. 空きマスへドロップ ➔ 移動
  if (!destUnit) {
    if (!hasActionOrder(turn, 'move', 1, hero)) {
      addLog(`⚠️ このターンの移動オーダー（専用オーダー含む）はすでに消費済みです！`, 'system');
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
      runBattleOperation(async presentation => {
        const destination = await executeMove({ r: fromR, c: fromC }, { r: toR, c: toC }, triggerGameOver, presentation);
        if (presentation.signal.aborted || isGameOver) return;
        selectedPos = destination;
        setPhaseInstruction("移動完了！続けて [敵へドラッグして通常攻撃] または [スキルカード]、他に行動がなければ [ターン終了] を選べます");
        renderAll();
      });
    } else {
      addLog(`そこは ${hero.name} の移動範囲外です`, 'system');
      renderAll();
    }
  }
}

// ==============================================================
// キャラクターピック＆初期配置ハンドラー
// ==============================================================
function renderCurrentPickModal() {
  const isOnline = gameMode === 'online';
  const currentOwner = isOnline ? myOnlineRole : (soloPickTeam === 'ALLY' ? soloHumanRole : getSoloAiRole());
  const selectedHeroes = isOnline ? tempPickedHeroes : soloSquads[soloPickTeam];
  renderPickModal({
    currentOwner,
    selectedHeroes,
    myPickConfirmed,
    isOnline,
    soloPickTeam,
    soloOrder: soloHumanRole,
    allyCount: soloSquads.ALLY.length,
    enemyCount: soloSquads.ENEMY.length
  });
}

window.__onSwitchSoloPickTeam = (targetTeam) => {
  if (gameMode === 'online') return;
  if (targetTeam !== 'ALLY' && targetTeam !== 'ENEMY') return;
  soloPickTeam = targetTeam;
  renderCurrentPickModal();
};

window.__onSwitchSoloOrder = (targetOrder) => {
  if (gameMode === 'online') return;
  if (targetOrder !== 'P1' && targetOrder !== 'P2') return;
  soloHumanRole = targetOrder;
  setLocalPlayerRole(soloHumanRole);
  renderCurrentPickModal();
};

window.__onTogglePickHero = (key) => {
  if (gameMode === 'online' && myPickConfirmed) return;

  const currentList = (gameMode === 'online') ? tempPickedHeroes : soloSquads[soloPickTeam];
  let nextList;
  if (currentList.includes(key)) {
    nextList = currentList.filter(k => k !== key);
  } else if (currentList.length < 5) {
    nextList = [...currentList, key];
  } else {
    alert("選択できるユニットは最大5体です。不要なユニットの選択を解除してください。");
    return;
  }

  if (gameMode === 'online') {
    tempPickedHeroes = nextList;
  } else {
    soloSquads[soloPickTeam] = nextList;
  }
  renderCurrentPickModal();
};

window.__onAutoPick = () => {
  if (gameMode === 'online' && myPickConfirmed) return;
  const picked = createBalancedRandomRoster();
  if (gameMode === 'online') {
    tempPickedHeroes = picked;
  } else {
    soloSquads[soloPickTeam] = picked;
  }
  renderCurrentPickModal();
};

window.__onClearPick = () => {
  if (gameMode === 'online' && myPickConfirmed) return;
  if (gameMode === 'online') {
    tempPickedHeroes = [];
  } else {
    soloSquads[soloPickTeam] = [];
  }
  renderCurrentPickModal();
};

window.__onConfirmPick = () => {
  if (gameMode === 'online') {
    if (tempPickedHeroes.length !== 5) {
      alert("5体のユニットを選択してください！");
      return;
    }
    teamRoster[myOnlineRole] = [...tempPickedHeroes];
    myPickConfirmed = true;
    addLog(`✅ 【自軍 (${myOnlineRole})】チーム編成決定: ${teamRoster[myOnlineRole].map(k => HERO_TYPES[k].name).join(', ')}`, myOnlineRole.toLowerCase());

    network.send('ONLINE_PICK_CONFIRM', { roster: teamRoster[myOnlineRole] });

    if (opponentPickConfirmed) {
      startOnlineDeployPhase();
    } else {
      addLog(`⏳ 相手プレイヤーのチーム編成完了を待機中...`, 'system');
      renderCurrentPickModal();
    }
    return;
  }

  // vs AI (ソロプレイ): 自軍・敵軍とも5体必須
  if (soloSquads.ALLY.length !== 5) {
    soloPickTeam = 'ALLY';
    renderCurrentPickModal();
    alert("自軍のユニットを5体選択してください！");
    return;
  }
  if (soloSquads.ENEMY.length !== 5) {
    soloPickTeam = 'ENEMY';
    renderCurrentPickModal();
    alert("敵軍のユニットを5体選択してください！");
    return;
  }

  const humanRole = soloHumanRole;
  const aiRole = getSoloAiRole();
  teamRoster[humanRole] = [...soloSquads.ALLY];
  teamRoster[aiRole] = [...soloSquads.ENEMY];

  setLocalPlayerRole(humanRole);
  setBoardPerspective(humanRole === 'P2');

  addLog(`✅ 自軍 (${humanRole === 'P1' ? '先攻' : '後攻'}) チーム編成決定: ${teamRoster[humanRole].map(k => HERO_TYPES[k].name).join(', ')}`, humanRole.toLowerCase());
  addLog(`🤖 敵軍 (AI・${aiRole === 'P1' ? '先攻' : '後攻'}) 編成決定: ${teamRoster[aiRole].map(k => HERO_TYPES[k].name).join(', ')}`, aiRole.toLowerCase());

  switchScreen('battle');
  gamePhase = 'DEPLOY_P1';
  applyDefaultPlacement('P1', teamRoster.P1);
  selectFirstDeployPiece('P1');

  if (humanRole === 'P1') {
    addLog("【先攻・自軍】初期配置フェーズ：自陣（縦2マス以内）に配置してください。", "system");
    setPhaseInstruction("【先攻・自軍 初期配置】この布陣で良ければ「配置確定」を押してください（駒のドラッグで位置調整も可能）");
  } else {
    addLog("【先攻・敵軍 (AI)】初期配置が展開されました。調整するか「配置確定」で後攻（自軍）の対抗配置へ進みます。", "p1");
    setPhaseInstruction("【先攻・敵軍 (AI) 初期配置】AIの布陣を確認・調整して「配置確定」を押すと後攻（自軍）を配置できます");
  }
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
        alert(`6体すべてのユニット（アンカー＋選択した5ヒーロー）を自陣に配置してください！(現在: ${deployed.length}/${expectedCount})`);
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
        alert(`6体すべてのユニット（アンカー＋選択した5ヒーロー）を自陣に配置してください！(現在: ${deployed.length}/${expectedCount})`);
        return;
      }

      const pieces = deployed.map(d => ({ typeKey: d.typeKey, owner: 'P2', r: d.r, c: d.c }));
      network.send('DEPLOY_P2_DONE', { pieces });
      addLog("✅ 自軍 (後攻・P2) の配置が確定しました！", 'p2');
      addLog("⚔️ 両軍の初期配置が完了！少数精鋭アンカー破壊バトルが始まります！", 'system');
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
      alert(`6体すべてのユニット（アンカー＋選択した5ヒーロー）を自陣に配置してください！(現在: ${deployed.length}/${expectedCount})`);
      return;
    }

    addLog(`✅ 先攻 (${isLocalPlayer('P1') ? '自軍' : '敵軍・AI'}) の配置が確定しました！`, 'p1');

    gamePhase = 'DEPLOY_P2';
    applyDefaultPlacement('P2', teamRoster.P2);
    selectFirstDeployPiece('P2');
    if (isLocalPlayer('P2')) {
      addLog("【後攻・自軍】初期配置フェーズ：先攻 (AI) の配置を見た状態で、手前2マスに自軍を配置してください。", 'p2');
      setPhaseInstruction("【後攻・自軍】先攻 (AI) の布陣を見て手前2マスに配置し、「バトル開始！」を押してください");
    } else {
      addLog("【後攻・敵軍】初期配置フェーズ：自軍の配置が見えた状態で、上側2マス以内に配置してください。", 'system');
      addLog("🤖 敵軍 (AI) の対抗初期配置が展開されました。「バトル開始！」を押すとバトルが始まります。", 'p2');
      setPhaseInstruction("【後攻・敵軍】AIの初期配置が展開されました。調整するか「バトル開始！」を押してください");
    }

    renderAll();
  } else if (gamePhase === 'DEPLOY_P2') {
    const deployed = getDeployedPieces('P2');
    const expectedCount = teamRoster.P2.length + 1;
    if (deployed.length < expectedCount) {
      alert(`6体すべてのユニット（アンカー＋選択した5ヒーロー）を自陣に配置してください！(現在: ${deployed.length}/${expectedCount})`);
      return;
    }

    addLog(`✅ 後攻 (${isLocalPlayer('P2') ? '自軍' : '敵軍・AI'}) の配置が確定しました！`, 'p2');
    addLog("⚔️ 両軍の初期配置が完了！少数精鋭アンカー破壊バトルが始まります！", 'system');

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
window.clearSelection = () => {
  if (!activeBattleOperation && !isGameOver) clearSelection();
};
window.manualEndTurn = manualEndTurn;
window.showTitleScreen = showTitleScreen;
window.switchScreen = switchScreen;
window.showTitleScreen = showTitleScreen;
window.resetGame = resetGame;

// ==============================================================
// 🌐 オンライン対戦 (P2P / PeerJS) 統括ロジック
// ==============================================================
export function startOnlinePick(role) {
  resetBattleSession();
  myOnlineRole = role;
  gameMode = 'online';
  setLocalPlayerRole(role);
  myPickConfirmed = false;
  opponentPickConfirmed = false;
  myRematchReady = false;
  opponentRematchReady = false;
  isGameOver = false;
  gamePhase = role === 'P1' ? 'PICK_P1' : 'PICK_P2';
  document.getElementById('log-box').replaceChildren();

  window.__closeOnlineModal();
  switchScreen('pick');
  setBoardPerspective(role === 'P2');

  tempPickedHeroes = (role === 'P1') ? [...DEFAULT_ROSTER] : [...DEFAULT_AI_ROSTER];
  resetDraftView();

  const badgeEl = document.getElementById('pick-header-badge');
  if (badgeEl) {
    badgeEl.innerText = role === 'P1' ? 'NETWORK // P1 / 先行' : 'NETWORK // P2 / 後攻';
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
  setLocalPlayerRole(myOnlineRole);
  setBoardPerspective(myOnlineRole === 'P2');
  initBoard();

  selectedDeployPos = null;

  if (myOnlineRole === 'P1') {
    gamePhase = 'DEPLOY_P1';
    applyDefaultPlacement('P1', teamRoster.P1);
    selectFirstDeployPiece('P1');
    addLog("【先行・自軍】初期配置フェーズ：自陣（手前2マス以内）に味方とアンカーを配置してください。", "p1");
    setPhaseInstruction("【先行・自軍 初期配置】自陣（手前2マス）に味方とアンカーを配置してください。完了したら「配置完了」を押してください");
  } else if (myOnlineRole === 'P2') {
    gamePhase = 'DEPLOY_WAIT_P1';
    addLog("⏳ 相手 (先行・P1) が初期配置を行っています。相手の配置が完了するまでお待ちください...", "system");
    setPhaseInstruction("⏳ 相手 (先行・P1) が初期配置中... 相手の配置完了をお待ちください");
  }

  renderAll();
}

function startBattlePhase() {
  clearAITimeout();
  resetBattleSession();
  clearBattlePresentation();
  gamePhase = 'BATTLE';
  turn = 'P1';
  turnCount = 1;
  isGameOver = false;

  const bTitle = document.querySelector('.tokens-banner-title');
  if (bTitle) bTitle.innerText = 'SYNC ORDERS';

  const startingFx = createTurnFxQueue();
  resetActionOrders('P1', startingFx);
  resetActionOrders('P2');

  const activeHuman = gameMode === 'online' ? myOnlineRole : soloHumanRole;
  setBoardPerspective(activeHuman === 'P2');
  setLocalPlayerRole(activeHuman);
  resetTurnPassives('P1', startingFx);

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
    addLog(`⚔️ バトルフェーズ開始！あなたは 【${soloHumanRole === 'P1' ? '先攻 (P1)' : '後攻 (P2)'}】 です！`, soloHumanRole.toLowerCase());
    setPhaseInstruction(
      soloHumanRole === 'P1'
        ? "先攻・自軍のターンです！キャラクターを持ち上げてドラッグ（移動/攻撃）、またはクリックでスキル確認"
        : "先攻・敵軍 (AI) のターンです（思考中... 相手の行動を確認してください）"
    );
  }

  renderAll();
  playTurnTransition(turn, turnCount, startingFx.effects, startEnemyAiTurn);
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

  if (msg.type === 'REMATCH_READY') {
    const signal = battleSession.signal;
    Promise.resolve(activeBattleOperation).then(() => {
      if (!signal.aborted && gameMode === 'online' && isGameOver && msg.sender !== myOnlineRole) {
        opponentRematchReady = true;
        updateRematch();
      }
    });
  } else if (msg.type === 'ONLINE_PICK_CONFIRM') {
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

      addLog("相手の初期配置が完了しました！相手の配置を確認しながら自陣（手前2マス）に味方とアンカーを配置してください。", 'p2');
      setPhaseInstruction("【後攻・自軍 初期配置】相手の配置を確認しながら自陣に配置してください。「バトル開始！」を押すと開戦します");
      renderAll();
    }
  } else if (msg.type === 'DEPLOY_P2_DONE') {
    if (myOnlineRole === 'P1') {
      msg.payload.pieces.forEach(p => {
        spawnHero(p.typeKey, p.owner, p.r, p.c);
      });

      addLog("相手（後攻・P2）の初期配置が完了しました！", 'p2');
      addLog("⚔️ 両軍の初期配置が完了！少数精鋭アンカー破壊バトルが始まります！", 'system');
      startBattlePhase();
    }
  } else if (msg.type === 'ACTION') {
    const signal = battleSession.signal;
    incomingBattleActions = incomingBattleActions.then(async () => {
      await activeBattleOperation;
      if (signal.aborted || isGameOver || gamePhase !== 'BATTLE') return;
      await runBattleOperation(presentation => applyRemoteBattleAction(msg.payload, msg.sender, presentation));
    });
  }
};

async function applyRemoteBattleAction(payload, sender, presentation) {
  const { action, from, to, heroPos, targetPos, slot, pos } = payload;
  if (action === 'MOVE') {
    await executeMove(from, to, triggerGameOver, presentation);
  } else if (action === 'ATTACK') {
    await executeAttack(from, to, triggerGameOver, presentation);
  } else if (action === 'SKILL') {
    await executeSkill(heroPos, targetPos, slot, triggerGameOver, presentation);
  } else if (action === 'DESTROY_OBJECT' || action === 'DESTROY_BARRICADE') {
    if (!pos || sender !== turn || isLocalPlayer(sender)) return;
    if (action === 'DESTROY_BARRICADE' && board[pos.r]?.[pos.c]?.typeKey !== 'BARRICADE') return;
    const destroyed = await destroyObject(pos.r, pos.c, sender, presentation);
    if (destroyed && !presentation.signal.aborted && selectedPos?.r === pos.r && selectedPos.c === pos.c) {
      clearSelection();
      return;
    }
  } else if (action === 'END_TURN') {
    addLog(`${isLocalPlayer(turn) ? '自軍' : '敵軍'} がターンを終了しました`, turn.toLowerCase());
    await executeTurnChange(presentation);
    return;
  }
  if (!presentation.signal.aborted && !isGameOver) renderAll();
}

network.onDisconnected = () => {
  if (!myOnlineRole || gamePhase === 'TITLE') return;
  addLog(`⚠️ 対戦相手との通信が切断されました。`, 'system');
  clearAITimeout();
  resetBattleSession();
  clearTurnCutin();
  clearBattlePresentation();
  document.getElementById('disconnect-modal').classList.add('active');
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
  if (badgeEl) badgeEl.innerText = 'SOLO';

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
initBattleAudio(document.getElementById('battle-se-toggle'));
initHomeView();
initBoard();
showTitleScreen();
renderAll();
