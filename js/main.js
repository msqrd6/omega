import { ROWS, COLS, DEPLOYABLE_ROWS, INITIAL_PIECE_KEYS, SELECTABLE_HERO_KEYS, DEFAULT_ROSTER, HERO_TYPES } from './config.js?v=20261023_20';
import {
  board,
  initBoard,
  getValidMoves,
  getValidAttacks,
  getValidSkillTargets,
  hasDebuff,
  spawnHero,
  removePiece,
  canDeployAt,
  getDeployedPieces,
  applyDefaultPlacement,
  getHazardInfoAt,
  getActionTokens,
  getMaxActionTokens,
  hasActionToken,
  resetActionTokens,
  resetTurnPassives,
  phantomZones,
  isUnit,
  isCore,
  isObject,
  setLocalPlayerRole
} from './board.js?v=20261023_20';
import {
  executeMove,
  executeAttack,
  executeSkill,
  destroyBarricade,
  tickTurnEffects,
  processTurretAttacks,
  processTurnStartHazards,
  processTurnEndPassives
} from './actions.js?v=20261023_20';
import {
  tileElements,
  createBoardDOMOnce,
  updateBoardView,
  updateRightsDisplay,
  updateStatus,
  renderHeroControlPanel,
  renderDeployPanel,
  renderPickModal,
  hidePickModal,
  showGameOverModal,
  showHazardToast,
  addLog,
  setBoardPerspective
} from './ui.js?v=20261023_20';
import { runAITurn } from './ai.js?v=20261023_20';
import { network } from './network.js?v=20261023_20';

// ゲーム進行ステート
// 'TITLE' -> 'PICK_P1' -> 'DEPLOY_P1' -> 'DEPLOY_P2' -> 'BATTLE'
let gamePhase = 'TITLE';
let turn = 'P1';
let turnCount = 1;
let gameMode = 'pve'; // 'pve' or 'online'
let myOnlineRole = null; // 'P1' (ホスト/青) or 'P2' (ゲスト/赤) or null
let isGameOver = false;

// オンラインピック/配置の同期状態
let myPickConfirmed = false;
let opponentPickConfirmed = false;

// チームごとの選択キャラクター（各チーム5体）
let teamRoster = {
  P1: [...DEFAULT_ROSTER],
  P2: ['PHANTOM', 'POISON', 'SENTINEL', 'DISRUPTOR', 'MEDIC']
};
let tempPickedHeroes = [];

// バトル時の行動権限
let moveRightAvailable = true;
let attackRightAvailable = true;
let selectedPos = null;
let selectedHazardPos = null;
let commandMode = null; // 'MOVE', 'ATTACK', 'SKILL_A', 'SKILL_ULT'
let validTargets = [];

// 初期配置時のステート
let selectedDeployPiece = 'CORE';
let selectedDeployPos = null;


// 初期配置時に各陣営の先頭駒を自動選択
function selectFirstDeployPiece(owner) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] && board[r][c].owner === owner) {
        selectedPos = { r, c };
        selectedDeployPos = { r, c };
        selectedDeployPiece = board[r][c].typeKey;
        return;
      }
    }
  }
}

// 初期配置フェーズ用のアクションステータスバー更新
function updateDeployBanner(owner) {
  const container = document.getElementById('action-tokens-container');
  const endTurnBtn = document.getElementById('btn-end-turn');
  const bannerTitle = document.querySelector('.tokens-banner-title');

  if (bannerTitle) bannerTitle.innerText = '配置状況:';

  if (container) {
    container.innerHTML = `
      <div class="deploy-banner-info">
        <span class="dbi-badge ${owner.toLowerCase()}">${owner === 'P1' ? 'BLUE' : 'RED'} 初期配置中</span>
        <span class="dbi-desc">自陣縦3マス以内でドラッグ移動（味方上で位置スワップ）</span>
        <button class="btn-deploy-sub-mini" onclick="window.__onAutoDeploy()" title="おすすめ配置に戻す">🎲 おすすめ配置</button>
      </div>
    `;
  }

  if (endTurnBtn) {
    const isP1 = (owner === 'P1');
    endTurnBtn.className = `btn-end-turn btn-deploy-confirm-top ${owner.toLowerCase()}`;
    endTurnBtn.innerText = isP1 
      ? (gameMode === 'online' ? '先行・配置完了（送信 ➔）' : '先行・配置完了（後攻へ ➔）')
      : '後攻・配置完了（⚔️ バトル開始！）';
    endTurnBtn.onclick = () => window.__onConfirmDeploy();
    endTurnBtn.disabled = false;
    endTurnBtn.style.opacity = '1';
    endTurnBtn.style.cursor = 'pointer';
  }
}

export function updateModeBadge() {
  const badge = document.getElementById('current-mode-badge');
  if (!badge) return;
  if (gameMode === 'online') {
    const roleText = (myOnlineRole === 'P1') ? '先行・BLUE' : (myOnlineRole === 'P2' ? '後攻・RED' : '接続待機中');
    badge.className = `current-mode-badge ${myOnlineRole === 'P1' ? 'online-p1' : (myOnlineRole === 'P2' ? 'online-p2' : '')}`;
    badge.innerText = `🌐 ネット対戦 [${roleText}]`;
  } else {
    badge.className = 'current-mode-badge';
    badge.innerText = '🤖 vs AI モード';
  }
}

export function initGame() {
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
    P2: ['PHANTOM', 'POISON', 'SENTINEL', 'DISRUPTOR', 'MEDIC']
  };
  tempPickedHeroes = [...DEFAULT_ROSTER];

  moveRightAvailable = true;
  attackRightAvailable = true;
  selectedPos = null;
  selectedHazardPos = null;
  commandMode = null;
  validTargets = [];

  selectedDeployPiece = null;
  selectedDeployPos = null;

  document.getElementById('log-box').innerHTML = '';
  addLog("🎮 CYBER TACTICS へようこそ！", "system");
  addLog("【先行・BLUE】キャラクター選択フェーズ：全ロールから自由に5体を選んでください。", "system");
  document.getElementById('phase-instruction').innerText = "【キャラクター選択】全ロールの中から好きな5体を選んで [この5体で決定] を押してください";
  document.getElementById('victory-modal').classList.remove('active');

  renderAll();
  renderPickModal({
    currentOwner: 'P1',
    selectedHeroes: tempPickedHeroes
  });
}

function renderAll() {
  updateModeBadge();
  const isDeployPhase = (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2' || gamePhase === 'DEPLOY_WAIT_P1' || gamePhase === 'DEPLOY_WAIT_P2');
  const isPickPhase = (gamePhase === 'PICK_P1' || gamePhase === 'PICK_P2');

  // 要件３: アクション権限バナー（所持トークンバー）は初期配置中およびピック中は非表示にする
  const bannerEl = document.querySelector('.action-status-banner');
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
      selectedDeployPiece,
      roster: teamRoster[myOnlineRole || 'P1'],
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
      gamePhase
    });
  }

  updateStatus(turn, gameMode, gamePhase);

  // オンライン対戦時のUI調整 (ボタン非活性・手番バッジ・指示文等)
  if (gameMode === 'online') {
    const endTurnBtn = document.getElementById('btn-end-turn');
    if (endTurnBtn) {
      const isMyTurn = (turn === myOnlineRole);
      endTurnBtn.disabled = !isMyTurn;
      endTurnBtn.style.opacity = isMyTurn ? '1' : '0.4';
      endTurnBtn.style.cursor = isMyTurn ? 'pointer' : 'not-allowed';
    }

    const turnBadge = document.getElementById('turn-badge');
    if (turnBadge && gamePhase === 'BATTLE') {
      const isMyTurn = (turn === myOnlineRole);
      const roleName = (myOnlineRole === 'P1') ? 'BLUE(あなた)' : 'RED(あなた)';
      turnBadge.innerText = `${turn === 'P1' ? 'BLUE' : 'RED'} の番 [${isMyTurn ? '★あなた' : '相手の番'}]`;
    }

    if (gamePhase === 'BATTLE' && turn !== myOnlineRole) {
      const instrEl = document.getElementById('phase-instruction');
      if (instrEl) {
        instrEl.innerText = "⏳ 相手のターンです（思考中... 相手の駒をクリックすると偵察可能）";
      }
    }
  }

  const curViewTurn = (gamePhase === 'DEPLOY_P1' || gamePhase === 'PICK_P1' || gamePhase === 'DEPLOY_WAIT_P2') ? 'P1' : ((gamePhase === 'DEPLOY_P2' || gamePhase === 'PICK_P2' || gamePhase === 'DEPLOY_WAIT_P1') ? 'P2' : turn);

  const selectedHero = selectedPos ? board[selectedPos.r][selectedPos.c] : null;
  const moveAvail = (!isDeployPhase && !isPickPhase && (selectedHero ? hasActionToken(curViewTurn, 'move', 1, selectedHero) : hasActionToken(curViewTurn, 'move', 1)));
  const atkAvail = (!isDeployPhase && !isPickPhase && (selectedHero ? hasActionToken(curViewTurn, 'attack', 1, selectedHero) : hasActionToken(curViewTurn, 'attack', 1)));

  updateBoardView({
    turn: curViewTurn,
    selectedPos,
    selectedHazardPos,
    commandMode,
    validTargets,
    moveRightAvailable: moveAvail,
    attackRightAvailable: atkAvail,
    isGameOver,
    gameMode,
    myOnlineRole,
    gamePhase,
    onPieceDragStartCallback: onPieceDragStart,
    onPieceDragEndCallback: onPieceDragEnd
  });
}

// タイルクリック処理
function onTileClick(r, c) {
  if (isGameOver) return;

  // =============================================================
  // 1. 初期配置フェーズ (DEPLOY_P1 / DEPLOY_P2)
  // =============================================================
  if (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2' || gamePhase === 'DEPLOY_WAIT_P1' || gamePhase === 'DEPLOY_WAIT_P2') {
    if (gameMode === 'online') {
      if (gamePhase === 'DEPLOY_P1' && myOnlineRole !== 'P1') return;
      if (gamePhase === 'DEPLOY_P2' && myOnlineRole !== 'P2') return;
      if (gamePhase === 'DEPLOY_WAIT_P1' || gamePhase === 'DEPLOY_WAIT_P2') return;
    }
    const curOwner = (gamePhase === 'DEPLOY_P1') ? 'P1' : 'P2';
    const clickedUnit = board[r][c];
    const isMyZone = DEPLOYABLE_ROWS[curOwner].includes(r);

    if (clickedUnit) {
      if (clickedUnit.owner === curOwner) {
        // 自軍駒をクリック: 性能カードを表示 & 移動対象として選択
        selectedDeployPos = { r, c };
        selectedPos = { r, c };
        selectedDeployPiece = clickedUnit.typeKey;
        addLog(`📌 ${clickedUnit.name} を選択中。空きマスへ移動、または味方へドラッグで位置スワップできます。`, curOwner.toLowerCase());
        renderAll();
        return;
      } else {
        // 敵駒をクリック（P2視察時）: 性能カードを偵察表示
        selectedPos = { r, c };
        addLog(`🔍 先行 BLUE の ${clickedUnit.name} を偵察中。`, 'system');
        renderAll();
        return;
      }
    } else {
      // 空きマスをクリック
      if (!isMyZone) {
        addLog(`⚠️ そこは自陣の縦3マス以内ではありません！（${curOwner === 'P1' ? '下側3行: 行4〜6' : '上側3行: 行0〜2'} に配置してください）`, 'system');
        return;
      }

      // 盤面上の既存駒を空きマスへ移動する場合
      if (selectedDeployPos && board[selectedDeployPos.r]?.[selectedDeployPos.c]) {
        const movingUnit = board[selectedDeployPos.r][selectedDeployPos.c];
        board[r][c] = movingUnit;
        board[selectedDeployPos.r][selectedDeployPos.c] = null;
        addLog(`🔄 ${movingUnit.name} の位置を変更しました。`, curOwner.toLowerCase());
        selectedPos = { r, c };
        selectedDeployPos = { r, c };
        renderAll();
        return;
      }
    }
    return;
  }

  // =============================================================
  // 2. 通常バトルフェーズ (BATTLE)
  // =============================================================
  if (gameMode === 'pve' && turn === 'P2') return;
  const isOnlineOpponentTurn = (gameMode === 'online' && turn !== myOnlineRole);

  const clickedUnit = board[r][c];
  const enemyOwner = (turn === 'P1') ? 'P2' : 'P1';

  // A. スキル対象選択中 (SKILL_A, SKILL_ULT)
  if (commandMode && commandMode.startsWith('SKILL_')) {
    if (isOnlineOpponentTurn) return;
    const isTarget = validTargets.some(t => t.r === r && t.c === c);

    if (isTarget) {
      const slot = commandMode.replace('SKILL_', ''); // 'A' or 'ULT'
      if (gameMode === 'online') {
        network.send('ACTION', {
          action: 'SKILL',
          heroPos: { r: selectedPos.r, c: selectedPos.c },
          targetPos: { r, c },
          slot
        });
      }
      executeSkill(selectedPos, { r, c }, slot, triggerGameOver);
      selectedPos = null;
      commandMode = null;
      validTargets = [];
      document.getElementById('phase-instruction').innerText = "スキル発動完了！続けて他の駒を操作するか、他に行動がなければ [ターン終了] を押してください";
      renderAll();
      return;
    } else {
      // 別の自軍駒をクリックした場合はスムーズに選択切り替え
      if (clickedUnit && clickedUnit.owner === turn) {
        selectHero(r, c);
        return;
      }
      // スキル選択解除
      commandMode = null;
      validTargets = [];
      renderAll();
      document.getElementById('phase-instruction').innerText = "行動を選んでください（緑枠クリック/ドラッグで移動、赤枠クリック/ドラッグで攻撃、またはスキルカード）";
      return;
    }
  }

  // B. 既に自軍駒が選択されている状態でのクリック操作（クリック移動・クリック攻撃・選択切替・解除）
  if (selectedPos) {
    const hero = board[selectedPos.r][selectedPos.c];

    // 自軍の手番駒が選択中の場合
    if (hero && hero.owner === turn && isUnit(hero) && !isOnlineOpponentTurn) {
      const canMove = hasActionToken(turn, 'move', 1, hero) && !hasDebuff(hero, 'bind');
      const canAttack = hasActionToken(turn, 'attack', 1, hero) && !hasDebuff(hero, 'disarm');

      // B-1. 移動可能マス（空きマス）をクリック ➔ 移動実行！
      if (!clickedUnit && canMove) {
        const validMoves = getValidMoves(selectedPos.r, selectedPos.c);
        if (validMoves.some(m => m.r === r && m.c === c)) {
          if (gameMode === 'online') {
            network.send('ACTION', {
              action: 'MOVE',
              from: { r: selectedPos.r, c: selectedPos.c },
              to: { r, c }
            });
          }
          const newPos = executeMove(selectedPos, { r, c }, triggerGameOver);
          selectedPos = newPos; // 移動先の駒をそのまま選択状態に保つ
          renderAll();
          document.getElementById('phase-instruction').innerText = `${hero.name} が移動しました！続けて赤枠の敵をクリック/ドラッグで攻撃、またはスキルカードを使用できます`;
          return;
        }
      }

      // B-2. 攻撃可能マス（敵駒や敵コア・防壁）をクリック ➔ 攻撃実行！
      if (clickedUnit && clickedUnit.owner === enemyOwner && canAttack) {
        const validAtks = getValidAttacks(selectedPos.r, selectedPos.c);
        if (validAtks.some(a => a.r === r && a.c === c)) {
          if (gameMode === 'online') {
            network.send('ACTION', {
              action: 'ATTACK',
              from: { r: selectedPos.r, c: selectedPos.c },
              to: { r, c }
            });
          }
          executeAttack(selectedPos, { r, c }, triggerGameOver);
          renderAll();
          document.getElementById('phase-instruction').innerText = "攻撃完了！続けて移動やスキルカード、または [ターン終了] を選べます";
          return;
        }
      }

      // B-3. 自身を再度クリック ➔ 選択解除
      if (selectedPos.r === r && selectedPos.c === c) {
        clearSelection();
        return;
      }

      // B-4. 別の自軍駒をクリック ➔ スムーズに選択切り替え
      if (clickedUnit && clickedUnit.owner === turn) {
        selectHero(r, c);
        return;
      }
    }
  }

  // C. 駒の新規選択、またはハザード確認、選択解除
  if (clickedUnit) {
    selectedHazardPos = null;
    selectHero(r, c);
  } else {
    // ハザード情報が存在するか判定（タッチ・クリックで効果を確認）
    const hazard = getHazardInfoAt(r, c);
    if (hazard) {
      selectedHazardPos = { r, c };
      selectedPos = null;
      commandMode = null;
      validTargets = [];
      document.getElementById('phase-instruction').innerText = `${hazard.icon} 【${hazard.name}】(${hazard.category}): ${hazard.desc}`;
      addLog(`📌 [${r},${c}] のハザード確認: ${hazard.icon} ${hazard.name} (${hazard.owner ? (hazard.owner === 'P1' ? 'BLUE' : 'RED') : '中立'}) - ${hazard.desc}`, 'system');
      renderAll();
      showHazardToast(r, c, hazard);
    } else {
      clearSelection();
    }
  }
}

function selectHero(r, c) {
  selectedPos = { r, c };
  selectedHazardPos = null;
  commandMode = null;
  validTargets = [];

  const unit = board[r][c];
  const footHazard = getHazardInfoAt(r, c);
  const hazardNote = footHazard ? ` 【足元: ${footHazard.icon}${footHazard.name}】` : '';

  if (unit.owner !== turn) {
    // 敵ユニットの偵察モード
    document.getElementById('phase-instruction').innerText = `🔍 ${unit.name} (敵${unit.typeKey === 'BARRICADE' ? '防壁' : 'ユニット'}) を偵察中。${hazardNote}ステータスを確認できます`;
  } else if (unit.typeKey === 'BARRICADE') {
    document.getElementById('phase-instruction').innerText = `🧱 ${unit.name} を選択中。${hazardNote}「防壁を破壊する」ボタンで撤去できます`;
  } else {
    document.getElementById('phase-instruction').innerText = `${unit.name} を選択中。${hazardNote}緑枠クリック/ドラッグで移動、赤枠クリック/ドラッグで攻撃、またはスキルカードを使用！`;
  }

  renderAll();
}

export function clearSelection() {
  selectedPos = null;
  selectedHazardPos = null;
  commandMode = null;
  validTargets = [];
  document.getElementById('phase-instruction').innerText = "自軍キャラクターを選択して移動/攻撃、またはドラッグ＆ドロップで素早く操作できます";
  renderAll();
}

export function setCommandMode(mode) {
  if (gameMode === 'online' && turn !== myOnlineRole) return;
  if (!selectedPos) return;
  const { r, c } = selectedPos;

  commandMode = mode;

  if (mode === 'MOVE') {
    validTargets = getValidMoves(r, c);
    document.getElementById('phase-instruction').innerText = "緑枠の移動先をクリックしてください";
  } else if (mode === 'ATTACK') {
    validTargets = getValidAttacks(r, c);
    document.getElementById('phase-instruction').innerText = "赤枠の攻撃対象（敵またはコア・防壁）をクリックしてください";
  } else if (mode === 'SKILL_A') {
    validTargets = getValidSkillTargets(r, c, 'A');
    document.getElementById('phase-instruction').innerText = `🅰️ 通常スキルの対象をクリックしてください`;
  } else if (mode === 'SKILL_ULT') {
    validTargets = getValidSkillTargets(r, c, 'ULT');
    document.getElementById('phase-instruction').innerText = `🌟 ウルトの対象をクリックしてください！`;
  }

  renderAll();
}

export function handleDestroyBarricade(r, c) {
  if (isGameOver) return;
  if (gamePhase !== 'BATTLE') return;
  if (gameMode === 'online' && turn !== myOnlineRole) return;

  const unit = board[r]?.[c];
  if (!unit || unit.typeKey !== 'BARRICADE') return;
  if (unit.owner !== turn) return;

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
    document.getElementById('phase-instruction').innerText = `${hazard.icon} 【${hazard.name}】(${hazard.category}): ${hazard.desc}`;
    addLog(`📌 [${r},${c}] のハザード確認: ${hazard.icon} ${hazard.name} (${hazard.owner ? (hazard.owner === 'P1' ? 'BLUE' : 'RED') : '中立'}) - ${hazard.desc}`, 'system');
    renderAll();
    showHazardToast(r, c, hazard);
  }
};

window.__onSelectUnitAt = (r, c) => {
  if (board[r] && board[r][c]) {
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

  addLog(`${turn === 'P1' ? '青' : '赤'} がターンを終了しました`, turn.toLowerCase());
  executeTurnChange();
}

function executeTurnChange() {
  // 1. 直前の手番プレイヤーのタレット自動射撃
  processTurretAttacks(turn, triggerGameOver);
  if (isGameOver) return;

  // 2. 直前の手番プレイヤーのターン終了時パッシブ効果（アイリスのナノ自動回復 & ネクサスのウルト直接+5チャージ）
  processTurnEndPassives(turn);

  // 3. 直前の手番プレイヤーのバフ・デバフ持続ターン減算（0で解除）
  tickTurnEffects(turn, triggerGameOver);
  if (isGameOver) return;

  moveRightAvailable = true;
  attackRightAvailable = true;
  selectedPos = null;
  commandMode = null;
  validTargets = [];

  // 手番交代
  if (turn === 'P1') {
    turn = 'P2';
  } else {
    turn = 'P1';
    turnCount++;
    document.getElementById('turn-count-badge').innerText = `T: ${turnCount}`;
  }

  // 新手番プレイヤーの行動トークンを全回復 (移動1, 攻撃1)
  resetActionTokens(turn);

  // 新手番プレイヤーのターン開始時パッシブ状態を更新（キネシスの専用移動トークン+1補充など）
  resetTurnPassives(turn);

  // 4. ターン開始時ハザード効果（トキシック・ゾーン汚染ダメージなど）
  processTurnStartHazards(turn, triggerGameOver);
  if (isGameOver) return;

  renderAll();

  document.getElementById('phase-instruction').innerText =
    (turn === 'P1') ? "BLUE: キャラクターを持ち上げてドラッグ（移動/攻撃）、またはクリックでスキル確認" : "RED: キャラクターを持ち上げてドラッグ（移動/攻撃）、またはクリックでスキル確認";

  if (gameMode === 'pve' && turn === 'P2' && !isGameOver) {
    runAITurn({
      onGameOver: triggerGameOver,
      onEndTurnCallback: executeTurnChange,
      updateViewCallback: renderAll
    });
  }
}

function triggerGameOver(winner) {
  isGameOver = true;
  showGameOverModal(winner);
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
  switchScreen('title');
  hidePickModal();
  const victoryModal = document.getElementById('victory-modal');
  if (victoryModal) victoryModal.classList.remove('active');
  network.close();
  myOnlineRole = null;
  gamePhase = 'TITLE';
  setLocalPlayerRole('P1');
  setBoardPerspective(false);
}

export function hideTitleScreen() {
  // switchScreen に統合
}

export function resetGame() {
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

  // 初期配置中のドラッグ
  if (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2') {
    if (gameMode === 'online') {
      if (gamePhase === 'DEPLOY_P1' && myOnlineRole !== 'P1') return;
      if (gamePhase === 'DEPLOY_P2' && myOnlineRole !== 'P2') return;
    }
    const curOwner = (gamePhase === 'DEPLOY_P1') ? 'P1' : 'P2';
    const u = board[r][c];
    if (!u || u.owner !== curOwner) return;

    selectedDeployPos = { r, c };
    selectedDeployPiece = u.typeKey;
    document.getElementById('phase-instruction').innerText = `${u.name} を自陣の空きマスへドラッグ＆ドロップ！`;
    renderAll();
    return;
  }

  // バトル中のドラッグ
  if (gameMode === 'pve' && turn === 'P2') return;
  if (gameMode === 'online' && turn !== myOnlineRole) return;

  const hero = board[r][c];
  if (!hero || hero.owner !== turn || hero.typeKey === 'CORE' || hero.typeKey === 'BARRICADE' || hero.typeKey === 'TURRET') return;

  selectedPos = { r, c };
  commandMode = null;
  validTargets = [];

  const canMove = hasActionToken(turn, 'move', 1, hero) && !hasDebuff(hero, 'bind');
  const canAttack = hasActionToken(turn, 'attack', 1, hero) && !hasDebuff(hero, 'disarm');

  renderAll();

  if (canMove && canAttack) {
    document.getElementById('phase-instruction').innerText = `${hero.name}: 緑枠へドロップ/クリックで移動、赤枠の敵へドロップ/クリックで攻撃！`;
  } else if (canMove) {
    document.getElementById('phase-instruction').innerText = `${hero.name}: 緑枠へドロップ/クリックで移動！`;
  } else if (canAttack) {
    document.getElementById('phase-instruction').innerText = `${hero.name}: 赤枠の敵へドロップ/クリックで攻撃！`;
  }
}

// ドラッグ終了 (ドロップまたはキャンセル時)
function onPieceDragEnd() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (tileElements[r] && tileElements[r][c]) {
        tileElements[r][c].classList.remove('drag-over-valid', 'drag-over-attack');
      }
    }
  }

  renderAll();
}

// ドロップ処理 (空きマスまたは敵マスに駒を置いた時)
function onPieceDrop(fromR, fromC, toR, toC) {
  if (isGameOver) return;

  // 初期配置中のドロップ
  if (gamePhase === 'DEPLOY_P1' || gamePhase === 'DEPLOY_P2') {
    if (gameMode === 'online') {
      if (gamePhase === 'DEPLOY_P1' && myOnlineRole !== 'P1') return;
      if (gamePhase === 'DEPLOY_P2' && myOnlineRole !== 'P2') return;
    }
    const curOwner = (gamePhase === 'DEPLOY_P1') ? 'P1' : 'P2';
    const unit = board[fromR][fromC];
    if (!unit || unit.owner !== curOwner) return;

    if (!DEPLOYABLE_ROWS[curOwner].includes(toR)) {
      addLog(`⚠️ そこは自陣の縦3マス以内ではありません！`, 'system');
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
      // 空きマスへの移動
      board[toR][toC] = unit;
      board[fromR][fromC] = null;
      addLog(`🔄 ${unit.name} の位置を変更しました。`, curOwner.toLowerCase());
      selectedPos = { r: toR, c: toC };
      selectedDeployPos = { r: toR, c: toC };
      renderAll();
    } else if (targetUnit.owner === curOwner) {
      // ★要件３: 自ユニットがすでにいる場所にドラッグアンドドロップすると位置スワップ
      board[toR][toC] = unit;
      board[fromR][fromC] = targetUnit;
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
  if (!hero || hero.owner !== turn || hero.typeKey === 'CORE' || hero.typeKey === 'BARRICADE' || hero.typeKey === 'TURRET') return;

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
    const canAtk = validAtks.some(a => a.r === toR && a.c === toC);
    if (canAtk) {
      if (gameMode === 'online' && turn === myOnlineRole) {
        network.send('ACTION', {
          action: 'ATTACK',
          from: { r: fromR, c: fromC },
          to: { r: toR, c: toC }
        });
      }
      executeAttack({ r: fromR, c: fromC }, { r: toR, c: toC }, triggerGameOver);
      document.getElementById('phase-instruction').innerText = "攻撃完了！続けて [移動] または [スキルカード]、他に行動がなければ [ターン終了] を選べます";
      renderAll();
      return;
    } else {
      addLog(`そこは ${hero.name} の通常攻撃の射程外です`, 'system');
      renderAll();
      return;
    }
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
    const canMove = validMoves.some(m => m.r === toR && m.c === toC);
    if (canMove) {
      if (gameMode === 'online' && turn === myOnlineRole) {
        network.send('ACTION', {
          action: 'MOVE',
          from: { r: fromR, c: fromC },
          to: { r: toR, c: toC }
        });
      }
      selectedPos = executeMove({ r: fromR, c: fromC }, { r: toR, c: toC }, triggerGameOver);
      document.getElementById('phase-instruction').innerText = "移動完了！続けて [敵へドラッグして通常攻撃] または [スキルカード]、他に行動がなければ [ターン終了] を選べます";
      renderAll();
      return;
    } else {
      addLog(`そこは ${hero.name} の移動範囲外です`, 'system');
      renderAll();
      return;
    }
  }
}

// キャラクター選択用（ピックフェーズ）グローバルイベントハンドラー
window.__onTogglePickHero = (key) => {
  if (gameMode === 'online' && myPickConfirmed) return;

  if (tempPickedHeroes.includes(key)) {
    tempPickedHeroes = tempPickedHeroes.filter(k => k !== key);
  } else {
    if (tempPickedHeroes.length < 5) {
      tempPickedHeroes.push(key);
    } else {
      alert("選択できるユニットは最大5体です。不要なユニットの選択を解除してください。");
      return;
    }
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
    addLog(`✅ 【${myOnlineRole === 'P1' ? 'BLUE' : 'RED'}】チーム編成決定: ${teamRoster[myOnlineRole].map(k => HERO_TYPES[k].name).join(', ')}`, myOnlineRole.toLowerCase());

    // 相手にピック完了メッセージと編成を送信
    network.send('ONLINE_PICK_CONFIRM', { roster: teamRoster[myOnlineRole] });

    if (opponentPickConfirmed) {
      // 相手も既に完了していた場合 ➔ 初期配置フェーズへ！
      startOnlineDeployPhase();
    } else {
      // 相手の完了待ち
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
  addLog(`✅ BLUE チーム編成決定: ${teamRoster.P1.map(k => HERO_TYPES[k].name).join(', ')}`, 'p1');

  // RED (AI) の編成を自動選出
  teamRoster.P2 = ['PHANTOM', 'POISON', 'SENTINEL', 'DISRUPTOR', 'MEDIC'];
  addLog(`🤖 RED (AI) 編成決定: ${teamRoster.P2.map(k => HERO_TYPES[k].name).join(', ')}`, 'p2');

  // ピック画面からバトル盤面画面へ切り替え！
  switchScreen('battle');
  gamePhase = 'DEPLOY_P1';
  applyDefaultPlacement('P1', teamRoster.P1);
  selectFirstDeployPiece('P1');

  addLog("【先行・BLUE】初期配置フェーズ：自陣（縦3マス以内）に配置してください。", "system");
  document.getElementById('phase-instruction').innerText = "【先行・BLUE初期配置】この布陣で良ければ「先行・配置完了」を押してください（駒のドラッグで位置調整も可能）";
  renderAll();
};

// 初期配置用グローバルイベントハンドラー
window.__onSelectDeployPiece = (key) => {
  if (gameMode === 'online') {
    if (myOnlineRole === 'P1' && gamePhase !== 'DEPLOY_P1') return;
    if (myOnlineRole === 'P2' && gamePhase !== 'DEPLOY_P2') return;
  }
  selectedDeployPiece = key;
  selectedDeployPos = null;
  renderAll();
};

window.__onAutoDeploy = () => {
  const curOwner = (gameMode === 'online') ? myOnlineRole : ((gamePhase === 'DEPLOY_P1') ? 'P1' : 'P2');
  if (gameMode === 'online') {
    if (myOnlineRole === 'P1' && gamePhase !== 'DEPLOY_P1') return;
    if (myOnlineRole === 'P2' && gamePhase !== 'DEPLOY_P2') return;
  }
  applyDefaultPlacement(curOwner, teamRoster[curOwner]);
  selectedDeployPiece = null;
  selectedDeployPos = null;
  addLog(`🎲 ${curOwner === 'P1' ? 'BLUE' : 'RED'} のおすすめ配置を展開しました！`, curOwner.toLowerCase());
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
  selectedDeployPiece = 'CORE';
  selectedDeployPos = null;
  addLog(`🗑️ ${curOwner === 'P1' ? 'BLUE' : 'RED'} の配置を全クリアしました。`, curOwner.toLowerCase());
  renderAll();
};

window.__onConfirmDeploy = () => {
  if (gameMode === 'online') {
    if (myOnlineRole === 'P1' && gamePhase === 'DEPLOY_P1') {
      const deployed = getDeployedPieces('P1');
      const expectedCount = teamRoster.P1.length + 1; // 6体
      if (deployed.length < expectedCount) {
        alert(`6体すべてのユニット（コア＋選択した5ヒーロー）を自陣に配置してください！(現在: ${deployed.length}/${expectedCount})`);
        return;
      }

      // P1の駒一覧を抽出
      const pieces = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (board[r][c] && board[r][c].owner === 'P1') {
            pieces.push({
              typeKey: board[r][c].typeKey,
              owner: 'P1',
              r,
              c
            });
          }
        }
      }

      network.send('DEPLOY_P1_DONE', { pieces });
      gamePhase = 'DEPLOY_WAIT_P2';
      addLog("✅ 先行 BLUE の初期配置を確定・送信しました！後攻 RED の対抗配置を待っています...", 'p1');
      document.getElementById('phase-instruction').innerText = "⏳ 後攻 (RED) が初期配置中... 相手の配置完了をお待ちください";
      renderAll();
      return;
    }

    if (myOnlineRole === 'P2' && gamePhase === 'DEPLOY_P2') {
      const deployed = getDeployedPieces('P2');
      const expectedCount = teamRoster.P2.length + 1; // 6体
      if (deployed.length < expectedCount) {
        alert(`6体すべてのユニット（コア＋選択した5ヒーロー）を自陣に配置してください！(現在: ${deployed.length}/${expectedCount})`);
        return;
      }

      // P2の駒一覧を抽出
      const pieces = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (board[r][c] && board[r][c].owner === 'P2') {
            pieces.push({
              typeKey: board[r][c].typeKey,
              owner: 'P2',
              r,
              c
            });
          }
        }
      }

      network.send('DEPLOY_P2_DONE', { pieces });
      addLog("✅ 後攻 RED の配置が確定しました！", 'p2');
      addLog("⚔️ 両軍の初期配置が完了！少数精鋭コア破壊バトルが始まります！", 'system');
      startBattlePhase();
      return;
    }
    return;
  }

  // vs AI (ソロプレイ)
  if (gamePhase === 'DEPLOY_P1') {
    const deployed = getDeployedPieces('P1');
    const expectedCount = teamRoster.P1.length + 1; // コア + 5ヒーロー = 6体
    if (deployed.length < expectedCount) {
      alert(`6体すべてのユニット（コア＋選択した5ヒーロー）を自陣に配置してください！(現在: ${deployed.length}/${expectedCount})`);
      return;
    }

    addLog("✅ 先行 BLUE の配置が確定しました！", 'p1');
    addLog("【後攻・RED】初期配置フェーズ：先行の配置が見えた状態で、自陣（上側3マス以内）に配置してください。", 'system');

    gamePhase = 'DEPLOY_P2';
    applyDefaultPlacement('P2', teamRoster.P2);
    selectFirstDeployPiece('P2');
    addLog("🤖 RED (AI) の対抗初期配置が展開されました。「戦闘開始！」を押すとバトルが始まります。", 'p2');
    document.getElementById('phase-instruction').innerText = "【後攻・RED】AIの初期配置が展開されました。調整するか「バトル開始！」を押してください";

    renderAll();
  } else if (gamePhase === 'DEPLOY_P2') {
    const deployed = getDeployedPieces('P2');
    const expectedCount = teamRoster.P2.length + 1;
    if (deployed.length < expectedCount) {
      alert(`6体すべてのユニット（コア＋選択した5ヒーロー）を自陣に配置してください！(現在: ${deployed.length}/${expectedCount})`);
      return;
    }

    addLog("✅ 後攻 RED の配置が確定しました！", 'p2');
    addLog("⚔️ 両軍の初期配置が完了！少数精鋭コア破壊バトルが始まります！", 'system');
    addLog("先行・BLUEの手番です。自軍キャラをクリックまたはドラッグしてください。", 'p1');

    startBattlePhase();
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

// オンライン対戦のキャラクターピック開始（ホスト/ゲスト共通）
export function startOnlinePick(role) {
  myOnlineRole = role; // 'P1' (ホスト/青) or 'P2' (ゲスト/赤)
  gameMode = 'online';
  setLocalPlayerRole(role);
  myPickConfirmed = false;
  opponentPickConfirmed = false;

  hideTitleScreen();
  window.__closeOnlineModal();
  switchScreen('pick');
  updateModeBadge();

  // プレイヤー視点の設定（RED側なら自陣手前(flipped)に固定）
  setBoardPerspective(role === 'P2');

  // 初期選択ヒーロー
  if (role === 'P1') {
    tempPickedHeroes = [...DEFAULT_ROSTER];
  } else {
    tempPickedHeroes = ['PHANTOM', 'POISON', 'SENTINEL', 'DISRUPTOR', 'MEDIC'];
  }

  // ピック画面のタイトル・バッジを陣営に合わせて更新
  const badgeEl = document.getElementById('pick-header-badge');
  const titleEl = document.getElementById('pick-screen-title');
  const descEl = document.getElementById('pick-screen-desc');
  if (badgeEl) {
    badgeEl.innerText = (role === 'P1')
      ? '🌐 ONLINE MATCH // BLUE SQUAD (先行)'
      : '🌐 ONLINE MATCH // RED SQUAD (後攻)';
    badgeEl.className = `pick-header-badge online-${role.toLowerCase()}`;
  }
  if (titleEl) {
    titleEl.innerText = (role === 'P1')
      ? '【先行・BLUE】チーム編成フェーズ'
      : '【後攻・RED】チーム編成フェーズ';
  }
  if (descEl) {
    descEl.innerHTML = `全ヒーローから自由に <strong>5体</strong> を選抜せよ（相手の編成とは重複可能・同ロール複数可）`;
  }

  addLog(`🌐 オンライン対戦に接続しました！あなたは 【${role === 'P1' ? '先行・BLUE' : '後攻・RED'}】 です。`, role.toLowerCase());
  addLog(`全ヒーローから出撃させる5体を選抜して「この編成で決定」を押してください。`, 'system');

  renderPickModal({
    currentOwner: role,
    selectedHeroes: tempPickedHeroes,
    myPickConfirmed: false,
    isOnline: true
  });
}

// オンライン初期配置フェーズへの突入
export function startOnlineDeployPhase() {
  switchScreen('battle');
  updateModeBadge();
  setLocalPlayerRole(myOnlineRole);
  setBoardPerspective(myOnlineRole === 'P2');
  initBoard();

  selectedDeployPiece = null;
  selectedDeployPos = null;

  if (myOnlineRole === 'P1') {
    gamePhase = 'DEPLOY_P1';
    applyDefaultPlacement('P1', teamRoster.P1);
    selectFirstDeployPiece('P1');
    addLog("【先行・BLUE】初期配置フェーズ：自陣（手前3マス以内）に味方とコアを配置してください。", "p1");
    document.getElementById('phase-instruction').innerText = "【先行・BLUE 初期配置】自陣（行4〜6）に味方とコアを配置してください。完了したら「先行・配置完了」を押してください";
  } else if (myOnlineRole === 'P2') {
    gamePhase = 'DEPLOY_WAIT_P1';
    addLog("⏳ 先行 (BLUE) が初期配置を行っています。相手の配置が完了するまでお待ちください...", "system");
    document.getElementById('phase-instruction').innerText = "⏳ 先行 (BLUE) が初期配置中... 相手の配置完了をお待ちください";
  }

  renderAll();
}

// ホストから受信した盤面データを適用 (レガシー互換用)
function applyOnlineSyncData(syncData) {
  initBoard();
  if (syncData.teamRoster) {
    teamRoster.P1 = [...syncData.teamRoster.P1];
    teamRoster.P2 = [...syncData.teamRoster.P2];
  }
  if (syncData.pieces) {
    syncData.pieces.forEach(p => {
      spawnHero(p.typeKey, p.owner, p.r, p.c);
    });
  }
}

// バトルフェーズへ突入
function startBattlePhase() {
  hidePickModal();
  gamePhase = 'BATTLE';
  turn = 'P1';
  const endTurnBtn = document.getElementById('btn-end-turn');
  if (endTurnBtn) {
    endTurnBtn.className = 'btn-end-turn';
    endTurnBtn.innerText = 'ターン終了 ▶';
    endTurnBtn.onclick = () => manualEndTurn();
  }
  const bTitle = document.querySelector('.tokens-banner-title');
  if (bTitle) bTitle.innerText = '所持トークン:';
  turnCount = 1;
  isGameOver = false;

  resetActionTokens('P1');
  resetActionTokens('P2');
  resetTurnPassives('P1');
  resetTurnPassives('P2');

  // プレイヤー視点の固定: ネット対戦でRED(P2)側なら自陣を手前(反転)にする
  setBoardPerspective(gameMode === 'online' && myOnlineRole === 'P2');
  setLocalPlayerRole(gameMode === 'online' ? myOnlineRole : 'P1');

  // フェイズのパッシブ展開
  phantomZones.length = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = board[r][c];
      if (u && u.typeKey === 'PHANTOM') {
        phantomZones.push({
          r,
          c,
          owner: u.owner,
          sourceHeroId: u.id,
          sourceHeroType: 'PHANTOM'
        });
        addLog(`👻 ${u.name} のパッシブ『シャドウ・オリジン』発動！初期配置マス(${r}, ${c})にディメンション・ゾーンを展開！`, 'skill');
      }
    }
  }

  moveRightAvailable = true;
  attackRightAvailable = true;
  selectedPos = null;
  commandMode = null;
  validTargets = [];

  if (gameMode === 'online' && myOnlineRole) {
    const roleName = (myOnlineRole === 'P1') ? 'BLUE (先行)' : 'RED (後攻)';
    addLog(`⚔️ 🌐 オンライン対戦開始！あなたは 【${roleName}】 です！`, myOnlineRole.toLowerCase());
    if (myOnlineRole === 'P1') {
      document.getElementById('phase-instruction').innerText = "先行・あなたのターンです！キャラクターを持ち上げてドラッグ（移動/攻撃）、またはクリックでスキル確認";
    } else {
      document.getElementById('phase-instruction').innerText = "相手（先行・BLUE）の手番です（思考中... 相手の駒をクリックすると偵察可能）";
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
    addLog(`相手（${oppRole === 'P1' ? '先行・BLUE' : '後攻・RED'}）のチーム編成が完了しました！`, 'system');

    if (myPickConfirmed) {
      startOnlineDeployPhase();
    }
  } else if (msg.type === 'DEPLOY_P1_DONE') {
    if (myOnlineRole === 'P2') {
      // P1の駒をP2の盤面に配置
      msg.payload.pieces.forEach(p => {
        spawnHero(p.typeKey, p.owner, p.r, p.c);
      });

      gamePhase = 'DEPLOY_P2';
      // P2のおすすめ初期配置を展開
      applyDefaultPlacement('P2', teamRoster.P2);
      selectedDeployPiece = null;
      selectedDeployPos = null;

      addLog("先行 BLUE の初期配置が完了しました！先行の配置を確認しながら自陣（手前3マス）に味方とコアを配置してください。", 'p2');
      document.getElementById('phase-instruction').innerText = "【後攻・RED 初期配置】先行 BLUE の配置を確認しながら自陣に配置してください。「配置完了（戦闘開始！）」を押すと開戦します";
      renderAll();
    }
  } else if (msg.type === 'DEPLOY_P2_DONE') {
    if (myOnlineRole === 'P1') {
      // P2の駒をP1の盤面に配置
      msg.payload.pieces.forEach(p => {
        spawnHero(p.typeKey, p.owner, p.r, p.c);
      });

      addLog("後攻 RED の初期配置が完了しました！", 'p2');
      addLog("⚔️ 両軍の初期配置が完了！少数精鋭コア破壊バトルが始まります！", 'system');
      startBattlePhase();
    }
  } else if (msg.type === 'SYNC_START') {
    if (myOnlineRole === 'P2') {
      applyOnlineSyncData(msg.payload);
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
      addLog(`${turn === 'P1' ? '青' : '赤'} がターンを終了しました`, turn.toLowerCase());
      executeTurnChange();
      renderAll();
    }
  }
};

network.onDisconnected = () => {
  addLog(`⚠️ 対戦相手との通信が切断されました。`, 'system');
  alert('対戦相手との接続が切断されました。');
};

// オンラインモーダル操作のグローバル登録
window.__openOnlineModal = () => {
  document.getElementById('online-modal').classList.add('active');
};

window.__closeOnlineModal = () => {
  document.getElementById('online-modal').classList.remove('active');
};

window.__switchOnlineTab = (tab) => {
  document.getElementById('tab-host').classList.toggle('active', tab === 'host');
  document.getElementById('tab-join').classList.toggle('active', tab === 'join');
  document.getElementById('panel-host').style.display = (tab === 'host') ? 'block' : 'none';
  document.getElementById('panel-join').style.display = (tab === 'join') ? 'block' : 'none';
};

window.__createOnlineRoom = async () => {
  const btn = document.getElementById('btn-create-room');
  try {
    btn.disabled = true;
    btn.innerText = '部屋を生成中...';
    const roomId = await network.createRoom();
    document.getElementById('host-room-id-input').value = roomId;
    document.getElementById('host-room-info').style.display = 'block';
    btn.style.display = 'none';
  } catch (e) {
    btn.disabled = false;
    btn.innerText = '🎲 部屋を作成する';
  }
};

window.__copyRoomLink = () => {
  const roomId = document.getElementById('host-room-id-input').value;
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
  const roomId = input.value.trim();
  if (!roomId) {
    alert('合言葉 (Room ID) を入力してください。');
    return;
  }
  const btn = document.getElementById('btn-join-room');
  const waitMsg = document.getElementById('join-waiting-msg');
  btn.disabled = true;
  waitMsg.style.display = 'block';

  try {
    await network.joinRoom(roomId);
  } catch (e) {
    btn.disabled = false;
    waitMsg.style.display = 'none';
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
  onPieceDropCallback: onPieceDrop
});

// 初期画面はタイトル画面を表示
initBoard();
showTitleScreen();
renderAll();
