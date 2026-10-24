/* ==============================================================
   EntityFactory.js: 盤面エンティティ生成ファクトリー
   (5大クラス体系の全クラスインスタンス化と名称エイリアス解決)
   ============================================================== */
import { CoreEntity } from './CoreEntity.js?v=20261024_11';
import { BarricadeEntity, TurretEntity } from './Structures.js?v=20261024_11';
import { KinesisUnit, PhaseUnit, NitroUnit, BitUnit } from './AssaultUnits.js?v=20261024_11';
import { VectorUnit, VulcanUnit, ToxinUnit } from './SentinelUnits.js?v=20261024_11';
import { GlitchUnit, CypherUnit, HiveUnit } from './DisruptorUnits.js?v=20261024_11';
import { IrisUnit, NexusUnit, AuraUnit } from './SupportUnits.js?v=20261024_11';

// RULEBOOK正式名および後方互換エイリアスのクラス登録マップ
export const ENTITY_CLASS_MAP = {
  // 1. コア
  CORE: CoreEntity,

  // 2. オブジェクト
  BARRICADE: BarricadeEntity,
  TURRET: TurretEntity,

  // 3. アサルト
  KINESIS: KinesisUnit,
  DUELIST: KinesisUnit, // 旧エイリアス
  PHASE: PhaseUnit,
  PHANTOM: PhaseUnit,   // 旧エイリアス
  NITRO: NitroUnit,
  BOMBER: NitroUnit,    // 旧エイリアス
  BIT: BitUnit,

  // 4. センチネル
  VECTOR: VectorUnit,
  SENTINEL: VectorUnit, // 旧エイリアス
  VULCAN: VulcanUnit,
  TOXIN: ToxinUnit,
  POISON: ToxinUnit,    // 旧エイリアス

  // 5. ディスラプター
  GLITCH: GlitchUnit,
  DISRUPTOR: GlitchUnit,// 旧エイリアス
  CYPHER: CypherUnit,
  HIVE: HiveUnit,

  // 6. サポート
  IRIS: IrisUnit,
  MEDIC: IrisUnit,      // 旧エイリアス
  NEXUS: NexusUnit,
  HACKER: NexusUnit,    // 旧エイリアス
  AURA: AuraUnit
};

// エンティティ生成ファクトリー関数
export function createEntity(typeKey, owner, r, c) {
  const normalizedKey = (typeKey || '').toUpperCase();
  const EntityClass = ENTITY_CLASS_MAP[normalizedKey];
  if (!EntityClass) {
    console.error(`Unknown entity typeKey: ${typeKey}`);
    return null;
  }
  return new EntityClass(owner, r, c);
}
