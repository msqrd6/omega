const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PATHS = {
  move: '<path d="M3 12h17m-6-6 6 6-6 6"/>',
  attack: '<path d="M6.5 13.5 14.5 5.5 20.5 3.5 18.5 9.5 10.5 17.5 Z"/><path d="M5 12 12 19M8.5 15.5 4 20M3.5 18.5 5.5 20.5"/>',
  skill: '<path d="M11 3 13.4 10.1 20.5 12.5 13.4 14.9 11 22 8.6 14.9 1.5 12.5 8.6 10.1 Z"/><path d="M19 2.5v5M16.5 5h5"/>',
  heal: '<path d="M12 5v14M5 12h14"/>',
  ult: '<path d="m12 2 9 10-9 10L3 12Z"/><path d="m12 7 4 5-4 5-4-5Z"/>',
  shield: '<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5Z"/><path d="m8 11 3 3 5-6"/>',
  buff: '<path d="m5 13 7-8 7 8M5 20l7-8 7 8"/>',
  debuff: '<path d="m5 4 7 8 7-8M5 11l7 8 7-8"/>',
  support: '<path d="M8.5 3h7v5.5H21v7h-5.5V21h-7v-5.5H3v-7h5.5Z"/>',
  disruptor: '<circle cx="12" cy="12" r="5.5"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  assault: '<path d="m13 2-9 12h7l-1 8 10-13h-8Z"/>',
  sentinel: '<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5Z"/>',
  core: '<path d="m12 2 9 10-9 10L3 12Z"/><path d="m12 7 4 5-4 5-4-5Z"/>',
  turret: '<path d="M12 3v4M6 11h12l-1.5-4h-9ZM4 20h16M7 20l1.5-9h7L17 20"/><circle cx="12" cy="14" r="1.5"/>',
  object: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v6m6 0v10M3 15h18"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.8 2.1c-.9.6-1.3 1.1-1.3 2.4m0 3.5h.01"/>',
  endturn: '<path d="m5 4 10 8L5 20ZM19 4v16"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  st_shield: '<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5Z"/>',
  st_atk: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  st_debuff: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  st_zone: '<polygon points="12 3 21 9 12 15 3 9"/><polyline points="3 14 12 20 21 14"/>',
  hz_toxic: '<path d="M12 2.5 21 12l-9 9.5L3 12Z"/><path d="M12 7.5c-1.8 2.5-3.2 4.2-3.2 6a3.2 3.2 0 0 0 6.4 0c0-1.8-1.4-3.5-3.2-6Z"/>',
  hz_dimension: '<path d="M12 2 22 12 12 22 2 12Z"/><path d="M12 6.5 17.5 12 12 17.5 6.5 12Z"/><circle cx="12" cy="12" r="1.5"/>',
  hz_mine: '<circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3m0 13v3M2.5 12h3m13 0h3M5.3 5.3l2.1 2.1m9.2 9.2 2.1 2.1M18.7 5.3l-2.1 2.1m-9.2 9.2-2.1 2.1"/>'
};

const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.skill}</svg>`;
const svgIcon = (name, cls = 'svg-ic', sw = '2.4') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.assault}</svg>`;

const ROLE_ICONS = { ASSAULT: 'assault', SENTINEL: 'sentinel', DISRUPTOR: 'disruptor', SUPPORT: 'support', CORE: 'core', OBJECT: 'object' };

const DEFS = {
  KINESIS: {
    name: 'キネシス', role: 'ASSAULT', roleName: 'アサルト', maxHp: 95, atk: 25, slug: 'kinesis',
    passive: { name: 'ライトニング・ステップ', desc: '毎自軍ターン開始時、ストライド専用の【追加移動トークン (+1 MOVE)】を獲得（チームの移動枠を消費せず移動可能）。' },
    skills: {
      A: { name: 'オーバードライブ', maxStock: 2, desc: '自身に【攻撃力増強 (+5 / このターン中)】を付与する（通常ATK 25 ➔ 30）。' },
      ULT: { name: 'ライトニング・ラッシュ', desc: '自身にストライド専用の【追加攻撃トークン (+1 ATTACK)】を即座に 1枚 付与する！' }
    }
  },
  PHASE: {
    name: 'フェイズ', role: 'ASSAULT', roleName: 'アサルト', maxHp: 80, atk: 30, slug: 'phase',
    passive: { name: 'シャドウ・オリジン', desc: 'バトル開始時、初期配置マスに「ディメンション・ゾーン」を展開する。' },
    skills: {
      A: { name: 'テレポート', maxStock: 2, desc: '自軍ディメンション・ゾーンへ瞬時に帰還する！' },
      ULT: { name: 'シャドウ・ドレイン', desc: 'このターン敵へ与えたダメージ分、自身のHPを吸収回復する。' }
    }
  },
  NITRO: {
    name: 'ニトロ', role: 'ASSAULT', roleName: 'アサルト', maxHp: 110, atk: 20, slug: 'nitro',
    passive: { name: 'カウンター・デトネーション', desc: '自身が敵ユニットに攻撃された時、攻撃者に 10 ダメージの爆破反撃！' },
    skills: {
      A: { name: 'マイン・プラント', maxStock: 2, desc: '周囲マスに視認不可の 20 DMG マイン（地雷）を設置する。' },
      ULT: { name: 'マキシマム・エクスプロージョン', desc: '半径2マス全域の敵へ 20 DMG の大爆破！' }
    }
  },
  VECTOR: {
    name: 'ベクター', role: 'SENTINEL', roleName: 'センチネル', maxHp: 100, atk: 15, slug: 'vector',
    passive: { name: 'バンカー・スナイパー', desc: 'オブジェクト（防壁・タレット）またはコアに隣接時、自身に攻撃力増強 (+10) を常時付与（ATK 15 ➔ 25）。' },
    skills: {
      A: { name: 'フォース・バリケード', maxStock: 3, desc: '半径2マス以内の指定空きマスに「バリケード（オブジェクト / HP 30）」を設置する。' },
      ULT: { name: 'バリケード・バッファー', desc: '『フォース・バリケード』のストックを全回復（最大3回まで再装填）する！' }
    }
  },
  VULCAN: {
    name: 'ヴァルカン', role: 'SENTINEL', roleName: 'センチネル', maxHp: 100, atk: 15, slug: 'vulcan',
    passive: { name: 'クロスファイア・リンク', desc: '設置タレット破壊時ストック+1回復。ストック存在時は自身の攻撃力増強 (+10 / ATK 15 ➔ 25)。' },
    skills: {
      A: { name: 'セントリー・タレット', maxStock: 1, desc: '半径2マス以内の空きマスに「自動タレット（HP 20, ATK 10）」を1基設置する。' },
      ULT: { name: 'フォートレス・プロトコル', desc: 'セントリー・タレット中心の半径2マスへ空爆要請し、敵に 25 DMG を与える！' }
    }
  },
  TOXIN: {
    name: 'トキシン', role: 'SENTINEL', roleName: 'センチネル', maxHp: 100, atk: 15, slug: 'toxin',
    passive: { name: 'トキシック・インフェクション', desc: '自身は毒ハザード無効。「トキシック・ゾーン」内の敵ユニットへの通常攻撃が +10 DMG（15➔25）に大幅強化。' },
    skills: {
      A: { name: 'トキシック・カーテン', maxStock: 2, desc: '自身から左右いずれかの直線方向へ3マスのトキシック・ゾーンを展開。' },
      ULT: { name: 'バイオハザード', desc: '自身の足元および周囲8マス（計9マス）にトキシック・ゾーンを一斉展開！' }
    }
  },
  GLITCH: {
    name: 'グリッチ', role: 'DISRUPTOR', roleName: 'ディスラプター', maxHp: 90, atk: 15, slug: 'glitch',
    passive: { name: 'ディメンション・チャージ', desc: 'ワープ移動時、ワープ先のマスから周囲8マスの敵へ【弱体化】を付与。' },
    skills: {
      A: { name: 'グラビティ・ワープ', maxStock: 2, desc: '盤面上の指定空きマスへワープする。' },
      ULT: { name: '緊急回避', desc: '盤面上の任意の空きマスを選択して完全脱出ワープを行う！' }
    }
  },
  CYPHER: {
    name: 'サイファー', role: 'DISRUPTOR', roleName: 'ディスラプター', maxHp: 95, atk: 20, slug: 'cypher',
    passive: { name: 'ホライゾン・シフト', desc: '周囲8マス移動に加え、左右の横一直線方向へ障害物に衝突するまでスライド移動可能。' },
    skills: {
      A: { name: 'シグナル・ジャミング', maxStock: 2, desc: '前方直線の初弾ユニットに干渉。味方ならATK +15、敵なら【攻撃阻害 (1T)】を付与！' },
      ULT: { name: 'フルスペクトラム・ブラックアウト', desc: 'すべての敵ユニットに【行動阻害 (1T)】と【攻撃阻害 (1T)】を一斉付与！' }
    }
  },
  HIVE: {
    name: 'ハイヴ', role: 'DISRUPTOR', roleName: 'ディスラプター', maxHp: 90, atk: 15, slug: 'hive',
    passive: { name: 'ニューロ・カウンター', desc: '召喚ビットを破壊した敵ユニットに【弱体化 (2T)】および【スキル阻害 (2T)】を付与する。' },
    skills: {
      A: { name: 'ビット・デプロイ', maxStock: 3, desc: '味方アサルト周囲の空きマスに自律戦闘子機「ビット」を1体召喚する。' },
      ULT: { name: 'スウォーム・オーバードライブ', desc: '召喚中の全ビットに【シールド増強 (+30)】と【攻撃力増強 (+10)】を一斉付与！' }
    }
  },
  IRIS: {
    name: 'アイリス', role: 'SUPPORT', roleName: 'サポート', maxHp: 90, atk: 14, slug: 'iris',
    passive: { name: 'ナノ・エンハンスメント', desc: '毎自軍ターン終了時、前方一直線上で最も近い負傷した味方ユニット1体のHPを 5 自動回復。' },
    skills: {
      A: { name: 'ライフ・リペア', maxStock: 2, desc: '半径3マス以内の味方ユニット1体を指定し、HPを 30 大回復する。' },
      ULT: { name: 'オーバーチャージ・オーラ', desc: '自軍の全ユニットおよび防衛コアに【シールド増強 (+15 / 2T)】を一斉付与！' }
    }
  },
  NEXUS: {
    name: 'ネクサス', role: 'SUPPORT', roleName: 'サポート', maxHp: 90, atk: 14, slug: 'nexus',
    passive: { name: 'システム・オーバーライド', desc: '盤面に生存中、毎自軍ターン終了時にチームULTゲージが直接 +10% チャージされる。' },
    skills: {
      A: { name: 'リモート・ハック', maxStock: 3, desc: '任意の自軍ユニット1体のHPを 15 回復し、すべての状態異常（デバフ）を解除する。' },
      ULT: { name: 'EMP', desc: '指定マス半径2マス以内の敵設置物・罠・ハザードを完全消滅し、範囲内の味方を 10 回復！' }
    }
  },
  AURA: {
    name: 'オーラ', role: 'SUPPORT', roleName: 'サポート', maxHp: 90, atk: 18, slug: 'aura',
    passive: { name: 'バイタル・オーラ', desc: '毎自軍ターン終了時、半径1マス内で最もHPの少ない味方1体のHPを 5 回復する。' },
    skills: {
      A: { name: 'サンクチュアリ', maxStock: 2, desc: '自身の半径1マス範囲にいる味方ユニットすべてのHPを 20 回復する。' },
      ULT: { name: 'レスキュー・ワープ', desc: '任意の自軍ユニット周囲へ即座にワープし、サンクチュアリを発動する！' }
    }
  },
  CORE: {
    name: '防衛コア', role: 'CORE', roleName: 'コア', maxHp: 100, atk: 0,
    desc: '自軍の最重要防衛目標。移動・攻撃は不可。破壊されると即座に敗北！シールド付与可能。'
  },
  TURRET: {
    name: '自動タレット', role: 'OBJECT', roleName: 'オブジェクト', maxHp: 20, atk: 10,
    desc: 'ヴァルカンが設置した自動砲台。自軍ターン終了時に周囲8マスのすべての敵へ 10 ダメージを自動射撃！'
  },
  BARRICADE: {
    name: '防壁', role: 'OBJECT', roleName: 'オブジェクト', maxHp: 30, atk: 0,
    desc: 'ウォーデンが設置した防護壁。移動・攻撃は不可。敵味方ともに通行不能。自軍ターン中に任意破壊可能。'
  }
};

const ULT_FX_META = {
  KINESIS: { color: '#d8ff00', color2: '#66fff2', codename: 'KINESIS // OVERDRIVE', sub: 'EXTRA ATTACK TOKEN +1 GRANTED', mode: 'self', pop: '+1 ATTACK', isDmg: false },
  PHASE:   { color: '#b366ff', color2: '#f2b8ff', codename: 'PHASE // VOID DRAIN', sub: 'SHADOW DRAIN PROTOCOL ACTIVE', mode: 'self', pop: 'SHADOW DRAIN', isDmg: false },
  NITRO:   { color: '#ff5a26', color2: '#ffd447', codename: 'NITRO // IGNITION', sub: 'RADIUS-2 BLAST // 20 DMG', mode: 'aoe2', pop: '-20 DMG', isDmg: true },
  VECTOR:  { color: '#00e5ff', color2: '#c8ff80', codename: 'VECTOR // RELOAD', sub: 'FORCE BARRICADE STOCK FULL', mode: 'self', pop: 'STOCK MAX', isDmg: false },
  TOXIN:   { color: '#2ee59d', color2: '#c4ff4d', codename: 'TOXIN // BIOHAZARD', sub: '3x3 TOXIC HAZARD DEPLOYED', mode: 'around', pop: 'TOXIC ZONE', isDmg: false },
  GLITCH:  { color: '#ff3ec8', color2: '#8d7bff', codename: 'GLITCH // OVERRIDE', sub: 'BUFF PURGE & ACTION DISRUPT', mode: 'enemy', pop: 'DISRUPT!', isDmg: true },
  IRIS:    { color: '#38f6b4', color2: '#ffe169', codename: 'IRIS // AURA SYNC', sub: 'ALL ALLIES SHIELD +15 GRANTED', mode: 'allies', pop: '+15 SHIELD', isDmg: false, isShield: true }
};

const SKILL_FX_META = {
  KINESIS: { color: '#d8ff00', color2: '#b8ff99', pop: 'ATK +5', selfCast: true },
  PHASE:   { color: '#b366ff', color2: '#ecc4ff', pop: 'TELEPORT', selfCast: true },
  NITRO:   { color: '#ff7b24', color2: '#ffe07d', pop: 'MINE SET', selfCast: false },
  VECTOR:  { color: '#00e5ff', color2: '#b8f8ff', pop: 'BARRICADE', selfCast: false },
  TOXIN:   { color: '#2ee59d', color2: '#b9ffe0', pop: 'TOXIC x3', selfCast: false },
  GLITCH:  { color: '#ff3ec8', color2: '#c9b8ff', pop: 'WARP!', selfCast: false },
  IRIS:    { color: '#2ee59d', color2: '#b9ffe4', pop: '+30 HP', isHeal: true }
};

const MONO_UNITS = {
  KINESIS:   { name: 'ストライド', en: 'STRIDE', code: 'UNIT-01 // SINGULAR', role: 'アサルト',     trait: '体質覚醒', quote: '「ラプス内の速度なら、誰にも負けねえよ。いつでも出撃できるぜ、オブザーバー。」' },
  PHASE:     { name: 'ヴェイル',   en: 'VEIL',   code: 'UNIT-02 // SINGULAR', role: 'アサルト',     trait: '体質覚醒', quote: '「……向こうの世界線にも、同じ影が立っているはずだ。観測を続けよう。」' },
  NITRO:     { name: 'スパーク',   en: 'SPARK',  code: 'UNIT-03 // SINGULAR', role: 'アサルト',     trait: '専用ギア', quote: '「白黒の区画なんて退屈だろ？派手に火花を散らしてこじ開けてやるよ！」' },
  VECTOR:    { name: 'ウォーデン', en: 'WARDEN', code: 'UNIT-04 // SINGULAR', role: 'センチネル',   trait: '専用ギア', quote: '「どんな異常領域でも、アンカーと仲間は俺が守り抜く。展開準備はできている。」' },
  VULCAN:    { name: 'ヴァルカン', en: 'VULCAN', code: 'UNIT-05 // SINGULAR', role: 'センチネル',   trait: '専用ギア', quote: '「うちのタレット共の照準はバッチリさ。あんたは後ろで指揮に集中しな。」' },
  TOXIN:     { name: 'スモッグ',   en: 'SMOG',   code: 'UNIT-06 // SINGULAR', role: 'センチネル',   trait: '専用ギア', quote: '「報酬に見合う仕事だ。境界線が毒で染まっても、俺のせいじゃないぜ。」' },
  GLITCH:    { name: 'グリッチ', en: 'GLITCH', code: 'UNIT-07 // SINGULAR', role: 'ディスラプター', trait: '体質覚醒', quote: '「座標バグらせて跳ぶの、案外クセになるんだよね〜。準備できたら呼んで？」' },
  CYPHER:    { name: 'ジャム',     en: 'JAM',    code: 'UNIT-08 // SINGULAR', role: 'ディスラプター', trait: '専用ギア', quote: '「ノイズの波長がズレてきたな……。次の干渉、そろそろ始まるぞ。」' },
  HIVE:      { name: 'ハイヴ',   en: 'HIVE',   code: 'UNIT-09 // SINGULAR', role: 'ディスラプター', trait: '専用ギア', quote: '「群制御AIの同期率は99.8%。盤面はまるごとシミュレーション通りですよ。」' },
  IRIS:      { name: 'リリィ',     en: 'LILY',   code: 'UNIT-10 // SINGULAR', role: 'サポート',     trait: '専用ギア', quote: '「無茶をして怪我をしたらすぐ戻ってくださいね。ナノ医療パックは満タンです。」' },
  NEXUS:     { name: 'ネクサス', en: 'NEXUS',  code: 'UNIT-11 // SINGULAR', role: 'サポート',     trait: '専用ギア', quote: '「……あー、アンカーとの並列接続は通ってる。あんたの指示待ちなんだけど。」' },
  AURA:      { name: 'ヘイロー', en: 'HALO',   code: 'UNIT-12 // SINGULAR', role: 'サポート',     trait: '体質覚醒', quote: '「少しだけ深呼吸しましょう。……大丈夫、あなたの声は現場まで届いています。」' },
  CORE:      { name: 'アンカー',   en: 'ANCHOR', code: 'OBJECTIVE // REALITY LOCK', role: 'アンカー' },
  TURRET:    { name: 'セントリー', en: 'SENTRY', code: 'DEPLOYABLE // VULCAN', role: 'オブジェクト' },
  BARRICADE: { name: 'ブルワーク', en: 'BULWARK', code: 'DEPLOYABLE // WARDEN', role: 'オブジェクト' }
};

const SELECTABLE_HERO_KEYS = [
  'KINESIS', 'PHASE', 'NITRO',
  'VECTOR', 'VULCAN', 'TOXIN',
  'GLITCH', 'CYPHER', 'HIVE',
  'IRIS', 'NEXUS', 'AURA'
];

const MONO_LOGS = [
  { turn: '03', kind: 'ult',    tag: 'OVERWRITE', html: 'リリィ が広域防護プロトコルを起動！全味方とアンカーに <b class="buff">SHIELD +15</b>' },
  { turn: '03', kind: 'attack', tag: 'COMBAT',    html: 'ストライド → 鏡像 ヴェイル へ攻撃 <b class="dmg">30 DMG</b>（アンカー蓄積 +30）' },
  { turn: '03', kind: 'skill',  tag: 'PROTOCOL',  html: 'ストライド が加速プロトコル発動（<b class="buff">ATK 25 ➔ 30</b>）' },
  { turn: '03', kind: 'move',   tag: 'SYNC',      html: 'ストライド が D2 → D4 へ機動（固有帯域を消費）' },
  { turn: '02', kind: 'system', tag: 'LAPSE',     html: 'OBSERVATION TURN 03 開始（指令帯域：MOVE 1 / ATK 1 同期完了）' },
  { turn: '02', kind: 'attack', tag: 'MIRROR',    html: '鏡像 ヴェイル が位相転移 → スパーク に <b class="dmg">30 DMG</b>' },
  { turn: '02', kind: 'skill',  tag: 'PROTOCOL',  html: 'リリィ が スパーク へナノ修復照射（<b class="heal">HP +30 回復</b>）' },
  { turn: '02', kind: 'skill',  tag: 'PROTOCOL',  html: 'ウォーデン が E3 に量子防火壁を展開' },
  { turn: '01', kind: 'attack', tag: 'COMBAT',    html: '鏡像 スモッグ → ウォーデン に <b class="dmg">15 DMG</b>' },
  { turn: '01', kind: 'move',   tag: 'SYNC',      html: 'グリッチ が D3 へノイズ跳躍（周囲へ <b class="dmg">位相弱体化</b> 付与）' },
  { turn: '01', kind: 'system', tag: 'MONOLITH',  html: 'LAPSE-07 隔離完了 // アンカー 展開・観測開始' }
];

const mockState = {
  screen: 'battle',   // home | select | battle
  lobbyUnit: 'KINESIS',
  homeMatchMode: 'SOLO',
  squadKeys: ['KINESIS', 'NITRO', 'VECTOR', 'GLITCH', 'IRIS'],
  selectFocusKey: 'KINESIS',
  selectRoleFilter: 'ALL',
  phase: 'BLUE',      // BLUE | RED | DEPLOY
  bstate: 'rich',     // rich | normal | skill | ult
  usedTokens: { atk: false, move: false, ex: false },
  viewScale: 'fit',   // fit | full
  selectedPos: { r: 3, c: 3 },
  selectedHazardPos: null,
  commandMode: null,
  logFilter: 'ALL'
};

const getDisplayName = (typeKey, def) => MONO_UNITS[typeKey]?.name || def.name;
const getDisplayCode = (typeKey) => MONO_UNITS[typeKey]?.code || typeKey;
const getDisplayRole = (typeKey, def) => MONO_UNITS[typeKey]?.role || def.roleName;
const portraitPath = (slug) => `../assets/${slug}-urban-anime-v2.png`;

function buildScenario() {
  const rich = mockState.bstate !== 'normal';
  const board = Array.from({ length: 7 }, () => Array(7).fill(null));
  const hazards = {};

  board[0][1] = { typeKey: 'TOXIN', owner: 'P2', hp: rich ? 85 : 100, atk: 15, stockA: 1, ultUsed: false, buffs: {}, debuffs: rich ? { vulnerable: { turns: 1 } } : {} };
  board[0][2] = { typeKey: 'VECTOR', owner: 'P2', hp: 100, atk: 25, stockA: 2, ultUsed: false, buffs: {}, debuffs: {} };
  board[0][3] = { typeKey: 'CORE', owner: 'P2', hp: rich ? 80 : 100, atk: 0, buffs: rich ? { shield: { val: 15, turns: 2 } } : {}, debuffs: {} };
  board[0][4] = { typeKey: 'GLITCH', owner: 'P2', hp: 90, atk: 15, stockA: 2, ultUsed: false, buffs: {}, debuffs: {} };
  board[0][5] = { typeKey: 'IRIS', owner: 'P2', hp: 90, atk: 14, stockA: 2, ultUsed: false, buffs: {}, debuffs: {} };

  if (rich) {
    board[1][3] = { typeKey: 'PHASE', owner: 'P2', hp: 60, atk: 30, stockA: 1, ultUsed: false, buffs: {}, debuffs: {} };
    board[2][3] = { typeKey: 'NITRO', owner: 'P2', hp: 90, atk: 20, stockA: 2, ultUsed: false, buffs: {}, debuffs: {} };
    board[2][2] = { typeKey: 'TURRET', owner: 'P1', hp: 20, atk: 10, buffs: {}, debuffs: {} };
    board[3][1] = { typeKey: 'BARRICADE', owner: 'P1', hp: 30, atk: 0, buffs: {}, debuffs: {} };
    board[3][3] = {
      typeKey: 'KINESIS', owner: 'P1', hp: 75, atk: 30, stockA: 1, ultUsed: false,
      buffs: { shield: { val: 15, turns: 2 }, atk_up: { val: 5, turns: 1 } },
      debuffs: { vulnerable: { turns: 1 } }
    };
    hazards['3,3'] = {
      type: 'dimension', name: 'ディメンション・ゾーン', owner: 'P1',
      category: 'ゾーン', impact: '被ダメ 1.5倍 (弱体化)', setter: 'フェイズ',
      desc: '進入・滞在ユニットに【弱体化 (被ダメ1.5倍)】を付与。フェイズのテレポート着地点となる。'
    };
    hazards['4,5'] = {
      type: 'dimension', name: 'ディメンション・ゾーン', owner: 'P1',
      category: 'ゾーン', impact: '被ダメ 1.5倍 (弱体化)', setter: 'フェイズ',
      desc: '進入・滞在ユニットに【弱体化 (被ダメ1.5倍)】を付与。フェイズのテレポート着地点となる。'
    };
    hazards['2,5'] = {
      type: 'dimension', name: 'ディメンション・ゾーン', owner: 'P2',
      category: 'ゾーン', impact: '被ダメ 1.5倍 (弱体化)', setter: 'フェイズ',
      desc: '進入・滞在ユニットに【弱体化 (被ダメ1.5倍)】を付与。フェイズのテレポート着地点となる。'
    };
    hazards['2,1'] = {
      type: 'toxic', name: 'トキシック・ゾーン', owner: 'P1',
      category: 'ゾーン', impact: '10 DMG / 毒強化', setter: 'トキシン',
      desc: 'ターン終了時に滞在ユニットへ 10 DMG。トキシンの通常攻撃が強化される。'
    };
    hazards['1,4'] = {
      type: 'toxic', name: 'トキシック・ゾーン', owner: 'P2',
      category: 'ゾーン', impact: '10 DMG / 毒強化', setter: 'トキシン',
      desc: 'ターン終了時に滞在ユニットへ 10 DMG。トキシンの通常攻撃が強化される。'
    };
    hazards['2,4'] = {
      type: 'toxic', name: 'トキシック・ゾーン', owner: 'P2',
      category: 'ゾーン', impact: '10 DMG / 毒強化', setter: 'トキシン',
      desc: 'ターン終了時に滞在ユニットへ 10 DMG。トキシンの通常攻撃が強化される。'
    };
    hazards['4,4'] = {
      type: 'mine', name: 'マイン', owner: 'P1',
      category: 'トラップ', impact: '20 DMG (爆発消滅)', setter: 'ニトロ',
      desc: '敵が踏み込むと爆発し 20 DMG を与えて消滅する。'
    };
  } else {
    board[1][3] = { typeKey: 'PHASE', owner: 'P2', hp: 80, atk: 30, stockA: 2, ultUsed: false, buffs: {}, debuffs: {} };
    board[5][3] = { typeKey: 'KINESIS', owner: 'P1', hp: 95, atk: 25, stockA: 2, ultUsed: false, buffs: {}, debuffs: {} };
  }

  board[6][1] = { typeKey: 'NITRO', owner: 'P1', hp: 110, atk: 20, stockA: 2, ultUsed: false, buffs: {}, debuffs: {} };
  board[6][2] = { typeKey: 'VECTOR', owner: 'P1', hp: 100, atk: 25, stockA: 2, ultUsed: false, buffs: {}, debuffs: {} };
  board[6][3] = { typeKey: 'CORE', owner: 'P1', hp: 100, atk: 0, buffs: {}, debuffs: {} };
  board[6][4] = { typeKey: 'GLITCH', owner: 'P1', hp: 90, atk: 15, stockA: 2, ultUsed: false, buffs: {}, debuffs: {} };
  board[6][5] = { typeKey: 'IRIS', owner: 'P1', hp: 90, atk: 14, stockA: 2, ultUsed: false, buffs: {}, debuffs: {} };

  return { board, hazards };
}

let scenario = buildScenario();

function getUnitContext(unit) {
  const def = DEFS[unit.typeKey];
  return { def, isUnit: unit.typeKey !== 'CORE' && unit.typeKey !== 'TURRET' && unit.typeKey !== 'BARRICADE' };
}

function arDotsHtml(rem, max) {
  const safeMax = Math.max(1, max || 1);
  const safeRem = Math.max(0, Math.min(safeMax, rem ?? 0));
  let out = '<span class="ar-dots">';
  for (let i = 0; i < safeMax; i++) out += `<i class="ar-dot ${i >= safeRem ? 'used' : ''}"></i>`;
  return out + '</span>';
}

function floorShortName(hz) {
  if (hz.type === 'dimension') return 'ディメンション';
  if (hz.type === 'toxic') return 'トキシック';
  if (hz.type === 'mine') return 'マイン';
  return String(hz.name || '').replace(/・?ゾーン$/, '');
}

function floorGraphicHtml(hz) {
  const emblem = hz.type === 'mine' ? `<span class="floor-trap-emblem" aria-hidden="true">${icon('hz_mine')}</span>` : '';
  return `${emblem}<span class="floor-badge"><svg class="floor-dock-svg" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true"><path d="M 7,1 L 93,1 L 99,6.5 L 99,15.5 L 93,21 L 7,21 L 1,15.5 L 1,6.5 Z"/></svg><b>${esc(floorShortName(hz))}</b></span>`;
}

function getUltTargetTiles(casterPos, unit, board) {
  if (!casterPos || !unit) return [];
  const meta = ULT_FX_META[unit.typeKey] || ULT_FX_META.KINESIS;
  const out = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const dr = Math.abs(r - casterPos.r);
      const dc = Math.abs(c - casterPos.c);
      const dist = Math.max(dr, dc);
      const cell = board[r][c];
      if (meta.mode === 'aoe2' && dist <= 2 && !(dr === 0 && dc === 0)) {
        out.push({ r, c, hitPiece: Boolean(cell && cell.owner !== unit.owner) });
      } else if (meta.mode === 'around' && dist <= 1) {
        out.push({ r, c, hitPiece: Boolean(cell && cell.owner !== unit.owner) });
      } else if (meta.mode === 'allies' && cell && cell.owner === unit.owner) {
        out.push({ r, c, hitPiece: true });
      } else if (meta.mode === 'enemy' && cell && cell.owner !== unit.owner && getUnitContext(cell).isUnit) {
        out.push({ r, c, hitPiece: true });
      }
    }
  }
  if (meta.mode === 'self' || out.length === 0) {
    out.push({ r: casterPos.r, c: casterPos.c, hitPiece: false });
  }
  return out;
}

function renderBoardMock() {
  const boardEl = document.getElementById('board');
  const stageEl = document.getElementById('battle-stage');
  const { board, hazards } = scenario;
  const turnOwner = mockState.phase === 'RED' ? 'P2' : 'P1';
  const isDeploy = mockState.phase === 'DEPLOY';
  const sel = mockState.selectedPos;
  const selUnit = sel ? board[sel.r]?.[sel.c] : null;
  const isSkillTargeting = mockState.bstate === 'skill' || mockState.commandMode === 'SKILL_A';
  const isUltTargeting = Boolean(mockState.commandMode === 'SKILL_ULT' && selUnit && DEFS[selUnit.typeKey]?.skills?.ULT);
  const isSkillFocus = Boolean(isSkillTargeting && !isUltTargeting && !isDeploy && sel && selUnit && selUnit.owner === turnOwner && getUnitContext(selUnit).isUnit);
  const ultTargets = isUltTargeting ? getUltTargetTiles(sel, selUnit, board) : [];
  const ultTargetMap = new Map(ultTargets.map(t => [`${t.r},${t.c}`, t]));

  stageEl.classList.toggle('is-ult-armed', isUltTargeting);
  stageEl.classList.toggle('is-skill-armed', isSkillFocus);

  boardEl.innerHTML = '';
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.r = String(r);
      tile.dataset.c = String(c);
      if (r <= 1) tile.classList.add('enemy-zone');
      else if (r >= 5) tile.classList.add('ally-zone');

      const unit = board[r][c];
      const hz = hazards[`${r},${c}`];

      if (hz) {
        const fl = document.createElement('div');
        fl.className = `floor ${hz.type}`;
        fl.dataset.owner = hz.owner;
        fl.innerHTML = floorGraphicHtml(hz);
        tile.appendChild(fl);
      }

      if (sel && sel.r === r && sel.c === c) tile.classList.add('selected');
      if (mockState.selectedHazardPos && mockState.selectedHazardPos.r === r && mockState.selectedHazardPos.c === c) tile.classList.add('selected');

      let targetKind = null;
      let isUltTargetTile = false;
      if (isUltTargeting) {
        const isCaster = sel && sel.r === r && sel.c === c;
        const uHit = ultTargetMap.get(`${r},${c}`);
        if (isCaster) {
          tile.classList.add('is-ult-caster');
          isUltTargetTile = true;
        }
        if (uHit && !isCaster) {
          tile.classList.add('ult-zone');
          if (selUnit.typeKey === 'TOXIN') tile.classList.add('is-toxic-ult');
          isUltTargetTile = true;
        }
        if (uHit && (uHit.hitPiece || isCaster || ultTargets.length <= 4)) {
          const uMark = document.createElement('span');
          uMark.className = 'ult-target-mark';
          uMark.innerHTML = icon('ult');
          tile.appendChild(uMark);
        }
      } else if (!isDeploy && sel && selUnit && selUnit.owner === turnOwner && getUnitContext(selUnit).isUnit) {
        const dr = Math.abs(r - sel.r);
        const dc = Math.abs(c - sel.c);
        if (isSkillTargeting) {
          if (selUnit.typeKey === 'IRIS') {
            if (unit && unit.owner === turnOwner && getUnitContext(unit).isUnit && Math.max(dr, dc) <= 3 && !(dr === 0 && dc === 0)) {
              tile.classList.add('skill-target', 'heal-target');
              targetKind = 'heal';
            }
          } else if (!unit && dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0)) {
            tile.classList.add('skill-target');
            targetKind = 'skill';
          }
        } else if (dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0)) {
          if (!unit) {
            tile.classList.add('movable', 'valid-move');
            targetKind = 'move';
          } else if (unit.owner !== turnOwner) {
            tile.classList.add('attackable', 'valid-attack');
            targetKind = 'attack';
          }
        }
      } else if (isDeploy && r >= 5 && !unit) {
        tile.classList.add('deploy-area-p1');
      }

      if (unit) {
        const { def, isUnit: unitFlag } = getUnitContext(unit);
        const piece = document.createElement('div');
        piece.className = `piece ${unit.owner === 'P2' ? 'p2 enemy' : 'p1'}${!unitFlag ? (unit.typeKey === 'CORE' ? ' core' : ' structure') : ''}`;
        piece.dataset.role = def.role;
        if (sel && sel.r === r && sel.c === c) piece.classList.add('selected');

        const hasDeb = Object.keys(unit.debuffs || {}).length > 0;
        const hasAtkBuff = Boolean(unit.buffs?.atk_up);
        const statusIconHtml = hasDeb ? icon('debuff') : hasAtkBuff ? icon('buff') : '';
        const shieldVal = unit.buffs?.shield?.val || 0;
        const displayHp = unit.hp + shieldVal;
        const faceHtml = unit.typeKey === 'CORE'
          ? icon('core')
          : unit.typeKey === 'TURRET'
            ? icon('turret')
            : unit.typeKey === 'BARRICADE'
              ? icon('object')
              : `<img class="anime-art" src="${portraitPath(def.slug)}" alt="${esc(def.name)}" draggable="false">`;
        const hasAtk = unit.atk > 0;
        const hpPct = Math.max(0, Math.min(100, (unit.hp / def.maxHp) * 100));
        const shieldUnits = (unit.hp < def.maxHp && shieldVal > 0) ? Math.min(def.maxHp - unit.hp, shieldVal) : 0;
        const shieldPct = Math.max(0, Math.min(100 - hpPct, (shieldUnits / def.maxHp) * 100));

        piece.innerHTML = `
          <span class="piece-face">${faceHtml}</span>
          <span class="piece-role">${icon(ROLE_ICONS[def.role] || 'assault')}</span>
          <span class="piece-status">${statusIconHtml}</span>
          <span class="piece-readout">
            <svg class="piece-dock-svg" viewBox="0 0 80 35" preserveAspectRatio="none" aria-hidden="true">
              <path d="M 4,2 L 28,2 Q 30,2 30.8,4 L 33.2,15 Q 34,17 36,17 L 54,17 Q 56,17 56.8,15 L 58.8,5.5 Q 59.6,3.5 61.6,3.5 L 76,3.5 Q 79,3.5 79,6.5 L 79,30 Q 79,34 75,34 L 5,34 Q 1,34 1,30 L 1,5 Q 1,2 4,2 Z"/>
            </svg>
            <span class="piece-values">
              <b class="${shieldVal > 0 ? 'has-shield' : ''}">${displayHp}</b>
              <span class="${hasAtk ? (hasAtkBuff ? 'is-buffed' : '') : 'is-none'}">${hasAtk ? unit.atk : '—'}</span>
            </span>
            <span class="piece-hp-track"><i style="width:${hpPct.toFixed(2)}%"></i>${shieldPct > 0 ? `<i class="shield-fill" style="width:${shieldPct.toFixed(2)}%"></i>` : ''}</span>
            <span class="piece-name">${esc(getDisplayName(unit.typeKey, def))}</span>
          </span>
        `;
        tile.appendChild(piece);
      }

      if (targetKind) {
        const mark = document.createElement('span');
        mark.className = 'target-mark';
        mark.innerHTML = icon(targetKind === 'heal' ? 'skill' : targetKind);
        tile.appendChild(mark);
      }

      tile.addEventListener('click', () => {
        if (isUltTargeting && isUltTargetTile) {
          playUltSequence(sel, { r, c });
          return;
        }
        if (targetKind === 'attack' && unit) {
          const rawAtk = selUnit?.atk || 25;
          const dmg = unit.debuffs?.vulnerable ? Math.round(rawAtk * 1.5) : rawAtk;
          playCombatPopupFX('dmg', { r, c }, dmg, sel);
          return;
        }
        if (targetKind === 'heal' && unit) {
          mockState.commandMode = null;
          if (mockState.bstate === 'skill') {
            mockState.bstate = 'rich';
            document.querySelectorAll('[data-bstate]').forEach(x => x.classList.toggle('active', x.dataset.bstate === 'rich'));
          }
          renderAllMock();
          playCombatPopupFX('heal', { r, c }, 30, sel);
          return;
        }
        if (targetKind === 'skill') {
          const casterUnit = selUnit;
          mockState.commandMode = null;
          if (mockState.bstate === 'skill') {
            mockState.bstate = 'rich';
            document.querySelectorAll('[data-bstate]').forEach(x => x.classList.toggle('active', x.dataset.bstate === 'rich'));
          }
          renderAllMock();
          playSkillPopupFX(sel, { r, c }, casterUnit);
          return;
        }
        if (unit) {
          mockState.selectedPos = { r, c };
          mockState.selectedHazardPos = null;
          mockState.commandMode = null;
        } else if (hz) {
          mockState.selectedPos = null;
          mockState.selectedHazardPos = { r, c };
          mockState.commandMode = null;
        } else {
          mockState.selectedPos = null;
          mockState.selectedHazardPos = null;
          mockState.commandMode = null;
        }
        renderAllMock();
      });

      boardEl.appendChild(tile);
    }
  }
}

function renderTokensContent(tokensContainer, tokenBanner, hasEx, atkLbl, moveLbl) {
  const titleEl = tokenBanner.querySelector('.tokens-banner-title');
  const used = mockState.usedTokens || {};
  const exUnitName = 'ストライド';
  if (titleEl) {
    titleEl.textContent = 'SYNC ORDERS';
    const total = hasEx ? 3 : 2;
    const ready = (used.atk ? 0 : 1) + (used.move ? 0 : 1) + (hasEx && !used.ex ? 1 : 0);
    titleEl.dataset.ready = `${ready}/${total}`;
  }

  tokensContainer.innerHTML = `
    <span class="turn-token is-atk ${used.atk ? 'is-used' : ''}" data-tk-toggle="atk" title="クリックで使用済み状態をプレビュー">
      <span class="tk-def-ico">${icon('attack')}</span>
      <strong class="tk-def-lbl">${atkLbl}</strong>
    </span>
    <span class="turn-token is-move ${used.move ? 'is-used' : ''}" data-tk-toggle="move" title="クリックで使用済み状態をプレビュー">
      <span class="tk-def-ico">${icon('move')}</span>
      <strong class="tk-def-lbl">${moveLbl}</strong>
    </span>
    ${hasEx ? `
      <span class="turn-token special is-ex ${used.ex ? 'is-used' : ''}" data-tk-toggle="ex" title="クリックで使用済み状態をプレビュー">
        <span class="tk-def-ico">${icon('move')}</span>
        <strong class="tk-def-lbl">${moveLbl}</strong>
        <small>${exUnitName}</small>
      </span>
    ` : ''}
  `;

  tokensContainer.querySelectorAll('[data-tk-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.dataset.tkToggle;
      mockState.usedTokens[k] = !mockState.usedTokens[k];
      renderTopHudAndTokens();
    });
  });
}

function setUltBarProgress(barId, textId, pct) {
  const fillEl = document.getElementById(barId);
  const txtEl = document.getElementById(textId);
  if (fillEl) {
    fillEl.style.width = '100%';
    fillEl.style.height = `${pct}%`;
  }
  if (txtEl) txtEl.textContent = `${pct}%`;
}

function renderTopHudAndTokens() {
  const turnBox = document.getElementById('turn-display-box');
  const eyebrow = document.getElementById('turn-label-eyebrow');
  const countBadge = document.getElementById('turn-count-badge');
  const turnBadge = document.getElementById('turn-badge');
  const tokenBanner = document.getElementById('action-status-banner');
  const deployBanner = document.getElementById('deploy-control-bar');
  const tokensContainer = document.getElementById('action-tokens-container');
  const endBtn = document.getElementById('btn-end-turn');
  const endMain = document.getElementById('hold-main-text');
  const endSub = document.getElementById('hold-sub-text');

  const atkLbl = 'ATK';
  const moveLbl = 'MOVE';
  const modeBadge = document.getElementById('current-mode-badge');
  if (modeBadge) modeBadge.textContent = 'MONOLITH // LAPSE-07';
  document.querySelector('#core-bar-enemy .core-tag').textContent = 'ULT';
  document.querySelector('#core-bar-ally .core-tag').textContent = 'ULT';
  document.getElementById('core-bar-ally').classList.toggle('is-ult-full', mockState.bstate === 'ult');

  const allyUltPct = mockState.bstate === 'ult' ? 100 : 65;
  setUltBarProgress('p1-ult-bar', 'p1-ult-text', allyUltPct);
  setUltBarProgress('p2-ult-bar', 'p2-ult-text', 45);

  turnBox.classList.toggle('enemy-turn', mockState.phase === 'RED');
  endBtn.classList.remove('p1', 'p2', 'unusable');
  endBtn.disabled = false;

  if (mockState.phase === 'DEPLOY') {
    eyebrow.textContent = 'PHASE';
    countBadge.textContent = 'DP';
    turnBadge.textContent = 'ANCHOR DEPLOY';
    tokenBanner.style.display = 'none';
    deployBanner.style.display = 'flex';
    endBtn.classList.add('p1');
    endMain.textContent = 'LOCK ANCHOR';
    endSub.textContent = '長押しで配置確定 ➔';
  } else if (mockState.phase === 'RED') {
    eyebrow.textContent = 'TURN';
    countBadge.textContent = '03';
    turnBadge.textContent = 'MIRROR TURN';
    tokenBanner.style.display = 'flex';
    deployBanner.style.display = 'none';
    endBtn.classList.add('p2', 'unusable');
    endBtn.disabled = true;
    endMain.textContent = 'MIRROR PHASE';
    endSub.textContent = '敵世界線 観測中...';
    tokensContainer.style.display = '';
    renderTokensContent(tokensContainer, tokenBanner, false, atkLbl, moveLbl);
  } else {
    eyebrow.textContent = 'TURN';
    countBadge.textContent = '03';
    turnBadge.textContent = 'OBSERVER TURN';
    tokenBanner.style.display = 'flex';
    deployBanner.style.display = 'none';
    endBtn.classList.add('p1');
    endMain.textContent = 'END TURN';
    endSub.textContent = '長押しで観測確定';
    renderTokensContent(tokensContainer, tokenBanner, true, atkLbl, moveLbl);
  }
  const endMainInv = document.getElementById('hold-main-text-inv');
  const endSubInv = document.getElementById('hold-sub-text-inv');
  if (endMainInv) endMainInv.textContent = endMain.textContent;
  if (endSubInv) endSubInv.textContent = endSub.textContent;
}

let holoGlitchTimer = null;
let lastHoloRenderKey = '';
let hasRenderedInspectorOnce = false;

function triggerHoloGlitch() {
  const inspector = document.getElementById('inspector');
  if (!inspector) return;
  inspector.classList.remove('is-holo-glitch');
  void inspector.offsetWidth;
  inspector.classList.add('is-holo-glitch');
  if (holoGlitchTimer) clearTimeout(holoGlitchTimer);
  holoGlitchTimer = setTimeout(() => {
    inspector.classList.remove('is-holo-glitch');
  }, 420);
}

function renderInspectorMock() {
  const panel = document.getElementById('unit-detail-panel');
  const inspector = document.getElementById('inspector');
  const syncHoloMeta = (key) => {
    if (hasRenderedInspectorOnce && key !== lastHoloRenderKey) {
      triggerHoloGlitch();
    }
    lastHoloRenderKey = key;
    hasRenderedInspectorOnce = true;
  };
  if (mockState.screen === 'select') {
    const typeKey = SELECTABLE_HERO_KEYS.includes(mockState.selectFocusKey) ? mockState.selectFocusKey : 'KINESIS';
    const def = DEFS[typeKey];
    inspector.dataset.team = 'BLUE';
    inspector.dataset.role = def.role;
    const skills = def.skills || {};
    const traitsHtml = '';
    panel.innerHTML = `
      <div class="ar-piece-hero">
        <div class="ar-banner">
          <span class="ar-banner-scan" aria-hidden="true"></span>
          <img class="anime-art" src="${portraitPath(def.slug)}" alt="${esc(def.name)}" draggable="false">
          <div class="ar-pills">
            <span class="ar-role-pill">${svgIcon(ROLE_ICONS[def.role] || 'assault')}<span>${esc(getDisplayRole(typeKey, def))}</span></span>
          </div>
          <h2 class="ar-banner-name">${esc(getDisplayName(typeKey, def))}</h2>
          <span class="ar-banner-code">${esc(getDisplayCode(typeKey))}</span>
        </div>
        <div class="ar-piece-dock">
          <div class="ar-dock-cap-wrap">
            <svg class="ar-dock-cap-svg" viewBox="0 0 426 52" preserveAspectRatio="none" aria-hidden="true">
              <path d="M 0,2 L 166,2 Q 172,2 176,8 L 190,32 Q 194,38 200,38 L 292,38 Q 298,38 302,32 L 316,8 Q 320,2 326,2 L 426,2 L 426,52 L 0,52 Z" fill="#ffffff" stroke="none"/>
              <path d="M 0,2 L 166,2 Q 172,2 176,8 L 190,32 Q 194,38 200,38 L 292,38 Q 298,38 302,32 L 316,8 Q 320,2 326,2 L 426,2" fill="none" stroke="#b4bccb" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
            </svg>
            <div class="ar-dock-values">
              <div class="ar-dock-stat hp-side">
                <span class="ar-dk-lbl">HP</span>
                <strong class="ar-dk-hp">${def.maxHp}<small>/ ${def.maxHp}</small></strong>
              </div>
              <div class="ar-dock-stat atk-side">
                <span class="ar-dk-lbl">ATK</span>
                <strong class="ar-dk-atk">${def.atk}</strong>
              </div>
            </div>
          </div>
          <div class="ar-unit-sheet-body">
            <div class="ar-dock-bar-wrap">
              <div class="ar-skew-bar"><i class="hp-fill" style="width:100%"></i></div>
            </div>
            <div class="ar-sheet-sec">
              <div class="ar-sheet-eyebrow">STATES</div>
              <div class="ar-states-dock"><div class="ar-state-strip">${traitsHtml}</div></div>
            </div>
            <div class="ar-sheet-sec passive-sec">
              <div class="ar-sheet-eyebrow">PASSIVE</div>
              <div class="ar-passive-inline">
                <div class="ar-passive-head"><strong>${esc(def.passive.name)}</strong></div>
                <div class="ar-passive-desc">${esc(def.passive.desc)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="insp-scroll ar-skills">
        ${skills.A ? `
          <div class="ar-card">
            <span class="ar-tag-tab"><span>SKILL</span></span>
            <div class="ar-card-body">
              <div class="ar-card-top">
                <strong>${esc(skills.A.name)}</strong>
                <span class="ar-stock-wrap">${arDotsHtml(skills.A.maxStock, skills.A.maxStock)}</span>
              </div>
              <div class="ar-card-desc">${esc(skills.A.desc)}</div>
            </div>
          </div>
        ` : ''}
        ${skills.ULT ? `
          <div class="ar-card ult">
            <span class="ar-ult-sheen" aria-hidden="true"></span>
            <span class="ar-tag-tab"><span>ULT</span></span>
            <div class="ar-card-body">
              <div class="ar-card-top">
                <strong>${esc(skills.ULT.name)}</strong>
                <span class="ar-stock-wrap">${arDotsHtml(1, 1)}</span>
              </div>
              <div class="ar-card-desc">${esc(skills.ULT.desc)}</div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
    syncHoloMeta(`sel:${typeKey}`);
    return;
  }
  const { board, hazards } = scenario;
  const turnOwner = mockState.phase === 'RED' ? 'P2' : 'P1';
  const sel = mockState.selectedPos;
  const unit = sel ? board[sel.r]?.[sel.c] : null;

  if (!unit) {
    const hz = mockState.selectedHazardPos ? hazards[`${mockState.selectedHazardPos.r},${mockState.selectedHazardPos.c}`] : null;
    if (hz) {
      inspector.dataset.team = hz.owner === 'P2' ? 'RED' : 'BLUE';
      const hzIcon = hz.type === 'toxic' ? 'hz_toxic' : hz.type === 'dimension' ? 'hz_dimension' : 'hz_mine';
      inspector.dataset.role = hz.type === 'toxic' ? 'SUPPORT' : hz.type === 'dimension' ? 'DISRUPTOR' : 'CORE';
      panel.innerHTML = `
        <div class="ar-piece-hero">
          <div class="ar-banner">
            <span class="ar-banner-scan" aria-hidden="true"></span>
            ${svgIcon(hzIcon, 'emblem', '1.8')}
            <div class="ar-pills">
              <span class="ar-role-pill">${svgIcon(hzIcon)}<span>${esc(hz.category)}</span></span>
            </div>
            <h2 class="ar-banner-name">${esc(hz.name)}</h2>
          </div>
          <div class="ar-piece-dock">
            <div class="ar-dock-cap-wrap">
              <svg class="ar-dock-cap-svg" viewBox="0 0 426 52" preserveAspectRatio="none" aria-hidden="true">
                <path d="M 0,2 L 166,2 Q 172,2 176,8 L 190,32 Q 194,38 200,38 L 292,38 Q 298,38 302,32 L 316,8 Q 320,2 326,2 L 426,2 L 426,52 L 0,52 Z" fill="#ffffff" stroke="none"/>
                <path d="M 0,2 L 166,2 Q 172,2 176,8 L 190,32 Q 194,38 200,38 L 292,38 Q 298,38 302,32 L 316,8 Q 320,2 326,2 L 426,2" fill="none" stroke="#b4bccb" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
              </svg>
              <div class="ar-hz-cap-meta">
                <span class="ar-dk-lbl">TEAM</span>
                <strong class="ar-hz-team-val ${hz.owner === 'P2' ? 'is-enemy' : ''}">${hz.owner === 'P2' ? 'RED' : 'BLUE'}</strong>
              </div>
            </div>
            <div class="ar-unit-sheet-body">
              <div class="ar-hz-setter-row">
                <span class="ar-sheet-eyebrow">DEPLOYED BY</span>
                <strong class="ar-hz-setter-name">${esc(hz.setter)}</strong>
              </div>
              <div class="ar-sheet-sec passive-sec">
                <div class="ar-sheet-eyebrow">SPEC</div>
                <div class="ar-passive-inline">
                  <div class="ar-passive-head"><strong>${esc(hz.impact)}</strong></div>
                  <div class="ar-passive-desc">${esc(hz.desc)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      syncHoloMeta(`hz:${mockState.selectedHazardPos.r},${mockState.selectedHazardPos.c}`);
      return;
    }
    inspector.dataset.team = 'BLUE';
    panel.innerHTML = `
      <div class="ar-piece-hero is-not-found">
        <div class="ar-banner">
          <span class="ar-banner-scan" aria-hidden="true"></span>
          ${svgIcon('target', 'emblem', '1.8')}
          <div class="ar-pills">
            <span class="ar-role-pill">${svgIcon('target')}<span>STANDBY</span></span>
          </div>
          <h2 class="ar-banner-name">NOT FOUND</h2>
          <span class="ar-banner-code">UNIT-?? // NO SIGNAL</span>
        </div>
        <div class="ar-piece-dock">
          <div class="ar-dock-cap-wrap">
            <svg class="ar-dock-cap-svg" viewBox="0 0 426 52" preserveAspectRatio="none" aria-hidden="true">
              <path d="M 0,2 L 166,2 Q 172,2 176,8 L 190,32 Q 194,38 200,38 L 292,38 Q 298,38 302,32 L 316,8 Q 320,2 326,2 L 426,2 L 426,52 L 0,52 Z" fill="#ffffff" stroke="none"/>
              <path d="M 0,2 L 166,2 Q 172,2 176,8 L 190,32 Q 194,38 200,38 L 292,38 Q 298,38 302,32 L 316,8 Q 320,2 326,2 L 426,2" fill="none" stroke="#b4bccb" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
            </svg>
          </div>
          <div class="ar-unit-sheet-body"></div>
        </div>
      </div>
    `;
    syncHoloMeta('empty');
    return;
  }

  const { def } = getUnitContext(unit);
  const shield = unit.buffs?.shield?.val || 0;
  const displayHp = unit.hp + shield;
  const friendly = unit.owner === turnOwner;
  const active = friendly && mockState.phase !== 'DEPLOY' && mockState.phase !== 'RED';
  const ultReady = mockState.bstate === 'ult';
  const hpPctExact = Math.max(0, Math.min(100, (unit.hp / def.maxHp) * 100));
  const shieldUnits = (unit.hp < def.maxHp && shield > 0) ? Math.min(def.maxHp - unit.hp, shield) : 0;
  const shieldPctExact = Math.max(0, Math.min(100 - hpPctExact, (shieldUnits / def.maxHp) * 100));
  const hasAtk = unit.atk > 0;
  const isBuffed = Boolean(unit.buffs?.atk_up);

  inspector.dataset.team = unit.owner === 'P2' ? 'RED' : 'BLUE';
  inspector.dataset.role = def.role;

  const tags = [];
  if (shield > 0) tags.push(`<span class="ar-tag-b shield">${svgIcon('st_shield', 'ar-st-ic')}<b class="ar-st-val">+${shield}</b><em class="ar-st-turn">${unit.buffs.shield.turns}T</em></span>`);
  if (unit.buffs?.atk_up) tags.push(`<span class="ar-tag-b buff">${svgIcon('st_atk', 'ar-st-ic')}<b class="ar-st-val">+${unit.buffs.atk_up.val}</b><em class="ar-st-turn">${unit.buffs.atk_up.turns}T</em></span>`);
  if (unit.debuffs?.vulnerable) tags.push(`<span class="ar-tag-b debuff">${svgIcon('st_debuff', 'ar-st-ic')}<span>弱体化</span><em class="ar-st-turn">${unit.debuffs.vulnerable.turns}T</em></span>`);
  const hz = hazards[`${sel.r},${sel.c}`];
  if (hz) {
    const zLabel = hz.type === 'dimension' ? 'ディメンション' : hz.type === 'toxic' ? 'トキシック' : hz.name;
    tags.push(`<span class="ar-tag-b terrain">${svgIcon('st_zone', 'ar-st-ic')}<span>${esc(zLabel)}</span></span>`);
  }
  const statesHtml = tags.length ? tags.join('') : `<span class="ar-state-empty">状態効果なし</span>`;

  const passiveHtml = def.passive
    ? `<div class="ar-sheet-sec passive-sec"><div class="ar-sheet-eyebrow">PASSIVE</div><div class="ar-passive-inline"><div class="ar-passive-head"><strong>${esc(def.passive.name)}</strong></div><div class="ar-passive-desc">${esc(def.passive.desc)}</div></div></div>`
    : `<div class="ar-sheet-sec passive-sec"><div class="ar-sheet-eyebrow">SPEC</div><div class="ar-passive-inline"><div class="ar-passive-head"><strong>${unit.typeKey === 'CORE' ? '防衛目標仕様' : 'オブジェクト仕様'}</strong></div><div class="ar-passive-desc">${esc(def.desc || '')}</div></div></div>`;

  const artHtml = unit.typeKey === 'CORE'
    ? svgIcon('core', 'emblem', '1.8')
    : unit.typeKey === 'TURRET'
      ? svgIcon('turret', 'emblem', '1.8')
      : unit.typeKey === 'BARRICADE'
        ? svgIcon('object', 'emblem', '1.8')
        : `<img class="anime-art" src="${portraitPath(def.slug)}" alt="${esc(def.name)}" draggable="false">`;

  const skills = def.skills || {};
  const skillArmed = mockState.commandMode === 'SKILL_A' || (mockState.bstate === 'skill' && active);
  const ultArmed = mockState.commandMode === 'SKILL_ULT';
  const skillDisabled = !active && !skillArmed;
  const ultDisabled = (!active || !ultReady) && !ultArmed;

  panel.innerHTML = `
    <div class="ar-piece-hero">
      <div class="ar-banner">
        <span class="ar-banner-scan" aria-hidden="true"></span>
        ${artHtml}
        <div class="ar-pills">
          <span class="ar-role-pill">${svgIcon(ROLE_ICONS[def.role] || 'assault')}<span>${esc(getDisplayRole(unit.typeKey, def))}</span></span>
        </div>
        <h2 class="ar-banner-name">${esc(getDisplayName(unit.typeKey, def))}</h2>
        <span class="ar-banner-code">${esc(getDisplayCode(unit.typeKey))}</span>
      </div>
      <div class="ar-piece-dock">
        <div class="ar-dock-cap-wrap">
          <svg class="ar-dock-cap-svg" viewBox="0 0 426 52" preserveAspectRatio="none" aria-hidden="true">
            <path d="M 0,2 L 166,2 Q 172,2 176,8 L 190,32 Q 194,38 200,38 L 292,38 Q 298,38 302,32 L 316,8 Q 320,2 326,2 L 426,2 L 426,52 L 0,52 Z" fill="#ffffff" stroke="none"/>
            <path d="M 0,2 L 166,2 Q 172,2 176,8 L 190,32 Q 194,38 200,38 L 292,38 Q 298,38 302,32 L 316,8 Q 320,2 326,2 L 426,2" fill="none" stroke="#b4bccb" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
          </svg>
          <div class="ar-dock-values">
            <div class="ar-dock-stat hp-side">
              <span class="ar-dk-lbl">HP</span>
              <strong class="ar-dk-hp ${shield > 0 ? 'has-shield' : ''}">${displayHp}<small>/ ${def.maxHp}</small></strong>
            </div>
            <div class="ar-dock-stat atk-side">
              <span class="ar-dk-lbl">ATK</span>
              <strong class="ar-dk-atk ${hasAtk ? (isBuffed ? 'is-buffed' : '') : 'is-none'}">${hasAtk ? unit.atk : '—'}</strong>
            </div>
          </div>
        </div>
        <div class="ar-unit-sheet-body">
          <div class="ar-dock-bar-wrap">
            <div class="ar-skew-bar"><i class="hp-fill" style="width:${hpPctExact.toFixed(2)}%"></i>${shieldPctExact > 0 ? `<i class="shield-fill" style="width:${shieldPctExact.toFixed(2)}%"></i>` : ''}</div>
          </div>
          <div class="ar-sheet-sec">
            <div class="ar-sheet-eyebrow">STATES</div>
            <div class="ar-states-dock"><div class="ar-state-strip">${statesHtml}</div></div>
          </div>
          ${passiveHtml}
        </div>
      </div>
    </div>
    ${(skills.A || skills.ULT || (unit.typeKey === 'BARRICADE' && friendly)) ? `
      <div class="insp-scroll ar-skills">
        ${skills.A ? `
          <button type="button" class="ar-card interactive ${skillArmed ? 'armed' : ''} ${skillDisabled ? 'disabled' : ''}" data-mock-cmd="SKILL_A" ${skillDisabled ? 'disabled' : ''}>
            <span class="ar-tag-tab"><span>SKILL</span></span>
            <div class="ar-card-body">
              <div class="ar-card-top">
                <strong>${esc(skills.A.name)}</strong>
                <span class="ar-stock-wrap">${arDotsHtml(unit.stockA, skills.A.maxStock)}</span>
              </div>
              <div class="ar-card-desc">${esc(skills.A.desc)}</div>
            </div>
          </button>
        ` : ''}
        ${skills.ULT ? `
          <button type="button" class="ar-card ult interactive ${ultReady && active ? 'is-ready' : ''} ${ultArmed ? 'armed' : ''} ${ultDisabled ? 'disabled' : ''}" data-mock-cmd="SKILL_ULT" ${ultDisabled ? 'disabled' : ''}>
            <span class="ar-ult-sheen" aria-hidden="true"></span>
            <span class="ar-tag-tab"><span>ULT</span></span>
            <div class="ar-card-body">
              <div class="ar-card-top">
                <strong>${esc(skills.ULT.name)}</strong>
                <span class="ar-stock-wrap">${arDotsHtml(unit.ultUsed ? 0 : 1, 1)}</span>
              </div>
              <div class="ar-card-desc">${esc(skills.ULT.desc)}</div>
            </div>
          </button>
        ` : ''}
        ${unit.typeKey === 'BARRICADE' && friendly ? `
          <button type="button" class="ar-destroy-btn"><span>💥 防壁を撤去</span></button>
        ` : ''}
      </div>
    ` : ''}
  `;

  panel.querySelectorAll('[data-mock-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.mockCmd;
      mockState.commandMode = mockState.commandMode === cmd ? null : cmd;
      if (mockState.bstate === 'skill' && cmd === 'SKILL_A' && !mockState.commandMode) mockState.bstate = 'rich';
      renderAllMock();
    });
  });

  syncHoloMeta(`unit:${sel.r},${sel.c},${unit.typeKey},${unit.owner}`);
}

let ultTimers = [];
let finisherTimers = [];
let lastFinisherMode = 'core-win';

function clearFinisherFxState() {
  finisherTimers.forEach(clearTimeout);
  finisherTimers = [];
  const stage = document.getElementById('battle-stage');
  const overlay = document.getElementById('finisher-overlay');
  if (stage) {
    stage.classList.remove('is-finisher-hitstop', 'is-finisher-active', 'is-finisher-defeat');
    stage.style.removeProperty('--fn-tx');
    stage.style.removeProperty('--fn-ty');
    stage.style.removeProperty('--fn-scale');
    stage.querySelectorAll('.tile.is-fn-target, .tile.is-atk-lunge').forEach(el => el.classList.remove('is-fn-target', 'is-atk-lunge'));
    stage.querySelectorAll('.piece.is-fn-hitstop, .piece.is-fn-shattering').forEach(el => el.classList.remove('is-fn-hitstop', 'is-fn-shattering'));
  }
  if (overlay) {
    overlay.classList.remove('is-active', 'is-banner-in', 'is-actions-in', 'is-interactive', 'is-defeat');
    overlay.hidden = true;
  }
}

function clearUltFxState() {
  ultTimers.forEach(clearTimeout);
  ultTimers = [];
  clearFinisherFxState();
  const stage = document.getElementById('battle-stage');
  const cutin = document.getElementById('ult-cutin-overlay');
  const fxLayer = document.getElementById('board-fx-layer');
  const triggerBtn = document.getElementById('mock-trigger-ult');
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
  if (triggerBtn) triggerBtn.classList.remove('is-playing');
}

function playFinisherSequence(mode = 'core-win') {
  clearUltFxState();
  lastFinisherMode = mode;
  const { board } = scenario;
  const stage = document.getElementById('battle-stage');
  const overlay = document.getElementById('finisher-overlay');
  const fxLayer = document.getElementById('board-fx-layer');
  if (!stage || !overlay || !fxLayer) return;

  const isDefeat = mode === 'defeat';
  let targetPos = { r: 0, c: 3 };
  let attackerPos = board[1]?.[3]?.owner === 'P1' ? { r: 1, c: 3 } : { r: 3, c: 3 };

  if (mode === 'wipeout-win') {
    if (board[2]?.[3]?.owner === 'P2') targetPos = { r: 2, c: 3 };
    else if (board[1]?.[3]?.owner === 'P2') targetPos = { r: 1, c: 3 };
    else {
      outer: for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const u = board[r][c];
          if (u && u.owner === 'P2' && u.typeKey !== 'CORE') {
            targetPos = { r, c };
            break outer;
          }
        }
      }
    }
    attackerPos = board[3]?.[3]?.owner === 'P1' ? { r: 3, c: 3 } : { r: 5, c: 3 };
  } else if (isDefeat) {
    targetPos = { r: 6, c: 3 };
    attackerPos = board[2]?.[3]?.owner === 'P2' ? { r: 2, c: 3 } : { r: 1, c: 3 };
  }

  const cfg = isDefeat
    ? {
        pill: 'ANCHOR LOST',
        sub: 'REALITY OVERWRITTEN',
        title: 'DEFEAT',
        wm: 'ANCHOR LOST // DEFEAT',
        desc: '自軍フェーズ・アンカーが破壊され、このラプス区画の確定に失敗しました。',
        pop: 'ANCHOR LOST',
        c1: '#f43f5e',
        c2: '#fda4af'
      }
    : mode === 'wipeout-win'
      ? {
          pill: 'BRANCH CLEARED',
          sub: 'ALL MIRROR UNITS NEUTRALIZED',
          title: 'VICTORY',
          wm: 'LAPSE COLLAPSED // VICTORY',
          desc: '敵世界線の全ユニットを無力化。ラプスは自世界の現実として収束しました。',
          pop: '-90 HP',
          c1: '#facc15',
          c2: '#fef08a'
        }
      : {
          pill: 'ANCHOR BROKEN',
          sub: 'LAPSE COLLAPSED // REALITY LOCKED',
          title: 'VICTORY',
          wm: 'ANCHOR BROKEN // VICTORY',
          desc: '敵フェーズ・アンカーの破壊に成功。ラプス区画は自世界の現実として確定しました。',
          pop: 'ANCHOR BROKEN',
          c1: '#facc15',
          c2: '#fef08a'
        };

  document.getElementById('fn-wm-text').textContent = cfg.wm;
  document.getElementById('fn-reason-pill').textContent = cfg.pill;
  document.getElementById('fn-sub-tag').textContent = cfg.sub;
  document.getElementById('fn-title').textContent = cfg.title;
  document.getElementById('fn-desc').textContent = cfg.desc;
  overlay.classList.toggle('is-defeat', isDefeat);
  stage.classList.toggle('is-finisher-defeat', isDefeat);
  stage.style.setProperty('--fn-accent', cfg.c1);

  const targetTile = document.querySelector(`#board .tile[data-r="${targetPos.r}"][data-c="${targetPos.c}"]`);
  const targetPiece = targetTile?.querySelector('.piece');
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
  if (attackerPos) {
    const atkTile = document.querySelector(`#board .tile[data-r="${attackerPos.r}"][data-c="${attackerPos.c}"]`);
    if (atkTile) {
      atkPiece = atkTile.querySelector('.piece');
      const dx = Math.sign(targetPos.c - attackerPos.c) * 24;
      const dy = Math.sign(targetPos.r - attackerPos.r) * 24;
      atkTile.style.setProperty('--lunge-x', `${dx}px`);
      atkTile.style.setProperty('--lunge-y', `${dy}px`);
      atkTile.classList.remove('is-atk-lunge');
      void atkTile.offsetWidth;
      atkTile.classList.add('is-atk-lunge');
    }
  }

  const node = document.createElement('div');
  node.className = 'ult-fx-node is-fn-slow';
  node.style.left = `${((targetPos.c + 0.5) / 7) * 100}%`;
  node.style.top = `${((targetPos.r + 0.5) / 7) * 100}%`;
  node.style.setProperty('--fx-c', cfg.c1);
  node.style.setProperty('--fx-c2', cfg.c2);

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
    <span class="fx-pop ${isDefeat ? 'is-dmg' : ''} is-big">${esc(cfg.pop)}</span>
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
    const targets = [node, ...node.querySelectorAll('*')];
    if (targetPiece) targets.push(targetPiece);
    if (atkPiece) targets.push(atkPiece);
    for (const el of targets) {
      for (const anim of el.getAnimations()) {
        try { anim.playbackRate = rate; } catch {}
      }
    }
  };

  if (targetTile) targetTile.classList.add('is-fn-target');
  if (targetPiece) targetPiece.classList.add('is-fn-hitstop');
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
    if (targetPiece) {
      targetPiece.classList.remove('is-fn-hitstop');
      const kbDir = isDefeat ? 1 : -1;
      targetPiece.style.setProperty('--fn-kb-x', `${(Math.sign(targetPos.c - (attackerPos?.c ?? 3)) || 0.7) * 48}px`);
      targetPiece.style.setProperty('--fn-kb-y', `${kbDir * 56}px`);
      targetPiece.style.setProperty('--fn-kb-rot', `${kbDir * 15}deg`);
      targetPiece.style.setProperty('--fn-kb-rot2', `${kbDir * 28}deg`);
      targetPiece.classList.add('is-fn-shattering');
    }
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
}

function spawnCasterBurst(fxLayer, casterPos, meta) {
  const node = document.createElement('div');
  node.className = 'ult-fx-node';
  node.style.left = `${((casterPos.c + 0.5) / 7) * 100}%`;
  node.style.top = `${((casterPos.r + 0.5) / 7) * 100}%`;
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

function spawnTargetWave(fxLayer, target, casterPos, meta) {
  const dist = Math.hypot(target.r - casterPos.r, target.c - casterPos.c);
  const delayMs = Math.round(dist * 55);
  const node = document.createElement('div');
  node.className = 'ult-fx-node';
  node.style.left = `${((target.c + 0.5) / 7) * 100}%`;
  node.style.top = `${((target.r + 0.5) / 7) * 100}%`;
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

function playCombatPopupFX(kind, targetPos, amount, attackerPos) {
  const fxLayer = document.getElementById('board-fx-layer');
  if (!fxLayer || !targetPos) return;

  if (kind === 'dmg' && attackerPos) {
    const atkTile = document.querySelector(`#board .tile[data-r="${attackerPos.r}"][data-c="${attackerPos.c}"]`);
    if (atkTile) {
      const dx = Math.sign(targetPos.c - attackerPos.c) * 16;
      const dy = Math.sign(targetPos.r - attackerPos.r) * 16;
      atkTile.style.setProperty('--lunge-x', `${dx}px`);
      atkTile.style.setProperty('--lunge-y', `${dy}px`);
      atkTile.classList.remove('is-atk-lunge');
      void atkTile.offsetWidth;
      atkTile.classList.add('is-atk-lunge');
      setTimeout(() => atkTile.classList.remove('is-atk-lunge'), 360);
    }
  }

  const tgtTile = document.querySelector(`#board .tile[data-r="${targetPos.r}"][data-c="${targetPos.c}"]`);
  if (tgtTile) {
    const cls = kind === 'heal' ? 'is-heal-hit' : 'is-dmg-hit';
    tgtTile.classList.remove('is-dmg-hit', 'is-heal-hit');
    void tgtTile.offsetWidth;
    tgtTile.classList.add(cls);
    setTimeout(() => tgtTile.classList.remove(cls), 620);
  }

  const node = document.createElement('div');
  node.className = 'ult-fx-node';
  node.style.left = `${((targetPos.c + 0.5) / 7) * 100}%`;
  node.style.top = `${((targetPos.r + 0.5) / 7) * 100}%`;

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
    node.style.setProperty('--fx-c', '#dc2d43');
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
      <span class="fx-pop is-dmg is-big">-${amount} HP</span>
    `;
  }

  fxLayer.appendChild(node);
  if (document.getElementById('battle-stage')?.dataset.fxDemo !== '1') setTimeout(() => node.remove(), 1120);
}

function playSkillPopupFX(casterPos, targetPos, casterUnit) {
  const fxLayer = document.getElementById('board-fx-layer');
  const { board } = scenario;
  const pos = casterPos || mockState.selectedPos;
  const unit = casterUnit || (pos ? board[pos.r]?.[pos.c] : null);
  if (!fxLayer || !unit || !pos) return;

  const meta = SKILL_FX_META[unit.typeKey] || SKILL_FX_META.KINESIS;
  if (meta.isHeal) {
    const healPos = targetPos || { r: 3, c: 3 };
    const castTile = document.querySelector(`#board .tile[data-r="${pos.r}"][data-c="${pos.c}"]`);
    if (castTile) {
      castTile.style.setProperty('--skill-fx-color', meta.color);
      castTile.classList.remove('is-skill-cast');
      void castTile.offsetWidth;
      castTile.classList.add('is-skill-cast');
      setTimeout(() => castTile.classList.remove('is-skill-cast'), 480);
    }
    playCombatPopupFX('heal', healPos, 30, pos);
    return;
  }

  const castTile = document.querySelector(`#board .tile[data-r="${pos.r}"][data-c="${pos.c}"]`);
  if (castTile) {
    castTile.style.setProperty('--skill-fx-color', meta.color);
    castTile.classList.remove('is-skill-cast');
    void castTile.offsetWidth;
    castTile.classList.add('is-skill-cast');
    setTimeout(() => castTile.classList.remove('is-skill-cast'), 480);
  }

  const fxPos = (meta.selfCast || !targetPos) ? pos : targetPos;
  const node = document.createElement('div');
  node.className = 'ult-fx-node';
  node.style.left = `${((fxPos.c + 0.5) / 7) * 100}%`;
  node.style.top = `${((fxPos.r + 0.5) / 7) * 100}%`;
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
    <svg class="fx-skill-flare" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${PATHS.skill}</svg>
    ${sparksHtml}
    <span class="fx-pop is-big">${esc(meta.pop)}</span>
  `;
  fxLayer.appendChild(node);
  if (document.getElementById('battle-stage')?.dataset.fxDemo !== '1') setTimeout(() => node.remove(), 1120);
}

function playUltSequence(preferredPos, clickedTarget) {
  clearUltFxState();
  const { board } = scenario;
  const turnOwner = mockState.phase === 'RED' ? 'P2' : 'P1';
  let casterPos = preferredPos || mockState.selectedPos;
  let unit = casterPos ? board[casterPos.r]?.[casterPos.c] : null;
  if (!unit || !DEFS[unit.typeKey]?.skills?.ULT) {
    outer: for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const cand = board[r][c];
        if (cand && cand.owner === turnOwner && DEFS[cand.typeKey]?.skills?.ULT) {
          casterPos = { r, c };
          unit = cand;
          break outer;
        }
      }
    }
  }
  if (!unit || !casterPos) return;

  mockState.selectedPos = { r: casterPos.r, c: casterPos.c };
  mockState.selectedHazardPos = null;
  mockState.commandMode = null;
  renderAllMock();

  const def = DEFS[unit.typeKey];
  const meta = ULT_FX_META[unit.typeKey] || ULT_FX_META.KINESIS;
  const stage = document.getElementById('battle-stage');
  const cutin = document.getElementById('ult-cutin-overlay');
  const fxLayer = document.getElementById('board-fx-layer');
  const triggerBtn = document.getElementById('mock-trigger-ult');
  if (triggerBtn) triggerBtn.classList.add('is-playing');

  const isEnemyUnit = unit.owner === 'P2';
  const uciAccent = isEnemyUnit ? '#a855f7' : '#facc15';
  const uciAccent2 = isEnemyUnit ? '#e9d5ff' : '#fef08a';
  const artSrc = portraitPath(def.slug);
  document.getElementById('uci-wm-text').textContent = `${meta.codename.split(' ')[0]} // ULTIMATE`;
  document.getElementById('uci-ult-badge').textContent = isEnemyUnit ? 'ENEMY // ULTIMATE' : 'ALLY // ULTIMATE';
  document.getElementById('uci-unit-tag').textContent = `${getDisplayName(unit.typeKey, def)} · ${getDisplayRole(unit.typeKey, def)}`;
  document.getElementById('uci-skill-title').textContent = def.skills.ULT.name;
  document.getElementById('uci-skill-sub').textContent = meta.sub;
  document.getElementById('uci-art-img').src = artSrc;
  document.getElementById('uci-art-ghost-img').src = artSrc;

  const sparksEl = document.getElementById('uci-sparks');
  sparksEl.innerHTML = Array.from({ length: 10 }, (_, i) => {
    const top = 14 + (i * 7.6);
    const left = 52 + ((i * 19) % 42);
    const delay = 60 + (i % 5) * 85;
    return `<span class="uci-spark" style="top:${top}%;left:${left}%;--us-delay:${delay}ms"></span>`;
  }).join('');

  cutin.dataset.team = isEnemyUnit ? 'ENEMY' : 'ALLY';
  cutin.style.setProperty('--uci-accent', uciAccent);
  cutin.style.setProperty('--uci-accent-2', uciAccent2);
  cutin.hidden = false;
  cutin.classList.remove('is-active');
  void cutin.offsetWidth;
  cutin.classList.add('is-active');

  const targets = (meta.mode === 'enemy' && clickedTarget && board[clickedTarget.r]?.[clickedTarget.c] && board[clickedTarget.r][clickedTarget.c].owner !== unit.owner)
    ? [{ r: clickedTarget.r, c: clickedTarget.c, hitPiece: true }]
    : getUltTargetTiles(casterPos, unit, board);

  ultTimers.push(setTimeout(() => {
    stage.style.setProperty('--ult-fx-color', meta.color);
    stage.style.setProperty('--ult-fx-color-2', meta.color2);
    stage.classList.remove('is-ult-impact');
    void stage.offsetWidth;
    stage.classList.add('is-ult-impact');

    const isEnemy = unit.owner === 'P2';
    const barEl = document.getElementById(isEnemy ? 'core-bar-enemy' : 'core-bar-ally');
    if (barEl) barEl.classList.add('is-ult-discharging');
    setUltBarProgress(isEnemy ? 'p2-ult-bar' : 'p1-ult-bar', isEnemy ? 'p2-ult-text' : 'p1-ult-text', 0);

    const casterPiece = document.querySelector(`#board .tile[data-r="${casterPos.r}"][data-c="${casterPos.c}"] .piece`);
    if (casterPiece) casterPiece.classList.add('is-ult-casting');

    spawnCasterBurst(fxLayer, casterPos, meta);
    targets.forEach(t => spawnTargetWave(fxLayer, t, casterPos, meta));
  }, 860));

  ultTimers.push(setTimeout(() => {
    if (document.getElementById('battle-stage')?.dataset.fxDemo !== '1') {
      cutin.classList.remove('is-active');
      cutin.hidden = true;
    }
  }, 1250));

  ultTimers.push(setTimeout(() => {
    if (document.getElementById('battle-stage')?.dataset.fxDemo !== '1') {
      clearUltFxState();
      renderTopHudAndTokens();
    }
  }, 2250));
}

function renderLogMock() {
  const box = document.getElementById('log-box');
  const groups = [];
  for (const l of MONO_LOGS) {
    let g = groups[groups.length - 1];
    if (!g || g.turn !== l.turn) {
      g = { turn: l.turn, items: [] };
      groups.push(g);
    }
    g.items.push(l);
  }
  box.innerHTML = groups.map(g => `
    <section class="ar-log-group" data-turn="${g.turn}">
      <div class="ar-log-turn">TURN ${g.turn}</div>
      <div class="ar-log-rows">
        ${g.items.map(l => `<div class="ar-log-row" data-kind="${l.kind}"><span class="ar-log-kind">${l.tag}</span><p>${l.html}</p></div>`).join('')}
      </div>
    </section>
  `).join('');
  document.getElementById('urban-log-count').textContent = MONO_LOGS.length;
  document.querySelector('[data-logfilter="ALL"]').textContent = `ALL (${MONO_LOGS.length})`;
}

function fitStage() {
  const vp = document.getElementById('mock-viewport');
  const stage = document.getElementById('battle-stage');
  if (mockState.viewScale === 'full') {
    document.body.classList.add('is-fullsize');
    stage.style.removeProperty('--mock-scale');
    return;
  }
  document.body.classList.remove('is-fullsize');
  const rect = vp.getBoundingClientRect();
  const s = Math.min((rect.width - 24) / 1600, (rect.height - 20) / 900);
  stage.style.setProperty('--mock-scale', Math.max(0.35, Math.min(1.2, s)));
}

function switchMockScreen(screenName) {
  if (!['home', 'select', 'battle'].includes(screenName)) return;
  clearUltFxState();
  clearFinisherFxState();
  mockState.screen = screenName;
  document.querySelectorAll('[data-screen]').forEach(x => x.classList.toggle('active', x.dataset.screen === screenName));
  if (screenName === 'select') {
    const infoTab = document.getElementById('urban-tab-details');
    if (infoTab) activateTab(infoTab, true);
  }
  renderAllMock();
}

function applySquadToBattleScenario() {
  if (mockState.squadKeys.length !== 5) return;
  const p1Coords = [[6, 1], [6, 2], [3, 3], [6, 4], [6, 5]];
  mockState.squadKeys.forEach((key, idx) => {
    const [r, c] = p1Coords[idx];
    const def = DEFS[key];
    if (!def) return;
    const isBuffedCenter = mockState.bstate !== 'normal' && r === 3 && c === 3;
    scenario.board[r][c] = {
      typeKey: key,
      owner: 'P1',
      hp: isBuffedCenter ? Math.max(10, def.maxHp - 20) : def.maxHp,
      atk: isBuffedCenter ? def.atk + 5 : def.atk,
      stockA: def.skills?.A?.maxStock || 2,
      ultUsed: false,
      buffs: isBuffedCenter ? { shield: { val: 15, turns: 2 }, atk_up: { val: 5, turns: 1 } } : {},
      debuffs: isBuffedCenter ? { vulnerable: { turns: 1 } } : {}
    };
  });
}

function renderHomeScreenMock() {
  const root = document.getElementById('home-screen-view');
  if (!root || mockState.screen !== 'home') return;

  const lobbyKey = SELECTABLE_HERO_KEYS.includes(mockState.lobbyUnit) ? mockState.lobbyUnit : 'KINESIS';
  const def = DEFS[lobbyKey];
  const meta = MONO_UNITS[lobbyKey] || {};
  const roleName = getDisplayRole(lobbyKey, def);

  root.innerHTML = `
    <header class="hm-topbar">
      <div class="hm-glass hm-profile-pill">
        <div class="hm-avatar-ring">
          <img src="${portraitPath(def.slug)}" alt="${esc(getDisplayName(lobbyKey, def))}" draggable="false">
        </div>
        <div class="hm-profile-meta">
          <div class="hm-profile-top">
            <strong class="hm-profile-name">OBSERVER // ID-07</strong>
            <span class="hm-rank-tag">LV.24 // SINGULAR II</span>
          </div>
          <div class="hm-profile-sub">
            <span>MONOLITH DIVISION</span>
            <span>ANCHOR SYNC <b>100%</b></span>
          </div>
        </div>
      </div>

      <div class="hm-top-right">
        <div class="hm-glass hm-resource-pill">
          <span class="hm-res-dot"></span>
          <span class="hm-res-lbl">SHARD</span>
          <strong class="hm-res-val">2,480</strong>
        </div>
        <div class="hm-glass hm-resource-pill">
          <span class="hm-res-dot is-cyan"></span>
          <span class="hm-res-lbl">PHASE CELL</span>
          <strong class="hm-res-val">05 / 05</strong>
        </div>
        <div class="hm-glass hm-resource-pill">
          <span class="hm-res-dot is-purple"></span>
          <span class="hm-res-lbl">STREAK</span>
          <strong class="hm-res-val">04 WIN</strong>
        </div>
        <button type="button" class="hm-glass hm-util-btn" data-home-go="select" title="部隊編成・エージェント">
          ${icon('skill')}
          <span class="hm-notice-dot"></span>
        </button>
        <button type="button" class="hm-glass hm-util-btn" data-home-go="battle" title="バトル画面プレビュー">
          ${icon('help')}
        </button>
      </div>
    </header>

    <nav class="hm-side-rail" aria-label="ホームサブメニュー">
      <button type="button" class="hm-glass hm-rail-btn is-highlight" data-home-go="select">
        ${icon('assault')}
        <span>部隊編成</span>
      </button>
      <button type="button" class="hm-glass hm-rail-btn" data-home-go="select">
        ${icon('disruptor')}
        <span>隊員名鑑</span>
      </button>
      <button type="button" class="hm-glass hm-rail-btn" data-home-go="battle">
        ${icon('core')}
        <span>戦術模擬</span>
      </button>
      <button type="button" class="hm-glass hm-rail-btn" data-home-cycle-unit="1">
        ${icon('move')}
        <span>看板交代</span>
      </button>
      <div class="hm-rail-spacer"></div>
      <div class="hm-glass hm-event-chip">
        <small>LAPSE</small>
        <strong>SEASON<br>01</strong>
      </div>
    </nav>

    <section class="hm-showcase" aria-label="看板ユニットショーケース">
      <div class="hm-reticle-bg" aria-hidden="true">
        <div class="hm-reticle-ring"></div>
      </div>
      <div class="hm-watermark" aria-hidden="true">
        <span>MONOLITH // ${esc(meta.code || lobbyKey)}</span>
        <strong>${esc(meta.en || lobbyKey)}</strong>
      </div>
      <div class="hm-hero-art-wrap">
        <img src="${portraitPath(def.slug)}" alt="${esc(getDisplayName(lobbyKey, def))}" draggable="false">
      </div>
      <div class="hm-dialogue-dock">
        <div class="hm-glass hm-dialogue-card">
          <div class="hm-dialogue-head">
            <div class="hm-char-tag-row">
              <span class="hm-char-role-pill">${svgIcon(ROLE_ICONS[def.role] || 'assault')}<span>${esc(roleName)}</span></span>
              <strong class="hm-char-name">${esc(getDisplayName(lobbyKey, def))}</strong>
            </div>
            <span class="hm-char-code">${esc(meta.code || '')}</span>
          </div>
          <p class="hm-quote">${esc(meta.quote || '')}</p>
        </div>
        <div class="hm-glass hm-switcher-pill" aria-label="看板キャラ切り替え">
          <button type="button" class="hm-sw-btn" data-home-step="-1" title="前の隊員">◀</button>
          <span class="hm-sw-label">${String(SELECTABLE_HERO_KEYS.indexOf(lobbyKey) + 1).padStart(2, '0')} / 12</span>
          <button type="button" class="hm-sw-btn" data-home-step="1" title="次の隊員">▶</button>
        </div>
      </div>
    </section>

    <section class="hm-command-deck" aria-label="対戦モード選択">
      <button type="button" class="hm-glass hm-mode-btn is-solo" data-home-go="select" data-mode="SOLO">
        <div class="hm-mode-copy">
          <small>SOLO MODE</small>
          <strong>ソロモード</strong>
        </div>
        <span class="hm-mode-arrow">➔</span>
      </button>

      <button type="button" class="hm-glass hm-mode-btn is-online" data-home-go="select" data-mode="ONLINE">
        <div class="hm-mode-copy">
          <small>NETWORK MATCH</small>
          <strong>ネット対戦</strong>
        </div>
        <span class="hm-mode-arrow">➔</span>
      </button>
    </section>
  `;

  root.querySelectorAll('[data-home-go]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode) mockState.homeMatchMode = btn.dataset.mode;
      switchMockScreen(btn.dataset.homeGo);
    });
  });
  root.querySelectorAll('[data-home-step], [data-home-cycle-unit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = Number(btn.dataset.homeStep || 1);
      const curIdx = SELECTABLE_HERO_KEYS.indexOf(mockState.lobbyUnit);
      const nextIdx = (curIdx + step + SELECTABLE_HERO_KEYS.length) % SELECTABLE_HERO_KEYS.length;
      mockState.lobbyUnit = SELECTABLE_HERO_KEYS[nextIdx];
      mockState.selectFocusKey = mockState.lobbyUnit;
      renderHomeScreenMock();
    });
  });
}

function toggleSquadUnit(key) {
  const idx = mockState.squadKeys.indexOf(key);
  if (idx >= 0) {
    mockState.squadKeys.splice(idx, 1);
  } else if (mockState.squadKeys.length < 5) {
    mockState.squadKeys.push(key);
  } else {
    return;
  }
  mockState.selectFocusKey = key;
  renderAllMock();
}

function renderSelectScreenMock() {
  const formPanel = document.getElementById('select-formation-panel');
  const rosterPanel = document.getElementById('select-roster-panel');
  const deployBtn = document.getElementById('btn-deploy-squad');
  if (!formPanel || !rosterPanel || mockState.screen !== 'select') return;

  const squadCount = mockState.squadKeys.length;
  const roleCounts = { ASSAULT: 0, SENTINEL: 0, DISRUPTOR: 0, SUPPORT: 0 };
  mockState.squadKeys.forEach(k => {
    const r = DEFS[k]?.role;
    if (r && roleCounts[r] !== undefined) roleCounts[r]++;
  });

  const slotsHtml = Array.from({ length: 5 }, (_, i) => {
    const key = mockState.squadKeys[i];
    if (!key || !DEFS[key]) {
      return `
        <div class="sel-slot is-empty">
          <span class="sel-slot-num">SLOT 0${i + 1}</span>
          <div class="sel-slot-empty-copy">
            <strong>UNASSIGNED</strong>
            <span>下のユニット一覧から選択</span>
          </div>
        </div>
      `;
    }
    const def = DEFS[key];
    const focused = mockState.selectFocusKey === key;
    return `
      <div class="sel-slot ${focused ? 'is-focused' : ''}" data-role="${def.role}" data-sel-focus="${key}">
        <span class="sel-slot-num">SLOT 0${i + 1}</span>
        <button type="button" class="sel-slot-remove" data-sel-remove="${key}" title="編成から外す" aria-label="${esc(getDisplayName(key, def))}を編成から外す">×</button>
        <div class="sel-slot-face">
          <img src="${portraitPath(def.slug)}" alt="${esc(getDisplayName(key, def))}" draggable="false">
        </div>
        <div class="sel-slot-info">
          <span class="sel-slot-role"><i class="sel-slot-role-dot"></i>${esc(getDisplayRole(key, def))}</span>
          <strong class="sel-slot-name">${esc(getDisplayName(key, def))}</strong>
          <div class="sel-slot-stats">
            <b>HP ${def.maxHp}</b>
            <span>ATK ${def.atk}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  formPanel.innerHTML = `
    <div class="sel-head">
      <div class="sel-head-left">
        <button type="button" class="sel-back-btn" id="sel-back-home">${icon('home')}<span>HOME</span></button>
        <div class="sel-title-group">
          <span class="sel-eyebrow">${esc(mockState.homeMatchMode === 'ONLINE' ? 'NETWORK' : 'SOLO')}</span>
          <h2 class="sel-title">出撃部隊編成</h2>
        </div>
        <span class="sel-count-pill ${squadCount < 5 ? 'is-incomplete' : ''}">${squadCount} / 5</span>
      </div>
      <div class="sel-head-actions">
        <div class="sel-role-mix" aria-label="ロール構成">
          <span class="sel-mix-chip ${roleCounts.ASSAULT ? 'is-nonzero' : ''}">ASSAULT<b>${roleCounts.ASSAULT}</b></span>
          <span class="sel-mix-chip ${roleCounts.SENTINEL ? 'is-nonzero' : ''}">SENTINEL<b>${roleCounts.SENTINEL}</b></span>
          <span class="sel-mix-chip ${roleCounts.DISRUPTOR ? 'is-nonzero' : ''}">DISRUPTOR<b>${roleCounts.DISRUPTOR}</b></span>
          <span class="sel-mix-chip ${roleCounts.SUPPORT ? 'is-nonzero' : ''}">SUPPORT<b>${roleCounts.SUPPORT}</b></span>
        </div>
        <button type="button" class="sel-act-btn" id="sel-auto-pick">おまかせ5体</button>
        <button type="button" class="sel-act-btn is-danger" id="sel-clear-pick">全解除</button>
      </div>
    </div>
    <div class="sel-slots-grid">${slotsHtml}</div>
  `;

  const roleFilters = [
    { key: 'ALL', label: 'ALL (12)' },
    { key: 'ASSAULT', label: 'ASSAULT (3)' },
    { key: 'SENTINEL', label: 'SENTINEL (3)' },
    { key: 'DISRUPTOR', label: 'DISRUPTOR (3)' },
    { key: 'SUPPORT', label: 'SUPPORT (3)' }
  ];

  const visibleKeys = mockState.selectRoleFilter === 'ALL'
    ? SELECTABLE_HERO_KEYS
    : SELECTABLE_HERO_KEYS.filter(k => DEFS[k]?.role === mockState.selectRoleFilter);

  const tilesHtml = visibleKeys.map(key => {
    const def = DEFS[key];
    const slotIdx = mockState.squadKeys.indexOf(key);
    const inSquad = slotIdx >= 0;
    const focused = mockState.selectFocusKey === key;
    return `
      <div class="sel-unit-tile ${inSquad ? 'is-in-squad' : ''} ${focused ? 'is-focused' : ''}" data-sel-card="${key}">
        <div class="sel-tile-top">
          <span class="sel-tile-role-lbl">${esc(getDisplayRole(key, def))}</span>
        </div>
        <div class="sel-piece-stage">
          <div class="piece unit p1" data-role="${def.role}">
            <span class="piece-face"><img class="anime-art" src="${portraitPath(def.slug)}" alt="${esc(getDisplayName(key, def))}" draggable="false"></span>
            <span class="piece-role">${icon(ROLE_ICONS[def.role] || 'assault')}</span>
            <span class="piece-readout">
              <svg class="piece-dock-svg" viewBox="0 0 80 35" preserveAspectRatio="none" aria-hidden="true">
                <path d="M 4,2 L 28,2 Q 30,2 30.8,4 L 33.2,15 Q 34,17 36,17 L 54,17 Q 56,17 56.8,15 L 58.8,5.5 Q 59.6,3.5 61.6,3.5 L 76,3.5 Q 79,3.5 79,6.5 L 79,30 Q 79,34 75,34 L 5,34 Q 1,34 1,30 L 1,5 Q 1,2 4,2 Z"/>
              </svg>
              <span class="piece-values">
                <b>${def.maxHp}</b>
                <span>${def.atk}</span>
              </span>
              <span class="piece-hp-track"><i style="width:100%"></i></span>
              <span class="piece-name">${esc(getDisplayName(key, def))}</span>
            </span>
          </div>
        </div>
        <div class="sel-tile-foot">
          <button type="button" class="sel-tile-toggle ${inSquad ? 'is-in' : ''}" data-sel-toggle="${key}">
            ${inSquad ? `0${slotIdx + 1} 編成中` : '+ 編成'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  rosterPanel.innerHTML = `
    <div class="sel-head">
      <div class="sel-head-left">
        <div class="sel-title-group">
          <span class="sel-eyebrow">ROSTER // ALL UNITS</span>
          <h2 class="sel-title">ユニット一覧</h2>
        </div>
      </div>
      <div class="sel-filter-row" role="group" aria-label="ロールフィルター">
        ${roleFilters.map(f => `<button type="button" class="ar-filter-btn ${mockState.selectRoleFilter === f.key ? 'is-active' : ''}" data-sel-filter="${f.key}">${f.label}</button>`).join('')}
      </div>
    </div>
    <div class="sel-roster-grid">${tilesHtml}</div>
  `;

  if (deployBtn) {
    const ready = squadCount === 5;
    deployBtn.disabled = !ready;
    document.getElementById('deploy-main-text').textContent = '出撃開始';
    document.getElementById('deploy-sub-text').textContent = ready ? '5 / 5 READY' : `あと ${5 - squadCount} 体選択`;
  }

  document.getElementById('sel-back-home')?.addEventListener('click', () => switchMockScreen('home'));
  document.getElementById('sel-clear-pick')?.addEventListener('click', () => {
    mockState.squadKeys = [];
    renderAllMock();
  });
  document.getElementById('sel-auto-pick')?.addEventListener('click', () => {
    const pool = [...SELECTABLE_HERO_KEYS].sort(() => Math.random() - 0.5);
    mockState.squadKeys = pool.slice(0, 5);
    mockState.selectFocusKey = mockState.squadKeys[0];
    renderAllMock();
  });

  formPanel.querySelectorAll('[data-sel-remove]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleSquadUnit(btn.dataset.selRemove);
    });
  });
  formPanel.querySelectorAll('[data-sel-focus]').forEach(slot => {
    slot.addEventListener('click', () => {
      mockState.selectFocusKey = slot.dataset.selFocus;
      renderAllMock();
    });
  });

  rosterPanel.querySelectorAll('[data-sel-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      mockState.selectRoleFilter = btn.dataset.selFilter;
      renderSelectScreenMock();
    });
  });
  rosterPanel.querySelectorAll('[data-sel-toggle]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleSquadUnit(btn.dataset.selToggle);
    });
  });
  rosterPanel.querySelectorAll('[data-sel-card]').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.selCard;
      if (mockState.selectFocusKey === key) {
        toggleSquadUnit(key);
      } else {
        mockState.selectFocusKey = key;
        renderAllMock();
      }
    });
  });
}

function renderAllMock() {
  const stage = document.getElementById('battle-stage');
  stage.dataset.screen = mockState.screen;
  if (mockState.screen === 'home') {
    renderHomeScreenMock();
  } else if (mockState.screen === 'select') {
    renderSelectScreenMock();
    renderInspectorMock();
  } else {
    renderTopHudAndTokens();
    renderBoardMock();
    renderInspectorMock();
    renderLogMock();
  }
  fitStage();
}

document.querySelectorAll('[data-icon]').forEach(el => {
  el.innerHTML = icon(el.dataset.icon);
});

const tabs = [...document.querySelectorAll('.urban-tab')];
function activateTab(tab, skipGlitch = false) {
  const wasSelected = tab.getAttribute('aria-selected') === 'true';
  tabs.forEach(b => {
    const active = b === tab;
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
    const p = document.getElementById(b.getAttribute('aria-controls'));
    if (p) p.hidden = !active;
  });
  if (!skipGlitch && !wasSelected) triggerHoloGlitch();
}
tabs.forEach(tab => {
  tab.addEventListener('click', () => activateTab(tab));
});

const logBox = document.getElementById('log-box');
const filterBtns = [...document.querySelectorAll('[data-logfilter]')];
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const f = btn.dataset.logfilter;
    logBox.dataset.filter = f;
    filterBtns.forEach(b => b.classList.toggle('is-active', b === btn));
  });
});

document.querySelectorAll('[data-screen]').forEach(b => b.addEventListener('click', () => {
  switchMockScreen(b.dataset.screen);
}));
document.getElementById('btn-deploy-squad')?.addEventListener('click', () => {
  if (mockState.squadKeys.length !== 5) return;
  applySquadToBattleScenario();
  switchMockScreen('battle');
});
document.querySelector('.top-left-hud .icon-button')?.addEventListener('click', () => {
  switchMockScreen('home');
});
document.querySelectorAll('[data-phase]').forEach(b => b.addEventListener('click', () => {
  clearUltFxState();
  mockState.phase = b.dataset.phase;
  mockState.usedTokens = { atk: false, move: false, ex: false };
  mockState.selectedPos = mockState.phase === 'RED' ? { r: 1, c: 3 } : (mockState.bstate === 'normal' ? { r: 5, c: 3 } : { r: 3, c: 3 });
  mockState.selectedHazardPos = null;
  document.querySelectorAll('[data-phase]').forEach(x => x.classList.toggle('active', x === b));
  renderAllMock();
}));
document.querySelectorAll('[data-bstate]').forEach(b => b.addEventListener('click', () => {
  clearUltFxState();
  mockState.bstate = b.dataset.bstate;
  scenario = buildScenario();
  mockState.selectedPos = mockState.bstate === 'normal' ? { r: 5, c: 3 } : { r: 3, c: 3 };
  mockState.selectedHazardPos = null;
  mockState.commandMode = mockState.bstate === 'skill' ? 'SKILL_A' : null;
  document.querySelectorAll('[data-bstate]').forEach(x => x.classList.toggle('active', x === b));
  renderAllMock();
}));
document.getElementById('mock-trigger-dmg')?.addEventListener('click', () => {
  const { board } = scenario;
  const target = mockState.selectedPos && board[mockState.selectedPos.r]?.[mockState.selectedPos.c]
    ? mockState.selectedPos
    : { r: 1, c: 3 };
  const unit = board[target.r]?.[target.c];
  const baseDmg = 30;
  const dmg = unit?.debuffs?.vulnerable ? Math.round(baseDmg * 1.5) : baseDmg;
  playCombatPopupFX('dmg', target, dmg, null);
});
document.getElementById('mock-trigger-heal')?.addEventListener('click', () => {
  const { board } = scenario;
  const target = mockState.selectedPos && board[mockState.selectedPos.r]?.[mockState.selectedPos.c]
    ? mockState.selectedPos
    : { r: 3, c: 3 };
  playCombatPopupFX('heal', target, 30, null);
});
document.getElementById('mock-trigger-skill')?.addEventListener('click', () => {
  const { board } = scenario;
  let casterPos = mockState.selectedPos;
  let unit = casterPos ? board[casterPos.r]?.[casterPos.c] : null;
  if (!unit || !DEFS[unit.typeKey]?.skills?.A) {
    casterPos = { r: 3, c: 3 };
    unit = board[3]?.[3];
    if (!unit || !DEFS[unit.typeKey]?.skills?.A) {
      casterPos = { r: 6, c: 1 };
      unit = board[6]?.[1];
    }
  }
  if (!unit || !casterPos) return;
  const defaultTarget = unit.typeKey === 'IRIS'
    ? (board[3]?.[3]?.owner === unit.owner ? { r: 3, c: 3 } : casterPos)
    : (casterPos.r > 0 && !board[casterPos.r - 1]?.[casterPos.c] ? { r: casterPos.r - 1, c: casterPos.c } : casterPos);
  playSkillPopupFX(casterPos, defaultTarget, unit);
});
let turnCutinTimer = null;
function playTurnCutin(team = 'ALLY') {
  clearUltFxState();
  clearFinisherFxState();
  const overlay = document.getElementById('turn-cutin-overlay');
  if (!overlay) return;
  if (turnCutinTimer) clearTimeout(turnCutinTimer);
  const isEnemy = team === 'ENEMY' || team === 'RED';
  const turnTxt = `TURN ${String(scenario.turn || 3).padStart(2, '0')}`;
  overlay.dataset.team = isEnemy ? 'ENEMY' : 'ALLY';
  overlay.classList.toggle('is-enemy', isEnemy);
  document.getElementById('tci-wm-text').textContent = isEnemy ? `ENEMY PHASE // ${turnTxt}` : `ALLY PHASE // ${turnTxt}`;
  document.getElementById('tci-pill').textContent = turnTxt;
  document.getElementById('tci-code').textContent = isEnemy ? 'MIRROR WORLD // INTERCEPT' : 'PHASE SHIFT // SYNCHRONIZED';
  document.getElementById('tci-title').textContent = isEnemy ? 'ENEMY TURN' : 'ALLY TURN';
  document.getElementById('tci-sub').textContent = isEnemy ? '敵世界線の行動フェーズへ移行します' : '自軍行動フェーズを開始します';
  overlay.hidden = false;
  overlay.classList.remove('is-active');
  void overlay.offsetWidth;
  overlay.classList.add('is-active');
  if (document.getElementById('battle-stage')?.dataset.fxDemo !== '1') {
    turnCutinTimer = setTimeout(() => {
      overlay.classList.remove('is-active');
      overlay.hidden = true;
    }, 1350);
  }
}

document.getElementById('mock-trigger-ult')?.addEventListener('click', () => {
  playUltSequence(mockState.selectedPos);
});
document.getElementById('mock-trigger-turn-ally')?.addEventListener('click', () => {
  if (mockState.phase !== 'BLUE') {
    mockState.phase = 'BLUE';
    document.querySelectorAll('[data-phase]').forEach(x => x.classList.toggle('active', x.dataset.phase === 'BLUE'));
    renderAllMock();
  }
  playTurnCutin('ALLY');
});
document.getElementById('mock-trigger-turn-enemy')?.addEventListener('click', () => {
  if (mockState.phase !== 'RED') {
    mockState.phase = 'RED';
    document.querySelectorAll('[data-phase]').forEach(x => x.classList.toggle('active', x.dataset.phase === 'RED'));
    renderAllMock();
  }
  playTurnCutin('ENEMY');
});
document.getElementById('mock-trigger-fin-core')?.addEventListener('click', () => {
  playFinisherSequence('core-win');
});
document.getElementById('mock-trigger-fin-wipe')?.addEventListener('click', () => {
  playFinisherSequence('wipeout-win');
});
document.getElementById('mock-trigger-fin-defeat')?.addEventListener('click', () => {
  playFinisherSequence('defeat');
});
document.getElementById('fn-btn-again')?.addEventListener('click', () => {
  clearFinisherFxState();
  renderAllMock();
});
document.getElementById('fn-btn-title')?.addEventListener('click', () => {
  clearFinisherFxState();
  renderAllMock();
});
document.getElementById('fn-btn-replay')?.addEventListener('click', () => {
  playFinisherSequence(lastFinisherMode);
});
document.querySelectorAll('[data-viewscale]').forEach(b => b.addEventListener('click', () => {
  mockState.viewScale = b.dataset.viewscale;
  document.querySelectorAll('[data-viewscale]').forEach(x => x.classList.toggle('active', x === b));
  fitStage();
}));

const labBar = document.getElementById('mock-lab-bar');
const toggleLabBar = () => { labBar.classList.toggle('is-collapsed'); fitStage(); };
document.getElementById('mock-toggle-bar').addEventListener('click', toggleLabBar);
window.addEventListener('keydown', e => { if (e.key === 'm' || e.key === 'M') toggleLabBar(); });
window.addEventListener('resize', fitStage);

const etBtn = document.getElementById('btn-end-turn');
const etFill = etBtn.querySelector('.hold-fill');
let holdTimer = null;
const stopHold = () => {
  if (holdTimer) cancelAnimationFrame(holdTimer);
  holdTimer = null;
  etBtn.classList.remove('is-holding', 'is-held-full');
  etBtn.style.setProperty('--hold-p', '0');
  etFill.style.transform = 'scaleX(0)';
};
etBtn.addEventListener('pointerdown', () => {
  if (etBtn.disabled) return;
  etBtn.classList.add('is-holding');
  etBtn.classList.remove('is-held-full');
  const t0 = performance.now();
  const tick = now => {
    const p = Math.min(1, (now - t0) / 400);
    etBtn.style.setProperty('--hold-p', String(p));
    etFill.style.transform = `scaleX(${p})`;
    if (p < 1) holdTimer = requestAnimationFrame(tick);
    else {
      etBtn.classList.add('is-held-full');
      stopHold();
      const nextPhase = mockState.phase === 'RED' ? 'BLUE' : 'RED';
      mockState.phase = nextPhase;
      document.querySelectorAll('[data-phase]').forEach(x => x.classList.toggle('active', x.dataset.phase === nextPhase));
      renderAllMock();
      playTurnCutin(nextPhase === 'RED' ? 'ENEMY' : 'ALLY');
    }
  };
  holdTimer = requestAnimationFrame(tick);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => etBtn.addEventListener(ev, stopHold));

// URLクエリパラメータでの初期状態指定 (?screen=home|select|battle, ?phase=RED, ?bstate=skill, ?select=2,3, ?hazard=4,4, ?tab=log, ?bar=0)
const params = new URLSearchParams(window.location.search);
const pScreen = params.get('screen');
if (pScreen && ['home', 'select', 'battle'].includes(pScreen)) {
  mockState.screen = pScreen;
  document.querySelectorAll('[data-screen]').forEach(x => x.classList.toggle('active', x.dataset.screen === pScreen));
}
const pPhase = params.get('phase');
if (pPhase && ['BLUE', 'RED', 'DEPLOY'].includes(pPhase)) {
  mockState.phase = pPhase;
  document.querySelectorAll('[data-phase]').forEach(x => x.classList.toggle('active', x.dataset.phase === pPhase));
  if (pPhase === 'RED') mockState.selectedPos = { r: 1, c: 3 };
}
const pBstate = params.get('bstate');
if (pBstate && ['rich', 'normal', 'skill', 'ult'].includes(pBstate)) {
  mockState.bstate = pBstate;
  scenario = buildScenario();
  if (pBstate === 'normal') mockState.selectedPos = { r: 5, c: 3 };
  if (pBstate === 'skill') mockState.commandMode = 'SKILL_A';
  document.querySelectorAll('[data-bstate]').forEach(x => x.classList.toggle('active', x.dataset.bstate === pBstate));
}
const pSelect = params.get('select');
if (pSelect === 'none') {
  mockState.selectedPos = null;
  mockState.selectedHazardPos = null;
} else if (pSelect && /^\d,\d$/.test(pSelect)) {
  const [sr, sc] = pSelect.split(',').map(Number);
  mockState.selectedPos = { r: sr, c: sc };
  mockState.selectedHazardPos = null;
}
const pHazard = params.get('hazard');
if (pHazard && /^\d,\d$/.test(pHazard)) {
  const [hr, hc] = pHazard.split(',').map(Number);
  mockState.selectedPos = null;
  mockState.selectedHazardPos = { r: hr, c: hc };
}
if (params.get('tab') === 'log') {
  const logTab = document.getElementById('urban-tab-log');
  if (logTab) activateTab(logTab, true);
}
if (params.get('bar') === '0' || params.get('bar') === 'collapsed') {
  labBar.classList.add('is-collapsed');
}

renderLogMock();
renderAllMock();
const fxParam = params.get('fx');
if (fxParam === 'demo') {
  document.getElementById('battle-stage').dataset.fxDemo = '1';
  playCombatPopupFX('dmg', { r: 2, c: 2 }, 30, { r: 3, c: 3 });
  playCombatPopupFX('heal', { r: 6, c: 1 }, 30, { r: 6, c: 5 });
  playSkillPopupFX({ r: 3, c: 3 }, { r: 3, c: 3 });
} else if (fxParam === 'turn-ally') {
  document.getElementById('battle-stage').dataset.fxDemo = '1';
  playTurnCutin('ALLY');
} else if (fxParam === 'turn-enemy') {
  document.getElementById('battle-stage').dataset.fxDemo = '1';
  mockState.phase = 'RED';
  renderAllMock();
  playTurnCutin('ENEMY');
} else if (fxParam === 'ult') {
  document.getElementById('battle-stage').dataset.fxDemo = '1';
  playUltSequence({ r: 3, c: 3 });
} else if (fxParam === 'win') {
  playFinisherSequence('wipeout-win');
} else if (fxParam === 'lose') {
  playFinisherSequence('defeat');
}
