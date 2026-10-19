import {topics,questionBank,byId} from './bank.js';
export const STORAGE_KEY='aacharya-chemistry-v1';
export function shuffle(items,rng=Math.random){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]]}return result}
export function generateSet(grade,topic,previous=[],rng=Math.random){
 const pool=questionBank.filter(q=>q.grade===Number(grade)&&(topic==='all'||q.topic===topic));
 if(pool.filter(q=>q.type==='mcq').length<3||pool.filter(q=>q.type!=='mcq').length<2)throw Error('Choose a valid class and topic.');
 let chosen=[...shuffle(pool.filter(q=>q.type==='mcq'),rng).slice(0,3),...shuffle(pool.filter(q=>q.type!=='mcq'),rng).slice(0,2)];
 if(chosen.every(q=>previous.includes(q.id))){const replacement=pool.find(q=>!previous.includes(q.id)&&q.type==='mcq');if(replacement)chosen[0]=replacement}
 return chosen.map(q=>({id:q.id,order:q.type==='mcq'?shuffle([0,1,2,3],rng):null}));
}
export function normalizeText(value){return String(value??'').normalize('NFKC').toLowerCase().trim().replace(/[–−—]/g,'-').replace(/[\s-]+/g,'').replace(/[.]+$/g,'')}
export function parseNumeric(value){
 let s=String(value??'').trim().replace(/[−–]/g,'-').replace(/\s+/g,'');
 if(!s)return null;
 const sci=s.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))[×x*]10\^([+-]?\d+)$/i);
 if(sci)s=sci[1]+'e'+sci[2];
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s))return null;
 const n=Number(s);return Number.isFinite(n)?n:null;
}
export function isCorrect(q,value){
 if(value===undefined||value===null||String(value).trim()==='')return false;
 if(q.type==='mcq')return Number(value)===q.answer;
 if(q.type==='numeric'){const v=parseNumeric(value);return v!==null&&Math.abs(v-q.answer)<=q.tolerance+Number.EPSILON*Math.max(1,Math.abs(q.answer))}
 return q.aliases.some(a=>normalizeText(a)===normalizeText(value));
}
export function scoreAttempt(attempt){const details=attempt.questions.map(({id})=>{const q=byId[id];const value=attempt.answers[id];const answered=value!==undefined&&String(value).trim()!=='';return{id,correct:!attempt.revealed.includes(id)&&isCorrect(q,value),status:attempt.revealed.includes(id)?'assisted':!answered?'skipped':isCorrect(q,value)?'correct':'incorrect'}});return{score:details.filter(x=>x.correct).length,total:details.length,details,assisted:details.filter(x=>x.status==='assisted').length,skipped:details.filter(x=>x.status==='skipped').length}}
export function makeAttempt(grade,topic,previous=[]){return{id:globalThis.crypto.randomUUID(),grade:Number(grade),topic,questions:generateSet(grade,topic,previous),answers:{},revealed:[],submitted:false,created:Date.now()}}
export function resetAttempt(attempt){return{...attempt,id:globalThis.crypto.randomUUID(),answers:{},revealed:[],submitted:false,created:Date.now()}}
export function validateAttempt(a){if(!a||!['11','12'].includes(String(a.grade))||!Array.isArray(a.questions)||a.questions.length!==5||typeof a.answers!=='object'||!a.answers||!Array.isArray(a.revealed)||typeof a.submitted!=='boolean')return false;const ids=a.questions.map(q=>q.id);return new Set(ids).size===5&&a.questions.every(item=>{const q=byId[item.id];return q&&q.grade===Number(a.grade)&&(a.topic==='all'||q.topic===a.topic)&&(q.type!=='mcq'||(Array.isArray(item.order)&&[...item.order].sort().join('')==='0123'))})&&a.revealed.every(id=>ids.includes(id))}
export function titleFor(topic){return topic==='all'?'Mixed chapter practice':topics.find(t=>t.id===topic)?.short||'Chemistry practice'}
