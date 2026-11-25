import { playBattleSound } from './battle-audio.js?v=juice-1';

const HIT_POP_MS = 480;
const DEFEAT_MS = 450;

function element(className, content) {
  const node = document.createElement('div');
  node.className = className;
  if (content) node.textContent = content;
  return node;
}

export function waitForBattleEffect(ms, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(finish, ms);
    function finish() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    }
    signal?.addEventListener('abort', finish, { once: true });
  });
}

async function temporaryNode(parent, node, duration, signal) {
  if (!parent || signal?.aborted) return;
  parent.append(node);
  try {
    await waitForBattleEffect(duration, signal);
  } finally {
    node.remove();
  }
}

async function temporaryClass(node, className, duration, signal) {
  if (!node || signal?.aborted) return;
  node.classList.add(className);
  try {
    await waitForBattleEffect(duration, signal);
  } finally {
    node.classList.remove(className);
  }
}

function tileAt({ r, c }) {
  return document.querySelector(`#board .tile[data-r="${r}"][data-c="${c}"]`);
}

function showAt(pos, node, duration, signal) {
  const layer = document.getElementById('battle-board-effects');
  const tile = tileAt(pos);
  if (!tile || !layer) return;
  // Use the rendered tile center, including gaps and the flipped P2 perspective.
  const at = tile.getBoundingClientRect();
  const bounds = layer.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  node.style.left = `${100 * (at.left + at.width / 2 - bounds.left) / bounds.width}%`;
  node.style.top = `${100 * (at.top + at.height / 2 - bounds.top) / bounds.height}%`;
  return temporaryNode(layer, node, duration, signal);
}

function playNumber(pos, tone, label, signal) {
  const node = element(`battle-effect battle-number is-${tone}`);
  node.append(element('battle-number-text', label));
  if (tone === 'weak') node.append(element('battle-number-tag', 'WEAKNESS HIT!'));
  return showAt(pos, node, HIT_POP_MS, signal);
}

function playDefeatPassive({ pos, label, kind }, signal) {
  const node = element(`battle-effect battle-kill-passive${kind === 'debuff' ? ' is-debuff' : ''}`);
  node.append(element('battle-kill-ring'), element('battle-passive-label', label));
  return showAt(pos, node, HIT_POP_MS, signal);
}

function playDefeat(pos, signal) {
  const tile = tileAt(pos);
  const particles = element('battle-effect battle-shards');
  for (let i = 0; i < 8; i++) {
    const shard = element('battle-shard');
    const angle = (i * 45 + 15) * Math.PI / 180;
    const distance = 32 + (i % 3) * 12;
    shard.style.setProperty('--shard-x', `${Math.cos(angle) * distance}px`);
    shard.style.setProperty('--shard-y', `${Math.sin(angle) * distance}px`);
    particles.append(shard);
  }
  return Promise.all([
    temporaryClass(tile?.querySelector('.piece'), 'battle-piece-defeat', DEFEAT_MS, signal),
    showAt(pos, particles, DEFEAT_MS, signal)
  ]);
}

export async function playCombatEffects({ hits, defeats, readouts, passives, removeDefeated }, signal) {
  if (signal?.aborted) return;
  const boardFrame = document.getElementById('board-frame');
  if (!boardFrame) return;
  const weakness = hits.some(hit => hit.weakness);
  const heavy = weakness || hits.some(hit => hit.amount >= 30);
  const hitstop = hits.length ? (heavy ? 120 : 60) : 0;
  const playReadouts = () => {
    const numbers = readouts.map(({ pos, amount }) =>
      amount > 0 ? playNumber(pos, 'heal', `+${amount}`, signal) : playNumber(pos, 'shield', 'SHIELD!', signal)
    );
    for (const { pos, amount, weakness: weak } of hits) {
      numbers.push(
        showAt(pos, element('battle-effect battle-impact-flash'), 280, signal),
        playNumber(pos, weak ? 'weak' : 'hit', `-${amount}`, signal)
      );
    }
    return numbers;
  };
  const release = async () => {
    const deaths = defeats.map(pos => playDefeat(pos, signal));
    if (deaths.length) playBattleSound('defeat');
    await Promise.all(deaths);
    removeDefeated();
  };
  const animations = playReadouts();
  if (hitstop) {
    playBattleSound(weakness ? 'weakness' : 'hit');
    await temporaryClass(boardFrame, 'battle-hitstop', hitstop, signal);
  }
  if (signal?.aborted) return;

  if (heavy || defeats.length) {
    animations.push(temporaryClass(boardFrame, 'shake-lg', 280, signal));
  } else if (hits.length) {
    animations.push(temporaryClass(boardFrame, 'shake-sm', 180, signal));
  }
  if (defeats.length) animations.push(release());
  animations.push(...passives.map(passive => playDefeatPassive(passive, signal)));
  await Promise.all(animations);
}
