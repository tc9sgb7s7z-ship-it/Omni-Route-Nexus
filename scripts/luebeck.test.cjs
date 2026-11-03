const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=JSON.parse(read('cities/luebeck.json'));
function app(){
 const nodes=new Map();
 const node=()=>({innerHTML:'',innerText:'',textContent:'',value:'',style:{},classList:{add(){},remove(){},toggle(){}},click(){},remove(){},replaceChildren(){},appendChild(){},addEventListener(){},querySelectorAll(){return []}});
 const document={baseURI:'https://example.test/Omn.html',getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},createElement:node,querySelectorAll(){return [node()]}};
 const context={window:{},document,console,URL,fetch:()=>Promise.resolve({json:()=>Promise.resolve({})}),alert:m=>{throw Error(m)},navigator:{}};
 vm.createContext(context);
 document.body={appendChild(script){const p=new URL(script.src).pathname.slice(1);vm.runInContext(read(p),context);script.onload();}};
 const scripts=[...read('Omn.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
 for(const code of scripts)vm.runInContext(code,context);
 return {context,document};
}
test('JSON and browser registration contain identical data',()=>{
 const sandbox={window:{}};vm.runInNewContext(read('cities/luebeck.js'),sandbox);
 assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.CITY_DATA)),json);
 assert.equal(json.spots.length,50);assert.equal(new Set(json.spots.map(s=>s.id)).size,50);
 for(const s of json.spots){assert.ok(['自然风光','科技与艺术','城市游览','购物','徒步'].includes(s.act[0]));assert.ok(s.season.every(x=>['春','夏','秋','冬'].includes(x)));assert.equal(new URL(s.source_url).protocol,'https:');assert.ok(s.lat>53.8&&s.lat<54.1&&s.lon>10.6&&s.lon<11);}
});
test('real city loader registers Lübeck and renders all 50 cards, then switches back to Hamburg',()=>{
 const {context,document}=app();context.updateCityDropdown('德国');assert.match(document.getElementById('cityFilter').innerHTML,/吕贝克/);
 context.loadCityData('cities/luebeck.js');assert.match(document.getElementById('cityTitle').innerText,/吕贝克/);
 assert.equal((document.getElementById('spotGrid').innerHTML.match(/class="card"/g)||[]).length,50);
 context.loadCityData('cities/hamburg.js');assert.match(document.getElementById('cityTitle').innerText,/汉堡/);
});
test('coastal search, detail card and generated coastal route work in the existing UI functions',()=>{
 const {context,document}=app();context.loadCityData('cities/luebeck.js');
 document.getElementById('gallerySearch').value='Travemünde';context.filterGallery();assert.match(document.getElementById('spotGrid').innerHTML,/Travemünde/);
 context.openSpot('lub_48');assert.match(document.getElementById('t-ticket').innerHTML,/封闭/);
 const coast=json.spots.filter(s=>s.area.includes('Travemünde'));context.renderTimelineRoute(coast,4,1,'海边一日',{id:'START',name:'海边车站',lat:53.963,lon:10.873,dur:'起点'});
 const route=document.getElementById('itineraryResult').innerHTML;assert.match(route,/Day 1/);assert.doesNotMatch(route,/NaN|undefined/);
});
test('winter closures, seasonal event dates and voucher uncertainty remain explicit',()=>{
 assert.match(json.spots.find(s=>s.id==='lub_4').ticket,/修缮关闭/);
 assert.match(json.spots.find(s=>s.id==='lub_13').ticket,/闭馆/);
 assert.match(json.spots.find(s=>s.id==='lub_41').ticket,/冬季/);
 assert.deepEqual(json.spots.find(s=>s.id==='lub_50').season,['冬']);
 assert.match(json.travel_notes.accommodation.note,/不代表/);
});
