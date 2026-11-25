# Mock-to-Production Reference Map

Technical reference for executing `implement-battle-mock`. Do **not** blindly rename internal `'P1'` / `'P2'` state keys—convert only presentation, CSS classes, labels, and perspective bindings.

---

## 1. Source of Truth in `battle_mock.html`

Keep these exact finalized visual decisions when porting to production:

| Feature | Mock Reference in `battle_mock.html` | Production Target & Notes |
| --- | --- | --- |
| Active Visual Theme | `zzz-hdd` (`01 HDD・CRT`) tokens & panel styling | `urban-battle.css` / `index.html`. Exclude `mock-lab-bar` theme switchers. |
| TOKENS UI | Plan A (`slot` variant in `renderTopHudAndTokens` / `renderTokensContent`) | `#action-status-banner` / `#action-tokens-container` (`js/ui.js`). Omit `3 READY` badge and `.tk-slot-pip` top-right dots. Show `EXTRA MOVE` gold bar when active. |
| Inspector Tab | `.ar-tabs` (`INFO` / `BATTLE LOG`) | `#urban-tab-details` in `index.html` (`UNIT INFO` -> `INFO`). |
| Skill Heading Font | `.ar-passive-head` & skill headers using `var(--piece-name-font)` | Match `.ar-banner-name` font in `urban-battle.css` / `js/urban-ui.js`. |
| Target Tiles | Flat-tint `.valid-move`, `.valid-attack`, `.skill-target`, `.heal-target` (no diagonal stripes) | `urban-battle.css` + `js/ui.js`. Center `icon('move')` & `icon('skill')` (`50% / 50%`) even over hazards/traps; IRIS heal uses `icon('skill')` in green badge. |
| Unit Target Badges | `.target-mark` / `.ult-target-mark` at `top: -4px; left: 50%` | Center attack, heal-skill, and ULT badges at the top center of target units. |
| Surround Dimming | `.is-skill-armed` and `.is-ult-armed` (`brightness(0.42) saturate(0.68)`) | Apply during both armed SKILL and armed ULT; clicking the armed button again cancels targeting. |
| Hazards & Traps | `.floor`, `.floor-badge`, `.floor-dock-svg` (`ディメンション`, `トキシック`, `マイン`—no `ゾーン`), amber 4-corner Mine reticles (no center diamond) | Ally hazards stay green/purple + `#3c3e47` dock + white text; Enemy hazards get red border/glow + red dock stroke + red text. Remove `敵` / `味方` corner text. |
| ULT 100% Shimmer | `.core-ult-sheen` & `.ar-ult-sheen` | Animate button/gauge shimmer when ULT hits 100%. |
| Popups & Cut-In | `playCombatPopupFX`, `playSkillPopupFX` (`DMG`, `HEAL`, `SKILL`, `ULT`) + ZZZ ULT cut-in | Port into battle action pipeline (`js/ui.js` / `js/actions.js` / `js/main.js`). |
| Enemy Piece Nameplate | `#battle-stage .piece.enemy .piece-readout .piece-name` | Port red text styling and verify contrast against dark/light tiles. |

**Explicitly Exclude from Production**:
- `#mock-lab-bar`, `mockState`, `buildScenario`, `renderBoardMock`, `renderInspectorMock`, variant comparison controls (`slot` vs `card` vs `dock`), and debug FX replay buttons.

---

## 2. Production Audit: `BLUE`/`RED` & Perspective Hotspots

Locations already identified where `'P1'`/`'P2'` presentation is hardcoded as `'BLUE'`/`'RED'` or assumes `P1 === Ally`:

| File | Current Issue / Symbol | Required Direction |
| --- | --- | --- |
| `index.html` | `#turn-badge` (`BLUE TURN`), `#core-bar-enemy` (`REDコアステータス`, hardcoded `#p2-core-bar`/`#p2-ult-bar`), `#core-bar-ally` (`BLUEコアステータス`, hardcoded `#p1-core-bar`/`#p1-ult-bar`), `#winner-title` (`BLUE VICTORY!`), `#tab-host` (`HOST ROOM (BLUE)`), `#tab-join` (`JOIN ROOM (RED)`), `#urban-tab-details` (`UNIT INFO`) | Remove `BLUE`/`RED` labels, decouple `#p1-*`/`#p2-*` IDs or swap binding dynamically by viewer role, rename `UNIT INFO` -> `INFO`. |
| `js/board.js` | `localPlayerRole`, `setLocalPlayerRole(role)`, `isLocalPlayer(owner)` | Single source of truth for viewer identity (`P1` in PvE/Host, `P2` in Online Guest). |
| `js/ui.js` | `setBoardPerspective(flipped)` adds `.flipped-perspective` / `.flipped-bar`, `updateStatus()` binds `P1` to `#p1-*` (ally bar) and `P2` to `#p2-*` (enemy bar) + `BLUE`/`RED` badges, `renderBoard()` sets `isEnemy = unit.owner === 'P2'` + `hazard-owner-p1/p2` + `BLUE`/`RED` `tile.title`, `updateEndTurnButton()` checks `turn === 'P1'`, `showGameOverModal()` prints `BLUE VICTORY!` / `RED VICTORY!`, `renderDeployPanel()` mentions `先行 (BLUE)` / `後攻 (RED)`, `addLog()` formats `BLUE` / `RED`. | Evaluate `.enemy`, `.enemy-turn`, `.core-bar.ally` / `.enemy`, hazard red styling, hold button polarity, and victory text via `isLocalPlayer(...)` / `localPlayerRole`. Keep `p1`/`p2` CSS helper classes mapped cleanly to `--z-p1` (yellow) / `--z-p2` (red) or refactor to `.ally`/`.enemy`. |
| `js/urban-ui.js` | `inspector.dataset.team = ... === 'P2' ? 'RED' : 'BLUE'`; `characterArt('CORE', owner)` chooses `'nexus'` vs `'cypher'` | Map `inspector.dataset.team` to viewer-relative `ALLY` / `ENEMY` (`--lime` yellow vs `--orange` red). |
| `js/network.js` | `_setupConnection` status message prints `BLUE (先行)` / `RED (後攻)` | Replace with team-color-neutral role text (e.g., `先行 (HOST / P1)` / `後攻 (GUEST / P2)`). |
| `js/actions.js` | `addLog` strings mentioning `BLUE` / `RED` / `青` / `赤` | Update log strings to neutral unit/owner or viewer-relative phrasing. |
| `js/ai.js` | `setPhaseInstruction("RED AI思考中...")` | Replace with `"ENEMY AI 思考中..."` or similar non-RED phrasing. |
| `js/main.js` | `setBoardPerspective`, `setLocalPlayerRole`, phase instructions & log messages referencing `BLUE` / `RED` / `青` / `赤` | Ensure `setLocalPlayerRole` and `setBoardPerspective` stay synced before every UI render on mode start, online join, and rematch/reset. |
| `urban-battle.css` | `--p1-color: #d8ff00`, `--p2-color: #ff4625`, `.piece.p2`, `.hold-turn.p2`, `.inspector[data-team="RED"]` | Unify theme variables cleanly so ally UI always resolves to `#d8ff00` (yellow) and enemy UI always resolves to `#ff4625` (red). Notice `.flipped-perspective` currently has no rule in `urban-battle.css`. |

---

## 3. Expected Phase 2 -> Phase 3 Deferrals

Expect to defer these items cleanly during Phase 1/2 and settle them autonomously in Phase 3:

1. **Online `P2` Core Art (`characterArt('CORE', owner)`)**: Decide whether `Nexus` (`P1`) / `Cypher` (`P2`) artwork follows `owner` (`P1` stays Nexus, `P2` stays Cypher while accent color flips to viewer-relative yellow/red) and document consistently.
2. **`local` Hotseat Mode (`gameMode === 'local'`)**: Decide deterministic viewer perspective when two humans share one screen (fixed `P1` bottom yellow, or turn-relative) so `ui.js` never shows contradictory messages.
3. **Trap (`マイン`) Distinction**: Confirm final icon/hover/inspector behavior once integrated with hidden enemy traps (`hasVisibleTrap = !!(trap && isLocalPlayer(trap.owner))`) per `RULEBOOK.md`.
4. **Screen 1 / Screen 2 / Deploy & Modals**: Harmonize Title, Draft Pick, Deploy Phase bars/waiting banners, Rules Modal, and Victory Modal with `zzz-hdd` + Yellow/Red rules once the main Battle Stage matches `battle_mock.html`.
5. **Structure & Summon Cards**: Verify Inspector `INFO` rendering and board badges for `CORE`, `TURRET`, `BARRICADE`, and `BIT` (`HIVE`), plus `KINESIS` extra-move Token slot activation (`EXTRA MOVE // キネシス`).
