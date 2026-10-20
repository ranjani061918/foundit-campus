
(() => {
  "use strict";
  const STORAGE_KEY = "foundit-campus-reports-v1";
  const THEME_KEY = "foundit-campus-theme";
  const SAMPLE_PREFIX = "sample-";
  const LOCATIONS = ["Main Library", "Engineering Block", "Cafeteria", "Auditorium", "Sports Ground", "Central Courtyard", "Computer Lab", "Parking Area", "Bus Stop", "Hostel Common Room"];
  const CATEGORIES = ["Electronics", "Water bottles", "Keys", "Books & notes", "Bags", "Clothing", "Cards & stationery", "Other"];
  // Adjust these weights to tune the explainable, rule-based match score.
  const MATCH_WEIGHTS = { category: 35, colour: 25, location: 25, date: 15 };
  const MAX_DATE_GAP_DAYS = 14;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const byId = id => document.getElementById(id);
  const state = { reports: [], activeType: "all", search: "", preview: null, photoData: "", editingId: null, theme: "light" };

  const sampleReports = [
    {id:"sample-lost-bottle",type:"lost",name:"Blue insulated bottle",category:"Water bottles",colour:"Blue",description:"Medium insulated bottle with a small scratch near the base. Last seen after the afternoon lecture.",location:"Engineering Block",date:dateOffset(-1),status:"open",photo:"",privateDetails:"",sample:true,createdAt:Date.now()-8000},
    {id:"sample-found-bottle",type:"found",name:"Insulated water bottle",category:"Water bottles",colour:"Navy blue",description:"Bottle picked up near the engineering lecture rooms. Kept the exact marks private.",location:"Engineering Block",date:dateOffset(-1),status:"open",photo:"",privateDetails:"Small star sticker on the bottom.",sample:true,createdAt:Date.now()-7000},
    {id:"sample-lost-keys",type:"lost",name:"Keyring with two keys",category:"Keys",colour:"Silver",description:"Small metal keyring, possibly left while walking from the library towards the courtyard.",location:"Main Library",date:dateOffset(-2),status:"open",photo:"",privateDetails:"One key has a distinctive notch.",sample:true,createdAt:Date.now()-6000},
    {id:"sample-found-earbuds",type:"found",name:"Wireless earbuds case",category:"Electronics",colour:"White",description:"White earbuds case found on a table. Please verify the case details privately.",location:"Cafeteria",date:dateOffset(0),status:"open",photo:"",privateDetails:"",sample:true,createdAt:Date.now()-5000},
    {id:"sample-lost-notebook",type:"lost",name:"Green lecture notebook",category:"Books & notes",colour:"Green",description:"A5 notebook with class notes. Might have been left after the morning class.",location:"Computer Lab",date:dateOffset(-3),status:"open",photo:"",privateDetails:"",sample:true,createdAt:Date.now()-4000},
    {id:"sample-found-card",type:"found",name:"Card holder",category:"Cards & stationery",colour:"Black",description:"Black card holder found near the main walkway. No card details are shown here.",location:"Central Courtyard",date:dateOffset(-1),status:"resolved",photo:"",privateDetails:"",sample:true,createdAt:Date.now()-3000}
  ];
  function dateOffset(days) { const d = new Date(); d.setDate(d.getDate()+days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  function normalize(value) { return String(value ?? "").trim().toLowerCase().replace(/\s+/g," "); }
  function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
  function safeDate(value) { const d = new Date(`${value}T12:00:00`); return Number.isNaN(d.getTime()) ? null : d; }
  function prettyDate(value) { const d=safeDate(value); return d ? d.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}) : "Date not set"; }
  function daysBetween(a,b) { const da=safeDate(a), db=safeDate(b); if(!da||!db)return null; return Math.abs(Math.round((da-db)/86400000)); }
  function getIcon(report) {
    const cat=report.category;
    if(cat==="Electronics") return "🎧";
    if(cat==="Water bottles") return "🧴";
    if(cat==="Keys") return "🔑";
    if(cat==="Books & notes") return "📓";
    if(cat==="Bags") return "🎒";
    if(cat==="Clothing") return "🧥";
    if(cat==="Cards & stationery") return "🗂️";
    return "📦";
  }
  function seedIfEmpty() {
    try {
      const existing=localStorage.getItem(STORAGE_KEY);
      if(existing===null) { state.reports=sampleReports.map(r=>({...r})); saveReports(false); }
      else { const parsed=JSON.parse(existing); state.reports=Array.isArray(parsed)?parsed:[]; }
    } catch(error) {
      state.reports=sampleReports.map(r=>({...r}));
      showToast("Browser storage is unavailable. Changes may not persist after you close this page.","error");
    }
  }
  function saveReports(showError=true) {
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state.reports)); return true; }
    catch(error) {
      if(showError) showToast("Could not save this report. Browser storage may be full, especially with photos. Try removing a photo or sample reports.","error");
      return false;
    }
  }
  function loadTheme() {
    try { state.theme=localStorage.getItem(THEME_KEY)||"light"; } catch { state.theme="light"; }
    applyTheme();
  }
  function applyTheme() {
    document.documentElement.dataset.theme=state.theme;
    byId("theme-icon").textContent=state.theme==="dark"?"☀":"☾";
    byId("theme-toggle").setAttribute("aria-label",state.theme==="dark"?"Switch to light theme":"Switch to dark theme");
    try { localStorage.setItem(THEME_KEY,state.theme); } catch {}
  }
  function showToast(message,type="success") {
    const toast=document.createElement("div"); toast.className=`toast ${type}`; toast.textContent=message;
    byId("toast-region").append(toast); window.setTimeout(()=>toast.remove(),4200);
  }
  function getOpenReports() { return state.reports.filter(r=>r.status!=="resolved"); }
  function getMatches() {
    const lost=getOpenReports().filter(r=>r.type==="lost"), found=getOpenReports().filter(r=>r.type==="found"), pairs=[];
    for(const l of lost) for(const f of found) {
      if(!l.id||!f.id||l.id===f.id||l.type===f.type) continue;
      const result=scorePair(l,f);
      if(result.score>0) pairs.push({lost:l,found:f,...result});
    }
    return pairs.sort((a,b)=>b.score-a.score||a.lost.createdAt-b.lost.createdAt).slice(0,6);
  }
  function scorePair(lost,found) {
    let score=0; const reasons=[];
    if(normalize(lost.category)&&normalize(found.category)&&normalize(lost.category)===normalize(found.category)){score+=MATCH_WEIGHTS.category;reasons.push("same category");}
    const lc=normalize(lost.colour),fc=normalize(found.colour);
    if(lc&&fc&&(lc===fc||lc.includes(fc)||fc.includes(lc))){score+=MATCH_WEIGHTS.colour;reasons.push("similar colour");}
    const ll=normalize(lost.location),fl=normalize(found.location);
    if(ll&&fl&&ll===fl){score+=MATCH_WEIGHTS.location;reasons.push("same location");}
    else if(ll&&fl&&areNearby(lost.location,found.location)){score+=Math.round(MATCH_WEIGHTS.location*.6);reasons.push("nearby locations");}
    const gap=daysBetween(lost.date,found.date);
    if(gap!==null&&gap<=MAX_DATE_GAP_DAYS){const datePoints=Math.round(MATCH_WEIGHTS.date*(1-gap/(MAX_DATE_GAP_DAYS+1)));score+=Math.max(0,datePoints);if(datePoints>0)reasons.push(gap===0?"reported on the same day":`dates ${gap} day${gap===1?"":"s"} apart`);}
    const explanation=reasons.length?humanReasons(reasons):"Reports have limited matching details so far.";
    return {score:Math.min(100,score),explanation,reasons};
  }
  function areNearby(a,b) {
    // The prototype uses a small editable campus location map, not live geolocation.
    const neighbours={
      "main library":["central courtyard","engineering block"],
      "engineering block":["main library","computer lab","central courtyard"],
      "computer lab":["engineering block","central courtyard"],
      "central courtyard":["main library","engineering block","computer lab","cafeteria","bus stop"],
      "cafeteria":["central courtyard","auditorium","sports ground"],
      "auditorium":["cafeteria","central courtyard"],
      "sports ground":["cafeteria","hostel common room"],
      "bus stop":["central courtyard","parking area"],
      "parking area":["bus stop","engineering block"],
      "hostel common room":["sports ground"]
    };
    return (neighbours[normalize(a)]||[]).includes(normalize(b));
  }
  function humanReasons(reasons) {
    if(reasons.length===1)return `Matching clue: ${reasons[0]}.`;
    if(reasons.length===2)return `${capitalize(reasons[0])} and ${reasons[1]}.`;
    return `${capitalize(reasons.slice(0,-1).join(", "))} and ${reasons[reasons.length-1]}.`;
  }
  function capitalize(s){return s.charAt(0).toUpperCase()+s.slice(1);}
  function renderStats() {
    const open=getOpenReports();
    byId("stat-open").textContent=open.length;
    byId("stat-lost").textContent=open.filter(r=>r.type==="lost").length;
    byId("stat-found").textContent=open.filter(r=>r.type==="found").length;
    byId("match-count").textContent=getMatches().length;
    byId("nav-match-count").textContent=getMatches().length;
  }
  function renderMatches() {
    const matches=getMatches(), list=byId("matches-list");
    list.innerHTML=matches.map(m=>`
      <article class="match-card">
        <div class="match-card-top"><span class="match-tag"><span aria-hidden="true">✦</span> Potential match</span><div class="score-ring" style="--score:${m.score}%"><b>${m.score}<small>/100</small></b></div></div>
        <h3>${escapeHTML(m.lost.name)} <span aria-hidden="true">↔</span> ${escapeHTML(m.found.name)}</h3>
        <div class="pair-row"><div class="pair-mini"><small>Lost report</small><strong>${escapeHTML(m.lost.location||"Location not set")}</strong><span>${escapeHTML(prettyDate(m.lost.date))}</span></div><div class="pair-mini"><small>Found report</small><strong>${escapeHTML(m.found.location||"Location not set")}</strong><span>${escapeHTML(prettyDate(m.found.date))}</span></div></div>
        <p class="match-explanation">${escapeHTML(m.explanation)} Score uses category (${MATCH_WEIGHTS.category}), colour (${MATCH_WEIGHTS.colour}), location (${MATCH_WEIGHTS.location}) and date (up to ${MATCH_WEIGHTS.date}) points.</p>
        <button class="button button-outline" type="button" data-match-detail="${escapeHTML(m.lost.id)}|${escapeHTML(m.found.id)}">Review potential match <span aria-hidden="true">↗</span></button>
      </article>`).join("");
    byId("matches-empty").hidden=matches.length>0;
    list.hidden=matches.length===0;
  }
  function renderLocations() {
    const filter=byId("location-filter"), selected=filter.value||"all";
    filter.innerHTML='<option value="all">All locations</option>'+LOCATIONS.map(l=>`<option value="${escapeHTML(l)}">${escapeHTML(l)}</option>`).join("");
    if([...filter.options].some(o=>o.value===selected))filter.value=selected;
    const formLoc=byId("item-location"), current=formLoc.value;
    formLoc.innerHTML='<option value="">Choose a campus location</option>'+LOCATIONS.map(l=>`<option>${escapeHTML(l)}</option>`).join("");
    if(LOCATIONS.includes(current))formLoc.value=current;
  }
  function matchesSearch(r) {
    const q=normalize(state.search);
    return !q||normalize(`${r.name} ${r.description} ${r.category} ${r.colour} ${r.location}`).includes(q);
  }
  function renderReports() {
    renderLocations();
    const category=byId("category-filter").value, location=byId("location-filter").value, status=byId("status-filter").value;
    const filtered=state.reports.filter(r=>(state.activeType==="all"||r.type===state.activeType)&&(category==="all"||r.category===category)&&(location==="all"||r.location===location)&&(status==="all"||r.status===status)&&matchesSearch(r)).sort((a,b)=>(a.status==="resolved")-(b.status==="resolved")||b.createdAt-a.createdAt);
    byId("results-count").textContent=`Showing ${filtered.length} report${filtered.length===1?"":"s"}`;
    byId("reports-grid").innerHTML=filtered.map(r=>renderReportCard(r)).join("");
    byId("reports-empty").hidden=filtered.length>0;
    byId("reports-grid").hidden=filtered.length===0;
    renderStats();
  }
  function renderReportCard(r) {
    const resolved=r.status==="resolved";
    const visual=r.photo?`<img src="${r.photo}" alt="Photo of ${escapeHTML(r.name)}">`:`<span class="item-emoji" aria-hidden="true">${getIcon(r)}</span>`;
    return `<article class="item-card ${resolved?"resolved-card":""}">
      <div class="item-visual">${visual}<span class="type-badge ${r.type}">${r.type==="lost"?"Lost item":"Found item"}</span>${resolved?'<span class="status-badge">Resolved</span>':""}</div>
      <div class="item-body"><div class="item-meta"><span class="category-pill">${escapeHTML(r.category)}</span><span>·</span><span>${escapeHTML(r.colour||"Colour not listed")}</span></div><h3>${escapeHTML(r.name)}</h3><p class="item-description">${escapeHTML(r.description)}</p>
      <div class="item-details"><span aria-label="Location">⌖ ${escapeHTML(r.location)}</span><span aria-label="Date">◷ ${escapeHTML(prettyDate(r.date))}</span></div>
      <div class="item-actions"><button class="button button-outline" type="button" data-detail="${escapeHTML(r.id)}">View details</button><button class="button button-outline" type="button" data-resolve="${escapeHTML(r.id)}">${resolved?"Restore":"Resolve"}</button><button class="icon-button" type="button" data-delete="${escapeHTML(r.id)}" aria-label="Delete ${escapeHTML(r.name)}" title="Delete report">⌫</button></div></div></article>`;
  }
  function renderAll() { renderMatches(); renderReports(); }
  function openReportForm() {
    state.editingId=null; state.preview=null; state.photoData="";
    byId("report-form").reset(); clearErrors(); byId("photo-preview").hidden=true; byId("item-photo").value="";
    byId("form-alert").hidden=true; byId("description-count").textContent="0";
    byId("item-date").value=dateOffset(0); byId("item-date").max=dateOffset(0);
    updateDateLabel(); renderLocations();
    byId("report-dialog").showModal(); byId("item-name").focus();
  }
  function updateDateLabel(){const type=$('input[name="type"]:checked').value;byId("date-label").textContent=type==="lost"?"Date lost":"Date found";}
  function clearErrors(){["name","category","location","date","description","photo"].forEach(k=>byId(`${k}-error`).textContent="");}
  function validateForm() {
    clearErrors();let valid=true;
    const name=byId("item-name").value.trim(), category=byId("item-category").value, location=byId("item-location").value, date=byId("item-date").value, desc=byId("item-description").value.trim();
    const today=dateOffset(0);
    if(!name){byId("name-error").textContent="Please enter an item name.";valid=false;}
    if(!category){byId("category-error").textContent="Choose a category.";valid=false;}
    if(!location){byId("location-error").textContent="Choose the closest general campus location.";valid=false;}
    if(!date){byId("date-error").textContent="Add the date it was lost or found.";valid=false;}
    else if(date>today){byId("date-error").textContent="The date can’t be in the future.";valid=false;}
    if(!desc){byId("description-error").textContent="Add a short description.";valid=false;}
    if(!valid){const first=$(".field-error:not(:empty)");if(first)first.closest(".field")?.querySelector("input,select,textarea")?.focus();return null;}
    return {type:$('input[name="type"]:checked').value,name,category,colour:byId("item-colour").value.trim(),location,date,description:desc,privateDetails:byId("private-details").value.trim(),photo:state.photoData};
  }
  function showPreview() {
    const data=validateForm();if(!data)return;
    state.preview=data;
    byId("preview-content").innerHTML=`<div class="preview-card"><div class="preview-image">${data.photo?`<img src="${data.photo}" alt="Selected item photo">`:getIcon(data)}</div><div><span class="type-badge ${data.type}" style="position:static;display:inline-block">${data.type==="lost"?"Lost item":"Found item"}</span><h3>${escapeHTML(data.name)}</h3><p>${escapeHTML(data.description)}</p><div class="preview-meta"><span>${escapeHTML(data.category)}</span><span>· ${escapeHTML(data.colour||"Colour not listed")}</span><span>· ${escapeHTML(data.location)}</span><span>· ${escapeHTML(prettyDate(data.date))}</span></div></div></div>${data.privateDetails?`<div class="preview-private"><b>🔒 Private details, stored locally only</b><p>${escapeHTML(data.privateDetails)}</p></div>`:""}<p class="field-hint" style="margin-top:12px">Public cards show the item details above only. Reports are stored in this browser and are not shared across devices.</p>`;
    byId("report-dialog").close();byId("preview-dialog").showModal();
  }
  function submitReport() {
    if(!state.preview)return;
    const report={...state.preview,id:`report-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,status:"open",sample:false,createdAt:Date.now()};
    state.reports.unshift(report);
    if(!saveReports()) { state.reports=state.reports.filter(r=>r.id!==report.id);return; }
    byId("preview-dialog").close();state.search="";byId("search-input").value="";state.activeType="all";$$(".segment").forEach(b=>{const active=b.dataset.type==="all";b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
    renderAll();showToast("Your report is on this device’s noticeboard.","success");byId("browse").scrollIntoView({behavior:"smooth"});
  }
  async function handlePhoto(file) {
    byId("photo-error").textContent="";state.photoData="";
    if(!file){byId("photo-preview").hidden=true;return;}
    if(!file.type.startsWith("image/")||!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){byId("photo-error").textContent="Choose a JPG, PNG, WEBP or GIF image.";byId("item-photo").value="";return;}
    if(file.size>2*1024*1024){byId("photo-error").textContent="That image is over 2 MB. Choose a smaller file.";byId("item-photo").value="";return;}
    try {
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("read"));reader.readAsDataURL(file);});
      // Compress large dimensions when the browser can decode the image; GIFs are retained as their first frame.
      state.photoData=await compressImage(data,file.type);
      byId("photo-preview-image").src=state.photoData;byId("photo-preview").hidden=false;
    } catch { byId("photo-error").textContent="This image could not be previewed. Try another file.";byId("item-photo").value="";state.photoData=""; }
  }
  function compressImage(data,type) {
    return new Promise(resolve=>{
      const img=new Image();
      img.onload=()=>{
        if(!img.width||!img.height||type==="image/gif"){resolve(data);return;}
        const max=1000,scale=Math.min(1,max/Math.max(img.width,img.height));
        if(scale===1&&data.length<550000){resolve(data);return;}
        const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext("2d");if(!ctx){resolve(data);return;}ctx.drawImage(img,0,0,canvas.width,canvas.height);
        try{resolve(canvas.toDataURL("image/jpeg",.78));}catch{resolve(data);}
      };
      img.onerror=()=>resolve(data);img.src=data;
    });
  }
  function openDetail(id) {
    const r=state.reports.find(x=>x.id===id);if(!r)return;
    byId("detail-title").textContent=r.name;
    byId("detail-content").innerHTML=`${r.photo?`<img class="detail-image" src="${r.photo}" alt="Photo of ${escapeHTML(r.name)}">`:""}<span class="type-badge ${r.type}" style="position:static;display:inline-block">${r.type==="lost"?"Lost item":"Found item"}</span> ${r.status==="resolved"?'<span class="status-badge" style="position:static;display:inline-block">Resolved</span>':""}<p class="detail-description" style="margin-top:14px">${escapeHTML(r.description)}</p><div class="detail-list"><div><small>Category</small><strong>${escapeHTML(r.category)}</strong></div><div><small>Colour</small><strong>${escapeHTML(r.colour||"Not listed")}</strong></div><div><small>General location</small><strong>${escapeHTML(r.location)}</strong></div><div><small>Date</small><strong>${escapeHTML(prettyDate(r.date))}</strong></div></div><p class="field-hint">This is a local prototype. A potential match is not proof of ownership. Verify privately through an appropriate college channel.</p>${r.privateDetails?`<div class="detail-private"><b>🔒 Private details (visible only in this local browser)</b><p>${escapeHTML(r.privateDetails)}</p></div>`:""}<div class="modal-actions"><button class="button button-outline" type="button" data-detail-resolve="${escapeHTML(r.id)}">${r.status==="resolved"?"Restore report":"Mark resolved"}</button><button class="button button-primary" type="button" data-detail-close>Done</button></div>`;
    byId("detail-dialog").showModal();
  }
  function toggleResolved(id) {
    const r=state.reports.find(x=>x.id===id);if(!r)return;
    r.status=r.status==="resolved"?"open":"resolved";
    if(!saveReports()){r.status=r.status==="resolved"?"open":"resolved";return;}
    renderAll();showToast(r.status==="resolved"?"Report marked as resolved.":"Report restored to open reports.");
    if(byId("detail-dialog").open)byId("detail-dialog").close();
  }
  function deleteReport(id) {
    const r=state.reports.find(x=>x.id===id);if(!r)return;
    if(!window.confirm(`Delete “${r.name}” from this browser? This cannot be undone.`))return;
    const old=state.reports;state.reports=old.filter(x=>x.id!==id);
    if(!saveReports()){state.reports=old;return;}
    renderAll();showToast("Report deleted from this browser.");
    if(byId("detail-dialog").open)byId("detail-dialog").close();
  }
  function clearFilters() {
    state.search="";byId("search-input").value="";byId("category-filter").value="all";byId("location-filter").value="all";byId("status-filter").value="open";state.activeType="all";
    $$(".segment").forEach(b=>{const active=b.dataset.type==="all";b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});renderReports();
  }
  function removeSamples() {
    const count=state.reports.filter(r=>r.sample||r.id.startsWith(SAMPLE_PREFIX)).length;
    if(!count){showToast("There are no sample reports left to remove.");return;}
    if(!window.confirm(`Remove ${count} fictional sample report${count===1?"":"s"}? Your own reports will be kept.`))return;
    const old=state.reports;state.reports=old.filter(r=>!(r.sample||r.id.startsWith(SAMPLE_PREFIX)));
    if(!saveReports()){state.reports=old;return;}renderAll();showToast("Fictional sample reports removed.");
  }
  function init() {
    seedIfEmpty();loadTheme();renderLocations();renderAll();
    ["header-report","browse-report","match-report-cta","empty-report-cta"].forEach(id=>byId(id).addEventListener("click",openReportForm));
    $$(".close-dialog").forEach(b=>b.addEventListener("click",()=>byId("report-dialog").close()));
    $$(".close-preview").forEach(b=>b.addEventListener("click",()=>byId("preview-dialog").close()));
    $$(".close-detail").forEach(b=>b.addEventListener("click",()=>byId("detail-dialog").close()));
    byId("cancel-report").addEventListener("click",()=>byId("report-dialog").close());
    byId("preview-report").addEventListener("click",showPreview);
    byId("back-to-edit").addEventListener("click",()=>{byId("preview-dialog").close();byId("report-dialog").showModal();});
    byId("submit-report").addEventListener("click",submitReport);
    byId("report-form").addEventListener("submit",e=>{e.preventDefault();showPreview();});
    $$('input[name="type"]').forEach(el=>el.addEventListener("change",updateDateLabel));
    byId("item-description").addEventListener("input",()=>byId("description-count").textContent=byId("item-description").value.length);
    byId("item-photo").addEventListener("change",e=>handlePhoto(e.target.files?.[0]));
    byId("remove-photo").addEventListener("click",()=>{state.photoData="";byId("item-photo").value="";byId("photo-preview").hidden=true;byId("photo-error").textContent="";});
    byId("theme-toggle").addEventListener("click",()=>{state.theme=state.theme==="dark"?"light":"dark";applyTheme();});
    byId("menu-toggle").addEventListener("click",()=>{const nav=byId("mobile-nav"),open=nav.hidden;nav.hidden=!open;byId("menu-toggle").setAttribute("aria-expanded",String(open));byId("menu-toggle").setAttribute("aria-label",open?"Close navigation":"Open navigation");byId("menu-toggle").textContent=open?"×":"☰";});
    $$("#mobile-nav a").forEach(a=>a.addEventListener("click",()=>{byId("mobile-nav").hidden=true;byId("menu-toggle").setAttribute("aria-expanded","false");byId("menu-toggle").textContent="☰";}));
    $$(".segment").forEach(b=>b.addEventListener("click",()=>{state.activeType=b.dataset.type;$$(".segment").forEach(x=>{const active=x===b;x.classList.toggle("active",active);x.setAttribute("aria-pressed",String(active));});renderReports();}));
    ["category-filter","location-filter","status-filter"].forEach(id=>byId(id).addEventListener("change",renderReports));
    byId("search-input").addEventListener("input",e=>{state.search=e.target.value;renderReports();});
    byId("search-button").addEventListener("click",()=>{state.search=byId("search-input").value;renderReports();byId("browse").scrollIntoView({behavior:"smooth"});});
    byId("search-input").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();byId("search-button").click();}});
    byId("clear-filters").addEventListener("click",clearFilters);
    byId("refresh-matches").addEventListener("click",()=>{renderMatches();renderStats();showToast("Potential matches refreshed.");});
    byId("remove-samples").addEventListener("click",removeSamples);
    document.addEventListener("click",e=>{
      const detail=e.target.closest("[data-detail]");if(detail){openDetail(detail.dataset.detail);return;}
      const resolve=e.target.closest("[data-resolve]");if(resolve){toggleResolved(resolve.dataset.resolve);return;}
      const del=e.target.closest("[data-delete]");if(del){deleteReport(del.dataset.delete);return;}
      const match=e.target.closest("[data-match-detail]");if(match){const ids=match.dataset.matchDetail.split("|");byId("detail-dialog").close();openDetail(ids[0]);return;}
      const detailResolve=e.target.closest("[data-detail-resolve]");if(detailResolve){toggleResolved(detailResolve.dataset.detailResolve);return;}
      if(e.target.closest("[data-detail-close]"))byId("detail-dialog").close();
    });
    // Dialogs close naturally on Escape; clicking outside is intentionally not destructive.
  }
  document.addEventListener("DOMContentLoaded",init);
})();