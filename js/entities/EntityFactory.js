/* ==============================================================
   EntityFactory.js: 盤面エンティティ生成ファクトリー
   (盤面エンティティのインスタンス化と名称エイリアス解決)
   ============================================================== */
import { AnchorEntity } from './AnchorEntity.js?v=lab-white-1';
import { BarricadeEntity, TurretEntity } from './Structures.js?v=lab-white-3';
import { KinesisUnit, VeilUnit, BlastUnit, BitUnit } from './AssaultUnits.js?v=lab-white-1';
import { WardenUnit, VulcanUnit, SmogUnit } from './SentinelUnits.js?v=lab-white-3';
import { GlitchUnit, PrismUnit, HiveUnit } from './DisruptorUnits.js?v=lab-white-1';
import { LilyUnit, NexusUnit, HaloUnit } from './SupportUnits.js?v=lab-white-2';

// RULEBOOK正式名および後方互換エイリアスのクラス登録マップ
export const ENTITY_CLASS_MAP = {
  // 1. アンカー
  ANCHOR: AnchorEntity,

  // 2. オブジェクト
  BARRICADE: BarricadeEntity,
  TURRET: TurretEntity,

  // 3. アサルト
  KINESIS: KinesisUnit,
  DUELIST: KinesisUnit, // 旧エイリアス
  VEIL: VeilUnit,
  PHANTOM: VeilUnit,   // 旧エイリアス
  BLAST: BlastUnit,
  BOMBER: BlastUnit,    // 旧エイリアス
  BIT: BitUnit,

  // 4. センチネル
  WARDEN: WardenUnit,
  SENTINEL: WardenUnit, // 旧エイリアス
  VULCAN: VulcanUnit,
  SMOG: SmogUnit,
  POISON: SmogUnit,    // 旧エイリアス

  // 5. ディスラプター
  GLITCH: GlitchUnit,
  DISRUPTOR: GlitchUnit,// 旧エイリアス
  PRISM: PrismUnit,
  HIVE: HiveUnit,

  // 6. サポート
  LILY: LilyUnit,
  MEDIC: LilyUnit,      // 旧エイリアス
  NEXUS: NexusUnit,
  HACKER: NexusUnit,    // 旧エイリアス
  HALO: HaloUnit
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
