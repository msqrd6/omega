---
name: implement-battle-mock
description: Port the finalized battle UI mock (battle_mock.html) into the production game (index.html, urban-battle.css, style.css, js/) using a strict 3-phase workflow (fidelity port, deferral of indeterminables, autonomous consistency resolution) and migrating all team colors and labels from BLUE/RED to viewer-relative Self=Yellow and Enemy=Red across local and P2P online modes.
---

# Implement Battle Mock

Port the finalized UI design from [battle_mock.html](file:///C:/Users/pluga/omega/battle_mock.html) into the production codebase while migrating team visual identity from `BLUE` / `RED` to **viewer-relative `Self (Ally) = Yellow` / `Enemy = Red`**.

Read [references/mock-to-prod-map.md](references/mock-to-prod-map.md) before editing files. It contains the exact mock-to-production symbol mapping, excluded mock-only scaffolding, and initial deferral list.

## Non-Negotiable Principles

1. **Phase 1 — Reproduce the mock as faithfully as possible.**
   Match [battle_mock.html](file:///C:/Users/pluga/omega/battle_mock.html) in layout, typography, colors, spacing, icons, badges, animations, surround-dimming, and combat/skill/ULT popups.
2. **Phase 2 — Defer anything indeterminable from the mock.**
   When behavior, data binding, or non-battle screen styling cannot be inferred directly from `battle_mock.html`, do **not** guess or invent design tweaks mid-port. Keep existing production logic intact, add a crisp `TODO(mock-defer): <reason>` comment (or tracking note), and finish the mock port cleanly.
3. **Phase 3 — Resolve deferred items autonomously with full consistency.**
   Only **after** Phase 1 visually matches the mock and runs cleanly, resolve every deferred item against [RULEBOOK.md](file:///C:/Users/pluga/omega/RULEBOOK.md) and `js/` game state so UI, game rules, AI, and P2P networking stay 100% consistent.
4. **Viewer-Relative Team Identity (Global Spec Change).**
   Abolish `BLUE` / `RED` (and `青` / `赤`) everywhere. Own faction is **always yellow**, enemy faction is **always red**, evaluated from the local viewer's role against `'P1'` / `'P2'`—including in P2P online matches.

---

## Global Spec: Viewer-Relative Colors & Labels (`Self = Yellow`, `Enemy = Red`)

Production internally models players as `'P1'` (first/host) and `'P2'` (second/guest). Preserve `'P1'` / `'P2'` in game logic and network messages, and convert **presentation** through viewer-relative helpers (`isLocalPlayer(owner)` and `localPlayerRole` in `js/board.js`, synced with `myOnlineRole` in `js/main.js`).

### Color & Perspective Mapping

| Viewer / Mode | `P1` units, hazards, core, turn | `P2` units, hazards, core, turn |
| --- | --- | --- |
| Solo (`P1`) / Online Host (`P1`) | **Ally (`Self`) -> Yellow (`#d8ff00`)**, bottom of board | **Enemy -> Red (`#ff4625`)**, top of board |
| Online Guest (`P2`) | **Enemy -> Red (`#ff4625`)**, top of board | **Ally (`Self`) -> Yellow (`#d8ff00`)**, bottom of board |

### Required Presentation Fixes

- **Core Bars (`#core-bar-ally` / `#core-bar-enemy`)**: Currently `index.html` hardcodes `#p1-core-bar` inside `#core-bar-ally` and `#p2-core-bar` inside `#core-bar-enemy`. Bind the bottom yellow `#core-bar-ally` slot to `localOwner` (`P1` or `P2`) and the top red `#core-bar-enemy` slot to `enemyOwner` so an online `P2` player sees their own Core/ULT gauge in yellow at the bottom.
- **Board Pieces & Hazards (`js/ui.js`)**: Derive `.enemy` / ally classes from `!isLocalPlayer(unit.owner)` rather than `unit.owner === 'P2'`. Similarly, mark enemy hazards/traps from `!isLocalPlayer(hazard.owner)` so enemy hazards get red framing/dock/text and ally hazards keep normal styling from the viewer's perspective.
- **Inspector (`js/urban-ui.js`)**: Replace `inspector.dataset.team = hero.owner === 'P2' ? 'RED' : 'BLUE'` (and turn/hazard equivalents) with viewer-relative semantic values (`ALLY` -> `--lime` yellow accent / `ENEMY` -> `--orange` red accent).
- **Turn Display, Hold Button & Badges (`index.html`, `js/ui.js`)**: Apply `.enemy-turn` / enemy styling when active turn belongs to `!isLocalPlayer(activeOwner)`. Replace strings like `BLUE TURN` / `RED TURN` / `BLUE DRAFT` / `RED DEPLOY` / `WAIT BLUE` with team-color-neutral perspective text (e.g., `YOUR TURN` / `ENEMY TURN`, or `P1 (先行)` / `P2 (後攻)` for turn-order neutrality).
- **Online Lobby, Logs & Modals (`index.html`, `js/network.js`, `js/ui.js`, `js/actions.js`, `js/ai.js`, `js/main.js`)**:
  - Replace `HOST ROOM (BLUE)` / `JOIN ROOM (RED)` with `HOST ROOM (P1 / 先行)` / `JOIN ROOM (P2 / 後攻)` (or equivalent non-BLUE/RED labels).
  - Replace `BLUE VICTORY!` / `RED VICTORY!` with viewer-relative `VICTORY!` (yellow) / `DEFEAT...` (red) when applicable, and purge `BLUE` / `RED` / `青` / `赤` / `ブルー` / `レッド` from battle logs, tooltips, and AI status text.
- **Check contrast**: Inspect enemy unit nameplates (`#battle-stage .piece.enemy .piece-readout .piece-name`) against all tile backgrounds and ensure legibility while preserving yellow-ally / red-enemy clarity.

---

## Execution Workflow

### Phase 1: Fidelity Port from `battle_mock.html`

Work carefully across `index.html`, `urban-battle.css`, `style.css`, `js/ui.js`, `js/urban-ui.js`, and `js/main.js`:

1. **Adopt Finalized Mock Variant Only**:
   - Target skin: **`zzz-hdd`** (`01 HDD・CRT` style tokens and framing).
   - Target TOKENS UI: **Plan A (`slot`)** without the `3 READY` header pill and without `.tk-slot-pip` top-right dots; keep `ATK` (red) + `MOVE` (yellow-lime) slots and `EXTRA MOVE` gold banner when active.
   - Strip mock-only controls (`mock-lab-bar`, preset/skin/tokens switchers, `buildScenario`, static `mockState`, replay debug buttons).
2. **Board, Tiles, Hazards & Target Indicators**:
   - Port flat-tint target tiles (no diagonal stripes).
   - Center MOVE (`icon('move')`) and SKILL (`icon('skill')`) icons in `50% / 50%` tile centers—even over hazards/traps. Unify special skills such as IRIS's heal to `icon('skill')` in its green badge.
   - Center Attack, Skill Heal, and ULT unit target badges at top (`top: -4px; left: 50%`).
   - Port dark octagonal SVG dock hazard nameplates (`.floor-badge` / `.floor-dock-svg`, katakana names without `ゾーン`), ally normal vs enemy red framing (no `敵`/`味方` corner text), and Mine 4-corner amber reticles (no center diamond).
   - Port surround-dimming (`brightness(0.42) saturate(0.68)`) for both armed `SKILL` (`is-skill-armed`) and armed `ULT` (`is-ult-armed`), plus click-once-arm / click-again-cancel UX.
3. **Inspector, Core Bars, Hold Button & FX**:
   - Rename `UNIT INFO` tab to `INFO`.
   - Use `var(--piece-name-font)` for `.ar-passive-head` / active skill titles to match `.ar-banner-name`.
   - Port `.core-ult-sheen` / `.ar-ult-sheen` button shimmer at 100% ULT.
   - Port ZZZ-style ULT cut-in and `playCombatPopupFX` / `playSkillPopupFX` popups (`DMG`, `HEAL`, `SKILL`, `ULT`).
   - Apply the **Viewer-Relative Yellow/Red** rules across every ported component.

**Phase 1 Exit Gate**: Battle screen DOM/CSS/JS visually matches `battle_mock.html` (`zzz-hdd` + TOKENS Plan A) with zero mock lab controls left in production. All uncertain points are flagged with `TODO(mock-defer)`.

---

### Phase 2: Catalog & Quarantine Deferred Items

Before changing rules or inventing missing UI, gather every `TODO(mock-defer)` into a short mental/scratch checklist and verify existing tests or manual flows still run. Typical items expected here (verify against actual gaps encountered):

- Non-battle screens (Title, Draft Pick, Deploy Phase overlays/banners, Rules Modal, Victory Modal) beyond mandatory Yellow/Red recoloring.
- Unspecified edge states (e.g., Trap `マイン` icon design if further distinction is needed, `KINESIS` extra-move live state transitions, non-hero objects like `CORE`/`TURRET`/`BARRICADE`/`BIT` card states).
- `gameMode === 'local'` (hotseat same-screen 2P) color/perspective policy.
- `CORE` portrait asset selection (`nexus` vs `cypher`) vs `owner` (`P1`/`P2`).

---

### Phase 3: Autonomous Consistency Resolution

Resolve each deferred `TODO(mock-defer)` one by one, verifying consistency with [RULEBOOK.md](file:///C:/Users/pluga/omega/RULEBOOK.md) and `js/`:

1. **Game-Rule & State Wiring**: Ensure all live board states (`deploy`, `drag-and-drop`, `KINESIS` extra-move, `SILENCE` / `BIND` / `DISARM` / `VULNERABLE` / `SHIELD`, traps hidden from enemy, hazard cascade destruction on source unit KO) update badges, surround-dimming, TOKENS Plan A slots, and Inspector `INFO` accurately on every action and turn transition.
2. **Hotseat (`local`) & P2P Edge Cases**: Pick a deterministic, unambiguous convention for any edge mode (e.g., in `local`, clearly document whether `P1` stays yellow or active turn viewer flips) and align Turn Banner, Core Bars, Deploy Wait panels, Victory Modal, and Log entries with zero `BLUE`/`RED` leakage.
3. **Non-Battle Screen Alignment**: Ensure Draft Pick, Deploy Phase, Rules Modal, and Victory Modal share cohesive `zzz-hdd` visual tokens and viewer-relative Yellow/Red semantics.
4. Remove all temporary `TODO(mock-defer)` comments once resolved and clean up unused legacy CSS/JS helpers if safe.

---

## Verification Checklist (Run After Final Edits)

1. **Zero `BLUE` / `RED` Leakage Audit** (PowerShell):
   ```powershell
   Select-String -Path "index.html","urban-battle.css","style.css","js\*.js" -Pattern "BLUE|RED|ブルー|レッド|青チーム|赤チーム|HOST ROOM \(|JOIN ROOM \("
   ```
   Confirm zero user-facing UI/log strings remain (CSS hex or unrelated words like `reduced-motion` / `centered` excluded via case-sensitive or scoped review).
2. **Module Load & Console Error Check**: Launch the app over a local static server and verify `index.html`, ES modules (`js/*.js`), and stylesheets load cleanly without JS exceptions or broken asset paths.
3. **Multi-Perspective Interactive Verification**:
   - **Solo (`P1`)**: Ally (`P1`) is yellow at bottom, Enemy (`P2`) is red at top; TOKENS Plan A shows `ATK`/`MOVE` without `3 READY`/corner dots; Inspector shows `INFO` tab; armed `SKILL` & `ULT` dim invalid targets and toggle off on second click; FX popups and 100% ULT shimmer trigger properly.
   - **Online Perspective Check (`P1` Host vs `P2` Guest)**: Verify `setLocalPlayerRole('P2')` + `setBoardPerspective(true)` renders `P2` Core Bar (bottom), `P2` pieces, `P2` hazards, and `P2` turn indicators in **Yellow**, and `P1` equivalents in **Red**.
