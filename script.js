
const DATA_GOLD="data/xauusd_latest.json";
const TICKERS="tickers.json";

function scoreFromSlope(absPct){const s=Math.min(5,(absPct/15)*5);return Math.round(s*10)/10;}
function colorFromScore(score){if(score>=4.0)return"bad";if(score>=3.0)return"warn";return"good";}
function adviceFromScore(score){if(score>=4.0)return"HIGH RISK";if(score>=3.0)return"WATCH";return"BUY";}
function fmt(n){if(n===null||n===undefined)return"—";return Number(n).toLocaleString(undefined,{maximumFractionDigits:2});}
function thTimeNow(){const d=new Date();const utc=d.getTime()+d.getTimezoneOffset()*60000;const th=new Date(utc+7*3600000);return String(th.getHours()).padStart(2,"0")+":"+String(th.getMinutes()).padStart(2,"0")+" (TH)";}
async function loadJSON(url){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);return await r.json();}

function buildDemoSeries(latest){const n=31;let v=latest||2000;const arr=[];for(let i=0;i<n;i++){v=v*(1+Math.sin(i/4)*0.002);arr.push({v});}if(latest)arr[arr.length-1].v=latest;return arr;}

function drawChart(canvas, series, forecast){
  const ctx=canvas.getContext("2d");const w=canvas.width,h=canvas.height;
  const padL=60,padR=20,padT=20,padB=40;const plotW=w-padL-padR,plotH=h-padT-padB;
  ctx.fillStyle="#0b0f18";ctx.fillRect(0,0,w,h);
  ctx.strokeStyle="#1f2a3a";ctx.lineWidth=1;
  for(let i=0;i<=7;i++){const x=padL+plotW*i/7;ctx.beginPath();ctx.moveTo(x,padT);ctx.lineTo(x,padT+plotH);ctx.stroke();}
  for(let i=0;i<=5;i++){const y=padT+plotH*i/5;ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(padL+plotW,y);ctx.stroke();}
  if(!series||series.length<2){ctx.fillStyle="#8aa0b8";ctx.font="16px system-ui";ctx.fillText("No series yet — wait for Actions.",padL,padT+30);return;}
  const vals=series.map(p=>p.v);const minV=Math.min(...vals),maxV=Math.max(...vals);const span=(maxV-minV)||1;
  const xAt=i=>padL+plotW*(i/(series.length-1));const yAt=v=>padT+plotH*(1-((v-minV)/span));
  ctx.fillStyle="#8aa0b8";ctx.font="12px system-ui";ctx.fillText(fmt(maxV),10,padT+10);ctx.fillText(fmt(minV),10,padT+plotH);
  ctx.strokeStyle="#e7eef7";ctx.lineWidth=2;ctx.beginPath();
  series.forEach((p,i)=>{const x=xAt(i),y=yAt(p.v);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
  const last=series[series.length-1];
  ctx.fillStyle="#ffd166";ctx.beginPath();ctx.arc(xAt(series.length-1),yAt(last.v),5,0,Math.PI*2);ctx.fill();
  if(forecast&&typeof forecast.v==="number"){
    const x0=xAt(series.length-1),y0=yAt(last.v),x1=padL+plotW+5,y1=yAt(forecast.v);
    ctx.setLineDash([6,6]);ctx.strokeStyle="#ffd166";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();ctx.setLineDash([]);
    const ang=Math.atan2(y1-y0,x1-x0),ah=10;ctx.fillStyle="#ffd166";ctx.beginPath();ctx.moveTo(x1,y1);
    ctx.lineTo(x1-ah*Math.cos(ang-Math.PI/6),y1-ah*Math.sin(ang-Math.PI/6));
    ctx.lineTo(x1-ah*Math.cos(ang+Math.PI/6),y1-ah*Math.sin(ang+Math.PI/6));ctx.closePath();ctx.fill();
  }
  ctx.fillStyle="#8aa0b8";ctx.font="12px system-ui";ctx.fillText("-30d",padL,h-14);ctx.fillText("0 (today)",padL+plotW-60,h-14);ctx.fillText("+1d",padL+plotW+2,h-14);
}

function applyRow(scoreId, barId, score){
  document.getElementById(scoreId).textContent=score.toFixed(1);
  const bar=document.getElementById(barId);bar.innerHTML="";
  const pct=Math.max(0,Math.min(100,(score/5)*100));
  const c=colorFromScore(score);const colors={good:"#3bd47a",warn:"#ffd166",bad:"#ff4d4f"};
  const fill=document.createElement("div");fill.style.height="100%";fill.style.width=pct+"%";fill.style.background=colors[c];fill.style.borderRadius="999px";bar.appendChild(fill);
}

function setAdvice(scoreMax){
  const pill=document.getElementById("advicePill");const alert=document.getElementById("alertBox");
  pill.textContent=`${adviceFromScore(scoreMax)} • score ${scoreMax.toFixed(1)}`;
  const c=colorFromScore(scoreMax);
  pill.style.borderColor=(c==="bad")?"rgba(255,77,79,.6)":(c==="warn")?"rgba(255,209,102,.5)":"rgba(59,212,122,.5)";
  pill.style.background=(c==="bad")?"rgba(255,77,79,.12)":(c==="warn")?"rgba(255,209,102,.10)":"rgba(59,212,122,.10)";
  if(scoreMax>=4.5)alert.classList.add("blink");else alert.classList.remove("blink");
}

async function hydrateAutocomplete(){
  try{
    const t=await loadJSON(TICKERS);
    const list=document.getElementById("assetList");list.innerHTML="";
    const o=document.createElement("option");o.value="XAUUSD";o.label="Gold Spot (XAU/USD)";list.appendChild(o);
    (t.us||[]).forEach(x=>{const op=document.createElement("option");op.value=x.symbol;op.label=x.name||x.symbol;list.appendChild(op);});
  }catch(e){}
}

async function main(){
  document.getElementById("timeThai").textContent=thTimeNow();
  setInterval(()=>document.getElementById("timeThai").textContent=thTimeNow(),15000);
  await hydrateAutocomplete();

  const canvas=document.getElementById("chart");
  let gold;
  try{gold=await loadJSON(DATA_GOLD);}catch(e){gold={price:null,source:"—",stale:true,fetched_utc:"—"};}
  document.getElementById("lastPrice").textContent=gold.price?`$${fmt(gold.price)}`:"—";
  document.getElementById("src").textContent=gold.source||"—";
  document.getElementById("stale").textContent=gold.stale?"YES":"NO";
  document.getElementById("updated").textContent=(gold.fetched_utc||"—").replace("T"," ").replace("Z","");

  const series=buildDemoSeries(gold.price||0);
  const v0=series[series.length-2].v, v1=series[series.length-1].v;
  const pct=((v1-v0)/v0)*100;
  const scoreD=scoreFromSlope(Math.abs(pct));
  const score2=Math.min(5,Math.round(scoreD*0.92*10)/10);
  const score1=Math.min(5,Math.round(scoreD*0.85*10)/10);

  applyRow("scoreD","barD",scoreD);
  applyRow("score2","bar2",score2);
  applyRow("score1","bar1",score1);
  const scoreMax=Math.max(scoreD,score2,score1);
  setAdvice(scoreMax);

  const forecast={v:v1*(1+(pct/100)*0.6)};
  drawChart(canvas,series,forecast);

  document.getElementById("btnReload").addEventListener("click",()=>location.reload());
}
main();
