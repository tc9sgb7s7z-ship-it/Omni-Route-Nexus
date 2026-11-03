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
test('replacement Lübeck JSON matches its browser data',()=>{const sandbox={window:{}};vm.runInNewContext(read('cities/luebeck.js'),sandbox);assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.CITY_DATA)),json);});
for(const [file,name] of [['luebeck','吕贝克'],['rostock','罗斯托克'],['sassnitz','萨斯尼茨']]){
 test(name+' loads all 50 cards and preserves full display titles',()=>{const {context,document}=app();context.updateCityDropdown('德国');assert.ok(document.getElementById('cityFilter').innerHTML.includes(name));context.loadCityData('cities/'+file+'.js');assert.ok(document.getElementById('cityTitle').innerText.includes(name));const sandbox={window:{}};vm.runInNewContext(read('cities/'+file+'.js'),sandbox);const spots=sandbox.window.CITY_DATA.spots;assert.equal(spots.length,50);assert.equal(new Set(spots.map(s=>s.id)).size,50);const grid=document.getElementById('spotGrid').innerHTML;assert.equal((grid.match(/class="card"/g)||[]).length,50);for(const s of spots)assert.ok(grid.includes('<h4 class="c-title">'+context.escapeCardText(context.spotDisplayName(s))+'</h4>'));context.openSpot(spots[0].id);assert.equal(document.getElementById('m-title').innerText,spots[0].name);context.renderTimelineRoute(spots,4,1,'一日路线',{id:'START',name:'城市中心',lat:spots[0].lat,lon:spots[0].lon,dur:'起点'});assert.doesNotMatch(document.getElementById('itineraryResult').innerHTML,/NaN|undefined/);context.loadCityData('cities/hamburg.js');assert.match(document.getElementById('cityTitle').innerText,/汉堡/);});
}
test('labels preserve spaces rather than truncating multiword Chinese or foreign names',()=>{const {context}=app();assert.equal(context.spotDisplayName({name:'南 Priwall 自然保护区 (Südlicher Priwall)'}),'南 Priwall 自然保护区');assert.equal(context.spotDisplayName({name:'Alter Leuchtturm Travemünde'}),'Alter Leuchtturm Travemünde');assert.equal(context.escapeCardText('<img src=x>&'),'&lt;img src=x&gt;&amp;');});
