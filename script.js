/* ===============================
   LIMES MS — script.js (FULL)
   ใช้กับ GitHub Pages
   =============================== */

const DEFAULT_SYMBOL = "XAUUSD";
const DATA_DIR = "data";
const MIN_POINTS = 20;

// ---------- helpers ----------
function $(id) {
  return document.getElementById(id);
}

function nowTH() {
  return new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

function dataPath(symbol, tf) {
  // สำคัญมาก: underscore _
  return `${DATA_DIR}/${symbol.toLowerCase()}_${tf}.json`;
}

// ---------- fetch ----------
async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`404: ${url}`);
  return await res.json();
}

// ---------- indicators ----------
function ma(arr, n = 3) {
  return arr.map((_, i) => {
    if (i < n - 1) return null;
    const slice = arr.slice(i - n + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / n;
  });
}

function std(arr, n = 20) {
  return arr.map((_, i) => {
    if (i < n - 1) return null;
    const slice = arr.slice(i - n + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / n;
    const v =
      slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    return Math.sqrt(v);
  });
}

// ---------- chart ----------
let chart;

function renderChart(symbol, daily) {
  const labels = daily.map(d => d.date);
  const price = daily.map(d => d.close);

  if (price.length < MIN_POINTS) {
    alert(`ข้อมูลไม่พอสำหรับ ${symbol}`);
    return;
  }

  const mid = ma(price, 3);
  const sigma = std(price, 20);
  const upper = mid.map((v, i) =>
    v && sigma[i] ? v + 2 * sigma[i] : null
  );
  const lower = mid.map((v, i) =>
    v && sigma[i] ? v - 2 * sigma[i] : null
  );

  if (chart) chart.destroy();

  chart = new Chart($("priceChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Price",
          data: price,
          borderColor: "#f6c453",
          tension: 0.25,
          pointRadius: 2
        },
        {
          label: "Mid (MA3)",
          data: mid,
          borderColor: "#4fc3f7",
          borderDash: [5, 5],
          pointRadius: 0
        },
        {
          label: "Upper (+2σ)",
          data: upper,
          borderColor: "#90caf9",
          pointRadius: 0
        },
        {
          label: "Lower (-2σ)",
          data: lower,
          borderColor: "#90caf9",
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: "#ddd" } }
      },
      scales: {
        x: { ticks: { color: "#aaa" } },
        y: { ticks: { color: "#aaa" } }
      }
    }
  });
}

// ---------- state panel ----------
function renderState(symbol, daily) {
  const last = daily[daily.length - 1];
  const prev = daily[daily.length - 2];

  const slope =
    ((last.close - prev.close) / prev.close) * 100;

  $("stateSymbol").innerText = symbol;
  $("stateTime").innerText = nowTH();
  $("statePrice").innerText = last.close.toFixed(2);
  $("stateSlope").innerText = `${slope.toFixed(2)} %/day`;

  $("stateAction").innerText =
    slope > 0 ? "BUY" : "HOLD";
}

// ---------- main ----------
async function loadSymbol(symbol) {
  try {
    $("status").innerText = "LOADING…";

    const daily = await loadJSON(dataPath(symbol, "daily"));
    const intraday = await loadJSON(dataPath(symbol, "15m"));

    if (!daily || daily.length < MIN_POINTS)
      throw new Error("daily too short");

    renderChart(symbol, daily);
    renderState(symbol, daily);

    $("status").innerText = "READY";
  } catch (e) {
    console.error(e);
    alert(
      `ข้อมูลไม่พอสำหรับ ${symbol}\n(JSON ยังว่าง/สั้นเกินไป)`
    );
    $("status").innerText = "ERROR";
  }
}

// ---------- UI ----------
$("loadBtn").addEventListener("click", () => {
  const sym = $("symbolInput").value.trim().toUpperCase();
  if (sym) loadSymbol(sym);
});

window.addEventListener("load", () => {
  $("symbolInput").value = DEFAULT_SYMBOL;
  loadSymbol(DEFAULT_SYMBOL);
});    tr.innerHTML = `<td>${r.w}m</td><td>${r.dp==null?"--":fmt(r.dp,2)+"%"}</td><td class="${r.flag==="OK"?"flag-ok":r.flag==="WATCH"?"flag-warn":r.flag==="HIGH"?"flag-bad":""}">${r.flag}</td>`;
    tb.appendChild(tr);
  }
}
function monitorForcesHighRisk(rows){ return rows.some(r=>r.flag==="HIGH"); }

async function loadJSON(path){
  const res = await fetch(path, {cache:"no-store"});
  if(!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return await res.json();
}

function safeLabel(dateStr){
  const d=new Date(dateStr);
  const opt={timeZone:"Asia/Bangkok", day:"2-digit", month:"2-digit"};
  return new Intl.DateTimeFormat("th-TH", opt).format(d);
}

async function loadSymbol(symbol){
  const sym=symbol.trim();
  if(!sym) return;
  $("assetTitle").textContent = sym.toUpperCase();
  const slug=slugify(sym);
  const dailyPath=`data/${slug}_daily.json`;
  const m15Path=`data/${slug}_15m.json`;

  let daily,m15;
  try{ [daily,m15] = await Promise.all([loadJSON(dailyPath), loadJSON(m15Path)]); }
  catch(e){
    showModal(`หาไฟล์ข้อมูลไม่เจอสำหรับ ${sym}\nต้องมี:\n- ${dailyPath}\n- ${m15Path}\n\n(หน้าเว็บพร้อมแล้ว แต่ backend ต้องสร้าง JSON ให้ symbol นี้ก่อน)`);
    return;
  }
  if(!daily?.rows?.length || !m15?.rows?.length){
    showModal(`ข้อมูลไม่พอสำหรับ ${sym} (JSON ยังว่าง/สั้นเกินไป)`);
    return;
  }

  const closes=daily.rows.map(r=>Number(r.close));
  const labels=daily.rows.map(r=>safeLabel(r.time));

  const ma3=closes.map((_,i)=>{
    const a=closes.slice(Math.max(0,i-2), i+1);
    return a.reduce((x,y)=>x+y,0)/a.length;
  });

  const window=40;
  const upper=closes.map((_,i)=>{
    const s=closes.slice(Math.max(0,i-window+1), i+1);
    const mean=s.reduce((x,y)=>x+y,0)/s.length;
    const sd=Math.sqrt(s.reduce((x,y)=>x+(y-mean)**2,0)/s.length);
    return mean+2*sd;
  });
  const lower=closes.map((_,i)=>{
    const s=closes.slice(Math.max(0,i-window+1), i+1);
    const mean=s.reduce((x,y)=>x+y,0)/s.length;
    const sd=Math.sqrt(s.reduce((x,y)=>x+(y-mean)**2,0)/s.length);
    return mean-2*sd;
  });

  buildChart(labels, closes, ma3, upper, lower);

  const n=closes.length;
  const look=Math.min(10, n-1);
  const p0=closes[n-1-look];
  const p1=closes[n-1];
  const slopeRatioPerDay=(p1-p0)/p0/look; // ratio/day

  const midLast=ma3[n-1];
  const sdApprox=(upper[n-1]-midLast)/2 || 1e-9;
  const z=(closes[n-1]-midLast)/sdApprox;

  const c15=m15.rows.map(r=>Number(r.close));
  const latest15=c15.at(-1);
  const rows=buildMonitorRows(c15);
  renderMonitor(rows);

  let risk=riskFromSlopeZ(slopeRatioPerDay, z);
  if(monitorForcesHighRisk(rows)) risk=Math.max(risk,4.2);

  const state=classifyState(risk);
  setBadge(state);
  setRiskUI(risk);

  const forecast = closes[n-1]*(1+slopeRatioPerDay);

  $("refTime").textContent = daily.ref_th ?? "--";
  $("latest15").textContent = fmt(latest15,2);
  $("forecast1d").textContent = fmt(forecast,2);
  $("slope").textContent = fmt(slopeRatioPerDay*100,2)+"%/day";
  $("zscore").textContent = fmt(z,2);
  $("zPill").textContent = "Z="+fmt(z,2);

  const [adv, txt] = adviceFromZSlope(z, slopeRatioPerDay);
  setAdviceBadge(adv);
  $("adviceText").textContent = txt;
}

let tickerIndex=[];
async function initTickers(){
  try{ const t=await loadJSON("tickers.json"); tickerIndex=(t?.tickers??[]).map(x=>({sym:x.symbol,name:x.name||""})); }
  catch(_){ }
}
initTickers();

function renderSuggestions(q){
  const box=$("suggestions");
  if(!q){ box.classList.add("hidden"); box.innerHTML=""; return; }
  const qq=q.toLowerCase().trim();
  const hits=tickerIndex.filter(x=>x.sym.toLowerCase().includes(qq)||x.name.toLowerCase().includes(qq)).slice(0,8);
  if(!hits.length){ box.classList.add("hidden"); box.innerHTML=""; return; }
  box.innerHTML="";
  for(const h of hits){
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML=`<span class="sym">${h.sym}</span><span class="name">${h.name}</span>`;
    div.addEventListener("click",()=>{ $("symbolInput").value=h.sym; box.classList.add("hidden"); loadSymbol(h.sym); });
    box.appendChild(div);
  }
  box.classList.remove("hidden");
}

$("symbolInput").addEventListener("input", e=>renderSuggestions(e.target.value));
$("symbolInput").addEventListener("keydown", e=>{ if(e.key==="Enter"){ $("suggestions").classList.add("hidden"); loadSymbol($("symbolInput").value); } });
document.addEventListener("click", e=>{ if(!e.target.closest(".searchBox")) $("suggestions").classList.add("hidden"); });
$("loadBtn").addEventListener("click", ()=>loadSymbol($("symbolInput").value));

loadSymbol("XAUUSD");
