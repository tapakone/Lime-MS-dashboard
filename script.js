/* LIMES MS — frontend logic (no build tools) */
const TZ_TH = "Asia/Bangkok";

const $ = (id) => document.getElementById(id);

const state = {
  assets: null,
  symbol: "XAUUSD",
  chart: null,
  last: null,
  refreshMinutes: 5,
};

function nowTH() {
  const dt = luxon.DateTime.now().setZone(TZ_TH);
  return dt;
}

function fmtNum(x, d=2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return Number(x).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}

function setBadge(el, label) {
  el.classList.remove("buy","sell","hold","watch");
  el.textContent = label;
  if (!label) return;
  const k = label.toLowerCase();
  if (k.includes("buy")) el.classList.add("buy");
  else if (k.includes("sell")) el.classList.add("sell");
  else if (k.includes("hold")) el.classList.add("hold");
  else if (k.includes("watch") || k.includes("wait")) el.classList.add("watch");
}

function openModal(title, body) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = body;
  $("modal").classList.add("show");
  $("modal").setAttribute("aria-hidden","false");
}
function closeModal() {
  $("modal").classList.remove("show");
  $("modal").setAttribute("aria-hidden","true");
}

function safeLen(arr){ return Array.isArray(arr) ? arr.length : 0; }

async function loadAssets() {
  const res = await fetch("assets.json", { cache: "no-store" });
  if (!res.ok) throw new Error("assets.json not found");
  state.assets = await res.json();

  const dl = $("assetList");
  dl.innerHTML = "";
  Object.keys(state.assets).sort().forEach(sym => {
    const opt = document.createElement("option");
    opt.value = sym;
    opt.label = `${sym} — ${state.assets[sym].display}`;
    dl.appendChild(opt);
  });
}

function getAsset(sym) {
  const up = (sym||"").trim().toUpperCase();
  return state.assets?.[up] ? { sym: up, ...state.assets[up] } : null;
}

function buildDataUrl(sym, interval, kind) {
  // Files written by backend fetchers
  const safeSym = sym.toLowerCase().replace(/[^a-z0-9\-]/g,"_");
  return `data/${safeSym}_${interval}.json`;
}

function computeBands(close, w=40){
  // returns arrays mid(ma3), upper, lower, zScoreLatest, sigmaLatest
  const n = close.length;
  const ma3 = new Array(n).fill(null);
  for(let i=0;i<n;i++){
    if(i<2) continue;
    ma3[i] = (close[i] + close[i-1] + close[i-2]) / 3.0;
  }
  const mid = new Array(n).fill(null);
  const upper = new Array(n).fill(null);
  const lower = new Array(n).fill(null);
  const z = new Array(n).fill(null);
  const sigma = new Array(n).fill(null);

  for(let i=0;i<n;i++){
    const start = Math.max(0, i-w+1);
    const slice = close.slice(start, i+1).filter(v => v!=null && !Number.isNaN(v));
    if(slice.length < Math.min(20, w)) continue;
    const m = slice.reduce((a,b)=>a+b,0)/slice.length;
    const v = slice.reduce((a,b)=>a+(b-m)*(b-m),0)/slice.length;
    const s = Math.sqrt(v);
    mid[i]=m;
    sigma[i]=s;
    upper[i]=m + 2*s;
    lower[i]=m - 2*s;
    z[i]= (s>0) ? (close[i]-m)/s : 0;
  }
  return { ma3, mid, upper, lower, z, sigma };
}

function decideAdvice(zLatest, slopePerDay){
  // Simple rule-based advice
  // z < -1.2 => BUY, -1.2..-0.4 => WATCH/WAIT, -0.4..0.8 => HOLD, >0.8 => SELL
  if (zLatest === null || zLatest === undefined || Number.isNaN(zLatest)) {
    return { label: "WAIT", text: "Insufficient data. Waiting for the next update." };
  }
  if (zLatest <= -1.2) return { label:"BUY", text:"Oversold vs band. Consider staged entries." };
  if (zLatest <= -0.4) return { label:"WATCH", text:"Leaning oversold. Monitor confirmation on 1h/2h." };
  if (zLatest <= 0.8) return { label:"HOLD", text:"Mixed/neutral zone. Maintain sizing and wait." };
  return { label:"SELL", text:"Overbought vs band. Consider trimming / protect gains." };
}

function riskScoreFromZ(zLatest){
  // Map |z| to 0..5 (soft)
  const a = Math.min(3.0, Math.abs(zLatest ?? 0));
  const score = (a/3.0)*5.0;
  return Math.round(score*100)/100;
}

function riskColorClass(score){
  // score 0-5
  if (score >= 4.2) return "flash";
  return "";
}
function riskLabel(score){
  if (score >= 4.2) return "RED (FLASH)";
  if (score >= 3.0) return "RED";
  if (score >= 1.6) return "YELLOW";
  return "GREEN";
}

function setRiskBar(score){
  const pct = Math.max(0, Math.min(100, (score/5)*100));
  const fill = $("riskFill");
  fill.style.width = `${pct}%`;
  fill.classList.remove("flash");
  if (score >= 4.2) fill.classList.add("flash");
}

function buildMonitorRow(label, pct, flag){
  const wrap = document.createDocumentFragment();
  const k = document.createElement("div"); k.className="m-k"; k.textContent=label;
  const v = document.createElement("div"); v.className="m-v"; v.textContent = (pct==null?"—":`${pct>0?"+":""}${pct.toFixed(2)}%`);
  const f = document.createElement("div"); f.className="m-f";
  f.textContent = flag || "—";
  f.classList.add(flag==="OK"?"flag-ok":flag==="WARN"?"flag-warn":flag==="BAD"?"flag-bad":"");
  wrap.appendChild(k); wrap.appendChild(v); wrap.appendChild(f);
  return wrap;
}

function calcPctChange(series){
  if(series.length < 2) return null;
  const a = series[series.length-2];
  const b = series[series.length-1];
  if(a==null||b==null||a===0) return null;
  return ((b-a)/a)*100;
}

function toDataset(points){
  return points.map(p => ({ x: p.ts, y: p.close }));
}

function ensureChart(){
  const ctx = $("chart").getContext("2d");
  if(state.chart) return;

  state.chart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        { label:"Price", data:[], borderColor:getComputedStyle(document.documentElement).getPropertyValue("--gold"), pointRadius:2, tension:0.25 },
        { label:"Phase / Mid (MA3)", data:[], borderColor:getComputedStyle(document.documentElement).getPropertyValue("--cyan"), pointRadius:0, tension:0.25 },
        { label:"Upper", data:[], borderColor:getComputedStyle(document.documentElement).getPropertyValue("--band"), pointRadius:0, tension:0.15, borderWidth:1 },
        { label:"Lower", data:[], borderColor:getComputedStyle(document.documentElement).getPropertyValue("--band"), pointRadius:0, tension:0.15, borderWidth:1 },
        { label:"Today", data:[], borderColor:getComputedStyle(document.documentElement).getPropertyValue("--today"), pointRadius:4, showLine:false },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display:false },
        tooltip: {
          mode: "index",
          intersect: false
        }
      },
      scales: {
        x: {
          type: "time",
          time: { tooltipFormat: "dd LLL yyyy HH:mm" },
          grid: { color: "rgba(255,255,255,.06)" },
          ticks: { color: "rgba(255,255,255,.55)" }
        },
        y: {
          grid: { color: "rgba(255,255,255,.06)" },
          ticks: { color: "rgba(255,255,255,.55)" }
        }
      }
    }
  });
}

function updateUI(sym, meta, points, calc){
  const asset = getAsset(sym);
  const dt = nowTH();
  $("pillClock").textContent = dt.toFormat("HH:mm") + " (TH)";
  $("floatTime").textContent = dt.toFormat("HH:mm");

  $("assetTitle").textContent = sym;
  $("floatAsset").textContent = sym;
  $("brandSub").textContent = `${asset?.display ?? ""} — ${sym}`;
  $("assetSubtitle").textContent = meta?.subtitle ?? "Forecast vs Actual (+1D)";
  $("metaLine").textContent = meta?.metaLine ?? "";
  $("sourceLine").textContent = `Source: ${meta?.source ?? "—"} · Data update: ${meta?.updated ?? "—"}`;

  // Logo
  const logo = asset?.logo || "assets/lemon.svg";
  $("assetLogo").src = logo;

  // Latest values
  const close = points.map(p => p.close);
  const last = points[points.length-1];
  const lastClose = last?.close ?? null;

  const zLatest = calc.z[calc.z.length-1];
  const score = riskScoreFromZ(zLatest);

  $("latest").textContent = fmtNum(lastClose, 2);
  $("refDay0").textContent = meta?.day0ref ?? "04:00 TH";
  $("forecast").textContent = fmtNum(meta?.forecast ?? null, 2);
  $("slope").textContent = meta?.slope ?? "—";
  $("riskScore").textContent = `${fmtNum(score, 2)}/5`;

  setRiskBar(score);

  const advice = decideAdvice(zLatest, meta?.slopePerDay ?? null);
  setBadge($("stateBadge"), advice.label);
  setBadge($("floatBadge"), advice.label);
  $("floatRisk").textContent = `Risk: ${fmtNum(score,2)}/5 (${riskLabel(score)})`;

  $("adviceMain").textContent = `${advice.label} · score ${fmtNum(score,2)}`;
  $("adviceSub").textContent = advice.text;
  $("zBox").textContent = `z=${fmtNum(zLatest,2)}`;

  // Monitor panel (1h, 2h, D) based on last N points if present
  const grid = $("monitorGrid");
  grid.innerHTML = "";
  // header row
  grid.appendChild(Object.assign(document.createElement("div"), { className:"m-h", textContent:"Window" }));
  grid.appendChild(Object.assign(document.createElement("div"), { className:"m-h", textContent:"Δ%" }));
  grid.appendChild(Object.assign(document.createElement("div"), { className:"m-h", textContent:"Flag" }));

  const win = meta?.windows || [];
  win.forEach(w => {
    const pct = w?.pct ?? null;
    const flag = w?.flag ?? "—";
    grid.appendChild(buildMonitorRow(w.label, pct, flag));
  });

  // Popup content
  state.last = { sym, score, advice, lastClose, zLatest, updated: meta?.updated ?? "—", source: meta?.source ?? "—" };
}

function setChart(points, calc){
  ensureChart();
  const dsPrice = toDataset(points);
  const dsMA3 = points.map((p,i)=> ({x:p.ts, y: calc.ma3[i]}));
  const dsUpper = points.map((p,i)=> ({x:p.ts, y: calc.upper[i]}));
  const dsLower = points.map((p,i)=> ({x:p.ts, y: calc.lower[i]}));
  // Today marker = last point
  const last = points[points.length-1];
  const dsToday = last ? [{x:last.ts, y:last.close}] : [];

  state.chart.data.datasets[0].data = dsPrice;
  state.chart.data.datasets[1].data = dsMA3;
  state.chart.data.datasets[2].data = dsUpper;
  state.chart.data.datasets[3].data = dsLower;
  state.chart.data.datasets[4].data = dsToday;
  state.chart.update();
}

async function loadAsset(sym){
  const asset = getAsset(sym);
  if (!asset) {
    openModal("ไม่รู้จักสินทรัพย์", `กรุณาใช้สัญลักษณ์ที่รองรับ เช่น XAUUSD, NVDA, JEPQ`);
    return;
  }
  state.symbol = asset.sym;
  $("assetInput").value = asset.sym;

  // decide interval file: gold uses 15m, others 30m (as per requirement)
  const interval = asset.kind === "gold" ? "15m" : "30m";
  const url = buildDataUrl(asset.sym, interval, asset.kind);

  let json;
  try{
    const res = await fetch(url, { cache:"no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  }catch(e){
    openModal("ข้อมูลไม่พอ", `ข้อมูลไม่พอสำหรับ ${asset.sym} (JSON ยังว่าง/สั้นเกินไป)<br><br>ไฟล์ที่คาดว่าอยู่: <code>${url}</code>`);
    return;
  }

  const points = (json?.points || []).map(p => ({
    ts: p.t, close: p.c
  })).filter(p => p.ts && (p.close!=null));
  if(points.length < 30){
    openModal("ข้อมูลไม่พอ", `ข้อมูลไม่พอสำหรับ ${asset.sym} (มี ${points.length} จุด)<br><br>รอ GitHub Actions รันอีกรอบ หรือเช็กว่า workflow ดึงข้อมูลสำเร็จ`);
    return;
  }

  const close = points.map(p => p.close);
  const calc = computeBands(close, 40);

  // Meta
  const meta = {
    source: json?.source || "—",
    updated: json?.updated_th || json?.updated || "—",
    subtitle: (asset.kind === "gold") ? "Gold Spot | 15m refresh" : "Market | 30m refresh",
    day0ref: "04:00 TH",
    // placeholder forecast: next = last + slope*1d (slope estimated from last 10 points)
  };

  // slope estimate per day: based on last 10 points vs time
  try{
    const n = points.length;
    const a = points[Math.max(0,n-11)];
    const b = points[n-1];
    const dtA = luxon.DateTime.fromISO(a.ts).toMillis();
    const dtB = luxon.DateTime.fromISO(b.ts).toMillis();
    const days = (dtB-dtA)/(1000*60*60*24);
    const slope = days>0 ? ((b.close-a.close)/a.close)*100/days : null;
    meta.slopePerDay = slope;
    meta.slope = (slope==null) ? "—" : `${slope>=0?"+":""}${slope.toFixed(2)}%/day`;
    meta.forecast = (slope==null) ? null : (b.close * (1 + (slope/100)));
  }catch(_){}

  // Monitor windows: use recent slice to approximate % changes
  const lastClose = close[close.length-1];
  // 1h and 2h approximated by data frequency
  const step = (asset.kind==="gold") ? 4 : 2; // 15m*4 = 1h ; 30m*2=1h
  const oneHSeries = close.slice(-step-1);
  const twoHSeries = close.slice(-(step*2)-1);
  const dSeries = close.slice(-48); // rough

  const pct1h = calcPctChange(oneHSeries);
  const pct2h = calcPctChange(twoHSeries);
  const pctD  = calcPctChange(dSeries);

  function flag(p){
    if(p==null) return "—";
    const ap = Math.abs(p);
    if(ap < 0.4) return "OK";
    if(ap < 1.0) return "WARN";
    return "BAD";
  }
  meta.windows = [
    { label:"1h", pct:pct1h, flag:flag(pct1h) },
    { label:"2h", pct:pct2h, flag:flag(pct2h) },
    { label:"D",  pct:pctD,  flag:flag(pctD) },
  ];
  $("pillWindows").textContent = "D + 2hr + 1hr";

  updateUI(asset.sym, meta, points, calc);
  setChart(points, calc);
}

function attachHandlers(){
  $("reloadBtn").addEventListener("click", ()=> loadAsset($("assetInput").value || state.symbol));
  $("assetInput").addEventListener("change", ()=> loadAsset($("assetInput").value || state.symbol));
  $("modalClose").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e)=> { if(e.target.id==="modal") closeModal(); });

  $("floatCard").addEventListener("click", ()=>{
    if(!state.last){
      openModal("ยังไม่มีข้อมูล", "กด Reload เพื่อโหลดข้อมูล");
      return;
    }
    const s = state.last;
    openModal(
      `${s.sym} — ${s.advice.label}`,
      `<b>Last:</b> ${fmtNum(s.lastClose,2)}<br>
       <b>Risk:</b> ${fmtNum(s.score,2)}/5<br>
       <b>z-score:</b> ${fmtNum(s.zLatest,2)}<br>
       <b>Source:</b> ${s.source}<br>
       <b>Updated:</b> ${s.updated}<br><br>
       <span style="color:rgba(255,255,255,.70)">*สัญญาณนี้เป็น indicator เพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน</span>`
    );
  });
}

async function init(){
  attachHandlers();
  await loadAssets();
  // default
  $("assetInput").value = "XAUUSD";
  await loadAsset("XAUUSD");

  // auto refresh view (reload JSON) — default 5 min, user can change
  let refreshTimer = setInterval(()=> loadAsset(state.symbol), state.refreshMinutes*60*1000);
  const refreshSel = $("refreshSelect");
  if (refreshSel) {
    refreshSel.value = String(state.refreshMinutes);
    refreshSel.addEventListener("change", ()=> {
      const m = Number(refreshSel.value);
      if (!Number.isFinite(m) || m<=0) return;
      state.refreshMinutes = m;
      clearInterval(refreshTimer);
      refreshTimer = setInterval(()=> loadAsset(state.symbol), state.refreshMinutes*60*1000);
      $("pillRefresh").textContent = `Refresh ${state.refreshMinutes}m`;
    });
  }
  $("pillRefresh").textContent = `Refresh ${state.refreshMinutes}m`;
  // clock tick
  setInterval(()=> {
    const dt = nowTH();
    $("pillClock").textContent = dt.toFormat("HH:mm") + " (TH)";
    $("floatTime").textContent = dt.toFormat("HH:mm");
  }, 1000);
}

init().catch(err=>{
  console.error(err);
  openModal("เกิดข้อผิดพลาด", String(err));
});
