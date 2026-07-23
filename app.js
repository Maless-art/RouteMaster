
let state = RouteMasterStorage.load();
window.RouteMasterState = ()=>state;
let activeResource = null;
let editingId = null;
let currentPlan = null;
let plannerDirty = false;

const pageTitles = {today:"Rutas de hoy",planner:"Planificador",resources:"Recursos",history:"Historial",settings:"Configuración"};
const resourceMeta = {
  drivers:{title:"Conductores",subtitle:"Crea conductores, define restricciones y vehículo habitual."},
  assistants:{title:"Ayudantes",subtitle:"Administra los ayudantes disponibles para la rotación."},
  vehicles:{title:"Vehículos",subtitle:"Registra unidades, placas y conductor habitual."},
  routes:{title:"Rutas",subtitle:"Catálogo maestro con tipo, kilómetros y duración."}
};

document.addEventListener("DOMContentLoaded",()=>{
  setTimeout(()=>{qs("#splash").classList.add("hidden");qs("#app").classList.remove("hidden")},1500);
  qs("#planDate").value = dateISO(addDays(new Date(),1));
  setCurrentDate(); bindNavigation(); bindGlobalButtons(); bindCloudStatus(); loadPlanForDate(); renderAll(); startCloudSync();
});

function qs(s){return document.querySelector(s)} function qsa(s){return [...document.querySelectorAll(s)]}
function uid(){return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2)}
function addDays(date,n){const d=new Date(date);d.setDate(d.getDate()+n);return d}
function dateISO(d){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function todayISO(){return dateISO(new Date())}
function tomorrowISO(){return dateISO(addDays(new Date(),1))}
function money(v){return new Intl.NumberFormat("es-PA",{style:"currency",currency:"PAB"}).format(Number(v||0))}
function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function save(){RouteMasterStorage.save(state);window.RouteMasterCloud?.queuePush(state);renderAll()}
function toast(msg){const t=qs("#toast");t.textContent=msg;t.classList.remove("hidden");setTimeout(()=>t.classList.add("hidden"),2200)}
function setCurrentDate(){const f=new Intl.DateTimeFormat("es-PA",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date());qs("#currentDate").textContent=f[0].toUpperCase()+f.slice(1)}


function bindCloudStatus(){
  window.addEventListener("routemaster-cloud-status",event=>{
    const detail=event.detail||{};
    const el=qs("#cloudStatus"),text=qs("#cloudStatusText");
    if(!el||!text)return;
    el.className=`cloud-status cloud-${detail.state||"connecting"}`;
    text.textContent=detail.label||"Conectando";
    el.title=detail.message||"Estado de sincronización con Firebase";
  });
}

async function startCloudSync(){
  if(!window.RouteMasterCloud)return;
  await window.RouteMasterCloud.start(state,cloudState=>{
    if(!cloudState||typeof cloudState!=="object")return;
    state={...state,...cloudState};
    RouteMasterStorage.save(state);
    const plannerOpen=qs("#planner")?.classList.contains("active-view");
    if(!(plannerOpen&&plannerDirty)){
      currentPlan=null;
      loadPlanForDate();
    }
    renderAll();
    toast(plannerOpen&&plannerDirty?"Datos remotos recibidos; tu planificación sin guardar se mantuvo":"Datos actualizados desde Firebase");
  });
}

function bindNavigation(){
  qsa(".nav-item").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
  qs("#menuButton").addEventListener("click",()=>qs("#sidebar").classList.toggle("open"));
  qsa("[data-go]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.go)));
}
function showView(id){
  qsa(".view").forEach(v=>v.classList.remove("active-view"));qsa(".nav-item").forEach(v=>v.classList.remove("active"));
  qs("#"+id).classList.add("active-view");qs(`[data-view="${id}"]`)?.classList.add("active");qs("#pageTitle").textContent=pageTitles[id];qs("#sidebar").classList.remove("open");
  qs("#difficultyLegend")?.classList.toggle("hidden",id!=="planner");
  if(id==="planner") loadPlanForDate(); if(id==="history") renderHistory();
}

function bindGlobalButtons(){
  qs("#todaySearch").addEventListener("input",e=>renderToday(e.target.value.toLowerCase()));
  qsa(".resource-card").forEach(b=>b.addEventListener("click",()=>openResource(b.dataset.resource)));
  qs("#newResourceButton").addEventListener("click",()=>openResourceForm(activeResource));
  qs("#closeModalButton").addEventListener("click",closeModal);
  qs("#modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});
  qs("#addRouteButton").addEventListener("click",openRoutePicker);
  qs("#planDate").addEventListener("change",loadPlanForDate);
  qs("#optimizeButton").addEventListener("click",optimizeDistribution);
  qs("#shareTodayButton").addEventListener("click",()=>openShareDialog(getPlan(todayISO())));
  qs("#sharePlanButton").addEventListener("click",()=>openShareDialog(currentPlan));
  qs("#saveDraftButton").addEventListener("click",()=>savePlan("Borrador"));
  qs("#confirmPlanButton").addEventListener("click",()=>savePlan("Programada"));
  qs("#saveSettingsButton").addEventListener("click",saveSettings);
  qs("#exportButton").addEventListener("click",exportBackup);
  qs("#importInput").addEventListener("change",importBackup);
  qs("#resetButton").addEventListener("click",resetApp);
}

function renderAll(){renderCounts();renderToday();renderHistory();renderSettings();if(activeResource)renderResourceList();renderPlanner()}
function renderCounts(){
  qs("#driversCount").textContent=`${state.drivers.length} registrados`;qs("#assistantsCount").textContent=`${state.assistants.length} registrados`;
  qs("#vehiclesCount").textContent=`${state.vehicles.length} registrados`;qs("#routesCount").textContent=`${state.routeCatalog.length} registradas`;
}
function getPlan(date){return state.plans.find(p=>p.date===date)}
function renderToday(filter=""){
  const plan=getPlan(todayISO());const routes=(plan?.routes||[]).filter(r=>[r.routeName,r.driverName,r.assistantName,r.unit,r.plate].join(" ").toLowerCase().includes(filter));
  qs("#todayRoutesCount").textContent=plan?.routes.length||0;
  const c=qs("#todayRoutes");c.innerHTML="";qs("#todayEmpty").classList.toggle("visible",routes.length===0);
  routes.forEach(r=>{
    const el=document.createElement("article");el.className="route-card";el.style.setProperty("--route-color",routeColor(r.routeType));
    el.innerHTML=`<div class="route-content"><div class="route-top"><div><h3>${escapeHtml(r.routeName)}</h3><p class="route-meta">${escapeHtml(r.routeType)}</p></div></div>
    <div class="route-person"><div><small>Conductor</small><strong>${escapeHtml(r.driverName||"Sin asignar")}</strong></div><div><small>Ayudante</small><strong>${escapeHtml(r.assistantName||"Sin asignar")}</strong></div><div><small>Unidad</small><strong>${escapeHtml(r.unit||"—")} · ${escapeHtml(r.plate||"—")}</strong></div></div></div>`;
    c.appendChild(el)
  });
}

function routeColor(type=""){type=type.toLowerCase();return type.includes("larga")?"#b54a4a":type.includes("intermedia")?"#d5a82f":"#3a8b64"}
function difficulty(amount){
  const n=Number(amount||0);
  return n<state.settings.simpleMax?"Sencilla":n<=state.settings.mediumMax?"Normal":"Difícil";
}

function openResource(type){activeResource=type;qs("#resourcePanel").classList.remove("hidden");qs("#resourceTitle").textContent=resourceMeta[type].title;qs("#resourceSubtitle").textContent=resourceMeta[type].subtitle;renderResourceList()}
function getCollection(type){return type==="routes"?state.routeCatalog:state[type]}
function renderResourceList(){
  const list=qs("#resourceList"),items=getCollection(activeResource);list.innerHTML="";
  if(!items.length){list.innerHTML=`<div class="empty-state visible"><h3>No hay registros</h3><p>Presiona “Crear” para agregar el primero.</p></div>`;return}
  items.forEach(item=>{
    const el=document.createElement("div");el.className="data-row";el.innerHTML=`<div class="data-main"><strong>${escapeHtml(item.name||item.unit)}</strong><small>${resourceDescription(activeResource,item)}</small></div>
    <div class="row-actions"><button class="icon-action" data-edit="${item.id}">Editar</button><button class="icon-action" data-delete="${item.id}">Eliminar</button></div>`;list.appendChild(el)
  });
  qsa("[data-edit]").forEach(b=>b.addEventListener("click",()=>openResourceForm(activeResource,b.dataset.edit)));
  qsa("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteResource(activeResource,b.dataset.delete)));
}
function resourceDescription(type,i){
  if(type==="drivers")return `${i.active!==false?"Activo":"Inactivo"} · ${restrictionLabel(i.restriction)}${i.preferredVehicleId?" · vehículo habitual asignado":""}`;
  if(type==="assistants")return i.active!==false?"Activo":"Inactivo";
  if(type==="vehicles")return `${i.plate||"Sin placa"} · ${i.active!==false?"Disponible":"Fuera de servicio"}`;
  return `${i.type} · ${i.km} km · ${i.hours} h`;
}
function restrictionLabel(v){return {none:"Sin restricciones",short:"Priorizar cortas",shortMedium:"Cortas e intermedias",avoidLong:"Evitar largas",avoidHard:"Evitar difíciles",avoidLongHard:"Evitar largas y difíciles"}[v]||"Sin restricciones"}

function openResourceForm(type,id=null){
  editingId=id;const item=id?getCollection(type).find(x=>x.id===id):null;qs("#modalTitle").textContent=`${id?"Editar":"Crear"} ${resourceMeta[type].title.slice(0,-1)}`;
  let html='<div class="modal-body-inner"><form id="resourceForm"><div class="form-grid">';
  if(type==="drivers") html+=`
    ${fg("Nombre","name","text",item?.name,true)}
    ${selectFg("Estado","active",[{v:"true",t:"Activo"},{v:"false",t:"Inactivo"}],String(item?.active!==false))}
    ${selectFg("Perfil operativo","restriction",[{v:"none",t:"Sin restricciones"},{v:"short",t:"Priorizar rutas cortas"},{v:"shortMedium",t:"Priorizar cortas e intermedias"},{v:"avoidLong",t:"Evitar rutas largas"},{v:"avoidHard",t:"Evitar rutas difíciles"},{v:"avoidLongHard",t:"Evitar largas y difíciles"}],item?.restriction||"none")}
    ${selectFg("Vehículo habitual","preferredVehicleId",[{v:"",t:"Sin vehículo habitual"},...state.vehicles.map(v=>({v:v.id,t:`${v.unit} · ${v.plate}`}))],item?.preferredVehicleId||"")}
    ${textAreaFg("Observación operativa","notes",item?.notes||"")}`;
  if(type==="assistants") html+=`${fg("Nombre","name","text",item?.name,true)}${selectFg("Estado","active",[{v:"true",t:"Activo"},{v:"false",t:"Inactivo"}],String(item?.active!==false))}`;
  if(type==="vehicles") html+=`${fg("Unidad","unit","text",item?.unit,true)}${fg("Placa","plate","text",item?.plate,true)}${selectFg("Estado","active",[{v:"true",t:"Disponible"},{v:"false",t:"Fuera de servicio"}],String(item?.active!==false))}${textAreaFg("Observaciones","notes",item?.notes||"")}`;
  if(type==="routes") html+=`${fg("Nombre de la ruta","name","text",item?.name,true)}${selectFg("Tipo","type",[{v:"Corta",t:"Corta"},{v:"Intermedia",t:"Intermedia"},{v:"Larga",t:"Larga"}],item?.type||"Corta")}${fg("Kilómetros","km","number",item?.km,true)}${fg("Horas estimadas","hours","number",item?.hours,true,"0.5")}${textAreaFg("Observaciones","notes",item?.notes||"")}`;
  html+=`</div><div class="form-actions"><button type="button" class="secondary-button" id="cancelFormButton">Cancelar</button><button class="primary-button">Guardar</button></div></form></div>`;
  qs("#modalBody").innerHTML=html;openModal();qs("#cancelFormButton").onclick=closeModal;qs("#resourceForm").onsubmit=e=>saveResource(e,type,id)
}
function fg(label,name,type,value="",required=false,step=""){return `<div class="form-group"><label>${label}</label><input name="${name}" type="${type}" value="${escapeHtml(value??"")}" ${required?"required":""} ${step?`step="${step}"`:""}></div>`}
function selectFg(label,name,opts,value){return `<div class="form-group"><label>${label}</label><select name="${name}">${opts.map(o=>`<option value="${escapeHtml(o.v)}" ${String(o.v)===String(value)?"selected":""}>${escapeHtml(o.t)}</option>`).join("")}</select></div>`}
function textAreaFg(label,name,value){return `<div class="form-group full"><label>${label}</label><textarea name="${name}" rows="3">${escapeHtml(value)}</textarea></div>`}
function saveResource(e,type,id){e.preventDefault();const f=new FormData(e.target),obj=Object.fromEntries(f.entries());obj.active=obj.active!=="false";if(type==="routes"){obj.km=Number(obj.km);obj.hours=Number(obj.hours)}
  const col=getCollection(type);if(id){Object.assign(col.find(x=>x.id===id),obj)}else col.push({id:uid(),...obj});save();closeModal();toast("Registro guardado")}
function deleteResource(type,id){if(!confirm("¿Eliminar este registro?"))return;const col=getCollection(type),idx=col.findIndex(x=>x.id===id);if(idx>=0)col.splice(idx,1);save();toast("Registro eliminado")}

function loadPlanForDate(){
  const date=qs("#planDate").value||tomorrowISO();const existing=getPlan(date);currentPlan=existing?JSON.parse(JSON.stringify(existing)):{id:uid(),date,status:"Borrador",routes:[]};plannerDirty=false;renderPlanner()
}
function renderPlanner(){
  if(!currentPlan)return;
  const list=qs("#plannedRoutes");
  list.innerHTML="";
  const has=currentPlan.routes.length>0;
  qs("#plannerEmpty").classList.toggle("visible",!has);
  qs("#plannerActions").classList.toggle("hidden",!has);

  currentPlan.routes.forEach(r=>{
    const dot=difficultyDot(r.amount);
    const el=document.createElement("article");
    el.className="plan-card";
    el.style.setProperty("--route-color",routeColor(r.routeType));
    el.innerHTML=`<div class="plan-content">
      <div class="plan-top">
        <div class="plan-title-wrap">
          <div class="plan-title-line"><h3>${escapeHtml(r.routeName)}</h3><span class="difficulty-dot ${dot.className}" title="${dot.label}"></span></div>
          <p class="route-meta">${escapeHtml(r.routeType)} · ${escapeHtml(r.km)} km · ${escapeHtml(r.hours)} h</p>
        </div>
        <button class="icon-action" data-remove-plan="${r.id}">Eliminar</button>
      </div>

      <div class="amount-compact">
        <label for="amount-${r.id}">Monto estimado</label>
        <div class="amount-input-wrap"><span>B/.</span><input id="amount-${r.id}" data-amount="${r.id}" type="number" inputmode="decimal" min="0" step="0.01" value="${r.amount||""}" placeholder="0.00"></div>
      </div>

      <div class="assignment-grid">
        <div class="form-group"><label>Conductor</label><select data-driver="${r.id}">${personOptions(state.drivers,r.driverId,"Sin asignar")}</select></div>
        <div class="form-group"><label>Ayudante</label><select data-assistant="${r.id}">${personOptions(state.assistants,r.assistantId,"Sin asignar")}</select></div>
        <div class="form-group"><label>Vehículo</label><select data-vehicle="${r.id}">${vehicleOptions(r.vehicleId)}</select></div>
      </div>
    </div>`;
    list.appendChild(el);

    el.querySelector(`[data-driver="${r.id}"]`).value=r.driverId||"";
    el.querySelector(`[data-assistant="${r.id}"]`).value=r.assistantId||"";
    el.querySelector(`[data-vehicle="${r.id}"]`).value=r.vehicleId||"";
  });

  qsa("[data-remove-plan]").forEach(b=>b.onclick=()=>{
    currentPlan.routes=currentPlan.routes.filter(r=>r.id!==b.dataset.removePlan);
    plannerDirty=true;
    renderPlanner();
  });

  qsa("[data-amount]").forEach(input=>{
    input.oninput=e=>{
      const r=currentPlan.routes.find(x=>x.id===e.target.dataset.amount);
      if(!r)return;
      r.amount=e.target.value===""?0:Number(e.target.value);
      r.difficulty=difficulty(r.amount);
      plannerDirty=true;
      const dot=e.target.closest(".plan-card")?.querySelector(".difficulty-dot");
      if(dot){
        const info=difficultyDot(r.amount);
        dot.className=`difficulty-dot ${info.className}`;
        dot.title=info.label;
      }
    };
  });
  qsa("[data-driver]").forEach(s=>s.onchange=e=>manualAssign("driver",e.target.dataset.driver,e.target.value));
  qsa("[data-assistant]").forEach(s=>s.onchange=e=>manualAssign("assistant",e.target.dataset.assistant,e.target.value));
  qsa("[data-vehicle]").forEach(s=>s.onchange=e=>manualAssign("vehicle",e.target.dataset.vehicle,e.target.value));
}
function difficultyDot(amount){
  const n=Number(amount||0);
  if(n<=0)return {className:"dot-off",label:"Dificultad pendiente"};
  const level=difficulty(n);
  if(level==="Difícil")return {className:"dot-hard",label:"Ruta difícil"};
  if(level==="Normal")return {className:"dot-medium",label:"Dificultad normal"};
  return {className:"dot-simple",label:"Ruta sencilla"};
}
function personOptions(list,selected,empty){return `<option value="">${empty}</option>`+list.filter(x=>x.active!==false).map(x=>`<option value="${x.id}" ${x.id===selected?"selected":""}>${escapeHtml(x.name)}</option>`).join("")}
function vehicleOptions(selected){return `<option value="">Sin asignar</option>`+state.vehicles.filter(x=>x.active!==false).map(x=>`<option value="${x.id}" ${x.id===selected?"selected":""}>${escapeHtml(x.unit)} · ${escapeHtml(x.plate)}</option>`).join("")}
function manualAssign(kind,routeId,id){const r=currentPlan.routes.find(x=>x.id===routeId);if(kind==="driver"){const p=state.drivers.find(x=>x.id===id);if(p&&!driverAllowed(p,r,true))toast("Advertencia: esta asignación no coincide con su perfil operativo");r.driverId=id;r.driverName=p?.name||""}
  if(kind==="assistant"){const p=state.assistants.find(x=>x.id===id);r.assistantId=id;r.assistantName=p?.name||""}
  if(kind==="vehicle"){const v=state.vehicles.find(x=>x.id===id);r.vehicleId=id;r.unit=v?.unit||"";r.plate=v?.plate||""}plannerDirty=true;renderPlanner()}
function openRoutePicker(){
  if(!state.routeCatalog.length){toast("Primero crea rutas en Recursos");showView("resources");openResource("routes");return}
  qs("#modalTitle").textContent="Agregar rutas";qs("#modalBody").innerHTML=`<div class="modal-body-inner"><div class="checkbox-list">${state.routeCatalog.map(r=>`<div class="checkbox-item"><label><input type="checkbox" value="${r.id}" ${currentPlan.routes.some(x=>x.routeId===r.id)?"disabled":""}><span><strong>${escapeHtml(r.name)}</strong><br><small>${r.type} · ${r.km} km · ${r.hours} h</small></span></label></div>`).join("")}</div><div class="form-actions"><button id="cancelPicker" class="secondary-button">Cancelar</button><button id="addSelectedRoutes" class="primary-button">Agregar seleccionadas</button></div></div>`;
  openModal();qs("#cancelPicker").onclick=closeModal;qs("#addSelectedRoutes").onclick=()=>{qsa('#modalBody input[type="checkbox"]:checked').forEach(c=>{const rt=state.routeCatalog.find(r=>r.id===c.value);currentPlan.routes.push({id:uid(),routeId:rt.id,routeName:rt.name,routeType:rt.type,km:rt.km,hours:rt.hours,amount:0,difficulty:"Sencilla",status:"Pendiente",driverId:"",driverName:"",assistantId:"",assistantName:"",vehicleId:"",unit:"",plate:""})});plannerDirty=true;closeModal();renderPlanner()}
}

function optimizeDistribution(){
  try{
    if(!currentPlan?.routes?.length){toast("Agrega al menos una ruta");return false}

    const drivers=(state.drivers||[]).filter(x=>x&&x.active!==false);
    const assistants=(state.assistants||[]).filter(x=>x&&x.active!==false);
    const vehicles=(state.vehicles||[]).filter(x=>x&&x.active!==false);
    const routeCount=currentPlan.routes.length;

    if(drivers.length<routeCount){toast(`Faltan conductores disponibles: necesitas ${routeCount} y hay ${drivers.length}`);return false}
    if(assistants.length<routeCount){toast(`Faltan ayudantes disponibles: necesitas ${routeCount} y hay ${assistants.length}`);return false}
    if(vehicles.length<routeCount){toast(`Faltan vehículos disponibles: necesitas ${routeCount} y hay ${vehicles.length}`);return false}

    const history=(state.plans||[])
      .filter(p=>p&&p.date&&p.date<currentPlan.date&&p.status!=="Cancelada")
      .sort((a,b)=>String(b.date).localeCompare(String(a.date)));

    const driverLoad=Object.fromEntries(drivers.map(d=>[String(d.id),workload(d.id,"driver",history)]));
    const assistantLoad=Object.fromEntries(assistants.map(a=>[String(a.id),workload(a.id,"assistant",history)]));
    const lastDriverRoute=Object.fromEntries(drivers.map(d=>[String(d.id),lastAssignment(d.id,"driver",history)]));
    const lastAssistantRoute=Object.fromEntries(assistants.map(a=>[String(a.id),lastAssignment(a.id,"assistant",history)]));

    const ordered=[...currentPlan.routes].sort((a,b)=>routeWeight(b)-routeWeight(a));
    const usedDrivers=new Set(),usedAssistants=new Set(),usedVehicles=new Set();

    for(const r of ordered){
      r.difficulty=difficulty(r.amount);

      const availableDrivers=drivers.filter(d=>!usedDrivers.has(String(d.id)));
      const allowedDrivers=availableDrivers.filter(d=>driverAllowed(d,r,false));
      const pool=allowedDrivers.length?allowedDrivers:availableDrivers;
      const d=[...pool].sort((a,b)=>driverScore(a,r)-driverScore(b,r))[0]||availableDrivers[0];
      if(!d)throw new Error("No fue posible asignar un conductor");

      usedDrivers.add(String(d.id));
      r.driverId=String(d.id);
      r.driverName=d.name||"";

      const recent=recentPartners(d.id,history);
      const availableAssistants=assistants.filter(x=>!usedAssistants.has(String(x.id)));
      const a=[...availableAssistants]
        .sort((x,y)=>assistantScore(x,d,r,recent)-assistantScore(y,d,r,recent))[0]||availableAssistants[0];
      if(!a)throw new Error("No fue posible asignar un ayudante");

      usedAssistants.add(String(a.id));
      r.assistantId=String(a.id);
      r.assistantName=a.name||"";

      const preferred=vehicles.find(v=>String(v.id)===String(d.preferredVehicleId)&&!usedVehicles.has(String(v.id)));
      const v=preferred||vehicles.find(v=>!usedVehicles.has(String(v.id)));
      if(!v)throw new Error("No fue posible asignar un vehículo");

      usedVehicles.add(String(v.id));
      r.vehicleId=String(v.id);
      r.unit=v.unit||"";
      r.plate=v.plate||"";
    }

    function driverScore(driver,route){
      let score=driverLoad[String(driver.id)]||0;
      const last=lastDriverRoute[String(driver.id)];
      if(last){
        if(route.routeType==="Larga"&&last.routeType==="Larga")score+=1000;
        if(difficulty(route.amount)==="Difícil"&&last.difficulty==="Difícil")score+=300;
        if(last.date===addDaysISO(currentPlan.date,-1))score+=25;
      }
      if(!driverAllowed(driver,route,false))score+=5000;
      return score;
    }

    function assistantScore(assistant,driver,route,recentPartnersSet){
      let score=assistantLoad[String(assistant.id)]||0;
      if(recentPartnersSet.has(String(assistant.id)))score+=1000;
      const last=lastAssistantRoute[String(assistant.id)];
      if(last&&route.routeType==="Larga"&&last.routeType==="Larga")score+=300;
      return score;
    }

    // Validación final y respaldo secuencial: nunca deja un selector vacío si hay recursos suficientes.
    ordered.forEach((r,index)=>{
      const d=drivers.find(x=>String(x.id)===String(r.driverId))||drivers[index];
      const a=assistants.find(x=>String(x.id)===String(r.assistantId))||assistants[index];
      const v=vehicles.find(x=>String(x.id)===String(r.vehicleId))||vehicles[index];
      r.driverId=String(d.id);r.driverName=d.name||"";
      r.assistantId=String(a.id);r.assistantName=a.name||"";
      r.vehicleId=String(v.id);r.unit=v.unit||"";r.plate=v.plate||"";
    });

    currentPlan.routes=ordered;
    plannerDirty=true;
    persistCurrentPlan("Borrador",true);
    qs("#plannerNotice").textContent="Distribución generada automáticamente respetando restricciones, evitando rutas largas consecutivas y rotando ayudantes.";
    qs("#plannerNotice").classList.remove("hidden");
    renderPlanner();

    const incomplete=currentPlan.routes.some(r=>!r.driverId||!r.assistantId||!r.vehicleId);
    if(incomplete)throw new Error("La distribución quedó incompleta");
    toast("Distribución generada y guardada");
    return true;
  }catch(error){
    console.error("RouteMaster optimizeDistribution:",error);
    toast(`No se pudo generar: ${error.message||"error inesperado"}`);
    return false;
  }
}
function addDaysISO(iso,days){const d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+days);return dateISO(d)}
function lastAssignment(id,kind,history){
  for(const plan of (history||[])){
    const found=(plan.routes||[]).find(r=>(kind==="driver"?r.driverId:r.assistantId)===id);
    if(found)return {...found,date:plan.date};
  }
  return null;
}
function routeWeight(r){const base=r.routeType==="Larga"?3:r.routeType==="Intermedia"?2:1;const diff=difficulty(r.amount)==="Difícil"?2:difficulty(r.amount)==="Normal"?1:0;return base+diff}
function workload(id,kind,history){
  let s=0;
  (history||[]).slice(0,20).forEach(p=>(p.routes||[]).forEach(r=>{
    if(String(kind==="driver"?r.driverId:r.assistantId)===String(id))s+=routeWeight(r);
  }));
  return s;
}
function recentPartners(driverId,history){
  const set=new Set();
  (history||[]).slice(0,5).forEach(p=>(p.routes||[]).forEach(r=>{
    if(String(r.driverId)===String(driverId)&&r.assistantId)set.add(String(r.assistantId));
  }));
  return set;
}
function driverAllowed(d,r,manual){const diff=difficulty(r.amount),type=r.routeType,res=d.restriction||"none";if(res==="short"&&type!=="Corta")return false;if(res==="shortMedium"&&type==="Larga")return false;if(res==="avoidLong"&&type==="Larga")return false;if(res==="avoidHard"&&diff==="Difícil")return false;if(res==="avoidLongHard"&&(type==="Larga"||diff==="Difícil"))return false;return true}

function persistCurrentPlan(status="Borrador",immediate=false){
  currentPlan.status=status;
  currentPlan.routes.forEach(r=>r.difficulty=difficulty(r.amount));
  const copy=JSON.parse(JSON.stringify(currentPlan));
  const idx=state.plans.findIndex(p=>p.date===currentPlan.date);
  if(idx>=0)state.plans[idx]=copy;else state.plans.push(copy);
  RouteMasterStorage.save(state);
  window.RouteMasterCloud?.queuePush(state,immediate);
  plannerDirty=false;
}
function savePlan(status){
  if(currentPlan.routes.some(r=>!r.driverId||!r.assistantId||!r.vehicleId)){
    const generated=optimizeDistribution();
    if(!generated)return;
  }
  persistCurrentPlan(status,true);
  renderAll();
  toast(status==="Programada"?"Planificación confirmada":"Borrador guardado");
}
function editTodayAssignment(id){showView("planner");qs("#planDate").value=todayISO();loadPlanForDate();setTimeout(()=>document.querySelector(`[data-driver="${id}"]`)?.scrollIntoView({behavior:"smooth",block:"center"}),100)}

function renderHistory(){
  const list=qs("#historyList");list.innerHTML="";const plans=[...state.plans].sort((a,b)=>b.date.localeCompare(a.date));qs("#historyEmpty").classList.toggle("visible",!plans.length);
  plans.forEach(p=>{const el=document.createElement("article");el.className="history-card";el.innerHTML=`<div class="history-top"><div><h3>${formatDate(p.date)}</h3><p>${p.routes.length} rutas · ${escapeHtml(p.status)}</p></div><div class="row-actions"><button class="icon-action" data-open-history="${p.date}">Abrir</button><button class="icon-action" data-delete-plan="${p.date}">Eliminar</button></div></div><div class="history-routes">${p.routes.map(r=>`<span>${escapeHtml(r.routeName)} · ${escapeHtml(r.driverName||"Sin conductor")}</span>`).join("")}</div>`;list.appendChild(el)});
  qsa("[data-open-history]").forEach(b=>b.onclick=()=>{showView("planner");qs("#planDate").value=b.dataset.openHistory;loadPlanForDate()});
  qsa("[data-delete-plan]").forEach(b=>b.onclick=()=>{if(confirm("¿Eliminar esta planificación?")){state.plans=state.plans.filter(p=>p.date!==b.dataset.deletePlan);save()}})
}
function formatDate(s){return new Intl.DateTimeFormat("es-PA",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date(s+"T12:00:00"))}

function renderSettings(){qs("#simpleMax").value=state.settings.simpleMax;qs("#mediumMax").value=state.settings.mediumMax}
function saveSettings(){const a=Number(qs("#simpleMax").value),b=Number(qs("#mediumMax").value);if(a<0||b<=a){toast("Revisa los límites de dificultad");return}state.settings={simpleMax:a,mediumMax:b};save();toast("Reglas guardadas")}
function exportBackup(){const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`RouteMaster-respaldo-${todayISO()}.json`;a.click();URL.revokeObjectURL(a.href)}
function importBackup(e){const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(!data||!Array.isArray(data.plans))throw new Error();state=data;RouteMasterStorage.save(state);window.RouteMasterCloud?.queuePush(state,true);renderAll();toast("Respaldo importado y sincronizado")}catch{toast("El archivo no es un respaldo válido")}};reader.readAsText(file);e.target.value=""}
function resetApp(){if(!confirm("Esto eliminará todos los datos. ¿Continuar?"))return;state=RouteMasterStorage.reset();window.RouteMasterCloud?.queuePush(state,true);currentPlan=null;qs("#planDate").value=tomorrowISO();loadPlanForDate();renderAll();toast("Aplicación reiniciada")}
function openModal(){qs("#modal").classList.remove("hidden")}function closeModal(){qs("#modal").classList.add("hidden");qs("#modalBody").innerHTML=""}


function openShareDialog(plan){
  if(!plan || !Array.isArray(plan.routes) || !plan.routes.length){toast("No hay rutas para compartir");return}
  qs("#modalTitle").textContent="Compartir planificación";
  qs("#modalBody").innerHTML=`<div class="modal-body-inner">
    <label class="share-options"><input id="includeAmounts" type="checkbox"> Incluir montos de las rutas</label>
    <textarea id="sharePreview" class="share-preview" readonly></textarea>
    <div class="share-actions">
      <button id="cancelShareButton" class="secondary-button">Cerrar</button>
      <button id="copyShareButton" class="secondary-button">📋 Copiar</button>
      <button id="whatsappShareButton" class="success-button">💬 WhatsApp</button>
      <button id="nativeShareButton" class="primary-button">📤 Compartir</button>
    </div>
  </div>`;
  const preview=qs("#sharePreview");
  const refresh=()=>preview.value=buildShareText(plan,qs("#includeAmounts").checked);
  qs("#includeAmounts").addEventListener("change",refresh);refresh();openModal();
  qs("#cancelShareButton").onclick=closeModal;
  qs("#copyShareButton").onclick=async()=>{await copyText(preview.value);toast("Planificación copiada")};
  qs("#whatsappShareButton").onclick=()=>{
    const url=`https://wa.me/?text=${encodeURIComponent(preview.value)}`;
    window.open(url,"_blank","noopener,noreferrer");
  };
  qs("#nativeShareButton").onclick=async()=>{
    const text=preview.value;
    if(navigator.share){
      try{await navigator.share({title:`RouteMaster - ${formatDate(plan.date)}`,text})}catch(error){if(error?.name!=="AbortError")await copyText(text)}
    }else{
      await copyText(text);toast("Copiada. Ya puedes pegarla en WhatsApp")
    }
  };
}
function buildShareText(plan,includeAmounts=false){
  const lines=["🚚 *ROUTEMASTER*",`📅 ${formatDate(plan.date)}`,""];
  plan.routes.forEach((r,index)=>{
    lines.push(`📍 *${r.routeName||"Ruta"}*`);
    lines.push(`👤 ${r.driverName||"Sin conductor"}`);
    lines.push(`👥 ${r.assistantName||"Sin ayudante"}`);
    lines.push(`🚛 ${r.unit||"Sin unidad"}${r.plate?` · ${r.plate}`:""}`);
    if(includeAmounts)lines.push(`💰 ${money(r.amount)}`);
    if(index<plan.routes.length-1)lines.push("──────────────","");
  });
  lines.push("","Generado por RouteMaster");return lines.join("\n")
}
async function copyText(text){
  if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return}
  const area=document.createElement("textarea");area.value=text;area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.select();document.execCommand("copy");area.remove()
}
