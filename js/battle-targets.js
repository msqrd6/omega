import { COLS, ROWS, inBounds } from './config.js?v=lab-white-3';

export function cellsInRadius(center, radius, includeCenter = true) {
  const cells = [];
  for (let r = Math.max(0, center.r - radius); r <= Math.min(ROWS - 1, center.r + radius); r++) {
    for (let c = Math.max(0, center.c - radius); c <= Math.min(COLS - 1, center.c + radius); c++) {
      if (includeCenter || r !== center.r || c !== center.c) cells.push({ r, c });
    }
  }
  return cells;
}

export function boardCells() {
  return Array.from({ length: ROWS * COLS }, (_, i) => ({ r: Math.floor(i / COLS), c: i % COLS }));
}

export function isEmptyAt(board, { r, c }) {
  return !board[r][c];
}

export function allyLandingCells(unit, board, requireEngagement) {
  const targets = new Map();
  for (const ally of board.flat()) {
    if (!ally?.isUnit() || ally === unit || ally.owner !== unit.owner || ally.hp <= 0) continue;
    const adjacent = cellsInRadius(ally, 1, false);
    if (requireEngagement && !adjacent.some(({ r, c }) => {
      const enemy = board[r][c];
      return enemy && enemy.hp > 0 && enemy.owner !== unit.owner;
    })) continue;
    for (const cell of adjacent) {
      if (isEmptyAt(board, cell)) targets.set(cell.r * COLS + cell.c, cell);
    }
  }
  return [...targets.values()];
}

export function diagonalDirections({ r, c }) {
  return [[-1, -1], [-1, 1], [1, -1], [1, 1]]
    .map(([dr, dc]) => ({ r: r + dr, c: c + dc }))
    .filter(pos => inBounds(pos.r, pos.c));
}

export function diagonalRay(origin, direction) {
  const dr = Math.sign(direction.r - origin.r);
  const dc = Math.sign(direction.c - origin.c);
  if (!dr || !dc) return [];
  const cells = [];
  for (let r = origin.r + dr, c = origin.c + dc; inBounds(r, c); r += dr, c += dc) {
    cells.push({ r, c });
  }
  return cells;
}

export function occupants(board, cells, owner, side, classes) {
  return cells.flatMap(({ r, c }) => {
    const piece = board[r][c];
    if (!piece || piece.hp <= 0 || (piece.owner === owner) !== (side === 'ally')) return [];
    return classes.includes(piece.classType) ? [piece] : [];
  });
}

// Execution, the target preview and AI use the same shape and class filters.
export function getSkillImpact(unit, slot, target, board) {
  if (!target) return { cells: [], targets: [] };
  const ult = slot === 'ULT';
  let cells = [target];
  let side = 'ally';
  let classes = ['UNIT'];
  switch (unit.typeKey) {
    case 'BLAST':
      if (ult) cells = cellsInRadius(target, 1);
      side = 'enemy';
      classes = ult ? ['UNIT', 'OBJECT', 'ANCHOR'] : ['UNIT', 'OBJECT'];
      break;
    case 'PRISM':
      cells = diagonalRay(unit, target);
      side = 'enemy';
      if (ult) classes = ['UNIT', 'OBJECT', 'ANCHOR'];
      break;
    case 'NEXUS':
      if (ult) cells = cellsInRadius(target, 2);
      break;
    case 'VULCAN':
      if (ult) {
        cells = cellsInRadius(target, 2);
        side = 'enemy';
        classes = ['UNIT', 'OBJECT', 'ANCHOR'];
      }
      break;
    case 'WARDEN':
      if (ult) {
        cells = cellsInRadius(unit, 1);
        return {
          cells,
          targets: occupants(board, cells, unit.owner, 'enemy', ['UNIT']),
          shieldTargets: [unit, ...occupants(board, boardCells(), unit.owner, 'ally', ['ANCHOR'])]
        };
      }
      break;
    case 'SMOG':
      if (!ult) {
        if (target.r !== unit.r || target.c !== unit.c) cells.push({ r: unit.r, c: unit.c });
        return { cells, targets: [] };
      }
      cells = cellsInRadius(unit, 1);
      side = 'enemy';
      break;
    case 'GLITCH':
      cells = cellsInRadius(target, 1, false);
      side = 'enemy';
      break;
    case 'LILY':
      if (ult) cells = boardCells().filter(({ r, c }) => {
        const ally = board[r][c];
        return ally?.owner === unit.owner && ally.isUnit();
      });
      break;
    case 'HALO':
      cells = cellsInRadius(target, 1);
      break;
    case 'HIVE':
      if (ult) {
        cells = boardCells().filter(({ r, c }) => {
          const bit = board[r][c];
          return bit?.typeKey === 'BIT' && bit.owner === unit.owner;
        });
      }
      break;
  }
  const targets = occupants(board, cells, unit.owner, side, classes);
  return { cells, targets };
}
