const $ = (id) => document.getElementById(id);

const DEFAULT_ASSET = "XAUUSD";
let ASSETS = {};
let chart;

function buildDataUrl(sym, interval){
  return `data/${sym.toLowerCase()}_${interval}.json`;
}

function showToast(msg){
  const t = $("toast");
  t.hidden = false;
  t.textContent = msg;
  setTimeout(()=>{ t.hidden = true; }, 6000);
}

function toDataset(raw){
  // Accept both {points:[{ts,close}]} and legacy {points:[{t,c}]}
  const pts = (raw?.points || []).map(p => ({
    ts: p.ts ?? p.t,
    close: p.close ?? p.c
  })).filter(p => Number.isFinite(p.ts) && Number.isFinite(p.close));

  return pts.map(p => ({ x: new Date(p.ts), y: p.close }));
}

function sma(arr, n){
  const out = [];
  let sum = 0;
  for(let i=0;i<arr.length;i++){
    sum += arr[i];
    if(i>=n) sum -= arr[i-n];
    out.push(i>=n-1 ? sum/n : null);
  }
  return out;
}

function std(arr, n){
  const out = [];
  for(let i=0;i<arr.length;i++){
    if(i<n-1){ out.push(null); continue; }
    const slice = arr.slice(i-n+1,i+1);
    const m = slice.reduce((a,b)=>a+b,0)/n;
    const v = slice.reduce((a,b)=>a+(b-m)*(b-m),0)/n;
    out.push(Math.sqrt(v));
  }
  return out;
}

function riskFromZ(z){
  const az = Math.min(3, Math.abs(z));
  // 0..1 scale
  return az/3;
}

function adviceFromRisk(r){
  if(r < 0.25) return "BUY";
  if(r < 0.50) return "WATCH";
  if(r < 0.75) return "HOLD";
  return "SELL";
}

function colorForRisk(r){
  if(r < 0.50) return getComputedStyle(document.documentElement).getPropertyValue('--good');
  if(r < 0.75) return getComputedStyle(document.documentElement).getPropertyValue('--warn');
  return getComputedStyle(document.documentElement).getPropertyValue('--bad');
}

async function loadJson(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
  return await res.json();
}

async function loadAsset(sym){
  $("assetBadge").textContent = sym.toUpperCase();
  $("assetTitle").textContent = sym.toUpperCase();
  $("assetInput").value = sym.toUpperCase();

  const dailyUrl = buildDataUrl(sym, "daily");
  const h2Url    = buildDataUrl(sym, "2h");
  const h1Url    = buildDataUrl(sym, "1h");

  let daily, h2, h1;
  try{
    [daily, h2, h1] = await Promise.all([loadJson(dailyUrl), loadJson(h2Url), loadJson(h1Url)]);
  }catch(e){
    showToast(`ข้อมูลไม่พอ\nไฟล์ที่คาดว่าอยู่:\n- ${dailyUrl}\n- ${h2Url}\n- ${h1Url}\n\nรายละเอียด: ${e.message}`);
    return;
  }

  const d = toDataset(daily);
  const s2 = toDataset(h2);
  const s1 = toDataset(h1);

  if(d.length < 20){
    showToast(`ข้อมูล daily น้อยเกินไป (${d.length}) — รอ GitHub Actions อัปเดต data/ อีกครั้ง`);
    return;
  }

  // main series = daily close
  const closes = d.map(p => p.y);
  const mid = sma(closes, 3);
  const sig = std(closes, 20);
  const upper = closes.map((v,i)=> (mid[i]!=null && sig[i]!=null) ? mid[i] + 2*sig[i] : null);
  const lower = closes.map((v,i)=> (mid[i]!=null && sig[i]!=null) ? mid[i] - 2*sig[i] : null);

  const labels = d.map(p=>p.x);

  const z = (()=>{
    const i = closes.length-1;
    if(mid[i]==null || sig[i]==null || sig[i]===0) return 0;
    return (closes[i]-mid[i]) / sig[i];
  })();

  const risk = riskFromZ(z);
  const adv = adviceFromRisk(risk);

  $("zBadge").textContent = `z=${z.toFixed(2)}`;
  $("risk").textContent = risk.toFixed(2);
  $("adviceBadge").textContent = `${adv} · score ${risk.toFixed(2)}`;
  $("adviceBadge").style.borderColor = colorForRisk(risk);
  $("riskFill").style.width = `${Math.round(risk*100)}%`;
  $("riskFill").style.background = colorForRisk(risk);

  // day0 ref at 04:00 TH is provided by backend as daily_ref_th in meta when available
  $("day0").textContent = (daily?.meta?.day0_ref_th ?? "04:00 TH");
  $("latest").textContent = (daily?.meta?.latest_close ?? "—");
  $("fc1d").textContent = (daily?.meta?.forecast_1d ?? "—");
  $("slope").textContent = (daily?.meta?.slope ?? "—");

  $("timePill").textContent = `${new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})} (TH)`;
  $("sourceLine").textContent = `Source: ${daily?.meta?.source ?? "—"} · Data update: ${daily?.meta?.updated_utc ?? "—"}`;

  if(!chart){
    const ctx = $("chart").getContext("2d");
    chart = new Chart(ctx, {
      type:"line",
      data:{
        labels,
        datasets:[
          { label:"Price", data:closes, borderWidth:2, pointRadius:0, tension:.25 },
          { label:"Phase / Mid (MA3)", data:mid, borderWidth:2, pointRadius:0, tension:.25 },
          { label:"Upper / Lower (+2σ)", data:upper, borderWidth:1, pointRadius:0, tension:.25 },
          { label:"Lower (-2σ)", data:lower, borderWidth:1, pointRadius:0, tension:.25 },
        ]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        interaction:{ mode:"index", intersect:false },
        plugins:{
          legend:{ labels:{ color:"#cbd6f0" } },
          tooltip:{ enabled:true }
        },
        scales:{
          x:{ ticks:{ color:"#94a7cc" }, grid:{ color:"rgba(255,255,255,.06)" } },
          y:{ ticks:{ color:"#94a7cc" }, grid:{ color:"rgba(255,255,255,.06)" } }
        }
      }
    });
  }else{
    chart.data.labels = labels;
    chart.data.datasets[0].data = closes;
    chart.data.datasets[1].data = mid;
    chart.data.datasets[2].data = upper;
    chart.data.datasets[3].data = lower;
    chart.update();
  }
}

async function loadAssets(){
  try{
    const res = await fetch("assets.json",{cache:"no-store"});
    ASSETS = await res.json();
  }catch(e){
    ASSETS = { XAUUSD:{display:"Gold Spot"} };
  }
  const dl = $("assetList");
  dl.innerHTML = "";
  Object.keys(ASSETS).sort().forEach(sym=>{
    const opt = document.createElement("option");
    opt.value = sym;
    opt.label = `${sym} — ${ASSETS[sym].display || ""}`.trim();
    dl.appendChild(opt);
  });
}

async function init(){
  await loadAssets();
  const input = $("assetInput");
  input.value = DEFAULT_ASSET;

  $("reloadBtn").addEventListener("click", ()=> loadAsset(input.value.trim() || DEFAULT_ASSET));
  input.addEventListener("change", ()=> loadAsset(input.value.trim() || DEFAULT_ASSET));
  input.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ loadAsset(input.value.trim() || DEFAULT_ASSET); } });

  await loadAsset(DEFAULT_ASSET);
}

init();
