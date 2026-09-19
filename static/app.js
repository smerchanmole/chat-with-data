const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  connections: [], connection: 'talk-to-data-demo', connectionSpec: null, database: 'demo',
  tables: ['sales', 'stores'], profiles: [], step: 0,
  modules: { summary: true, table: true, map: true, chart: true, sql: true },
  model: { endpoint: '', model: '', auth_type: 'cdp', token: '', api_key_id: '', api_key_value: '' },
  dataContext: sessionStorage.getItem('ttd-data-context') || '',
  generatedContext: sessionStorage.getItem('ttd-generated-context') || '',
  uiLanguage: localStorage.getItem('ttd-language') || 'es', modelLanguage: 'es',
  uiTheme: localStorage.getItem('ttd-theme') || 'dark',
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
  if (state.connectionSpec) return { connection:'direct', connection_spec:state.connectionSpec };
  return { connection:state.connection };
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

function applyTheme() {
  document.documentElement.dataset.theme = state.uiTheme;
  localStorage.setItem('ttd-theme', state.uiTheme);
  document.querySelector('meta[name="theme-color"]').content = state.uiTheme === 'light' ? '#f3f5f8' : '#07111f';
}

async function initialize() {
  applyLanguage();
  applyTheme();
  $('#model-context').value = state.dataContext;
  try {
    state.connections = await api('/api/connections');
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
    const generated = profileContext(state.profiles);
    if (!state.dataContext || state.dataContext === state.generatedContext) {
      state.dataContext = generated;
      $('#model-context').value = generated;
      sessionStorage.setItem('ttd-data-context', generated);
    }
    state.generatedContext = generated;
    sessionStorage.setItem('ttd-generated-context', generated);
    const columns = state.profiles.reduce((sum, item) => sum + item.columns.length, 0);
    $('#profile-status').textContent = `Perfil listo · ${state.profiles.length} tablas · ${columns} columnas`; $('#profile-status').className = 'inline-status success';
    if (!silent) toast('Perfil de datos actualizado.');
  } catch (error) { $('#profile-status').textContent = error.message; $('#profile-status').className = 'inline-status error'; if (!silent) toast(error.message, true); }
  finally { button.disabled = false; button.textContent = 'Analizar selección'; }
}

function profileContext(profiles) {
  const heading = `Base de datos/esquema: ${state.database || 'sin seleccionar'}.`;
  const tables = profiles.map(profile => {
    const columns = profile.columns.map(column => {
      const details = [`tipo=${column.type}`, `nulos=${column.nulls}`, `distintos_en_muestra=${column.unique}`];
      if (column.examples?.length) details.push(`ejemplos=${column.examples.join(' | ')}`);
      return `${column.name} (${details.join(', ')})`;
    }).join('; ');
    return `Tabla ${profile.qualified || profile.table} [muestra: ${profile.sample_rows} filas]: ${columns}`;
  });
  return [heading, ...tables, '', 'Preferencias del usuario:'].join('\n');
}

function syncContext() {
  const selected = state.connections.find(item => item.name === state.connection);
  const name = state.connectionSpec?.label || selected?.label || state.connection;
  const engineNames = { postgresql:'PostgreSQL', cloudera:'Cloudera', trino:'Trino', sqlite:'SQLite' };
  const engine = engineNames[state.connectionSpec?.engine || selected?.engine] || '—';
  $('#mini-source').textContent = name; $('#context-connection').textContent = name; $('#context-engine').textContent = `${engine} · Conectado`;
  $('#source-pill span:nth-child(2)').textContent = name; $('#source-pill small').textContent = `${state.tables.length} tablas`; $('#table-count').textContent = state.tables.length;
  $('#context-tables').innerHTML = state.tables.map(name => { const profile = state.profiles.find(item => item.table === name); return `<div class="table-item"><span>▦</span><b>${escapeHtml(name)}</b><small>${profile ? profile.columns.length + ' cols' : 'sin perfil'}</small></div>`; }).join('') || '<p class="muted-small">Sin tablas</p>';
  const totalColumns = state.profiles.reduce((sum, profile) => sum + profile.columns.length, 0);
  $('#column-count').textContent = totalColumns;
  $('#context-columns').innerHTML = state.profiles.map((profile, index) => `<details class="schema-table" ${index === 0 ? 'open' : ''}><summary><span>▤</span><b>${escapeHtml(profile.table)}</b><small>${profile.columns.length}</small></summary><div>${profile.columns.map(column => `<div class="schema-column" title="${escapeHtml((column.examples || []).join(' · '))}"><span><b>${escapeHtml(column.name)}</b><small>${escapeHtml(column.type)}</small></span><em>${column.nulls ? column.nulls + ' nulos' : column.unique + ' distintos'}</em></div>`).join('')}</div></details>`).join('') || '<p class="muted-small">Analiza las tablas para ver su esquema.</p>';
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
    const result = await api('/api/ask', { method:'POST', body:JSON.stringify({ ...activeConnectionPayload(), database:state.database, tables:state.tables, profiles:state.profiles, additional_context:state.dataContext, modules:state.modules, model:state.model, model_language:state.modelLanguage, question }) });
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
  $$('[data-result-tab]', node).forEach(button => button.addEventListener('click', () => { destroyMap(node); $$('[data-result-tab]', node).forEach(item => item.classList.toggle('active', item === button)); $('.result-panel', node).innerHTML = panelFor(button.dataset.resultTab, result); bindPanelActions(node, result); }));
  bindPanelActions(node, result); scrollChat();
}

function panelFor(type, result) {
  if (type === 'table') return `<div class="table-scroll"><table><thead><tr><th class="row-number" scope="col">#</th>${result.columns.map(col => `<th scope="col">${escapeHtml(col)}</th>`).join('')}</tr></thead><tbody>${result.rows.map((row,index) => `<tr><th class="row-number" scope="row">${index+1}</th>${result.columns.map(col => `<td>${formatValue(row[col])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  if (type === 'sql') return `<div class="sql-panel"><button class="copy-sql">Copiar</button><pre>${highlightSql(result.sql)}</pre></div>`;
  if (type === 'map') return renderMap(result);
  return renderChart(result);
}

function bindPanelActions(node, result) {
  $('.copy-sql', node)?.addEventListener('click', async event => { await navigator.clipboard.writeText(result.sql); event.currentTarget.textContent = 'Copiado ✓'; });
  initMap(node, result);
}

function formatValue(value) { if (typeof value === 'number') return escapeHtml(new Intl.NumberFormat(state.uiLanguage, { maximumFractionDigits:2 }).format(value)); return escapeHtml(value); }
function numericColumns(result) { return result.columns.filter(col => result.rows.some(row => typeof row[col] === 'number') && !/lat|lon|id/i.test(col)); }

const chartColors = ['var(--chart-1)','var(--chart-2)','var(--chart-3)'];
function compactNumber(value) { return new Intl.NumberFormat(state.uiLanguage,{notation:'compact',maximumFractionDigits:1}).format(value); }
function chartLabelColumn(result, metrics) { return result.columns.find(col => !metrics.includes(col) && !/lat|lon|id/i.test(col)) || result.columns[0]; }
function axisTicks(max, count=4) { return Array.from({length:count+1},(_,index)=>max*index/count); }

function renderChart(result) {
  const metrics = numericColumns(result).slice(0,3); const label = chartLabelColumn(result,metrics);
  if (!metrics.length || !result.rows.length) return '<div class="sql-panel">No hay una combinación de categoría y valor numérico para visualizar.</div>';
  const rows = result.rows.slice(0,14); const metric = metrics[0]; const values = rows.map(row => Number(row[metric]) || 0); const max = Math.max(...values,1);
  if (result.chart === 'donut') {
    const colors = ['var(--chart-1)','var(--chart-2)','var(--chart-3)','var(--chart-4)','var(--chart-5)','var(--chart-6)']; const total = values.reduce((a,b)=>a+b,0) || 1; let cursor=0;
    const stops = values.map((value,index)=>{const start=cursor;cursor += value/total*100;return `${colors[index%colors.length]} ${start}% ${cursor}%`;}).join(',');
    return `<div class="donut-wrap"><div class="donut-stack"><div class="donut" style="background:conic-gradient(${stops})"></div><strong>${compactNumber(total)}</strong><small>${escapeHtml(metric)}</small></div><div class="legend">${rows.map((row,index)=>`<div><i style="background:${colors[index%colors.length]}"></i><span>${escapeHtml(row[label])} · ${formatValue(row[metric])} (${Math.round(values[index]/total*100)}%)</span></div>`).join('')}</div></div>`;
  }
  if (/line/.test(result.chart)) {
    return renderLineChart(result,rows,label,metrics.slice(0,2));
  }
  return renderBarChart(result,rows,label,metrics);
}

function renderLineChart(result,rows,label,metrics) {
  const width=760,height=330,left=66,right=metrics.length>1?70:24,top=48,bottom=62,plotW=width-left-right,plotH=height-top-bottom;
  const maxima=metrics.map(metric=>Math.max(...rows.map(row=>Number(row[metric])||0),1));
  const x=index=>left+(rows.length===1?plotW/2:index*plotW/(rows.length-1));
  const y=(value,series)=>top+plotH-(Number(value)||0)/maxima[series]*plotH;
  const grid=axisTicks(maxima[0]).map(value=>`<g><line class="chart-grid" x1="${left}" y1="${y(value,0)}" x2="${left+plotW}" y2="${y(value,0)}"/><text class="chart-axis-label" x="${left-10}" y="${y(value,0)+4}" text-anchor="end">${compactNumber(value)}</text></g>`).join('');
  const rightAxis=metrics[1]?axisTicks(maxima[1]).map(value=>`<text class="chart-axis-label" x="${left+plotW+10}" y="${y(value,1)+4}" text-anchor="start">${compactNumber(value)}</text>`).join(''):'';
  const step=Math.max(1,Math.ceil(rows.length/8));
  const xLabels=rows.map((row,index)=>index%step===0||index===rows.length-1?`<text class="chart-axis-label" x="${x(index)}" y="${top+plotH+25}" text-anchor="middle">${escapeHtml(row[label])}</text>`:'').join('');
  const series=metrics.map((metric,seriesIndex)=>{const points=rows.map((row,index)=>`${x(index)},${y(row[metric],seriesIndex)}`).join(' ');return `<polyline class="chart-series" points="${points}" fill="none" stroke="${chartColors[seriesIndex]}"/>${rows.map((row,index)=>`<circle class="chart-point" cx="${x(index)}" cy="${y(row[metric],seriesIndex)}" r="4" fill="var(--chart-surface)" stroke="${chartColors[seriesIndex]}"><title>${escapeHtml(row[label])} · ${escapeHtml(metric)}: ${formatValue(row[metric])}</title></circle>`).join('')}`}).join('');
  const legend=metrics.map((metric,index)=>`<span><i style="background:${chartColors[index]}"></i>${escapeHtml(metric)}</span>`).join('');
  return `<div class="chart-panel"><div class="chart-legend">${legend}</div><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(result.title)}. Eje horizontal: ${escapeHtml(label)}. Series: ${metrics.map(escapeHtml).join(', ')}"><title>${escapeHtml(result.title)}</title>${grid}${rightAxis}<line class="chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${top+plotH}"/><line class="chart-axis" x1="${left}" y1="${top+plotH}" x2="${left+plotW}" y2="${top+plotH}"/>${xLabels}${series}<text class="chart-axis-title" x="${left}" y="22">${escapeHtml(metrics[0])}</text>${metrics[1]?`<text class="chart-axis-title" x="${left+plotW}" y="22" text-anchor="end">${escapeHtml(metrics[1])}</text>`:''}<text class="chart-axis-title" x="${left+plotW/2}" y="${height-5}" text-anchor="middle">${escapeHtml(label)}</text></svg></div>`;
}

function renderBarChart(result,rows,label,metrics) {
  const width=760,height=340,left=66,right=24,top=48,bottom=76,plotW=width-left-right,plotH=height-top-bottom,stacked=result.chart==='stacked_bar';
  const max=stacked?Math.max(...rows.map(row=>metrics.reduce((sum,metric)=>sum+(Number(row[metric])||0),0)),1):Math.max(...rows.flatMap(row=>metrics.map(metric=>Number(row[metric])||0)),1);
  const groupW=plotW/Math.max(rows.length,1),barW=Math.max(5,Math.min(34,(groupW-10)/(stacked?1:metrics.length)));
  const y=value=>top+plotH-(Number(value)||0)/max*plotH;
  const grid=axisTicks(max).map(value=>`<g><line class="chart-grid" x1="${left}" y1="${y(value)}" x2="${left+plotW}" y2="${y(value)}"/><text class="chart-axis-label" x="${left-10}" y="${y(value)+4}" text-anchor="end">${compactNumber(value)}</text></g>`).join('');
  const bars=rows.map((row,rowIndex)=>{const center=left+groupW*(rowIndex+.5);let cumulative=0;const marks=metrics.map((metric,seriesIndex)=>{const value=Number(row[metric])||0;const h=value/max*plotH;const x=stacked?center-barW/2:center-(barW*metrics.length)/2+seriesIndex*barW;const yy=stacked?y(cumulative+value):y(value);cumulative+=value;return `<rect class="chart-rect" x="${x}" y="${yy}" width="${Math.max(1,barW-2)}" height="${Math.max(1,h)}" rx="2" fill="${chartColors[seriesIndex]}"><title>${escapeHtml(row[label])} · ${escapeHtml(metric)}: ${formatValue(value)}</title></rect>`}).join('');return `${marks}<text class="chart-axis-label" transform="translate(${center},${top+plotH+16}) rotate(-35)" text-anchor="end">${escapeHtml(row[label])}</text>`}).join('');
  const legend=metrics.map((metric,index)=>`<span><i style="background:${chartColors[index]}"></i>${escapeHtml(metric)}</span>`).join('');
  return `<div class="chart-panel"><div class="chart-legend">${legend}</div><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(result.title)}. Eje horizontal: ${escapeHtml(label)}. Valores: ${metrics.map(escapeHtml).join(', ')}"><title>${escapeHtml(result.title)}</title>${grid}<line class="chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${top+plotH}"/><line class="chart-axis" x1="${left}" y1="${top+plotH}" x2="${left+plotW}" y2="${top+plotH}"/>${bars}<text class="chart-axis-title" x="${left}" y="22">${escapeHtml(metrics.join(' · '))}</text><text class="chart-axis-title" x="${left+plotW/2}" y="${height-5}" text-anchor="middle">${escapeHtml(label)}</text></svg></div>`;
}

let mapSequence=0;
function renderMap(result) {
  const lat = result.map.latitude, lon = result.map.longitude; const rows = result.rows.filter(row => Number.isFinite(Number(row[lat])) && Number.isFinite(Number(row[lon]))).slice(0,30);
  if(!rows.length)return '<div class="map-unavailable">La consulta no devolvió coordenadas válidas.</div>';
  const id=`result-map-${++mapSequence}`;
  return `<div class="map-shell"><div id="${id}" class="leaflet-map" role="region" aria-label="Mapa interactivo con ${rows.length} ubicaciones"></div><p class="map-caption">${rows.length} ubicaciones · usa los controles para ampliar y desplazarte</p></div>`;
}

function destroyMap(node){const container=$('.leaflet-map',node);if(container?._mapInstance){container._mapInstance.remove();container._mapInstance=null}}
function initMap(node,result){
  const container=$('.leaflet-map',node);if(!container||container._mapInstance)return;
  if(!window.L){container.innerHTML='<div class="map-unavailable">No se pudo cargar Leaflet. Comprueba el acceso a unpkg.com.</div>';return}
  const lat=result.map.latitude,lon=result.map.longitude,rows=result.rows.filter(row=>Number.isFinite(Number(row[lat]))&&Number.isFinite(Number(row[lon]))).slice(0,30);
  const label=result.columns.find(col=>![lat,lon].includes(col))||lat;
  const map=L.map(container,{scrollWheelZoom:false,zoomControl:true});container._mapInstance=map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  const bounds=[];
  rows.forEach(row=>{const point=[Number(row[lat]),Number(row[lon])];bounds.push(point);const details=result.columns.filter(col=>![lat,lon].includes(col)).slice(0,5).map(col=>`<div><b>${escapeHtml(col)}</b><span>${formatValue(row[col])}</span></div>`).join('');L.circleMarker(point,{radius:7,color:'#fff',weight:2,fillColor:'#f36a2f',fillOpacity:.9}).addTo(map).bindPopup(`<section class="map-popup"><strong>${escapeHtml(row[label])}</strong>${details}</section>`)});
  if(bounds.length===1)map.setView(bounds[0],11);else map.fitBounds(bounds,{padding:[32,32],maxZoom:11});
  requestAnimationFrame(()=>map.invalidateSize());
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
  $$('input[name="connection-mode"]').forEach(input=>input.addEventListener('change',()=>showConnector(input.value)));
  $('#connect-data-source').addEventListener('click',connectDataSource);
  $('#database-select').addEventListener('change',async event=>{state.database=event.target.value;state.tables=[];state.profiles=[];try{await loadTables();}catch(error){toast(error.message,true)}});
  $('#toggle-all').addEventListener('click',()=>{const inputs=$$('#table-picker input');const select=!inputs.every(input=>input.checked);inputs.forEach(input=>input.checked=select);syncTableSelection()}); $('#profile-button').addEventListener('click',()=>profileTables());
  $('#auth-type').addEventListener('change',event=>{$('#token-fields').hidden=event.target.value==='apikey';$('#apikey-fields').hidden=event.target.value!=='apikey'});
  $('#test-model').addEventListener('click',async()=>{syncModel();const status=$('#model-status');status.textContent='Comprobando…';try{const result=await api('/api/test-model',{method:'POST',body:JSON.stringify(state.model)});state.model.model=result.model;$('#model-name').value=result.model;$('#model-endpoint').value=result.endpoint;status.textContent=`Conectado · ${result.model} · ${result.latency_ms} ms`;status.className='inline-status success'}catch(error){status.textContent=error.message;status.className='inline-status error'}});
  $$('#module-picker input').forEach(input=>input.addEventListener('change',()=>{state.modules[input.dataset.module]=input.checked;syncContext()}));
  $('#ui-language').value=state.uiLanguage; $('#ui-language').addEventListener('change',event=>{state.uiLanguage=event.target.value;applyLanguage()}); $('#model-language').addEventListener('change',event=>state.modelLanguage=event.target.value);
  $('#ui-theme').value=state.uiTheme; $('#ui-theme').addEventListener('change',event=>{state.uiTheme=event.target.value;applyTheme()});
  $('#model-context').addEventListener('input',event=>{state.dataContext=event.target.value;sessionStorage.setItem('ttd-data-context',state.dataContext)});
  $('#save-settings').addEventListener('click',event=>{event.preventDefault();syncModel();state.dataContext=$('#model-context').value;sessionStorage.setItem('ttd-data-context',state.dataContext);syncContext();$('#settings-dialog').close();toast('Configuración guardada para esta sesión.')});
  $('#ask-form').addEventListener('submit',event=>{event.preventDefault();ask($('#question').value)}); $('#question').addEventListener('input',resizeComposer); $('#question').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('#ask-form').requestSubmit()}});
  $$('.suggestion').forEach(button=>button.addEventListener('click',()=>ask(button.dataset.question)));
  $('#new-chat').addEventListener('click',newChat); $('#clear-history').addEventListener('click',newChat);
  $('#mic-button').addEventListener('click',toggleSpeech);
}

function syncModel(){state.model={endpoint:$('#model-endpoint').value.trim(),model:$('#model-name').value.trim(),auth_type:$('#auth-type').value,token:$('#model-token').value,api_key_id:$('#api-key-id').value,api_key_value:$('#api-key-value').value}}

function showConnector(mode){
  $$('.connector-fields').forEach(panel=>panel.hidden=panel.id!==`${mode}-fields`);
  $$('.connection-route span').forEach((step,index)=>step.classList.toggle('active',index<2));
}

function connectionSpecFromForm(){
  const mode=$('input[name="connection-mode"]:checked').value;
  if(mode==='postgresql'){
    const url=$('#postgres-url').value.trim(),database=$('#postgres-database').value.trim(),username=$('#postgres-user').value.trim();
    if(!/^(?:jdbc:)?postgres(?:ql)?:\/\//i.test(url))throw new Error('La URL debe comenzar por postgresql:// o jdbc:postgresql://.');
    if(!database)throw new Error('Indica la base de datos inicial de PostgreSQL.');
    if(!username)throw new Error('Indica el usuario de PostgreSQL.');
    return {engine:'postgresql',label:'PostgreSQL',url,database,username,password:$('#postgres-password').value};
  }
  if(mode==='cloudera'){
    const name=$('#cloudera-connection-name').value.trim(),username=$('#cloudera-user').value.trim(),workload_password=$('#cloudera-workload-password').value;
    if(!name)throw new Error('Indica el nombre de la conexión registrada en Cloudera.');
    if(!username)throw new Error('Indica el usuario de Cloudera.');
    if(!workload_password)throw new Error('Indica la Workload Password de Cloudera.');
    return {engine:'cloudera',label:name,name,cml_registered:true,username,workload_password};
  }
  const jdbc_url=$('#trino-url').value.trim();
  if(!jdbc_url.startsWith('jdbc:trino://'))throw new Error('La URL debe comenzar por jdbc:trino://.');
  return {engine:'trino',label:'Trino',jdbc_url,username:$('#trino-user').value.trim(),password:$('#trino-password').value};
}

async function connectDataSource(){
  const button=$('#connect-data-source'),status=$('#connection-status');
  const previous={connectionSpec:state.connectionSpec,database:state.database,tables:[...state.tables],profiles:[...state.profiles]};
  try{
    const spec=connectionSpecFromForm();button.disabled=true;button.textContent='Conectando…';status.textContent='Comprobando acceso y descubriendo bases de datos…';status.className='inline-status';
    state.connectionSpec=spec;state.database=spec.database||'';state.tables=[];state.profiles=[];
    await loadDatabases();await loadTables();syncContext();
    $$('.connection-route span').forEach(step=>step.classList.add('active'));
    status.textContent='Conexión lista. Elige una base de datos y sus tablas.';status.className='inline-status success';toast(`${spec.label}: conexión disponible.`);
  }catch(error){state.connectionSpec=previous.connectionSpec;state.database=previous.database;state.tables=previous.tables;state.profiles=previous.profiles;syncContext();status.textContent=error.message;status.className='inline-status error';setDbStatus('La conexión anterior sigue activa',true);toast(error.message,true)}
  finally{button.disabled=false;button.textContent='Conectar y descubrir bases de datos'}
}
async function newChat(){await api('/api/history',{method:'DELETE'});location.reload()}

let recognition;
function toggleSpeech(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition){toast('El reconocimiento de voz no está disponible en este navegador.',true);return}
  if(recognition){recognition.stop();return} recognition=new SpeechRecognition();recognition.lang={es:'es-ES',en:'en-US',it:'it-IT',de:'de-DE',fr:'fr-FR'}[state.uiLanguage];recognition.interimResults=true;
  recognition.onstart=()=>{$('#mic-button').classList.add('listening');$('#mic-status').textContent='Escuchando…'}; recognition.onresult=event=>{$('#question').value=[...event.results].map(result=>result[0].transcript).join('');resizeComposer()}; recognition.onend=()=>{$('#mic-button').classList.remove('listening');$('#mic-status').textContent='';recognition=null}; recognition.onerror=event=>toast(`Micrófono: ${event.error}`,true); recognition.start();
}

bindEvents(); initialize();
