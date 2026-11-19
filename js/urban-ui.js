import { HERO_TYPES, ROWS, COLS, inBounds } from './config.js?v=urban-v1';
import { board, phantomZones, poisonZones, traps, getHazardInfoAt, getEffectiveAtk, getShieldVal, hasDebuff, isUnitInEnemyPhantomZone, isUltReady, isUnit, isObject, isCore, isLocalPlayer } from './board.js?v=urban-v1';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const aliases = {
  DUELIST: 'kinesis', KINESIS: 'kinesis',
  PHANTOM: 'phase', PHASE: 'phase',
  BOMBER: 'nitro', NITRO: 'nitro',
  SENTINEL: 'vector', VECTOR: 'vector',
  POISON: 'toxin', TOXIN: 'toxin',
  DISRUPTOR: 'glitch', GLITCH: 'glitch',
  MEDIC: 'iris', IRIS: 'iris',
  HACKER: 'nexus', NEXUS: 'nexus',
  TURRET: 'vulcan', VULCAN: 'vulcan',
  BIT: 'hive', HIVE: 'hive',
  CYPHER: 'cypher', AURA: 'aura',
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
  let out = '<span class="ar-dots">';
  for (let i = 0; i < safeMax; i++) {
    out += `<i class="ar-dot ${i >= safeRem ? 'used' : ''}"></i>`;
  }
  return out + '</span>';
}

export function roleKey(unit) {
  if (!unit) return 'ASSAULT';
  if (unit.typeKey === 'CORE') return 'CORE';
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
  if (rk === 'CORE') return 'core';
  if (rk === 'OBJECT') return 'object';
  if (rk === 'SUPPORT') return 'support';
  if (rk === 'SENTINEL') return 'sentinel';
  if (rk === 'DISRUPTOR') return 'disruptor';
  return 'assault';
}

export function characterArt(key, owner = 'P1', name = '', extraClass = '') {
  if (key === 'CORE') {
    const coreSlug = isLocalPlayer(owner) ? 'nexus' : 'cypher';
    return `<img class="${extraClass} anime-art" src="tactics_3d/assets/${coreSlug}-urban-anime-v2.png" alt="${esc(name)}" draggable="false">`;
  }
  const slug = aliases[key] || String(key).toLowerCase();
  return `<img class="${extraClass} anime-art" src="tactics_3d/assets/${slug}-urban-anime-v2.png" alt="${esc(name)}" draggable="false">`;
}

export function renderUrbanHero({ turn, selectedPos, selectedHazardPos, commandMode, gamePhase, canControl = false }) {
  const panel = document.getElementById('unit-detail-panel');
  const inspector = document.getElementById('inspector');
  if (!panel) return;

  const hero = selectedPos && board[selectedPos.r]?.[selectedPos.c];
  const pos = selectedPos;

  if (!hero) {
    const hazard = selectedHazardPos && getHazardInfoAt(selectedHazardPos.r, selectedHazardPos.c);
    if (hazard) {
      const hzEnemy = !isLocalPlayer(hazard.owner || 'P1');
      const hzType = hazard.type === 'poison' ? 'toxic' : hazard.type === 'phantom' ? 'dimension' : (hazard.type || 'mine');
      const hzIcon = hzType === 'toxic' ? 'hz_toxic' : hzType === 'dimension' ? 'hz_dimension' : 'hz_mine';
      if (inspector) {
        inspector.dataset.team = hzEnemy ? 'ENEMY' : 'ALLY';
        inspector.dataset.role = hzType === 'toxic' ? 'SUPPORT' : hzType === 'dimension' ? 'DISRUPTOR' : 'CORE';
        inspector.dataset.art = 'anime';
      }
      const teamLabel = hzEnemy ? 'ENEMY' : 'ALLY';
      const setterLabel = hazard.setter || (hzType === 'toxic' ? 'トキシン' : hzType === 'dimension' ? 'フェイズ' : 'ニトロ');
      const impactLabel = hazard.impact || hazard.name;
      panel.innerHTML = `
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
              <svg class="ar-dock-cap-svg" viewBox="0 0 536 48" preserveAspectRatio="none" aria-hidden="true">
                <path d="M 0,2 L 144,2 Q 150,2 154,8 L 166,34 Q 170,40 176,40 L 434,40 Q 440,40 444,35 L 453,16 Q 457,10 463,10 L 536,10 L 536,48 L 0,48 Z" fill="#101115" stroke="none"/>
                <path d="M 0,2 L 144,2 Q 150,2 154,8 L 166,34 Q 170,40 176,40 L 434,40 Q 440,40 444,35 L 453,16 Q 457,10 463,10 L 536,10" fill="none" stroke="#3c3e47" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
              </svg>
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
      `;
      return;
    }

    if (inspector) {
      inspector.dataset.team = isLocalPlayer(turn) ? 'ALLY' : 'ENEMY';
      inspector.dataset.role = 'ASSAULT';
    }
    panel.innerHTML = `<div class="battle-log-empty">SELECT UNIT<span>盤面のキャラクターを選択すると詳細とスキルが表示されます。</span></div>`;
    return;
  }

  const def = HERO_TYPES[hero.typeKey] || {};
  const rk = roleKey(hero);
  const rIcon = roleIcon(hero);
  const roleLabel = def.roleName || def.classType || (rk === 'CORE' ? 'コア' : 'オブジェクト');
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

  const effectiveAtk = unit ? getEffectiveAtk(hero) : (hero.atk || 0);
  const baseAtk = unit ? (def.atk ?? hero.atk ?? 0) : (hero.atk || 0);
  const hasAtk = effectiveAtk > 0;
  const isAtkBuffed = Boolean(hasAtk && (hero.buffs?.atk_up?.turns > 0 || effectiveAtk > baseAtk));
  const atkText = hasAtk ? String(effectiveAtk) : '—';

  if (inspector) {
    inspector.dataset.team = isLocalPlayer(hero.owner) ? 'ALLY' : 'ENEMY';
    inspector.dataset.role = rk;
    inspector.dataset.art = 'anime';
  }

  const stateTags = [];
  if (shield > 0) {
    const shTurns = hero.buffs?.shield?.turns || 1;
    stateTags.push(`<span class="ar-tag-b shield">${svgIcon('st_shield', 'ar-st-ic')}<b class="ar-st-val">+${shield}</b><em class="ar-st-turn">${shTurns}T</em></span>`);
  }
  if (hero.buffs?.atk_up?.turns > 0) {
    stateTags.push(`<span class="ar-tag-b buff">${svgIcon('st_atk', 'ar-st-ic')}<b class="ar-st-val">+${hero.buffs.atk_up.val}</b><em class="ar-st-turn">${hero.buffs.atk_up.turns}T</em></span>`);
  }
  if (hero.buffs?.shadow_drain?.turns > 0) {
    stateTags.push(`<span class="ar-tag-b buff">${svgIcon('skill', 'ar-st-ic')}<span>ドレイン発動中</span><em class="ar-st-turn">${hero.buffs.shadow_drain.turns}T</em></span>`);
  }
  const inEnemyDimension = isUnitInEnemyPhantomZone(hero);
  if (inEnemyDimension && !(hero.debuffs?.vulnerable?.turns > 0)) {
    stateTags.push(`<span class="ar-tag-b debuff">${svgIcon('st_debuff', 'ar-st-ic')}<span>弱体化</span><em class="ar-st-turn">滞在中</em></span>`);
  }
  if (hero.debuffs) {
    const debuffNames = { vulnerable: '弱体化', disarm: '攻撃阻害', bind: '行動阻害', silence: 'スキル阻害' };
    for (const [key, b] of Object.entries(hero.debuffs)) {
      if (b?.turns > 0) {
        const suffix = (key === 'vulnerable' && inEnemyDimension) ? `${b.turns}T / 滞在中` : `${b.turns}T`;
        stateTags.push(`<span class="ar-tag-b debuff">${svgIcon('st_debuff', 'ar-st-ic')}<span>${esc(debuffNames[key] || key)}</span><em class="ar-st-turn">${suffix}</em></span>`);
      }
    }
  }

  const hazard = pos && getHazardInfoAt(pos.r, pos.c);
  if (hazard) {
    const zoneLabel = hazard.name.includes('ディメンション')
      ? 'ディメンション'
      : hazard.name.includes('トキシック')
        ? 'トキシック'
        : hazard.name.replace(/・ゾーン$/, '');
    stateTags.push(`<span class="ar-tag-b terrain">${svgIcon('st_zone', 'ar-st-ic')}<span>${esc(zoneLabel)}</span></span>`);
  }

  const statesHtml = stateTags.length
    ? stateTags.join('')
    : `<span class="ar-state-empty">状態効果なし</span>`;

  const passive = def.passive || null;
  const passiveBody = passive
    ? `
      <div class="ar-sheet-sec passive-sec">
        <div class="ar-sheet-eyebrow">PASSIVE</div>
        <div class="ar-passive-inline">
          <div class="ar-passive-head">
            <strong>${esc(passive.name)}</strong>
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
              <strong>${hero.typeKey === 'CORE' ? '防衛目標仕様' : 'オブジェクト仕様'}</strong>
            </div>
            <div class="ar-passive-desc">${esc(def.desc)}</div>
          </div>
        </div>
      `
      : '';

  const artHtml = hero.typeKey === 'CORE'
    ? svgIcon('core', 'emblem', '1.8')
    : hero.typeKey === 'TURRET'
      ? svgIcon('turret', 'emblem', '1.8')
      : hero.typeKey === 'BARRICADE'
        ? svgIcon('object', 'emblem', '1.8')
        : characterArt(hero.typeKey, hero.owner, hero.name);

  function renderSkillButton(slot, skillObj, isUlt) {
    if (!skillObj) return '';
    const isArmed = commandMode === slot;
    let reason = '';
    if (!active) reason = friendly ? '待機中' : '敵ユニット';
    else if (silenced) reason = 'スキル阻害';
    else if (isUlt && hero.ultUsed) reason = '使用済';
    else if (isUlt && !isUltReady(hero)) reason = 'ULT不足';
    else if (!isUlt && hero.stockA <= 0) reason = '残数0';

    const disabled = Boolean(reason) && !isArmed;
    const maxStock = isUlt ? 1 : (skillObj.maxStock || 2);
    const remStock = isUlt ? (hero.ultUsed ? 0 : 1) : (hero.stockA ?? maxStock);
    const readyClass = isUlt && active && !hero.ultUsed && !silenced && isUltReady(hero) ? 'is-ready' : '';

    let stateHint = '';
    if (isArmed) stateHint = 'ACTIVE';
    else if (silenced && active) stateHint = 'スキル阻害';
    else if (isUlt && active && !hero.ultUsed && !isUltReady(hero)) stateHint = 'ULT不足';

    return `
      <button class="ar-card ${isUlt ? 'ult' : ''} interactive ${readyClass} ${isArmed ? 'armed' : ''} ${disabled ? 'disabled' : ''}" onclick="setCommandMode('${slot}')" ${disabled ? 'disabled' : ''} aria-pressed="${isArmed}">
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

  const canDestroyBarricade = hero.typeKey === 'BARRICADE' && isLocalPlayer(hero.owner) && friendly;
  const hasSkillsSection = Boolean(skills.A || skills.ULT || canDestroyBarricade);

  panel.innerHTML = `
    <div class="ar-piece-hero">
      <div class="ar-banner">
        ${artHtml}
        <div class="ar-pills">
          <span class="ar-role-pill">${svgIcon(rIcon)}<span>${esc(roleLabel)}</span></span>
        </div>
        <h2 class="ar-banner-name">${esc(hero.name)}</h2>
        <span class="ar-banner-code">${esc(hero.typeKey)}</span>
      </div>

      <div class="ar-piece-dock">
        <div class="ar-dock-cap-wrap">
          <svg class="ar-dock-cap-svg" viewBox="0 0 536 48" preserveAspectRatio="none" aria-hidden="true">
            <path d="M 0,2 L 144,2 Q 150,2 154,8 L 166,34 Q 170,40 176,40 L 434,40 Q 440,40 444,35 L 453,16 Q 457,10 463,10 L 536,10 L 536,48 L 0,48 Z" fill="#101115" stroke="none"/>
            <path d="M 0,2 L 144,2 Q 150,2 154,8 L 166,34 Q 170,40 176,40 L 434,40 Q 440,40 444,35 L 453,16 Q 457,10 463,10 L 536,10" fill="none" stroke="#3c3e47" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
          </svg>
          <div class="ar-dock-values">
            <div class="ar-dock-stat hp-side">
              <span class="ar-dk-lbl">HP</span>
              <strong class="ar-dk-hp ${shield > 0 ? 'has-shield' : ''}">${displayHp}<small>/${hero.maxHp}</small></strong>
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
      <div class="insp-scroll ar-skills" aria-label="スキル・操作">
        ${renderSkillButton('SKILL_A', skills.A, false)}
        ${renderSkillButton('SKILL_ULT', skills.ULT, true)}
        ${canDestroyBarricade ? `
          <button type="button" class="ar-destroy-btn" onclick="window.__onDestroyBarricade(${pos.r},${pos.c})" ${active ? '' : 'disabled'}><span>💥 防壁を撤去</span></button>
        ` : ''}
      </div>
    ` : ''}
  `;
}

export function initUrbanUI() {
  const fit = () => {
    const scale = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    document.documentElement.style.setProperty('--scale', scale);
    const stage = document.getElementById('battle-stage');
    if (stage) stage.style.setProperty('--battle-scale', scale);
  };
  window.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('resize', fit);
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

  const button = document.getElementById('btn-end-turn');
  if (!button) return;
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
    if (button.disabled || hold) return;
    hold = { started: performance.now(), frame: 0 };
    const tick = now => {
      if (!hold || button.disabled || !document.getElementById('screen-battle')?.classList.contains('active')) {
        cancel();
        return;
      }
      const progress = Math.min(1, (now - hold.started) / 400);
      if (fill) fill.style.transform = `scaleX(${progress})`;
      button.style.setProperty('--hold-p', String(progress));
      button.classList.toggle('is-held-full', progress >= 0.999);
      if (progress >= 1) {
        cancel();
        if (typeof window.__triggerHoldAction === 'function') {
          window.__triggerHoldAction();
        } else {
          window.manualEndTurn?.();
        }
        return;
      }
      hold.frame = requestAnimationFrame(tick);
    };
    hold.frame = requestAnimationFrame(tick);
  };
  button.onclick = null;
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

export function floorShortName(hz) {
  if (!hz) return '';
  if (hz.type === 'dimension' || hz.type === 'phantom') return 'ディメンション';
  if (hz.type === 'toxic' || hz.type === 'poison') return 'トキシック';
  if (hz.type === 'mine') return 'マイン';
  return String(hz.name || '').replace(/・?(ゾーン|トラップ)$/, '');
}

export function floorGraphicHtml(hz) {
  return `<span class="floor-badge"><svg class="floor-dock-svg" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true"><path d="M 7,1 L 93,1 L 99,6.5 L 99,15.5 L 93,21 L 7,21 L 1,15.5 L 1,6.5 Z"/></svg><b>${esc(floorShortName(hz))}</b></span>`;
}

const canonicalKeys = {
  DUELIST: 'KINESIS',
  PHANTOM: 'PHASE',
  BOMBER: 'NITRO',
  SENTINEL: 'VECTOR',
  TURRET: 'VULCAN',
  POISON: 'TOXIN',
  DISRUPTOR: 'GLITCH',
  MEDIC: 'IRIS',
  HACKER: 'NEXUS'
};

export function normalizeHeroKey(typeKey) {
  return canonicalKeys[typeKey] || typeKey;
}

export const ULT_FX_META = {
  KINESIS: { color: '#d8ff00', color2: '#66fff2', codename: 'KINESIS // OVERDRIVE', sub: 'EXTRA ATTACK TOKEN +1 GRANTED', mode: 'self', pop: '+1 ATTACK', isDmg: false },
  PHASE:   { color: '#b366ff', color2: '#f2b8ff', codename: 'PHASE // VOID DRAIN', sub: 'SHADOW DRAIN PROTOCOL ACTIVE', mode: 'self', pop: 'SHADOW DRAIN', isDmg: false },
  NITRO:   { color: '#ff5a26', color2: '#ffd447', codename: 'NITRO // IGNITION', sub: 'RADIUS-2 BLAST // 20 DMG', mode: 'aoe2', pop: '-20 DMG', isDmg: true },
  VECTOR:  { color: '#00e5ff', color2: '#c8ff80', codename: 'VECTOR // RELOAD', sub: 'FORCE BARRICADE STOCK FULL', mode: 'self', pop: 'STOCK MAX', isDmg: false },
  VULCAN:  { color: '#ff7b24', color2: '#ffd447', codename: 'VULCAN // FORTRESS', sub: 'TURRET RADIUS-2 AIRSTRIKE // 25 DMG', mode: 'turret_aoe2', pop: '-25 DMG', isDmg: true },
  TOXIN:   { color: '#2ee59d', color2: '#c4ff4d', codename: 'TOXIN // BIOHAZARD', sub: '3x3 TOXIC HAZARD DEPLOYED', mode: 'around', pop: 'TOXIC ZONE', isDmg: false },
  GLITCH:  { color: '#ff3ec8', color2: '#8d7bff', codename: 'GLITCH // OVERRIDE', sub: 'DIMENSION WARP & VULNERABLE', mode: 'warp_charge', pop: 'WARP CHARGE!', isDmg: true },
  CYPHER:  { color: '#8d7bff', color2: '#ff3ec8', codename: 'CYPHER // BLACKOUT', sub: 'ALL ENEMIES BIND & DISARM', mode: 'enemies', pop: 'BLACKOUT!', isDmg: true },
  HIVE:    { color: '#b366ff', color2: '#66fff2', codename: 'HIVE // SWARM DRIVE', sub: 'ALL BITS SHIELD +30 & ATK +10', mode: 'bits', pop: 'SWARM DRIVE', isDmg: false, isShield: true },
  IRIS:    { color: '#38f6b4', color2: '#ffe169', codename: 'IRIS // AURA SYNC', sub: 'ALL ALLIES SHIELD +15 GRANTED', mode: 'allies', pop: '+15 SHIELD', isDmg: false, isShield: true },
  NEXUS:   { color: '#38bdf8', color2: '#38f6b4', codename: 'NEXUS // EMP PULSE', sub: 'DISMANTLE HAZARDS & HEAL ALLIES +10', mode: 'aoe2_target', pop: 'EMP PULSE', isDmg: false, isShield: true },
  AURA:    { color: '#38f6b4', color2: '#e066ff', codename: 'AURA // RESCUE WARP', sub: 'WARP & SANCTUARY HEAL +20 HP', mode: 'around_target', pop: '+20 HP', isDmg: false, isShield: true }
};

export const SKILL_FX_META = {
  KINESIS: { color: '#d8ff00', color2: '#b8ff99', pop: 'ATK +5', selfCast: true },
  PHASE:   { color: '#b366ff', color2: '#ecc4ff', pop: 'TELEPORT', selfCast: false },
  NITRO:   { color: '#ff7b24', color2: '#ffe07d', pop: 'MINE SET', selfCast: false },
  BIT:     { color: '#ff7b24', color2: '#ffe07d', pop: 'SELF DESTRUCT', selfCast: true },
  VECTOR:  { color: '#00e5ff', color2: '#b8f8ff', pop: 'BARRICADE', selfCast: false },
  VULCAN:  { color: '#00d8ff', color2: '#b8f8ff', pop: 'TURRET SET', selfCast: false },
  TOXIN:   { color: '#2ee59d', color2: '#b9ffe0', pop: 'TOXIC x3', selfCast: false },
  GLITCH:  { color: '#ff3ec8', color2: '#c9b8ff', pop: 'WARP!', selfCast: false },
  CYPHER:  { color: '#b366ff', color2: '#ffd447', pop: 'JAMMING!', selfCast: false },
  HIVE:    { color: '#00d2ff', color2: '#e0b8ff', pop: 'BIT DEPLOY', selfCast: false },
  IRIS:    { color: '#2ee59d', color2: '#b9ffe4', pop: '+30 HP', isHeal: true, healAmount: 30 },
  NEXUS:   { color: '#2ee59d', color2: '#b8f8ff', pop: '+15 HP', isHeal: true, healAmount: 15 },
  AURA:    { color: '#2ee59d', color2: '#e0b8ff', pop: '+20 HP', isHeal: true, selfCast: true, aoeHeal: true, healAmount: 20 }
};

export function isHealSkillHero(unit) {
  if (!unit) return false;
  const k = normalizeHeroKey(unit.typeKey);
  return k === 'IRIS' || k === 'NEXUS' || k === 'AURA';
}

export function getSkillPreviewTargets(casterPos, unit, hoveredTarget = null) {
  if (!casterPos || !unit) return [];
  const k = normalizeHeroKey(unit.typeKey);
  const out = [];
  const added = new Set();
  const pushUnique = (r, c, hitPiece, kind) => {
    const key = `${r},${c}`;
    if (added.has(key)) return;
    added.add(key);
    out.push({ r, c, hitPiece, kind });
  };

  if (k === 'AURA') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = casterPos.r + dr, nc = casterPos.c + dc;
        if (!inBounds(nr, nc)) continue;
        const cell = board[nr]?.[nc];
        pushUnique(nr, nc, Boolean(cell && cell.owner === unit.owner && isUnit(cell)), 'heal');
      }
    }
  } else if (k === 'TOXIN') {
    if (hoveredTarget && hoveredTarget.r === casterPos.r && Math.abs(hoveredTarget.c - casterPos.c) === 1) {
      const dir = hoveredTarget.c > casterPos.c ? 1 : -1;
      let placed = 0;
      let step = 1;
      while (placed < 3) {
        const nc = casterPos.c + dir * step;
        if (!inBounds(casterPos.r, nc)) break;
        const hasVisibleHazard =
          phantomZones.some(z => z.r === casterPos.r && z.c === nc) ||
          poisonZones.some(z => z.r === casterPos.r && z.c === nc) ||
          traps.some(tp => tp.r === casterPos.r && tp.c === nc && isLocalPlayer(tp.owner));
        if (!hasVisibleHazard) {
          const cell = board[casterPos.r]?.[nc];
          pushUnique(casterPos.r, nc, Boolean(cell && cell.owner !== unit.owner && isUnit(cell)), 'toxic');
          placed++;
        }
        step++;
      }
    }
  } else if (k === 'GLITCH') {
    if (hoveredTarget) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = hoveredTarget.r + dr, nc = hoveredTarget.c + dc;
          if (!inBounds(nr, nc)) continue;
          const cell = board[nr]?.[nc];
          pushUnique(nr, nc, Boolean(cell && cell.owner !== unit.owner && isUnit(cell)), 'debuff');
        }
      }
    }
  } else if (k === 'CYPHER') {
    const forwardDir = (unit.owner === 'P1') ? -1 : 1;
    let step = 1;
    while (true) {
      const nr = casterPos.r + forwardDir * step;
      const nc = casterPos.c;
      if (!inBounds(nr, nc)) break;
      const cell = board[nr]?.[nc];
      if (cell) {
        if (isUnit(cell)) {
          pushUnique(nr, nc, true, cell.owner === unit.owner ? 'heal' : 'debuff');
        }
        break;
      }
      pushUnique(nr, nc, false, 'beam');
      step++;
    }
  }

  return out;
}

export function getUltPreviewTargets(casterPos, unit, clickedTarget = null, isHoverTargeting = false) {
  if (!casterPos || !unit) return [];
  const meta = ULT_FX_META[normalizeHeroKey(unit.typeKey)] || ULT_FX_META.KINESIS;
  const out = [];
  const added = new Set();
  const pushUnique = (r, c, hitPiece) => {
    const key = `${r},${c}`;
    if (added.has(key)) return;
    added.add(key);
    out.push({ r, c, hitPiece });
  };

  if (meta.mode === 'turret_aoe2') {
    const turrets = [];
    if (clickedTarget && inBounds(clickedTarget.r, clickedTarget.c)) {
      const cell = board[clickedTarget.r]?.[clickedTarget.c];
      if (cell && cell.owner === unit.owner && cell.typeKey === 'TURRET') {
        turrets.push({ r: clickedTarget.r, c: clickedTarget.c });
      }
    }
    if (turrets.length === 0) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = board[r]?.[c];
          if (cell && cell.owner === unit.owner && cell.typeKey === 'TURRET') {
            turrets.push({ r, c });
          }
        }
      }
    }
    turrets.forEach(tp => {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (Math.max(Math.abs(r - tp.r), Math.abs(c - tp.c)) <= 2) {
            const cell = board[r]?.[c];
            pushUnique(r, c, Boolean(cell && cell.owner !== unit.owner && !isCore(cell) && (isUnit(cell) || isObject(cell))));
          }
        }
      }
    });
  } else if (meta.mode === 'aoe2_target' || meta.mode === 'around_target' || meta.mode === 'warp_charge') {
    if (isHoverTargeting && !clickedTarget) {
      return [];
    }
    const center = clickedTarget || casterPos;
    const rad = meta.mode === 'aoe2_target' ? 2 : 1;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (Math.max(Math.abs(r - center.r), Math.abs(c - center.c)) <= rad) {
          const cell = board[r]?.[c];
          let hit = false;
          if (meta.mode === 'aoe2_target') {
            const hasAllyUnit = Boolean(cell && cell.owner === unit.owner && isUnit(cell));
            const hasEnemyObj = Boolean(cell && cell.owner !== unit.owner && isObject(cell));
            const hasVisibleEnemyHazard =
              phantomZones.some(z => z.r === r && z.c === c && z.owner !== unit.owner) ||
              poisonZones.some(z => z.r === r && z.c === c && z.owner !== unit.owner);
            hit = hasAllyUnit || hasEnemyObj || hasVisibleEnemyHazard;
          } else if (meta.mode === 'around_target') {
            const isLanding = (r === center.r && c === center.c);
            const hasAllyUnit = Boolean(cell && cell.owner === unit.owner && isUnit(cell) && (r !== casterPos.r || c !== casterPos.c));
            hit = isLanding || hasAllyUnit;
          } else if (meta.mode === 'warp_charge') {
            hit = Boolean(cell && cell.owner !== unit.owner && isUnit(cell));
          }
          pushUnique(r, c, hit);
        }
      }
    }
  } else {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const dr = Math.abs(r - casterPos.r);
        const dc = Math.abs(c - casterPos.c);
        const dist = Math.max(dr, dc);
        const cell = board[r]?.[c];
        if (meta.mode === 'aoe2' && dist <= 2) {
          pushUnique(r, c, Boolean(cell));
        } else if (meta.mode === 'around' && dist <= 1) {
          pushUnique(r, c, Boolean(cell && cell.owner !== unit.owner && isUnit(cell)));
        } else if (meta.mode === 'allies' && cell && cell.owner === unit.owner && !isObject(cell)) {
          pushUnique(r, c, true);
        } else if (meta.mode === 'bits' && cell && cell.owner === unit.owner && cell.typeKey === 'BIT') {
          pushUnique(r, c, true);
        } else if ((meta.mode === 'enemy' || meta.mode === 'enemies') && cell && cell.owner !== unit.owner && isUnit(cell)) {
          pushUnique(r, c, true);
        }
      }
    }
  }
  if (meta.mode === 'self' || (!isHoverTargeting && out.length === 0)) {
    pushUnique(casterPos.r, casterPos.c, false);
  }
  return out;
}

let ultTimers = [];
let finisherTimers = [];

export function clearFinisherFxState() {
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

export function clearUltFxState() {
  ultTimers.forEach(clearTimeout);
  ultTimers = [];
  clearFinisherFxState();
  const stage = document.getElementById('battle-stage');
  const cutin = document.getElementById('ult-cutin-overlay');
  const fxLayer = document.getElementById('board-fx-layer');
  if (stage) {
    stage.classList.remove('is-ult-impact');
    stage.querySelectorAll('.piece.is-ult-casting').forEach(el => el.classList.remove('is-ult-casting'));
    stage.querySelectorAll('.tile.is-ult-hit').forEach(el => el.classList.remove('is-ult-hit'));
  }
  document.getElementById('core-bar-ally')?.classList.remove('is-ult-discharging');
  document.getElementById('core-bar-enemy')?.classList.remove('is-ult-discharging');
  if (cutin) {
    cutin.classList.remove('is-active');
    cutin.hidden = true;
  }
  if (fxLayer) fxLayer.innerHTML = '';
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

  const showRing = target.hitPiece || (target.r === casterPos.r && target.c === casterPos.c);
  const showPop = target.hitPiece || meta.mode === 'self' || (meta.mode === 'around' && target.r === casterPos.r && target.c === casterPos.c);
  node.innerHTML = `
    <span class="fx-target-pulse"></span>
    ${showRing ? `<span class="fx-ring" style="--ring-scale:1.55;--ring-dur:0.65s;--ring-delay:${delayMs}ms"></span>` : ''}
    ${showPop ? `<span class="fx-pop ${meta.isDmg ? 'is-dmg' : meta.isShield ? 'is-shield' : ''}">${esc(meta.pop)}</span>` : ''}
  `;
  fxLayer.appendChild(node);

  if (target.hitPiece) {
    const hitTile = document.querySelector(`#board .tile[data-r="${target.r}"][data-c="${target.c}"]`);
    if (hitTile) {
      hitTile.style.setProperty('--fx-delay', `${delayMs}ms`);
      hitTile.classList.add('is-ult-hit');
    }
  }
}

export function playCombatPopupFX(kind, targetPos, amount, attackerPos, boardFlipped) {
  const fxLayer = document.getElementById('board-fx-layer');
  if (!fxLayer || !targetPos) return;
  const vpTarget = resolveVisualPos(targetPos, boardFlipped);

  if (kind === 'dmg' && attackerPos) {
    requestAnimationFrame(() => {
      const atkTile = document.querySelector(`#board .tile[data-r="${attackerPos.r}"][data-c="${attackerPos.c}"]`);
      if (atkTile) {
        const sign = vpTarget.flipped ? -1 : 1;
        const dx = sign * Math.sign(targetPos.c - attackerPos.c) * 16;
        const dy = sign * Math.sign(targetPos.r - attackerPos.r) * 16;
        atkTile.style.setProperty('--lunge-x', `${dx}px`);
        atkTile.style.setProperty('--lunge-y', `${dy}px`);
        atkTile.classList.remove('is-atk-lunge');
        void atkTile.offsetWidth;
        atkTile.classList.add('is-atk-lunge');
        setTimeout(() => atkTile.classList.remove('is-atk-lunge'), 360);
      }
    });
  }

  requestAnimationFrame(() => {
    const tgtTile = document.querySelector(`#board .tile[data-r="${targetPos.r}"][data-c="${targetPos.c}"]`);
    if (tgtTile) {
      const cls = kind === 'heal' ? 'is-heal-hit' : 'is-dmg-hit';
      tgtTile.classList.remove('is-dmg-hit', 'is-heal-hit');
      void tgtTile.offsetWidth;
      tgtTile.classList.add(cls);
      setTimeout(() => tgtTile.classList.remove(cls), 620);
    }
  });

  const node = document.createElement('div');
  node.className = 'ult-fx-node';
  node.style.left = `${((vpTarget.c + 0.5) / 7) * 100}%`;
  node.style.top = `${((vpTarget.r + 0.5) / 7) * 100}%`;

  if (kind === 'heal') {
    node.style.setProperty('--fx-c', '#2ee59d');
    node.style.setProperty('--fx-c2', '#b9ffe4');
    const plusHtml = [
      { x: -24, y: 10, d: 0 },
      { x: 22, y: 14, d: 70 },
      { x: -12, y: -12, d: 130 },
      { x: 18, y: -16, d: 180 }
    ].map(p => `<span class="fx-heal-plus" style="left:${p.x}px;top:${p.y}px;--hp-delay:${p.d}ms">+</span>`).join('');
    node.innerHTML = `
      <span class="fx-heal-aura"></span>
      <span class="fx-ring" style="--ring-scale:1.45;--ring-dur:0.64s;--ring-delay:0s"></span>
      ${plusHtml}
      <span class="fx-pop is-heal is-big">+${amount} HP</span>
    `;
  } else {
    node.style.setProperty('--fx-c', '#ff4625');
    node.style.setProperty('--fx-c2', '#ffd0b8');
    let sparksHtml = '';
    for (let i = 0; i < 6; i++) {
      const ang = 25 + i * 58;
      sparksHtml += `<span class="fx-spark" style="--sp-ang:${ang}deg;--sp-dist:76px;--sp-sc:0.85;--sp-delay:0ms"></span>`;
    }
    node.innerHTML = `
      <span class="fx-slash"></span>
      <span class="fx-slash is-cross"></span>
      <span class="fx-ring" style="--ring-scale:1.45;--ring-dur:0.54s;--ring-delay:0s"></span>
      ${sparksHtml}
      <span class="fx-pop is-dmg is-big">-${amount} DMG</span>
    `;
  }

  fxLayer.appendChild(node);
  setTimeout(() => node.remove(), 1120);
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

  if (meta.isHeal) {
    const amount = meta.healAmount || 30;
    if (meta.aoeHeal) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = casterPos.r + dr;
          const c = casterPos.c + dc;
          const ally = board[r]?.[c];
          if (ally && ally.owner === casterUnit.owner && isUnit(ally)) {
            playCombatPopupFX('heal', { r, c }, amount, casterPos, boardFlipped);
          }
        }
      }
      return;
    }
    const healPos = targetPos || casterPos;
    playCombatPopupFX('heal', healPos, amount, casterPos, boardFlipped);
    return;
  }

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

export function playUltCutinFX(casterPos, casterUnit, clickedTarget, boardFlipped) {
  if (!casterUnit || !casterPos) return;
  clearUltFxState();

  const def = HERO_TYPES[casterUnit.typeKey] || {};
  const meta = ULT_FX_META[normalizeHeroKey(casterUnit.typeKey)] || ULT_FX_META.KINESIS;
  const stage = document.getElementById('battle-stage');
  const cutin = document.getElementById('ult-cutin-overlay');
  const fxLayer = document.getElementById('board-fx-layer');
  if (!stage || !cutin || !fxLayer) return;

  const slug = aliases[casterUnit.typeKey] || String(casterUnit.typeKey || 'kinesis').toLowerCase();
  const artSrc = `tactics_3d/assets/${slug}-urban-anime-v2.png`;
  const roleLabel = def.roleName || def.classType || '';

  const wmEl = document.getElementById('uci-wm-text');
  const badgeEl = document.getElementById('uci-ult-badge');
  const unitTagEl = document.getElementById('uci-unit-tag');
  const titleEl = document.getElementById('uci-skill-title');
  const subEl = document.getElementById('uci-skill-sub');
  const artEl = document.getElementById('uci-art-img');
  const ghostEl = document.getElementById('uci-art-ghost-img');

  if (wmEl) wmEl.textContent = `${meta.codename.split(' ')[0]} // ULTIMATE`;
  if (badgeEl) badgeEl.textContent = isLocalPlayer(casterUnit.owner) ? 'DECIBEL MAX // ULTIMATE' : 'ENEMY // OVERDRIVE';
  if (unitTagEl) unitTagEl.textContent = `${def.name || casterUnit.name}${roleLabel ? ` · ${roleLabel}` : ''}`;
  if (titleEl) titleEl.textContent = def.skills?.ULT?.name || 'ULTIMATE';
  if (subEl) subEl.textContent = meta.sub;
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

  const targets = (meta.mode === 'enemy' && clickedTarget && board[clickedTarget.r]?.[clickedTarget.c] && board[clickedTarget.r][clickedTarget.c].owner !== casterUnit.owner)
    ? [{ r: clickedTarget.r, c: clickedTarget.c, hitPiece: true }]
    : getUltPreviewTargets(casterPos, casterUnit, clickedTarget);

  ultTimers.push(setTimeout(() => {
    stage.style.setProperty('--ult-fx-color', meta.color);
    stage.style.setProperty('--ult-fx-color-2', meta.color2);
    stage.classList.remove('is-ult-impact');
    void stage.offsetWidth;
    stage.classList.add('is-ult-impact');

    const barEl = document.getElementById(isLocalPlayer(casterUnit.owner) ? 'core-bar-ally' : 'core-bar-enemy');
    if (barEl) barEl.classList.add('is-ult-discharging');

    const casterPiece = document.querySelector(`#board .tile[data-r="${casterPos.r}"][data-c="${casterPos.c}"] .piece`);
    if (casterPiece) casterPiece.classList.add('is-ult-casting');

    spawnCasterBurst(fxLayer, casterPos, meta, boardFlipped);
    targets.forEach(t => spawnTargetWave(fxLayer, t, casterPos, meta, boardFlipped));
  }, 860));

  ultTimers.push(setTimeout(() => {
    cutin.classList.remove('is-active');
    cutin.hidden = true;
  }, 1250));

  ultTimers.push(setTimeout(() => {
    clearUltFxState();
  }, 2250));
}

function buildFinisherGhostPiece(unit) {
  const isEnemy = !isLocalPlayer(unit.owner);
  const isStructure = unit.typeKey === 'CORE' || unit.typeKey === 'TURRET' || unit.typeKey === 'BARRICADE';
  const rk = roleKey(unit);
  const rIcon = roleIcon(unit);
  const faceHtml = unit.typeKey === 'CORE'
    ? icon('core')
    : unit.typeKey === 'TURRET'
      ? icon('turret')
      : characterArt(unit.typeKey, unit.owner, unit.name);
  const hasAtk = Number(unit.atk) > 0;

  const piece = document.createElement('div');
  piece.className = `piece ${isEnemy ? 'enemy' : 'ally'} ${isStructure ? 'structure' : ''} ${String(unit.typeKey || '').toLowerCase()}${unit.typeKey === 'CORE' ? ' core' : ''}`;
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
  reason = 'core',
  myRole = null,
  gameMode = 'pve',
  context = null,
  boardFlipped,
  onPlayAgain,
  onTitle
}) {
  const cutin = document.getElementById('ult-cutin-overlay');
  const waitMs = (cutin && !cutin.hidden && cutin.classList.contains('is-active')) ? 1180 : 0;

  const startSequence = () => {
    clearUltFxState();
    const stage = document.getElementById('battle-stage');
    const overlay = document.getElementById('finisher-overlay');
    const fxLayer = document.getElementById('board-fx-layer');
    if (!stage || !overlay || !fxLayer) return;

    const isWipeout = (reason === 'wipeout');
    const isViewerWin = myRole ? (winner === myRole) : isLocalPlayer(winner);
    const isLocalMode = (gameMode === 'local');
    const isDefeat = !isLocalMode && !isViewerWin;
    const losingOwner = winner === 'P1' ? 'P2' : 'P1';

    const title = isLocalMode
      ? `${winner} VICTORY!`
      : (isViewerWin ? 'VICTORY!' : 'DEFEAT...');
    const desc = isLocalMode
      ? (isWipeout ? `${winner} が敵ユニットの全滅に成功しました！` : `${winner} が敵コアの完全破壊に成功しました！`)
      : isViewerWin
        ? (isWipeout ? '敵ユニットの全滅に成功しました！自軍の勝利！' : '敵コアの完全破壊に成功しました！自軍の勝利！')
        : (isWipeout ? '自軍ユニットが全滅しました...敗北...' : '自軍コアが破壊されました...敗北...');

    const c1 = isViewerWin ? '#d8ff00' : '#ff4625';
    const c2 = isViewerWin ? '#ffffff' : '#ffb4a6';
    const pill = isDefeat
      ? (isWipeout ? 'ANNIHILATED' : 'CRITICAL LOSS')
      : (isWipeout ? 'WIPEOUT' : 'CORE BREAK');
    const subTag = isDefeat
      ? (isWipeout ? 'ALL UNITS LOST' : 'CORE INTEGRITY ZERO')
      : (isWipeout ? 'ALL HOSTILES ELIMINATED' : 'OPERATION COMPLETE');
    const wm = isDefeat
      ? 'SYSTEM DOWN // DEFEAT'
      : (isWipeout ? 'WIPEOUT // VICTORY' : 'CORE BREAK // VICTORY');
    const popLabel = context?.dmg > 0
      ? `-${context.dmg} DMG`
      : (isDefeat ? 'CORE LOST' : (isWipeout ? 'WIPEOUT!' : 'CORE BREAK'));

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
    if (againBtn) againBtn.onclick = () => { clearFinisherFxState(); if (onPlayAgain) onPlayAgain(); };
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
      typeKey: isWipeout ? 'KINESIS' : 'CORE',
      owner: losingOwner,
      name: isWipeout ? 'ユニット' : '防衛コア',
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
    }, 2160));
  };

  if (waitMs > 0) {
    finisherTimers.push(setTimeout(startSequence, waitMs));
  } else {
    requestAnimationFrame(startSequence);
  }
}
