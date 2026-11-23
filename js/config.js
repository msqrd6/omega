/* ==============================================================
   config.js: ゲーム設定 & ロール・スキル・状態効果（バフ/デバフ）定義
   (RULEBOOK.md準拠: 5大クラス・4大ロール・正式名称完全同期版)
   ============================================================== */

export const ROWS = 7;
export const COLS = 7;

export function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

// チーム共通ウルト解放に必要な累計与ダメージ量 (通常攻撃のみで蓄積)
export const ULT_REQUIRED_DAMAGE = 100;

// 行動オーダー制の初期値 (移動 1・攻撃 1)
export const DEFAULT_ACTION_ORDERS = {
  MOVE: 1,
  ATK: 1
};

// 初期配置可能な自陣行（自陣から縦2マス以内）
export const DEPLOYABLE_ROWS = {
  P1: [5, 6], // BLUE (先攻): 下側2行 (行5〜6)
  P2: [0, 1]  // RED (後攻): 上側2行 (行0〜1)
};

// 選択可能なヒーロー一覧 (全12体から5体選択 - 正式キャラクター名)
export const SELECTABLE_HERO_KEYS = [
  'KINESIS', 'VEIL', 'BLAST',
  'WARDEN', 'VULCAN', 'SMOG',
  'GLITCH', 'PRISM', 'HIVE',
  'LILY', 'NEXUS', 'HALO'
];

export const DEFAULT_ROSTER = ['KINESIS', 'BLAST', 'WARDEN', 'GLITCH', 'LILY'];
export const DEFAULT_AI_ROSTER = ['VEIL', 'SMOG', 'WARDEN', 'GLITCH', 'LILY'];

// 周囲8マス共通オフセット
export const SURROUND_8_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

// バフ・デバフのメタ情報定義
export const STATUS_EFFECT_DEFS = {
  atk_up: {
    name: "攻撃力増強",
    icon: "🔥",
    type: "buff",
    color: "#ff6600",
    desc: "通常攻撃のダメージが増加します"
  },
  shield: {
    name: "シールド増強",
    icon: "🛡️",
    type: "buff",
    color: "#00d2ff",
    desc: "耐久値分の被ダメージを肩代わりします（持続ターン経過で消失）"
  },
  shadow_drain: {
    name: "シャドウ・ドレイン",
    icon: "🩸",
    type: "buff",
    color: "#b366ff",
    desc: "発動中（このターン中）、敵に与えたダメージ分だけ自身のHPを吸収・回復します"
  },
  vulnerable: {
    name: "弱体化",
    icon: "🎯",
    type: "debuff",
    color: "#ea580c",
    desc: "持続中は被ダメージが1.5倍になります"
  },
  disarm: {
    name: "攻撃阻害",
    icon: "💢",
    type: "debuff",
    color: "#f59e0b",
    desc: "通常攻撃を行うことができません"
  },
  bind: {
    name: "行動阻害",
    icon: "⛓️",
    type: "debuff",
    color: "#a855f7",
    desc: "移動を行うことができません"
  },
  silence: {
    name: "スキル阻害",
    icon: "🤐",
    type: "debuff",
    color: "#64748b",
    desc: "すべてのスキル（通常スキル/ULT）を使用できません"
  }
};

export const BOARD_MARK_DEFS = {
  link: { name: 'リンク', icon: 'st_link', targetsAllies: true, color: '#38bdf8', color2: '#b7f5ff' },
  trace: { name: 'トレース', icon: 'disrupt', targetsAllies: false, color: '#a855f7', color2: '#f2b8ff' }
};

// 全エンティティのマスター定義
const BASE_DEFINITIONS = {
  // ==========================================
  // 1. アサルト (ASSAULT)
  // ==========================================
  KINESIS: {
    name: "キネシス",
    role: "ASSAULT",
    roleName: "アサルト",
    roleClass: "role-assault",
    icon: "⚡",
    maxHp: 95,
    atk: 24,
    desc: "音速を超える身のこなしで空間を切り裂くサイバー突撃兵。敵ユニットの撃破やスキルで専用移動オーダーを獲得し、次の目標へ踏み込む。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "モメンタム・ドライブ",
      icon: "⚡",
      desc: "自軍ターン中、自身が敵ユニットを撃破した時、キネシス専用の【追加移動オーダー (+1 EX MOVE)】を1枚獲得する。"
    },
    skills: {
      A: {
        name: "ライトニング・ステップ",
        maxStock: 2,
        desc: "キネシス専用の【追加移動オーダー (+1 EX MOVE)】を1枚獲得する。",
        type: "EX_MOVE_ORDER",
        range: 0
      },
      ULT: {
        name: "ライトニング・ラッシュ",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身にキネシス専用の【追加攻撃オーダー (+1 ATTACK)】を即座に 1枚 付与する！",
        type: "EX_ATK_ORDER",
        range: 0
      }
    }
  },

  VEIL: {
    name: "ヴェイル",
    role: "ASSAULT",
    roleName: "アサルト",
    roleClass: "role-assault",
    icon: "👤",
    maxHp: 80,
    atk: 30,
    desc: "自らの初期配置位置に影の領域（ディメンション・ゾーン）を敷設し、そこを起点として自在に戦場を跳梁する異相の暗殺者。全ユニット最高峰の素の通常攻撃力（30 DMG）を誇る。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "シャドウ・オリジン",
      icon: "👤",
      desc: "バトル開始時、初期配置マスに「ディメンション・ゾーン（侵入中の敵は常に弱体化1.5倍）」を自動展開。"
    },
    skills: {
      A: {
        name: "テレポート",
        maxStock: 2,
        desc: "自軍ディメンション・ゾーン（空きマス）へ即座にテレポート移動する（移動オーダー消費なし）。",
        type: "TELEPORT_TO_PHANTOM_ZONE",
        range: 99
      },
      ULT: {
        name: "シャドウ・ドレイン",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "発動中（この自軍ターン中）、自身が敵に与えたダメージ分、自身のHPを即座に吸収・回復する！",
        type: "SHADOW_DRAIN",
        range: 0
      }
    }
  },

  BLAST: {
    name: "ブラスト",
    role: "ASSAULT",
    roleName: "アサルト",
    roleClass: "role-assault",
    icon: "💣",
    maxHp: 110,
    atk: 20,
    desc: "前線へ切り込み、不可視の地雷と自身の肉体を爆破兵器に変える狂気の突撃爆破兵。高いHPを持ち、攻撃してきた敵へ即座に反撃爆破を浴びせ、敵陣を範囲爆破で制圧する。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "カウンター・デトネーション",
      icon: "💣",
      desc: "自身が敵ユニットに攻撃された時、攻撃してきた敵ユニットに即座に 10 ダメージ の爆破反撃を行う。"
    },
    skills: {
      A: {
        name: "マイン・プラント",
        maxStock: 2,
        desc: "半径2マス以内の駒と自軍マインがないマスにブラスト・マインを設置する。敵の侵入で20ダメージ。ゾーン上にも設置できる。",
        type: "PLACE_MINE_TRAP",
        range: 2,
        damage: 20
      },
      ULT: {
        name: "マキシマム・エクスプロージョン",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身に10ダメージ。自身を中心とする半径2マス以内のすべての敵ユニット・敵オブジェクト・敵アンカーに30ダメージを与える。",
        type: "MAXIMUM_EXPLOSION",
        damage: 30,
        selfDamage: 10,
        range: 2
      }
    }
  },

  BIT: {
    name: "ビット",
    role: "DISRUPTOR",
    roleName: "ディスラプター",
    roleClass: "role-disruptor",
    icon: "🛰️",
    maxHp: 15,
    atk: 5,
    desc: "ハイヴから射出される自律戦闘子機。毎自軍ターン開始時に専用の攻撃オーダーを獲得し、共通オーダーを消費せずに自律攻撃を行う。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "自律ドライブ",
      icon: "🛰️",
      desc: "展開時と毎自軍ターン開始時に、自軍の共通行動オーダーとは別に「ビット専用攻撃オーダー+1」を獲得する（共通オーダーを消費せずに、各ビットが自律的に攻撃を行える）。"
    },
    skills: {
      A: {
        name: "自壊",
        maxStock: 1,
        desc: "自身を破壊する。",
        type: "SELF_DESTRUCT",
        range: 0,
        selfOnly: true
      }
    }
  },

  // ==========================================
  // 2. センチネル (SENTINEL)
  // ==========================================
  WARDEN: {
    name: "ウォーデン",
    role: "SENTINEL",
    roleName: "センチネル",
    roleClass: "role-sentinel",
    icon: "🏰",
    maxHp: 110,
    atk: 15,
    desc: "盤面にエネルギー防壁を展開するエリアエンジニア。防壁を遮蔽物として利用し、安全地帯から敵を狙撃する陣地戦のスペシャリスト。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "バンカー・スナイパー",
      icon: "🏰",
      desc: "味方オブジェクトまたは味方アンカーの周囲8マスに隣接している時、自身に【攻撃力増強 (+5)】を常時付与する（ATK 15 ➔ 20）。"
    },
    skills: {
      A: {
        name: "フォース・バリケード",
        maxStock: 3,
        desc: "半径2マス以内の空きマスに『バリケード（オブジェクト / HP 30）』を設置する。",
        type: "PLACE_BARRICADE",
        range: 2,
        barricadeHp: 30
      },
      ULT: {
        name: "イージス・バリア",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "すべての味方ユニット・味方オブジェクト・味方アンカーに【シールド増強 (+15 / 2T)】を付与する。",
        type: "AEGIS_BARRIER",
        shieldVal: 15,
        shieldTurns: 2,
        range: 0
      }
    }
  },

  VULCAN: {
    name: "ヴァルカン",
    role: "SENTINEL",
    roleName: "センチネル",
    roleClass: "role-sentinel",
    icon: "⚙️",
    maxHp: 100,
    atk: 15,
    desc: "自動防衛タレットの開発と陣地構築を得意とする工兵エンジニア。タレットとの連携集中砲火で敵を寄せ付けない。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "クロスファイア・リンク",
      icon: "⚙️",
      desc: "設置したセントリー・タレットが破壊された際、セントリー・タレットのストックを1回復する。さらに、セントリー・タレットのストックが存在するとき、自身の攻撃力増強 (+10) を常時付与（ATK 15 ➔ 25）。"
    },
    skills: {
      A: {
        name: "セントリー・タレット",
        maxStock: 1,
        desc: "半径2マス以内の空きマスに「タレット（オブジェクト / HP 20, ATK 10）」を1基設置する（ヴァルカン破壊後も存続）。",
        type: "PLACE_TURRET",
        range: 2
      },
      ULT: {
        name: "フォートレス・プロトコル",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "セントリー・タレットを中心とした半径2マスに空爆を要請する。敵ユニット・敵オブジェクトに 25 ダメージを与える！",
        type: "TURRET_AIRSTRIKE",
        damage: 25,
        range: 99
      }
    }
  },

  SMOG: {
    name: "スモッグ",
    role: "SENTINEL",
    roleName: "センチネル",
    roleClass: "role-sentinel",
    icon: "☣️",
    maxHp: 100,
    atk: 15,
    desc: "広域毒素散布で敵の進軍ルートを封じ、ジワジワと体力を奪うゾーンコントローラー。毒に侵された獲物を逃さず足止めして仕留める。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "トキシック・インフェクション",
      icon: "☣️",
      desc: "「『トキシック・ゾーン』上にいる敵ユニットを通常攻撃する時」または「自身が『トキシック・ゾーン』上にいる時」、自身に【攻撃力増強 (+10)】を付与する（ATK 15 ➔ 25）。"
    },
    skills: {
      A: {
        name: "トキシック・マイン",
        maxStock: 3,
        desc: "半径2マス以内の駒と自軍マインがないマスに設置する。敵の侵入で10ダメージ。作動時にそのマスにゾーンがなく、自身が生存中ならトキシック・ゾーンを展開する。",
        type: "TOXIC_MINE",
        damage: 10,
        range: 2
      },
      ULT: {
        name: "バイオハザード",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身の足元および周囲8マス（計9マス）に『トキシック・ゾーン（ハザード）』を上書き展開し、さらに展開時に範囲内の敵ユニット・敵オブジェクトへ即座に 10 ダメージを与える。",
        type: "POISON_BIOHAZARD",
        range: 0
      }
    }
  },

  // ==========================================
  // 3. ディスラプター (DISRUPTOR)
  // ==========================================
  GLITCH: {
    name: "グリッチ",
    role: "DISRUPTOR",
    roleName: "ディスラプター",
    roleClass: "role-disruptor",
    icon: "🌀",
    maxHp: 80,
    atk: 15,
    desc: "空間座標を歪めて交戦中の味方のもとへ跳躍し、着地時の時空衝撃波で敵を一気に弱体化させる異能のトリックスター。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ディメンション・チャージ",
      icon: "🌀",
      desc: "自身がスキルまたはウルトでワープ移動した時、着地先から半径1マス以内の敵ユニット全員に【弱体化 (1.5倍 / このターン中)】を付与する。"
    },
    skills: {
      A: {
        name: "グラビティ・ワープ",
        maxStock: 2,
        desc: "敵ユニット・敵オブジェクト・敵アンカーに隣接している味方ユニットの周囲8マスの空きマスへ即座にワープ移動する（移動オーダー消費なし）。",
        type: "ENGAGED_ALLY_WARP",
        range: 99
      },
      ULT: {
        name: "ディメンション・ジャミング",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "盤面上の任意の空きマスへワープ移動し、着地先の周囲8マス（半径1マス）の敵ユニットに【攻撃阻害 (1T)】を付与する（パッシブの【弱体化】も同時発動）。",
        type: "FREE_TELEPORT",
        range: 99
      }
    }
  },

  PRISM: {
    name: "プリズム",
    role: "DISRUPTOR",
    roleName: "ディスラプター",
    roleClass: "role-disruptor",
    icon: "🔇",
    maxHp: 95,
    atk: 20,
    desc: "斜めの貫通ビームで対象を捕捉し、マークした敵のスキルや移動を阻害する。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ダイアゴナル・トレース",
      icon: "🔇",
      desc: "毎自軍ターン開始時と自身の移動時（ワープ含む）、斜め4方向に完全貫通ビームを放ち、射線上の敵ユニット・敵オブジェクト・敵アンカーに【トレース】を追加付与する。タグは自軍ターン終了時に消滅する。"
    },
    skills: {
      A: {
        name: "シグナル・ジャミング",
        maxStock: 2,
        desc: "【トレース】が付与されている敵ユニット・敵オブジェクト全員に【スキル阻害 (1T)】および 10 ダメージ を与える。",
        type: "TRACE_JAMMING",
        damage: 10,
        range: 0
      },
      ULT: {
        name: "フルスペクトラム・ブラックアウト",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "【トレース】が付与されている敵ユニット・敵オブジェクト・敵アンカー全員に【行動阻害 (1T)】および 20 ダメージ を与える。",
        type: "TRACE_BLACKOUT",
        damage: 20,
        range: 0
      }
    }
  },

  HIVE: {
    name: "ハイヴ",
    role: "DISRUPTOR",
    roleName: "ディスラプター",
    roleClass: "role-disruptor",
    icon: "🛸",
    maxHp: 90,
    atk: 15,
    desc: "アサルトの直近へ自律戦闘子機「ビット」を連続射出する戦術キャリアー。ビットを破壊した敵の移動を阻害し、ウルトによるビット一斉強化で前線を圧倒する。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ニューロ・カウンター",
      icon: "🛸",
      desc: "自身が召喚した『ビット』を破壊した敵ユニットに【行動阻害 (1T)】を付与する（※相手ターン中に破壊した場合、破壊した次の相手ターンを丸ごと移動不能にする）。"
    },
    skills: {
      A: {
        name: "ビット・デプロイ",
        maxStock: 2,
        desc: "盤面上の自軍アサルトの周囲8マスの空きマスに召喚ユニット『ビット』を1体召喚する。",
        type: "SPAWN_BIT",
        range: 99
      },
      ULT: {
        name: "スウォーム・オーバードライブ",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "盤面上の任意の空きマスに『ビット』を1体展開し、新しいビットは即座にEX ATKを1枚獲得する。自軍の全ビットに【シールド増強 (+15 / 1T)】と【攻撃力増強 (+5 / このターン中)】を付与する（基本ATK 5 → 10）。",
        type: "DEPLOY_AND_BUFF_BITS",
        shieldVal: 15,
        atkBonus: 5,
        range: 99
      }
    }
  },

  // ==========================================
  // 4. サポート (SUPPORT)
  // ==========================================
  LILY: {
    name: "リリー",
    role: "SUPPORT",
    roleName: "サポート",
    roleClass: "role-support",
    icon: "💉",
    maxHp: 90,
    atk: 14,
    desc: "ナノマシン医療技術で味方の損耗を防ぐ生命線。パッシブによる毎ターン自動リペアと、強力な単体大回復で部隊の戦線崩壊を絶対に許さない。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ナノ・エンハンスメント",
      icon: "💉",
      desc: "毎自軍ターン終了時、自身の前方一直線（上一直線）にいる一番近い負傷した味方ユニット1体のHPを 5 自動回復 する（HP満タンの味方は透過、障害物で遮断）。"
    },
    skills: {
      A: {
        name: "ライフ・リペア",
        maxStock: 2,
        desc: "半径3マス以内の味方ユニット1体のHPを 30 回復 する。",
        type: "TARGET_HEAL",
        heal: 30,
        range: 3
      },
      ULT: {
        name: "オーバーチャージ・オーラ",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "すべての味方ユニットのHPを 15 回復し、チームウルトゲージを +30 チャージする（発動後のゲージリセット後に+30される）。",
        type: "GLOBAL_HEAL_AND_CHARGE",
        heal: 15,
        ultCharge: 30,
        range: 0
      }
    }
  },

  NEXUS: {
    name: "ネクサス",
    role: "SUPPORT",
    roleName: "サポート",
    roleClass: "role-support",
    icon: "💻",
    maxHp: 90,
    atk: 14,
    desc: "観測網で味方とリンクし、シールド展開と状態異常の解除で前線を支える。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "グリッド・リンク",
      icon: "💻",
      desc: "毎自軍ターン開始時と自身の移動時（ワープ含む）、縦横4方向に完全貫通ビームを放ち、射線上の味方ユニット・味方オブジェクト・味方アンカーに【リンク】を追加付与する（自身を除く）。タグは自軍ターン終了時に消滅する。"
    },
    skills: {
      A: {
        name: "イージス・リンク",
        maxStock: 2,
        desc: "【リンク】が付与されている味方ユニット・味方アンカー全員に【シールド増強 (+10 / 2T)】を付与する。",
        type: "AEGIS_LINK",
        shieldVal: 10,
        shieldTurns: 2,
        range: 0
      },
      ULT: {
        name: "オーバークロック・リンク",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "【リンク】が付与されている味方ユニット・味方オブジェクト・味方アンカー全員に【シールド増強 (+25 / 2T)】を付与し、さらに同対象の味方ユニット全員の全デバフ解除＆【攻撃力増強 (+5 / 2T)】を付与する。",
        type: "OVERCLOCK_LINK",
        shieldVal: 25,
        shieldTurns: 2,
        atkBonus: 5,
        range: 0
      }
    }
  },

  HALO: {
    name: "ヘイロー",
    role: "SUPPORT",
    roleName: "サポート",
    roleClass: "role-support",
    icon: "💫",
    maxHp: 90,
    atk: 18,
    desc: "生体治癒フィールドを放射する共鳴ヒーラー。味方の元へ瞬時に救援ワープし、周囲を包み込む高密度オーラで仲間を一斉回復する。高めの通常攻撃力も兼備。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "バイタル・オーラ",
      icon: "💫",
      desc: "毎自軍ターン終了時、このユニットの半径1マス範囲の一番HPが少ない味方ユニットのHPを 5 回復する。"
    },
    skills: {
      A: {
        name: "サンクチュアリ",
        maxStock: 2,
        desc: "自身の半径1マス範囲にいる味方ユニットすべてのHPを 20 回復する。",
        type: "AREA_HEAL_SELF",
        heal: 20,
        range: 0,
        selfOnly: true
      },
      ULT: {
        name: "レスキュー・ワープ",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "盤面上の任意の自軍ユニットの周囲8マスの空きマスへ即座にワープ移動（移動オーダー消費なし）し、サンクチュアリを発動する（ストック消費なし）。",
        type: "RESCUE_WARP",
        range: 99
      }
    }
  },

  // ==========================================
  // 5. アンカー & オブジェクト (ANCHOR / OBJECT)
  // ==========================================
  ANCHOR: {
    name: "アンカー",
    classType: "アンカー",
    icon: "💎",
    maxHp: 100,
    atk: 0,
    desc: "自軍の最重要防衛目標。移動・攻撃は不可。破壊されると即座に敗北！シールド付与可能。",
    moveOffsets: [],
    atkOffsets: []
  },

  BARRICADE: {
    name: "防壁",
    classType: "オブジェクト",
    icon: "🧱",
    maxHp: 30,
    atk: 0,
    desc: "ウォーデンが設置した防護壁。移動・攻撃は不可。敵味方ともに通行不能。破壊可能（設置者撃破後も存続、自軍ターン中に任意破壊可能）。",
    moveOffsets: [],
    atkOffsets: []
  },

  TURRET: {
    name: "自動タレット",
    classType: "オブジェクト",
    icon: "🗼",
    maxHp: 20,
    atk: 10,
    desc: "ヴァルカンが設置した自動砲台。自軍ターン終了時に周囲8マスのすべての敵ユニットへ 10 ダメージを自動射撃！（設置者撃破後も存続、迎撃ダメージはウルト蓄積対象外）",
    moveOffsets: [],
    atkOffsets: []
  }
};

// 正式名 ＋ 旧エイリアス（DUELIST, BOMBER, SENTINEL, MEDIC等）の両引き対応マップ
export const HERO_TYPES = {
  ...BASE_DEFINITIONS,
  DUELIST: BASE_DEFINITIONS.KINESIS,
  PHANTOM: BASE_DEFINITIONS.VEIL,
  BOMBER: BASE_DEFINITIONS.BLAST,
  SENTINEL: BASE_DEFINITIONS.WARDEN,
  POISON: BASE_DEFINITIONS.SMOG,
  DISRUPTOR: BASE_DEFINITIONS.GLITCH,
  MEDIC: BASE_DEFINITIONS.LILY,
  HACKER: BASE_DEFINITIONS.NEXUS
};

export const UNIT_DEFINITIONS = HERO_TYPES;
