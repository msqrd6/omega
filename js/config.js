/* ==============================================================
   config.js: ゲーム設定 & 4大ロール・スキル・バフ/デバフ定義
   (character.md の最新定義と完全同期 - 大型アップデート版)
   ============================================================== */

export const ROWS = 7;
export const COLS = 7;
export const BASE_HP = 100;

// チーム共通ウルト解放に必要な累計与ダメージ量 (通常攻撃のみで蓄積 / character.md準拠)
export const ULT_REQUIRED_DAMAGE = 100;

// 行動トークン制の初期値・基本設定 (character.md準拠: スキルトークン廃止に伴い 移動 1・攻撃 1)
export const DEFAULT_ACTION_TOKENS = {
  MOVE: 1,
  ATK: 1
};

// ウルト発動に必要なスキルトークン消費枚数（廃止: 0）
export const ULT_REQUIRED_SKILL_TOKENS = 0;

// 初期配置可能な自陣行（自陣から縦3マス以内）
export const DEPLOYABLE_ROWS = {
  P1: [4, 5, 6], // BLUE (先行): 下側3行
  P2: [0, 1, 2]  // RED (後攻): 上側3行
};

// 選択可能なヒーロー一覧 (全10体から5体選択 - タイタン削除版)
export const SELECTABLE_HERO_KEYS = ['DUELIST', 'PHANTOM', 'BOMBER', 'SENTINEL', 'VULCAN', 'POISON', 'DISRUPTOR', 'CYPHER', 'MEDIC', 'HACKER'];
export const DEFAULT_ROSTER = ['DUELIST', 'BOMBER', 'SENTINEL', 'DISRUPTOR', 'MEDIC'];

// 初期配置する駒キー一覧 (デフォルト / コア + 5ヒーロー)
export const INITIAL_PIECE_KEYS = ['CORE', 'DUELIST', 'BOMBER', 'SENTINEL', 'DISRUPTOR', 'MEDIC'];

// 周囲8マス共通オフセット
export const SURROUND_8_OFFSETS = [
  [-1,-1],[-1,0],[-1,1],
  [0,-1],        [0,1],
  [1,-1], [1,0], [1,1]
];

// バフ・デバフのメタ情報定義
export const STATUS_EFFECT_DEFS = {
  // バフ (持続nターンで消失)
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
  fortress: {
    name: "要塞化",
    icon: "🏰",
    type: "buff",
    color: "#38bdf8",
    desc: "自身の周囲1マス（8マス）への敵ユニットの進入を完全遮断します"
  },

  // デバフ (持続nターンで消失)
  weakness: {
    name: "衰弱",
    icon: "💔",
    type: "debuff",
    color: "#ff0055",
    desc: "現在HPが50%減少します（解除時に減少分は復元）"
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

export const HERO_TYPES = {
  // 1. アサルト (キネシス)
  DUELIST: {
    name: "キネシス",
    role: "ASSAULT",
    roleName: "アサルト",
    roleClass: "role-assault",
    icon: "⚡",
    maxHp: 85,
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
        desc: "自身に【攻撃力増強 (+10 / 1T)】を付与する（通常ATK 25 ➔ 35）。",
        type: "SELF_BUFF_ATK",
        atkBonus: 10,
        range: 0
      },
      ULT: {
        name: "オメガ・ストライク",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身を中心とする半径2マス以内の敵ユニット・敵オブジェクトに 20 ダメージを一斉放射！",
        type: "AOE_BURST",
        damage: 20,
        range: 2
      }
    }
  },

  // 1-2. アサルト (フェイズ)
  PHANTOM: {
    name: "フェイズ",
    role: "ASSAULT",
    roleName: "アサルト",
    roleClass: "role-assault",
    icon: "👤",
    maxHp: 85,
    atk: 30,
    desc: "自らの初期配置位置に影の領域（ディメンション・ゾーン）を敷設し、そこを起点として自在に戦場を跳梁する異相の暗殺者。全ユニット最高峰の素の通常攻撃力（30 DMG）を誇る。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "シャドウ・オリジン",
      icon: "👤",
      desc: "バトル開始時、初期配置マスに「ディメンション・ゾーン」を自動展開。自身は全ハザードのダメージ・悪影響を受けない。"
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
        name: "フェイズ・カタストロフ",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自軍ディメンション・ゾーンマスおよび周囲8マスの敵ユニット・敵オブジェクトに 35 ダメージの大爆発！",
        type: "PHANTOM_CATASTROPHE",
        damage: 35,
        range: 99
      }
    }
  },

  // 1-3. アサルト (ニトロ) ★ディスラプターからアサルトに移籍
  BOMBER: {
    name: "ニトロ",
    role: "ASSAULT",
    roleName: "アサルト",
    roleClass: "role-assault",
    icon: "💣",
    maxHp: 100,
    atk: 20,
    desc: "前線へ切り込み、不可視の地雷と自身の肉体を爆破兵器に変える狂気の突撃爆破兵。高いHPと通常攻撃力を持ち、死の間際に最も危険な起爆装置と化す。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ラスト・デトネーション",
      icon: "💣",
      desc: "自身撃破時、即座に周囲8マスの敵ユニット・敵オブジェクト・敵コアに 20 ダメージの道連れ自爆！"
    },
    skills: {
      A: {
        name: "マイン・プラント",
        maxStock: 3,
        desc: "半径2マス以内の指定空きマスに「マイン（トラップ / 20 DMG）」を仕掛ける（敵には不可視、ニトロ破壊後も存続）。",
        type: "PLACE_MINE_TRAP",
        range: 2,
        damage: 20
      },
      ULT: {
        name: "マキシマム・エクスプロージョン",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自身を中心とする半径2マス以内のすべての敵味方ユニット・敵味方オブジェクト・敵味方コアに 35 ダメージの超大爆破（自身も35被弾）。",
        type: "MAXIMUM_EXPLOSION",
        damage: 35,
        range: 2
      }
    }
  },

  // 2. センチネル (ベクター)
  SENTINEL: {
    name: "ベクター",
    role: "SENTINEL",
    roleName: "センチネル",
    roleClass: "role-sentinel",
    icon: "🏰",
    maxHp: 100,
    atk: 18,
    desc: "盤面にエネルギー防壁を展開するエリアエンジニア。防壁を遮蔽物として利用し、安全地帯から敵を狙撃する陣地戦のスペシャリスト。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "バンカー・スナイパー",
      icon: "🏰",
      desc: "オブジェクト（防壁・タレット）またはコアに隣接時、自身に攻撃力増強 (+4) を常時付与（ATK 18 ➔ 22）。"
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

  // 2-2. センチネル (ヴァルカン)
  VULCAN: {
    name: "ヴァルカン",
    role: "SENTINEL",
    roleName: "センチネル",
    roleClass: "role-sentinel",
    icon: "⚙️",
    maxHp: 105,
    atk: 16,
    desc: "自動防衛タレットの開発と陣地構築を得意とする工兵エンジニア。タレットとの連携集中砲火で敵を寄せ付けない。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "クロスファイア・リンク",
      icon: "⚙️",
      desc: "設置したセントリー・タレットが破壊された際、セントリー・タレットのストックを1回復する。"
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

  // 2-3. センチネル (トキシン)
  POISON: {
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
        name: "コア・プロテクト",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "自軍コアの周辺8マスにトキシック・ゾーン（トキシン生存時永続）を一斉展開する！",
        type: "POISON_CORE_PROTECT",
        range: 0
      }
    }
  },

  // 3. ディスラプター (グリッチ)
  DISRUPTOR: {
    name: "グリッチ",
    role: "DISRUPTOR",
    roleName: "ディスラプター",
    roleClass: "role-disruptor",
    icon: "🌀",
    maxHp: 90,
    atk: 18,
    desc: "空間座標を歪めて味方アサルトのもとへ跳躍し、着地時の時空衝撃波で敵を一気に弱体化させる異能のトリックスター。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "ディメンション・チャージ",
      icon: "🌀",
      desc: "ワープ移動時、ワープ先のマスから半径2マス以内の敵ユニットに【弱体化 (1T / 被ダメ1.5倍)】を付与。"
    },
    skills: {
      A: {
        name: "グラビティ・ワープ",
        maxStock: 2,
        desc: "盤面上の自軍アサルト（キネシス、フェイズ、ニトロ）の周囲8マスの空きマスへ即座にワープ移動する（移動トークン消費なし）。",
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

  // 3-2. ディスラプター (サイファー)
  CYPHER: {
    name: "サイファー",
    role: "DISRUPTOR",
    roleName: "ディスラプター",
    roleClass: "role-disruptor",
    icon: "🔇",
    maxHp: 95,
    atk: 20,
    desc: "敵のスキル発動機構を強制シャットダウンする電子戦スペシャリスト。直線ビームによる遠隔ジャミングと、敵全軍を完全停止させるブラックアウトで戦場を掌握する。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "エクスプロイト・ハック",
      icon: "🔇",
      desc: "状態異常（沈黙・衰弱・弱体化・行動阻害等）にかかっている敵ユニットへの通常攻撃が +5 DMG (20➔25) に増加。"
    },
    skills: {
      A: {
        name: "シグナル・ジャミング",
        maxStock: 2,
        desc: "自身の前方一直線（上一直線）上のうち初弾ユニットに干渉。味方ユニットなら【攻撃力増強 (+15 / 1T)】、敵ユニットなら【スキル阻害 (`silence`) (2T)】を付与！",
        type: "LINE_FIRST_HIT",
        atkBonus: 15,
        silenceTurns: 2,
        range: 99
      },
      ULT: {
        name: "フルスペクトラム・ブラックアウト",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "すべての敵ユニットに【行動阻害 (`bind`) (1T)】および【攻撃阻害 (`disarm`) (1T)】を一斉付与！",
        type: "GLOBAL_BLACKOUT",
        range: 0
      }
    }
  },

  // 4. サポート (アイリス)
  MEDIC: {
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

  // 4-2. サポート (ネクサス)
  HACKER: {
    name: "ネクサス",
    role: "SUPPORT",
    roleName: "サポート",
    roleClass: "role-support",
    icon: "💻",
    maxHp: 90,
    atk: 14,
    desc: "ネットワーク経由で戦況に干渉する電子戦エキスパート。生存しているだけでウルトを自動蓄積し、遠隔ハッキングで味方回復と敵の足止めを両立させる。",
    moveOffsets: SURROUND_8_OFFSETS,
    atkOffsets: SURROUND_8_OFFSETS,
    passive: {
      name: "システム・オーバーライド",
      icon: "💻",
      desc: "生存中、毎自軍ターン終了時にチームウルトゲージが直接 +5 チャージされる。"
    },
    skills: {
      A: {
        name: "リモート・ハック",
        maxStock: 2,
        desc: "距離無制限でユニットを選択。味方ユニットなら HP 15 回復、敵ユニットなら【行動阻害 (`bind`) (1T)】を付与！",
        type: "REMOTE_HACK",
        heal: 15,
        bindTurns: 1,
        range: 99
      },
      ULT: {
        name: "EMP",
        requiredDamage: ULT_REQUIRED_DAMAGE,
        desc: "盤面上の任意の1マスを選択し、半径2マスにあるすべての敵オブジェクト・敵トラップ・敵ハザードを完全消滅させる！",
        type: "EMP_PULSE",
        range: 99
      }
    }
  },

  // 防衛コア (クラス: コア)
  CORE: {
    name: "防衛コア",
    role: "CORE",
    roleName: "重要拠点（コア）",
    roleClass: "role-core",
    icon: "💎",
    maxHp: 100,
    atk: 0,
    desc: "自軍の最重要拠点（クラス: コア）。移動・攻撃は不可。破壊されると即座に敗北！シールド付与可能。",
    moveOffsets: [],
    atkOffsets: []
  },

  // 設置物 (クラス: オブジェクト)
  BARRICADE: {
    name: "防壁",
    role: "OBJECT",
    roleName: "オブジェクト（防護壁）",
    roleClass: "role-structure",
    icon: "🧱",
    maxHp: 30,
    atk: 0,
    desc: "ベクターが設置した防護壁（クラス: オブジェクト / HP 30）。移動・攻撃は不可。敵味方ともに通行不能。破壊可能（設置者破壊後も存続）。",
    moveOffsets: [],
    atkOffsets: []
  },

  TURRET: {
    name: "自動タレット",
    role: "OBJECT",
    roleName: "オブジェクト（固定砲台）",
    roleClass: "role-structure",
    icon: "🗼",
    maxHp: 20,
    atk: 10,
    desc: "ヴァルカンが設置した自動砲台（クラス: オブジェクト / HP 20, ATK 10）。自軍ターン終了時に前方6マスのすべての敵ユニットへ 10 ダメージを自動射撃！（設置者破壊後も存続、迎撃ダメージはウルト蓄積対象外）",
    moveOffsets: [],
    atkOffsets: []
  }
};
