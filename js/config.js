/* ==============================================================
   config.js: ゲーム設定 & ロール・スキル・状態効果（バフ/デバフ）定義
   (RULEBOOK.md準拠: 4大クラス・4大ロール)
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
    desc: "固有パッシブ・通常スキル・ウルトが無効になります"
  }
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
    atk: 23,
    desc: "音速を超える身のこなしで空間を切り裂くサイバー突撃兵。敵ユニットの撃破やスキルで専用移動オーダーを獲得し、次の目標へ踏み込む。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "モメンタム・ドライブ",
      icon: "⚡",
      desc: "自ターン中に自身が敵ユニットを撃破した時、自身専用の追加移動オーダー（EX MOVE）を1枚獲得する。"
    },
    skills: {
      A: {
        name: "ライトニング・ステップ",
        maxStock: 2,
        desc: "自身専用の追加移動オーダー（EX MOVE）を1枚獲得する。",
        type: "EX_MOVE_ORDER",
        range: 0
      },
      ULT: {
        name: "ライトニング・ラッシュ",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身専用の追加攻撃オーダー（EX ATK）を1枚獲得する。",
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
    atk: 18,
    desc: "味方から離れると攻撃力が増す暗殺者。テレポートで孤立しやすい位置に移動できる。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ローン・シャドウ",
      icon: "👤",
      desc: "自身の周囲8マスに味方（ユニット・オブジェクト・アンカー）がいない間、自身の攻撃力+10。",
      atkBonus: 10
    },
    skills: {
      A: {
        name: "シャドウ・ブリンク",
        maxStock: 1,
        desc: "自身から半径2マス以内の空きマスへワープ移動する。",
        type: "TELEPORT",
        range: 2
      },
      ULT: {
        name: "シャドウ・シュラウド",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身に攻撃力+10（このターン）とシールド+20（1T）を付与する。",
        type: "SELF_ATK_AND_SHIELD",
        atkBonus: 10,
        shieldVal: 20,
        shieldTurns: 1,
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
    maxHp: 90,
    atk: 15,
    desc: "砲撃と範囲爆撃を使う突撃兵。通常攻撃を受けると相手に爆破反撃する。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "カウンター・デトネーション",
      icon: "💣",
      desc: "自身が敵ユニットから通常攻撃を受けた時、攻撃してきた相手に5ダメージで反撃する。"
    },
    skills: {
      A: {
        name: "インパクト・シェル",
        maxStock: 3,
        desc: "半径2マス以内の敵（ユニット・オブジェクト）1体を指定し、10ダメージを与える。",
        type: "SHELLING",
        range: 2,
        damage: 10
      },
      ULT: {
        name: "マキシマム・エクスプロージョン",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "半径2マス以内の指定したマスを中心とする3×3の敵（ユニット・オブジェクト・アンカー）すべてに30ダメージを与える。",
        type: "MAXIMUM_EXPLOSION",
        damage: 30,
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
      name: "セルフ・ドライブ",
      icon: "🛰️",
      desc: "自身の展開時と毎自ターン開始時に、自身専用の追加攻撃オーダー（EX ATK）を1枚獲得する。"
    },
    skills: {
      A: {
        name: "デリート",
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
    maxHp: 100,
    atk: 15,
    desc: "盤面にエネルギーバリケードを展開するエリアエンジニア。バリケードを遮蔽物として利用し、安全地帯から敵を狙撃する陣地戦のスペシャリスト。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "バンカー・スタンス",
      icon: "🏰",
      desc: "自身が味方オブジェクトまたは味方アンカーの周囲8マスにいる間、自身の攻撃力+5。"
    },
    skills: {
      A: {
        name: "フォース・バリケード",
        maxStock: 3,
        desc: "半径2マス以内の空きマスに【バリケード（HP 30）】を設置する。",
        type: "PLACE_BARRICADE",
        range: 2,
        barricadeHp: 30
      },
      ULT: {
        name: "イージス・ロックダウン",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身と自軍アンカーにシールド+20（2T）を付与し、自身の周囲8マスの敵ユニットに行動・攻撃・スキル阻害（1T）を付与する。",
        type: "AEGIS_BARRIER",
        shieldVal: 20,
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
    maxHp: 90,
    atk: 15,
    desc: "防衛タレットの開発と陣地構築を得意とする工兵エンジニア。タレットとの連携集中砲火で敵を寄せ付けない。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "クロスファイア・リンク",
      icon: "⚙️",
      desc: "自軍手番開始時、自身のタレットが盤面になく、スキルストックが0ならストックを1回復する。ストックがある間、自身の攻撃力+8。"
    },
    skills: {
      A: {
        name: "セントリー・タレット",
        maxStock: 1,
        desc: "自身から半径2マス以内の空きマスに【タレット（HP 10 / 攻撃力 10）】を1基設置する。",
        type: "PLACE_TURRET",
        range: 2
      },
      ULT: {
        name: "フォートレス・プロトコル",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身のタレットから半径2マス以内の敵（ユニット・オブジェクト・アンカー）すべてに20ダメージを与える。",
        type: "TURRET_AIRSTRIKE",
        damage: 20,
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
      name: "トキシック・アダプト",
      icon: "☣️",
      desc: "自軍トキシック・ゾーン上にいる間、攻撃力+5。自軍手番開始時にその上にいれば、自身にシールド+10（1T）を付与する。"
    },
    skills: {
      A: {
        name: "トキシック・スプレッド",
        maxStock: 2,
        desc: "自身から半径2マス以内の指定マスと自身の足元に【トキシック・ゾーン】を展開する。既存のゾーンは上書きする。",
        type: "PLACE_TOXIC_ZONE",
        range: 2
      },
      ULT: {
        name: "バイオハザード",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身を中心とする3×3に【トキシック・ゾーン】を展開し、範囲内の敵ユニットすべてに10ダメージを与える。",
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
    maxHp: 100,
    atk: 14,
    desc: "空間座標を歪めて味方と入れ替わり、ワープの着地時に周囲の敵を弱体化させる。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ワープ・ノイズ",
      icon: "🌀",
      desc: "自身がワープ移動した時、着地先の周囲8マスにいる敵ユニットに弱体化（1.5倍 / このターン）を付与する。"
    },
    skills: {
      A: {
        name: "フェーズ・スワップ",
        maxStock: 1,
        desc: "自身と、指定した他の味方ユニット1体の位置を入れ替える。",
        type: "ALLY_SWAP",
        range: 99
      },
      ULT: {
        name: "ディメンジョン・ワープ",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身が盤面上の任意の空きマスへワープし、着地先の周囲8マスにいる敵ユニットにスキル阻害（1T）を付与する。",
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
    maxHp: 90,
    atk: 15,
    desc: "斜めの貫通レーザーで敵陣を攻撃し、移動を阻害する。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ダイアゴナル・トレース",
      icon: "🔇",
      desc: "自ターン終了時、自身から斜め4方向へ貫通レーザーを放ち、敵（ユニット・オブジェクト）に5ダメージを与える。"
    },
    skills: {
      A: {
        name: "シグナル・ジャミング",
        maxStock: 2,
        desc: "指定した斜め1方向へ貫通レーザーを放ち、射線上の敵ユニットすべてに行動阻害（1T）を付与する。",
        type: "DIAGONAL_BIND",
        range: 0
      },
      ULT: {
        name: "フルスペクトラム・バースト",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "指定した斜め1方向へ貫通レーザーを放ち、射線上の敵（ユニット・オブジェクト・アンカー）すべてに35ダメージを与える。",
        type: "DIAGONAL_DAMAGE",
        damage: 35,
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
    desc: "接敵中の味方の周囲にビットを展開し、ビットを破壊した敵の通常攻撃を阻害する。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ニューロ・カウンター",
      icon: "🛸",
      desc: "自身が召喚したビットを破壊した敵ユニットに、攻撃阻害（1T）を付与する。"
    },
    skills: {
      A: {
        name: "ビット・デプロイ",
        maxStock: 2,
        desc: "接敵中の味方ユニットの周囲8マスの空きマスに【ビット（HP15/ATK5）】を1体召喚する。",
        type: "SPAWN_BIT",
        range: 99
      },
      ULT: {
        name: "スウォーム・オーバードライブ",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "盤面上の任意の空きマスに【ビット（HP15/ATK5）】を1体召喚し、すべての自軍ビットにシールド+10（1T）と攻撃力+5（このターン）を付与する。",
        type: "DEPLOY_AND_BUFF_BITS",
        shieldVal: 10,
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
      name: "ナノ・パルス",
      icon: "💉",
      desc: "自ターン終了時、自身から前方へ非貫通パルスを放つ。最初に当たった味方（ユニット・オブジェクト）のHPを5回復する。"
    },
    skills: {
      A: {
        name: "ライフ・リペア",
        maxStock: 2,
        desc: "自身から半径3マス以内の味方ユニット1体を指定し、HPを30回復、すべてのデバフを解除する。",
        type: "TARGET_HEAL",
        heal: 30,
        range: 3
      },
      ULT: {
        name: "フル・ブルーム",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "すべての味方ユニットのHPを20回復し、すべてのデバフを解除する。",
        type: "GLOBAL_HEAL_AND_CLEANSE",
        heal: 20,
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
    atk: 15,
    desc: "範囲シールドで部隊を支援する。シールドを持つ味方ユニットの数に応じて自身の攻撃力が上がる。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "グリッド・リンク",
      icon: "💻",
      desc: "シールドが付与されている味方ユニット1体につき、自身の攻撃力+3（最大+15）。自身と味方ビットも含む。"
    },
    skills: {
      A: {
        name: "イージス・リンク",
        maxStock: 2,
        desc: "盤面上の味方ユニット1体を指定し、シールド+10（2T）と攻撃力+5（このターン）を付与する。",
        type: "AEGIS_LINK",
        shieldVal: 10,
        shieldTurns: 2,
        atkBonus: 5,
        range: 0
      },
      ULT: {
        name: "グリッド・バリア",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "盤面上の指定マスを中心に、半径2マス以内の味方ユニット全員にシールド+20（2T）を付与する。",
        type: "OVERCLOCK_LINK",
        shieldVal: 20,
        shieldTurns: 2,
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
      desc: "自ターン終了時、自身の半径1マス以内で最もHPが少ない味方ユニット1体のHPを5回復する。"
    },
    skills: {
      A: {
        name: "サンクチュアリ",
        maxStock: 2,
        desc: "自身の半径1マス以内の味方ユニット全員のHPを20回復する。",
        type: "AREA_HEAL_SELF",
        heal: 20,
        range: 0,
        selfOnly: true
      },
      ULT: {
        name: "レスキュー・ワープ",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身が盤面上の任意の味方ユニットの周囲8マスの空きマスへワープ移動し、その場の半径1マス以内の味方ユニット全員のHPを20回復する。",
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
    name: "バリケード",
    classType: "オブジェクト",
    icon: "🧱",
    maxHp: 30,
    atk: 0,
    desc: "ウォーデンが設置した防護壁。移動・攻撃は不可。敵味方ともに通行不能。破壊可能（設置者撃破後も存続、自軍ターン中に任意破壊可能）。",
    moveOffsets: [],
    atkOffsets: []
  },

  TURRET: {
    name: "タレット",
    classType: "オブジェクト",
    icon: "🗼",
    maxHp: 10,
    atk: 10,
    desc: "ヴァルカンが設置した砲台。自軍ターン終了時に周囲8マスのすべての敵ユニットへ 10 ダメージを自動射撃！（設置者撃破後も存続、自軍ターン中に自分で破壊可能。迎撃ダメージはウルト蓄積対象外）",
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
