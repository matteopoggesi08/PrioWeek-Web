(() => {
"use strict";

const BASE_CONFIG = window.PRIOWEEK_CONFIG || {};
const C = {...BASE_CONFIG, apiToken: localStorage.getItem("prioweek.production.apiToken") || BASE_CONFIG.apiToken || ""};
const RECORD_TYPE = "PWActivityMetadata";
const OWNED = ["plannedWeekStart","categoryID","categoryName","subcategoryID","subcategoryName","recurrenceID"];
const DAY_NAMES = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];

let container, db, user;
let activities = [];
let weekStart = monday(new Date());
let selectedActivity = null;
let syncTimer = null;
let syncing = false;
let lastSyncAt = null;
let visibilityHandlerBound = false;
let syncWatchdog = null;

const $ = id => document.getElementById(id);
function monday(d){ const x=new Date(d); x.setHours(0,0,0,0); const n=x.getDay(); x.setDate(x.getDate()-(n===0?6:n-1)); return x; }
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function isoDate(d){return new Date(d).toISOString().slice(0,10);}
function dateOnly(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function field(r,n){return r.fields?.[n]?.value ?? null;}
function recordName(r){return r.recordName || r.recordID?.recordName;}
function fmtDate(d){return new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"2-digit"}).format(d);}
function fmtLongDate(d){return new Intl.DateTimeFormat("it-IT",{weekday:"long",day:"numeric",month:"long"}).format(d);}
function fmtTime(ms){return ms?new Intl.DateTimeFormat("it-IT",{hour:"2-digit",minute:"2-digit"}).format(new Date(ms)):"";}
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.remove("hidden");clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add("hidden"),2600);}
function setStatus(s){$("syncStatus").textContent=s;$("cloudStatus").textContent=s;}
function configOK(){return !!(C.containerIdentifier && C.apiToken && !C.apiToken.includes("INSERISCI_"));}

function configure(){
 if(!configOK()) return false;
 CloudKit.configure({locale:"it-it",containers:[{
  containerIdentifier:C.containerIdentifier,
  apiTokenAuth:{apiToken:C.apiToken,persist:true,signInButton:{id:"apple-sign-in-button-large",theme:"black"}},
  environment:C.environment||"production"
 }]});
 container=CloudKit.getDefaultContainer();
 db=container.privateCloudDatabase;
 return true;
}

async function enterApp(identity){
 user=identity;
 $("bootError").classList.add("hidden");
 $("login").classList.add("hidden");
 $("app").classList.remove("hidden");
 $("userLabel").textContent=`Account Apple · ${identity?.userRecordName||"connesso"}`;
 setStatus("Connesso · sincronizzazione…");
 await loadAll();
 startAutoSync();
}

async function auth(){
 const identity=await container.setUpAuth();
 if(identity){
  await enterApp(identity);
  return;
 }

 setStatus("Accesso Apple richiesto");
 $("login").classList.remove("hidden");
 $("app").classList.add("hidden");
 $("bootError").classList.add("hidden");

 // CloudKit JS completes the Apple sign-in flow asynchronously.
 // setUpAuth() returns null on the initial page load, so we must listen
 // for the actual sign-in event instead of requiring a manual refresh.
 container.whenUserSignsIn().then(async identity => {
  try { await enterApp(identity); }
  catch (e) {
   console.error(e);
   $("login").classList.remove("hidden");
   $("bootError").classList.remove("hidden");
   $("bootError").textContent=e.reason||e.message||"Errore durante la sincronizzazione.";
  }
 }).catch(e => {
  console.error(e);
  $("bootError").classList.remove("hidden");
  $("bootError").textContent=e.reason||e.message||"Accesso Apple non riuscito.";
 });

 container.whenUserSignsOut().then(() => {
  user=null;
  activities=[];
  clearInterval(syncTimer);
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
  setStatus("Accedi con Apple");
 }).catch(()=>{});
}

async function loadAll(silent=false){
 if(syncing)return;
 if(!db){ setStatus("CloudKit non configurato"); return; }
 syncing=true;
 const started=Date.now();
 if(!silent)setStatus("Sincronizzazione…");
 try{
  const all=[]; let cursor=null;
  do{
   const opts={recordType:RECORD_TYPE,resultsLimit:200,desiredKeys:["taskID","title","date","isCompleted","priorityRaw","plannedWeekStart","categoryID","categoryName","subcategoryID","subcategoryName","recurrenceID","appleReminderID","rescheduleCount","completionCount","updatedAt","deviceName"]};
   if(cursor)opts.continuationMarker=cursor;
   const queryPromise=db.performQuery(opts);
   const timeoutPromise=new Promise((_,reject)=>setTimeout(()=>reject(new Error("CloudKit non ha risposto entro 15 secondi.")),15000));
   const res=await Promise.race([queryPromise,timeoutPromise]);
   (res.records||[]).forEach(r=>{if(recordName(r)?.startsWith("task-"))all.push(r);});
   cursor=res.continuationMarker||null;
  }while(cursor);
  activities=all;
  buildCategoryFilter();
  render();
  lastSyncAt=new Date();
  setStatus(`${activities.length} attività · aggiornato ${lastSyncAt.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}`);
 }catch(e){
  console.error(e);
  setStatus("Errore di sincronizzazione");
  if(!silent)toast("Errore: "+(e.reason||e.message||"CloudKit"));
 }finally{
  syncing=false;
  if(syncWatchdog){ clearTimeout(syncWatchdog); syncWatchdog=null; }
}
}

function startAutoSync(){
 clearInterval(syncTimer);
 // Keep the web planner aligned with CloudKit without requiring manual refresh.
 syncTimer=setInterval(()=>{if(document.visibilityState==="visible")loadAll(true);},30000);
 if(!visibilityHandlerBound){
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")loadAll(true);});
  window.addEventListener("focus",()=>loadAll(true));
  visibilityHandlerBound=true;
 }
}

function buildCategoryFilter(){
 const old=$("categoryFilter").value;
 const cats=[...new Set(activities.map(r=>field(r,"categoryName")).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"it"));
 $("categoryFilter").innerHTML='<option value="">Tutte le categorie</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
 $("categoryFilter").value=old;
}
function visibleActivities(){
 const q=$("search").value.trim().toLowerCase(),cat=$("categoryFilter").value;
 return activities.filter(r=>{
  const title=String(field(r,"title")||"").toLowerCase();
  return (!q||title.includes(q))&&(!cat||field(r,"categoryName")===cat);
 });
}
function plannedWeek(r){const p=field(r,"plannedWeekStart");return p?monday(new Date(p)):null;}
function operationalDate(r){const d=field(r,"date");return d?dateOnly(new Date(d)):null;}
function plannedDayIndex(r){
 const d=operationalDate(r);
 if(!d)return 0;
 const n=d.getDay();return n===0?6:n-1;
}
function isInWeek(r,week){const p=plannedWeek(r);return p&&isoDate(p)===isoDate(week);}

function render(){
 const days=Array.from({length:7},(_,i)=>addDays(weekStart,i));
 $("weekTitle").textContent=new Intl.DateTimeFormat("it-IT",{month:"long",year:"numeric"}).format(weekStart);
 $("weekRange").textContent=`${fmtDate(weekStart)} – ${fmtDate(addDays(weekStart,6))}`;
 const list=visibleActivities();
 $("planner").innerHTML="";
 if(activities.length===0){
  const empty=document.createElement("div"); empty.className="empty-state";
  empty.innerHTML=`<div class="empty-icon">P</div><h2>Nessuna attività ancora</h2><p>Le attività compariranno qui quando PrioWeek iPhone avrà sincronizzato i dati con lo stesso account Apple.</p><button id="emptySync">Sincronizza ora</button>`;
  $("planner").appendChild(empty);
  $("emptySync").onclick=()=>loadAll(false);
  return;
 }
 days.forEach((day,i)=>{
  const col=document.createElement("div");col.className="day";col.dataset.index=i;
  const dayItems=list.filter(r=>isInWeek(r,weekStart)&&plannedDayIndex(r)===i);
  col.innerHTML=`<div class="day-head"><div><strong>${DAY_NAMES[i]}</strong><span>${fmtDate(day)}</span></div><span class="day-count">${dayItems.filter(r=>!field(r,"isCompleted")).length}</span></div>`;
  dayItems.forEach(r=>col.appendChild(activityEl(r)));
  // Drag/drop is intentionally week-safe: the weekday comes from the Apple Reminder date.
  col.addEventListener("dragover",e=>{e.preventDefault();col.classList.add("over")});
  col.addEventListener("dragleave",()=>col.classList.remove("over"));
  col.addEventListener("drop",async e=>{
   e.preventDefault();col.classList.remove("over");
   const name=e.dataTransfer.getData("text/plain"),r=activities.find(x=>recordName(x)===name);
   if(!r)return;
   const currentDay=plannedDayIndex(r);
   if(currentDay!==i){toast("Il giorno deriva dalla scadenza di Apple Promemoria. Per ora PrioWeek Web sposta la settimana senza modificare la scadenza.");return;}
   await moveRecord(r,day);
  });
  $("planner").appendChild(col);
 });
 renderArchive();renderStats();
}

function activityEl(r){
 const t=$("activityTemplate").content.cloneNode(true),el=t.querySelector(".activity");
 const title=field(r,"title")||"(Senza titolo)",date=field(r,"date"),cat=field(r,"categoryName")||"";
 t.querySelector(".activity-title").textContent=title;
 t.querySelector(".meta").textContent=[fmtTime(date),cat,field(r,"priorityRaw")?`P${field(r,"priorityRaw")}`:""].filter(Boolean).join(" · ");
 if(field(r,"isCompleted"))el.classList.add("done");
 el.dataset.name=recordName(r);
 el.addEventListener("dragstart",e=>e.dataTransfer.setData("text/plain",recordName(r)));
 el.addEventListener("dblclick",()=>openEdit(r));
 el.querySelector(".edit").addEventListener("click",e=>{e.stopPropagation();openEdit(r)});
 return el;
}
async function moveRecord(r,day){
 const current=plannedWeek(r);if(current&&isoDate(current)===isoDate(day))return;
 await saveOwned(r,{plannedWeekStart:monday(day).getTime()});
}
function ownedPatch(r,patch){
 const copy={recordType:RECORD_TYPE,recordName:recordName(r),recordChangeTag:r.recordChangeTag,fields:{}};
 OWNED.forEach(k=>{const v=field(r,k);if(v!==null&&v!==undefined)copy.fields[k]={value:v};});
 Object.entries(patch).forEach(([k,v])=>{if(v!==null&&v!==undefined)copy.fields[k]={value:v};});
 return copy;
}
async function saveOwned(r,patch,retry=true){
 setStatus("Salvataggio…");
 try{
  const target=ownedPatch(r,patch),res=await db.saveRecords([target]),saved=res.records?.[0];
  if(!saved)throw new Error(res.errors?.[0]?.reason||"CloudKit non ha restituito il record.");
  Object.assign(r,saved);toast("Modifica salvata");render();setStatus("Modifica sincronizzata");
 }catch(e){
  if(retry&&(e.serverErrorCode==="CONFLICT"||e.ckErrorCode==="CONFLICT"||String(e.reason||e.message).includes("CONFLICT"))){
   const latest=(await db.fetchRecords([recordName(r)])).records?.[0];
   if(latest){Object.assign(r,latest);return saveOwned(r,patch,false);}
  }
  setStatus("Errore di sincronizzazione");toast("Errore: "+(e.reason||e.message||"CloudKit"));
 }
}
function openEdit(r){
 selectedActivity=r;
 $("modalTitle").textContent=field(r,"title")||"";
 const pd=plannedWeek(r);$("modalWeek").value=pd?isoDate(pd):"";
 $("modalCategory").value=field(r,"categoryName")||"";
 $("modalSubcategory").value=field(r,"subcategoryName")||"";
 $("modal").classList.remove("hidden");
}
function closeModal(){$("modal").classList.add("hidden");selectedActivity=null;}
async function saveEdit(){
 if(!selectedActivity)return;
 const d=$("modalWeek").value?new Date($("modalWeek").value+"T00:00:00"):null;
 const patch={plannedWeekStart:d?monday(d).getTime():null,categoryName:$("modalCategory").value.trim()||null,subcategoryName:$("modalSubcategory").value.trim()||null};
 await saveOwned(selectedActivity,patch);closeModal();
}
function renderArchive(){
 const q=($("archiveSearch")?.value||"").toLowerCase();
 const done=activities.filter(r=>field(r,"isCompleted")&&(!q||String(field(r,"title")||"").toLowerCase().includes(q)));
 $("archiveList").innerHTML=done.sort((a,b)=>(field(b,"date")||0)-(field(a,"date")||0)).map(r=>`<div class="archive-item"><div><strong>${esc(field(r,"title")||"")}</strong><span class="archive-meta">${esc(field(r,"categoryName")||"")}</span></div><span class="date">${field(r,"date")?fmtDate(new Date(field(r,"date"))):""}</span></div>`).join("")||'<p class="muted">Nessuna attività archiviata.</p>';
}
function renderStats(){
 const completed=activities.filter(r=>field(r,"isCompleted")),open=activities.filter(r=>!field(r,"isCompleted"));
 $("statCards").innerHTML=[["Attività",activities.length],["Completate",completed.length],["Aperte",open.length],["Tasso completamento",activities.length?Math.round(completed.length/activities.length*100)+"%":"0%"]].map(([a,b])=>`<div class="stat-card"><span class="muted">${a}</span><strong>${b}</strong></div>`).join("");
 const counts=Array(7).fill(0);completed.forEach(r=>{const d=operationalDate(r);if(d)counts[plannedDayIndex(r)]++});const max=Math.max(1,...counts);
 $("chart").innerHTML=counts.map((v,i)=>`<div class="bar-wrap"><div class="bar" style="height:${Math.max(3,v/max*180)}px"></div><span class="bar-label">${DAY_NAMES[i]} · ${v}</span></div>`).join("");
 const cats={};activities.forEach(r=>{const c=field(r,"categoryName")||"Senza categoria";cats[c]=(cats[c]||0)+1});const total=Math.max(1,activities.length);
 $("categoryStats").innerHTML=Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`<div class="cat-row"><span>${esc(c)}</span><div class="cat-line"><div class="cat-fill" style="width:${n/total*100}%"></div></div><span>${Math.round(n/total*100)}%</span></div>`).join("")||'<p class="muted">Nessun dato.</p>';
}

function wire(){
 $("prevWeek").onclick=()=>{weekStart=addDays(weekStart,-7);render()};
 $("nextWeek").onclick=()=>{weekStart=addDays(weekStart,7);render()};
 $("todayWeek").onclick=()=>{weekStart=monday(new Date());render()};
 $("search").oninput=render;$("categoryFilter").onchange=render;$("archiveSearch").oninput=render;
 $("refresh").onclick=()=>loadAll(false);$("manualSync").onclick=()=>loadAll(false);
 $("closeModal").onclick=closeModal;$("cancelEdit").onclick=closeModal;$("saveEdit").onclick=saveEdit;
 $("modal").addEventListener("click",e=>{if(e.target===$("modal"))closeModal()});
 document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
 document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));$("view-"+b.dataset.view).classList.remove("hidden")});
 $("signOut").onclick=async()=>{try{await container.signOut();location.reload()}catch(e){toast("Errore durante il logout")}};
}
async function boot(){
 try{
  if(!window.CloudKit){
   await new Promise((resolve,reject)=>{
    const done=()=>{window.removeEventListener("cloudkitloaded",done);resolve();};
    window.addEventListener("cloudkitloaded",done,{once:true});
    setTimeout(()=>{if(!window.CloudKit)reject(new Error("CloudKit JS non è stato caricato. Controlla la connessione Internet e il CDN Apple."));},8000);
   });
  }
  wire();
  if(!configure()){
   $("login").classList.remove("hidden");
   $("app").classList.add("hidden");
   $("bootError").classList.remove("hidden");
   $("bootError").textContent="Configura il Production API Token nel file config.js e ricarica la pagina.";
   return;
  }
  await auth();
 }catch(e){
  console.error(e);
  $("bootError").classList.remove("hidden");
  $("bootError").textContent=e.reason||e.message||String(e);
 }
}

document.addEventListener("DOMContentLoaded",()=>{ /* UI wiring is handled by boot(). */ });

boot();
})();
