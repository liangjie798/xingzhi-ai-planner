import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyContext,applyMemoryIntent,appendContextMessage} from '../src/lib/conversation-context.ts';
test('question about forgetting does not erase a saved fact',()=>{
 const c=emptyContext();applyMemoryIntent(c,'记住暗号是739');
 assert.match(applyMemoryIntent(c,'忘记暗号了吗？').reply,/739/);
 assert.equal(c.facts.length,1);
 applyMemoryIntent(c,'忘记暗号');assert.equal(c.facts.length,0);
});
test('compound question identifies unknown parallel item',()=>{
 const c=emptyContext();applyMemoryIntent(c,'记住暗号是739');
 const r=applyMemoryIntent(c,'暗号和酒店分别是什么？').reply;
 assert.match(r,/739/);assert.match(r,/酒店.*没有找到/);
});
test('trailing instruction removed only on update',()=>{
 const c=emptyContext();applyMemoryIntent(c,'记住暗号是739');applyMemoryIntent(c,'暗号改成481，其余照旧。');
 assert.equal(c.facts[0].value,'481');
});
test('natural recall may reach model with existing context',()=>{
 const c=emptyContext();appendContextMessage(c,{id:'a',role:'user',content:'我的箱子是橙色，伙伴叫许岚'});
 assert.equal(applyMemoryIntent(c,'刚才我提到的箱子颜色和伙伴姓名各是什么？').reply,undefined);
});
