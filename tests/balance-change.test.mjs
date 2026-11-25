import assert from 'node:assert/strict';
import test from 'node:test';

// Exercise the production action entry points without a rendered battle.
globalThis.window = {};
globalThis.document = { getElementById: () => null, querySelector: () => null };
globalThis.requestAnimationFrame = () => 0;

const {
  board, initBoard, spawnHero, getEffectiveAtk, getStatusEffects, getValidSkillTargets,
  getPlayerOrders, resetActionOrders, resetTurnPassives, addTeamUltDamage, getTeamUltGauge, poisonZones
} = await import('../js/board.js?v=lab-white-3');
const { dealDamage, destroyObject, executeAttack, executeSkill, processTurnEnd, tickTurnEffects } =
  await import('../js/actions.js?v=lab-white-3');

function hasTarget(unit, slot, r, c) {
  return getValidSkillTargets(unit.r, unit.c, slot).some(pos => pos.r === r && pos.c === c);
}

async function skill(unit, slot, r = unit.r, c = unit.c) {
  if (slot === 'ULT') addTeamUltDamage(unit.owner, 100);
  assert.ok(await executeSkill(unit, { r, c }, slot));
}

test('stacked shields consume by expiry, and attack and debuff entries expire independently', () => {
  initBoard();
  const veil = spawnHero('VEIL', 'P1', 3, 3);
  veil.applyBuff('atk_up', 12);
  assert.equal(getEffectiveAtk(veil), 40);
  assert.deepEqual(getStatusEffects(veil).map(effect => effect.val), [10, 12]);
  veil.applyBuff('shield', 20, 2);
  veil.applyBuff('shield', 10);
  veil.applyBuff('shield', 8);
  assert.equal(dealDamage(null, veil, 12, veil), 0);
  assert.deepEqual(veil.buffs.filter(effect => effect.key === 'shield').map(effect => effect.val), [20, 6]);

  veil.applyDebuff('vulnerable');
  veil.applyDebuff('vulnerable', 1);
  assert.equal(veil.debuffs.length, 2);
  assert.equal(dealDamage(null, veil, 20, veil), 4);
  veil.applyDebuff('silence', 1);
  assert.equal(getEffectiveAtk(veil), 30);
  tickTurnEffects();
  assert.equal(veil.debuffs.length, 2);
  assert.equal(getEffectiveAtk(veil), 18);
  tickTurnEffects();
  assert.equal(veil.debuffs.length, 0);
  assert.equal(getEffectiveAtk(veil), 28);
});

test('Veil can teleport within two cells and uses separate attack and shield durations', async () => {
  initBoard();
  const veil = spawnHero('VEIL', 'P1', 4, 3);
  spawnHero('BARRICADE', 'P1', 3, 3);
  assert.equal(getEffectiveAtk(veil), 18);
  assert.equal(hasTarget(veil, 'A', 1, 3), false);
  await skill(veil, 'A', 2, 5);
  assert.equal(board[4][3], null);
  assert.equal(veil.stockA, 0);
  await skill(veil, 'ULT');
  assert.equal(getEffectiveAtk(veil), 38);
  assert.deepEqual(getStatusEffects(veil).filter(effect => effect.key === 'atk_up').map(effect => effect.val), [10, 10]);
  assert.equal(veil.getShieldVal(), 20);
  tickTurnEffects();
  assert.equal(getEffectiveAtk(veil), 28);
  assert.equal(veil.getShieldVal(), 20);
  tickTurnEffects();
  assert.equal(veil.getShieldVal(), 0);
});

test('Kinesis keeps its stock and EX attacks do not charge the ULT gauge', async () => {
  initBoard();
  const kinesis = spawnHero('KINESIS', 'P1', 2, 2);
  const target = spawnHero('WARDEN', 'P2', 2, 3);
  await skill(kinesis, 'A');
  assert.equal(kinesis.stockA, 1);
  assert.ok(getPlayerOrders('P1').some(order => order.badgeText === 'EX MOVE'));
  await skill(kinesis, 'ULT');
  await executeAttack(kinesis, target);
  assert.equal(target.hp, 77);
  assert.equal(getTeamUltGauge('P1'), 0);
  assert.ok(getPlayerOrders('P1').some(order => order.badgeText === 'ATK' && !order.used));
  await executeAttack(kinesis, target);
  assert.equal(getTeamUltGauge('P1'), 23);
});

test('Common attacks only charge the gauge for HP actually lost, after shield absorption', async () => {
  initBoard();
  const veil = spawnHero('VEIL', 'P1', 3, 3);
  const barricade = spawnHero('BARRICADE', 'P2', 3, 4);
  barricade.applyBuff('shield', 10);
  await executeAttack(veil, barricade);
  assert.equal(barricade.hp, 12);
  assert.equal(getTeamUltGauge('P1'), 18);

  resetActionOrders('P1');
  await executeAttack(veil, barricade);
  assert.equal(board[3][4], null);
  assert.equal(getTeamUltGauge('P1'), 30);
});

test('Blast counters fully shielded and lethal normal attacks', async () => {
  initBoard();
  const attacker = spawnHero('KINESIS', 'P1', 2, 2);
  const blast = spawnHero('BLAST', 'P2', 2, 3);
  spawnHero('WARDEN', 'P2', 0, 0);
  blast.applyBuff('shield', 25);
  await executeAttack(attacker, blast);
  assert.equal(blast.hp, 90);
  assert.equal(attacker.hp, 90);
  assert.equal(getTeamUltGauge('P1'), 0);

  resetActionOrders('P1');
  blast.hp = 1;
  await executeAttack(attacker, blast);
  assert.equal(attacker.hp, 85);
  assert.equal(board[2][3], null);
  assert.equal(getTeamUltGauge('P1'), 1);
  assert.ok(getPlayerOrders('P1').some(order => order.badgeText === 'EX MOVE'));
});

test('Blast targets an object with S and can center its U on an occupied tile', async () => {
  initBoard();
  const blast = spawnHero('BLAST', 'P1', 3, 3);
  const ally = spawnHero('HALO', 'P1', 1, 1);
  const barricade = spawnHero('BARRICADE', 'P2', 2, 2);
  const enemy = spawnHero('KINESIS', 'P2', 3, 2);
  const anchor = spawnHero('ANCHOR', 'P2', 0, 0);
  await skill(blast, 'A', 2, 2);
  assert.equal(barricade.hp, 20);
  assert.equal(hasTarget(blast, 'A', 0, 0), false);
  await skill(blast, 'ULT', 1, 1);
  assert.equal(anchor.hp, 70);
  assert.equal(ally.hp, 90);
  assert.equal(enemy.hp, 95);
  assert.equal(blast.hp, 90);
  assert.equal(board[2][2], null);
});

test('Glitch swaps with a distant Bit and applies weakness at its own landing tile', async () => {
  initBoard();
  const glitch = spawnHero('GLITCH', 'P1', 3, 3);
  const bit = spawnHero('BIT', 'P1', 6, 6);
  const landingEnemy = spawnHero('WARDEN', 'P2', 5, 6);
  const enemyAnchor = spawnHero('ANCHOR', 'P2', 6, 5);
  const enemy = spawnHero('KINESIS', 'P2', 3, 4);
  spawnHero('BARRICADE', 'P1', 2, 3);
  assert.equal(glitch.hp, 100);
  assert.equal(glitch.atk, 14);
  for (const [r, c] of [[3, 3], [5, 5], [5, 6], [2, 3]]) {
    assert.equal(hasTarget(glitch, 'A', r, c), false);
  }
  assert.equal(hasTarget(glitch, 'A', 6, 6), true);
  await skill(glitch, 'A', 6, 6);
  assert.equal(board[3][3], bit);
  assert.equal(board[6][6], glitch);
  assert.deepEqual([bit.r, bit.c, glitch.r, glitch.c], [3, 3, 6, 6]);
  assert.equal(glitch.stockA, 0);
  assert.ok(getPlayerOrders('P1').every(order => !order.used));
  assert.equal(landingEnemy.hasDebuff('vulnerable'), true);
  assert.equal(enemy.hasDebuff('vulnerable'), false);
  assert.equal(enemyAnchor.debuffs.length, 0);

  addTeamUltDamage('P1', 100);
  assert.equal(hasTarget(glitch, 'ULT', 3, 3), false);
  await skill(glitch, 'ULT', 4, 3);
  assert.equal(enemy.hasDebuff('vulnerable'), true);
  assert.equal(enemy.hasDebuff('silence'), true);
  tickTurnEffects();
  assert.equal(enemy.hasDebuff('vulnerable'), false);
  assert.equal(enemy.hasDebuff('silence'), true);
});

test('Hive uses an engaged Bit as a deployment reference and strengthens newly deployed Bits', async () => {
  initBoard();
  const hive = spawnHero('HIVE', 'P1', 0, 0);
  const bit = spawnHero('BIT', 'P1', 6, 6);
  spawnHero('ANCHOR', 'P2', 6, 5);
  assert.equal(hasTarget(hive, 'A', 5, 6), true);
  await skill(hive, 'ULT', 1, 1);
  const newBit = board[1][1];
  for (const unit of [bit, newBit]) {
    assert.equal(unit.hp, 15);
    assert.equal(unit.getShieldVal(), 10);
    assert.equal(getEffectiveAtk(unit), 10);
  }
  assert.ok(getPlayerOrders('P1').some(order => order.scope === newBit.id && order.badgeText === 'EX ATK'));
});

test('Hive applies immediate attack inhibition through the attacker’s next hand', async () => {
  initBoard();
  const hive = spawnHero('HIVE', 'P1', 0, 0);
  const attacker = spawnHero('KINESIS', 'P2', 3, 3);
  const bit = spawnHero('BIT', 'P1', 3, 4);
  bit.summonerId = hive.id;
  await executeAttack(attacker, bit);
  for (let remaining = 2; remaining >= 0; remaining--) {
    assert.equal(attacker.debuffs.find(effect => effect.key === 'disarm')?.turns, remaining);
    tickTurnEffects();
  }
  assert.equal(attacker.hasDebuff('disarm'), false);

  resetActionOrders('P2');
  const nextBit = spawnHero('BIT', 'P1', 3, 4);
  nextBit.summonerId = hive.id;
  hive.applyDebuff('silence');
  await executeAttack(attacker, nextBit);
  assert.equal(attacker.hasDebuff('disarm'), false);
  const survivingBit = spawnHero('BIT', 'P1', 3, 5);
  survivingBit.applyDebuff('silence');
  resetActionOrders('P1');
  assert.ok(getPlayerOrders('P1').every(order => order.scope !== survivingBit.id));
  assert.equal(hasTarget(survivingBit, 'A', 3, 5), false);
});

test('Prism selects one diagonal for S and U, and its passive excludes anchors', async () => {
  initBoard();
  const prism = spawnHero('PRISM', 'P1', 3, 3);
  spawnHero('HALO', 'P1', 2, 2);
  const object = spawnHero('BARRICADE', 'P2', 1, 1);
  const anchor = spawnHero('ANCHOR', 'P2', 0, 0);
  const enemy = spawnHero('KINESIS', 'P2', 5, 5);
  assert.equal(hasTarget(prism, 'A', 3, 4), false);
  await skill(prism, 'A', 4, 4);
  assert.equal(enemy.hasDebuff('bind'), true);
  assert.equal(enemy.hp, 95);
  await processTurnEnd('P1');
  assert.equal(object.hp, 25);
  assert.equal(anchor.hp, 100);
  assert.equal(enemy.hp, 90);
  await skill(prism, 'ULT', 2, 2);
  assert.equal(board[1][1], null);
  assert.equal(anchor.hp, 65);
  assert.equal(enemy.hp, 90);
});

test('Nexus S buffs one ally and U shields only allied units in the selected area', async () => {
  initBoard();
  const nexus = spawnHero('NEXUS', 'P1', 2, 1);
  const bit = spawnHero('BIT', 'P1', 4, 5);
  const anchor = spawnHero('ANCHOR', 'P1', 2, 2);
  const object = spawnHero('BARRICADE', 'P1', 4, 4);
  const nearby = spawnHero('HALO', 'P1', 3, 5);
  const outside = spawnHero('LILY', 'P1', 6, 6);
  const enemy = spawnHero('BLAST', 'P2', 3, 4);
  for (const [r, c] of [[2, 3], [2, 2], [4, 4], [3, 4]]) {
    assert.equal(hasTarget(nexus, 'A', r, c), false);
  }
  assert.equal(hasTarget(nexus, 'A', 2, 1), true);
  await skill(nexus, 'A', 4, 5);
  assert.equal(bit.getShieldVal(), 10);
  assert.equal(getEffectiveAtk(bit), 10);
  assert.equal(getEffectiveAtk(nexus), 18);
  for (const piece of [nexus, anchor, object, nearby, outside]) assert.equal(piece.getShieldVal(), 0);
  await skill(nexus, 'ULT', 2, 3);
  assert.equal(nexus.getShieldVal(), 20);
  assert.equal(getEffectiveAtk(nexus), 24);
  assert.equal(nearby.getShieldVal(), 20);
  assert.equal(bit.getShieldVal(), 30);
  for (const piece of [anchor, object, outside, enemy]) assert.equal(piece.getShieldVal(), 0);
  tickTurnEffects();
  assert.equal(getEffectiveAtk(bit), 5);
  assert.equal(getEffectiveAtk(nexus), 24);
  tickTurnEffects();
  assert.equal(nearby.getShieldVal(), 20);
  tickTurnEffects();
  assert.equal(nearby.getShieldVal(), 0);
  assert.equal(getEffectiveAtk(nexus), 15);
});

test('Lily targets full-health units only for cleansing and stops the pulse at its first collision', async () => {
  initBoard();
  const lily = spawnHero('LILY', 'P1', 5, 2);
  const full = spawnHero('HALO', 'P1', 4, 2);
  const object = spawnHero('BARRICADE', 'P1', 3, 2);
  object.hp = 20;
  assert.equal(hasTarget(lily, 'A', 4, 2), false);
  full.applyDebuff('disarm', 1);
  await skill(lily, 'A', 4, 2);
  assert.equal(full.debuffs.length, 0);
  await processTurnEnd('P1');
  assert.equal(object.hp, 20);
  board[4][2] = null;
  await processTurnEnd('P1');
  assert.equal(object.hp, 25);
  const ally = spawnHero('WARDEN', 'P1', 6, 0);
  ally.hp = 70;
  ally.applyDebuff('silence', 1);
  await skill(lily, 'ULT');
  assert.equal(ally.hp, 90);
  assert.equal(ally.debuffs.length, 0);
  assert.equal(getTeamUltGauge('P1'), 0);
});

test('Warden and Vulcan apply the revised ULT effects and replacing a turret respects silence', async () => {
  initBoard();
  const warden = spawnHero('WARDEN', 'P1', 2, 2);
  const vulcan = spawnHero('VULCAN', 'P1', 4, 4);
  const enemy = spawnHero('KINESIS', 'P2', 2, 3);
  const alliedAnchor = spawnHero('ANCHOR', 'P1', 6, 6);
  const enemyAnchor = spawnHero('ANCHOR', 'P2', 4, 6);
  const enemyByAnchor = spawnHero('LILY', 'P2', 5, 6);
  assert.equal(warden.hp, 100);
  assert.equal(vulcan.hp, 90);
  await skill(warden, 'A', 2, 1);
  assert.equal(getEffectiveAtk(warden), 20);
  await skill(warden, 'ULT');
  assert.equal(warden.getShieldVal(), 20);
  assert.equal(alliedAnchor.getShieldVal(), 20);
  assert.equal(enemyAnchor.getShieldVal(), 0);
  assert.equal(enemy.debuffs.length, 3);
  assert.equal(enemyByAnchor.debuffs.length, 0);
  assert.equal(vulcan.getShieldVal(), 0);
  await skill(vulcan, 'A', 4, 5);
  const turret = board[4][5];
  assert.equal(turret.hp, 10);
  assert.equal(turret.maxHp, 10);
  assert.equal(turret.atk, 10);
  await processTurnEnd('P1');
  assert.equal(enemyByAnchor.hp, 80);
  assert.equal(enemyAnchor.hp, 100);
  await skill(vulcan, 'ULT', 4, 5);
  assert.equal(enemyAnchor.hp, 80);
  vulcan.applyDebuff('silence');
  await destroyObject(4, 5, 'P1');
  assert.equal(vulcan.stockA, 0);
  resetTurnPassives('P1');
  assert.equal(vulcan.stockA, 0);
  tickTurnEffects();
  resetTurnPassives('P1');
  assert.equal(vulcan.stockA, 1);
  assert.equal(getEffectiveAtk(vulcan), 23);
  tickTurnEffects();
  assert.equal(alliedAnchor.getShieldVal(), 20);
  tickTurnEffects();
  assert.equal(warden.getShieldVal(), 0);
  assert.equal(alliedAnchor.getShieldVal(), 0);
});

test('Smog places both zones and keeps its shield through the opposing hand', async () => {
  initBoard();
  const smog = spawnHero('SMOG', 'P1', 3, 3);
  const lily = spawnHero('LILY', 'P2', 1, 4);
  const enemy = spawnHero('KINESIS', 'P2', 2, 4);
  const anchor = spawnHero('ANCHOR', 'P2', 2, 3);
  const object = spawnHero('BARRICADE', 'P2', 2, 2);
  assert.equal(smog.stockA, 2);
  assert.equal(hasTarget(smog, 'A', 0, 3), false);
  await skill(smog, 'A', 2, 4);
  assert.deepEqual(poisonZones.map(({ r, c }) => [r, c]), [[2, 4], [3, 3]]);
  await skill(smog, 'A', 3, 3);
  assert.equal(poisonZones.length, 2);
  assert.equal(smog.stockA, 0);
  assert.equal(getEffectiveAtk(smog), 20);
  assert.equal(smog.getShieldVal(), 0);
  resetTurnPassives('P1');
  assert.equal(smog.getShieldVal(), 10);
  await skill(smog, 'ULT');
  assert.equal(poisonZones.length, 9);
  assert.equal(enemy.hp, 85);
  assert.equal(anchor.hp, 100);
  assert.equal(object.hp, 30);
  enemy.hp = 9;
  await processTurnEnd('P1');
  assert.equal(enemy.hp, 4);
  tickTurnEffects();
  assert.equal(smog.getShieldVal(), 10);
  await processTurnEnd('P2');
  assert.equal(lily.hp, 90);
  assert.equal(enemy.hp, 4);
  tickTurnEffects();
  assert.equal(smog.getShieldVal(), 0);
  resetActionOrders('P2');
  smog.hp = 1;
  await executeAttack(enemy, smog);
  assert.equal(poisonZones.length, 0);
});
