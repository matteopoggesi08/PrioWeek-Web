(() => {
"use strict";

const BASE_CONFIG = window.PRIOWEEK_CONFIG || {};
const C = {...BASE_CONFIG, apiToken: localStorage.getItem("prioweek.production.apiToken") || BASE_CONFIG.apiToken || ""};
const RECORD_TYPE = "PWActivityMetadata";
const OWNED = ["plannedWeekStart","plannedDate","categoryID","categoryName","subcategoryID","subcategoryName","recurrenceID"];
const DAY_NAMES = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];

let container, db, user;
let activities = [];
let cloudCategories = [];
let cloudSubcategories = [];
let weekStart = monday(new Date());
let selectedActivity = null;
let modalMode = "create";
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
   const query={recordType:RECORD_TYPE};
   const options={resultsLimit:200,desiredKeys:["taskID","title","date","isCompleted","priorityRaw","plannedWeekStart","plannedDate","categoryID","categoryName","subcategoryID","subcategoryName","recurrenceID","appleReminderID","rescheduleCount","completionCount","updatedAt","deviceName"]};
   if(cursor)options.continuationMarker=cursor;
   // CloudKit JS API expects the query and pagination options as separate arguments.
   const queryPromise=db.performQuery(query,options);
   let timeoutID;
   const timeoutPromise=new Promise((_,reject)=>{timeoutID=setTimeout(()=>reject(new Error("Timeout: CloudKit non ha risposto entro 15 secondi.")),15000);});
   let res;
   try { res=await Promise.race([queryPromise,timeoutPromise]); }
   finally { clearTimeout(timeoutID); }
   (res.records||[]).forEach(r=>{if(recordName(r)?.startsWith("task-"))all.push(r);});
   cursor=res.continuationMarker||null;
  }while(cursor);
  activities=all;
  // Load the catalog records written by the iOS app. These live in the same
  // private CloudKit database but are separate from task metadata records.
  await loadCategoryCatalog();
  buildCategoryFilter();
  refreshCategorySuggestions();
  render();
  lastSyncAt=new Date();
  setStatus(`${activities.length} attività · aggiornato ${lastSyncAt.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}`);
 }catch(e){
  console.error("PrioWeek CloudKit query failed:",e);
  const detail=e.reason||e.message||e.ckErrorCode||"Errore CloudKit sconosciuto";
  setStatus("Errore CloudKit: "+detail);
  if(!silent)toast("Errore CloudKit: "+detail);
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

async function queryCatalog(recordType, keys){
 const all=[]; let cursor=null;
 do {
  const options={resultsLimit:200,desiredKeys:keys};
  if(cursor)options.continuationMarker=cursor;
  const res=await db.performQuery({recordType},options);
  (res.records||[]).forEach(r=>all.push(r));
  cursor=res.continuationMarker||null;
 } while(cursor);
 return all;
}
async function loadCategoryCatalog(){
 try {
  const [cats,subs]=await Promise.all([
   queryCatalog("PWCategoryMetadata",["categoryID","name","colorHex","updatedAt"]),
   queryCatalog("PWSubcategoryMetadata",["subcategoryID","name","categoryID","categoryName","updatedAt"])
  ]);
  cloudCategories=cats.map(r=>({id:field(r,"categoryID"),name:field(r,"name")})).filter(x=>x.name);
  cloudSubcategories=subs.map(r=>({id:field(r,"subcategoryID"),name:field(r,"name"),categoryID:field(r,"categoryID"),categoryName:field(r,"categoryName")})).filter(x=>x.name);
 } catch(e) {
  // Existing activity names remain available if catalog queries fail.
  console.warn("PrioWeek category catalog unavailable:",e);
 }
}
function buildCategoryFilter(){
 const old=$("categoryFilter").value;
 const cats=[...new Set([...cloudCategories.map(c=>c.name),...activities.map(r=>field(r,"categoryName"))].filter(Boolean))].sort((a,b)=>a.localeCompare(b,"it"));
 $("categoryFilter").innerHTML='<option value="">Tutte le categorie</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
 $("categoryFilter").value=old;
}
function refreshCategorySuggestions(){
 const cats=[...new Set([...cloudCategories.map(c=>c.name),...activities.map(r=>field(r,"categoryName"))].filter(Boolean))].sort((a,b)=>a.localeCompare(b,"it"));
 const subs=[...new Set([...cloudSubcategories.map(c=>c.name),...activities.map(r=>field(r,"subcategoryName"))].filter(Boolean))].sort((a,b)=>a.localeCompare(b,"it"));
 $("categoryOptions").innerHTML=cats.map(c=>`<option value="${esc(c)}"></option>`).join("");
 $("subcategoryOptions").innerHTML=subs.map(c=>`<option value="${esc(c)}"></option>`).join("");
}
function visibleActivities(){
 const q=$("search").value.trim().toLowerCase(),cat=$("categoryFilter").value;
 return activities.filter(r=>{
  const title=String(field(r,"title")||"").toLowerCase();
  return (!q||title.includes(q))&&(!cat||field(r,"categoryName")===cat);
 });
}
function operationalDate(r){
 const d=field(r,"date");
 return d ? dateOnly(new Date(d)) : null;
}
function plannedWeek(r){
 const p=field(r,"plannedWeekStart");
 if(p) return monday(new Date(p));
 // iOS TaskItem.plannedWeekStart is optional and new tasks start as nil.
 // Keep those tasks visible by falling back to their Apple Reminders due week.
 const dueDate=operationalDate(r);
 return dueDate ? monday(dueDate) : null;
}
function plannerDate(r){
 const planned=field(r,"plannedDate");
 if(planned) return dateOnly(new Date(planned));
 // Backward-compatible fallback for records created before drag-and-drop support.
 const due=operationalDate(r);
 if(!due) return monday(new Date());
 const week=plannedWeek(r);
 if(!week) return due;
 return addDays(week,((due.getDay()+6)%7));
}
function plannedDayIndex(r){
 const d=plannerDate(r);
 const n=d.getDay();return n===0?6:n-1;
}
function isInWeek(r,week){
 return isoDate(monday(plannerDate(r)))===isoDate(monday(week));
}
function dateAtDayPreservingTime(r,day){
 const due=field(r,"date");
 const target=new Date(day);
 if(due){const original=new Date(due);target.setHours(original.getHours(),original.getMinutes(),original.getSeconds(),0);}
 else target.setHours(9,0,0,0);
 return target.getTime();
}

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
  // Drag-and-drop changes PrioWeek's planned date, never the Apple Reminders due date.
  col.addEventListener("dragover",e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect="move";col.classList.add("over")});
  col.addEventListener("dragleave",e=>{if(!col.contains(e.relatedTarget))col.classList.remove("over")});
  col.addEventListener("drop",async e=>{
   e.preventDefault();col.classList.remove("over");
   const name=e.dataTransfer.getData("text/plain"),r=activities.find(x=>recordName(x)===name);
   if(!r)return;
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
 el.addEventListener("dragstart",e=>{e.dataTransfer.setData("text/plain",recordName(r));e.dataTransfer.effectAllowed="move";el.classList.add("dragging")});
 el.addEventListener("dragend",()=>{el.classList.remove("dragging");document.querySelectorAll(".day.over").forEach(d=>d.classList.remove("over"));});
 el.addEventListener("dblclick",()=>openEdit(r));
 el.querySelector(".edit").addEventListener("click",e=>{e.stopPropagation();openEdit(r)});
 return el;
}
async function moveRecord(r,day){
 const target=dateOnly(day),current=plannerDate(r);
 if(isoDate(current)===isoDate(target))return;
 const targetTimestamp=dateAtDayPreservingTime(r,target);
 await saveOwned(r,{plannedWeekStart:monday(target).getTime(),plannedDate:targetTimestamp});
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
function localDateValue(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;}
function openCreate(){
 modalMode="create";selectedActivity=null;
 $("modalHeading").textContent="Nuova attività";$("saveEdit").textContent="Crea attività";
 $("activityTitle").disabled=false;$("activityDate").disabled=false;$("activityTime").disabled=false;$("activityPriority").disabled=false;
 $("activityTitle").value="";$("activityDate").value=localDateValue(new Date());$("activityTime").value="09:00";$("activityPriority").value="0";
 $("modalCategory").value="";$("modalSubcategory").value="";$("formHint").textContent="L'attività verrà salvata nel database CloudKit di PrioWeek Web. Per creare anche un promemoria Apple visibile su iPhone servirà l'integrazione nell'app iOS.";
 $("modal").classList.remove("hidden");setTimeout(()=>$("activityTitle").focus(),30);
}
function openEdit(r){
 modalMode="edit";selectedActivity=r;
 $("modalHeading").textContent="Modifica attività";$("saveEdit").textContent="Salva modifiche";
 $("activityTitle").value=field(r,"title")||"";$("activityDate").value=localDateValue(plannerDate(r));
 const due=field(r,"date")?new Date(field(r,"date")):null;$("activityTime").value=due?`${String(due.getHours()).padStart(2,"0")}:${String(due.getMinutes()).padStart(2,"0")}`:"09:00";
 $("activityPriority").value=String(field(r,"priorityRaw")??0);$("modalCategory").value=field(r,"categoryName")||"";$("modalSubcategory").value=field(r,"subcategoryName")||"";
 // For records originating from Apple Reminders, avoid changing the reminder's title/date/priority from the web.
 const isWebCreated=field(r,"deviceName") === "PrioWeek Web";
 $("activityTitle").disabled=!isWebCreated;$("activityDate").disabled=false;$("activityTime").disabled=!isWebCreated;$("activityPriority").disabled=!isWebCreated;
 $("formHint").textContent=isWebCreated?"Puoi modificare tutti i campi di questa attività web.":"Puoi modificare pianificazione, categoria e sottocategoria. Titolo, orario operativo e priorità del promemoria Apple restano invariati.";
 $("modal").classList.remove("hidden");
}
function closeModal(){$("modal").classList.add("hidden");selectedActivity=null;}
async function saveEdit(event){
 if(event)event.preventDefault();
 const title=$("activityTitle").value.trim();if(!title){toast("Inserisci un titolo per l'attività.");return;}
 const dateValue=$("activityDate").value;if(!dateValue){toast("Scegli il giorno dell'attività.");return;}
 const [yy,mm,dd]=dateValue.split("-").map(Number),[hh,mi]=(($("activityTime").value||"09:00").split(":").map(Number));
 const chosen=new Date(yy,mm-1,dd,hh||0,mi||0,0,0), category=$("modalCategory").value.trim(), subcategory=$("modalSubcategory").value.trim();
 if(modalMode==="create"){
  await createActivity({title,date:chosen,priority:Number($("activityPriority").value)||0,category,subcategory});
 }else if(selectedActivity){
  const r=selectedActivity, patch={plannedWeekStart:monday(chosen).getTime(),plannedDate:chosen.getTime(),categoryName:category||null,subcategoryName:subcategory||null};
  if(field(r,"deviceName")==="PrioWeek Web")Object.assign(patch,{title,date:chosen.getTime(),priorityRaw:Number($("activityPriority").value)||0});
  await saveOwned(r,patch);
 }
 closeModal();
}
async function createActivity(data){
 setStatus("Creazione attività…");
 const uuid=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`);
 const planned=monday(data.date).getTime();
 const fields={taskID:{value:uuid},title:{value:data.title},date:{value:data.date.getTime()},isCompleted:{value:false},priorityRaw:{value:data.priority},plannedWeekStart:{value:planned},plannedDate:{value:data.date.getTime()},deviceName:{value:"PrioWeek Web"}};
 if(data.category){fields.categoryName={value:data.category};const existingCategory=cloudCategories.find(c=>c.name.toLocaleLowerCase("it")===data.category.toLocaleLowerCase("it"));if(existingCategory?.id)fields.categoryID={value:existingCategory.id};}
 if(data.subcategory){fields.subcategoryName={value:data.subcategory};const existingSubcategory=cloudSubcategories.find(c=>c.name.toLocaleLowerCase("it")===data.subcategory.toLocaleLowerCase("it")&&(!c.categoryName||c.categoryName.toLocaleLowerCase("it")===data.category.toLocaleLowerCase("it")));if(existingSubcategory?.id)fields.subcategoryID={value:existingSubcategory.id};}
 try{
  const res=await db.saveRecords([{recordType:RECORD_TYPE,recordName:`task-${uuid}`,fields}]);
  const saved=res.records?.find(x=>recordName(x)===`task-${uuid}`)||res.records?.[0];
  if(!saved){const err=res.errors?.[0];throw new Error(err?.reason||err?.message||"CloudKit non ha restituito il record creato.");}
  activities=[saved,...activities.filter(r=>recordName(r)!==recordName(saved))];buildCategoryFilter();refreshCategorySuggestions();
  const d=data.date;weekStart=monday(d);render();toast("Attività creata e salvata su CloudKit");setStatus("Attività sincronizzata");
 }catch(e){console.error("PrioWeek create activity failed",e);setStatus("Errore durante la creazione");toast("Impossibile creare l'attività: "+(e.reason||e.message||"errore CloudKit"));}
}
function renderArchive(){
 const q=($("archiveSearch")?.value||"").toLowerCase();
 const done=activities.filter(r=>field(r,"isCompleted")&&(!q||String(field(r,"title")||"").toLowerCase().includes(q)));
 $("archiveList").innerHTML=done.sort((a,b)=>(field(b,"date")||0)-(field(a,"date")||0)).map(r=>`<div class="archive-item"><div><strong>${esc(field(r,"title")||"")}</strong><span class="archive-meta">${esc(field(r,"categoryName")||"")}</span></div><span class="date">${field(r,"date")?fmtDate(new Date(field(r,"date"))):""}</span></div>`).join("")||'<p class="muted">Nessuna attività archiviata.</p>';
}
function renderStats(){
 const now=dateOnly(new Date());
 const completed=activities.filter(r=>!!field(r,"isCompleted"));
 const open=activities.filter(r=>!field(r,"isCompleted"));
 const overdue=open.filter(r=>{const d=operationalDate(r);return d&&d<now;});
 const high=open.filter(r=>Number(field(r,"priorityRaw")||0)>=3);
 const planned=activities.filter(r=>!!field(r,"plannedDate")||!!field(r,"plannedWeekStart"));
 const completionRate=activities.length?Math.round(completed.length/activities.length*100):0;
 const sevenDaysAgo=addDays(now,-6);
 const completedLast7=completed.filter(r=>{const d=operationalDate(r);return d&&d>=sevenDaysAgo&&d<=now;});
 const avgPerDay=Math.round((completedLast7.length/7)*10)/10;
 const cards=[["Attività totali",activities.length],["Completate",completed.length],["Da completare",open.length],["Tasso completamento",completionRate+"%"],["Scadute aperte",overdue.length],["Priorità alta/urgente",high.length],["Pianificate in PrioWeek",planned.length],["Media completate / 7 gg",avgPerDay]];
 $("statCards").innerHTML=cards.map(([a,b])=>`<div class="stat-card"><span class="muted">${a}</span><strong>${b}</strong></div>`).join("");
 const counts=Array(7).fill(0);
 completed.forEach(r=>{const d=operationalDate(r);if(d)counts[plannedDayIndex(r)]++});
 const max=Math.max(1,...counts);
 $("chart").innerHTML=counts.map((v,i)=>`<div class="bar-wrap"><div class="bar" style="height:${Math.max(3,v/max*180)}px"></div><span class="bar-label">${DAY_NAMES[i]} · ${v}</span></div>`).join("");
 const cats={};activities.forEach(r=>{const c=field(r,"categoryName")||"Senza categoria";if(!cats[c])cats[c]={total:0,done:0};cats[c].total++;if(field(r,"isCompleted"))cats[c].done++;});
 const total=Math.max(1,activities.length);
 $("categoryStats").innerHTML=Object.entries(cats).sort((a,b)=>b[1].total-a[1].total).map(([c,v])=>`<div class="cat-row"><span>${esc(c)} <small class="muted">${v.done}/${v.total} completate</small></span><div class="cat-line"><div class="cat-fill" style="width:${v.total/total*100}%"></div></div><span>${Math.round(v.total/total*100)}%</span></div>`).join("")||'<p class="muted">Nessun dato.</p>';
}

function wire(){
 $("prevWeek").onclick=()=>{weekStart=addDays(weekStart,-7);render()};
 $("nextWeek").onclick=()=>{weekStart=addDays(weekStart,7);render()};
 $("todayWeek").onclick=()=>{weekStart=monday(new Date());render()};
 $("search").oninput=render;$("categoryFilter").onchange=render;$("archiveSearch").oninput=render;
 $("refresh").onclick=()=>loadAll(false);$("manualSync").onclick=()=>loadAll(false);
 $("closeModal").onclick=closeModal;$("cancelEdit").onclick=closeModal;$("activityForm").addEventListener("submit",saveEdit);$("createActivity").onclick=openCreate;
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
