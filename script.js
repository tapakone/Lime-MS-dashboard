const $=(id)=>document.getElementById(id);

const DEFAULT_SYMBOL="JEPQ";
let chart=null;

function slugify(sym){
  return sym.trim().toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9\-_=\.]/g,"");
}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function fmt(x,d=2){
  if(x===null||x===undefined||Number.isNaN(Number(x))) return "--";
  return Number(x).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
}
function safeLabel(t){
  try{
    const dt = (typeof t==="number") ? new Date(t*1000) : new Date(t);
    if(Number.isNaN(dt.getTime())) return String(t).slice(0,10);
    return dt.toLocaleDateString("th-TH",{day:"2-digit",month:"2-digit"});
  }catch{return String(t).slice(0,10);}
}

function showModal(msg){
  $("modalText").textContent=msg;
  $("modal").classList.remove("hidden");
}
function hideModal(){ $("modal").classList.add("hidden"); }

async function loadJSON(path){
  const r=await fetch(path,{cache:"no-store"});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

function sma(arr,p){
  return arr.map((_,i)=>{
    const s=arr.slice(Math.max(0,i-p+1),i+1);
    return s.reduce((a,b)=>a+b,0)/s.length;
  });
}
function bands(arr,win){
  return arr.map((_,i)=>{
    const s=arr.slice(Math.max(0,i-win+1),i+1);
    const mean=s.reduce((a,b)=>a+b,0)/s.length;
    const sd=Math.sqrt(s.reduce((a,b)=>a+(b-mean)**2,0)/s.length);
    return {mean,sd,upper:mean+2*sd,lower:mean-2*sd};
  });
}

function riskFromSlopeZ(slopeRatioPerDay,z){
  const slopePct=Math.abs(slopeRatioPerDay*100);
  const zAbs=Math.abs(z);
  const zPart=clamp(zAbs*1.2,0,3);
  const slopePart=clamp(slopePct*0.8,0,2);
  return clamp(zPart+slopePart,0,5);
}
function classify(r){ if(r<=1.6) return "BUY"; if(r<=3.2) return "HOLD"; return "SELL"; }
function advice(r,slope){
  if(r<=1.6) return ["BUY", slope>0 ? "Momentum ขาขึ้นและความเสี่ยงต่ำ — ทยอยสะสม/เพิ่มน้ำหนักได้" : "ย่อแต่ยังเสี่ยงต่ำ — ทยอยสะสมแบบแบ่งไม้"];
  if(r<=3.2) return ["HOLD","สัญญาณผสม — คุมขนาดพอร์ต รอทิศทางชัดขึ้น"];
  return ["SELL","เสี่ยงสูง/ออกนอกกรอบ — ลดความเสี่ยง รอให้กลับเข้ากรอบก่อน"];
}
function flagFromDelta(d){
  const a=Math.abs(d);
  if(a<0.25) return ["OK","flag--ok"];
  if(a<0.70) return ["WATCH","flag--warn"];
  return ["HOT","flag--bad"];
}
function buildMonitor(c15){
  const last=c15.at(-1);
  const windows=[["15m",1],["30m",2],["60m",4],["90m",6],["120m",8]];
  return windows.map(([name,n])=>{
    const slice=c15.slice(Math.max(0,c15.length-1-n),c15.length-1);
    const ref=slice.length? slice.reduce((a,b)=>a+b,0)/slice.length : last;
    const delta=ref? ((last-ref)/ref)*100 : 0;
    const [flag,cls]=flagFromDelta(delta);
    return {name,delta,flag,cls};
  });
}
function renderMonitor(rows){
  const el=$("monitorRows"); el.innerHTML="";
  for(const r of rows){
    const div=document.createElement("div");
    div.className="mrow";
    div.innerHTML=`<div class="name">${r.name}</div><div></div><div class="delta">${fmt(r.delta,2)}%</div><div class="flag ${r.cls}">${r.flag}</div>`;
    el.appendChild(div);
  }
}

function setBadge(state){
  const b=$("badge");
  b.textContent=state;
  b.classList.remove("badge--buy","badge--hold","badge--sell","badge--wait");
  if(state==="BUY") b.classList.add("badge--buy");
  else if(state==="HOLD") b.classList.add("badge--hold");
  else if(state==="SELL") b.classList.add("badge--sell");
  else b.classList.add("badge--wait");

  const mb=$("miniBadge");
  mb.textContent=state;
  mb.style.color=(state==="BUY")?"var(--good)":(state==="HOLD")?"var(--hold)":"var(--bad)";
  mb.style.background=(state==="BUY")?"rgba(42,214,122,.12)":(state==="HOLD")?"rgba(242,183,75,.12)":"rgba(255,77,90,.12)";
}
function setAdviceBadge(txt){
  const p=$("adviceBadge");
  p.textContent=txt;
  p.classList.remove("pill--buy","pill--hold","pill--sell");
  if(txt==="BUY") p.classList.add("pill--buy");
  else if(txt==="SELL") p.classList.add("pill--sell");
  else p.classList.add("pill--hold");
}
function setClock(){
  const now=new Date();
  $("clock").textContent=now.toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"})+" (UTC+7)";
  $("miniTime").textContent=now.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"});
}
setInterval(setClock,1000);

function buildChart(labels,closes,ma3,upper,lower){
  const ctx=$("chart");
  if(chart) chart.destroy();
  chart=new Chart(ctx,{
    type:"line",
    data:{labels,datasets:[
      {label:"Price",data:closes,borderColor:getComputedStyle(document.documentElement).getPropertyValue("--price").trim(),pointRadius:1.8,borderWidth:2},
      {label:"Mid (MA3)",data:ma3,borderColor:getComputedStyle(document.documentElement).getPropertyValue("--mid").trim(),pointRadius:0,borderWidth:2,borderDash:[6,6]},
      {label:"Upper",data:upper,borderColor:getComputedStyle(document.documentElement).getPropertyValue("--band").trim(),pointRadius:0,borderWidth:1.6},
      {label:"Lower",data:lower,borderColor:getComputedStyle(document.documentElement).getPropertyValue("--band").trim(),pointRadius:0,borderWidth:1.6},
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{mode:"index",intersect:false}},
      scales:{
        x:{grid:{color:"rgba(255,255,255,.06)"},ticks:{color:"rgba(231,237,248,.55)",maxRotation:0}},
        y:{grid:{color:"rgba(255,255,255,.06)"},ticks:{color:"rgba(231,237,248,.55)"}}}
    }
  });
  ctx.parentElement.style.height="520px";
}

function getHuman(){
  const k="limes_ms_human_risk";
  const v=localStorage.getItem(k);
  return clamp(v?Number(v):1.8,0,5);
}
function setHuman(v){ localStorage.setItem("limes_ms_human_risk",String(v)); }

async function loadSymbol(symbol){
  const sym=symbol.trim();
  if(!sym) return;
  $("assetTitle").textContent=sym.toUpperCase();
  $("miniSymbol").textContent=sym.toUpperCase();

  const slug=slugify(sym);
  const dailyPath=`data/${slug}_daily.json`;
  const m15Path=`data/${slug}_15m.json`;

  let daily,m15;
  try{ [daily,m15]=await Promise.all([loadJSON(dailyPath),loadJSON(m15Path)]); }
  catch{
    showModal(`หาไฟล์ข้อมูลไม่เจอสำหรับ ${sym}\nต้องมี:\n- ${dailyPath}\n- ${m15Path}`);
    return;
  }
  if(!daily?.rows?.length || !m15?.rows?.length){
    showModal(`ข้อมูลไม่พอสำหรับ ${sym} (JSON ยังว่าง/สั้นเกินไป)`);
    return;
  }

  const closes=daily.rows.map(r=>Number(r.close)).filter(Number.isFinite);
  const labels=daily.rows.map(r=>safeLabel(r.time));
  if(closes.length<20){ showModal(`ข้อมูลไม่พอสำหรับ ${sym} (ต้องมีอย่างน้อย ~20 จุด)`); return; }

  const ma3=sma(closes,3);
  const bb=bands(closes,40);
  const upper=bb.map(x=>x.upper);
  const lower=bb.map(x=>x.lower);
  buildChart(labels,closes,ma3,upper,lower);

  const n=closes.length;
  const look=Math.min(10,n-1);
  const p0=closes[n-1-look], p1=closes[n-1];
  const slope=(p1-p0)/(p0||1e-9)/look;

  const mid=ma3[n-1];
  const sd=(upper[n-1]-mid)/2 || 1e-9;
  const z=(closes[n-1]-mid)/sd;

  const c15=m15.rows.map(r=>Number(r.close)).filter(Number.isFinite);
  renderMonitor(buildMonitor(c15));
  const latest15=c15.at(-1);

  const human=getHuman();
  $("humanSlider").value=String(human);
  $("humanNum").textContent=fmt(human,1);

  const base=riskFromSlopeZ(slope,z);
  const risk=clamp(base*0.7 + human*0.3,0,5);
  $("riskNum").textContent=fmt(risk,2);
  $("riskBar").style.width=`${(risk/5)*100}%`;
  $("miniRisk").textContent=`${fmt(risk,2)}/5`;

  const state=classify(risk);
  setBadge(state);

  const forecast=closes[n-1]*(1+slope);
  $("refTime").textContent=daily.ref_th ?? "--";
  $("latest15").textContent=fmt(latest15,2);
  $("forecast1d").textContent=fmt(forecast,2);
  $("slope").textContent=fmt(slope*100,2)+"%/day";
  $("zscore").textContent=fmt(z,2);
  $("zPill").textContent="Z="+fmt(z,2);

  const conf=clamp(100-risk*15,0,100);
  $("confPill").textContent="Conf="+fmt(conf,0)+"%";

  const [adv,txt]=advice(risk,slope);
  setAdviceBadge(adv);
  $("adviceText").textContent=txt;
}

function wire(){
  $("modalClose").addEventListener("click",hideModal);
  $("modal").addEventListener("click",(e)=>{if(e.target.id==="modal") hideModal();});
  $("loadBtn").addEventListener("click",()=>loadSymbol($("symbolInput").value||DEFAULT_SYMBOL));
  $("symbolInput").addEventListener("keydown",(e)=>{if(e.key==="Enter") loadSymbol($("symbolInput").value);});
  $("humanSlider").addEventListener("input",()=>{
    const v=clamp(Number($("humanSlider").value),0,5);
    setHuman(v);
    $("humanNum").textContent=fmt(v,1);
  });
}
async function boot(){
  wire(); setClock();
  const h=getHuman();
  $("humanSlider").value=String(h);
  $("humanNum").textContent=fmt(h,1);
  $("symbolInput").value=DEFAULT_SYMBOL;
  await loadSymbol(DEFAULT_SYMBOL);
}
boot();
