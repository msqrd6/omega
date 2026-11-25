import { HERO_TYPES, STATUS_EFFECT_DEFS } from './config.js?v=lab-white-3';
import { board, getHazardInfoAt, getEffectiveAtk, getShieldVal, getStatusEffects, getValidSkillTargets, hasDebuff, isUltReady, isUnit, isObject, isLocalPlayer } from './board.js?v=lab-white-3';
import { getSkillImpact } from './battle-targets.js';
import { playBattleSound } from './battle-audio.js?v=juice-1';
import { waitForBattleEffect } from './battle-effects.js?v=juice-1';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const aliases = {
  DUELIST: 'kinesis', KINESIS: 'kinesis',
  PHANTOM: 'phase', VEIL: 'phase',
  BOMBER: 'nitro', BLAST: 'nitro',
  SENTINEL: 'vector', WARDEN: 'vector',
  POISON: 'toxin', SMOG: 'toxin',
  DISRUPTOR: 'glitch', GLITCH: 'glitch',
  MEDIC: 'iris', LILY: 'iris',
  HACKER: 'nexus', NEXUS: 'nexus',
  VULCAN: 'vulcan', HIVE: 'hive',
  PRISM: 'cypher', HALO: 'aura',
  BARRICADE: 'barricade'
};

export const paths = {
  move: '<path d="M3 12h17m-6-6 6 6-6 6"/>',
  attack: '<path d="M6.5 13.5 14.5 5.5 20.5 3.5 18.5 9.5 10.5 17.5 Z"/><path d="M5 12 12 19M8.5 15.5 4 20M3.5 18.5 5.5 20.5"/>',
  skill: '<path d="M11 3 13.4 10.1 20.5 12.5 13.4 14.9 11 22 8.6 14.9 1.5 12.5 8.6 10.1 Z"/><path d="M19 2.5v5M16.5 5h5"/>',
  heal: '<path d="M12 5v14M5 12h14"/>',
  ult: '<path d="m12 2 9 10-9 10L3 12Z"/><path d="m12 7 4 5-4 5-4-5Z"/>',
  shield: '<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5Z"/><path d="m8 11 3 3 5-6"/>',
  buff: '<path d="m5 13 7-8 7 8M5 20l7-8 7 8"/>',
  debuff: '<path d="m5 4 7 8 7-8M5 11l7 8 7-8"/>',
  support: '<path d="M8.5 3h7v5.5H21v7h-5.5V21h-7v-5.5H3v-7h5.5Z"/>',
  disrupt: '<circle cx="12" cy="12" r="5.5"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  assault: '<path d="m13 2-9 12h7l-1 8 10-13h-8Z"/>',
  sentinel: '<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5Z"/>',
  disruptor: '<circle cx="12" cy="12" r="5.5"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  core: '<path d="m12 2 9 10-9 10L3 12Z"/><path d="m12 7 4 5-4 5-4-5Z"/>',
  turret: '<path d="M12 3v4M6 11h12l-1.5-4h-9ZM4 20h16M7 20l1.5-9h7L17 20"/><circle cx="12" cy="14" r="1.5"/>',
  object: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v6m6 0v10M3 15h18"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.8 2.1c-.9.6-1.3 1.1-1.3 2.4m0 3.5h.01"/>',
  endturn: '<path d="m5 4 10 8L5 20ZM19 4v16"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  time: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  st_shield: '<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5Z"/>',
  st_atk: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  st_debuff: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  st_link: '<path d="m10 13 4-4m-6 6H5a3 3 0 0 1 0-6h5m6 0h3a3 3 0 0 1 0 6h-5"/>',
  st_zone: '<polygon points="12 3 21 9 12 15 3 9"/><polyline points="3 14 12 20 21 14"/>',
  hz_toxic: '<path d="M12 2.5 21 12l-9 9.5L3 12Z"/><path d="M12 7.5c-1.8 2.5-3.2 4.2-3.2 6a3.2 3.2 0 0 0 6.4 0c0-1.8-1.4-3.5-3.2-6Z"/>',
  hz_dimension: '<path d="M12 2 22 12 12 22 2 12Z"/><path d="M12 6.5 17.5 12 12 17.5 6.5 12Z"/><circle cx="12" cy="12" r="1.5"/>',
  hz_mine: '<circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3m0 13v3M2.5 12h3m13 0h3M5.3 5.3l2.1 2.1m9.2 9.2 2.1 2.1M18.7 5.3l-2.1 2.1m-9.2 9.2-2.1 2.1"/>'
};

export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.skill}</svg>`;
}

function svgIcon(name, cls = 'svg-ic', sw = '2.4') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.assault}</svg>`;
}

function arDotsHtml(rem, max) {
  const safeMax = Math.max(1, max || 1);
  const safeRem = Math.max(0, Math.min(safeMax, rem || 0));
  let out = `<span class="ar-dots" role="img" aria-label="ストック残り ${safeRem} / ${safeMax}">`;
  for (let i = 0; i < safeMax; i++) {
    out += `<i class="ar-dot ${i >= safeRem ? 'used' : ''}"></i>`;
  }
  return out + '</span>';
}

export function roleKey(unit) {
  if (!unit) return 'ASSAULT';
  if (unit.typeKey === 'ANCHOR') return 'ANCHOR';
  if (!isUnit(unit)) return 'OBJECT';
  const def = HERO_TYPES[unit.typeKey] || {};
  if (def.role === 'ASSAULT' || def.role === 'SENTINEL' || def.role === 'DISRUPTOR' || def.role === 'SUPPORT') {
    return def.role;
  }
  const role = def.roleName || '';
  if (role.includes('サポート')) return 'SUPPORT';
  if (role.includes('センチネル') || role.includes('タンク')) return 'SENTINEL';
  if (role.includes('ディスラプター') || role.includes('トリック')) return 'DISRUPTOR';
  return 'ASSAULT';
}

export function roleIcon(unit) {
  if (!unit) return 'assault';
  const rk = roleKey(unit);
  if (rk === 'ANCHOR') return 'core';
  if (rk === 'OBJECT') return 'object';
  if (rk === 'SUPPORT') return 'support';
  if (rk === 'SENTINEL') return 'sentinel';
  if (rk === 'DISRUPTOR') return 'disruptor';
  return 'assault';
}

function artSource(key) {
  const slug = aliases[key] || String(key).toLowerCase();
  const version = key === 'ANCHOR' ? 4 : 2;
  return `assets/${slug}-urban-anime-v${version}.png`;
}

export function characterArt(key, name = '') {
  const slug = aliases[key] || String(key).toLowerCase();
  const equipment = ['ANCHOR', 'BARRICADE', 'TURRET', 'BIT'].includes(key);
  return `<img class="anime-art${equipment ? ' equipment-art' : ''}" data-art-slug="${esc(slug)}" src="${artSource(key)}" alt="${esc(name)}" draggable="false">`;
}

const inspectorDockContour = 'M 0,2 L 166,2 Q 172,2 176,8 L 190,32 Q 194,38 200,38 L 292,38 Q 298,38 302,32 L 316,8 Q 320,2 326,2 L 426,2';
const inspectorDockCap = `
  <svg class="ar-dock-cap-svg" viewBox="0 0 426 52" preserveAspectRatio="none" aria-hidden="true">
    <path d="${inspectorDockContour} L 426,52 L 0,52 Z" fill="#ffffff" stroke="none"/>
    <path d="${inspectorDockContour}" fill="none" stroke="#b4bccb" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  </svg>
`;

const inspectorViews = new WeakMap();

function updateInspector(panel, markup, preserveControls = false) {
  const previous = inspectorViews.get(panel);
  if (previous?.markup === markup && previous.firstChild === panel.firstElementChild) return;

  const active = document.activeElement;
  const focused = preserveControls && panel.contains(active) ? active.dataset.inspectorControl : null;
  const scrollTop = preserveControls ? (panel.querySelector('.ar-skills')?.scrollTop ?? 0) : 0;
  const template = document.createElement('template');
  template.innerHTML = markup;
  const portrait = panel.querySelector('.ar-banner img');
  const nextPortrait = template.content.querySelector('.ar-banner img');
  if (portrait && nextPortrait && portrait.getAttribute('src') === nextPortrait.getAttribute('src')) {
    nextPortrait.replaceWith(portrait);
  }

  panel.replaceChildren(template.content);
  inspectorViews.set(panel, { markup, firstChild: panel.firstElementChild });
  const skills = panel.querySelector('.ar-skills');
  if (skills) skills.scrollTop = scrollTop;
  if (focused) {
    const control = [...panel.querySelectorAll('[data-inspector-control]')]
      .find(element => element.dataset.inspectorControl === focused && !element.disabled);
    control?.focus({ preventScroll: true });
  }
}

export function renderUrbanHero({ turn, selectedPos, selectedHazardPos, commandMode, gamePhase, canControl = false, draftKey }) {
  const panel = document.getElementById('unit-detail-panel');
  const inspector = document.getElementById('inspector');
  if (!panel) return;

  const draft = HERO_TYPES[draftKey];
  const hero = draft
    ? { ...draft, typeKey: draftKey, owner: turn, hp: draft.maxHp, stockA: draft.skills.A.maxStock }
    : selectedPos && board[selectedPos.r]?.[selectedPos.c];
  const pos = selectedPos;
  const inspectedKey = hero ? (draftKey || hero.id) : '';
  const sameSelection = panel.dataset.inspectedKey === inspectedKey;
  panel.dataset.inspectedKey = inspectedKey;

  if (!hero) {
    const hazard = selectedHazardPos && getHazardInfoAt(selectedHazardPos.r, selectedHazardPos.c);
    if (hazard) {
      const hzEnemy = !isLocalPlayer(hazard.owner || 'P1');
      const hzIcon = 'hz_toxic';
      if (inspector) {
        inspector.dataset.team = hzEnemy ? 'ENEMY' : 'ALLY';
        inspector.dataset.role = 'SENTINEL';
        inspector.dataset.art = 'anime';
      }
      const teamLabel = hzEnemy ? 'ENEMY' : 'ALLY';
      const setterLabel = hazard.setter;
      const impactLabel = hazard.impact || hazard.name;
      updateInspector(panel, `
        <div class="ar-piece-hero">
          <div class="ar-banner">
            ${svgIcon(hzIcon, 'emblem', '1.8')}
            <div class="ar-pills">
              <span class="ar-role-pill">${svgIcon(hzIcon)}<span>${esc(hazard.category || 'HAZARD')}</span></span>
            </div>
            <h2 class="ar-banner-name">${esc(hazard.name)}</h2>
          </div>
          <div class="ar-piece-dock">
            <div class="ar-dock-cap-wrap">
              ${inspectorDockCap}
              <div class="ar-hz-cap-meta">
                <span class="ar-dk-lbl">TEAM</span>
                <strong class="ar-hz-team-val ${hzEnemy ? 'is-enemy' : ''}">${teamLabel}</strong>
              </div>
            </div>
            <div class="ar-unit-sheet-body">
              <div class="ar-hz-setter-row">
                <span class="ar-sheet-eyebrow">DEPLOYED BY</span>
                <strong class="ar-hz-setter-name">${esc(setterLabel)}</strong>
              </div>
              <div class="ar-sheet-sec passive-sec">
                <div class="ar-sheet-eyebrow">SPEC</div>
                <div class="ar-passive-inline">
                  <div class="ar-passive-head"><strong>${esc(impactLabel)}</strong></div>
                  <div class="ar-passive-desc">${esc(hazard.desc)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `);
      return;
    }

    if (inspector) {
      inspector.dataset.team = isLocalPlayer(turn) ? 'ALLY' : 'ENEMY';
      inspector.dataset.role = 'ASSAULT';
    }
    updateInspector(panel, `<div class="battle-log-empty">SELECT UNIT<span>盤面のキャラクターを選択すると詳細とスキルが表示されます。</span></div>`);
    return;
  }

  const def = HERO_TYPES[hero.typeKey] || {};
  const rk = roleKey(hero);
  const rIcon = roleIcon(hero);
  const roleLabel = def.roleName || def.classType || (rk === 'ANCHOR' ? 'アンカー' : 'オブジェクト');
  const shield = getShieldVal(hero);
  const displayHp = hero.hp + shield;
  const friendly = hero.owner === turn;
  const active = canControl && friendly && gamePhase === 'BATTLE';
  const skills = def.skills || {};
  const unit = isUnit(hero);
  const silenced = hasDebuff(hero, 'silence');
  const hpPctExact = Math.max(0, Math.min(100, (hero.hp / Math.max(1, hero.maxHp)) * 100));
  const shieldUnits = (hero.hp < hero.maxHp && shield > 0) ? Math.min(hero.maxHp - hero.hp, shield) : 0;
  const shieldPctExact = Math.max(0, Math.min(100 - hpPctExact, (shieldUnits / Math.max(1, hero.maxHp)) * 100));

  const effectiveAtk = unit && !draft ? getEffectiveAtk(hero) : (hero.atk || 0);
  const baseAtk = unit ? (def.atk ?? hero.atk ?? 0) : (hero.atk || 0);
  const hasAtk = effectiveAtk > 0;
  const isAtkBuffed = Boolean(hasAtk && effectiveAtk > baseAtk);
  const atkText = hasAtk ? String(effectiveAtk) : '—';

  if (inspector) {
    inspector.dataset.team = isLocalPlayer(hero.owner) ? 'ALLY' : 'ENEMY';
    inspector.dataset.role = rk;
    inspector.dataset.art = 'anime';
  }

  const stateTags = draft ? [] : getStatusEffects(hero).map(({ key, val, turns }) => {
    const def = STATUS_EFFECT_DEFS[key];
    const iconName = key === 'shield' ? 'st_shield' : key === 'atk_up' ? 'st_atk' : 'st_debuff';
    const tagClass = key === 'shield' ? 'shield' : def.type;
    const suffix = turns > 0 ? `<em class="ar-st-turn">${turns}T</em>` : '';
    const value = val === undefined ? `<span>${esc(def.name)}</span>` : `<b class="ar-st-val">+${val}</b>`;
    return `<span class="ar-tag-b ${tagClass}" title="${esc(def.name)}">${svgIcon(iconName, 'ar-st-ic')}${value}${suffix}</span>`;
  });

  const hazard = pos && getHazardInfoAt(pos.r, pos.c);
  if (hazard) {
    stateTags.push(`<span class="ar-tag-b terrain">${svgIcon('st_zone', 'ar-st-ic')}<span>トキシック</span></span>`);
  }

  const statesHtml = draft ? '' : stateTags.length
    ? stateTags.join('')
    : `<span class="ar-state-empty">状態効果なし</span>`;

  const passive = def.passive || null;
  const passiveBody = passive
    ? `
      <div class="ar-sheet-sec passive-sec">
        <div class="ar-sheet-eyebrow">PASSIVE</div>
        <div class="ar-passive-inline">
          <div class="ar-passive-head">
            <strong>${esc(passive.name)}</strong>${silenced ? '<span>スキル阻害中</span>' : ''}
          </div>
          <div class="ar-passive-desc">${esc(passive.desc)}</div>
        </div>
      </div>
    `
    : def.desc
      ? `
        <div class="ar-sheet-sec passive-sec">
          <div class="ar-sheet-eyebrow">SPEC</div>
          <div class="ar-passive-inline">
            <div class="ar-passive-head">
              <strong>${hero.typeKey === 'ANCHOR' ? '防衛目標仕様' : 'オブジェクト仕様'}</strong>
            </div>
            <div class="ar-passive-desc">${esc(def.desc)}</div>
          </div>
        </div>
      `
      : '';

  const artHtml = characterArt(hero.typeKey, hero.name);

  function renderSkillButton(slot, skillObj, isUlt) {
    if (!skillObj) return '';
    const isArmed = commandMode === slot;
    let reason = '';
    if (!active) reason = draft ? '性能プレビュー' : friendly ? '待機中' : '敵ユニット';
    else if (silenced) reason = 'スキル阻害';
    else if (isUlt && hero.ultUsed) reason = '使用済';
    else if (isUlt && !isUltReady(hero)) reason = 'ULT不足';
    else if (!isUlt && hero.stockA <= 0) reason = '残数0';
    else if (!getValidSkillTargets(pos.r, pos.c, isUlt ? 'ULT' : 'A').length) reason = '対象なし';

    const disabled = Boolean(reason) && !isArmed;
    const maxStock = isUlt ? 1 : (skillObj.maxStock || 2);
    const remStock = isUlt ? (hero.ultUsed ? 0 : 1) : (hero.stockA ?? maxStock);
    const readyClass = isUlt && !reason ? 'is-ready' : '';

    let stateHint = '';
    if (isArmed) stateHint = 'ACTIVE';
    else if (silenced && active) stateHint = 'スキル阻害';
    else if (isUlt && active && !hero.ultUsed && !isUltReady(hero)) stateHint = 'ULT不足';
    else if (reason === '対象なし') stateHint = reason;

    return `
      <button class="ar-card ${isUlt ? 'ult' : ''} interactive ${readyClass} ${isArmed ? 'armed' : ''} ${disabled ? 'disabled' : ''}" data-inspector-control="${slot}" onclick="setCommandMode('${slot}')" ${disabled ? 'disabled' : ''} aria-pressed="${isArmed}">
        ${isUlt ? '<span class="ar-ult-sheen" aria-hidden="true"></span>' : ''}
        <span class="ar-tag-tab"><span>${isUlt ? 'ULT' : 'SKILL'}</span></span>
        <div class="ar-card-body">
          <div class="ar-card-top">
            <strong>${esc(skillObj.name)}</strong>
            <span class="ar-stock-wrap">
              ${arDotsHtml(remStock, maxStock)}
              ${stateHint ? `<span class="ar-stock-state">${esc(stateHint)}</span>` : ''}
            </span>
          </div>
          <div class="ar-card-desc">${esc(skillObj.desc)}</div>
        </div>
      </button>
    `;
  }

  const showDestroyButton = gamePhase === 'BATTLE' && isObject(hero) && isLocalPlayer(hero.owner);
  const hasSkillsSection = Boolean(skills.A || skills.ULT || showDestroyButton);

  updateInspector(panel, `
    <div class="ar-piece-hero">
      <div class="ar-banner">
        <span class="ar-banner-scan" aria-hidden="true"></span>
        ${artHtml}
        <div class="ar-pills">
          <span class="ar-role-pill">${svgIcon(rIcon)}<span>${esc(roleLabel)}</span></span>
        </div>
        <h2 class="ar-banner-name">${esc(hero.name)}</h2>
        <span class="ar-banner-code">${esc(hero.typeKey)}</span>
      </div>

      <div class="ar-piece-dock">
        <div class="ar-dock-cap-wrap">
          ${inspectorDockCap}
          <div class="ar-dock-values">
            <div class="ar-dock-stat hp-side">
              <span class="ar-dk-lbl">HP</span>
              <strong class="ar-dk-hp ${shield > 0 ? 'has-shield' : ''}">${displayHp}<small>/ ${hero.maxHp}</small></strong>
            </div>
            <div class="ar-dock-stat atk-side">
              <span class="ar-dk-lbl">ATK</span>
              <strong class="ar-dk-atk ${hasAtk ? (isAtkBuffed ? 'is-buffed' : '') : 'is-none'}">${atkText}</strong>
            </div>
          </div>
        </div>
        <div class="ar-unit-sheet-body">
          <div class="ar-dock-bar-wrap">
            <div class="ar-skew-bar"><i class="hp-fill" style="width:${hpPctExact.toFixed(2)}%"></i>${shieldPctExact > 0 ? `<i class="shield-fill" style="width:${shieldPctExact.toFixed(2)}%"></i>` : ''}</div>
          </div>
          <div class="ar-sheet-sec">
            <div class="ar-sheet-eyebrow">STATES</div>
            <div class="ar-states-dock">
              <div class="ar-state-strip">
                ${statesHtml}
              </div>
            </div>
          </div>
          ${passiveBody}
        </div>
      </div>
    </div>

    ${hasSkillsSection ? `
      <div class="insp-scroll ar-skills" data-inspector-control="skills" role="region" tabindex="0" aria-label="スキル・操作">
        ${renderSkillButton('SKILL_A', skills.A, false)}
        ${renderSkillButton('SKILL_ULT', skills.ULT, true)}
        ${showDestroyButton ? `
          <button type="button" class="ar-destroy-btn" data-inspector-control="destroy" onclick="window.__onDestroyObject(${pos.r},${pos.c})" ${active && hero.hp > 0 ? '' : 'disabled'}><span>💥 ${esc(hero.name)}を破壊する</span></button>
        ` : ''}
      </div>
    ` : ''}
  `, sameSelection);
}

export function initUrbanUI() {
  const stage = document.getElementById('battle-stage');
  let lastScale;
  let resizeFrame = 0;
  const fit = () => {
    resizeFrame = 0;
    const { clientWidth, clientHeight } = document.documentElement;
    const scale = Math.min(clientWidth / 1600, clientHeight / 900);
    if (scale === lastScale) return;
    lastScale = scale;
    stage?.style.setProperty('--scale', scale);
  };
  window.addEventListener('resize', () => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(fit);
  });
  fit();

  document.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = icon(el.dataset.icon);
  });

  const tabs = [...document.querySelectorAll('.urban-tab')];
  function selectTab(tab) {
    tabs.forEach(button => {
      const active = button === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      const targetPanel = document.getElementById(button.getAttribute('aria-controls'));
      if (targetPanel) targetPanel.hidden = !active;
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + 1) % tabs.length];
      selectTab(next);
      next.focus();
    });
  });

  const log = document.getElementById('log-box');
  const filterButtons = [...document.querySelectorAll('[data-logfilter]')];
  const syncLogSummary = () => {
    if (!log) return;
    const rows = log.querySelectorAll('.ar-log-row');
    const totalCount = rows.length;
    const countEl = document.getElementById('urban-log-count');
    const emptyEl = document.getElementById('urban-log-empty');
    const allBtn = document.querySelector('[data-logfilter="ALL"]');
    if (countEl) countEl.textContent = totalCount;
    if (allBtn) allBtn.textContent = `ALL (${totalCount})`;

    const filter = log.dataset.filter || 'ALL';
    let visibleCount = totalCount;
    if (filter === 'combat') {
      visibleCount = log.querySelectorAll('.ar-log-row[data-kind="attack"]').length;
    } else if (filter === 'skill') {
      visibleCount = log.querySelectorAll('.ar-log-row[data-kind="skill"], .ar-log-row[data-kind="ult"]').length;
    } else if (filter === 'turn') {
      visibleCount = log.querySelectorAll('.ar-log-row[data-kind="system"], .ar-log-row[data-kind="endturn"]').length;
    }
    if (emptyEl) emptyEl.hidden = visibleCount > 0;
  };

  if (log) {
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const nextFilter = btn.dataset.logfilter || 'ALL';
        log.dataset.filter = nextFilter;
        filterButtons.forEach(b => b.classList.toggle('is-active', b === btn));
        syncLogSummary();
      });
    });

    new MutationObserver(syncLogSummary).observe(log, { childList: true, subtree: true });
    syncLogSummary();
  }

  bindHoldAction('btn-end-turn', 'screen-battle', () => window.__triggerHoldAction());
  bindHoldAction('pick-confirm-btn', 'screen-pick', () => window.__onConfirmPick());
}

function bindHoldAction(buttonId, screenId, onComplete) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  const screen = document.getElementById(screenId);
  const fill = button.querySelector('.hold-fill');
  let hold = null;
  const cancel = () => {
    if (hold) cancelAnimationFrame(hold.frame);
    hold = null;
    if (fill) fill.style.transform = 'scaleX(0)';
    button.style.setProperty('--hold-p', '0');
    button.classList.remove('is-held-full');
  };
  const start = () => {
    if (button.disabled || hold || !screen?.classList.contains('active') || screen.getAttribute('aria-busy') === 'true') return;
    hold = { started: performance.now(), frame: 0 };
    const tick = now => {
      if (!hold || button.disabled || !screen.classList.contains('active') || screen.getAttribute('aria-busy') === 'true') {
        cancel();
        return;
      }
      const progress = Math.min(1, (now - hold.started) / 400);
      if (fill) fill.style.transform = `scaleX(${progress})`;
      button.style.setProperty('--hold-p', String(progress));
      button.classList.toggle('is-held-full', progress >= 0.999);
      if (progress >= 1) {
        cancel();
        onComplete();
        return;
      }
      hold.frame = requestAnimationFrame(tick);
    };
    hold.frame = requestAnimationFrame(tick);
  };
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || button.disabled) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    start();
  });
  button.addEventListener('pointermove', event => {
    if (!hold) return;
    const r = button.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) cancel();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(name => button.addEventListener(name, cancel));
  button.addEventListener('keydown', event => {
    if ([' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      if (!event.repeat) start();
    }
  });
  button.addEventListener('keyup', event => {
    if ([' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      cancel();
    }
  });
  window.addEventListener('blur', cancel);
}

let turnCutinTimer;

export function clearTurnCutin() {
  clearTimeout(turnCutinTimer);
  const overlay = document.getElementById('turn-cutin-overlay');
  if (!overlay) return;
  overlay.classList.remove('is-active');
  overlay.hidden = true;
}

export function createTurnFxQueue() {
  const effects = [];
  return {
    effects,
    playPassivePopupFX: (pos, options) => effects.push(() => playPassivePopupFX(pos, options))
  };
}

export function playTurnTransition(owner, turnNumber, startingEffects, onReady) {
  clearTurnCutin();
  showTurnCutin(owner, turnNumber);
  turnCutinTimer = setTimeout(() => {
    clearTurnCutin();
    startingEffects.forEach(play => play());
    if (onReady) turnCutinTimer = setTimeout(onReady, startingEffects.length ? 720 : 0);
  }, 1350);
}

function showTurnCutin(owner, turnNumber) {
  const overlay = document.getElementById('turn-cutin-overlay');
  if (!overlay) return;
  const enemy = !isLocalPlayer(owner);
  const team = enemy ? 'ENEMY' : 'ALLY';
  const turn = `TURN ${String(turnNumber).padStart(2, '0')}`;
  overlay.dataset.team = team;
  overlay.classList.toggle('is-enemy', enemy);
  overlay.querySelector('#tci-wm-text').textContent = `${team} PHASE // ${turn}`;
  overlay.querySelector('#tci-pill').textContent = turn;
  overlay.querySelector('#tci-code').textContent = enemy ? 'MIRROR WORLD // INTERCEPT' : 'PHASE SHIFT // SYNCHRONIZED';
  overlay.querySelector('#tci-title').textContent = `${team} TURN`;
  overlay.querySelector('#tci-sub').textContent = enemy ? '敵世界線の行動フェーズへ移行します' : '自軍行動フェーズを開始します';
  overlay.hidden = false;
  void overlay.offsetWidth;
  overlay.classList.add('is-active');
}

export function floorShortName(hz) {
  if (!hz) return '';
  if (hz.type === 'toxic' || hz.type === 'poison') return 'トキシック';
  return String(hz.name || '').replace(/・?ゾーン$/, '');
}

export function floorGraphicHtml(hz) {
  return `<span class="floor-badge"><svg class="floor-dock-svg" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true"><path d="M 7,1 L 93,1 L 99,6.5 L 99,15.5 L 93,21 L 7,21 L 1,15.5 L 1,6.5 Z"/></svg><b>${esc(floorShortName(hz))}</b></span>`;
}

const canonicalKeys = {
  DUELIST: 'KINESIS',
  PHANTOM: 'VEIL',
  BOMBER: 'BLAST',
  SENTINEL: 'WARDEN',
  TURRET: 'VULCAN',
  POISON: 'SMOG',
  DISRUPTOR: 'GLITCH',
  MEDIC: 'LILY',
  HACKER: 'NEXUS'
};

export function normalizeHeroKey(typeKey) {
  return canonicalKeys[typeKey] || typeKey;
}

const ULT_FX_META = {
  KINESIS: { color: '#d8ff00', color2: '#66fff2', pop: '+1 EX ATK' },
  VEIL: { color: '#b366ff', color2: '#f2b8ff' },
  BLAST: { color: '#ff5a26', color2: '#ffd447' },
  WARDEN: { color: '#00e5ff', color2: '#c8ff80' },
  VULCAN: { color: '#ff7b24', color2: '#ffd447' },
  SMOG: { color: '#2ee59d', color2: '#c4ff4d' },
  GLITCH: { color: '#ff3ec8', color2: '#8d7bff' },
  PRISM: { color: '#8d7bff', color2: '#ff3ec8' },
  HIVE: { color: '#b366ff', color2: '#66fff2' },
  LILY: { color: '#38f6b4', color2: '#ffe169', isHeal: true },
  NEXUS: { color: '#38bdf8', color2: '#38f6b4' },
  HALO: { color: '#38f6b4', color2: '#e066ff', isHeal: true }
};

export const SKILL_FX_META = {
  KINESIS: { color: '#d8ff00', color2: '#b8ff99', pop: 'EX MOVE +1', selfCast: true },
  VEIL:   { color: '#b366ff', color2: '#ecc4ff', pop: 'TELEPORT', selfCast: false },
  BLAST:   { color: '#ff7b24', color2: '#ffe07d', pop: 'SHELLING' },
  BIT:     { color: '#ff7b24', color2: '#ffe07d', pop: 'SELF DESTRUCT', selfCast: true },
  WARDEN:  { color: '#00e5ff', color2: '#b8f8ff', pop: 'BARRICADE', selfCast: false },
  VULCAN:  { color: '#00d8ff', color2: '#b8f8ff', pop: 'TURRET SET', selfCast: false },
  SMOG:   { color: '#2ee59d', color2: '#b9ffe0', pop: 'TOXIC ZONE' },
  GLITCH:  { color: '#ff3ec8', color2: '#c9b8ff', pop: 'SWAP', selfCast: false },
  PRISM:  { color: '#b366ff', color2: '#ffd447', pop: 'JAMMING!' },
  HIVE:    { color: '#00d2ff', color2: '#e0b8ff', pop: 'BIT DEPLOY', selfCast: false },
  LILY:    { color: '#2ee59d', color2: '#b9ffe4', isHeal: true },
  NEXUS:   { color: '#38bdf8', color2: '#b7f5ff', pop: 'AEGIS LINK' },
  HALO:    { color: '#2ee59d', color2: '#e0b8ff', isHeal: true }
};

export function isHealSkillHero(unit) {
  if (!unit) return false;
  const k = normalizeHeroKey(unit.typeKey);
  return k === 'LILY' || k === 'HALO';
}

function previewTargets(casterPos, unit, slot, target) {
  if (!casterPos || !unit) return [];
  const key = unit.typeKey;
  const selfCast = slot === 'ULT'
    ? ['KINESIS', 'VEIL', 'WARDEN', 'SMOG', 'LILY'].includes(key)
    : ['KINESIS', 'BIT', 'HALO'].includes(key);
  const center = target || (selfCast ? casterPos : null);
  const { cells, targets } = getSkillImpact(unit, slot, center, board);
  const kind = isHealSkillHero(unit) ? 'heal'
    : key === 'SMOG' ? 'toxic'
    : ['GLITCH', 'PRISM'].includes(key) ? 'debuff' : 'beam';

  if (center && ['GLITCH', 'HIVE', 'HALO'].includes(key) &&
      !cells.some(({ r, c }) => r === center.r && c === center.c)) cells.push(center);
  return cells.map(({ r, c }) => {
    const swapTarget = key === 'GLITCH' && slot === 'A' && r === center?.r && c === center?.c;
    return { r, c, hitPiece: swapTarget || targets.includes(board[r][c]), kind };
  });
}

export function getSkillPreviewTargets(casterPos, unit, hoveredTarget) {
  return previewTargets(casterPos, unit, 'A', hoveredTarget);
}

export function getUltPreviewTargets(casterPos, unit, hoveredTarget) {
  return previewTargets(casterPos, unit, 'ULT', hoveredTarget);
}

let finisherTimers = [];
let finisherFrame;
let ultNodes = [];
let ultPlayback;
let fxTimers = [];

function scheduleFxTimeout(fn, delayMs) {
  if (!delayMs || delayMs <= 0) {
    fn();
    return null;
  }
  const id = setTimeout(() => {
    fxTimers = fxTimers.filter(t => t !== id);
    fn();
  }, delayMs);
  fxTimers.push(id);
  return id;
}

function applyTileAnimClass(pos, className, durationMs, cssProps = null) {
  if (!pos) return;
  requestAnimationFrame(() => {
    const tile = document.querySelector(`#board .tile[data-r="${pos.r}"][data-c="${pos.c}"]`);
    if (!tile) return;
    if (cssProps) {
      for (const [k, v] of Object.entries(cssProps)) {
        tile.style.setProperty(k, v);
      }
    }
    tile.classList.remove(className);
    void tile.offsetWidth;
    tile.classList.add(className);
    setTimeout(() => tile.classList.remove(className), durationMs);
  });
}

export function clearFinisherFxState() {
  cancelAnimationFrame(finisherFrame);
  finisherTimers.forEach(clearTimeout);
  finisherTimers = [];
  const stage = document.getElementById('battle-stage');
  const overlay = document.getElementById('finisher-overlay');
  if (stage) {
    stage.classList.remove('is-finisher-hitstop', 'is-finisher-active', 'is-finisher-defeat');
    stage.style.removeProperty('--fn-tx');
    stage.style.removeProperty('--fn-ty');
    stage.style.removeProperty('--fn-scale');
    stage.style.removeProperty('--fn-accent');
    stage.querySelectorAll('.tile.is-fn-target, .tile.is-atk-lunge').forEach(el => el.classList.remove('is-fn-target', 'is-atk-lunge'));
    stage.querySelectorAll('.piece.is-fn-hitstop, .piece.is-fn-shattering').forEach(el => el.classList.remove('is-fn-hitstop', 'is-fn-shattering'));
  }
  if (overlay) {
    overlay.classList.remove('is-active', 'is-banner-in', 'is-actions-in', 'is-interactive', 'is-defeat');
    overlay.hidden = true;
    overlay.style.removeProperty('--fn-accent');
  }
  const motesEl = document.getElementById('fn-slow-motes');
  if (motesEl) motesEl.innerHTML = '';
}

function clearUltCutin() {
  ultPlayback?.abort();
  ultPlayback = null;
  ultNodes.forEach(node => node.remove());
  ultNodes = [];
  const stage = document.getElementById('battle-stage');
  const cutin = document.getElementById('ult-cutin-overlay');
  if (stage) {
    stage.classList.remove('is-ult-impact');
    stage.querySelectorAll('.piece.is-ult-casting').forEach(el => el.classList.remove('is-ult-casting'));
    stage.querySelectorAll('.tile.is-ult-hit').forEach(el => {
      el.classList.remove('is-ult-hit');
    });
  }
  document.getElementById('core-bar-ally')?.classList.remove('is-ult-discharging');
  document.getElementById('core-bar-enemy')?.classList.remove('is-ult-discharging');
  if (cutin) {
    cutin.classList.remove('is-active');
    cutin.hidden = true;
  }
}

export function clearBattlePresentation() {
  clearUltCutin();
  clearFinisherFxState();
  fxTimers.forEach(clearTimeout);
  fxTimers = [];
  document.getElementById('core-bar-ally')?.classList.remove('is-ult-charging');
  document.getElementById('core-bar-enemy')?.classList.remove('is-ult-charging');
  document.getElementById('board-fx-layer')?.replaceChildren();
}

function resolveVisualPos(pos, boardFlipped) {
  const flipped = boardFlipped ?? Boolean(document.getElementById('board')?.classList.contains('flipped-perspective'));
  return {
    r: flipped ? 6 - pos.r : pos.r,
    c: flipped ? 6 - pos.c : pos.c,
    flipped
  };
}

function spawnCasterBurst(fxLayer, casterPos, meta, boardFlipped) {
  const vp = resolveVisualPos(casterPos, boardFlipped);
  const node = document.createElement('div');
  node.className = 'ult-fx-node';
  node.style.left = `${((vp.c + 0.5) / 7) * 100}%`;
  node.style.top = `${((vp.r + 0.5) / 7) * 100}%`;
  node.style.setProperty('--fx-c', meta.color);
  node.style.setProperty('--fx-c2', meta.color2);

  let sparksHtml = '';
  for (let i = 0; i < 14; i++) {
    const ang = (i * (360 / 14)) + ((i % 2) * 9);
    const dist = 92 + (i % 3) * 44;
    const sc = (0.75 + (i % 4) * 0.22).toFixed(2);
    const delay = (i % 3) * 40;
    sparksHtml += `<span class="fx-spark" style="--sp-ang:${ang}deg;--sp-dist:${dist}px;--sp-sc:${sc};--sp-delay:${delay}ms"></span>`;
  }

  node.innerHTML = `
    <span class="fx-caster-pillar"></span>
    <span class="fx-core-flash"></span>
    <span class="fx-ring" style="--ring-scale:2.8;--ring-dur:0.78s;--ring-delay:0s"></span>
    <span class="fx-ring" style="--ring-scale:1.95;--ring-dur:0.62s;--ring-delay:0.08s"></span>
    <span class="fx-ring is-diamond" style="--ring-scale:2.2;--ring-dur:0.74s;--ring-delay:0.05s"></span>
    <svg class="fx-reticle" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="18 10"/>
      <circle cx="60" cy="60" r="28" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
      <path d="M60 4v18M60 98v18M4 60h18M98 60h18" stroke="currentColor" stroke-width="3" stroke-linecap="square"/>
    </svg>
    ${sparksHtml}
  `;
  fxLayer.appendChild(node);
  ultNodes.push(node);
}

function spawnTargetWave(fxLayer, target, casterPos, meta, boardFlipped) {
  const vp = resolveVisualPos(target, boardFlipped);
  const dist = Math.hypot(target.r - casterPos.r, target.c - casterPos.c);
  const delayMs = Math.round(dist * 55);
  const node = document.createElement('div');
  node.className = 'ult-fx-node';
  node.style.left = `${((vp.c + 0.5) / 7) * 100}%`;
  node.style.top = `${((vp.r + 0.5) / 7) * 100}%`;
  node.style.setProperty('--fx-c', meta.color);
  node.style.setProperty('--fx-c2', meta.color2);
  node.style.setProperty('--fx-delay', `${delayMs}ms`);

  const atCaster = target.r === casterPos.r && target.c === casterPos.c;
  const showRing = target.hitPiece || atCaster;
  node.innerHTML = `
    <span class="fx-target-pulse"></span>
    ${showRing ? `<span class="fx-ring" style="--ring-scale:1.55;--ring-dur:0.65s;--ring-delay:${delayMs}ms"></span>` : ''}
    ${atCaster && meta.pop ? `<span class="fx-pop">${esc(meta.pop)}</span>` : ''}
  `;
  fxLayer.appendChild(node);
  ultNodes.push(node);

  if (target.hitPiece) {
    const hitTile = document.querySelector(`#board .tile[data-r="${target.r}"][data-c="${target.c}"]`);
    if (hitTile) {
      hitTile.style.setProperty('--fx-delay', `${delayMs}ms`);
      hitTile.classList.add('is-ult-hit');
    }
  }
}

export function playAttackLunge(attackerPos, targetPos) {
  const sign = resolveVisualPos(targetPos).flipped ? -1 : 1;
  applyTileAnimClass(attackerPos, 'is-atk-lunge', 360, {
    '--lunge-x': `${sign * Math.sign(targetPos.c - attackerPos.c) * 16}px`,
    '--lunge-y': `${sign * Math.sign(targetPos.r - attackerPos.r) * 16}px`
  });
}

/**
 * 盤面上の2点間を繋ぐ射撃/回復ビームエフェクトを再生する
 */
export function playBeamFX(fromPos, toPos, options = {}) {
  if (!fromPos || !toPos) return;
  if (fromPos.r === toPos.r && fromPos.c === toPos.c) return;
  const {
    kind = 'attack',
    color = null,
    color2 = null,
    delayMs = 0,
    boardFlipped
  } = options;

  const palette = kind === 'heal'
    ? { c1: '#2ee59d', c2: '#b9ffe4' }
    : kind === 'debuff'
      ? { c1: '#a855f7', c2: '#f2b8ff' }
      : { c1: '#ff5a26', c2: '#ffd447' };
  const c1 = color || palette.c1;
  const c2 = color2 || palette.c2;

  const run = () => {
    const fxLayer = document.getElementById('board-fx-layer');
    if (!fxLayer) return;
    const vpFrom = resolveVisualPos(fromPos, boardFlipped);
    const vpTo = resolveVisualPos(toPos, boardFlipped);
    const x1 = (vpFrom.c + 0.5) * 100;
    const y1 = (vpFrom.r + 0.5) * 100;
    const x2 = (vpTo.c + 0.5) * 100;
    const y2 = (vpTo.r + 0.5) * 100;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'fx-beam-svg');
    svg.setAttribute('viewBox', '0 0 700 700');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.setProperty('--beam-c', c1);
    svg.style.setProperty('--beam-c2', c2);
    svg.innerHTML = `
      <line class="fx-beam-glow" pathLength="100" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />
      <line class="fx-beam-core" pathLength="100" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />
      <circle class="fx-beam-node" cx="${x1}" cy="${y1}" r="9" />
      <circle class="fx-beam-node" cx="${x2}" cy="${y2}" r="11" />
    `;
    fxLayer.appendChild(svg);
    setTimeout(() => svg.remove(), 760);
  };

  scheduleFxTimeout(run, delayMs);
}

/**
 * パッシブスキルや自動発動効果の発動演出を再生する
 */
export function playPassivePopupFX(casterPos, options = {}) {
  if (!casterPos) return;
  const {
    label = '',
    kind = 'buff',
    color = null,
    color2 = null,
    targetPos = null,
    delayMs = 0,
    boardFlipped,
    tileAnimClass = null
  } = options;

  const palettes = {
    heal:   { c1: '#2ee59d', c2: '#b9ffe4' },
    turret: { c1: '#ff5a26', c2: '#ffd447' },
    attack: { c1: '#ff5a26', c2: '#ffd447' },
    ult:    { c1: '#38bdf8', c2: '#38f6b4' },
    debuff: { c1: '#a855f7', c2: '#f2b8ff' },
    buff:   { c1: '#f59e0b', c2: '#ffe07d' }
  };
  const pal = palettes[kind] || palettes.buff;
  const c1 = color || pal.c1;
  const c2 = color2 || pal.c2;

  const run = () => {
    const fxLayer = document.getElementById('board-fx-layer');
    if (!fxLayer) return;

    const animCls = tileAnimClass || (kind === 'turret' ? 'is-turret-fire' : 'is-passive-cast');
    applyTileAnimClass(casterPos, animCls, 580, { '--passive-fx-color': c1 });

    const vp = resolveVisualPos(casterPos, boardFlipped);
    const node = document.createElement('div');
    node.className = 'ult-fx-node is-passive-node';
    node.style.left = `${((vp.c + 0.5) / 7) * 100}%`;
    node.style.top = `${((vp.r + 0.5) / 7) * 100}%`;
    node.style.setProperty('--fx-c', c1);
    node.style.setProperty('--fx-c2', c2);

    let sparksHtml = '';
    for (let i = 0; i < 6; i++) {
      const ang = i * 60 + 15;
      sparksHtml += `<span class="fx-spark" style="--sp-ang:${ang}deg;--sp-dist:64px;--sp-sc:0.78;--sp-delay:0ms"></span>`;
    }

    node.innerHTML = `
      <span class="fx-target-pulse"></span>
      <span class="fx-ring is-passive" style="--ring-scale:1.45;--ring-dur:0.56s;--ring-delay:0s"></span>
      ${sparksHtml}
      ${label ? `<span class="fx-pop is-passive is-${esc(kind)}">${esc(label)}</span>` : ''}
    `;
    fxLayer.appendChild(node);
    setTimeout(() => node.remove(), 1060);

    if (targetPos && (targetPos.r !== casterPos.r || targetPos.c !== casterPos.c)) {
      playBeamFX(casterPos, targetPos, {
        kind: kind === 'turret' ? 'attack' : kind,
        color: c1,
        color2: c2,
        boardFlipped
      });
    }
  };

  scheduleFxTimeout(run, delayMs);
}

export function playSkillPopupFX(casterPos, targetPos, casterUnit, boardFlipped) {
  const fxLayer = document.getElementById('board-fx-layer');
  if (!fxLayer || !casterUnit || !casterPos) return;

  const meta = SKILL_FX_META[normalizeHeroKey(casterUnit.typeKey)] || SKILL_FX_META.KINESIS;
  requestAnimationFrame(() => {
    const castTile = document.querySelector(`#board .tile[data-r="${casterPos.r}"][data-c="${casterPos.c}"]`);
    if (castTile) {
      castTile.style.setProperty('--skill-fx-color', meta.color);
      castTile.classList.remove('is-skill-cast');
      void castTile.offsetWidth;
      castTile.classList.add('is-skill-cast');
      setTimeout(() => castTile.classList.remove('is-skill-cast'), 480);
    }
  });

  if (meta.isHeal) return;

  const fxPos = (meta.selfCast || !targetPos) ? casterPos : targetPos;
  const vp = resolveVisualPos(fxPos, boardFlipped);
  const node = document.createElement('div');
  node.className = 'ult-fx-node';
  node.style.left = `${((vp.c + 0.5) / 7) * 100}%`;
  node.style.top = `${((vp.r + 0.5) / 7) * 100}%`;
  node.style.setProperty('--fx-c', meta.color);
  node.style.setProperty('--fx-c2', meta.color2);

  let sparksHtml = '';
  for (let i = 0; i < 8; i++) {
    const ang = i * 45;
    sparksHtml += `<span class="fx-spark" style="--sp-ang:${ang}deg;--sp-dist:82px;--sp-sc:0.88;--sp-delay:0ms"></span>`;
  }

  node.innerHTML = `
    <span class="fx-target-pulse"></span>
    <span class="fx-ring" style="--ring-scale:1.65;--ring-dur:0.58s;--ring-delay:0s"></span>
    <span class="fx-ring is-diamond" style="--ring-scale:1.45;--ring-dur:0.56s;--ring-delay:0.04s"></span>
    <svg class="fx-skill-flare" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${paths.skill}</svg>
    ${sparksHtml}
    <span class="fx-pop is-big">${esc(meta.pop)}</span>
  `;
  fxLayer.appendChild(node);
  setTimeout(() => node.remove(), 1120);
}

export function playUltCutinFX(casterPos, casterUnit, clickedTarget, signal) {
  const def = HERO_TYPES[casterUnit.typeKey] || {};
  const meta = ULT_FX_META[normalizeHeroKey(casterUnit.typeKey)] || ULT_FX_META.KINESIS;
  const stage = document.getElementById('battle-stage');
  const cutin = document.getElementById('ult-cutin-overlay');
  const fxLayer = document.getElementById('board-fx-layer');
  if (!stage || !cutin || !fxLayer || signal?.aborted) return {};
  clearUltCutin();
  ultPlayback = new AbortController();
  const playback = ultPlayback.signal;
  signal?.addEventListener('abort', clearUltCutin, { once: true, signal: playback });
  playBattleSound('ult');

  const artSrc = artSource(casterUnit.typeKey || 'KINESIS');
  const roleLabel = def.roleName || def.classType || '';

  const wmEl = document.getElementById('uci-wm-text');
  const badgeEl = document.getElementById('uci-ult-badge');
  const unitTagEl = document.getElementById('uci-unit-tag');
  const titleEl = document.getElementById('uci-skill-title');
  const subEl = document.getElementById('uci-skill-sub');
  const artEl = document.getElementById('uci-art-img');
  const ghostEl = document.getElementById('uci-art-ghost-img');

  if (wmEl) wmEl.textContent = `${normalizeHeroKey(casterUnit.typeKey)} // ULTIMATE`;
  if (badgeEl) badgeEl.textContent = isLocalPlayer(casterUnit.owner) ? 'DECIBEL MAX // ULTIMATE' : 'ENEMY // OVERDRIVE';
  if (unitTagEl) unitTagEl.textContent = `${def.name || casterUnit.name}${roleLabel ? ` · ${roleLabel}` : ''}`;
  if (titleEl) titleEl.textContent = def.skills?.ULT?.name || 'ULTIMATE';
  if (subEl) subEl.textContent = def.skills?.ULT?.desc || '';
  if (artEl) artEl.src = artSrc;
  if (ghostEl) ghostEl.src = artSrc;

  const sparksEl = document.getElementById('uci-sparks');
  if (sparksEl) {
    sparksEl.innerHTML = Array.from({ length: 10 }, (_, i) => {
      const top = 14 + (i * 7.6);
      const left = 52 + ((i * 19) % 42);
      const delay = 60 + (i % 5) * 85;
      return `<span class="uci-spark" style="top:${top}%;left:${left}%;--us-delay:${delay}ms"></span>`;
    }).join('');
  }

  cutin.style.setProperty('--uci-accent', meta.color);
  cutin.style.setProperty('--uci-accent-2', meta.color2);
  cutin.hidden = false;
  cutin.classList.remove('is-active');
  void cutin.offsetWidth;
  cutin.classList.add('is-active');

  const targets = getUltPreviewTargets(casterPos, casterUnit, clickedTarget);
  const impact = waitForBattleEffect(860, playback).then(() => {
    if (playback.aborted) return;
    // Apply the board pulse after the action has rendered the impact state.
    requestAnimationFrame(() => {
      if (!playback.aborted) showUltImpact(casterPos, casterUnit, stage, fxLayer, meta, targets);
    });
  });
  const finished = waitForBattleEffect(1250, playback).then(() => {
    if (playback.aborted) return;
    cutin.classList.remove('is-active');
    cutin.hidden = true;
  });
  void waitForBattleEffect(2250, playback).then(() => {
    if (!playback.aborted) clearUltCutin();
  });
  return { impact, finished };
}

function showUltImpact(casterPos, casterUnit, stage, fxLayer, meta, targets) {
  stage.style.setProperty('--ult-fx-color', meta.color);
  stage.style.setProperty('--ult-fx-color-2', meta.color2);
  stage.classList.remove('is-ult-impact');
  void stage.offsetWidth;
  stage.classList.add('is-ult-impact');

  const barEl = document.getElementById(isLocalPlayer(casterUnit.owner) ? 'core-bar-ally' : 'core-bar-enemy');
  if (barEl) barEl.classList.add('is-ult-discharging');

  const casterPiece = document.querySelector(`#board .tile[data-r="${casterPos.r}"][data-c="${casterPos.c}"] .piece`);
  if (casterPiece) casterPiece.classList.add('is-ult-casting');

  spawnCasterBurst(fxLayer, casterPos, meta);
  if (!meta.isHeal) targets.forEach(target => spawnTargetWave(fxLayer, target, casterPos, meta));
}

function buildFinisherGhostPiece(unit) {
  const isEnemy = !isLocalPlayer(unit.owner);
  const isStructure = unit.typeKey === 'ANCHOR' || unit.typeKey === 'TURRET' || unit.typeKey === 'BARRICADE';
  const rk = roleKey(unit);
  const rIcon = roleIcon(unit);
  const faceHtml = characterArt(unit.typeKey, unit.name);
  const hasAtk = Number(unit.atk) > 0;

  const piece = document.createElement('div');
  piece.className = `piece ${isEnemy ? 'enemy' : 'ally'} ${isStructure ? 'structure' : ''} ${String(unit.typeKey || '').toLowerCase()}${unit.typeKey === 'ANCHOR' ? ' core' : ''}`;
  piece.dataset.role = rk;
  piece.innerHTML = `
    <span class="piece-face">${faceHtml}</span>
    <span class="piece-role">${icon(rIcon)}</span>
    <span class="piece-status"></span>
    <span class="piece-readout">
      <svg class="piece-dock-svg" viewBox="0 0 80 35" preserveAspectRatio="none" aria-hidden="true">
        <path d="M 4,1 L 26,1 Q 28,1 28.8,3 L 31.2,15 Q 32,17 34,17 L 56.5,17 Q 58.5,17 59.3,15 L 60.8,7.5 Q 61.6,5.5 63.6,5.5 L 76,5.5 Q 79,5.5 79,8.5 L 79,30 Q 79,34 75,34 L 5,34 Q 1,34 1,30 L 1,4 Q 1,1 4,1 Z"/>
      </svg>
      <span class="piece-values">
        <b>0</b>
        <span class="${hasAtk ? '' : 'is-none'}">${hasAtk ? unit.atk : '—'}</span>
      </span>
      <span class="piece-hp-track"><i style="width:0%"></i></span>
      <span class="piece-name">${esc(unit.name)}</span>
    </span>
  `;
  return piece;
}

export function playFinisherFX({
  winner,
  reason = 'anchor',
  myRole = null,
  gameMode = 'pve',
  context = null,
  boardFlipped,
  onPlayAgain,
  onTitle
}) {
  const startSequence = () => {
    clearBattlePresentation();
    const stage = document.getElementById('battle-stage');
    const overlay = document.getElementById('finisher-overlay');
    const fxLayer = document.getElementById('board-fx-layer');
    if (!stage || !overlay || !fxLayer) return;
    if (reason === 'anchor') playBattleSound('anchor');

    const isWipeout = (reason === 'wipeout');
    const isViewerWin = myRole ? (winner === myRole) : isLocalPlayer(winner);
    const isLocalMode = (gameMode === 'local');
    const isDefeat = !isLocalMode && !isViewerWin;
    const losingOwner = winner === 'P1' ? 'P2' : 'P1';

    const title = isLocalMode
      ? `${winner} VICTORY!`
      : (isViewerWin ? 'VICTORY!' : 'DEFEAT...');
    const desc = isLocalMode
      ? (isWipeout ? `${winner} が敵ユニットの全滅に成功しました！` : `${winner} が敵アンカーの完全破壊に成功しました！`)
      : isViewerWin
        ? (isWipeout ? '敵ユニットの全滅に成功しました！自軍の勝利！' : '敵アンカーの完全破壊に成功しました！自軍の勝利！')
        : (isWipeout ? '自軍ユニットが全滅しました...敗北...' : '自軍アンカーが破壊されました...敗北...');

    const c1 = isViewerWin ? '#facc15' : '#a855f7';
    const c2 = isViewerWin ? '#fef08a' : '#e9d5ff';
    const pill = isDefeat
      ? (isWipeout ? 'ANNIHILATED' : 'CRITICAL LOSS')
      : (isWipeout ? 'WIPEOUT' : 'ANCHOR BROKEN');
    const subTag = isDefeat
      ? (isWipeout ? 'ALL UNITS LOST' : 'ANCHOR INTEGRITY ZERO')
      : (isWipeout ? 'ALL HOSTILES ELIMINATED' : 'OPERATION COMPLETE');
    const wm = isDefeat
      ? 'SYSTEM DOWN // DEFEAT'
      : (isWipeout ? 'WIPEOUT // VICTORY' : 'ANCHOR BROKEN // VICTORY');
    const popLabel = context?.dmg > 0
      ? `-${context.dmg} DMG`
      : (isDefeat ? 'ANCHOR BROKEN' : (isWipeout ? 'WIPEOUT!' : 'ANCHOR BROKEN'));

    const rawTarget = context?.targetPos || { r: isLocalPlayer(losingOwner) ? 6 : 0, c: 3 };
    const rawAttacker = context?.attackerPos || null;
    const vpTarget = resolveVisualPos(rawTarget, boardFlipped);
    const vpAttacker = rawAttacker ? resolveVisualPos(rawAttacker, boardFlipped) : null;

    document.getElementById('fn-wm-text').textContent = wm;
    document.getElementById('fn-reason-pill').textContent = pill;
    document.getElementById('fn-sub-tag').textContent = subTag;
    document.getElementById('fn-title').textContent = title;
    document.getElementById('fn-desc').textContent = desc;
    overlay.classList.toggle('is-defeat', isDefeat);
    overlay.style.setProperty('--fn-accent', c1);
    stage.classList.toggle('is-finisher-defeat', isDefeat);
    stage.style.setProperty('--fn-accent', c1);

    const againBtn = document.getElementById('fn-btn-again');
    const titleBtn = document.getElementById('fn-btn-title');
    if (againBtn) againBtn.onclick = () => onPlayAgain?.();
    if (titleBtn) titleBtn.onclick = () => { clearFinisherFxState(); if (onTitle) onTitle(); };

    const targetTile = document.querySelector(`#board .tile[data-r="${rawTarget.r}"][data-c="${rawTarget.c}"]`);
    if (targetTile) {
      const stageRect = stage.getBoundingClientRect();
      const tileRect = targetTile.getBoundingClientRect();
      const sc = stageRect.width / 1600 || 1;
      const cx = (tileRect.left + tileRect.width / 2 - stageRect.left) / sc;
      const cy = (tileRect.top + tileRect.height / 2 - stageRect.top) / sc;
      const tx = Math.max(-135, Math.min(135, Math.round((800 - cx) * 0.62)));
      const ty = Math.max(-82, Math.min(82, Math.round((450 - cy) * 0.34)));
      stage.style.setProperty('--fn-tx', `${tx}px`);
      stage.style.setProperty('--fn-ty', `${ty}px`);
      stage.style.setProperty('--fn-scale', '1.25');
      overlay.style.setProperty('--fn-fx', `${(((cx + tx) / 1600) * 100).toFixed(1)}%`);
      overlay.style.setProperty('--fn-fy', `${(((cy + ty) / 900) * 100).toFixed(1)}%`);
    }

    let atkPiece = null;
    if (rawAttacker && vpAttacker && (rawAttacker.r !== rawTarget.r || rawAttacker.c !== rawTarget.c)) {
      const atkTile = document.querySelector(`#board .tile[data-r="${rawAttacker.r}"][data-c="${rawAttacker.c}"]`);
      if (atkTile) {
        atkPiece = atkTile.querySelector('.piece');
        const dx = Math.sign(vpTarget.c - vpAttacker.c) * 24;
        const dy = Math.sign(vpTarget.r - vpAttacker.r) * 24;
        atkTile.style.setProperty('--lunge-x', `${dx}px`);
        atkTile.style.setProperty('--lunge-y', `${dy}px`);
        atkTile.classList.remove('is-atk-lunge');
        void atkTile.offsetWidth;
        atkTile.classList.add('is-atk-lunge');
      }
    }

    const kUnit = context?.killedUnit || board[rawTarget.r]?.[rawTarget.c] || {
      typeKey: isWipeout ? 'KINESIS' : 'ANCHOR',
      owner: losingOwner,
      name: isWipeout ? 'ユニット' : HERO_TYPES.ANCHOR.name,
      hp: 0,
      maxHp: 100,
      atk: 0
    };
    const ghostWrap = document.createElement('div');
    ghostWrap.className = 'fn-ghost-piece';
    ghostWrap.style.left = `${((vpTarget.c + 0.5) / 7) * 100}%`;
    ghostWrap.style.top = `${((vpTarget.r + 0.5) / 7) * 100}%`;
    const ghostPiece = buildFinisherGhostPiece(kUnit);
    ghostPiece.classList.add('is-fn-hitstop');
    ghostWrap.appendChild(ghostPiece);
    fxLayer.appendChild(ghostWrap);

    const node = document.createElement('div');
    node.className = 'ult-fx-node is-fn-slow';
    node.style.left = `${((vpTarget.c + 0.5) / 7) * 100}%`;
    node.style.top = `${((vpTarget.r + 0.5) / 7) * 100}%`;
    node.style.setProperty('--fx-c', c1);
    node.style.setProperty('--fx-c2', c2);

    let shardsHtml = '';
    for (let i = 0; i < 14; i++) {
      const ang = (i * (360 / 14) + 11) * (Math.PI / 180);
      const dist = 165 + (i % 3) * 65;
      const dx = Math.round(Math.cos(ang) * dist);
      const dy = Math.round(Math.sin(ang) * dist);
      const rot = (i % 2 === 0 ? 1 : -1) * (160 + i * 28);
      const w = 16 + (i % 3) * 6;
      const h = 10 + (i % 2) * 6;
      shardsHtml += `<span class="fn-shard" style="--sh-dx:${dx}px;--sh-dy:${dy}px;--sh-rot:${rot}deg;--sh-w:${w}px;--sh-h:${h}px"></span>`;
    }
    let sparksHtml = '';
    for (let i = 0; i < 12; i++) {
      const ang = i * 30 + (i % 2) * 11;
      const dist = 185 + (i % 3) * 60;
      sparksHtml += `<span class="fx-spark" style="--sp-ang:${ang}deg;--sp-dist:${dist}px;--sp-sc:1.25;--sp-delay:0ms"></span>`;
    }
    node.innerHTML = `
      <span class="fx-slash"></span>
      <span class="fx-slash is-cross"></span>
      <span class="fx-ring" style="--ring-scale:3.6;--ring-dur:0.34s;--ring-delay:0s"></span>
      <span class="fx-ring is-diamond" style="--ring-scale:2.6;--ring-dur:0.32s;--ring-delay:0s"></span>
      ${shardsHtml}
      ${sparksHtml}
      <span class="fx-pop ${isDefeat ? 'is-dmg' : ''} is-big">${esc(popLabel)}</span>
    `;
    fxLayer.appendChild(node);

    const motesEl = document.getElementById('fn-slow-motes');
    if (motesEl) {
      motesEl.innerHTML = Array.from({ length: 12 }, (_, i) => {
        const top = 12 + i * 7.2;
        const left = 18 + ((i * 23) % 68);
        const mw = 70 + (i % 4) * 35;
        return `<span class="fn-mote" style="top:${top}%;left:${left}%;--mw:${mw}px"></span>`;
      }).join('');
    }

    const setFinisherRate = (rate) => {
      const targets = [node, ...node.querySelectorAll('*'), ghostPiece];
      if (atkPiece) targets.push(atkPiece);
      for (const el of targets) {
        for (const anim of el.getAnimations()) {
          try { anim.playbackRate = rate; } catch {}
        }
      }
    };

    if (targetTile) targetTile.classList.add('is-fn-target');
    stage.classList.add('is-finisher-hitstop');
    overlay.hidden = false;
    overlay.classList.remove('is-active', 'is-banner-in', 'is-actions-in', 'is-interactive');
    void overlay.offsetWidth;
    overlay.classList.add('is-active');

    finisherTimers.push(setTimeout(() => {
      setFinisherRate(0.01);
    }, 25));

    finisherTimers.push(setTimeout(() => {
      stage.classList.remove('is-finisher-hitstop');
      stage.classList.add('is-finisher-active');
      ghostPiece.classList.remove('is-fn-hitstop');
      const kbDir = isDefeat ? 1 : -1;
      const kbSignX = vpAttacker ? (Math.sign(vpTarget.c - vpAttacker.c) || 0.7) : 0.7;
      ghostPiece.style.setProperty('--fn-kb-x', `${kbSignX * 48}px`);
      ghostPiece.style.setProperty('--fn-kb-y', `${kbDir * 56}px`);
      ghostPiece.style.setProperty('--fn-kb-rot', `${kbDir * 15}deg`);
      ghostPiece.style.setProperty('--fn-kb-rot2', `${kbDir * 28}deg`);
      ghostPiece.classList.add('is-fn-shattering');
      setFinisherRate(1.0);
    }, 120));

    finisherTimers.push(setTimeout(() => {
      setFinisherRate(0.09);
    }, 215));

    finisherTimers.push(setTimeout(() => {
      setFinisherRate(0.95);
      overlay.classList.add('is-banner-in');
    }, 1660));

    finisherTimers.push(setTimeout(() => {
      overlay.classList.add('is-actions-in', 'is-interactive');
      ghostWrap.remove();
      node.remove();
      overlay.focus({ preventScroll: true });
    }, 2160));
  };

  finisherFrame = requestAnimationFrame(startSequence);
}
