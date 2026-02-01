/* LIMES MS — single-page dashboard
   Data contract (per symbol):
   - data/<slug>_daily.json: { rows: [{time: "YYYY-MM-DD", close: number}, ...], updated: "ISO" }
   - data/<slug>_15m.json:  { rows: [{time: "ISO", close: number}, ...], updated: "ISO" }
*/
let chart;

const $ = (id) => document.getElementById(id);

function slugify(sym){
  return sym.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}
function toNum(x){
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function fmt2(x){
  return (x==null) ? "—" : x.toFixed(2);
}
function fmtPct(x){
  return (x==null) ? "—" : (x*100).toFixed(2) + "%";
}
function nowTH(){
  try{
    const d = new Date();
    return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
  }catch{
    return new Date().toISOString();
  }
}

function showModal(title, msg){
  $("modalTitle").textContent = title;
  $("modalMsg").textContent = msg;
  $("modal").classList.remove("hidden");
}
function hideModal(){
  $("modal").classList.add("hidden");
}

async function loadTickers(){
  // tickers.json: { tickers: {KEY: yahooSymbol}, aliases: {alias: KEY} }
  const t = await (await fetch("tickers.json?"+Date.now())).json();

  // build datalist for autofill
  const dl = $("assetList");
  dl.innerHTML = "";
  Object.keys(t.tickers || {}).sort().forEach(key=>{
    const opt = document.createElement("option");
    opt.value = key;
    dl.appendChild(opt);
  });

  return t;
}

async function loadAssetsForSuggestions(){
  // assets.json: [{key,name,type,yahoo}, ...]
  try{
    const assets = await (await fetch("assets.json?"+Date.now())).json();
    if(!Array.isArray(assets)) return [];
    return assets;
  }catch{
    return [];
  }
}

function attachSuggestions(assets){
  const input = $("symbolInput");
  const box = $("suggestions");

  function render(items){
    if(!items.length){ box.style.display="none"; box.innerHTML=""; return; }
    box.style.display="block";
    box.innerHTML = "";
    items.forEach(a=>{
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `<div><b>${a.key}</b> <span class="tag">${a.name || ""}</span></div><div class="tag">${a.type || ""}</div>`;
      div.onclick = ()=>{
        input.value = a.key;
        box.style.display="none";
        $("loadBtn").click();
      };
      box.appendChild(div);
    });
  }

  input.addEventListener("input", ()=>{
    const q = input.value.trim().toLowerCase();
    if(!q){ render([]); return; }
    const items = assets
      .filter(a => (a.key||"").toLowerCase().includes(q) || (a.name||"").toLowerCase().includes(q))
      .slice(0, 8);
    render(items);
  });

  // hide on blur (small delay so click works)
  input.addEventListener("blur", ()=> setTimeout(()=>{ box.style.display="none"; }, 200));
  input.addEventListener("focus", ()=>{ if(input.value.trim()) input.dispatchEvent(new Event("input")); });
}

function computeBands(values, window=40){
  // rolling mean and std
  const mid = [];
  const up = [];
  const lo = [];
  for(let i=0;i<values.length;i++){
    const start = Math.max(0, i-window+1);
    const slice = values.slice(start, i+1).filter(v=>v!=null);
    const m = slice.reduce((a,b)=>a+b,0) / slice.length;
    const v = slice.reduce((a,b)=>a + (b-m)*(b-m), 0) / slice.length;
    const s = Math.sqrt(v);
    mid.push(m);
    up.push(m + 2*s);
    lo.push(m - 2*s);
  }
  return {mid, up, lo};
}

function ma(values, n=3){
  const out=[];
  for(let i=0;i<values.length;i++){
    const start = Math.max(0, i-n+1);
    const slice = values.slice(start, i+1).filter(v=>v!=null);
    out.push(slice.reduce((a,b)=>a+b,0)/slice.length);
  }
  return out;
}

function slopePerDay(values){
  // simple slope from last 10 points
  const v = values.filter(x=>x!=null);
  if(v.length < 12) return null;
  const n = 10;
  const y1 = v[v.length-n-1];
  const y2 = v[v.length-1];
  return (y2 - y1) / y1 / n; // approx per day
}

function zScore(value, mid, std){
  if(std<=0) return 0;
  return (value-mid)/std;
}

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function setBadge(el, state){
  el.classList.remove("buy","sell","wait","hold");
  el.classList.add(state);
  el.textContent = state.toUpperCase();
}

function buildChart(labels, price, phase, up, lo, forecastPt){
  const ctx = $("chart").getContext("2d");
  if(chart) chart.destroy();

  const datasets = [
    { label:"Price", data: price, borderWidth: 2, pointRadius: 2, tension: 0.25 },
    { label:"Phase / Mid (MA3)", data: phase, borderWidth: 2, borderDash: [0], pointRadius: 0, tension: 0.25 },
    { label:"Upper / Lower (+2σ)", data: up, borderWidth: 1, pointRadius: 0, tension: 0.25 },
    { label:"Lower / Upper (-2σ)", data: lo, borderWidth: 1, pointRadius: 0, tension: 0.25 },
  ];

  if(forecastPt){
    datasets.push({
      label:"Today (0)",
      data: forecastPt.series,
      borderWidth: 2,
      borderDash: [6,6],
      pointRadius: 3,
      tension: 0
    });
  }

  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "rgba(255,255,255,0.70)" } },
        tooltip: { enabled: true }
      },
      scales: {
        x: { ticks: { color: "rgba(255,255,255,0.55)" }, grid: { color: "rgba(255,255,255,0.06)" } },
        y: { ticks: { color: "rgba(255,255,255,0.55)" }, grid: { color: "rgba(255,255,255,0.06)" } },
      }
    }
  });
}

async function loadSymbol(symbolKey, tickers){
  const key = symbolKey.trim().toUpperCase();
  if(!key) return;

  // resolve alias → canonical key
  const ali = (tickers.aliases || {});
  const canonical = ali[key] || ali[key.toLowerCase()] || key;
  const slug = slugify(canonical);

  $("assetTitle").textContent = canonical;
  $("floatingSym").textContent = canonical;

  const dailyUrl = `data/${slug}_daily.json?` + Date.now();
  const m15Url  = `data/${slug}_15m.json?` + Date.now();

  let daily, m15;
  try{
    daily = await (await fetch(dailyUrl)).json();
    m15 = await (await fetch(m15Url)).json();
  }catch(e){
    showModal("โหลดข้อมูลไม่สำเร็จ", `ไม่พบไฟล์ข้อมูลสำหรับ ${canonical}\n\nตรวจสอบว่าใน repo มี data/${slug}_daily.json และ data/${slug}_15m.json`);
    return;
  }

  if(!daily?.rows?.length || !m15?.rows?.length || daily.rows.length < 40){
    showModal("ข้อมูลไม่พอ", `ข้อมูลไม่พอสำหรับ ${canonical} (JSON ยังว่าง/สั้นเกินไป)\n\nเช็คว่า GitHub Actions สร้างไฟล์ JSON แล้ว และ daily >= 40 จุด`);
    return;
  }

  // Build series
  const labels = daily.rows.map(r=>r.time);
  const price  = daily.rows.map(r=>toNum(r.close));
  const phase  = ma(price, 3);

  // window stats (last 40)
  const window = 40;
  const {mid, up, lo} = computeBands(price, window);

  // forecast: simple (phase slope)
  const sl = slopePerDay(price);
  const forecast1d = (price[price.length-1] != null && sl != null) ? price[price.length-1] * (1 + sl) : null;

  const forecastSeries = price.slice();
  forecastSeries.push(forecast1d);
  const labels2 = labels.slice();
  labels2.push("T+1");

  // compute z at last close using last window std
  const tail = price.slice(-window).filter(v=>v!=null);
  const m = tail.reduce((a,b)=>a+b,0)/tail.length;
  const v = tail.reduce((a,b)=>a + (b-m)*(b-m),0)/tail.length;
  const s = Math.sqrt(v);
  const z = (price[price.length-1]!=null && s>0) ? (price[price.length-1]-m)/s : 0;

  // decision (simple)
  let advice="hold";
  let state="wait";
  if(z < -0.8) { advice="buy"; state="buy"; }
  else if(z > 1.2) { advice="sell"; state="sell"; }
  else { advice="hold"; state="wait"; }

  // risk score (0..5) based on |z| and band width
  const band = (up[up.length-1]-lo[lo.length-1]) / (mid[mid.length-1]||1);
  const risk = Math.min(5, Math.max(0, (Math.abs(z)*1.6 + band*6)));
  const risk01 = clamp01(risk/5);

  // UI update
  $("tsText").textContent = `${nowTH()} (UTC+7)`;
  $("day0").textContent = labels[labels.length-window] || "—";
  $("latest15").textContent = fmt2(toNum(m15.rows[m15.rows.length-1]?.close));
  $("forecast1d").textContent = fmt2(forecast1d);
  $("slope").textContent = (sl==null) ? "—" : ((sl*100).toFixed(2) + "%/day");
  $("riskScore").textContent = risk.toFixed(2);
  $("riskFill").style.width = (risk01*100).toFixed(0) + "%";
  $("zChip").textContent = "z=" + (z==null ? "—" : z.toFixed(2));

  setBadge($("stateBadge"), state);
  setBadge($("floatingBadge"), state);

  $("floatingRisk").textContent = risk.toFixed(2) + "/5";
  $("floatingTime").textContent = nowTH();

  // Advice block
  setBadge($("adviceBadge"), advice);
  $("adviceText").textContent =
    (advice==="buy") ? "Oversold zone. Consider scaling in with controlled size."
    : (advice==="sell") ? "Overbought zone. Consider taking profit or tightening stops."
    : "Mixed signals. Maintain position sizing and wait for a clearer trend confirmation.";

  // monitor table (simple delta from last 15m points)
  const windows = [15,30,60,90,120];
  const rows=[];
  const closes15 = m15.rows.map(r=>toNum(r.close)).filter(v=>v!=null);
  for(const w of windows){
    if(closes15.length < w+1){ rows.push({w, dp:null, ok:null}); continue; }
    const a = closes15[closes15.length-1-w];
    const b = closes15[closes15.length-1];
    const dp = (b-a)/a;
    // flag: inside +/-2% for shorter, +/-3% for longer
    const lim = (w<=30)?0.02:(w<=60)?0.025:0.03;
    const ok = Math.abs(dp) <= lim;
    rows.push({w, dp, ok});
  }
  const tbody = $("monitorRows");
  tbody.innerHTML="";
  rows.forEach(r=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${r.w}m</td><td>${r.dp==null?"—":(r.dp*100).toFixed(2)+"%"}</td><td class="${r.ok===true?'flagOk':r.ok===false?'flagOut':''}">${r.ok==null?"—":(r.ok?"OK":"OUT")}</td>`;
    tbody.appendChild(tr);
  });

  // draw chart
  buildChart(labels2, forecastSeries, ma(forecastSeries,3), [...up, null], [...lo, null], {series:[...Array(price.length-1).fill(null), price[price.length-1], forecast1d]});
}

async function init(){
  $("modalOk").onclick = hideModal;

  const tickers = await loadTickers();
  const assets = await loadAssetsForSuggestions();
  attachSuggestions(assets);

  const input = $("symbolInput");
  input.value = "JEPQ";

  $("loadBtn").onclick = ()=>{
    loadSymbol(input.value, tickers);
  };

  // Enter key
  input.addEventListener("keydown", (e)=>{
    if(e.key==="Enter"){ $("loadBtn").click(); }
  });

  // initial
  loadSymbol(input.value, tickers);
}
init();
