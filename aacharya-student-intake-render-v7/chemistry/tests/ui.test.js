import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
import {byId} from '../public/bank.js';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const dom=new JSDOM(html,{url:'https://practice.example.test/',pretendToBeVisual:true});
const {window}=dom;globalThis.window=window;globalThis.document=window.document;globalThis.localStorage=window.localStorage;
window.HTMLElement.prototype.scrollIntoView=function(){};
window.matchMedia=()=>({matches:true});
window.HTMLDialogElement.prototype.showModal=function(){this.open=true};window.HTMLDialogElement.prototype.close=function(){this.open=false};
const $=s=>document.querySelector(s);
const click=s=>{const el=$(s);assert.ok(el,`Missing element ${s}`);assert.ok(!el.disabled,`Disabled element ${s}`);el.click()};
const state=()=>JSON.parse(localStorage.getItem('aacharya-chemistry-ADMIN-1'));
globalThis.matchMedia=window.matchMedia;
let revision=0,progress=null;globalThis.fetch=async(url,opts)=>{if(opts?.body){const body=JSON.parse(opts.body);revision++;progress=body.progress;return {ok:true,json:async()=>({ok:true,revision,progress})};}return {ok:true,json:async()=>({ok:true,account:'ADMIN-1',role:'ADMIN',revision,progress})};};
const fill=v=>{const input=$('#short-answer');assert.ok(input&&!input.disabled);input.value=v;input.dispatchEvent(new window.Event('input',{bubbles:true}))};
await import('../public/app.js');
test('UI: generation, class/topic selection, correct answers, review and persistence',async()=>{
 assert.match($('#workspace').textContent,/A small step towards mastery/);
 assert.equal($('#topic').options.length,10);
 click('#generate');assert.equal(document.querySelectorAll('[data-question]').length,5);
 const a=state().attempt;
 for(let i=0;i<5;i++){click(`[data-question="${i}"]`);const q=byId[a.questions[i].id];if(q.type==='mcq')click(`input[name="answer"][value="${q.answer}"]`);else fill(String(q.answer))}
 assert.equal($('#answered-count').textContent,'5');
 assert.equal(Object.keys(state().attempt.answers).length,5);
 click('#submit');assert.equal($('.score-ring').getAttribute('aria-label'),'5 out of 5 points');
 assert.equal(document.querySelectorAll('.review-state.correct').length,5);assert.equal(state().history.length,1);
 click('[data-review="0"]');assert.ok($('.solution'));assert.equal(document.querySelectorAll('input[name="answer"]:disabled').length,4);
 click('#back-results');assert.ok($('.score-ring'));
 await new Promise(r=>setTimeout(r,500));await import('../public/app.js?reload=1');assert.equal($('.score-ring').getAttribute('aria-label'),'5 out of 5 points');assert.equal(state().history.length,1);
});
test('UI: reset clears answers, score, solution flags and returns to first question',()=>{
 click('#reset');assert.equal($('#modal').open,true);click('#dialog-confirm');
 assert.deepEqual(state().attempt.answers,{});assert.deepEqual(state().attempt.revealed,[]);assert.equal(state().attempt.submitted,false);
 assert.equal($('#answered-count').textContent,'0');assert.equal($('[aria-current="step"]').textContent,'1');assert.equal($('.score-ring'),null);assert.equal($('.solution'),null);
});
test('UI: wrong, assisted and skipped questions score zero; reveal cancel leaves question editable',()=>{
 click('input[name="answer"][value="1"]');click('[data-question="1"]');
 click('#reveal');click('#dialog-cancel');assert.equal($('.solution'),null);assert.equal(state().attempt.revealed.length,0);
 click('#reveal');click('#dialog-confirm');assert.ok($('.solution'));assert.equal(state().attempt.revealed.length,1);assert.equal(document.querySelectorAll('input[name="answer"]:disabled').length,4);
 click('#finish-early');assert.equal($('#modal').open,true);assert.match($('#modal').textContent,/3 questions are unanswered/);click('#dialog-confirm');
 assert.equal($('.score-ring').getAttribute('aria-label'),'0 out of 5 points');assert.equal(document.querySelectorAll('.review-state.assisted').length,1);assert.equal(document.querySelectorAll('.review-state.incorrect').length,1);assert.equal(document.querySelectorAll('.review-state.skipped').length,3);
});
test('UI: Class 12 chapters, malformed numeric validation and discard protection',()=>{
 click('[data-grade="12"]');assert.equal($('#topic').options.length,11);$('#topic').value='solutions';$('#topic').dispatchEvent(new window.Event('change'));click('#generate');
 assert.equal(state().attempt.grade,12);assert.ok(state().attempt.questions.every(q=>q.id.startsWith('solutions-')));
 click('[data-question="3"]');fill('0.5wrong');click('#finish-early');assert.match($('#answer-error').textContent,/valid number/);assert.equal($('#short-answer').getAttribute('aria-invalid'),'true');assert.equal(state().attempt.submitted,false);
 click('#generate');assert.equal($('#modal').open,true);click('#dialog-cancel');assert.equal($('#short-answer').value,'0.5wrong');
 fill('0');click('#generate');click('#dialog-confirm');assert.deepEqual(state().attempt.answers,{});
 $('#topic').value='all';$('#topic').dispatchEvent(new window.Event('change'));click('#generate');assert.equal(state().attempt.topic,'all');assert.ok(state().attempt.questions.every(q=>byId[q.id].grade===12));
});
test('UI: all-skipped submit, text answer matching and about dialog',()=>{
 click('#finish-early');assert.match($('#modal').textContent,/5 questions are unanswered/);click('#dialog-confirm');assert.equal($('.score-ring').getAttribute('aria-label'),'0 out of 5 points');
 click('[data-grade="11"]');$('#topic').value='organic';$('#topic').dispatchEvent(new window.Event('change'));click('#generate');
 for(let i=0;i<5;i++){click(`[data-question="${i}"]`);const q=byId[state().attempt.questions[i].id];if(q.type==='mcq')click(`input[value="${q.answer}"]`);else fill(' '+String(q.answer).toUpperCase()+' ')}
 click('#submit');assert.equal($('.score-ring').getAttribute('aria-label'),'5 out of 5 points');click('#about');assert.match($('#modal').textContent,/133 questions/);click('#dialog-cancel');
});
