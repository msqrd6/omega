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

// 行動トークン制の初期値 (移動 1・攻撃 1)
export const DEFAULT_ACTION_TOKENS = {
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
  'KINESIS', 'PHASE', 'NITRO',
  'VECTOR', 'VULCAN', 'TOXIN',
  'GLITCH', 'CYPHER', 'HIVE',
  'IRIS', 'NEXUS', 'AURA'
];

export const DEFAULT_ROSTER = ['KINESIS', 'NITRO', 'VECTOR', 'GLITCH', 'IRIS'];
export const DEFAULT_AI_ROSTER = ['PHASE', 'TOXIN', 'VECTOR', 'GLITCH', 'IRIS'];

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
    atk: 25,
    desc: "音速を超える身のこなしで空間を切り裂くサイバー突撃兵。自律機動パッシブによりチームの移動枠を圧迫せず、神速の通常攻撃でチームウルトを急速蓄積させる。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ライトニング・ステップ",
      icon: "⚡",
      desc: "毎自軍ターン開始時、キネシス専用の【追加移動トークン (+1 MOVE)】を獲得（チームの移動枠を消費せず移動可能）。"
    },
    skills: {
      A: {
        name: "オーバードライブ",
        maxStock: 2,
        desc: "自身に【攻撃力増強 (+5 / このターン中)】を付与する（通常ATK 25 ➔ 30）。",
        type: "SELF_BUFF_ATK",
        atkBonus: 5,
        range: 0
      },
      ULT: {
        name: "ライトニング・ラッシュ",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身にキネシス専用の【追加攻撃トークン (+1 ATTACK)】を即座に 1枚 付与する！",
        type: "EXTRA_ATTACK_TOKEN",
        range: 0
      }
    }
  },

  PHASE: {
    name: "フェイズ",
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
        desc: "自軍ディメンション・ゾーン（空きマス）へ即座にテレポート移動する（移動トークン消費なし）。",
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

  NITRO: {
    name: "ニトロ",
    role: "ASSAULT",
    roleName: "アサルト",
    roleClass: "role-assault",
    icon: "💣",
    maxHp: 110,
    atk: 20,
    desc: "前線へ切り込み、不可視の地雷と自身の肉体を爆破兵器に変える狂気の突撃爆破兵。高いHPを持ち、攻撃してきた敵へ即座に反撃爆破を浴びせ、自爆で一帯を焦土に変える。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "カウンター・デトネーション",
      icon: "💣",
      desc: "自身が敵ユニットに攻撃された場合、攻撃してきた敵ユニットに即座に 10 ダメージの爆破反撃を行う！"
    },
    skills: {
      A: {
        name: "マイン・プラント",
        maxStock: 2,
        desc: "前方6マスの指定空きマスに「マイン（トラップ / 20 DMG）」を仕掛ける（敵には不可視、ニトロ破壊後も存続）。",
        type: "PLACE_MINE_TRAP",
        range: 2,
        damage: 20
      },
      ULT: {
        name: "マキシマム・エクスプロージョン",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身を中心とする半径2マス以内のすべての敵味方ユニット・敵味方オブジェクト・敵味方コアに 20 ダメージの超大爆破（自身も20被弾）。",
        type: "MAXIMUM_EXPLOSION",
        damage: 20,
        range: 2
      }
    }
  },

  BIT: {
    name: "ビット",
    role: "ASSAULT",
    roleName: "アサルト",
    roleClass: "role-assault",
    icon: "🛰️",
    maxHp: 20,
    atk: 5,
    desc: "ハイヴから射出される自律戦闘子機。毎自軍ターン開始時に専用の攻撃トークンを獲得し、共通トークンを消費せずに自律攻撃を行う。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "自律アサルト・ドライブ",
      icon: "🛰️",
      desc: "毎自軍ターン開始時、自軍の共通行動トークンとは別に「ビット専用攻撃トークン+1」を獲得する（共通トークンを消費せずに、各ビットが自律的に攻撃を行える）。"
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
  VECTOR: {
    name: "ベクター",
    role: "SENTINEL",
    roleName: "センチネル",
    roleClass: "role-sentinel",
    icon: "🏰",
    maxHp: 100,
    atk: 15,
    desc: "盤面にエネルギー防壁を展開するエリアエンジニア。防壁を遮蔽物として利用し、安全地帯から敵を狙撃する陣地戦のスペシャリスト。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "バンカー・スナイパー",
      icon: "🏰",
      desc: "味方オブジェクト（防壁・タレット）または味方コアに隣接時、自身に攻撃力増強 (+10) を常時付与（ATK 15 ➔ 25）。"
    },
    skills: {
      A: {
        name: "フォース・バリケード",
        maxStock: 3,
        desc: "半径2マス以内の指定空きマスに「バリケード（オブジェクト / HP 30）」を設置する（ベクター破壊後も存続）。",
        type: "PLACE_BARRICADE",
        range: 2,
        barricadeHp: 30
      },
      ULT: {
        name: "バリケード・バッファー",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "『フォース・バリケード』のストックを全回復（最大3回まで再装填）する！",
        type: "RECHARGE_BARRICADE_STOCK",
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

  TOXIN: {
    name: "トキシン",
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
      desc: "自身は毒ハザード無効。「トキシック・ゾーン」内の敵ユニットへの通常攻撃が +10 DMG (15➔25) に大幅強化。"
    },
    skills: {
      A: {
        name: "トキシック・カーテン",
        maxStock: 1,
        desc: "自身から左右いずれかの直線方向へ3マスのトキシック・ゾーンを展開（トキシン撃破時に消滅）。",
        type: "POISON_CURTAIN",
        length: 3,
        range: 1
      },
      ULT: {
        name: "バイオハザード",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身の足元および周囲8マス（計9マス）にトキシック・ゾーンを一斉展開！既にあるハザードはトキシック・ゾーンに上書きされる。",
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
    maxHp: 90,
    atk: 15,
    desc: "空間座標を歪めて味方アサルトのもとへ跳躍し、着地時の時空衝撃波で敵を一気に弱体化させる異能のトリックスター。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ディメンション・チャージ",
      icon: "🌀",
      desc: "ワープ移動時、ワープ先のマスから半径1マス以内の敵ユニットに【弱体化 (このターン中 / 被ダメ1.5倍)】を付与。"
    },
    skills: {
      A: {
        name: "グラビティ・ワープ",
        maxStock: 2,
        desc: "盤面上の自軍アサルトの周囲8マスの空きマスへ即座にワープ移動する（移動トークン消費なし）。",
        type: "ASSAULT_ADJACENT_WARP",
        range: 99
      },
      ULT: {
        name: "緊急回避",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "盤面上の任意の空きマスを選択して完全脱出ワープを行う！",
        type: "FREE_TELEPORT",
        range: 99
      }
    }
  },

  CYPHER: {
    name: "サイファー",
    role: "DISRUPTOR",
    roleName: "ディスラプター",
    roleClass: "role-disruptor",
    icon: "🔇",
    maxHp: 95,
    atk: 20,
    desc: "戦場の電子グリッドを横一直線に滑走する電子戦スペシャリスト。左右への高速スライド移動で瞬時に射線を合わせ、直線ビームによる味方強化・敵武装解除、そして敵全軍を停止させるブラックアウトで戦況を完全支配する。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ホライゾン・シフト",
      icon: "🔇",
      desc: "周囲8マス移動に加え、左右の横一直線方向へ障害物に衝突する直前まで無制限にスライド移動可能。"
    },
    skills: {
      A: {
        name: "シグナル・ジャミング",
        maxStock: 2,
        desc: "自身の前方一直線（上一直線）上のうち初弾ユニットに干渉。味方ユニットなら【攻撃力増強 (+15 / このターン中)】、敵ユニットなら【攻撃阻害 (1T)】を付与！",
        type: "LINE_FIRST_HIT",
        atkBonus: 15,
        disarmTurns: 1,
        range: 99
      },
      ULT: {
        name: "フルスペクトラム・ブラックアウト",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "すべての敵ユニットに【行動阻害 (1T)】および【攻撃阻害 (1T)】を一斉付与！",
        type: "GLOBAL_BLACKOUT",
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
    desc: "アサルトの直近へ自律戦闘子機「ビット」を連続射出する戦術キャリアー。破壊されても敵を弱体化・スキル沈黙に追い込み、ウルトによるビット一斉強化で前線を圧倒する。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ニューロ・カウンター",
      icon: "🛸",
      desc: "自身が召喚したビットを破壊した敵ユニットに【弱体化 (2T)】および【スキル阻害 (2T)】を付与する。"
    },
    skills: {
      A: {
        name: "ビット・デプロイ",
        maxStock: 3,
        desc: "盤面上の自軍アサルト（キネシス、ニトロ、フェイズ、ビット）の周囲8マスの空きマスにビット（ユニット）を1体召喚する。",
        type: "SPAWN_BIT",
        range: 99
      },
      ULT: {
        name: "スウォーム・オーバードライブ",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身が召喚したすべてのビットに【シールド増強 (+30 / 2T)】および【攻撃力増強 (+10 / 2T)】を一斉付与する！",
        type: "BUFF_ALL_BITS",
        range: 0
      }
    }
  },

  // ==========================================
  // 4. サポート (SUPPORT)
  // ==========================================
  IRIS: {
    name: "アイリス",
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
      desc: "毎自軍ターン終了時、自身の前方一直線（上一直線）にいる最も近い負傷した味方ユニット1体のHPを 5 自動回復。"
    },
    skills: {
      A: {
        name: "ライフ・リペア",
        maxStock: 2,
        desc: "半径3マス以内の味方ユニット1体を指定し、HPを 30 大回復する。",
        type: "TARGET_HEAL",
        heal: 30,
        range: 3
      },
      ULT: {
        name: "オーバーチャージ・オーラ",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自軍の全ユニットおよび防衛コアに【シールド増強 (+15 / 2T)】を一斉付与！",
        type: "GLOBAL_SHIELD",
        shieldVal: 15,
        shieldTurns: 2,
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
    desc: "ネットワーク経由で戦況に干渉する電子戦エキスパート。生存しているだけでウルトを毎ターン高速チャージし、遠隔ハッキングで味方の傷とあらゆる状態異常を治療する。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "システム・オーバーライド",
      icon: "💻",
      desc: "ネクサスが盤面に生存している限り、毎自軍ターン終了時にチームウルトゲージが直接 +10 チャージされる。"
    },
    skills: {
      A: {
        name: "リモート・ハック",
        maxStock: 3,
        desc: "盤面上の任意の自ユニット1体を選択し、HPを 15 回復、状態異常（すべてのデバフ）を回復・解除する。",
        type: "TARGET_HEAL_CURE",
        heal: 15,
        range: 99
      },
      ULT: {
        name: "EMP",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "盤面上の任意の1マスを選択し、そこから半径2マス以内にあるすべての敵オブジェクト・敵トラップ・敵ハザードを完全消滅、半径2マス以内の味方ユニットのHPを 10 回復する。",
        type: "EMP_PULSE",
        heal: 10,
        range: 99
      }
    }
  },

  AURA: {
    name: "オーラ",
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
        desc: "盤面上の任意の自軍ユニットの周囲8マスの空きマスへ即座にワープ移動（移動トークン消費なし）し、サンクチュアリを発動する（ストック消費なし）。",
        type: "RESCUE_WARP",
        range: 99
      }
    }
  },

  // ==========================================
  // 5. コア & オブジェクト (CORE / OBJECT)
  // ==========================================
  CORE: {
    name: "防衛コア",
    classType: "コア",
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
    desc: "ベクターが設置した防護壁。移動・攻撃は不可。敵味方ともに通行不能。破壊可能（設置者撃破後も存続、自軍ターン中に任意破壊可能）。",
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
  PHANTOM: BASE_DEFINITIONS.PHASE,
  BOMBER: BASE_DEFINITIONS.NITRO,
  SENTINEL: BASE_DEFINITIONS.VECTOR,
  POISON: BASE_DEFINITIONS.TOXIN,
  DISRUPTOR: BASE_DEFINITIONS.GLITCH,
  MEDIC: BASE_DEFINITIONS.IRIS,
  HACKER: BASE_DEFINITIONS.NEXUS
};

export const UNIT_DEFINITIONS = HERO_TYPES;
