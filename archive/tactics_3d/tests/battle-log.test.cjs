const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const nodes = new Map();
const element = id => {
  if (!nodes.has(id)) nodes.set(id, { dataset: {}, attributes: {}, style: {}, setAttribute(k, v) { this.attributes[k] = v; } });
  return nodes.get(id);
};
const context = vm.createContext({
  structuredClone, matchMedia: () => ({ matches: true }),
  document: { getElementById: element, querySelector: () => null },
  clearTimeout() {}, setTimeout: () => 1,
});
const source = fs.readFileSync(path.join(__dirname, '..', 'battle-ui.js'), 'utf8');
vm.runInContext(source.slice(0, source.indexOf("document.addEventListener('click'")), context);
const run = code => vm.runInContext(code, context);
run('render = () => {}; renderInspectorTabs();');
assert.equal(element('panel-log').hidden, true);
assert.match(element('battle-log-list').innerHTML, /battle-log-empty/);
run("setInspectorTab('log')");
assert.equal(element('tab-log').attributes['aria-selected'], 'true');
assert.equal(element('tab-log').tabIndex, 0);
assert.equal(element('panel-details').hidden, true);
run("setInspectorTab('invalid')");
assert.equal(run('state.inspectorTab'), 'log');

// Rejected actions and canceled commands must not create records.
run("state.mode = 'attack'; state.pending = '0,0'; execute(); cancel();");
assert.equal(run('state.battleLog.length'), 0);
run("state.mode = 'move'; state.pending = '3,2'; execute(); finishExecution();");
assert.equal(run('state.battleLog.length'), 1);
assert.equal(run('state.battleLog[0].turn'), 3);
assert.match(run('state.battleLog[0].text'), /D3.*C4/);
run("delete state.pieces['1,3']; state.pieces['3,3'] = 'enemy_toxin'; state.mode = 'attack'; state.pending = '3,3'; execute(); finishExecution();");
assert.equal(run('state.entities.enemy_toxin.hp'), 45);
assert.match(run('state.battleLog[1].text'), /30.*75.*45/);
run("state.mode = 'skill'; state.pending = 'self'; execute(); finishExecution();");
assert.equal(run('state.entities.kinesis.skill.stock'), 1);
run("state.mode = 'ult'; state.pending = 'self'; execute(); finishExecution();");
assert.equal(run('state.ult.ally'), 0);
run("state.mode = 'endturn'; state.pending = 'next'; execute(); finishExecution();");
assert.equal(run('state.turn'), 4);
assert.equal(run('state.battleLog[4].turn'), 3);
run("state.selected = 'barricade'; state.mode = 'remove'; state.pending = 'remove'; execute(); finishExecution(); renderInspectorTabs();");
assert.equal(run('state.battleLog.length'), 6);
assert.equal(element('battle-log-count').textContent, 6);
assert.ok(element('battle-log-list').innerHTML.indexOf('#6') < element('battle-log-list').innerHTML.indexOf('#1'));
assert.equal(run('state.inspectorTab'), 'log');
run("recordBattle('skill', '<script>alert(1)</script>'); renderInspectorTabs();");
assert.ok(!element('battle-log-list').innerHTML.includes('<script>'));
run('resetBattle(); renderInspectorTabs();');
assert.equal(run('state.battleLog.length'), 0);
assert.equal(element('battle-log-count').textContent, 0);
assert.match(element('battle-log-list').innerHTML, /battle-log-empty/);
console.log('PASS: tab state, rejected actions, movement, attack results, skill, ult, turn, removal, ordering, escaping and reset.');
