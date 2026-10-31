import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyContext,applyMemoryIntent,appendContextMessage,restoreContext} from '../src/lib/conversation-context.ts';

function remembered(){
  const ctx=emptyContext();
  applyMemoryIntent(ctx,'请记住：本次测试旅行代号是青竹4726。');
  applyMemoryIntent(ctx,'请记住：本次同行人的名字是林舟。');
  return ctx;
}
test('all requested facts are recalled after history compaction and restoration',()=>{
  const ctx=remembered();
  for(let i=0;i<60;i++)appendContextMessage(ctx,{id:`m${i}`,role:i%2?'assistant':'user',content:`旅行讨论${i}`});
  const restored=restoreContext(JSON.parse(JSON.stringify(ctx)),[]);
  for(const query of ['本次测试旅行代号是什么？同行人叫什么？','旅行代号和同行人分别是什么？']){
    const reply=applyMemoryIntent(restored,query).reply;
    assert.match(reply,/青竹4726/);assert.match(reply,/林舟/);
  }
  assert.ok(restored.summarizedMessages>0);
});
test('compound recall reports an unknown item instead of silently omitting it',()=>{
  const reply=applyMemoryIntent(remembered(),'旅行代号是什么？集合地点是什么？').reply;
  assert.match(reply,/青竹4726/);assert.match(reply,/集合地点.*没有找到/);
});
test('numbered memory lookup does not confuse item 1 with item 11',()=>{
  const ctx=emptyContext();applyMemoryIntent(ctx,'记住旅行备忘1是雨伞');applyMemoryIntent(ctx,'记住旅行备忘11是充电器');
  const reply=applyMemoryIntent(ctx,'旅行备忘11是什么？').reply;
  assert.match(reply,/充电器/);assert.doesNotMatch(reply,/雨伞/);
});
test('specific keys win over overlapping keys while a standalone name still works',()=>{
  const ctx=remembered();applyMemoryIntent(ctx,'记住代号是短代码');applyMemoryIntent(ctx,'记住名字是小舟');
  assert.doesNotMatch(applyMemoryIntent(ctx,'旅行代号是什么？').reply,/短代码/);
  assert.match(applyMemoryIntent(ctx,'名字是什么？').reply,/小舟/);
  const both=applyMemoryIntent(ctx,'代号是什么？旅行代号是什么？').reply;
  assert.match(both,/短代码/);assert.match(both,/青竹4726/);
});
test('update constraints stay out of fact values and do not change other facts',()=>{
  for(const tail of ['，其他不变。','，其他条件保持不变。','；其余信息不要修改。']){
    const ctx=remembered();applyMemoryIntent(ctx,'把本次测试旅行代号改成白鹭9361'+tail);
    assert.equal(ctx.facts.find(f=>f.key==='旅行代号').value,'白鹭9361');
    assert.equal(ctx.facts.find(f=>f.key==='同行人的名字').value,'林舟');
    const reply=applyMemoryIntent(ctx,'当前旅行代号是什么？同行人叫什么？').reply;
    assert.match(reply,/白鹭9361/);assert.match(reply,/林舟/);assert.doesNotMatch(reply,/青竹4726|其他不变/);
  }
});
test('literal quoted values and new memories are not rewritten as instructions',()=>{
  const ctx=remembered();applyMemoryIntent(ctx,'记住口号是其他不变。');
  assert.equal(ctx.facts.find(f=>f.key==='口号').value,'其他不变');
  applyMemoryIntent(ctx,'把旅行代号改成“白鹭9361，其他不变”。');
  assert.equal(ctx.facts.find(f=>f.key==='旅行代号').value,'“白鹭9361，其他不变”');
});
test('forgetting one item never discloses it in a compound recall',()=>{
  const ctx=remembered();applyMemoryIntent(ctx,'忘记旅行代号');
  const reply=applyMemoryIntent(ctx,'同行人叫什么？旅行代号是什么？').reply;
  assert.match(reply,/林舟/);assert.match(reply,/旅行代号.*没有找到/);assert.doesNotMatch(reply,/青竹4726/);
});
