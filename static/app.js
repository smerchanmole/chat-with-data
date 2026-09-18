const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  connections: [], connection: 'talk-to-data-demo', connectionSpec: null, database: 'demo',
  tables: ['sales', 'stores'], profiles: [], step: 0,
  cmlAuth: { baseUrl:'', projectId:'', apiKeyId:'', apiKeyValue:'' },
  modules: { summary: true, table: true, map: true, chart: true, sql: true },
  model: { endpoint: '', model: 'default', auth_type: 'cdp', token: '', api_key_id: '', api_key_value: '' },
  uiLanguage: localStorage.getItem('ttd-language') || 'es', modelLanguage: 'es',
};

const translations = {
  es: { new_chat:'Nueva conversación', workspace:'Espacio de trabajo', chat:'Conversación', settings:'Configuración', recent:'RECIENTES', data_source:'FUENTE DE DATOS', analysis:'Análisis', conversation:'Conversación', hello:'Hola, soy tu analista.', question_prompt:'¿Qué quieres saber?', welcome_copy:'Pregunta en lenguaje natural. Prepararé la consulta, analizaré los resultados y elegiré la mejor forma de explicarlos.', trend:'Analiza una tendencia', compare:'Compara categorías', map_data:'Sitúa los datos', disclaimer:'La IA puede cometer errores. Revisa la consulta SQL antes de tomar decisiones.', data_context:'Contexto de datos', connection:'CONEXIÓN', selected_tables:'TABLAS SELECCIONADAS', manage_tables:'Gestionar tablas', answer_modules:'MÓDULOS DE RESPUESTA', memory_on:'Memoria activa', memory_copy:'Usaré las últimas preguntas para comprender referencias y comparaciones.', settings_copy:'Conecta tus datos y define cómo quieres recibir las respuestas.', answer:'Respuesta' },
  en: { new_chat:'New conversation', workspace:'Workspace', chat:'Conversation', settings:'Settings', recent:'RECENT', data_source:'DATA SOURCE', analysis:'Analysis', conversation:'Conversation', hello:'Hello, I am your analyst.', question_prompt:'What would you like to know?', welcome_copy:'Ask in natural language. I will prepare the query, analyze the results, and choose the best way to explain them.', trend:'Analyze a trend', compare:'Compare categories', map_data:'Map your data', disclaimer:'AI can make mistakes. Review the SQL query before making decisions.', data_context:'Data context', connection:'CONNECTION', selected_tables:'SELECTED TABLES', manage_tables:'Manage tables', answer_modules:'ANSWER MODULES', memory_on:'Memory active', memory_copy:'I will use recent questions to understand references and comparisons.', settings_copy:'Connect your data and define how you want answers.', answer:'Answer' },
  it: { new_chat:'Nuova conversazione', workspace:'Area di lavoro', chat:'Conversazione', settings:'Impostazioni', recent:'RECENTI', data_source:'ORIGINE DATI', analysis:'Analisi', conversation:'Conversazione', hello:'Ciao, sono il tuo analista.', question_prompt:'Cosa vuoi sapere?', welcome_copy:'Fai una domanda in linguaggio naturale. Preparerò la query, analizzerò i risultati e sceglierò come spiegarli.', trend:'Analizza una tendenza', compare:'Confronta categorie', map_data:'Posiziona i dati', disclaimer:'L’IA può commettere errori. Controlla la query SQL.', data_context:'Contesto dati', connection:'CONNESSIONE', selected_tables:'TABELLE SELEZIONATE', manage_tables:'Gestisci tabelle', answer_modules:'MODULI RISPOSTA', memory_on:'Memoria attiva', memory_copy:'Userò le domande recenti per capire riferimenti e confronti.', settings_copy:'Collega i dati e definisci le risposte.', answer:'Risposta' },
  de: { new_chat:'Neue Unterhaltung', workspace:'Arbeitsbereich', chat:'Unterhaltung', settings:'Einstellungen', recent:'ZULETZT', data_source:'DATENQUELLE', analysis:'Analyse', conversation:'Unterhaltung', hello:'Hallo, ich bin dein Analyst.', question_prompt:'Was möchtest du wissen?', welcome_copy:'Frage in natürlicher Sprache. Ich erstelle die Abfrage, analysiere die Ergebnisse und erkläre sie passend.', trend:'Trend analysieren', compare:'Kategorien vergleichen', map_data:'Daten verorten', disclaimer:'KI kann Fehler machen. Prüfe die SQL-Abfrage.', data_context:'Datenkontext', connection:'VERBINDUNG', selected_tables:'AUSGEWÄHLTE TABELLEN', manage_tables:'Tabellen verwalten', answer_modules:'ANTWORTMODULE', memory_on:'Gedächtnis aktiv', memory_copy:'Letzte Fragen helfen mir, Bezüge zu verstehen.', settings_copy:'Daten verbinden und Antworten festlegen.', answer:'Antwort' },
  fr: { new_chat:'Nouvelle conversation', workspace:'Espace de travail', chat:'Conversation', settings:'Paramètres', recent:'RÉCENTS', data_source:'SOURCE DE DONNÉES', analysis:'Analyse', conversation:'Conversation', hello:'Bonjour, je suis votre analyste.', question_prompt:'Que voulez-vous savoir ?', welcome_copy:'Posez votre question en langage naturel. Je préparerai la requête, analyserai les résultats et choisirai la meilleure explication.', trend:'Analyser une tendance', compare:'Comparer les catégories', map_data:'Cartographier les données', disclaimer:'L’IA peut faire des erreurs. Vérifiez la requête SQL.', data_context:'Contexte des données', connection:'CONNEXION', selected_tables:'TABLES SÉLECTIONNÉES', manage_tables:'Gérer les tables', answer_modules:'MODULES DE RÉPONSE', memory_on:'Mémoire active', memory_copy:'J’utiliserai les questions récentes pour comprendre les références.', settings_copy:'Connectez vos données et définissez les réponses.', answer:'Réponse' },
};

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json().catch(() => ({ ok:false, error:'Respuesta no válida del servidor' }));
  if (!response.ok || !payload.ok) throw new Error(payload.error || `Error ${response.status}`);
  return payload.data;
}

function activeConnectionPayload() {
  if (state.connectionSpec) return { connection:'direct-trino', connection_spec:state.connectionSpec };
  const selected = state.connections.find(item => item.name === state.connection);
  if (selected?.cml_registered) {
    return { connection:state.connection, connection_spec:{ ...selected, cdsw_api_key:state.cmlAuth.apiKeyValue } };
  }
  return { connection:state.connection };
}

function renderConnectionOptions() {
  $('#connection-select').innerHTML = state.connections.map(item => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.label)} · ${escapeHtml(item.engine)}</option>`).join('');
  $('#connection-select').value = state.connection;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function toast(message, error = false) {
  const node = $('#toast'); node.textContent = message; node.className = error ? 'show error' : 'show';
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.className = '', 3200);
}

function applyLanguage() {
  const dict = translations[state.uiLanguage] || translations.es;
  $$('[data-i18n]').forEach(node => { if (dict[node.dataset.i18n]) node.textContent = dict[node.dataset.i18n]; });
  document.documentElement.lang = state.uiLanguage;
  localStorage.setItem('ttd-language', state.uiLanguage);
}

async function initialize() {
  applyLanguage();
  try {
    const [connections, context] = await Promise.all([api('/api/connections'), api('/api/cml-context')]);
    state.connections = connections;
    state.cmlAuth.baseUrl = context.base_url || '';
    state.cmlAuth.projectId = context.project_id || '';
    $('#cml-base-url').value = state.cmlAuth.baseUrl;
    $('#cml-project-id').value = state.cmlAuth.projectId;
    renderConnectionOptions();
    await loadDatabases();
    $('#database-select').value = state.database;
    await loadTables(true);
    await profileTables(true);
    await loadHistory();
  } catch (error) { toast(error.message, true); }
  syncContext();
}

async function loadDatabases() {
  setDbStatus('Conectando…', false);
  const databases = await api('/api/databases', { method:'POST', body:JSON.stringify(activeConnectionPayload()) });
  $('#database-select').innerHTML = databases.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('') || '<option value="">Sin esquemas disponibles</option>';
  if (!databases.includes(state.database)) state.database = databases[0] || '';
  $('#database-select').value = state.database;
  setDbStatus(`${databases.length} esquemas disponibles`, true);
}

async function loadTables(preserve = false) {
  if (!state.database) return;
  const tables = await api('/api/tables', { method:'POST', body:JSON.stringify({ ...activeConnectionPayload(), database:state.database }) });
  if (!preserve) state.tables = [];
  state.tables = state.tables.filter(item => tables.includes(item));
  $('#table-picker').innerHTML = tables.map(name => `<label class="table-check"><input type="checkbox" value="${escapeHtml(name)}" ${state.tables.includes(name) ? 'checked' : ''}><b>${escapeHtml(name)}</b><span>tabla</span></label>`).join('') || '<p class="empty-state">No se encontraron tablas.</p>';
  $$('#table-picker input').forEach(input => input.addEventListener('change', syncTableSelection));
  syncContext();
}

function syncTableSelection() {
  state.tables = $$('#table-picker input:checked').map(input => input.value);
  state.profiles = [];
  $('#profile-status').textContent = state.tables.length ? 'La selección ha cambiado; vuelve a analizarla.' : '';
  syncContext();
}

async function profileTables(silent = false) {
  if (!state.tables.length) { if (!silent) toast('Selecciona al menos una tabla.', true); return; }
  const button = $('#profile-button'); button.disabled = true; button.textContent = 'Analizando…';
  try {
    state.profiles = await api('/api/profile', { method:'POST', body:JSON.stringify({ ...activeConnectionPayload(), database:state.database, tables:state.tables }) });
    const columns = state.profiles.reduce((sum, item) => sum + item.columns.length, 0);
    $('#profile-status').textContent = `Perfil listo · ${state.profiles.length} tablas · ${columns} columnas`; $('#profile-status').className = 'inline-status success';
    if (!silent) toast('Perfil de datos actualizado.');
  } catch (error) { $('#profile-status').textContent = error.message; $('#profile-status').className = 'inline-status error'; if (!silent) toast(error.message, true); }
  finally { button.disabled = false; button.textContent = 'Analizar selección'; }
}

function syncContext() {
  const selected = state.connections.find(item => item.name === state.connection);
  const name = state.connectionSpec ? 'Trino JDBC' : (selected?.label || state.connection);
  const engine = state.connectionSpec ? 'Trino' : (selected?.engine || '—');
  $('#mini-source').textContent = name; $('#context-connection').textContent = name; $('#context-engine').textContent = `${engine} · Conectado`;
  $('#source-pill span:nth-child(2)').textContent = name; $('#source-pill small').textContent = `${state.tables.length} tablas`; $('#table-count').textContent = state.tables.length;
  $('#context-tables').innerHTML = state.tables.map(name => { const profile = state.profiles.find(item => item.table === name); return `<div class="table-item"><span>▦</span><b>${escapeHtml(name)}</b><small>${profile ? profile.columns.length + ' cols' : 'sin perfil'}</small></div>`; }).join('') || '<p class="muted-small">Sin tablas</p>';
  const moduleNames = { summary:'Resumen', table:'Tabla', map:'Mapa', chart:'Gráfica', sql:'SQL' };
  $('#active-modules').innerHTML = Object.entries(state.modules).filter(([,on]) => on).map(([key]) => `<span>${moduleNames[key]}</span>`).join('');
}

function setDbStatus(text, success) { $('#db-status').textContent = text; $('#db-status-dot').className = success ? 'ok' : ''; }

async function loadHistory() {
  const items = await api('/api/history');
  $('#history-list').innerHTML = items.length ? items.slice().reverse().map(item => `<button class="history-item" data-history-id="${item.id}">${escapeHtml(item.question)}</button>`).join('') : '<p class="muted-small">Aún no hay preguntas</p>';
}

async function ask(question) {
  question = question.trim(); if (!question) return;
  if (!state.profiles.length) { toast('Analiza primero las tablas seleccionadas.', true); openSettings(); return; }
  $('#welcome')?.remove(); appendUser(question); $('#question').value = ''; resizeComposer();
  const typing = appendTyping(); $('#send-button').disabled = true;
  try {
    const result = await api('/api/ask', { method:'POST', body:JSON.stringify({ ...activeConnectionPayload(), database:state.database, tables:state.tables, profiles:state.profiles, modules:state.modules, model:state.model, model_language:state.modelLanguage, question }) });
    typing.remove(); renderAnswer(result); await loadHistory();
  } catch (error) { typing.remove(); renderError(error.message); }
  finally { $('#send-button').disabled = false; $('#question').focus(); }
}

function appendUser(question) {
  const node = document.createElement('div'); node.className = 'message user-message'; node.innerHTML = `<div class="user-bubble">${escapeHtml(question)}</div>`; $('#chat-stream').append(node); scrollChat();
}

function appendTyping() {
  const node = document.createElement('div'); node.className = 'message assistant-message'; node.innerHTML = '<div class="assistant-avatar">✦</div><div class="answer-body"><div class="typing"><i></i><i></i><i></i></div></div>'; $('#chat-stream').append(node); scrollChat(); return node;
}

function renderError(message) {
  const node = document.createElement('div'); node.className = 'message assistant-message'; node.innerHTML = `<div class="assistant-avatar">!</div><div class="answer-body"><h3>No pude completar el análisis</h3><p>${escapeHtml(message)}</p></div>`; $('#chat-stream').append(node); scrollChat();
}

function renderAnswer(result) {
  const enabledTabs = [];
  if (result.modules.table) enabledTabs.push(['table','Tabla']);
  if (result.modules.chart && result.chart !== 'none') enabledTabs.push(['chart','Gráfica']);
  if (result.modules.map && result.map.enabled) enabledTabs.push(['map','Mapa']);
  if (result.modules.sql) enabledTabs.push(['sql','SQL']);
  const node = document.createElement('div'); node.className = 'message assistant-message';
  node.innerHTML = `<div class="assistant-avatar">✦</div><div class="answer-body"><h3>${escapeHtml(result.title)}</h3>${result.modules.summary ? `<p>${escapeHtml(result.summary)}</p>` : ''}<div class="answer-tabs">${enabledTabs.map(([key,label], index) => `<button data-result-tab="${key}" class="${index === 0 ? 'active' : ''}">${label}</button>`).join('')}</div><div class="result-panel">${enabledTabs.length ? panelFor(enabledTabs[0][0], result) : '<div class="sql-panel">No hay módulos activos.</div>'}</div></div>`;
  $('#chat-stream').append(node);
  $$('[data-result-tab]', node).forEach(button => button.addEventListener('click', () => { $$('[data-result-tab]', node).forEach(item => item.classList.toggle('active', item === button)); $('.result-panel', node).innerHTML = panelFor(button.dataset.resultTab, result); bindPanelActions(node, result); }));
  bindPanelActions(node, result); scrollChat();
}

function panelFor(type, result) {
  if (type === 'table') return `<div class="table-scroll"><table><thead><tr>${result.columns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}</tr></thead><tbody>${result.rows.map(row => `<tr>${result.columns.map(col => `<td>${formatValue(row[col])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  if (type === 'sql') return `<div class="sql-panel"><button class="copy-sql">Copiar</button><pre>${highlightSql(result.sql)}</pre></div>`;
  if (type === 'map') return renderMap(result);
  return renderChart(result);
}

function bindPanelActions(node, result) {
  $('.copy-sql', node)?.addEventListener('click', async event => { await navigator.clipboard.writeText(result.sql); event.currentTarget.textContent = 'Copiado ✓'; });
}

function formatValue(value) { if (typeof value === 'number') return escapeHtml(new Intl.NumberFormat(state.uiLanguage, { maximumFractionDigits:2 }).format(value)); return escapeHtml(value); }
function numericColumns(result) { return result.columns.filter(col => result.rows.some(row => typeof row[col] === 'number') && !/lat|lon|id/i.test(col)); }

function renderChart(result) {
  const nums = numericColumns(result); const metric = nums[0]; const label = result.columns.find(col => col !== metric && !/lat|lon|id/i.test(col)) || result.columns[0];
  if (!metric || !result.rows.length) return '<div class="sql-panel">No hay una combinación de categoría y valor numérico para visualizar.</div>';
  const rows = result.rows.slice(0, 14); const values = rows.map(row => Number(row[metric]) || 0); const max = Math.max(...values, 1);
  if (result.chart === 'donut') {
    const colors = ['#f36a2f','#35d8db','#9c84ff','#49d6a0','#ffc36b','#ff785f']; const total = values.reduce((a,b)=>a+b,0) || 1; let cursor=0;
    const stops = values.map((value,index)=>{const start=cursor;cursor += value/total*100;return `${colors[index%colors.length]} ${start}% ${cursor}%`;}).join(',');
    return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})"></div><div class="legend">${rows.map((row,index)=>`<div><i style="background:${colors[index%colors.length]}"></i><span>${escapeHtml(row[label])} · ${formatValue(row[metric])}</span></div>`).join('')}</div></div>`;
  }
  if (/line/.test(result.chart)) {
    const width=650,height=190,pad=20; const points=values.map((value,index)=>`${pad+(index*Math.max(1,(width-pad*2)/(values.length-1)))},${height-pad-(value/max*(height-pad*2))}`).join(' ');
    return `<div class="chart-line"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(result.title)}"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f36a2f" stop-opacity=".35"/><stop offset="1" stop-color="#f36a2f" stop-opacity="0"/></linearGradient></defs><polyline points="${points} ${width-pad},${height-pad} ${pad},${height-pad}" fill="url(#area)" stroke="none"/><polyline points="${points}" fill="none" stroke="#ff8e50" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${points.split(' ').map(point=>`<circle cx="${point.split(',')[0]}" cy="${point.split(',')[1]}" r="4" fill="#07111f" stroke="#ff9b62" stroke-width="2"/>`).join('')}</svg></div>`;
  }
  return `<div class="chart-wrap">${rows.map((row,index)=>`<div class="chart-bar" style="height:${Math.max(7,values[index]/max*100)}%" title="${escapeHtml(row[label])}: ${formatValue(row[metric])}"><span>${escapeHtml(row[label])}</span></div>`).join('')}</div>`;
}

function renderMap(result) {
  const lat = result.map.latitude, lon = result.map.longitude; const rows = result.rows.filter(row => Number.isFinite(Number(row[lat])) && Number.isFinite(Number(row[lon]))).slice(0,30);
  const label = result.columns.find(col => ![lat,lon].includes(col)) || lat;
  return `<div class="map-panel" role="img" aria-label="Puntos geográficos">${rows.map(row => { const x=(Number(row[lon])+180)/360*100; const y=(90-Number(row[lat]))/180*100; return `<div class="map-point" style="left:${x}%;top:${y}%"><span>${escapeHtml(row[label])}</span></div>`; }).join('')}</div>`;
}

function highlightSql(sql) { return escapeHtml(sql).replace(/\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|ON|GROUP BY|ORDER BY|LIMIT|AS|SUM|COUNT|AVG|ROUND|DESC|ASC)\b/gi, '<span class="kw">$1</span>'); }
function scrollChat() { requestAnimationFrame(() => { $('#chat-stream').scrollTop = $('#chat-stream').scrollHeight; }); }
function resizeComposer() { const q=$('#question'); q.style.height='auto'; q.style.height=`${Math.min(q.scrollHeight,120)}px`; }

function openSettings() { $('#settings-dialog').showModal(); showStep(state.step); }
function showStep(index) {
  state.step = Math.max(0,Math.min(2,index));
  $$('.step-link').forEach((node,i)=>node.classList.toggle('active',i===state.step)); $$('.settings-step').forEach((node,i)=>node.classList.toggle('active',i===state.step));
  const titles=[['PASO 1 DE 3','Conecta una fuente de datos'],['PASO 2 DE 3','Configura el modelo LLM'],['PASO 3 DE 3','Diseña tus respuestas']]; $('#step-kicker').textContent=titles[state.step][0]; $('#step-title').textContent=titles[state.step][1];
  $('#previous-step').hidden=state.step===0; $('#next-step').hidden=state.step===2; $('#save-settings').hidden=state.step!==2;
}

function bindEvents() {
  $$('[data-open-settings]').forEach(button=>button.addEventListener('click',openSettings)); $$('.step-link').forEach((button,index)=>button.addEventListener('click',()=>showStep(index)));
  $('#next-step').addEventListener('click',()=>showStep(state.step+1)); $('#previous-step').addEventListener('click',()=>showStep(state.step-1));
  $('#connection-mode').addEventListener('change',event=>{const direct=event.target.value==='trino'; $('#trino-fields').hidden=!direct; $('#cml-auth-fields').hidden=direct; $('#cml-connection-field').hidden=direct;});
  $('#discover-cml').addEventListener('click',discoverCmlConnections);
  $('#connection-select').addEventListener('change',async event=>{state.connection=event.target.value;state.connectionSpec=null;state.database='';state.tables=[];state.profiles=[];try{await loadDatabases();await loadTables();}catch(error){toast(error.message,true)}});
  $('#connect-trino').addEventListener('click',async()=>{const url=$('#trino-url').value.trim();if(!url.startsWith('jdbc:trino://')){toast('La URL debe comenzar por jdbc:trino://',true);return}state.connectionSpec={engine:'trino',jdbc_url:url,username:$('#trino-user').value.trim(),password:$('#trino-password').value};state.database='';state.tables=[];state.profiles=[];try{await loadDatabases();await loadTables();toast('Conexión Trino disponible.')}catch(error){toast(error.message,true)}});
  $('#database-select').addEventListener('change',async event=>{state.database=event.target.value;state.tables=[];state.profiles=[];try{await loadTables();}catch(error){toast(error.message,true)}});
  $('#toggle-all').addEventListener('click',()=>{const inputs=$$('#table-picker input');const select=!inputs.every(input=>input.checked);inputs.forEach(input=>input.checked=select);syncTableSelection()}); $('#profile-button').addEventListener('click',()=>profileTables());
  $('#auth-type').addEventListener('change',event=>{$('#token-fields').hidden=event.target.value==='apikey';$('#apikey-fields').hidden=event.target.value!=='apikey'});
  $('#test-model').addEventListener('click',async()=>{syncModel();const status=$('#model-status');status.textContent='Comprobando…';try{const result=await api('/api/test-model',{method:'POST',body:JSON.stringify(state.model)});status.textContent=`Conectado · ${result.latency_ms} ms`;status.className='inline-status success'}catch(error){status.textContent=error.message;status.className='inline-status error'}});
  $$('#module-picker input').forEach(input=>input.addEventListener('change',()=>{state.modules[input.dataset.module]=input.checked;syncContext()}));
  $('#ui-language').value=state.uiLanguage; $('#ui-language').addEventListener('change',event=>{state.uiLanguage=event.target.value;applyLanguage()}); $('#model-language').addEventListener('change',event=>state.modelLanguage=event.target.value);
  $('#save-settings').addEventListener('click',event=>{event.preventDefault();syncModel();syncContext();$('#settings-dialog').close();toast('Configuración guardada para esta sesión.')});
  $('#ask-form').addEventListener('submit',event=>{event.preventDefault();ask($('#question').value)}); $('#question').addEventListener('input',resizeComposer); $('#question').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('#ask-form').requestSubmit()}});
  $$('.suggestion').forEach(button=>button.addEventListener('click',()=>ask(button.dataset.question)));
  $('#new-chat').addEventListener('click',newChat); $('#clear-history').addEventListener('click',newChat);
  $('#mic-button').addEventListener('click',toggleSpeech);
}

function syncModel(){state.model={endpoint:$('#model-endpoint').value.trim(),model:$('#model-name').value.trim()||'default',auth_type:$('#auth-type').value,token:$('#model-token').value,api_key_id:$('#api-key-id').value,api_key_value:$('#api-key-value').value}}

async function discoverCmlConnections(){
  state.cmlAuth={baseUrl:$('#cml-base-url').value.trim(),projectId:$('#cml-project-id').value.trim(),apiKeyId:$('#cml-api-key-id').value.trim(),apiKeyValue:$('#cml-api-key-value').value};
  const status=$('#cml-discovery-status');const button=$('#discover-cml');status.textContent='Consultando conexiones visibles…';status.className='inline-status';button.disabled=true;
  try{
    const discovered=await api('/api/connections/discover',{method:'POST',body:JSON.stringify({base_url:state.cmlAuth.baseUrl,project_id:state.cmlAuth.projectId,api_key_id:state.cmlAuth.apiKeyId,api_key_value:state.cmlAuth.apiKeyValue})});
    const demo=state.connections.find(item=>item.demo)||{name:'talk-to-data-demo',engine:'sqlite',label:'Demo · Retail analytics',demo:true};
    state.connections=[...discovered,demo];state.connection=discovered[0]?.name||demo.name;state.connectionSpec=null;state.database='';state.tables=[];state.profiles=[];renderConnectionOptions();
    status.textContent=`${discovered.length} conexiones visibles para este usuario`;status.className='inline-status success';
    if(discovered.length){await loadDatabases();await loadTables()}else{toast('El usuario no tiene conexiones disponibles en este proyecto.',true)}
  }catch(error){status.textContent=error.message;status.className='inline-status error';toast(error.message,true)}finally{button.disabled=false}
}
async function newChat(){await api('/api/history',{method:'DELETE'});location.reload()}

let recognition;
function toggleSpeech(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition){toast('El reconocimiento de voz no está disponible en este navegador.',true);return}
  if(recognition){recognition.stop();return} recognition=new SpeechRecognition();recognition.lang={es:'es-ES',en:'en-US',it:'it-IT',de:'de-DE',fr:'fr-FR'}[state.uiLanguage];recognition.interimResults=true;
  recognition.onstart=()=>{$('#mic-button').classList.add('listening');$('#mic-status').textContent='Escuchando…'}; recognition.onresult=event=>{$('#question').value=[...event.results].map(result=>result[0].transcript).join('');resizeComposer()}; recognition.onend=()=>{$('#mic-button').classList.remove('listening');$('#mic-status').textContent='';recognition=null}; recognition.onerror=event=>toast(`Micrófono: ${event.error}`,true); recognition.start();
}

bindEvents(); initialize();
