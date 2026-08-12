const STORAGE_KEY = "northstar-project-manager-v2";
const LOG_STORAGE_KEY = "northstar-node-logs-v1";
const URL_STORAGE_KEY = "northstar-node-urls-v1";
const APP_VERSION = "1.7.46";
const supabaseSettings = window.NORTHSTAR_SUPABASE || {};
const supabaseClient = window.supabase?.createClient(supabaseSettings.url, supabaseSettings.publishableKey) || null;
let currentUser = null, remoteReady = false, syncTimer = null, authMode = "signin";
const STATUS = ["To do", "In progress", "Review", "Done"];
const state = { projects: [], activeProjectId: null, view: "gantt", zoom: 1, color: "#dbe88f", pendingDelete: null, collapsedProjects: new Set(), homeCollapsedProjects: new Set(), collapsedTasks: new Set(), shallowExpandedProjects: new Set(), visibleHierarchyLevel: 2, nextSevenDays: false, blockView: false, mobileExpandedProjectId: null };
const $ = id => document.getElementById(id);
const esc = value => { const el = document.createElement("span"); el.textContent = value ?? ""; return el.innerHTML; };
const plainText = value => { const el = document.createElement("div"); el.innerHTML = value || ""; return el.textContent || ""; };
const isPastNode=item=>!!(item?.start&&item?.end&&item.start<todayIso()&&item.end<todayIso());
const loadNodeLogs=()=>{try{return JSON.parse(localStorage.getItem(LOG_STORAGE_KEY)||"{}");}catch{return {};}};
const loadNodeUrls=()=>{try{return JSON.parse(localStorage.getItem(URL_STORAGE_KEY)||"{}");}catch{return {};}};
function addLogRow(entry={date:todayIso(),text:""}){const row=document.createElement("div");row.className="log-row";row.innerHTML=`<input type="date" value="${esc(entry.date||todayIso())}" aria-label="Log date"><textarea rows="2" aria-label="Log entry">${esc(entry.text||"")}</textarea><button type="button" class="log-remove" aria-label="Remove log entry">×</button>`;row.querySelector(".log-remove").onclick=()=>row.remove();$("logRows").append(row);}
function openNodeLog(key,title){const logs=loadNodeLogs();$("logNodeKey").value=key;$("logTitle").textContent=title;$("logRows").innerHTML="";(logs[key]||[]).forEach(addLogRow);if(!$("logRows").children.length)addLogRow();$("logModal").hidden=false;}
function addUrlRow(entry={label:"",url:""}){const row=document.createElement("div"),hasUrl=!!entry.url;row.className=`url-row${hasUrl?"":" editing"}`;row.innerHTML=`<span class="url-label"><a href="${esc(entry.url||"#")}" target="_blank" rel="noopener noreferrer">${esc(entry.label||entry.url||"")}</a><input type="text" value="${esc(entry.label||"")}" aria-label="Link name" placeholder="Link name"></span><span class="url-value"><span>${esc(entry.url||"")}</span><input type="url" value="${esc(entry.url||"")}" aria-label="URL" placeholder="https://example.com"></span><button type="button" class="url-edit" aria-label="${hasUrl?"Edit":"Finish editing"} link">${hasUrl?"Edit":"Done"}</button><button type="button" class="url-remove" aria-label="Remove URL">×</button>`;const labelInput=row.querySelector('.url-label input'),urlInput=row.querySelector('.url-value input'),labelLink=row.querySelector('.url-label a'),urlText=row.querySelector('.url-value span'),edit=row.querySelector('.url-edit');const toggleEdit=()=>{if(row.classList.contains("editing")){const value=urlInput.value.trim();if(!value){urlInput.focus();return;}labelLink.href=normalizeNodeUrl(value);labelLink.textContent=labelInput.value.trim()||value;urlText.textContent=value;row.classList.remove("editing");edit.textContent="Edit";edit.setAttribute("aria-label","Edit link");}else{row.classList.add("editing");edit.textContent="Done";edit.setAttribute("aria-label","Finish editing link");labelInput.focus();labelInput.select();}};edit.onclick=toggleEdit;[labelInput,urlInput].forEach(input=>input.onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();toggleEdit();}});row.querySelector(".url-remove").onclick=()=>row.remove();$("urlRows").append(row);if(!hasUrl)setTimeout(()=>labelInput.focus(),0);}
function normalizeNodeUrl(value){const entered=value.trim();return /^[a-z][a-z\d+.-]*:/i.test(entered)?entered:`https://${entered}`;}
function openNodeUrls(key,title){const urls=loadNodeUrls();$("urlNodeKey").value=key;$("urlTitle").textContent=title;$("urlRows").innerHTML="";(urls[key]||[]).forEach(addUrlRow);if(!$("urlRows").children.length)addUrlRow();$("urlModal").hidden=false;}
function linkifyDocumentHtml(value) {
  const root = document.createElement("div");
  root.innerHTML = value || "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement?.closest("a,script,style")) nodes.push(node);
  }
  const urlPattern = /(?:https?:\/\/|www\.)[^\s<>]+/gi;
  nodes.forEach(node => {
    const text = node.nodeValue || "";
    let match, cursor = 0;
    const fragment = document.createDocumentFragment();
    while ((match = urlPattern.exec(text))) {
      let label = match[0], trailing = "";
      while (/[.,!?;:)]$/.test(label)) { trailing = label.slice(-1) + trailing; label = label.slice(0, -1); }
      fragment.append(text.slice(cursor, match.index));
      const link = document.createElement("a");
      link.href = label.startsWith("www.") ? `https://${label}` : label;
      link.textContent = label;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      fragment.append(link, trailing);
      cursor = match.index + match[0].length;
    }
    if (cursor) { fragment.append(text.slice(cursor)); node.replaceWith(fragment); }
  });
  root.querySelectorAll("a[href]").forEach(link => { link.target = "_blank"; link.rel = "noopener noreferrer"; });
  return root.innerHTML;
}
const hasWriting = value => plainText(value).trim().length > 0;
const isAndroid = () => /Android/i.test(navigator.userAgent);
const parseDate = value => new Date(`${value}T12:00:00`);
const toIso = value => value.toISOString().slice(0, 10);
const addDays = (value, amount) => { const d = parseDate(value); d.setDate(d.getDate() + amount); return toIso(d); };
const dayDiff = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const formatDate = value => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parseDate(value));
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const taskTooltip = task => { if (!task.start) return `${task.name}\nNot scheduled`; const distance = dayDiff(todayIso(), task.start); const timing = distance === 0 ? "Starts today" : distance > 0 ? `Starts in ${distance} day${distance === 1 ? "" : "s"}` : `Started ${Math.abs(distance)} day${Math.abs(distance) === 1 ? "" : "s"} ago`; return `${task.name}\n${timing}`; };
const compareTaskSchedule = (a, b) => { if (!a.start && !b.start) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name); if (!a.start) return 1; if (!b.start) return -1; return a.start.localeCompare(b.start) || a.name.localeCompare(b.name); };
const project = () => state.projects.find(item => item.id === state.activeProjectId);
const PARENT_META = /<!--northstar-parent:([^>]*)-->/g;
function decodeTaskHierarchy(task, fallbackParentId = null) {
  const notes = task.notes || "", match = [...notes.matchAll(PARENT_META)][0]; let encodedParent = null;
  if (match?.[1]) { try { encodedParent = decodeURIComponent(match[1]); } catch { encodedParent = match[1]; } }
  return { ...task, parentId:task.parentId || encodedParent || fallbackParentId || null, notes:notes.replace(PARENT_META, "").trim() };
}
function encodeTaskHierarchy(task) {
  const notes=(task.notes||"").replace(PARENT_META, "").trim(), marker=task.parentId?`<!--northstar-parent:${encodeURIComponent(task.parentId)}-->`:"";
  return { ...task, notes:`${notes}${marker}` };
}

function load() {
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (saved?.projects) { state.projects = saved.projects.map(p=>({...p,tasks:(p.tasks||[]).map(task=>decodeTaskHierarchy(task))})); state.activeProjectId = saved.activeProjectId; } } catch {}
  state.activeProjectId = null;
  state.collapsedProjects = new Set(state.projects.map(p => p.id));
  applyOpeningExpansion();
}
function workspacePayload() { return { projects: state.projects.map(p=>({...p,tasks:p.tasks.map(encodeTaskHierarchy)})), activeProjectId: state.activeProjectId }; }
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspacePayload())); scheduleRemoteSync(); }
function setSyncStatus(message) { const el = $("syncStatus"); if (el) el.textContent = message; const note = document.querySelector(".storage-note"), status = note?.querySelector(".storage-status"); if (status) status.textContent = message; if (note) note.classList.toggle("synced", message === "Synced with Supabase"); }
function scheduleRemoteSync() { if (!currentUser || !remoteReady) return; setSyncStatus("Saving…"); clearTimeout(syncTimer); syncTimer = setTimeout(syncRemote, 350); }
async function syncRemote() { syncTimer = null; if (!currentUser || !remoteReady) return; const { error } = await supabaseClient.rpc("northstar_replace_workspace", { payload: workspacePayload(), backup_time: null }); setSyncStatus(error ? "Sync failed" : "Synced with Supabase"); if (error) console.error(error); }
function downloadBackup() { const backup = { format: "northstar-backup-v1", exportedAt: new Date().toISOString(), storageKey: STORAGE_KEY, data: workspacePayload() }; const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `northstar-backup-${new Date().toISOString().replaceAll(":", "-")}.json`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); return backup.exportedAt; }
function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function initials(name) { return (name || "?").split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase(); }
function statusClass(value) { return value.toLowerCase().replaceAll(" ", "-"); }
function taskItems() {
  const p = project(); if (!p) return [];
  const query = $("searchInput").value.trim().toLowerCase(); const status = $("statusFilter").value;
  return p.tasks.filter(task => (!query || `${task.name} ${task.owner} ${task.notes}`.toLowerCase().includes(query)) && (status === "all" || task.status === status));
}

function taskDepth(task, tasks = project()?.tasks || []) {
  let depth = 0, current = task, visited = new Set();
  while (current?.parentId && depth < 3 && !visited.has(current.id)) { visited.add(current.id); current = tasks.find(item => item.id === current.parentId); if (current) depth++; else break; }
  return depth;
}
function hierarchicalTasks(tasks, honorCollapsed = true) {
  const sorted = [...tasks].sort(compareTaskSchedule), result = [], visit = task => {
    result.push(task);
    if (honorCollapsed && state.collapsedTasks.has(task.id)) return;
    sorted.filter(child => child.parentId === task.id).forEach(visit);
  };
  sorted.filter(task => !task.parentId || !tasks.some(item => item.id === task.parentId)).forEach(visit);
  const projectId=tasks[0]?.projectId;
  return projectId&&state.shallowExpandedProjects.has(projectId)?result.filter(task=>taskDepth(task,tasks)===0):result;
}
function taskHasAncestor(task, ancestorId, tasks) { let current=task; while(current?.parentId){if(current.parentId===ancestorId)return true;current=tasks.find(item=>item.id===current.parentId);}return false; }
function resetToHomeView() {
  state.activeProjectId = null;
  applyOpeningExpansion();
  $("searchInput").value = "";
  $("homeStatusFilter").value = "all";
  $("homeDateFilter").value = "all";
}
function applyOpeningExpansion() {
  state.homeCollapsedProjects.clear();
  state.collapsedTasks = new Set(state.projects.flatMap(p=>p.tasks.filter(task=>taskDepth(task,p.tasks)===0&&p.tasks.some(child=>child.parentId===task.id)).map(task=>task.id)));
  state.visibleHierarchyLevel = 2;
}
function showHierarchyLevel(level) {
  state.visibleHierarchyLevel=level;
  if(level===1){state.homeCollapsedProjects=new Set(state.projects.map(p=>p.id));state.collapsedTasks.clear();}
  else {state.homeCollapsedProjects.clear();state.collapsedTasks=new Set(state.projects.flatMap(p=>p.tasks.filter(task=>taskDepth(task,p.tasks)===level-2&&p.tasks.some(child=>child.parentId===task.id)).map(task=>task.id)));}
  renderHomeGantt();
}
function toggleAllNodes() {
  const parents=state.projects.flatMap(p=>p.tasks.filter(task=>p.tasks.some(child=>child.parentId===task.id))), allProjectsCollapsed=state.projects.length>0&&state.projects.every(item=>state.homeCollapsedProjects.has(item.id)), allTasksCollapsed=parents.every(item=>state.collapsedTasks.has(item.id)), allCollapsed=allProjectsCollapsed&&allTasksCollapsed;
  state.homeCollapsedProjects = allCollapsed ? new Set() : new Set(state.projects.map(item => item.id));
  state.collapsedTasks = allCollapsed ? new Set() : new Set(parents.map(item=>item.id));
  renderHomeGantt();
}

function render() {
  const p = project();
  $("welcome").hidden = !!p; $("projectWorkspace").hidden = !p; $("searchInput").disabled = state.projects.length === 0;
  renderSidebar();
  if (!p) { renderHomeGantt(); return; }
  $("projectName").textContent = p.name;
  renderGantt();
  renderProjectAgenda();
  $("filterDot").hidden = $("statusFilter").value === "all" && !$("searchInput").value;
}
function renderSidebar() {
  $("sideEmpty").hidden = state.projects.length > 0;
  const sortedProjects = [...state.projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  $("projectList").innerHTML = sortedProjects.map(p => { const collapsed = state.collapsedProjects.has(p.id); const sortedTasks = [...p.tasks].sort(compareTaskSchedule), nextTask = sortedTasks.find(task => task.start && dayDiff(todayIso(), task.start) > 0), daysUntilFirst = nextTask ? dayDiff(todayIso(), nextTask.start) : ""; return `<div class="project-tree"><div class="project-tree-head"><button class="tree-toggle ${collapsed ? "collapsed" : ""}" data-toggle-project="${p.id}" aria-label="${collapsed ? "Expand" : "Collapse"} ${esc(p.name)}" aria-expanded="${!collapsed}">⌄</button><button class="project-item ${p.id === state.activeProjectId ? "active" : ""}" data-project="${p.id}"><i style="background:${p.color}"></i><span>${esc(p.name)}</span></button><span class="project-days" title="Days until first task">${daysUntilFirst}</span><button class="side-add-task" data-add-task="${p.id}" aria-label="Add task to ${esc(p.name)}" title="Add task">＋</button></div><div class="side-tasks" ${collapsed ? "hidden" : ""}>${sortedTasks.map(task => `<button class="side-task" data-side-task="${task.id}" data-parent-project="${p.id}"><span>${esc(task.name)}</span></button>`).join("")}</div></div>`; }).join("");
  document.querySelectorAll("[data-project]").forEach(button => button.onclick = () => { $("searchInput").value = ""; $("statusFilter").value = "all"; openProjectView(button.dataset.project); });
  document.querySelectorAll("[data-side-task]").forEach(button => button.onclick = event => { event.stopPropagation(); state.activeProjectId = button.dataset.parentProject; persist(); render(); openTask(button.dataset.sideTask); });
  document.querySelectorAll("[data-side-task]").forEach(button => {
    button.draggable = true;
    button.ondragstart = event => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-northstar-task", JSON.stringify({ projectId:button.dataset.parentProject, taskId:button.dataset.sideTask }));
      event.dataTransfer.setData("text/plain", button.dataset.sideTask);
      button.classList.add("dragging");
    };
    button.ondragend = () => { button.classList.remove("dragging"); document.querySelectorAll(".task-drop-target").forEach(cell => cell.classList.remove("task-drop-target")); };
  });
  document.querySelectorAll("[data-add-task]").forEach(button => button.onclick = event => { event.stopPropagation(); state.activeProjectId = button.dataset.addTask; persist(); render(); openTask(); });
  document.querySelectorAll("[data-toggle-project]").forEach(button => button.onclick = event => { event.stopPropagation(); const id = button.dataset.toggleProject; state.collapsedProjects.has(id) ? state.collapsedProjects.delete(id) : state.collapsedProjects.add(id); renderSidebar(); });
}
function allTasks() { return state.projects.flatMap(p => p.tasks.map(task => ({ ...task, projectId: p.id, projectName: p.name, projectColor: p.color }))); }
function openProjectView(id) { state.activeProjectId = id; persist(); render(); $("sidebar").classList.remove("open"); }
function openTaskFromHome(projectId, taskId) { state.activeProjectId = projectId; persist(); render(); openTask(taskId); }
function clearHomeFilters() { $("homeStatusFilter").value = "all"; $("homeDateFilter").value = "all"; $("searchInput").value = ""; renderHomeGantt(); }
function renderMobileHomeMatrix(tasks, filtered, start, end) {
  const visibleProjects = state.projects.filter(p => !filtered || tasks.some(task => task.projectId === p.id));
  const expanded = visibleProjects.find(p => p.id === state.mobileExpandedProjectId) || null;
  const projects = expanded ? [expanded, ...visibleProjects.filter(p => p.id !== expanded.id)] : visibleProjects;
  const columns = projects.flatMap(p => {
    const projectColumn = { type:"project", id:p.id, project:p, name:p.name, start:p.start, end:p.end };
    if (p !== expanded) return [projectColumn];
    const taskColumns = tasks.filter(task => task.projectId === p.id).sort((a,b) => (a.start || "9999-12-31").localeCompare(b.start || "9999-12-31") || compareTaskSchedule(a,b)).map(task => ({ type:"task", id:task.id, project:p, name:task.name, start:task.start, end:task.end, task }));
    return [projectColumn, ...taskColumns];
  });
  const days = dayDiff(toIso(start), toIso(end)) + 1;
  let html = `<div class="mobile-matrix" style="--matrix-columns:${columns.length}"><div class="matrix-corner">DATE</div>`;
  columns.forEach((column, index) => {
    const selected = column.project === expanded;
    html += `<button class="matrix-column-head ${column.type} ${selected?"selected":""}" data-matrix-${column.type}="${column.id}" style="grid-column:${index+2};grid-row:1;--project-color:${column.project.color}">${column.type === "task" ? `<span class="matrix-task-jump" data-matrix-task-jump="${column.id}">TASK</span>` : ""}<i></i><span>${esc(column.name)}</span>${column.type === "project" ? `<b>${selected?"−":"＋"}</b>` : ""}</button>`;
  });
  for (let dayIndex=0; dayIndex<days; dayIndex++) {
    const date = addDays(toIso(start), dayIndex), parsed = parseDate(date), row = dayIndex + 2, isToday = date === todayIso(), weekend = [0,6].includes(parsed.getDay()), relativeDay = dayDiff(todayIso(), date);
    html += `<div class="matrix-date ${isToday?"today":""} ${weekend?"weekend":""}" style="grid-row:${row}"><b>${parsed.getDate()}</b><span>${new Intl.DateTimeFormat("en-US",{month:"short"}).format(parsed)}</span><small>${isToday?"TODAY":["SUN","MON","TUE","WED","THU","FRI","SAT"][parsed.getDay()]}</small></div>`;
    columns.forEach((column, columnIndex) => {
      const active = column.start && column.end && date >= column.start && date <= column.end;
      html += `<button class="matrix-cell ${column.type} ${active?"active":""} ${weekend?"weekend":""}" data-matrix-date="${date}" data-matrix-project-id="${column.project.id}" ${column.type === "task" ? `data-matrix-task-id="${column.id}"` : ""} style="grid-column:${columnIndex+2};grid-row:${row};--project-color:${column.project.color}" aria-label="${esc(column.name)} on ${date}, ${relativeDay}">${active?"<i></i>":""}<span>${relativeDay}</span></button>`;
    });
  }
  $("homeGantt").innerHTML = html + `</div>`;
  $("homeGantt").scrollLeft = 0;
  document.querySelectorAll("[data-matrix-project]").forEach(button => button.onclick = () => { state.mobileExpandedProjectId = state.mobileExpandedProjectId === button.dataset.matrixProject ? null : button.dataset.matrixProject; renderHomeGantt(); });
  document.querySelectorAll("[data-matrix-task]").forEach(button => button.onclick = event => { if (event.target.closest("[data-matrix-task-jump]")) { scrollMobileTaskDateToThirdRow(button.dataset.matrixTask); return; } openTaskFromHome(expanded.id, button.dataset.matrixTask); });
  document.querySelectorAll(".matrix-cell").forEach(cell => cell.onclick = () => { const taskId = cell.dataset.matrixTaskId; if (taskId) openTaskFromHome(cell.dataset.matrixProjectId, taskId); else { state.activeProjectId = cell.dataset.matrixProjectId; persist(); render(); openTask(null, cell.dataset.matrixDate); } });
}
function scrollMobileTaskDateToThirdRow(taskId) {
  const wrap = $("homeGantt"), task = allTasks().find(item => item.id === taskId);
  if (!wrap || !task?.start) { toast("This task has no start date"); return; }
  const target = wrap.querySelector(`.matrix-cell[data-matrix-task-id="${CSS.escape(taskId)}"][data-matrix-date="${task.start}"]`), grid = target?.closest(".mobile-matrix");
  if (!target || !grid) return;
  const headerHeight = grid.querySelector(".matrix-column-head")?.offsetHeight || 78, rowHeight = grid.querySelector(".matrix-date")?.offsetHeight || 38;
  wrap.scrollTo({ top:Math.max(0, target.offsetTop - headerHeight - rowHeight * 2), behavior:"smooth" });
}
function androidNodeActions(projectId, task = null) {
  const key=task?`task:${projectId}:${task.id}`:`project:${projectId}`,item=task||state.projects.find(project=>project.id===projectId),type=task?"task":"project",doc=hasWriting(task?task.notes:item?.description),urls=(loadNodeUrls()[key]||[]).length,logs=(loadNodeLogs()[key]||[]).some(entry=>String(entry.text||"").trim());
  return `<div class="android-node-options"><button data-open-document="${type}" data-document-project="${projectId}" ${task?`data-document-task="${task.id}"`:""}>Doc${doc?" •":""}</button><button data-open-urls="${key}" data-url-title="${esc(item?.name||"")}">URLs${urls?` (${urls})`:""}</button><button data-open-log="${key}" data-log-title="${esc(item?.name||"")}">Log${logs?" •":""}</button><button data-edit-${type}="${task?task.id:projectId}" ${task?`data-edit-parent="${projectId}"`:""}>Edit</button><button data-${task?"add-child":"add-root"}="${task?task.id:projectId}" ${task?`data-add-child-project="${projectId}"`:""}>＋ Child</button><button class="delete" data-delete-${type}-row="${task?task.id:projectId}" ${task?`data-delete-parent="${projectId}"`:""}>Delete</button></div>`;
}
function renderAndroidTree(container, projects, tasks, includeProjects=true) {
  const level=Math.max(1,Math.min(4,state.visibleHierarchyLevel||2)), taskIds=new Set(tasks.map(task=>task.id));
  let html=`<div class="android-tree"><div class="android-level-controls" aria-label="Visible hierarchy level">${[1,2,3,4].map(value=>`<button class="${level===value?"active":""}" data-android-level="${value}">${value}${value===1?"st":value===2?"nd":value===3?"rd":"th"} Level</button>`).join("")}</div>`;
  projects.forEach(parent=>{
    const projectTasks=parent.tasks.filter(task=>taskIds.has(task.id));
    if(includeProjects)html+=`<section class="android-node android-level-1"><div class="android-node-main"><i style="background:${parent.color}"></i><div><b>${esc(parent.name)}</b><small>Parent${parent.start?` · ${formatDate(parent.start)}`:""}</small></div></div>${androidNodeActions(parent.id)}</section>`;
    if(level>(includeProjects?1:0))hierarchicalTasks(projectTasks,false).filter(task=>taskDepth(task,parent.tasks)+(includeProjects?2:1)<=level).forEach(task=>{const depth=taskDepth(task,parent.tasks);html+=`<section class="android-node android-level-${depth+(includeProjects?2:1)}" style="--android-depth:${depth+(includeProjects?1:0)}"><div class="android-node-main"><span class="task-status-dot ${statusClass(task.status)}"></span><div><b>${esc(task.name)}</b><small>${esc(task.status)}${task.owner?` · ${esc(task.owner)}`:""}${task.start?` · ${formatDate(task.start)}`:""}</small></div></div>${androidNodeActions(parent.id,task)}</section>`;});
  });
  container.innerHTML=html+`</div>`;
  container.querySelectorAll("[data-android-level]").forEach(button=>button.onclick=()=>{state.visibleHierarchyLevel=Number(button.dataset.androidLevel);document.querySelectorAll("[data-hierarchy-level]").forEach(control=>control.classList.toggle("active",Number(control.dataset.hierarchyLevel)===state.visibleHierarchyLevel));render();});
  wireWritingRows();
}
function renderHomeGantt() {
  document.querySelectorAll("[data-hierarchy-level]").forEach(button=>button.classList.toggle("active",Number(button.dataset.hierarchyLevel)===state.visibleHierarchyLevel));
  const all = allTasks(), statusFilter = $("homeStatusFilter").value, dateFilter = $("homeDateFilter").value, query = $("searchInput").value.trim().toLowerCase(), today = todayIso(), tomorrow = addDays(today, 1), sevenDays=addDays(today,7);
  let tasks = all.filter(task => { const statusMatch = statusFilter === "all" || task.status === statusFilter; const dateMatch = dateFilter === "all" || (dateFilter === "today" ? task.start <= today && task.end >= today : task.start <= tomorrow && task.end >= today); const searchMatch = !query || `${task.name} ${task.owner} ${plainText(task.notes)} ${task.projectName}`.toLowerCase().includes(query); return statusMatch && dateMatch && searchMatch; });
  if(state.nextSevenDays){const included=new Set();tasks.filter(task=>(task.start>=today&&task.start<=sevenDays)||(task.end>=today&&task.end<=sevenDays)).forEach(task=>{included.add(task.id);const siblings=state.projects.find(p=>p.id===task.projectId)?.tasks||[];let current=task;while(current?.parentId){included.add(current.parentId);current=siblings.find(item=>item.id===current.parentId);}});tasks=tasks.filter(task=>included.has(task.id));}
  renderAgenda($("homeAgenda"), tasks, true);
  const filtered = statusFilter !== "all" || dateFilter !== "all" || !!query || state.nextSevenDays; $("homeFilterDot").hidden = statusFilter === "all" && dateFilter === "all" && !state.nextSevenDays;
  const matchingProjects = new Set(tasks.map(task => task.projectId)).size;
  $("homeSummary").textContent = state.projects.length ? `${matchingProjects} parent${matchingProjects === 1 ? "" : "s"} · ${tasks.length} ${filtered ? "matching " : ""}${tasks.length === 1 ? "child" : "children"}` : "No parents yet";
  if(isAndroid()&&state.projects.length){const visibleProjects=filtered?state.projects.filter(parent=>tasks.some(task=>task.projectId===parent.id)):state.projects;renderAndroidTree($("homeGantt"),visibleProjects,tasks,true);return;}
  if (!tasks.length && (!state.projects.length || filtered)) {
    $("homeGantt").innerHTML = filtered ? `<div class="empty-panel"><div>≡</div><h3>No matching tasks</h3><p>No tasks and projects match the selected filters.</p><button class="secondary home-clear-action">Clear filters</button></div>` : `<div class="empty-panel"><div>⌁</div><h3>${state.projects.length ? "No tasks on the timeline" : "Your Gantt chart is ready"}</h3><p>${state.projects.length ? "Open a project and add its first task." : "Create a project to begin building your master timeline."}</p><button class="primary home-empty-action">${state.projects.length ? "Open a project" : "＋ Create project"}</button></div>`;
    const clear = document.querySelector(".home-clear-action"); if (clear) clear.onclick = clearHomeFilters; else document.querySelector(".home-empty-action").onclick = () => state.projects.length ? openProjectView(state.projects[0].id) : openProject(); return;
  }
  const timelineTasks=tasks.filter(task=>task.start&&task.end),projectDates=state.projects.flatMap(p=>[p.start,p.end]).filter(Boolean);
  if(!timelineTasks.length&&!projectDates.length)projectDates.push(today,addDays(today,30));
  const first=state.nextSevenDays?today:[...timelineTasks.map(t=>t.start),...projectDates,today].sort()[0],last=state.nextSevenDays?sevenDays:[...timelineTasks.map(t=>t.end),...projectDates,today].sort().at(-1),start=parseDate(state.nextSevenDays?first:addDays(first,-3)),end=parseDate(state.nextSevenDays?last:addDays(last,10)),days=dayDiff(toIso(start),toIso(end))+1,width=Math.round(25*state.zoom);
  if (matchMedia("(max-width:620px)").matches) { renderMobileHomeMatrix(tasks, filtered, start, end); return; }
  let html=`<div class="gantt-grid home-grid ${state.blockView?"block-view":""}" data-chart-start="${toIso(start)}" style="--days:${days};--day-width:${width}px"><div class="gantt-corner" style="grid-column:1;grid-row:1 / span 2">PARENT / CHILD</div>`;
  let cursor=new Date(start);while(cursor<=end){const month=cursor.getMonth(),year=cursor.getFullYear(),offset=dayDiff(toIso(start),toIso(cursor));let span=0;while(cursor<=end&&cursor.getMonth()===month){span++;cursor.setDate(cursor.getDate()+1)}html+=`<div class="month" style="grid-column:${offset+2} / span ${span};grid-row:1">${new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"}).format(new Date(year,month,1))}</div>`}
  for(let i=0;i<days;i++){const d=new Date(start);d.setDate(d.getDate()+i);html+=`<div class="day ${[0,6].includes(d.getDay())?"weekend":""} ${toIso(d)===today?"today":""}" style="grid-column:${i+2};grid-row:2">${d.getDate()}<small>${toIso(d)===today?"TODAY":["S","M","T","W","T","F","S"][d.getDay()]}</small></div>`}
  let row=3;[...state.projects].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:"base"})).forEach(p=>{const projectTasks=hierarchicalTasks(tasks.filter(t=>t.projectId===p.id));if(filtered&&!projectTasks.length)return;const collapsed=state.homeCollapsedProjects.has(p.id);html+=`<div class="task-label home-project-row" data-home-project="${p.id}" style="grid-column:1;grid-row:${row}"><span class="home-chart-toggle ${collapsed?"collapsed":""}" data-home-toggle="${p.id}">⌄</span><button class="row-edit ${hasWriting(p.description)?"has-writing":""}" data-edit-project="${p.id}" aria-label="Edit ${esc(p.name)}" title="Edit project">✎</button><i style="background:${p.color}"></i><button class="row-title" data-write-project="${p.id}"><b>${esc(p.name)}</b></button></div>`;for(let i=0;i<days;i++){const d=new Date(start);d.setDate(d.getDate()+i);html+=`<div class="gantt-cell project-band ${[0,6].includes(d.getDay())?"weekend":""}" data-project-cell="${p.id}" style="grid-column:${i+2};grid-row:${row}"></div>`}if(p.start&&p.end){const projectOffset=dayDiff(toIso(start),p.start),projectDuration=dayDiff(p.start,p.end)+1;html+=`<button class="bar project-bar" data-project-bar="${p.id}" style="--project-color:${p.color};grid-column:${projectOffset+2} / span ${projectDuration};grid-row:${row}">${esc(p.name)}</button>`}row++;if(!collapsed)projectTasks.forEach(task=>{html+=`<div class="task-label home-task-row" data-home-task="${task.id}" data-home-parent="${p.id}" style="grid-column:1;grid-row:${row}"><button class="row-edit ${hasWriting(task.notes)?"has-writing":""}" data-edit-task="${task.id}" data-edit-parent="${p.id}" aria-label="Edit ${esc(task.name)}" title="Edit task">✎</button><button class="row-title" data-write-task="${task.id}" data-write-parent="${p.id}"><b>${esc(task.name)}</b></button></div>`;for(let i=0;i<days;i++){const d=new Date(start);d.setDate(d.getDate()+i);html+=`<div class="gantt-cell task-band ${[0,6].includes(d.getDay())?"weekend":""}" style="grid-column:${i+2};grid-row:${row}"></div>`}if(task.start&&task.end){const offset=dayDiff(toIso(start),task.start),duration=dayDiff(task.start,task.end)+1;html+=`<button class="bar ${statusClass(task.status)}" data-home-bar="${task.id}" data-home-parent="${p.id}" style="grid-column:${offset+2} / span ${duration};grid-row:${row}">${esc(task.name)}</button>`}row++})});
  $("homeGantt").innerHTML=html+`</div>`;
  clipTimelineBars($("homeGantt"));
  markTruncatedBars();
  document.querySelectorAll("[data-home-toggle]").forEach(toggle=>toggle.onclick=()=>{const id=toggle.dataset.homeToggle;if(state.homeCollapsedProjects.has(id)){state.homeCollapsedProjects.delete(id);state.shallowExpandedProjects.add(id);const parent=state.projects.find(item=>item.id===id);parent?.tasks.filter(task=>parent.tasks.some(child=>child.parentId===task.id)).forEach(task=>state.collapsedTasks.add(task.id));}else{state.homeCollapsedProjects.add(id);state.shallowExpandedProjects.delete(id);}renderHomeGantt();});wireWritingRows();wireHomeDrag(width);expandTodayColumn($("homeGantt"));scrollTimelineToToday($("homeGantt"));
}
function renderAgenda(container, tasks, includeProject) {
  if (!container) return;
  const today = todayIso();
  const visibleTasks = matchMedia("(max-width:620px)").matches ? tasks.filter(task => !task.end || task.end >= today) : tasks;
  const sorted = [...visibleTasks].sort(compareTaskSchedule);
  if (!sorted.length) { container.innerHTML = `<div class="agenda-empty">No tasks to show.</div>`; return; }
  container.innerHTML = sorted.map(task => {
    const active = task.start && task.start <= today && task.end >= today, daysAway = task.start ? Math.max(0, dayDiff(today, task.start)) : null, projectId = task.projectId || state.activeProjectId;
    const schedule = task.start ? `${formatDate(task.start)}${task.end !== task.start ? ` – ${formatDate(task.end)}` : ""}` : 'Not scheduled';
    const countdown = daysAway == null ? '' : daysAway === 0 ? "Today" : `${daysAway} day${daysAway === 1 ? "" : "s"}`;
    return `<button class="agenda-item" data-agenda-task="${task.id}" data-agenda-project="${projectId}"><i class="${statusClass(task.status)}"></i><span class="agenda-copy">${includeProject ? `<small>${esc(task.projectName)}</small>` : ""}<b>${esc(task.name)}</b><span>${schedule}${countdown ? `<span class="agenda-countdown"> · ${countdown}</span>` : ''}</span></span><span class="agenda-meta"><em class="${active ? "active" : ""}">${active ? "Active" : esc(task.status)}</em></span></button>`;
  }).join("");
  container.querySelectorAll("[data-agenda-task]").forEach(button => button.onclick = () => openTaskFromHome(button.dataset.agendaProject, button.dataset.agendaTask));
}
function renderProjectAgenda() { renderAgenda($("projectAgenda"), taskItems(), false); }
function scrollTimelineToToday(wrap) {
  if (!wrap) return;
  requestAnimationFrame(() => {
    const today = wrap.querySelector(".day.today"), label = wrap.querySelector(".gantt-corner");
    if (!today) return;
    const labelWidth=label?.offsetWidth||0;
    wrap.scrollLeft=Math.max(0,today.offsetLeft-labelWidth-12);
  });
}
function expandTodayColumn(wrap) {
  if (!wrap) return;
  requestAnimationFrame(() => {
    const grid = wrap.querySelector(".gantt-grid"), today = grid?.querySelector(".day.today");
    if (!grid || !today) return;
    const column = parseInt(today.style.gridColumn, 10), tracks = getComputedStyle(grid).gridTemplateColumns.split(" ");
    if (!column || tracks.length < column) return;
    tracks[column - 1] = `${Math.max(62, today.offsetWidth)}px`;
    grid.style.gridTemplateColumns = tracks.join(" ");
    grid.querySelectorAll(".gantt-cell").forEach(cell=>cell.classList.toggle("today-column",parseInt(cell.style.gridColumn,10)===column));
  });
}
function clipTimelineBars(wrap) {
  const grid=wrap?.querySelector(".gantt-grid");if(!grid)return;
  const lastColumn=Number(getComputedStyle(grid).getPropertyValue("--days"))+1;
  grid.querySelectorAll(".bar").forEach(bar=>{const match=bar.style.gridColumn.match(/^(-?\d+)\s*\/\s*span\s*(\d+)/);if(!match)return;const start=Number(match[1]),span=Number(match[2]),end=start+span-1;if(end<2||start>lastColumn){bar.hidden=true;return;}const clippedStart=Math.max(2,start),clippedEnd=Math.min(lastColumn,end);bar.style.gridColumn=`${clippedStart} / span ${clippedEnd-clippedStart+1}`;});
}
function setMobileView(section, view) {
  section.classList.toggle("show-mobile-timeline", view === "timeline");
  section.querySelectorAll("[data-mobile-view]").forEach(button => { const active = button.dataset.mobileView === view; button.classList.toggle("active", active); button.setAttribute("aria-pressed", active); });
  if (view === "timeline") scrollTimelineToToday(section.querySelector(".gantt-wrap"));
}
function emptyPanel(title, copy) { return `<div class="empty-panel"><div>⌁</div><h3>${title}</h3><p>${copy}</p><button class="primary empty-add">＋ Add first child</button></div>`; }
function renderGantt() {
  const tasks = hierarchicalTasks(taskItems()), scheduledTasks=tasks.filter(task=>task.start&&task.end);
  if(isAndroid()){renderAndroidTree($("gantt"),[project()],tasks,false);return;}
  if (!project().tasks.length) { $("gantt").innerHTML = emptyPanel("Your timeline is ready", "Add a child with start and end dates to build your Gantt chart."); wireEmptyButtons(); return; }
  if (!tasks.length) { $("gantt").innerHTML = `<div class="empty-panel"><h3>No matching children</h3><p>Try changing your search or filter.</p></div>`; return; }
  const today = todayIso(), minTask = scheduledTasks.map(t => t.start).sort()[0]||today, maxTask = scheduledTasks.map(t => t.end).sort().at(-1)||addDays(today,30);
  const firstDate = [minTask, today].sort()[0], lastDate = [maxTask, today].sort().at(-1), start = parseDate(addDays(firstDate, -3)), end = parseDate(addDays(lastDate, 10)), days = dayDiff(toIso(start), toIso(end)) + 1, width = Math.round(25 * state.zoom);
  let html = `<div class="gantt-grid ${state.blockView?"block-view":""}" data-chart-start="${toIso(start)}" style="--days:${days};--day-width:${width}px"><div class="gantt-corner" style="grid-column:1;grid-row:1 / span 2">CHILD / OWNER</div>`;
  let cursor = new Date(start);
  while (cursor <= end) { const month = cursor.getMonth(), year = cursor.getFullYear(), offset = dayDiff(toIso(start), toIso(cursor)); let span = 0; while (cursor <= end && cursor.getMonth() === month) { span++; cursor.setDate(cursor.getDate() + 1); } html += `<div class="month" style="grid-column:${offset + 2} / span ${span};grid-row:1">${new Intl.DateTimeFormat("en-US", {month:"long", year:"numeric"}).format(new Date(year, month, 1))}</div>`; }
  for (let i = 0; i < days; i++) { const d = new Date(start); d.setDate(d.getDate() + i); html += `<div class="day ${[0,6].includes(d.getDay()) ? "weekend" : ""} ${toIso(d) === today ? "today" : ""}" style="grid-column:${i + 2};grid-row:2">${d.getDate()}<small>${toIso(d) === today ? "TODAY" : ["S","M","T","W","T","F","S"][d.getDay()]}</small></div>`; }
  if (!scheduledTasks.length && !tasks.length) {
    const row = 3;
    html += `<div class="task-label gantt-drop-label" style="grid-column:1;grid-row:${row}"><span>Drop task on a date</span></div>`;
    for (let i=0;i<days;i++) { const d=new Date(start); d.setDate(d.getDate()+i); html += `<div class="gantt-cell ${[0,6].includes(d.getDay()) ? "weekend" : ""}" style="grid-column:${i+2};grid-row:${row}"></div>`; }
  }
  tasks.forEach((task, index) => { const row = index + 3, depth = taskDepth(task);
    html += `<div class="task-label node-depth-${depth}" data-task="${task.id}" style="grid-column:1;grid-row:${row}"><button class="row-edit ${hasWriting(task.notes)?"has-writing":""}" data-edit-task="${task.id}" data-edit-parent="${state.activeProjectId}" aria-label="Edit ${esc(task.name)}" title="Edit node">✎</button><button class="row-title" data-write-task="${task.id}" data-write-parent="${state.activeProjectId}" title="Open document"><b>${esc(task.name)}</b></button>${depth===0?`<button class="row-add-child" data-add-child="${task.id}" title="Add subtask" aria-label="Add subtask to ${esc(task.name)}">＋</button>`:""}</div>`;
    for (let i=0;i<days;i++) { const d=new Date(start); d.setDate(d.getDate()+i); html += `<div class="gantt-cell ${[0,6].includes(d.getDay()) ? "weekend" : ""}" style="grid-column:${i+2};grid-row:${row}"></div>`; }
    if(task.start&&task.end){const offset=dayDiff(toIso(start),task.start),duration=dayDiff(task.start,task.end)+1;html += `<button class="bar ${statusClass(task.status)}" data-bar="${task.id}" style="grid-column:${offset+2} / span ${duration};grid-row:${row}">${esc(task.name)}</button>`;}
  });
  $("gantt").innerHTML = html + `</div>`; clipTimelineBars($("gantt")); wireTaskButtons(); wireDrag(width); markTruncatedBars(); expandTodayColumn($("gantt")); scrollTimelineToToday($("gantt"));
}
function wireEmptyButtons() { document.querySelectorAll(".empty-add").forEach(button => button.onclick = () => openTask()); }
function wireTaskButtons() { wireWritingRows(); }

function chartAction(label, className, title, data = {}) {
  const button = document.createElement("button");
  button.type = "button"; button.className = `row-action ${className}`; button.textContent = label; button.title = title; button.setAttribute("aria-label", title);
  Object.entries(data).forEach(([key,value]) => button.dataset[key] = value);
  return button;
}
function closeChartContextMenus() {
  document.querySelectorAll(".row-actions.context-open").forEach(menu => {
    menu.classList.remove("context-open"); menu.style.left=""; menu.style.top="";
    if(menu._contextOwner?.isConnected)menu._contextOwner.append(menu);else menu.remove();
  });
}
function openChartContextMenu(event, menu) {
  event.preventDefault(); event.stopPropagation(); closeChartContextMenus();
  menu._contextOwner=event.currentTarget;
  document.body.append(menu);
  menu.classList.add("context-open");
  const bounds=menu.getBoundingClientRect(),gap=8;
  menu.style.left=`${Math.max(gap,Math.min(event.clientX,window.innerWidth-bounds.width-gap))}px`;
  menu.style.top=`${Math.max(gap,Math.min(event.clientY,window.innerHeight-bounds.height-gap))}px`;
}
function decorateChartRows() {
  document.querySelectorAll(".task-label").forEach(row => {
    if (row.querySelector(".row-actions")) return;
    const projectId = row.dataset.homeProject || row.dataset.homeParent || state.activeProjectId;
    const taskId = row.dataset.homeTask || row.dataset.task;
    if (!projectId || (!taskId && !row.dataset.homeProject)) return;
    const datedNode=taskId?state.projects.find(item=>item.id===projectId)?.tasks.find(item=>item.id===taskId):state.projects.find(item=>item.id===projectId);row.classList.toggle("past-node",isPastNode(datedNode));
    const actions = document.createElement("span"); actions.className = "row-actions";
    const edit = row.querySelector(".row-edit");
    let scheduledItem;
    const urlKey = taskId ? `task:${projectId}:${taskId}` : `project:${projectId}`;
    if (!taskId) {
      scheduledItem = state.projects.find(item=>item.id===projectId);
      row.classList.add("tree-level-1");
      actions.append(chartAction("Document", `document ${hasWriting(scheduledItem.description)?"has-content":""}`, "Open project document", { openDocument:"project", documentProject:projectId }));
      actions.append(chartAction("URLs", "url", "Manage URL links", { openUrls:urlKey, urlTitle:scheduledItem.name }));
      actions.append(chartAction("Log", "log", "Open parent log", { openLog:`project:${projectId}`, logTitle:scheduledItem.name }));
      if (edit) actions.append(edit);
      actions.append(chartAction("Add child", "add", "Add child", { addRoot:projectId }));
      actions.append(chartAction("Delete", "delete", "Delete parent", { deleteProjectRow:projectId }));
    } else {
      const task = state.projects.find(item=>item.id===projectId)?.tasks.find(item=>item.id===taskId);
      scheduledItem = task;
      const depth=taskDepth(task,state.projects.find(item=>item.id===projectId)?.tasks||[]), hasChildren=state.projects.find(item=>item.id===projectId)?.tasks.some(item=>item.parentId===taskId);
      row.classList.add(`tree-level-${depth+2}`);
      if(hasChildren){const toggle=chartAction(state.collapsedTasks.has(taskId)?"›":"⌄","node-toggle",state.collapsedTasks.has(taskId)?"Expand children":"Collapse children",{toggleTask:taskId,toggleHome:row.dataset.homeTask?"1":""});row.insertBefore(toggle,row.querySelector(".row-title"));}
      actions.append(chartAction("Document", `document ${hasWriting(task?.notes)?"has-content":""}`, "Open node document", { openDocument:"task", documentProject:projectId, documentTask:taskId }));
      actions.append(chartAction("URLs", "url", "Manage URL links", { openUrls:urlKey, urlTitle:task.name }));
      actions.append(chartAction("Log", "log", "Open child log", { openLog:`task:${projectId}:${taskId}`, logTitle:task.name }));
      if (edit) actions.append(edit);
      if (task && depth < 2) actions.append(chartAction("Add child", "add", "Add child", { addChild:taskId, addChildProject:projectId }));
      actions.append(chartAction("Delete", "delete", "Delete node", { deleteTaskRow:taskId, deleteParent:projectId }));
    }
    if(scheduledItem?.start){const distance=dayDiff(todayIso(),scheduledItem.start);if(distance>=0){const countdown=document.createElement("span");countdown.className="node-start-countdown";countdown.textContent=String(distance);countdown.title=distance===0?"Starts today":`Starts in ${distance} day${distance===1?"":"s"}`;row.querySelector(".row-title")?.append(countdown);}}
    row.append(actions);
    row.oncontextmenu=event=>openChartContextMenu(event,actions);
  });
}
function wireWritingRows() {
  decorateChartRows();
  document.querySelectorAll(".task-label[data-home-task],.task-label[data-task]").forEach(row=>{
    row.draggable=true;
    row.ondragstart=event=>{const taskId=row.dataset.homeTask||row.dataset.task,projectId=row.dataset.homeParent||state.activeProjectId;if(!taskId||!projectId){event.preventDefault();return;}event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("application/x-northstar-task",JSON.stringify({projectId,taskId}));event.dataTransfer.setData("text/plain",taskId);const blank=document.createElement("canvas");blank.width=blank.height=1;event.dataTransfer.setDragImage(blank,0,0);row.classList.add("dragging-node");};
    row.ondragend=()=>{row.classList.remove("dragging-node");document.querySelectorAll(".task-drop-target").forEach(cell=>cell.classList.remove("task-drop-target"));document.querySelector(".drag-date-preview")?.remove();};
  });
  document.querySelectorAll("[data-edit-task]").forEach(button => button.onclick = event => { event.stopPropagation(); state.activeProjectId = button.dataset.editParent; persist(); render(); openTask(button.dataset.editTask); });
  document.querySelectorAll("[data-edit-project]").forEach(button => button.onclick = event => { event.stopPropagation(); openProject(button.dataset.editProject); });
  document.querySelectorAll("[data-write-task]").forEach(button => button.onclick = event => { event.stopPropagation(); openWriting("task", button.dataset.writeParent, button.dataset.writeTask); });
  document.querySelectorAll("[data-write-project]").forEach(button => button.onclick = event => { event.stopPropagation(); openProjectView(button.dataset.writeProject); });
  document.querySelectorAll("[data-add-root]").forEach(button => button.onclick = event => { event.stopPropagation(); state.activeProjectId=button.dataset.addRoot; persist(); render(); openTask(); });
  document.querySelectorAll("[data-add-child]").forEach(button => button.onclick = event => { event.stopPropagation(); if(button.dataset.addChildProject)state.activeProjectId=button.dataset.addChildProject; openTask(null, null, button.dataset.addChild); });
  document.querySelectorAll("[data-open-document]").forEach(button => button.onclick = event => { event.stopPropagation(); openWriting(button.dataset.openDocument, button.dataset.documentProject, button.dataset.documentTask || ""); });
  document.querySelectorAll("[data-open-urls]").forEach(button => button.onclick = event => { event.stopPropagation(); closeChartContextMenus(); openNodeUrls(button.dataset.openUrls,button.dataset.urlTitle); });
  document.querySelectorAll("[data-open-log]").forEach(button=>button.onclick=event=>{event.stopPropagation();closeChartContextMenus();openNodeLog(button.dataset.openLog,button.dataset.logTitle);});
  document.querySelectorAll("[data-delete-project-row]").forEach(button => button.onclick = event => { event.stopPropagation(); const item=state.projects.find(p=>p.id===button.dataset.deleteProjectRow); if(item)askDelete("project",item); });
  document.querySelectorAll("[data-delete-task-row]").forEach(button => button.onclick = event => { event.stopPropagation(); state.activeProjectId=button.dataset.deleteParent; const item=project()?.tasks.find(t=>t.id===button.dataset.deleteTaskRow); if(item)askDelete("task",item); });
  document.querySelectorAll("[data-toggle-task]").forEach(button=>button.onclick=event=>{event.stopPropagation();const id=button.dataset.toggleTask,projectId=button.closest("[data-home-parent]")?.dataset.homeParent||state.activeProjectId,parent=state.projects.find(item=>item.id===projectId);state.visibleHierarchyLevel=0;state.shallowExpandedProjects.delete(projectId);if(state.collapsedTasks.has(id)){state.collapsedTasks.delete(id);parent?.tasks.filter(task=>task.parentId===id&&parent.tasks.some(child=>child.parentId===task.id)).forEach(task=>state.collapsedTasks.add(task.id));}else state.collapsedTasks.add(id);button.dataset.toggleHome?renderHomeGantt():renderGantt();});
  document.querySelectorAll("[data-home-toggle]").forEach(button=>button.addEventListener("click",()=>{const id=button.dataset.homeToggle;if(state.homeCollapsedProjects.has(id))state.shallowExpandedProjects.add(id);state.visibleHierarchyLevel=0;document.querySelectorAll("[data-hierarchy-level]").forEach(control=>control.classList.remove("active"));},true));
}
function openWriting(type, projectId, taskId = "") {
  const p = state.projects.find(item => item.id === projectId), task = p?.tasks.find(item => item.id === taskId), item = type === "task" ? task : p; if (!item) return;
  $("writingType").value = type; $("writingProjectId").value = projectId; $("writingTaskId").value = taskId; $("writingLabel").textContent = type === "task" ? "TASK NOTES" : "PROJECT NOTES"; $("writingTitle").textContent = item.name; $("writingEditor").innerHTML = linkifyDocumentHtml(type === "task" ? (task.notes || "") : (p.description || "")); $("writingModal").hidden = false; setTimeout(() => $("writingEditor").focus(), 30);
}
function updateMobileDrag(bar, item, shift) {
  if (!matchMedia("(max-width:620px)").matches || !item) return;
  let bubble = $("mobileDragDate");
  if (!bubble) { bubble = document.createElement("div"); bubble.id = "mobileDragDate"; bubble.className = "mobile-drag-date"; document.body.appendChild(bubble); }
  const start = addDays(item.start, shift), end = addDays(item.end, shift);
  bubble.textContent = `${formatDate(start)}${start === end ? "" : ` – ${formatDate(end)}`}`;
  bubble.classList.add("show"); bar.classList.add("dragging");
  const grid = bar.closest(".gantt-grid"), targetColumn = dayDiff(grid.dataset.chartStart, start) + 2;
  grid.querySelectorAll(".day.drag-target").forEach(day => day.classList.remove("drag-target"));
  [...grid.querySelectorAll(".day")].find(day => parseInt(day.style.gridColumn, 10) === targetColumn)?.classList.add("drag-target");
}
function finishMobileDrag(bar) {
  bar.classList.remove("dragging"); $("mobileDragDate")?.classList.remove("show");
  bar.closest(".gantt-grid")?.querySelectorAll(".day.drag-target").forEach(day => day.classList.remove("drag-target"));
}
function autoScrollMobileTimeline(bar, clientX) {
  if (!matchMedia("(max-width:620px)").matches) return;
  const wrap = bar.closest(".gantt-wrap"), rect = wrap?.getBoundingClientRect(); if (!wrap || !rect) return;
  if (clientX > rect.right - 36) wrap.scrollLeft += 12; else if (clientX < rect.left + 186) wrap.scrollLeft -= 12;
}
function wireDrag(dayWidth) {
  document.querySelectorAll("[data-bar]").forEach(bar => { let startX, startScroll, moved = false, task;
    bar.onpointerdown = event => { event.preventDefault(); startX = event.clientX; startScroll = bar.closest(".gantt-wrap").scrollLeft; moved = false; task = project().tasks.find(t => t.id === bar.dataset.bar); bar.setPointerCapture(event.pointerId); updateMobileDrag(bar, task, 0); };
    bar.onpointermove = event => { if (startX == null) return; const dx = event.clientX - startX + bar.closest(".gantt-wrap").scrollLeft - startScroll, shift = Math.round(dx/dayWidth); moved ||= Math.abs(dx) > 4; bar.style.transform = `translateX(${shift*dayWidth}px)`; updateMobileDrag(bar, task, shift); autoScrollMobileTimeline(bar, event.clientX); };
    bar.onpointerup = event => { const dx = event.clientX - startX + bar.closest(".gantt-wrap").scrollLeft - startScroll, shift = Math.round(dx/dayWidth); bar.style.transform=""; startX=null; finishMobileDrag(bar); if (moved) { if (shift) { task.start=addDays(task.start,shift); task.end=addDays(task.end,shift); resetToHomeView(); persist(); render(); toast("Task rescheduled"); } } else openWriting("task", state.activeProjectId, task.id); };
    bar.onpointercancel = () => { bar.style.transform=""; startX=null; finishMobileDrag(bar); };
  });
}
function wireHomeDrag(dayWidth) {
  document.querySelectorAll("[data-home-bar],[data-project-bar]").forEach(bar => { let startX, startScroll, moved = false, item;
    bar.onpointerdown = event => { event.preventDefault(); startX = event.clientX; startScroll = bar.closest(".gantt-wrap").scrollLeft; moved = false; item = bar.dataset.homeBar ? taskForBar(bar) : state.projects.find(p => p.id === bar.dataset.projectBar); bar.setPointerCapture(event.pointerId); updateMobileDrag(bar, item, 0); };
    bar.onpointermove = event => { if (startX == null) return; const dx = event.clientX - startX + bar.closest(".gantt-wrap").scrollLeft - startScroll, shift = Math.round(dx/dayWidth); moved ||= Math.abs(dx) > 4; bar.style.transform = `translateX(${shift*dayWidth}px)`; updateMobileDrag(bar, item, shift); autoScrollMobileTimeline(bar, event.clientX); };
    bar.onpointerup = event => { if (startX == null) return; const dx = event.clientX - startX + bar.closest(".gantt-wrap").scrollLeft - startScroll, shift = Math.round(dx/dayWidth); bar.style.transform = ""; startX = null; finishMobileDrag(bar); if (moved) { if (shift && item) { item.start = addDays(item.start, shift); item.end = addDays(item.end, shift); resetToHomeView(); persist(); render(); toast(`${bar.dataset.homeBar ? "Task" : "Project"} rescheduled`); } } else if (bar.dataset.homeBar) openWriting("task", bar.dataset.homeParent, bar.dataset.homeBar); else openWriting("project", bar.dataset.projectBar); };
    bar.onpointercancel = () => { bar.style.transform = ""; startX = null; finishMobileDrag(bar); };
  });
}

function openProject(id = null, selectedDate = null) {
  $("sidebar").classList.remove("open");
  const p = state.projects.find(item => item.id === id); state.color = p?.color || "#dbe88f";
  $("projectId").value = p?.id || ""; $("projectNameInput").value = p?.name || ""; $("projectDescriptionInput").value = ""; $("projectStart").value = p?.start || selectedDate || ""; $("projectEnd").value = p?.end || selectedDate || "";
  $("projectModalLabel").textContent = p ? "PARENT SETTINGS" : "NEW PARENT"; $("projectModalTitle").textContent = p ? "Edit parent" : "Create a parent";
  document.querySelectorAll("[data-color]").forEach(b => b.classList.toggle("selected", b.dataset.color === state.color)); $("projectModal").hidden = false; setTimeout(() => $("projectNameInput").focus(), 30);
}
function openTask(id = null, selectedDate = null, parentId = "") {
  $("sidebar").classList.remove("open");
  const task = project()?.tasks.find(item => item.id === id); $("taskForm").reset(); $("taskId").value = task?.id || ""; $("taskNameInput").value = task?.name || ""; $("taskStatus").value = task?.status || "To do"; $("taskOwner").value = task?.owner || ""; $("taskStart").value = task?.start || selectedDate || ""; $("taskEnd").value = task?.end || selectedDate || ""; $("taskNotes").value = "";
  const allProjectTasks=project()?.tasks||[], eligibleParents = allProjectTasks.filter(item => item.id !== id && taskDepth(item,allProjectTasks)<2 && !taskHasAncestor(item,id,allProjectTasks));
  $("taskParent").innerHTML = `<option value="">Parent (top level)</option>${eligibleParents.map(item=>`<option value="${item.id}">${esc(item.name)}</option>`).join("")}`;
  $("taskParent").value = task?.parentId || parentId || "";
  $("taskModalLabel").textContent = task ? "TASK DETAILS" : "NEW TASK"; $("taskModalTitle").textContent = task ? "Edit task" : "Add a task"; $("deleteTask").hidden = !task; $("taskModal").hidden = false; setTimeout(() => $("taskNameInput").focus(), 30);
}
function closeModals() { document.querySelectorAll(".backdrop").forEach(modal => modal.hidden = true); }
function toast(message) { $("toast").textContent = message; $("toast").classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => $("toast").classList.remove("show"), 1800); }
function taskForBar(bar) { const id = bar.dataset.bar || bar.dataset.homeBar; const projectId = bar.dataset.homeParent || state.activeProjectId; return state.projects.find(p => p.id === projectId)?.tasks.find(t => t.id === id); }
function markTruncatedBars() { requestAnimationFrame(() => document.querySelectorAll(".bar").forEach(bar => { const task = taskForBar(bar); if (!task) return; const distance = dayDiff(todayIso(), task.start), timing = distance === 0 ? "today" : distance > 0 ? `in ${distance} day${distance === 1 ? "" : "s"}` : `${Math.abs(distance)} day${Math.abs(distance) === 1 ? "" : "s"} ago`, label = `${task.name} · ${timing}`; bar.classList.remove("show-balloon"); bar.textContent = label; bar.dataset.balloon = label; if (bar.scrollWidth > bar.clientWidth + 1) bar.classList.add("show-balloon"); })); }
function createTaskFromCell(cell) {
  const grid = cell.closest(".gantt-grid"), column = parseInt(cell.style.gridColumn, 10), row = parseInt(cell.style.gridRow, 10); if (!grid?.dataset.chartStart || !column) return;
  const selectedDate = addDays(grid.dataset.chartStart, column - 2); if(cell.dataset.projectCell){openProject(cell.dataset.projectCell,selectedDate);return;} let projectId = state.activeProjectId;
  if (grid.classList.contains("home-grid")) { const parents = [...grid.querySelectorAll("[data-home-project]")].filter(label => parseInt(label.style.gridRow, 10) <= row).sort((a,b) => parseInt(b.style.gridRow,10) - parseInt(a.style.gridRow,10)); projectId = parents[0]?.dataset.homeProject; }
  if (!projectId) return; state.activeProjectId = projectId; persist(); render(); openTask(null, selectedDate);
}
function showCellTooltip(cell) {
  const grid = cell.closest(".gantt-grid"), column = parseInt(cell.style.gridColumn, 10); if (!grid?.dataset.chartStart || !column) return;
  const value = addDays(grid.dataset.chartStart, column - 2), row = parseInt(cell.style.gridRow, 10), rowBars = [...grid.querySelectorAll(".bar")].filter(bar => parseInt(bar.style.gridRow, 10) === row);
  const currentDateInfo = () => { const distance = dayDiff(todayIso(), value); return distance === 0 ? "Today" : distance > 0 ? `In ${distance} day${distance === 1 ? "" : "s"} from today` : `${Math.abs(distance)} day${Math.abs(distance) === 1 ? "" : "s"} before today`; };
  const candidates = rowBars.map(bar => taskForBar(bar)).filter(task => task && task.end >= value).sort((a,b) => a.start.localeCompare(b.start)), task = candidates[0];
  let relative;
  if (!task) relative = currentDateInfo();
  else if (value < task.start) { const days = dayDiff(value, task.start); relative = `${days} day${days === 1 ? "" : "s"} until ${task.name}`; }
  else relative = `${task.name} is active`;
  const tip = $("cellTooltip"); tip.innerHTML = `<strong>${formatDate(value)}</strong><span>${relative}</span>`; tip.hidden = false; const rect = cell.getBoundingClientRect(), box = tip.getBoundingClientRect(); let left = rect.left + rect.width/2 - box.width/2, top = rect.top - box.height - 8; left = Math.max(8, Math.min(left, window.innerWidth-box.width-8)); if(top<8) top=rect.bottom+8; tip.style.left=`${left}px`;tip.style.top=`${top}px`;
}
function hideCellTooltip() { $("cellTooltip").hidden = true; }
function showChartTaskTooltip(element) {
  const textElement = element.matches(".task-label") ? element.querySelector("b") : element;
  const blockView = !!element.closest(".gantt-grid.block-view");
  if (!textElement || (!blockView && textElement.scrollWidth <= textElement.clientWidth + 1)) return;
  const task = element.dataset.projectBar
    ? state.projects.find(item => item.id === element.dataset.projectBar)
    : element.matches("[data-bar],[data-home-bar]")
      ? taskForBar(element)
    : element.dataset.task
      ? project()?.tasks.find(item => item.id === element.dataset.task)
      : state.projects.find(item => item.id === element.dataset.homeParent)?.tasks.find(item => item.id === element.dataset.homeTask);
  if (!task) return;
  const tip = $("cellTooltip");
  if(blockView){const distance=dayDiff(todayIso(),task.start),timing=distance===0?"Today":distance>0?`${distance} day${distance===1?"":"s"} from today`:`${Math.abs(distance)} day${Math.abs(distance)===1?"":"s"} ago`;tip.innerHTML=`<strong>${esc(task.name)}</strong><span>${timing}</span>`;}else tip.textContent = task.name;
  tip.classList.remove("side-task-tooltip");
  tip.classList.add("chart-task-tooltip");
  tip.classList.toggle("block-tooltip",blockView);
  tip.hidden = false;
  const rect = element.getBoundingClientRect(), box = tip.getBoundingClientRect();
  let left = rect.right - box.width, top = rect.top + (rect.height - box.height) / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8));
  top = Math.max(8, Math.min(top, window.innerHeight - box.height - 8));
  tip.style.left = `${left}px`; tip.style.top = `${top}px`;
}
function hideChartTaskTooltip() { const tip = $("cellTooltip"); tip.classList.remove("chart-task-tooltip","block-tooltip"); tip.hidden = true; }
function nodeContentTypes(projectId, taskId = "") {
  const parent = state.projects.find(item => item.id === projectId), item = taskId ? parent?.tasks.find(task => task.id === taskId) : parent;
  if (!item) return [];
  const logKey = taskId ? `task:${projectId}:${taskId}` : `project:${projectId}`;
  const types = [];
  if (hasWriting(taskId ? item.notes : item.description)) types.push("Doc");
  if ((loadNodeLogs()[logKey] || []).some(entry => String(entry.text || "").trim())) types.push("Log");
  return types;
}
function showNodeContentTooltip(element) {
  const projectId = element.dataset.homeProject || element.dataset.homeParent || element.dataset.parentProject || state.activeProjectId;
  const taskId = element.dataset.homeTask || element.dataset.task || element.dataset.sideTask || "";
  const types = nodeContentTypes(projectId, taskId);
  if (!types.length) return;
  const tip = $("cellTooltip");
  tip.textContent = types.join(" · ");
  tip.classList.remove("side-task-tooltip", "chart-task-tooltip");
  tip.classList.add("node-content-tooltip");
  tip.hidden = false;
  const rect = element.getBoundingClientRect(), box = tip.getBoundingClientRect();
  const inset = 7;
  let left = Math.max(rect.left + inset, rect.right - box.width - inset), top = rect.top + (rect.height - box.height) / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - box.height - 8));
  tip.style.left = `${left}px`; tip.style.top = `${top}px`;
}
function hideNodeContentTooltip() { const tip = $("cellTooltip"); tip.classList.remove("node-content-tooltip"); tip.hidden = true; }
function selectDesktopTimelineRow(label) {
  const grid=label.closest(".gantt-grid"),row=parseInt(label.style.gridRow,10);if(!grid||!Number.isFinite(row))return;
  const deselect=label.classList.contains("timeline-row-selected");
  document.querySelectorAll(".timeline-row-selected").forEach(element=>element.classList.remove("timeline-row-selected"));
  if(deselect)return;
  [...grid.children].filter(element=>parseInt(element.style.gridRow,10)===row).forEach(element=>element.classList.add("timeline-row-selected"));
}
function showSideTaskTooltip(button) {
  const tip = $("cellTooltip"), name = button.textContent.trim();
  tip.textContent = name; tip.classList.add("side-task-tooltip"); tip.hidden = false;
  const rect = button.getBoundingClientRect(), box = tip.getBoundingClientRect(), chart = document.querySelector(".gantt-wrap:not([hidden])") || document.querySelector("main");
  let left = chart?.getBoundingClientRect().left ?? rect.right, top = rect.top + (rect.height - box.height) / 2;
  if (left + box.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - box.width - 8);
  top = Math.max(8, Math.min(top, window.innerHeight - box.height - 8));
  tip.style.left = `${left}px`; tip.style.top = `${top}px`;
}
function hideSideTaskTooltip() { const tip = $("cellTooltip"); tip.classList.remove("side-task-tooltip"); tip.hidden = true; }
function askDelete(type, item) { state.pendingDelete = { type, item }; const label=type==="project"?"parent":"child";$("confirmTitle").textContent = `Delete ${label}?`; $("confirmText").textContent = type === "project" ? `“${item.name}” and all of its children will be permanently deleted.` : `“${item.name}” will be permanently deleted.`; $("confirm").hidden = false; }

async function loadRemoteWorkspace() {
  setSyncStatus("Loading from Supabase…");
  const [projectsResult, tasksResult] = await Promise.all([
    supabaseClient.from("northstar_projects").select("*").order("sort_order"),
    supabaseClient.from("northstar_tasks").select("*").order("sort_order")
  ]);
  const error = projectsResult.error || tasksResult.error;
  if (error) { setSyncStatus("Supabase setup needed"); console.error(error); toast("Run supabase-schema.sql first"); return; }
  if (projectsResult.data.length) {
    const localParents=new Map(state.projects.flatMap(p=>p.tasks.filter(t=>t.parentId).map(t=>[t.id,t.parentId]))); let recoveredLocalHierarchy=false;
    state.projects = projectsResult.data.map(p => ({ id:p.id, name:p.name, description:p.description, color:p.color, start:p.start_date || "", end:p.end_date || "", tasks:tasksResult.data.filter(t => t.project_id === p.id).map(t => {const raw={id:t.id,name:t.name,status:t.status,owner:t.owner,start:t.start_date||"",end:t.end_date||"",notes:t.notes,parentId:t.parent_id||null,sortOrder:t.sort_order}, decoded=decodeTaskHierarchy(raw,localParents.get(t.id));if(!raw.parentId&&!raw.notes?.match(PARENT_META)&&localParents.has(t.id))recoveredLocalHierarchy=true;return decoded;}) }));
    state.activeProjectId = null; applyOpeningExpansion(); localStorage.setItem(STORAGE_KEY, JSON.stringify(workspacePayload())); remoteReady = true; setSyncStatus("Synced with Supabase"); render(); if(recoveredLocalHierarchy)scheduleRemoteSync();
  } else if (state.projects.length) {
    setSyncStatus("Local data awaiting backup"); $("migrationModal").hidden = false;
  } else { remoteReady = true; setSyncStatus("Synced with Supabase"); }
}
async function applySession(session) {
  currentUser = session?.user || null; remoteReady = false;
  $("connectButton").hidden = !!currentUser; $("signOutButton").hidden = !currentUser;
  if (currentUser) await loadRemoteWorkspace(); else setSyncStatus("Saved on this device");
}
function setupSupabase() {
  $("connectButton").onclick = () => { $("authMessage").textContent = supabaseClient ? "" : "Supabase could not be loaded."; $("authModal").hidden = false; $("authEmail").focus(); };
  document.querySelectorAll("[data-auth-close]").forEach(b => b.onclick = () => $("authModal").hidden = true);
  $("forgotPasswordButton").onclick = async () => { const email = $("authEmail").value.trim(); if (!email) { $("authMessage").textContent = "Enter your email address first."; $("authEmail").focus(); return; } if (!supabaseClient) return; $("forgotPasswordButton").disabled = true; $("authMessage").textContent = "Sending reset email…"; const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo:"https://esemmelman.github.io/pm/" }); $("forgotPasswordButton").disabled = false; $("authMessage").textContent = error ? error.message : "Check your email for a password reset link."; };
  $("authModeButton").onclick = () => { authMode = authMode === "signin" ? "signup" : "signin"; $("authSubmit").textContent = authMode === "signin" ? "Sign in" : "Create account"; $("authModeButton").textContent = authMode === "signin" ? "Create account" : "Use existing account"; };
  $("authForm").onsubmit = async event => { event.preventDefault(); if (!supabaseClient) return; $("authMessage").textContent = "Connecting…"; const credentials = { email:$("authEmail").value.trim(), password:$("authPassword").value }; const result = authMode === "signup" ? await supabaseClient.auth.signUp(credentials) : await supabaseClient.auth.signInWithPassword(credentials); if (result.error) $("authMessage").textContent = result.error.message; else { $("authModal").hidden = true; $("authMessage").textContent = ""; if (authMode === "signup" && !result.data.session) toast("Check your email to confirm your account"); } };
  $("signOutButton").onclick = () => supabaseClient?.auth.signOut();
  $("migrationLater").onclick = () => $("migrationModal").hidden = true;
  $("migrationStart").onclick = async () => { const button = $("migrationStart"); button.disabled = true; const backupTime = downloadBackup(); setSyncStatus("Uploading backup…"); const { error } = await supabaseClient.rpc("northstar_replace_workspace", { payload:workspacePayload(), backup_time:backupTime }); button.disabled = false; if (error) { setSyncStatus("Migration failed; local data kept"); toast(error.message); return; } remoteReady = true; $("migrationModal").hidden = true; setSyncStatus("Synced with Supabase"); toast("Backup downloaded and data migrated"); };
  $("passwordResetForm").onsubmit = async event => { event.preventDefault(); const password = $("newPassword").value, confirmation = $("confirmNewPassword").value; if (password !== confirmation) { $("passwordResetMessage").textContent = "The passwords do not match."; return; } const button = $("passwordResetSubmit"); button.disabled = true; $("passwordResetMessage").textContent = "Updating password…"; const { error } = await supabaseClient.auth.updateUser({ password }); button.disabled = false; if (error) { $("passwordResetMessage").textContent = error.message; return; } $("passwordResetModal").hidden = true; $("passwordResetForm").reset(); toast("Password updated. You are signed in."); };
  if (supabaseClient) { supabaseClient.auth.onAuthStateChange((event, session) => { if (event === "PASSWORD_RECOVERY") { $("authModal").hidden = true; $("passwordResetMessage").textContent = ""; $("passwordResetModal").hidden = false; setTimeout(() => $("newPassword").focus(), 30); } setTimeout(() => applySession(session), 0); }); supabaseClient.auth.getSession().then(({data}) => applySession(data.session)); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && currentUser && !syncTimer) loadRemoteWorkspace(); });
}

function setup() {
  load();
  document.body.classList.toggle("android-tree-mode",isAndroid());
  document.querySelectorAll(".app-version").forEach(element => element.textContent = `v${APP_VERSION}`);
  setupSupabase();
  $("sideAddProject").onclick = () => openProject();
  $("ganttHomeButton").onclick = () => { state.activeProjectId = null; if (state.homeCollapsedProjects.size) state.homeCollapsedProjects.clear(); else state.homeCollapsedProjects = new Set(state.projects.map(p => p.id)); $("searchInput").value = ""; persist(); render(); $("sidebar").classList.remove("open"); };
  $("projectAddTask").onclick = () => openTask();
  $("editProject").onclick = () => openProject(project().id); $("projectMenu").onclick = () => $("projectMenuPopup").hidden = !$("projectMenuPopup").hidden;
  $("deleteProject").onclick = () => { $("projectMenuPopup").hidden = true; askDelete("project", project()); };
  document.querySelectorAll("[data-close]").forEach(button => button.onclick = closeModals);
  document.querySelectorAll(".backdrop").forEach(modal => modal.onclick = e => { if (e.target === modal) closeModals(); });
  document.querySelectorAll("[data-color]").forEach(button => button.onclick = () => { state.color = button.dataset.color; document.querySelectorAll("[data-color]").forEach(b => b.classList.toggle("selected", b === button)); });
  document.querySelectorAll("[data-format]").forEach(button => button.onclick = () => { $("writingEditor").focus(); document.execCommand(button.dataset.format, false); });
  $("logAddRow").onclick=()=>addLogRow();
  $("logForm").onsubmit=event=>{event.preventDefault();const logs=loadNodeLogs(),key=$("logNodeKey").value;logs[key]=[...$("logRows").querySelectorAll(".log-row")].map(row=>({date:row.querySelector("input").value,text:row.querySelector("textarea").value.trim()})).filter(entry=>entry.date||entry.text);localStorage.setItem(LOG_STORAGE_KEY,JSON.stringify(logs));closeModals();toast("Log saved");};
  $("urlAddRow").onclick=()=>addUrlRow();
  $("urlForm").onsubmit=event=>{event.preventDefault();const urls=loadNodeUrls(),key=$("urlNodeKey").value,entries=[];for(const row of $("urlRows").querySelectorAll(".url-row")){const label=row.querySelector('input[type="text"]').value.trim(),raw=row.querySelector('input[type="url"]').value.trim();if(!raw)continue;let parsed;try{parsed=new URL(normalizeNodeUrl(raw));}catch{toast("Enter a valid URL");row.querySelector('input[type="url"]').focus();return;}if(!['http:','https:'].includes(parsed.protocol)){toast("Only http and https URLs are supported");row.querySelector('input[type="url"]').focus();return;}entries.push({label:label||parsed.hostname||parsed.href,url:parsed.href});}urls[key]=entries;localStorage.setItem(URL_STORAGE_KEY,JSON.stringify(urls));closeModals();render();toast("URLs saved");};
  $("writingEditor").addEventListener("click", event => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    event.preventDefault();
    window.open(link.href, "_blank", "noopener,noreferrer");
  });
  $("writingForm").onsubmit = event => { event.preventDefault(); const p=state.projects.find(item=>item.id===$("writingProjectId").value); if(!p)return; const html=linkifyDocumentHtml($("writingEditor").innerHTML.trim()); if($("writingType").value==="task"){const task=p.tasks.find(item=>item.id===$("writingTaskId").value);if(!task)return;task.notes=html;}else p.description=html; persist();render();toast("Writing saved"); };
  $("projectForm").onsubmit = event => { event.preventDefault(); const start=$("projectStart").value,end=$("projectEnd").value;if((start&&!end)||(!start&&end)){toast("Add both project dates or leave both blank");return;}if(start&&parseDate(end)<parseDate(start)){toast("End date must be after start date");return;}const id=$("projectId").value, existing=state.projects.find(p=>p.id===id), data={id:id||uid(),name:$("projectNameInput").value.trim(),description:existing?.description||"",color:state.color,start,end,tasks:existing?.tasks||[]}; if(existing) state.projects[state.projects.indexOf(existing)]=data; else state.projects.push(data); resetToHomeView();persist();closeModals();render();toast(existing?"Project updated":"Project created"); };
  $("taskForm").onsubmit = event => { event.preventDefault(); const start=$("taskStart").value,end=$("taskEnd").value;if((start&&!end)||(!start&&end)){toast("Add both task dates or leave both blank");return;}if(start&&parseDate(end)<parseDate(start)){toast("End date must be after start date");return;} const id=$("taskId").value, existing=project().tasks.find(t=>t.id===id), data={id:id||uid(),name:$("taskNameInput").value.trim(),status:$("taskStatus").value,owner:$("taskOwner").value.trim(),start,end,notes:existing?.notes||"",parentId:$("taskParent").value||null,sortOrder:existing?.sortOrder??project().tasks.length}; if(existing)project().tasks[project().tasks.indexOf(existing)]=data;else project().tasks.push(data);resetToHomeView();persist();closeModals();render();toast(existing?"Node updated":"Node added"); };
  $("deleteTask").onclick = () => { const task=project().tasks.find(t=>t.id===$("taskId").value); closeModals(); askDelete("task",task); };
  $("confirmCancel").onclick = () => { $("confirm").hidden=true;state.pendingDelete=null; };
  $("confirmDelete").onclick = () => { const {type,item}=state.pendingDelete;if(type==="project")state.projects=state.projects.filter(p=>p.id!==item.id);else project().tasks=project().tasks.filter(t=>t.id!==item.id);resetToHomeView();persist();$("confirm").hidden=true;state.pendingDelete=null;render();toast(`${type[0].toUpperCase()+type.slice(1)} deleted`); };
  $("filterButton").onclick=()=>$("filters").hidden=!$("filters").hidden; $("statusFilter").onchange=render; $("searchInput").oninput=render; $("clearFilter").onclick=()=>{$("statusFilter").value="all";$("searchInput").value="";render();};
  $("zoomIn").onclick=()=>{state.zoom=Math.min(1.8,state.zoom+.2);$("zoomLabel").textContent=state.zoom>1.3?"Day":"Week";renderGantt();};$("zoomOut").onclick=()=>{state.zoom=Math.max(.6,state.zoom-.2);$("zoomLabel").textContent=state.zoom<.8?"Month":"Week";renderGantt();};
  $("homeZoomIn").onclick=()=>{state.zoom=Math.min(1.8,state.zoom+.2);$("homeZoomLabel").textContent=state.zoom>1.3?"Day":"Week";renderHomeGantt();};$("homeZoomOut").onclick=()=>{state.zoom=Math.max(.6,state.zoom-.2);$("homeZoomLabel").textContent=state.zoom<.8?"Month":"Week";renderHomeGantt();};
  $("homeFilterButton").onclick=()=>$("homeFilters").hidden=!$("homeFilters").hidden;$("homeStatusFilter").onchange=renderHomeGantt;$("homeDateFilter").onchange=renderHomeGantt;$("clearHomeFilter").onclick=clearHomeFilters;
  $("chartAddProject").onclick=()=>openProject();
  document.querySelectorAll("[data-hierarchy-level]").forEach(button=>button.onclick=()=>showHierarchyLevel(Number(button.dataset.hierarchyLevel)));
  $("blockViewToggle").onclick=()=>{state.blockView=!state.blockView;$("blockViewToggle").classList.toggle("active",state.blockView);$("blockViewToggle").setAttribute("aria-pressed",String(state.blockView));render();};
  $("nextSevenToggle").onclick=()=>{state.nextSevenDays=!state.nextSevenDays;$("nextSevenToggle").classList.toggle("active",state.nextSevenDays);$("nextSevenToggle").setAttribute("aria-pressed",String(state.nextSevenDays));renderHomeGantt();};
  $("menuButton").onclick=()=>$("sidebar").classList.toggle("open");
  document.querySelectorAll(".mobile-view-switch").forEach(switcher => switcher.onclick = event => { const button = event.target.closest("[data-mobile-view]"); if (button) setMobileView(switcher.closest("section"), button.dataset.mobileView); });
  document.addEventListener("click", event => { if(!event.target.closest(".row-actions"))closeChartContextMenus();const label=event.target.closest(".gantt-grid .task-label");if(!isAndroid()&&label&&event.clientX-label.getBoundingClientRect().left<=12){event.preventDefault();event.stopPropagation();selectDesktopTimelineRow(label);return;}const cell = event.target.closest(".gantt-cell"); if (cell) createTaskFromCell(cell); });
  document.addEventListener("dragover", event => {
    const cell = event.target.closest(".gantt-cell");
    if (!cell || !event.dataTransfer.types.includes("application/x-northstar-task")) return;
    event.preventDefault();event.dataTransfer.dropEffect="move";
    document.querySelectorAll(".task-drop-target").forEach(target => { if(target!==cell)target.classList.remove("task-drop-target"); });
    cell.classList.add("task-drop-target");
    const grid=cell.closest(".gantt-grid"),column=parseInt(cell.style.gridColumn,10);
    if(grid?.dataset.chartStart&&Number.isFinite(column)){const date=addDays(grid.dataset.chartStart,column-2);let preview=document.querySelector(".drag-date-preview");if(!preview){preview=document.createElement("div");preview.className="drag-date-preview";document.body.append(preview);}preview.textContent=formatDate(date);preview.style.left=`${event.clientX+14}px`;preview.style.top=`${event.clientY+14}px`;}
  });
  document.addEventListener("drop", event => {
    const cell = event.target.closest(".gantt-cell");
    if (!cell) return;
    const raw = event.dataTransfer.getData("application/x-northstar-task");
    if (!raw) return;
    event.preventDefault();
    let payload;try{payload=JSON.parse(raw);}catch{return;}
    const parent=state.projects.find(project=>project.id===payload.projectId),task=parent?.tasks.find(item=>item.id===payload.taskId),grid=cell.closest(".gantt-grid");
    const column=parseInt(cell.style.gridColumn,10);
    if(!task||!grid?.dataset.chartStart||!Number.isFinite(column))return;
    const droppedDate=addDays(grid.dataset.chartStart,column-2),duration=task.start&&task.end?dayDiff(task.start,task.end)+1:1;
    task.start=droppedDate;task.end=addDays(droppedDate,duration-1);
    document.querySelector(".drag-date-preview")?.remove();
    resetToHomeView();persist();render();toast(`${task.name} scheduled for ${formatDate(droppedDate)}`);
  });
  document.addEventListener("mouseover", event => { const chartTask=event.target.closest(".bar");if(chartTask&&!chartTask.contains(event.relatedTarget)){showChartTaskTooltip(chartTask);return;}const node=event.target.closest(".task-label,.side-task");if(node&&!node.contains(event.relatedTarget)){showNodeContentTooltip(node);return;}const cell=event.target.closest(".gantt-cell");if(cell&&!cell.contains(event.relatedTarget))showCellTooltip(cell); });
  document.addEventListener("mouseout", event => { const chartTask=event.target.closest(".bar");if(chartTask&&!chartTask.contains(event.relatedTarget)){hideChartTaskTooltip();return;}const node=event.target.closest(".task-label,.side-task");if(node&&!node.contains(event.relatedTarget)){hideNodeContentTooltip();return;}const cell=event.target.closest(".gantt-cell");if(cell&&!cell.contains(event.relatedTarget))hideCellTooltip(); });
  document.addEventListener("mousedown", hideSideTaskTooltip);
  document.onkeydown=event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();$("searchInput").focus();}if(event.key==="Escape"){closeChartContextMenus();closeModals();$("confirm").hidden=true;}};
  render();
}
setup();
