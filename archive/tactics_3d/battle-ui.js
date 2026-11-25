'use strict';
    const INITIAL_ENTITIES = {
      kinesis: {
        category: 'UNIT',
        classLabel: 'ユニット',
        classCss: 'class-unit',
        roleLabel: '⚡ アサルト',
        icon: '⚡',
        team: 'BLUE',
        name: 'キネシス',
        img: 'assets/kinesis-urban-anime-v2.png',
        hp: 95, maxHp: 95,
        shield: 0,
        baseAtk: 25, atk: 30,
        statuses: [
          { label: '🔥 攻撃力増強 +5 (1T)', type: 'buff' }
        ],
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: false },
          { main: 'ATK', sub: '', type: 'atk', used: false },
          { main: 'MOVE', sub: 'キネシス', type: 'special', used: false }
        ],
        passive: {
          tag: 'PASSIVE',
          name: 'ライトニング・ステップ',
          desc: '毎自軍ターン開始時、キネシス専用の【追加移動トークン (+1 MOVE)】を獲得（共通移動枠を消費せず移動可能）。'
        },
        skill: {
          name: 'オーバードライブ',
          stock: 2, maxStock: 2,
          desc: '自身に【攻撃力増強 (+5 / このターン中)】を付与する（ATK 25 ➔ 30）。'
        },
        ult: {
          name: 'ライトニング・ラッシュ',
          en: 'LIGHTNING RUSH',
          stock: 1, maxStock: 1,
          desc: '自身にキネシス専用の【追加攻撃トークン (+1 ATTACK)】を即座に1枚付与する！'
        }
      },

      phase: {
        category: 'UNIT',
        classLabel: 'ユニット',
        classCss: 'class-unit',
        roleLabel: '👤 アサルト',
        icon: '👤',
        team: 'BLUE',
        name: 'フェイズ',
        img: 'assets/phase-urban-anime-v2.png',
        hp: 52, maxHp: 80,
        shield: 0,
        baseAtk: 30, atk: 30,
        statuses: [
          { label: '🎯 弱体化: 被ダメ1.5倍 (1T)', type: 'debuff' },
          { label: '⛓️ 行動阻害: 移動不可 (1T)', type: 'debuff' },
          { label: '⚠️ 足元: ディメンション・ゾーン', type: 'hazard-foot' }
        ],
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: true },
          { main: 'ATK', sub: '', type: 'atk', used: false }
        ],
        passive: {
          tag: 'PASSIVE',
          name: 'シャドウ・オリジン',
          desc: 'バトル開始時、初期配置マスに「ディメンション・ゾーン（侵入した敵に弱体化付与）」を自動展開。'
        },
        skill: {
          name: 'テレポート',
          stock: 1, maxStock: 2,
          desc: '自軍ディメンション・ゾーン（空きマス）へ即座にテレポート移動する（移動トークン消費なし）。'
        },
        ult: {
          name: 'シャドウ・ドレイン',
          en: 'SHADOW DRAIN',
          stock: 0, maxStock: 1,
          desc: 'この自軍ターン中に自身が敵に与えた合計ダメージ分、自身のHPを即座に回復（吸収）する！'
        }
      },

      hive: {
        category: 'UNIT',
        classLabel: 'ユニット',
        classCss: 'class-unit',
        roleLabel: '🛸 ディスラプター',
        icon: '🛸',
        team: 'BLUE',
        name: 'ハイヴ',
        img: 'assets/hive-urban-anime-v2.png',
        hp: 90, maxHp: 90,
        shield: 30,
        baseAtk: 15, atk: 25,
        statuses: [
          { label: '🛡️ シールド +30 (2T)', type: 'shield' },
          { label: '🔥 攻撃力増強 +10 (2T)', type: 'buff' }
        ],
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: false },
          { main: 'ATK', sub: '', type: 'atk', used: false },
          { main: 'ATK', sub: 'ビット#1', type: 'special', used: false },
          { main: 'ATK', sub: 'ビット#2', type: 'special', used: false },
          { main: 'ATK', sub: 'ビット#3', type: 'special', used: true }
        ],
        passive: {
          tag: 'PASSIVE',
          name: 'ニューロ・カウンター',
          desc: '自身が召喚したビットを破壊した敵ユニットに【弱体化 (2T)】および【スキル阻害 (2T)】を付与する。'
        },
        skill: {
          name: 'ビット・デプロイ',
          stock: 2, maxStock: 3,
          desc: '自軍アサルトの周囲8マスの空きマスに自律戦闘子機「ビット（HP 20 / ATK 5）」を1体召喚する。'
        },
        ult: {
          name: 'スウォーム・オーバードライブ',
          en: 'SWARM OVERDRIVE',
          stock: 1, maxStock: 1,
          desc: '召喚したすべてのビットに【シールド増強 (+30 / 2T)】および【攻撃力増強 (+10 / 2T)】を一斉付与！'
        }
      },

      iris: {
        category: 'UNIT',
        classLabel: 'ユニット',
        classCss: 'class-unit',
        roleLabel: '💉 サポート',
        icon: '💉',
        team: 'BLUE',
        name: 'アイリス',
        img: 'assets/iris-urban-anime-v2.png',
        hp: 90, maxHp: 90,
        shield: 15,
        baseAtk: 14, atk: 14,
        statuses: [
          { label: '🛡️ シールド +15 (2T)', type: 'shield' }
        ],
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: false },
          { main: 'ATK', sub: '', type: 'atk', used: false }
        ],
        passive: {
          tag: 'PASSIVE',
          name: 'ナノ・エンハンスメント',
          desc: '毎自軍ターン終了時、前方一直線にいる最も近い負傷した味方ユニット1体のHPを 5 自動回復。'
        },
        skill: {
          name: 'ライフ・リペア',
          stock: 2, maxStock: 2,
          desc: '半径3マス以内の味方ユニット1体を指定し、HPを 30 大回復する。'
        },
        ult: {
          name: 'オーバーチャージ・オーラ',
          en: 'OVERCHARGE AURA',
          stock: 1, maxStock: 1,
          desc: '自軍の全ユニットおよび防衛コアに【シールド増強 (+15 / 2T)】を一斉付与！'
        }
      },

      enemy_toxin: {
        category: 'UNIT',
        classLabel: 'ユニット',
        classCss: 'class-unit',
        roleLabel: '☣️ ディスラプター',
        icon: '☣️',
        team: 'RED',
        name: 'トキシン',
        img: 'assets/toxin-urban-anime-v2.png',
        hp: 75, maxHp: 90,
        shield: 0,
        baseAtk: 20, atk: 20,
        statuses: [],
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: false },
          { main: 'ATK', sub: '', type: 'atk', used: false }
        ],
        passive: {
          tag: 'PASSIVE',
          name: 'ベノム・アンプリファイ',
          desc: 'トキシック・ゾーン内の敵ユニットに対する通常攻撃ダメージが +10 増加する。'
        },
        skill: {
          name: 'ベノム・クラウド',
          stock: 1, maxStock: 2,
          desc: '指定マスに「トキシック・ゾーン（侵入・滞在時に10ダメージ）」を展開する。'
        },
        ult: {
          name: 'パンデミック・バースト',
          en: 'PANDEMIC BURST',
          stock: 0, maxStock: 1,
          desc: '盤上のすべての敵ユニットに 15 ダメージを与え、【弱体化 (1T)】を付与する！'
        }
      },

      enemy_vector: {
        category: 'UNIT',
        classLabel: 'ユニット',
        classCss: 'class-unit',
        roleLabel: '🛡️ タンク',
        icon: '🛡️',
        team: 'RED',
        name: 'ベクター',
        img: 'assets/vector-urban-anime-v2.png',
        hp: 100, maxHp: 100,
        shield: 20,
        baseAtk: 20, atk: 30,
        statuses: [
          { label: '🛡️ シールド +20 (1T)', type: 'shield' },
          { label: '🔥 防壁隣接 +10', type: 'buff' }
        ],
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: false },
          { main: 'ATK', sub: '', type: 'atk', used: false }
        ],
        passive: {
          tag: 'PASSIVE',
          name: 'バンカー・リンク',
          desc: '防壁または防衛コアに隣接している間、自身の攻撃力が +10 増加する。'
        },
        skill: {
          name: 'バリケード構築',
          stock: 1, maxStock: 2,
          desc: '周囲の空きマスに「防壁（HP 30）」を1基設置する。'
        },
        ult: {
          name: 'イージス・フォートレス',
          en: 'AEGIS FORTRESS',
          stock: 0, maxStock: 1,
          desc: '自軍全体に【シールド +25 (2T)】を付与する！'
        }
      },

      enemy_glitch: {
        category: 'UNIT',
        classLabel: 'ユニット',
        classCss: 'class-unit',
        roleLabel: '⚡ トリック',
        icon: '⚡',
        team: 'RED',
        name: 'グリッチ',
        img: 'assets/glitch-urban-anime-v2.png',
        hp: 85, maxHp: 85,
        shield: 0,
        baseAtk: 22, atk: 22,
        statuses: [],
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: false },
          { main: 'ATK', sub: '', type: 'atk', used: false }
        ],
        passive: {
          tag: 'PASSIVE',
          name: '空間干渉',
          desc: 'スキルで位置を入れ替えた対象に【行動阻害 (1T)】を付与する。'
        },
        skill: {
          name: 'ポジション・スワップ',
          stock: 2, maxStock: 2,
          desc: '射程内のユニット1体と自身の座標を即座に入れ替える。'
        },
        ult: {
          name: 'システム・クラッシュ',
          en: 'SYSTEM CRASH',
          stock: 0, maxStock: 1,
          desc: '周囲の敵ユニットに 25 ダメージを与え、スキルストックを 1 減少させる。'
        }
      },

      // OBJECTS & CORES
      barricade: {
        category: 'OBJECT',
        classLabel: 'オブジェクト',
        classCss: 'class-object',
        roleLabel: '🧱 防壁',
        icon: '🧱',
        team: 'BLUE',
        name: '防壁',
        img: 'assets/barricade-urban-anime-v2.png',
        hp: 30, maxHp: 30,
        shield: 0,
        baseAtk: 0, atk: 0,
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: false },
          { main: 'ATK', sub: '', type: 'atk', used: false }
        ],
        passive: {
          tag: 'PASSIVE',
          name: '戦術遮蔽オブジェクト',
          desc: 'ベクターが設置した防護壁。敵味方ともに通行不能。隣接するベクターの攻撃力を +10 増強する。'
        },
        objectAction: {
          badge: 'ACTION',
          name: '防壁を撤去（自壊）',
          desc: '行動トークンを消費せずにこの防壁を即座に撤去し、味方の進路や射線を空けます。'
        }
      },

      turret: {
        category: 'OBJECT',
        classLabel: 'オブジェクト',
        classCss: 'class-object',
        roleLabel: '🗼 タレット',
        icon: '🗼',
        team: 'BLUE',
        name: 'タレット',
        img: 'assets/vulcan-urban-anime-v2.png',
        hp: 20, maxHp: 20,
        shield: 0,
        baseAtk: 10, atk: 10,
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: false },
          { main: 'ATK', sub: '', type: 'atk', used: false }
        ],
        passive: {
          tag: 'PASSIVE',
          name: 'セントリー自動射撃',
          desc: '毎自軍ターン終了時、周囲8マス以内のすべての敵ユニットへ 10 ダメージを自動射撃する。破壊されるとヴァルカンのスキルストックが 1 回復する。'
        }
      },

      ally_core: {
        category: 'OBJECT',
        classLabel: 'オブジェクト',
        classCss: 'class-object',
        roleLabel: '💎 コア',
        icon: '💎',
        team: 'BLUE',
        name: '味方コア',
        img: 'assets/nexus-urban-anime-v2.png',
        hp: 100, maxHp: 100,
        shield: 15,
        baseAtk: 0, atk: 0,
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: false },
          { main: 'ATK', sub: '', type: 'atk', used: false }
        ],
        passive: {
          tag: 'CORE',
          name: '戦術中枢リアクター',
          desc: '自軍の最重要防衛目標。移動・攻撃不可。耐久値が 0 になると敗北となる。'
        }
      },

      enemy_core: {
        category: 'OBJECT',
        classLabel: 'オブジェクト',
        classCss: 'class-object',
        roleLabel: '💎 敵コア',
        icon: '💎',
        team: 'RED',
        name: '敵軍コア',
        img: 'assets/cypher-urban-anime-v2.png',
        hp: 80, maxHp: 100,
        shield: 0,
        baseAtk: 0, atk: 0,
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: false },
          { main: 'ATK', sub: '', type: 'atk', used: false }
        ],
        passive: {
          tag: 'CORE',
          name: '敵軍中枢リアクター',
          desc: '敵軍の最重要目標。このコアのHPを 0 にすれば勝利となる。'
        }
      },

      // HAZARDS & TRAPS
      toxic_zone: {
        category: 'HAZARD',
        classLabel: 'ハザード',
        classCss: 'class-hazard',
        roleLabel: '☣️ 汚染領域',
        icon: '☣️',
        team: 'RED',
        name: 'トキシック・ゾーン',
        img: 'assets/toxin-urban-anime-v2.png',
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: false },
          { main: 'ATK', sub: '', type: 'atk', used: false }
        ],
        passive: {
          tag: 'HAZARD',
          name: '神経毒素フィールド',
          desc: 'このマスに侵入、またはターン終了時に滞在している敵ユニットに 10 ダメージを与える（トキシン自身は無効）。ゾーン内の敵に対するトキシンの通常攻撃ダメージが +10 増加する。'
        }
      },

      dim_zone: {
        category: 'HAZARD',
        classLabel: 'ハザード',
        classCss: 'class-hazard',
        roleLabel: '🌀 異次元領域',
        icon: '🌀',
        team: 'BLUE',
        name: 'ディメンション・ゾーン',
        img: 'assets/phase-urban-anime-v2.png',
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: false },
          { main: 'ATK', sub: '', type: 'atk', used: false }
        ],
        passive: {
          tag: 'HAZARD',
          name: 'シャドウ・アンカー',
          desc: '侵入した敵ユニットに【弱体化（被ダメージ1.5倍 / 1T）】を付与する。フェイズはスキル『テレポート』でこのマスへ距離無制限に帰還できる。'
        }
      },

      mine_trap: {
        category: 'TRAP',
        classLabel: 'トラップ',
        classCss: 'class-trap',
        roleLabel: '💣 ステルス地雷',
        icon: '💣',
        team: 'BLUE',
        name: 'マイン (地雷)',
        img: 'assets/nitro-urban-anime-v2.png',
        tokens: [
          { main: 'MOVE', sub: '', type: 'move', used: false },
          { main: 'ATK', sub: '', type: 'atk', used: false }
        ],
        passive: {
          tag: 'TRAP',
          name: '指向性クレイモア起爆',
          desc: '敵プレイヤーからは視認できない隠密トラップ。敵ユニットがこのマスに進入した瞬間に自動起爆し、20 ダメージを与えて消滅する。'
        }
      }
    };

    /* ==========================================================================
       7x7 BOARD PLACEMENT STATE
       Row 0 is Top (Row '7'), Row 6 is Bottom (Row '1')
       Col 0 is 'A', Col 6 is 'G'
       ========================================================================== */

      const INITIAL_PIECES = {
        // Enemy Row (Top)
        '0,3': 'enemy_core',
        '1,1': 'enemy_vector',
        '1,3': 'enemy_toxin',
        '1,5': 'enemy_glitch',

        // Mid / Frontline
        '3,1': 'phase',
        '4,2': 'barricade',
        '4,3': 'kinesis',
        '4,4': 'turret',

        // Ally Backline (Bottom)
        '5,2': 'iris',
        '5,5': 'hive',
        '6,3': 'ally_core'
      };
      const INITIAL_FLOORS = {
        '2,3': { key: 'toxic_zone', label: 'TOXIC', icon: '☣️' },
        '3,1': { key: 'dim_zone', label: 'DIM', icon: '🌀' },
        '3,4': { key: 'mine_trap', label: 'MINE', icon: '💣' }
      };

const clone = value => structuredClone(value);
function freshTokens(pieces) {
  const tokens = [{ main: 'MOVE', owner: null }, { main: 'ATK', owner: null }];
  if (Object.values(pieces).includes('kinesis')) tokens.push({ main: 'MOVE', owner: 'kinesis' });
  return tokens;
}
const state = {
  entities: clone(INITIAL_ENTITIES), pieces: clone(INITIAL_PIECES), floors: clone(INITIAL_FLOORS),
  selected: 'kinesis', mode: 'inspect', pending: null, turn: 3, busy: false,
  tokens: freshTokens(INITIAL_PIECES), ult: { ally: 100, enemy: 60 },
  message: '', inspectorTab: 'details', battleLog: [], logSequence: 0,
  reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
};
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = value => String(value || '').replace(/^[^A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]+/u, '');
const names = { move: '移動', attack: '攻撃', skill: 'スキル', ult: '必殺技', endturn: 'ターン終了', remove: '防壁の撤去' };
const paths = {
  move: '<path d="M3 12h17m-6-6 6 6-6 6"/>',
  attack: '<path d="m14 3 7 0 0 7-12 11-6-6Z"/><path d="m4 3 17 18M3 10l7-7M14 21l7-7"/>',
  skill: '<path d="m13 2-9 12h7l-1 8 10-13h-8Z"/>',
  ult: '<path d="m12 2 9 10-9 10L3 12Z"/><path d="m12 7 4 5-4 5-4-5Z"/>',
  shield: '<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5Z"/><path d="m8 11 3 3 5-6"/>',
  buff: '<path d="m5 13 7-8 7 8M5 20l7-8 7 8"/>',
  debuff: '<path d="m5 4 7 8 7-8M5 11l7 8 7-8"/>',
  support: '<path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5Z"/>',
  disrupt: '<circle cx="12" cy="12" r="6"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5M8 12h8M12 8v8"/>',
  object: '<path d="M3 4h18v16H3ZM3 10h18M3 15h18M9 4v6m6 0v5m-6 0v5"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  endturn: '<path d="m5 4 10 8L5 20ZM19 4v16"/>',
};
function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.skill}</svg>`; }
function roleIcon(ent) {
  if (ent.roleLabel.includes('コア')) return 'ult';
  if (ent.category !== 'UNIT') return 'object';
  if (ent.roleLabel.includes('サポート')) return 'support';
  if (ent.roleLabel.includes('タンク')) return 'shield';
  if (ent.roleLabel.includes('ディスラプター')) return 'disrupt';
  return 'skill';
}
function coord(rc) { const [r, c] = rc.split(',').map(Number); return `${'ABCDEFG'[c]}${7 - r}`; }
function position(key) { return Object.keys(state.pieces).find(rc => state.pieces[rc] === key) || Object.keys(state.floors).find(rc => state.floors[rc].key === key); }
function controllable(key = state.selected) { const e = state.entities[key]; return e?.category === 'UNIT' && e.team === 'BLUE' && Object.values(state.pieces).includes(key); }
function remaining(mode, ent = state.entities[state.selected]) {
  if (mode === 'skill' || mode === 'ult') return ent?.[mode]?.stock || 0;
  return state.tokens.filter(t => t.main === (mode === 'move' ? 'MOVE' : 'ATK') && (!t.owner || state.entities[t.owner] === ent)).length;
}
function targets(mode) {
  const origin = position(state.selected);
  if (!origin || !controllable() || !['move', 'attack'].includes(mode)) return [];
  const [r, c] = origin.split(',').map(Number), result = [];
  for (let y = Math.max(0, r - 1); y <= Math.min(6, r + 1); y++) for (let x = Math.max(0, c - 1); x <= Math.min(6, c + 1); x++) {
    const rc = `${y},${x}`, key = state.pieces[rc];
    if (rc === origin) continue;
    if (mode === 'move' && !key || mode === 'attack' && key && state.entities[key].team === 'RED') result.push(rc);
  }
  return result;
}
function unavailable(mode) {
  if (state.busy) return '実行中';
  if (!controllable()) return '味方を選択';
  if (!remaining(mode)) return '残数0';
  if (mode === 'ult' && state.ult.ally < 100) return 'ULT不足';
  if (['move', 'attack'].includes(mode) && !targets(mode).length) return '対象なし';
  return '';
}
function attackForecast(rc) {
  const target = state.entities[state.pieces[rc]], actor = state.entities[state.selected];
  const after = Math.max(10, target.hp - (actor.atk || 20));
  return { target, after, damage: target.hp - after };
}
function canExecute() {
  if (state.busy || !state.pending) return false;
  if (state.mode === 'endturn') return true;
  if (state.mode === 'remove') return state.selected === 'barricade' && !!position('barricade');
  if (unavailable(state.mode)) return false;
  return ['skill', 'ult'].includes(state.mode) || targets(state.mode).includes(state.pending);
}
function percent(e) { return Math.max(0, Math.min(100, e.hp / e.maxHp * 100)); }
function portrait(key, className = '') {
  const ent = state.entities[key];
  return `<img class="${className} ${ent.img.includes('-anime-') ? 'anime-art' : ''}" src="${esc(ent.img)}" alt="${esc(ent.name)}" draggable="false">`;
}
function renderHeader() {
  $('turn-number').textContent = String(state.turn).padStart(2, '0');
  for (const [side, key] of [['ally', 'ally_core'], ['enemy', 'enemy_core']]) {
    const e = state.entities[key];
    $(`${side}-core-hp`).textContent = `${e.hp}/${e.maxHp}`;
    $(`${side}-core-fill`).style.width = `${percent(e)}%`;
    $(`${side}-ult-value`).textContent = `${state.ult[side]}%`;
    $(`${side}-ult-fill`).style.width = `${state.ult[side]}%`;
  }
  $('reset-button').disabled = state.busy;
}
function renderTokens() {
  $('turn-tokens').innerHTML = state.tokens.length ? state.tokens.map(t => {
    const usable = controllable() && (!t.owner || t.owner === state.selected);
    const text = t.main === 'MOVE' ? '移動' : '攻撃';
    const ownerTag = t.owner ? `<small>${esc(state.entities[t.owner].name)}</small>` : '';
    return `<div class="turn-token ${t.owner ? 'special' : ''} ${usable ? '' : 'unusable'}">${icon(t.main === 'MOVE' ? 'move' : 'attack')}<span>${text}</span>${ownerTag}</div>`;
  }).join('') : '<span class="no-tokens">行動終了</span>';
}
function medal(key) {
  const e = state.entities[key], core = key.includes('core'), object = e.category === 'OBJECT';
  const atkVal = e.atk ? e.atk : '';
  return `<span class="piece ${e.team === 'RED' ? 'enemy' : ''} ${object ? 'structure' : ''}" data-entity="${key}">
    <span class="piece-face">${core ? icon('ult') : portrait(key)}</span><span class="piece-role">${icon(roleIcon(e))}</span>
    <span class="piece-status">${e.statuses?.some(s => s.type === 'debuff') ? icon('debuff') : e.atk > e.baseAtk ? icon('buff') : ''}</span>
    ${e.shield ? `<span class="piece-shield">${icon('shield')}${e.shield}</span>` : ''}
    <span class="piece-readout">
      <span class="piece-values"><b>${e.hp}</b>${atkVal !== '' ? `<span>${atkVal}</span>` : ''}</span>
      <span class="piece-name">${e.name}</span>
    </span>
  </span>`;
}
function renderBoard() {
  const validMove = ['inspect', 'move'].includes(state.mode) && !unavailable('move') ? targets('move') : [];
  const validAttack = state.mode === 'attack' && !unavailable('attack') ? targets('attack') : [];
  const selectedPos = position(state.selected);
  let html = '';
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    const rc = `${r},${c}`, key = state.pieces[rc], floor = state.floors[rc], selected = rc === selectedPos;
    const isMove = validMove.includes(rc), isAttack = validAttack.includes(rc);
    const validClass = isMove ? 'valid-move' : isAttack ? 'valid-attack' : '';
    const floorType = floor?.key === 'toxic_zone' ? 'toxic' : floor?.key === 'dim_zone' ? 'dimension' : 'mine';
    const description = [coord(rc), key ? state.entities[key].name : '空きマス', floor ? state.entities[floor.key].name : '', isMove ? '移動可能' : isAttack ? '攻撃可能' : ''].filter(Boolean).join('、');
    html += `<button class="tile ${r < 2 ? 'enemy-zone' : r > 4 ? 'ally-zone' : ''} ${selected ? 'selected' : ''} ${validClass} ${state.pending === rc ? 'pending' : ''}" data-action="cell" data-rc="${rc}" data-focus="cell-${rc}" aria-label="${esc(description)}" aria-pressed="${selected}" ${state.busy ? 'disabled' : ''}>
      ${floor ? `<span class="floor ${floorType}"><span>${icon(floorType === 'mine' ? 'attack' : 'disrupt')}${floor.label}</span></span>` : ''}
      ${key ? medal(key) : ''}${isMove ? `<span class="target-mark">${icon('move')}</span>` : isAttack ? `<span class="target-mark">${icon('attack')}</span>` : ''}</button>`;
  }
  $('board-grid').innerHTML = html;
}
function renderInspector() {
  const key = state.selected, e = state.entities[key], rc = position(key), floor = rc && state.floors[rc];
  $('inspector').dataset.team = e.team;
  $('inspector').dataset.art = e.img.includes('-anime-') ? 'anime' : 'original';
  $('inspector-hero').innerHTML = `${portrait(key, 'hero-art')}<span class="team-tag">${e.team === 'BLUE' ? 'ALLY' : 'ENEMY'}</span><div class="hero-name"><span>${esc(label(e.roleLabel))}</span><h2>${esc(e.name)}</h2></div>`;
  $('inspector-stats').innerHTML = e.hp !== undefined
    ? `<div><span>HP</span><strong>${e.hp}<small>/${e.maxHp}</small></strong><span class="mini-hp"><i style="width:${percent(e)}%"></i></span></div><div><span>ATK</span><strong>${e.atk}</strong></div>${e.shield ? `<span class="inspector-shield">${icon('shield')} SHIELD ${e.shield}</span>` : ''}`
    : `<div class="terrain-name">${icon('disrupt')} ${esc(e.passive?.desc || e.classLabel)}</div>`;
  const statuses = e.statuses || [];
  $('inspector-status').innerHTML = statuses.map(s => `<span class="status ${esc(s.type)}">${icon(s.type === 'buff' ? 'buff' : s.type === 'shield' ? 'shield' : 'debuff')}${esc(label(s.label))}</span>`).join('');
  $('inspector-terrain').innerHTML = floor && floor.key !== key ? `<span class="terrain-badge">${icon('disrupt')} ${esc(state.entities[floor.key].name)}</span>` : '';
  $('remove-button').hidden = key !== 'barricade';
  $('remove-button').disabled = state.busy;
}
function renderCommands() {
  const e = state.entities[state.selected];
  document.querySelector('.card-skills').hidden = !e.passive && !e.skill && !e.ult;
  const passEl = $('card-passive');
  if (passEl) {
    passEl.hidden = !e.passive;
    if (e.passive) {
      passEl.querySelector('.passive-name').textContent = e.passive.name || '';
      passEl.querySelector('.passive-desc').textContent = e.passive.desc || '';
    }
  }
  for (const mode of ['skill', 'ult']) {
    const button = $(`command-${mode}`), reason = unavailable(mode), active = state.mode === mode;
    button.hidden = !e[mode];
    button.disabled = !!reason && !active;
    button.setAttribute('aria-pressed', String(active));
    button.querySelector('.skill-name').textContent = e[mode]?.name || '';
    button.querySelector('.command-sub').textContent = e[mode]
      ? (active ? 'ACTIVE · 再押下で解除' : `×${remaining(mode)}${reason ? ` · ${reason}` : ''}`)
      : '';
    button.querySelector('.skill-description').textContent = e[mode]?.desc || '';
  }
  $('end-turn').disabled = state.busy;
  $('game-content').setAttribute('aria-busy', String(state.busy));
}
function render() {
  const focus = document.activeElement?.dataset.focus;
  renderHeader(); renderTokens(); renderBoard(); renderInspector(); renderCommands(); renderInspectorTabs();
  if (focus) document.querySelector(`[data-focus="${CSS.escape(focus)}"]`)?.focus({ preventScroll: true });
}
function setInspectorTab(tab) {
  if (!['details', 'log'].includes(tab)) return;
  state.inspectorTab = tab;
  renderInspectorTabs();
}
function renderInspectorTabs() {
  for (const tab of ['details', 'log']) {
    const active = state.inspectorTab === tab;
    $(`tab-${tab}`).setAttribute('aria-selected', String(active));
    $(`tab-${tab}`).tabIndex = active ? 0 : -1;
    $(`panel-${tab}`).hidden = !active;
  }
  $('battle-log-count').textContent = state.battleLog.length;
  const list = $('battle-log-list');
  const revision = `${state.logSequence}:${state.battleLog.length}`;
  if (list.dataset.revision === revision) return;
  list.dataset.revision = revision;
  list.innerHTML = state.battleLog.length ? [...state.battleLog].reverse().map(entry =>
    `<li class="battle-log-entry" data-kind="${esc(entry.kind)}"><div class="battle-log-meta"><span>TURN ${String(entry.turn).padStart(2, '0')}</span><strong>${esc(names[entry.kind])}</strong><small>#${String(entry.id).padStart(2, '0')}</small></div><p>${esc(entry.text)}</p></li>`
  ).join('') : '<li class="battle-log-empty">NO RECORDS<span>移動・攻撃・スキルなどの行動履歴がここに記録されます。</span></li>';
  if (state.inspectorTab === 'log') $('panel-log').scrollTop = 0;
}
function recordBattle(kind, text, turn = state.turn) {
  state.battleLog.push({ id: ++state.logSequence, turn, kind, text });
}
function select(key) {
  if (state.busy || !state.entities[key]) return;
  state.selected = key; state.mode = 'inspect'; state.pending = null; state.message = '';
  render();
}
function choose(mode) {
  if (state.mode === mode) { cancel(); return; }
  if (unavailable(mode)) return;
  state.mode = mode; state.pending = ['skill', 'ult'].includes(mode) ? 'self' : null;
  render();
}
function cancel() {
  if (state.busy) return;
  state.mode = 'inspect'; state.pending = null; state.message = ''; render();
}
function clickCell(rc) {
  if (state.busy) return;
  const key = state.pieces[rc], floor = state.floors[rc];
  if (key) {
    if (state.selected === key) cancel();
    else select(key);
  } else if (floor) {
    select(floor.key);
  } else {
    cancel();
  }
}
let executionTimer = null;
function consumeToken(mode) {
  const main = mode === 'move' ? 'MOVE' : 'ATK';
  let index = state.tokens.findIndex(t => t.main === main && t.owner === state.selected);
  if (index < 0) index = state.tokens.findIndex(t => t.main === main && !t.owner);
  if (index >= 0) state.tokens.splice(index, 1);
}
function finishExecution() {
  clearTimeout(executionTimer); executionTimer = null;
  state.busy = false; state.mode = 'inspect'; state.pending = null; render();
  $('live-announcement').textContent = state.message;
  document.querySelector(`[data-rc="${position(state.selected)}"]`)?.focus({ preventScroll: true });
}
function execute() {
  if (!canExecute()) return;
  const mode = state.mode, key = state.selected, rc = state.pending, e = state.entities[key];
  state.busy = true; let animationKey = key;
  if (mode === 'move') { const origin = position(key); delete state.pieces[origin]; state.pieces[rc] = key; consumeToken(mode); state.message = `${e.name}が${coord(rc)}へ移動`; recordBattle(mode, `${e.name}：${coord(origin)} → ${coord(rc)}`); }
  if (mode === 'attack') { const f = attackForecast(rc), before = f.target.hp; f.target.hp = f.after; state.ult.ally = Math.min(100, state.ult.ally + f.damage); animationKey = state.pieces[rc]; consumeToken(mode); state.message = `${f.target.name}に${f.damage}ダメージ`; recordBattle(mode, `${e.name} → ${f.target.name}：${f.damage}ダメージ（HP ${before} → ${f.after}）`); }
  if (mode === 'skill' || mode === 'ult') { e[mode].stock--; state.message = `${e[mode].name}`; recordBattle(mode, `${e.name}が「${e[mode].name}」を使用（残り${e[mode].stock}回）`); }
  if (mode === 'ult') state.ult.ally = 0;
  if (mode === 'remove') { const origin = position('barricade'); delete state.pieces[origin]; state.selected = 'kinesis'; state.message = '防壁を撤去'; recordBattle(mode, `${coord(origin)}の防壁を撤去`); }
  if (mode === 'endturn') { const previousTurn = state.turn; state.turn++; state.tokens = freshTokens(state.pieces); state.message = `TURN ${String(state.turn).padStart(2, '0')}`; recordBattle(mode, `TURN ${String(previousTurn).padStart(2, '0')} 終了 → TURN ${String(state.turn).padStart(2, '0')} 開始`, previousTurn); }
  state.mode = 'inspect'; state.pending = null; render();
  const piece = document.querySelector(`[data-entity="${animationKey}"]`);
  if (piece && !state.reduceMotion) piece.animate(mode === 'attack' ? [{ filter: 'brightness(2)', transform: 'translateX(-4px)' }, { filter: 'none', transform: 'translateX(0)' }] : [{ transform: 'translateY(-9px)', opacity: 0.6 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 280, easing: 'ease-out' });
  if (mode === 'endturn' && !state.reduceMotion) $('turn-number').animate([{ transform: 'scale(1.35)', color: '#ffffff' }, { transform: 'scale(1)', color: '#0d0f12' }], { duration: 350 });
  executionTimer = setTimeout(finishExecution, state.reduceMotion ? 80 : 260);
}
function resetBattle() {
  clearTimeout(executionTimer);
  state.battleLog = []; state.logSequence = 0;
  Object.assign(state, { entities: clone(INITIAL_ENTITIES), pieces: clone(INITIAL_PIECES), floors: clone(INITIAL_FLOORS), tokens: freshTokens(INITIAL_PIECES), ult: { ally: 100, enemy: 60 }, selected: 'kinesis', mode: 'inspect', pending: null, turn: 3, busy: false, message: '' });
  render();
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  if (button.dataset.action === 'cell' && suppressDragClick) { event.preventDefault(); suppressDragClick = false; return; }
  const action = button.dataset.action;
  if (action === 'inspector-tab') { setInspectorTab(button.dataset.tab); return; }
  if (state.busy) return;
  if (action === 'select') select(button.dataset.key);
  if (action === 'cell') clickCell(button.dataset.rc);
  if (action === 'command') choose(button.dataset.mode);
  if (action === 'cancel') cancel();
  if (action === 'remove') { state.mode = 'remove'; state.pending = 'remove'; execute(); }
  if (action === 'reset') resetBattle();
});
document.addEventListener('keydown', event => {
  const tab = event.target.closest('[role="tab"]');
  if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const next = event.key === 'Home' ? 'details' : event.key === 'End' ? 'log' : tab.dataset.tab === 'details' ? 'log' : 'details';
    setInspectorTab(next); $(`tab-${next}`).focus(); return;
  }
  if (state.busy) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.key === 'Escape') { event.preventDefault(); cancelTurnHold(); cancel(); return; }
  if (['3', '4'].includes(event.key)) { event.preventDefault(); choose(['skill', 'ult'][Number(event.key) - 3]); }
  const rc = document.activeElement?.dataset.rc;
  if (rc && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault(); let [r, c] = rc.split(',').map(Number); r += event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0; c += event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    document.querySelector(`[data-rc="${Math.max(0, Math.min(6, r))},${Math.max(0, Math.min(6, c))}"]`)?.focus({ preventScroll: true });
  }
});
function fitScreen() { const viewport = $('game-viewport'); $('game-screen').style.setProperty('--scale', Math.min(viewport.clientWidth / 1600, viewport.clientHeight / 900)); }
const turnButton = $('end-turn');
let turnHold = null;
function cancelTurnHold() {
  if (!turnHold) return;
  cancelAnimationFrame(turnHold.frame); turnHold = null;
  turnButton.querySelector('.hold-fill').style.transform = 'scaleX(0)';
}
function startTurnHold(pointerId = null) {
  if (turnHold || state.busy) return;
  const hold = { started: performance.now(), pointerId, frame: 0 }; turnHold = hold;
  function step(now) {
    if (turnHold !== hold) return;
    const progress = Math.min(1, (now - hold.started) / 400);
    turnButton.querySelector('.hold-fill').style.transform = `scaleX(${progress})`;
    if (progress >= 1) {
      cancelTurnHold(); state.mode = 'endturn'; state.pending = 'next'; execute(); return;
    }
    hold.frame = requestAnimationFrame(step);
  }
  hold.frame = requestAnimationFrame(step);
}
turnButton.addEventListener('pointerdown', event => {
  if (event.button !== 0 || turnButton.disabled) return;
  event.preventDefault(); turnButton.setPointerCapture(event.pointerId); startTurnHold(event.pointerId);
});
turnButton.addEventListener('pointermove', event => {
  if (!turnHold || turnHold.pointerId !== event.pointerId) return;
  const r = turnButton.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) cancelTurnHold();
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) turnButton.addEventListener(name, cancelTurnHold);
turnButton.addEventListener('keydown', event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); startTurnHold(); } });
turnButton.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); cancelTurnHold(); } });
turnButton.addEventListener('blur', cancelTurnHold);
window.addEventListener('blur', cancelTurnHold);
let drag = null, suppressDragClick = false;
document.addEventListener('pointerdown', event => {
  if (state.busy || event.button !== 0) return;
  const tile = event.target.closest('.tile');
  const key = tile && state.pieces[tile.dataset.rc];
  if (!key || !controllable(key)) return;
  drag = { pointer: event.pointerId, key, startX: event.clientX, startY: event.clientY, started: false, ghost: null };
});
document.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointer) return;
  if (!drag.started && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) {
    drag.started = true; select(drag.key);
    const source = document.querySelector(`[data-entity="${drag.key}"]`);
    if (source) { drag.ghost = source.cloneNode(true); drag.ghost.classList.add('drag-ghost'); $('game-screen').appendChild(drag.ghost); }
    if (!unavailable('move')) targets('move').forEach(rc => document.querySelector(`[data-rc="${rc}"]`)?.classList.add('valid-move'));
    if (!unavailable('attack')) targets('attack').forEach(rc => document.querySelector(`[data-rc="${rc}"]`)?.classList.add('valid-attack'));
  }
  if (!drag.started) return;
  event.preventDefault();
  const screen = $('game-screen').getBoundingClientRect(), scale = screen.width / 1600;
  if (drag.ghost) { drag.ghost.style.left = `${(event.clientX - screen.left) / scale}px`; drag.ghost.style.top = `${(event.clientY - screen.top) / scale}px`; }
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  const tile = document.elementFromPoint(event.clientX, event.clientY)?.closest('.tile');
  if (tile && (tile.classList.contains('valid-move') || tile.classList.contains('valid-attack'))) tile.classList.add('drag-over');
}, { passive: false });
function endDrag(event, cancelled = false) {
  if (!drag || event.pointerId !== drag.pointer) return;
  const current = drag; drag = null;
  if (!current.started) return;
  current.ghost?.remove();
  const tile = !cancelled && document.elementFromPoint(event.clientX, event.clientY)?.closest('.tile');
  const rc = tile?.dataset.rc, mode = rc && state.pieces[rc] ? 'attack' : 'move';
  suppressDragClick = true; setTimeout(() => { suppressDragClick = false }, 0);
  if (rc && !unavailable(mode) && targets(mode).includes(rc)) { choose(mode); state.pending = rc; execute(); }
  else { state.mode = 'inspect'; state.pending = null; state.message = ''; render(); }
}
document.addEventListener('pointerup', event => endDrag(event));
document.addEventListener('pointercancel', event => endDrag(event, true));
new ResizeObserver(fitScreen).observe($('game-viewport')); window.addEventListener('resize', fitScreen); window.visualViewport?.addEventListener('resize', fitScreen);
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
fitScreen(); render();
