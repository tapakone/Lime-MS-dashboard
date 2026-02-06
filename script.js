
async function load(){
 const sym=document.getElementById('assetInput').value.toLowerCase();
 const file=sym==='xauusd'?'data/xauusd_5m.json':`data/${sym}_15m.json`;
 const r=await fetch(file,{cache:'no-store'});
 const j=await r.json();
 const d=j.data[j.data.length-1];
 document.getElementById('price').textContent=d?.close||'-';
 document.getElementById('source').textContent=j.source;
 document.getElementById('updated').textContent=j.updated_at;
}
load();
