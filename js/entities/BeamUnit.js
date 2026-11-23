import { UnitEntity } from './UnitEntity.js?v=urban-v1';
import { BOARD_MARK_DEFS, inBounds } from '../config.js?v=urban-v1';

export class BeamUnit extends UnitEntity {
  onTurnStart(board, { playBeamFX, playPassivePopupFX, playMarkFX } = {}) {
    const origin = { r: this.r, c: this.c };
    const { name, color, color2, targetsAllies } = BOARD_MARK_DEFS[this.mark];
    let marked = false;
    for (const [dr, dc] of this.directions) {
      let r = this.r + dr;
      let c = this.c + dc;
      if (!inBounds(r, c)) continue;
      for (; inBounds(r, c); r += dr, c += dc) {
        const piece = board[r][c];
        if (piece && (piece.owner === this.owner) === targetsAllies) {
          piece.marks.set(this.id, { key: this.mark, owner: this.owner });
          playMarkFX?.({ r, c }, color);
          marked = true;
        }
      }
      playBeamFX?.(origin, { r: r - dr, c: c - dc }, { color, color2 });
    }
    playPassivePopupFX?.(origin, { label: marked ? name : '', color, color2 });
  }

  getMarkedPieces(board) {
    return board.flat().filter(piece => piece?.marks.has(this.id));
  }

  getSkillTargets(slot, { board }) {
    return this.getMarkedTargets(board, slot).length ? [{ r: this.r, c: this.c }] : [];
  }

  isPassiveActive({ board } = {}) {
    return Boolean(board && this.getMarkedPieces(board).length);
  }
}
