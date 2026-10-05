const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const languages = ['es','ca','eu','gl','en','fr','it','de'];
const validLanguage = code => languages.includes(code) ? code : 'es';
const state = {
  workspace: { connections: [], models: [], chats: [] },
  chatId: localStorage.getItem('ttd-chat-id') || '',
  view: 'chat', connectionTicket: '', modelTicket: '', pendingConnection: 0, pendingTables: 0, pendingModel: 0,
  modules: { summary: true, table: true, chart: true, map: true, sql: true },
  uiTheme: localStorage.getItem('ttd-theme') || 'dark',
  uiLanguage: validLanguage(localStorage.getItem('ttd-language')),
  modelLanguage: validLanguage(localStorage.getItem('ttd-model-language') || sessionStorage.getItem('ttd-model-language')),
  chat: null, busy: false
};
const translations = {
  en: {
    '＋ Nuevo chat':'＋ New chat','＋ Conexión':'＋ Connection','＋ Modelo':'＋ Model','Chats':'Chats','Conexiones':'Connections','Modelos':'Models',
    'Chats guardados en este navegador':'Chats saved for this browser','Listo para preguntar':'Ready to ask','Solo consulta':'View only','Todavía no hay chats.':'No chats yet.','CONEXIONES':'CONNECTIONS','MODELOS':'MODELS','Espacio de trabajo':'Workspace',
    'Una pregunta empieza':'A question starts','con los datos correctos.':'with the right data.','Crea un chat y elige la conexión y el modelo. Analizaré las tablas seleccionadas antes de la primera pregunta.':'Create a chat and choose the connection and model. I will analyze the selected tables before your first question.','Crear un chat':'Create a chat','Pregunta':'Question','↵ enviar · ⇧↵ nueva línea':'↵ send · ⇧↵ new line','CONEXIÓN':'CONNECTION','MODELO':'MODEL','ANÁLISIS PRELIMINAR':'PRELIMINARY ANALYSIS','Ya conozco estas tablas':'I have analyzed these tables',
    'Fuentes de datos':'Data sources','Modelos LLM':'LLM models','Conversación':'Conversation',
    'Prueba el acceso, elige la base de datos y selecciona hasta 12 tablas. El perfil se calcula al guardar.':'Test access, choose a database and select up to 12 tables. Profiling runs when you save.',
    'Configura el endpoint y pruébalo con una petición real antes de guardarlo.':'Configure the endpoint and test it with a real request before saving.',
    'Nueva conexión':'New connection','Nuevo modelo':'New model','Nombre para reconocerla':'Display name','Nombre para reconocerlo':'Display name',
    'Tipo de conexión':'Connection type','Nombre registrado en CML':'CML registered name','Usuario':'User','Workload Password':'Workload Password',
    'URL del servidor':'Server URL','Base inicial':'Initial database','Contraseña':'Password','Base de datos / esquema':'Database / schema',
    'Tablas disponibles':'Available tables','Solo las elegidas estarán al alcance del modelo en este chat.':'Only selected tables will be available to the model in this chat.',
    'Seleccionar todas':'Select all','1 · Probar y descubrir bases':'1 · Test and discover databases','2 · Guardar y analizar tablas':'2 · Save and profile tables',
    'Model ID':'Model ID','Endpoint':'Endpoint','Autenticación':'Authentication','Token':'Token','1 · Probar modelo':'1 · Test model','2 · Guardar modelo probado':'2 · Save tested model',
    'Prepara tu chat':'Set up your chat','El chat quedará ligado a esta conexión y este modelo.':'This chat will use this connection and model.','Conexión':'Connection','Modelo':'Model','Cancelar':'Cancel','Crear y analizar datos':'Create and analyze data',
    'Cómo responder':'Response preferences','Módulos':'Modules','Resumen':'Summary','Tabla':'Table','Gráfica':'Chart','Mapa':'Map',
    'Idioma de la aplicación':'App language','Idioma de las respuestas':'Response language','Apariencia':'Appearance','Guardar preferencias':'Save preferences',
    'Este chat':'This chat','Elige una conexión y un modelo para iniciar un chat.':'Choose a connection and model to start a chat.','TABLAS Y COLUMNAS':'TABLES AND COLUMNS',
    'INSTRUCCIONES ADICIONALES':'ADDITIONAL INSTRUCTIONS','MÓDULOS DE RESPUESTA':'RESPONSE MODULES','Se aplican solo a este chat.':'Applies only to this chat.',
    'La IA puede cometer errores. Revisa la consulta SQL antes de tomar decisiones.':'AI can make mistakes. Review the SQL before making decisions.','tablas':'tables','columnas perfiladas':'profiled columns','distintos':'distinct','Eliminar':'Delete','Modelo de demostración':'Demo model','Modelo local de demostración':'Local demo model','Modelo eliminado':'Deleted model','Crea primero una conexión y un modelo.':'Create a connection and model first.','El modelo de demostración solo admite datos demo. Prueba y guarda un modelo para esta conexión.':'The demo model only supports demo data. Test and save a model for this connection.'
  },
  it: {
    '＋ Nuevo chat':'＋ Nuova chat','＋ Conexión':'＋ Connessione','＋ Modelo':'＋ Modello','Chats':'Chat','Conexiones':'Connessioni','Modelos':'Modelli',
    'Chats guardados en este navegador':'Chat salvate per questo browser','Listo para preguntar':'Pronta per le domande','Solo consulta':'Sola lettura','Todavía no hay chats.':'Nessuna chat.','CONEXIONES':'CONNESSIONI','MODELOS':'MODELLI','Espacio de trabajo':'Area di lavoro',
    'Una pregunta empieza':'Una domanda inizia','con los datos correctos.':'con i dati giusti.','Crea un chat y elige la conexión y el modelo. Analizaré las tablas seleccionadas antes de la primera pregunta.':'Crea una chat e scegli connessione e modello. Analizzerò le tabelle selezionate prima della prima domanda.','Crear un chat':'Crea una chat','Pregunta':'Domanda','↵ enviar · ⇧↵ nueva línea':'↵ invia · ⇧↵ nuova riga','CONEXIÓN':'CONNESSIONE','MODELO':'MODELLO','ANÁLISIS PRELIMINAR':'ANALISI PRELIMINARE','Ya conozco estas tablas':'Ho analizzato queste tabelle',
    'Fuentes de datos':'Origini dati','Modelos LLM':'Modelli LLM','Conversación':'Conversazione',
    'Prueba el acceso, elige la base de datos y selecciona hasta 12 tablas. El perfil se calcula al guardar.':'Verifica l’accesso, scegli il database e fino a 12 tabelle. Il profilo viene creato al salvataggio.',
    'Configura el endpoint y pruébalo con una petición real antes de guardarlo.':'Configura l’endpoint e provalo con una richiesta reale prima di salvarlo.',
    'Nueva conexión':'Nuova connessione','Nuevo modelo':'Nuovo modello','Nombre para reconocerla':'Nome visualizzato','Nombre para reconocerlo':'Nome visualizzato',
    'Tipo de conexión':'Tipo di connessione','Nombre registrado en CML':'Nome registrato in CML','Usuario':'Utente','URL del servidor':'URL del server','Base inicial':'Database iniziale','Contraseña':'Password','Base de datos / esquema':'Database / schema',
    'Tablas disponibles':'Tabelle disponibili','Solo las elegidas estarán al alcance del modelo en este chat.':'Solo le tabelle selezionate saranno disponibili al modello in questa chat.',
    'Seleccionar todas':'Seleziona tutte','1 · Probar y descubrir bases':'1 · Verifica e scopri i database','2 · Guardar y analizar tablas':'2 · Salva e analizza le tabelle',
    'Autenticación':'Autenticazione','1 · Probar modelo':'1 · Prova il modello','2 · Guardar modelo probado':'2 · Salva il modello verificato',
    'Prepara tu chat':'Prepara la chat','El chat quedará ligado a esta conexión y este modelo.':'La chat userà questa connessione e questo modello.','Conexión':'Connessione','Modelo':'Modello','Cancelar':'Annulla','Crear y analizar datos':'Crea e analizza i dati',
    'Cómo responder':'Preferenze di risposta','Módulos':'Moduli','Resumen':'Riepilogo','Tabla':'Tabella','Gráfica':'Grafico','Mapa':'Mappa',
    'Idioma de la aplicación':'Lingua dell’app','Idioma de las respuestas':'Lingua delle risposte','Apariencia':'Aspetto','Guardar preferencias':'Salva preferenze',
    'Este chat':'Questa chat','Elige una conexión y un modelo para iniciar un chat.':'Scegli una connessione e un modello per iniziare.','TABLAS Y COLUMNAS':'TABELLE E COLONNE','INSTRUCCIONES ADICIONALES':'ISTRUZIONI AGGIUNTIVE','MÓDULOS DE RESPUESTA':'MODULI DI RISPOSTA','Se aplican solo a este chat.':'Si applicano solo a questa chat.',
    'La IA puede cometer errores. Revisa la consulta SQL antes de tomar decisiones.':'L’IA può sbagliare. Controlla la query SQL prima di decidere.','tablas':'tabelle','columnas perfiladas':'colonne profilate','distintos':'distinti','Eliminar':'Elimina','Modelo de demostración':'Modello demo','Modelo local de demostración':'Modello demo locale','Modelo eliminado':'Modello eliminato','Crea primero una conexión y un modelo.':'Crea prima una connessione e un modello.','El modelo de demostración solo admite datos demo. Prueba y guarda un modelo para esta conexión.':'Il modello demo supporta solo dati demo. Prova e salva un modello per questa connessione.'
  },
  de: {
    '＋ Nuevo chat':'＋ Neuer Chat','＋ Conexión':'＋ Verbindung','＋ Modelo':'＋ Modell','Chats':'Chats','Conexiones':'Verbindungen','Modelos':'Modelle',
    'Chats guardados en este navegador':'Chats für diesen Browser gespeichert','Listo para preguntar':'Bereit für Fragen','Solo consulta':'Nur ansehen','Todavía no hay chats.':'Noch keine Chats.','CONEXIONES':'VERBINDUNGEN','MODELOS':'MODELLE','Espacio de trabajo':'Arbeitsbereich',
    'Una pregunta empieza':'Eine Frage beginnt','con los datos correctos.':'mit den richtigen Daten.','Crea un chat y elige la conexión y el modelo. Analizaré las tablas seleccionadas antes de la primera pregunta.':'Erstelle einen Chat und wähle Verbindung und Modell. Ich analysiere die Tabellen vor deiner ersten Frage.','Crear un chat':'Chat erstellen','Pregunta':'Frage','↵ enviar · ⇧↵ nueva línea':'↵ senden · ⇧↵ neue Zeile','CONEXIÓN':'VERBINDUNG','MODELO':'MODELL','ANÁLISIS PRELIMINAR':'VORABANALYSE','Ya conozco estas tablas':'Diese Tabellen sind analysiert',
    'Fuentes de datos':'Datenquellen','Modelos LLM':'LLM-Modelle','Conversación':'Unterhaltung',
    'Prueba el acceso, elige la base de datos y selecciona hasta 12 tablas. El perfil se calcula al guardar.':'Prüfe den Zugang, wähle die Datenbank und bis zu 12 Tabellen. Das Profil wird beim Speichern erstellt.',
    'Configura el endpoint y pruébalo con una petición real antes de guardarlo.':'Konfiguriere den Endpunkt und teste ihn vor dem Speichern mit einer echten Anfrage.',
    'Nueva conexión':'Neue Verbindung','Nuevo modelo':'Neues Modell','Nombre para reconocerla':'Anzeigename','Nombre para reconocerlo':'Anzeigename',
    'Tipo de conexión':'Verbindungstyp','Nombre registrado en CML':'In CML registrierter Name','Usuario':'Benutzer','URL del servidor':'Server-URL','Base inicial':'Anfangsdatenbank','Contraseña':'Passwort','Base de datos / esquema':'Datenbank / Schema',
    'Tablas disponibles':'Verfügbare Tabellen','Solo las elegidas estarán al alcance del modelo en este chat.':'Nur ausgewählte Tabellen sind für das Modell in diesem Chat verfügbar.',
    'Seleccionar todas':'Alle auswählen','1 · Probar y descubrir bases':'1 · Datenbanken testen und finden','2 · Guardar y analizar tablas':'2 · Tabellen speichern und analysieren',
    'Autenticación':'Authentifizierung','1 · Probar modelo':'1 · Modell testen','2 · Guardar modelo probado':'2 · Geprüftes Modell speichern',
    'Prepara tu chat':'Chat einrichten','El chat quedará ligado a esta conexión y este modelo.':'Dieser Chat verwendet diese Verbindung und dieses Modell.','Conexión':'Verbindung','Modelo':'Modell','Cancelar':'Abbrechen','Crear y analizar datos':'Erstellen und Daten analysieren',
    'Cómo responder':'Antworteinstellungen','Módulos':'Module','Resumen':'Zusammenfassung','Tabla':'Tabelle','Gráfica':'Diagramm','Mapa':'Karte',
    'Idioma de la aplicación':'App-Sprache','Idioma de las respuestas':'Antwortsprache','Apariencia':'Darstellung','Guardar preferencias':'Einstellungen speichern',
    'Este chat':'Dieser Chat','Elige una conexión y un modelo para iniciar un chat.':'Wähle eine Verbindung und ein Modell, um zu beginnen.','TABLAS Y COLUMNAS':'TABELLEN UND SPALTEN','INSTRUCCIONES ADICIONALES':'ZUSÄTZLICHE ANWEISUNGEN','MÓDULOS DE RESPUESTA':'ANTWORTMODULE','Se aplican solo a este chat.':'Gilt nur für diesen Chat.',
    'La IA puede cometer errores. Revisa la consulta SQL antes de tomar decisiones.':'KI kann Fehler machen. Prüfe die SQL-Abfrage vor Entscheidungen.','tablas':'Tabellen','columnas perfiladas':'profilierte Spalten','distintos':'verschiedene','Eliminar':'Löschen','Modelo de demostración':'Demomodell','Modelo local de demostración':'Lokales Demomodell','Modelo eliminado':'Gelöschtes Modell','Crea primero una conexión y un modelo.':'Erstelle zuerst eine Verbindung und ein Modell.','El modelo de demostración solo admite datos demo. Prueba y guarda un modelo para esta conexión.':'Das Demomodell unterstützt nur Demodaten. Teste und speichere ein Modell für diese Verbindung.'
  },
  fr: {
    '＋ Nuevo chat':'＋ Nouveau chat','＋ Conexión':'＋ Connexion','＋ Modelo':'＋ Modèle','Chats':'Chats','Conexiones':'Connexions','Modelos':'Modèles',
    'Chats guardados en este navegador':'Chats enregistrés pour ce navigateur','Listo para preguntar':'Prêt pour les questions','Solo consulta':'Lecture seule','Todavía no hay chats.':'Aucun chat pour le moment.','CONEXIONES':'CONNEXIONS','MODELOS':'MODÈLES','Espacio de trabajo':'Espace de travail',
    'Una pregunta empieza':'Une question commence','con los datos correctos.':'avec les bonnes données.','Crea un chat y elige la conexión y el modelo. Analizaré las tablas seleccionadas antes de la primera pregunta.':'Créez un chat et choisissez la connexion et le modèle. J’analyserai les tables avant votre première question.','Crear un chat':'Créer un chat','Pregunta':'Question','↵ enviar · ⇧↵ nueva línea':'↵ envoyer · ⇧↵ nouvelle ligne','CONEXIÓN':'CONNEXION','MODELO':'MODÈLE','ANÁLISIS PRELIMINAR':'ANALYSE PRÉLIMINAIRE','Ya conozco estas tablas':'J’ai analysé ces tables',
    'Fuentes de datos':'Sources de données','Modelos LLM':'Modèles LLM','Conversación':'Conversation',
    'Prueba el acceso, elige la base de datos y selecciona hasta 12 tablas. El perfil se calcula al guardar.':'Testez l’accès, choisissez la base de données et jusqu’à 12 tables. Le profil est créé à l’enregistrement.',
    'Configura el endpoint y pruébalo con una petición real antes de guardarlo.':'Configurez le point de terminaison et testez-le avec une vraie requête avant l’enregistrement.',
    'Nueva conexión':'Nouvelle connexion','Nuevo modelo':'Nouveau modèle','Nombre para reconocerla':'Nom affiché','Nombre para reconocerlo':'Nom affiché',
    'Tipo de conexión':'Type de connexion','Nombre registrado en CML':'Nom enregistré dans CML','Usuario':'Utilisateur','URL del servidor':'URL du serveur','Base inicial':'Base initiale','Contraseña':'Mot de passe','Base de datos / esquema':'Base / schéma',
    'Tablas disponibles':'Tables disponibles','Solo las elegidas estarán al alcance del modelo en este chat.':'Seules les tables sélectionnées seront accessibles au modèle dans ce chat.',
    'Seleccionar todas':'Tout sélectionner','1 · Probar y descubrir bases':'1 · Tester et découvrir les bases','2 · Guardar y analizar tablas':'2 · Enregistrer et analyser les tables',
    'Autenticación':'Authentification','1 · Probar modelo':'1 · Tester le modèle','2 · Guardar modelo probado':'2 · Enregistrer le modèle testé',
    'Prepara tu chat':'Préparer le chat','El chat quedará ligado a esta conexión y este modelo.':'Ce chat utilisera cette connexion et ce modèle.','Conexión':'Connexion','Modelo':'Modèle','Cancelar':'Annuler','Crear y analizar datos':'Créer et analyser les données',
    'Cómo responder':'Préférences de réponse','Módulos':'Modules','Resumen':'Résumé','Tabla':'Tableau','Gráfica':'Graphique','Mapa':'Carte',
    'Idioma de la aplicación':'Langue de l’application','Idioma de las respuestas':'Langue des réponses','Apariencia':'Apparence','Guardar preferencias':'Enregistrer les préférences',
    'Este chat':'Ce chat','Elige una conexión y un modelo para iniciar un chat.':'Choisissez une connexion et un modèle pour commencer.','TABLAS Y COLUMNAS':'TABLES ET COLONNES','INSTRUCCIONES ADICIONALES':'INSTRUCTIONS SUPPLÉMENTAIRES','MÓDULOS DE RESPUESTA':'MODULES DE RÉPONSE','Se aplican solo a este chat.':'S’applique uniquement à ce chat.',
    'La IA puede cometer errores. Revisa la consulta SQL antes de tomar decisiones.':'L’IA peut se tromper. Vérifiez la requête SQL avant de décider.','tablas':'tables','columnas perfiladas':'colonnes profilées','distintos':'distincts','Eliminar':'Supprimer','Modelo de demostración':'Modèle de démonstration','Modelo local de demostración':'Modèle de démonstration local','Modelo eliminado':'Modèle supprimé','Crea primero una conexión y un modelo.':'Créez d’abord une connexion et un modèle.','El modelo de demostración solo admite datos demo. Prueba y guarda un modelo para esta conexión.':'Le modèle de démonstration accepte seulement les données de démonstration. Testez et enregistrez un modèle pour cette connexion.'
  }
};
for (const code of languages) translations[code] = Object.assign({}, translations[code] || {}, extraTranslations[code] || {}, dynamicTranslations[code] || {}, supplementalTranslations[code] || {}, errorTranslations[code] || {}, accessibilityTranslations[code] || {}, clouderaAuthTranslations[code] || {}, chartControlTranslations[code] || {}, themeControlTranslations[code] || {});
const originalText = new WeakMap();
function t(key) { return (translations[state.uiLanguage]||{})[key]||key; }
function tf(key, values={}) { return t(key).replace(/\{(\w+)\}/g, (_,name)=>String(values[name]??'')); }
function translateStatic() {
  const map = translations[state.uiLanguage] || {};
  const roots = ['.brand','.sidebar-actions','.main-nav','.sidebar-foot','.sidebar-lists section > h2','.management-intro','#connection-form','#model-form','#new-chat-dialog','#preferences-dialog','.context-head','#context-empty','#context-active','.disclaimer','.welcome','.crumb','.composer-wrap','.top-language'];
  for(const selector of roots) {
    for(const root of $$(selector)) {
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()) {
        const node=walker.currentNode;
        if(!originalText.has(node))originalText.set(node,node.nodeValue);
        const original=originalText.get(node),key=original.trim();
        if(key && map[key])node.nodeValue=original.replace(key,map[key]);
        else node.nodeValue=original;
      }
    }
  }
  for (const input of $$('[placeholder]')) {
    if(!input.dataset.originalPlaceholder)input.dataset.originalPlaceholder=input.getAttribute('placeholder');
    input.placeholder=t(input.dataset.originalPlaceholder);
  }
  for (const element of $$('[aria-label],[title]')) {
    for (const attribute of ['aria-label','title']) {
      if(!element.hasAttribute(attribute))continue;
      const key=attribute==='aria-label'?'originalAriaLabel':'originalTitle';
      if(!element.dataset[key])element.dataset[key]=element.getAttribute(attribute);
      element.setAttribute(attribute,t(element.dataset[key]));
    }
  }
  one('question').placeholder=t('Pregunta algo sobre tus datos…');
  one('model-context').placeholder=t('Ej.: responde siempre en español; trata las fechas como DATE');
  for (const [id,key] of [['context-toggle','Mostrar contexto del chat'],['context-close','Cerrar contexto'],['open-preferences','Preferencias'],['question','Pregunta'],['mic-button','Dictar pregunta'],['send-button','Enviar pregunta'],['top-language','Idioma de la aplicación y las respuestas']]) one(id).setAttribute('aria-label',t(key));
  one('mic-button').title=t('Dictar pregunta');
  one('top-language').value=state.uiLanguage;
  updateThemeControl();
  document.documentElement.lang=state.uiLanguage;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}
async function api(path, options = {}) {
  const response = await fetch(path, { headers:{'Content-Type':'application/json','Accept-Language':state.uiLanguage}, ...options });
  const payload = await response.json().catch(() => ({ok:false,error:t('Respuesta no válida del servidor.')}));
  if (!response.ok || !payload.ok) {
    const error=new Error(t(payload.error || 'Error ' + response.status));
    error.cause=payload.cause||'';error.sql=payload.sql||'';error.stage=payload.stage||'';
    throw error;
  }
  return payload.data;
}
function toast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = error ? 'show error' : 'show';
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.className = ''; }, 4200);
}
function status(selector, message, error = false) {
  const el = $(selector); el.textContent = message; el.className = 'inline-status ' + (error ? 'error' : 'success');
}
function one(id) { return document.getElementById(id); }
function value(id) { return one(id).value.trim(); }
function post(path, body) { return api(path, {method:'POST', body:JSON.stringify(body)}); }
function connectionById(id) { return state.workspace.connections.find(item => item.id === id); }
function modelById(id) { return state.workspace.models.find(item => item.id === id); }
function chatById(id) { return state.workspace.chats.find(item => item.id === id); }

async function refreshWorkspace() {
  state.workspace = await api('/api/workspace');
  renderSidebar(); renderCatalogs(); renderChatSelectors(); renderContext();
}
function setView(view) {
  state.view = view;
  one('context-panel').classList.remove('open');one('context-toggle').setAttribute('aria-expanded','false');
  for (const name of ['chat','connections','models']) one('view-' + name).hidden = name !== view;
  $$('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  const labels = {chat:['Chats','Conversación'],connections:['Conexiones','Fuentes de datos'],models:['Modelos','Modelos LLM']};
  const map=translations[state.uiLanguage]||{};
  one('view-crumb').textContent = map[labels[view][0]]||labels[view][0]; one('view-title').textContent = map[labels[view][1]]||labels[view][1];
  translateStatic();
  if (view === 'chat') renderContext();
}
function listItem(item, kind, secondary, active = false, archived = false) {
  const title = kind==='chat' && item.title?.endsWith(' · Nuevo chat') ? item.title.slice(0,-'Nuevo chat'.length)+t('Nuevo chat') : item.title;
  const label = escapeHtml(item.label || title);
  return '<div class="sidebar-record' + (active ? ' selected' : '') + (archived ? ' archived' : '') + '">' +
    '<button type="button" data-open-' + kind + '="' + escapeHtml(item.id) + '" title="' + label + '"' + (active ? ' aria-current="true"' : '') + '>' +
    '<strong>' + label + '</strong><small>' + escapeHtml(secondary) + '</small></button>' +
    (item.id === 'demo' ? '' : '<button type="button" class="record-delete" data-delete-' + kind + '="' + escapeHtml(item.id) + '" aria-label="' + escapeHtml(t('Eliminar')+' '+(item.label||item.title)) + '" title="'+escapeHtml(t('Eliminar'))+'">×</button>') +
    '</div>';
}
function renderSidebar() {
  one('chat-count').textContent = state.workspace.chats.length;
  one('connection-count').textContent = state.workspace.connections.length;
  one('model-count').textContent = state.workspace.models.length;
  one('chat-list').innerHTML = state.workspace.chats.map(item => {
    const connected=!!connectionById(item.connection_id)&&!!modelById(item.model_id);
    const source=connectionById(item.connection_id)?.label || item.connection_snapshot?.label || t('Conexión no disponible');
    return listItem(item,'chat',source+' · '+t(connected?'Listo para preguntar':'Solo consulta'),item.id === state.chatId,!connected);
  }).join('') || '<p class="muted-small">'+escapeHtml((translations[state.uiLanguage]||{})['Todavía no hay chats.']||'Todavía no hay chats.')+'</p>';
  one('connection-list').innerHTML = state.workspace.connections.map(item => listItem(item,'connection',item.database + ' · ' + item.tables.length + ' ' + t('tablas'))).join('');
  one('model-list').innerHTML = state.workspace.models.map(item => listItem(item.id==='demo'?{...item,label:t('Modelo de demostración')}:item,'model',item.model)).join('');
}
function renderCatalogs() {
  one('connection-cards').innerHTML = state.workspace.connections.map(item => '<article class="catalog-card"><div><span class="card-kicker">' + escapeHtml(item.database) + '</span><h3>' + escapeHtml(item.label) + '</h3><p>' + item.tables.length + ' '+t('tablas')+' · ' + item.profiles.reduce((sum,p) => sum + p.columns.length,0) + ' '+t('columnas perfiladas')+'</p></div>' + (item.id === 'demo' ? '<span class="builtin-badge">Demo</span>' : '<button type="button" class="secondary-button" data-delete-connection="' + escapeHtml(item.id) + '">'+t('Eliminar')+'</button>') + '</article>').join('');
  one('model-cards').innerHTML = state.workspace.models.map(item => '<article class="catalog-card"><div><span class="card-kicker">' + escapeHtml(item.model) + '</span><h3>' + escapeHtml(item.id==='demo'?t('Modelo de demostración'):item.label) + '</h3><p>' + escapeHtml(item.endpoint || t('Modelo local de demostración')) + '</p></div>' + (item.id === 'demo' ? '<span class="builtin-badge">Demo</span>' : '<button type="button" class="secondary-button" data-delete-model="' + escapeHtml(item.id) + '">'+t('Eliminar')+'</button>') + '</article>').join('');
}
function renderChatSelectors() {
  const previousConnection = value('chat-connection'), previousModel = value('chat-model');
  one('chat-connection').innerHTML = state.workspace.connections.map(item => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.label) + ' · ' + escapeHtml(item.database) + '</option>').join('');
  if (connectionById(previousConnection)) one('chat-connection').value = previousConnection;
  one('chat-model').innerHTML = state.workspace.models.map(item => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.id==='demo'?t('Modelo de demostración'):item.label) + '</option>').join('');
  if (modelById(previousModel)) one('chat-model').value = previousModel;
  if (value('chat-connection') !== 'demo' && value('chat-model') === 'demo') {
    const usable = state.workspace.models.find(item => item.id !== 'demo');
    if (usable) one('chat-model').value = usable.id;
  }
  const connection = connectionById(value('chat-connection')), model = modelById(value('chat-model'));
  const incompatible = connection && model && model.id === 'demo' && connection.id !== 'demo';
  one('chat-selection-preview').textContent = incompatible ? t('El modelo de demostración solo admite datos demo. Prueba y guarda un modelo para esta conexión.') : connection && model ? connection.tables.length + ' '+t('tablas')+' · ' + connection.database + ' · ' + model.model : t('Crea primero una conexión y un modelo.');
  one('create-chat').disabled = !connection || !model || incompatible;
}
function renderContext() {
  const item = chatById(state.chatId), liveConnection = item && connectionById(item.connection_id), liveModel = item && modelById(item.model_id);
  const connection = liveConnection || item?.connection_snapshot, model = liveModel || item?.model_snapshot;
  one('context-empty').hidden = !!item; one('context-active').hidden = !item;
  one('active-badges').innerHTML = item ? '<span class="source-pill">' + escapeHtml(connection?.label || t('Conexión no disponible')) + '</span><span class="source-pill">' + escapeHtml(model?.id==='demo'?t('Modelo de demostración'):model?.label || t('Modelo eliminado')) + '</span>' : '';
  one('question').disabled = !item || !liveConnection || !liveModel || state.busy;
  one('question').placeholder = item && (!liveConnection || !liveModel) ? t('Historial disponible. La conexión o el modelo ya no están disponibles.') : t('Pregunta algo sobre tus datos…');
  one('send-button').disabled = one('question').disabled;
  if (!item) return;
  one('context-connection').textContent = connection?.label || t('Conexión no disponible');
  one('context-database').textContent = connection?.database || t('No disponible');
  one('context-model').textContent = model?.id==='demo'?t('Modelo de demostración'):model?.label || t('Modelo eliminado');
  one('context-model-id').textContent = model?.model || t('No disponible');
  const profiles = connection?.profiles || [];
  one('column-count').textContent = profiles.reduce((sum,p) => sum + p.columns.length,0);
  one('context-columns').innerHTML = profiles.map((profile,index) => '<details class="schema-table"' + (index === 0 ? ' open' : '') + '><summary><b>' + escapeHtml(profile.table) + '</b><small>' + profile.columns.length + '</small></summary><div>' + profile.columns.map(column => '<div class="schema-column" title="' + escapeHtml((column.examples || []).join(' · ')) + '"><span><b>' + escapeHtml(column.name) + '</b><small>' + escapeHtml(column.type) + '</small></span><em>' + column.unique + ' '+t('distintos')+'</em></div>').join('') + '</div></details>').join('');
  one('model-context').value = item.instructions || '';
  one('active-modules').innerHTML = Object.entries(state.modules).filter(([,on]) => on).map(([name]) => '<span>' + t(({summary:'Resumen',table:'Tabla',chart:'Gráfica',map:'Mapa',sql:'SQL'}[name])) + '</span>').join('');
}
function welcome() {
  return '<div class="welcome"><div class="spark-logo">✦</div><p class="eyebrow">AI DATA ASSISTANT</p><h2>'+escapeHtml(t('Una pregunta empieza'))+'<br><em>'+escapeHtml(t('con los datos correctos.'))+'</em></h2><p class="welcome-copy">'+escapeHtml(t('Crea un chat y elige la conexión y el modelo. Analizaré las tablas seleccionadas antes de la primera pregunta.'))+'</p><button type="button" class="primary-button" data-open-new-chat>'+escapeHtml(t('Crear un chat'))+'</button></div>';
}
async function openChat(chatId) {
  if (!chatById(chatId)) return;
  state.chatId = chatId; localStorage.setItem('ttd-chat-id',chatId); state.chat = null;
  setView('chat'); renderSidebar(); renderContext();
  one('chat-stream').innerHTML = '<div class="loading-state" role="status">'+escapeHtml(t('Cargando conversación…'))+'</div>';
  try {
    const chat = await api('/api/workspace/chats/' + encodeURIComponent(chatId));
    if (state.chatId !== chatId) return;
    state.chat = chat; renderCurrentChat();
  } catch(error) { if (state.chatId === chatId) renderError(error.message); }
}
function renderCurrentChat() {
  const stream=one('chat-stream');
  $$('.message',stream).forEach(destroyMap);
  stream.innerHTML='';
  if(!state.chat){stream.innerHTML=welcome();return;}
  renderOverview(state.chat);
  state.chat.messages.forEach(item=>{appendUser(item.question);if(item.kind==='error')renderError(item);else renderAnswer(item);});
  scrollChat();
}
function renderOverview(chat) {
  const node = document.createElement('article'); node.className = 'message assistant-message overview-message';
  node.innerHTML = '<div class="assistant-avatar">✦</div><div class="answer-body"><p class="eyebrow">'+escapeHtml((translations[state.uiLanguage]||{})['ANÁLISIS PRELIMINAR']||'ANÁLISIS PRELIMINAR')+'</p><h3>'+escapeHtml((translations[state.uiLanguage]||{})['Ya conozco estas tablas']||'Ya conozco estas tablas')+'</h3><p>' + escapeHtml(chat.overview) + '</p>' + (chat.warning ? '<p class="inline-status error">' + escapeHtml(chat.warning) + '</p>' : '') + '</div></div>';
  one('chat-stream').append(node);
}
function appendUser(text) {
  const node = document.createElement('div'); node.className = 'message user-message';
  node.innerHTML = '<div class="user-bubble">' + escapeHtml(text) + '</div>'; one('chat-stream').append(node); scrollChat();
}
function appendTyping() {
  const node = document.createElement('div'); node.className = 'message assistant-message';
  node.innerHTML = '<div class="assistant-avatar">✦</div><div class="answer-body"><div class="typing"><i></i><i></i><i></i></div></div>';
  one('chat-stream').append(node); scrollChat(); return node;
}
function renderError(input) {
  const error=typeof input==='string'?{message:input}:input;
  const stage={generation:'Generación de SQL',validation:'Validación de SQL',execution:'Ejecución de SQL'}[error.stage]||'';
  const node = document.createElement('div'); node.className = 'message assistant-message';
  node.innerHTML = '<div class="assistant-avatar">!</div><div class="answer-body query-error"><h3>'+escapeHtml(t(error.error||error.message||'No pude completar el análisis'))+'</h3>'+(stage?'<span class="error-stage">'+escapeHtml(t(stage))+'</span>':'')+(error.cause?'<p><strong>'+escapeHtml(t('Causa:'))+'</strong> '+escapeHtml(error.cause)+'</p>':'')+(error.sql?'<details open><summary>'+escapeHtml(t('SQL que se intentó ejecutar'))+'</summary><div class="sql-panel"><button type="button" class="copy-error-sql">'+escapeHtml(t('Copiar SQL'))+'</button><pre>'+highlightSql(error.sql)+'</pre></div></details>':'')+(!error.cause&&!error.sql?'<p>'+escapeHtml(error.message||'')+'</p>':'')+'</div>';
  one('chat-stream').append(node); scrollChat();
  $('.copy-error-sql',node)?.addEventListener('click',async event=>{try{await navigator.clipboard.writeText(error.sql);event.currentTarget.textContent=t('Copiado ✓');}catch{toast(t('No se pudo copiar la consulta.'),true);}});
}
function scrollChat() { requestAnimationFrame(() => { one('chat-stream').scrollTop = one('chat-stream').scrollHeight; }); }
function resizeComposer() { const el=one('question'); el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; }
async function ask(question) {
  question = question.trim(); if (!question || !state.chatId || state.busy) return;
  const chatId = state.chatId; state.busy = true; renderContext();
  appendUser(question); one('question').value = ''; resizeComposer();
  const typing = appendTyping();
  try {
    const result = await post('/api/workspace/chats/' + encodeURIComponent(chatId) + '/ask', {
      question, modules:state.modules, model_language:state.modelLanguage,
      additional_context:chatById(chatId)?.instructions || ''
    });
    typing.remove();
    if (state.chatId === chatId) {
      state.chat?.messages.push(result);
      renderAnswer(result);
    }
    await refreshWorkspace();
  } catch(error) {
    typing.remove();
    if (state.chatId === chatId) {
      const failed = {kind:'error',question,error:error.message,cause:error.cause||'',sql:error.sql||'',stage:error.stage||''};
      state.chat?.messages.push(failed);
      renderError(failed);
    }
  }
  finally { state.busy = false; renderContext(); if (state.chatId === chatId) one('question').focus(); }
}

function formatValue(value) { return typeof value === 'number' ? escapeHtml(new Intl.NumberFormat(state.uiLanguage,{maximumFractionDigits:2}).format(value)) : escapeHtml(value); }
function compactNumber(value) { return new Intl.NumberFormat(state.uiLanguage,{notation:'compact',maximumFractionDigits:1}).format(value); }
function renderAnswer(result) {
  const tabs = [];
  if (result.modules.table) tabs.push(['table',t('Tabla')]);
  if (result.modules.chart && result.chart !== 'none') tabs.push(['chart',t('Gráfica')]);
  if (result.modules.map && result.map.enabled) tabs.push(['map',t('Mapa')]);
  if (result.modules.sql) tabs.push(['sql','SQL']);
  const node=document.createElement('div'); node.className='message assistant-message';
  node.innerHTML='<div class="assistant-avatar">✦</div><div class="answer-body"><h3>'+escapeHtml(result.title)+'</h3>'+(result.modules.summary ? '<p>'+escapeHtml(result.summary)+'</p>' : '')+'<div class="answer-tabs">'+tabs.map(([key,label],index)=>'<button type="button" data-result-tab="'+key+'" class="'+(index===0?'active':'')+'">'+escapeHtml(label)+'</button>').join('')+'</div><div class="result-panel">'+(tabs.length?panelFor(tabs[0][0],result):'<div class="sql-panel">'+escapeHtml(t('No hay módulos activos.'))+'</div>')+'</div></div>';
  one('chat-stream').append(node);
  $$('[data-result-tab]',node).forEach(button=>button.addEventListener('click',()=>{
    destroyMap(node); $$('[data-result-tab]',node).forEach(other=>other.classList.toggle('active',other===button));
    $('.result-panel',node).innerHTML=panelFor(button.dataset.resultTab,result); bindPanel(node,result);
  }));
  bindPanel(node,result); scrollChat();
}
function panelFor(type,result) {
  if (type==='table') return '<div class="table-scroll"><table><thead><tr><th class="row-number" scope="col">#</th>'+result.columns.map(col=>'<th scope="col">'+escapeHtml(col)+'</th>').join('')+'</tr></thead><tbody>'+result.rows.map((row,index)=>'<tr><th class="row-number" scope="row">'+(index+1)+'</th>'+result.columns.map(col=>'<td>'+formatValue(row[col])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  if (type==='sql') return '<div class="sql-panel"><button type="button" class="copy-sql">'+escapeHtml(t('Copiar'))+'</button><pre>'+highlightSql(result.sql)+'</pre></div>';
  if (type==='map') return renderMap(result);
  return renderChart(result);
}
function bindPanel(node,result) {
  $('.copy-sql',node)?.addEventListener('click',async event=>{try { await navigator.clipboard.writeText(result.sql); event.currentTarget.textContent=t('Copiado ✓'); } catch { toast(t('No se pudo copiar la consulta.'),true); }});
  bindChartControls(node,result);
  initMap(node,result);
}
function highlightSql(sql) { return escapeHtml(sql).replace(/\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|ON|GROUP BY|ORDER BY|LIMIT|AS|SUM|COUNT|AVG|ROUND|DESC|ASC)\b/gi,'<span class="kw">$1</span>'); }

const chartColors=['var(--chart-1)','var(--chart-2)','var(--chart-3)','var(--chart-4)','var(--chart-5)','var(--chart-6)'];
const chartViews=new Map();
let chartSequence=0;
function chartView(result) {
  const key=result.id || result.title;
  if (!chartViews.has(key)) chartViews.set(key,{xZoom:1,axis:'left',left:null,right:null});
  return chartViews.get(key);
}
function axisNumber(value,span) {
  if (span>=10000) return compactNumber(value);
  const step=span/4;
  const decimals=step>=1?0:Math.min(8,Math.max(1,Math.ceil(-Math.log10(step))+1));
  return new Intl.NumberFormat(state.uiLanguage,{maximumFractionDigits:decimals}).format(value);
}
function chartColor(index) { return chartColors[index] || 'hsl(' + ((index * 137.5) % 360) + ' 68% 50%)'; }
function chartData(result) {
  const columns=result.columns, rows=result.rows;
  const numeric=columns.filter(col=>!/^(lat|latitude|latitud|lon|lng|longitude|longitud|.*_id)$/i.test(col) && rows.some(row=>typeof row[col]==='number'));
  const categorical=columns.filter(col=>!numeric.includes(col) && !/^(lat|latitude|latitud|lon|lng|longitude|longitud|.*_id)$/i.test(col));
  const xcol=categorical[0] || columns[0];
  let labels=[],series=[];
  if (numeric.length===1 && categorical.length>1) {
    const groups=[...new Set(rows.map(row=>String(row[categorical[1]]??'')))];
    labels=[...new Set(rows.map(row=>String(row[xcol]??'')))];
    const totals=new Map();
    rows.forEach(row=>{
      const key=JSON.stringify([String(row[xcol]??''),String(row[categorical[1]]??'')]);
      totals.set(key,(totals.get(key)||0)+(Number(row[numeric[0]])||0));
    });
    series=groups.map(group=>({name:group,values:labels.map(label=>totals.get(JSON.stringify([label,group]))||0)}));
  } else {
    labels=rows.map(row=>String(row[xcol]??''));
    series=numeric.map(name=>({name,values:rows.map(row=>Number(row[name])||0)}));
  }
  return {labels,series,xcol,rowCount:rows.length};
}
function renderChart(result) {
  const data=chartData(result);
  if (!data.series.length || !data.labels.length) return '<div class="sql-panel">'+escapeHtml(t('No hay categorías y medidas numéricas para visualizar.'))+'</div>';
  const count='<p class="chart-count">'+data.rowCount+' '+t('filas representadas')+' · '+data.labels.length+' '+t('posiciones en el eje X')+'</p>';
  if (result.chart==='donut' && data.series.length===1 && data.labels.length<=16) {
    const values=data.series[0].values,total=values.reduce((a,b)=>a+Math.max(0,b),0)||1;let cursor=0;
    const stops=values.map((value,i)=>{const start=cursor;cursor+=Math.max(0,value)/total*100;return chartColor(i)+' '+start+'% '+cursor+'%';}).join(',');
    return '<div class="donut-wrap"><div class="donut-stack"><div class="donut" style="background:conic-gradient('+stops+')"></div><strong>'+compactNumber(total)+'</strong></div><div class="legend">'+data.labels.map((label,i)=>'<div><i style="background:'+chartColor(i)+'"></i><span>'+escapeHtml(label)+' · '+formatValue(values[i])+' ('+Math.round(Math.max(0,values[i])/total*100)+'%)</span></div>').join('')+'</div></div>'+count;
  }
  const isLine=/line/.test(result.chart), stacked=result.chart==='stacked_bar' && data.series.every(s=>s.values.every(v=>v>=0));
  const overallMax=Math.max(...data.series.map(s=>Math.max(...s.values.map(Math.abs),1)));
  const secondary=data.series.length>1 && !stacked ? data.series.map(s=>overallMax/Math.max(...s.values.map(Math.abs),1)>=8) : data.series.map(()=>false);
  const primaryValues=data.series.filter((_,i)=>!secondary[i]).flatMap(s=>s.values);
  const secondaryValues=data.series.filter((_,i)=>secondary[i]).flatMap(s=>s.values);
  const autoLeft=[stacked?0:Math.min(0,...primaryValues),stacked?Math.max(...data.labels.map((_,i)=>data.series.reduce((sum,s)=>sum+s.values[i],0)),1):Math.max(1,...primaryValues)];
  const autoRight=[Math.min(0,...secondaryValues),Math.max(1,...secondaryValues)];
  const view=chartView(result),hasSecondary=secondary.some(Boolean);
  const [leftMin,leftMax]=view.left||autoLeft,[rightMin,rightMax]=view.right||autoRight;
  const width=Math.max(680,Math.round(data.labels.length*46*view.xZoom)),height=360;
  const left=Math.max(82,axisNumber(leftMin,leftMax-leftMin).length*6+16,axisNumber(leftMax,leftMax-leftMin).length*6+16);
  const right=hasSecondary?Math.max(84,axisNumber(rightMin,rightMax-rightMin).length*6+16,axisNumber(rightMax,rightMax-rightMin).length*6+16):28;
  const top=50,bottom=85,plotW=width-left-right,plotH=height-top-bottom;
  const y=(v,axis)=>{const min=axis?rightMin:leftMin,max=axis?rightMax:leftMax;return top+plotH-(v-min)/(max-min)*plotH;};
  const x=i=>left+plotW*(i+.5)/data.labels.length;
  const grid=Array.from({length:5},(_,i)=>{const value=leftMin+(leftMax-leftMin)*i/4,yy=y(value,false);return '<g><line class="chart-grid" x1="'+left+'" y1="'+yy+'" x2="'+(left+plotW)+'" y2="'+yy+'"/><text class="chart-axis-label" x="'+(left-9)+'" y="'+(yy+4)+'" text-anchor="end">'+axisNumber(value,leftMax-leftMin)+'</text>'+(hasSecondary?'<text class="chart-axis-label" x="'+(left+plotW+9)+'" y="'+(yy+4)+'">'+axisNumber(rightMin+(rightMax-rightMin)*i/4,rightMax-rightMin)+'</text>':'')+'</g>';}).join('');
  const verticalGrid=data.labels.map((_,i)=>'<line class="chart-grid-vertical" x1="'+x(i)+'" y1="'+top+'" x2="'+x(i)+'" y2="'+(top+plotH)+'"/>').join('');
  const labelStep=Math.max(1,Math.ceil(data.labels.length*72/plotW));
  const labels=data.labels.map((label,i)=>i%labelStep===0?'<text class="chart-axis-label" transform="translate('+x(i)+','+(top+plotH+18)+') rotate(-35)" text-anchor="end">'+escapeHtml(label.slice(0,18))+'</text>':'').join('');
  let marks='';
  if(isLine) {
    marks=data.series.map((s,j)=>{const coords=s.values.map((v,i)=>[x(i),y(v,secondary[j])]);return '<polyline class="chart-series" fill="none" stroke="'+chartColor(j)+'" points="'+coords.map(p=>p.join(',')).join(' ')+'"/>'+coords.map((p,i)=>'<circle class="chart-point" cx="'+p[0]+'" cy="'+p[1]+'" r="4" fill="var(--chart-surface)" stroke="'+chartColor(j)+'"><title>'+escapeHtml(data.labels[i]+' · '+s.name)+': '+formatValue(s.values[i])+'</title></circle>').join('');}).join('');
  } else {
    const groupW=plotW/data.labels.length,barW=Math.max(3,Math.min(36,(groupW-12)/(stacked?1:data.series.length)));
    marks=data.labels.map((label,i)=>{let accumulated=0;return data.series.map((s,j)=>{const v=s.values[i],base=stacked?accumulated:0;accumulated+=v;const xx=stacked?x(i)-barW/2:x(i)-barW*data.series.length/2+j*barW,topY=y(base+v,secondary[j]),zeroY=y(base,secondary[j]),yy=Math.min(topY,zeroY),hh=Math.max(1,Math.abs(topY-zeroY));return '<rect class="chart-rect" x="'+xx+'" y="'+yy+'" width="'+Math.max(1,barW-2)+'" height="'+hh+'" rx="2" fill="'+chartColor(j)+'"><title>'+escapeHtml(label+' · '+s.name)+': '+formatValue(v)+'</title></rect>';}).join('');}).join('');
  }
  const legend=data.series.map((s,i)=>'<span><i style="background:'+chartColor(i)+'"></i>'+escapeHtml(s.name)+(secondary[i]?' · '+escapeHtml(t('eje derecho')):'')+'</span>').join('');
  const clipId='chart-clip-'+(++chartSequence);
  const svg='<svg class="chart-svg" style="min-width:'+width+'px" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+escapeHtml(result.title)+'; eje horizontal '+escapeHtml(data.xcol)+'; '+escapeHtml(data.series.map(s=>s.name).join(', '))+'"><title>'+escapeHtml(result.title)+'</title><defs><clipPath id="'+clipId+'"><rect x="'+left+'" y="'+top+'" width="'+plotW+'" height="'+plotH+'"/></clipPath></defs>'+verticalGrid+grid+'<line class="chart-axis" x1="'+left+'" y1="'+top+'" x2="'+left+'" y2="'+(top+plotH)+'"/><line class="chart-axis" x1="'+left+'" y1="'+(top+plotH)+'" x2="'+(left+plotW)+'" y2="'+(top+plotH)+'"/>'+labels+'<g clip-path="url(#'+clipId+')">'+marks+'</g><text class="chart-axis-title" x="'+left+'" y="22">'+escapeHtml(data.series.filter((_,i)=>!secondary[i]).map(s=>s.name).join(' · '))+'</text>'+(hasSecondary?'<text class="chart-axis-title" x="'+(left+plotW)+'" y="22" text-anchor="end">'+escapeHtml(data.series.filter((_,i)=>secondary[i]).map(s=>s.name).join(' · '))+'</text>':'')+'<text class="chart-axis-title" x="'+(left+plotW/2)+'" y="'+(height-5)+'" text-anchor="middle">'+escapeHtml(data.xcol)+'</text></svg>';
  const axis=view.axis==='right'&&hasSecondary?'right':'left';
  const [shownMin,shownMax]=axis==='right'?[rightMin,rightMax]:[leftMin,leftMax];
  const controls='<div class="chart-controls"><div class="chart-zoom-group"><span>'+escapeHtml(t('Zoom X'))+'</span><button type="button" data-chart-action="x-out" aria-label="'+escapeHtml(t('Alejar eje X'))+'" '+(view.xZoom<=0.5?'disabled':'')+'>−</button><span class="chart-zoom-value">'+Math.round(view.xZoom*100)+'%</span><button type="button" data-chart-action="x-in" aria-label="'+escapeHtml(t('Acercar eje X'))+'" '+(view.xZoom>=3?'disabled':'')+'>+</button></div><div class="chart-zoom-group"><span>'+escapeHtml(t('Zoom Y'))+'</span><button type="button" data-chart-action="y-out" aria-label="'+escapeHtml(t('Alejar eje Y'))+'">−</button><button type="button" data-chart-action="y-in" aria-label="'+escapeHtml(t('Acercar eje Y'))+'">+</button></div><form class="chart-range-form" novalidate>'+(hasSecondary?'<label class="chart-axis-picker">'+escapeHtml(t('Eje Y'))+'<select name="axis"><option value="left" '+(axis==='left'?'selected':'')+'>'+escapeHtml(t('Principal'))+'</option><option value="right" '+(axis==='right'?'selected':'')+'>'+escapeHtml(t('Secundario'))+'</option></select></label>':'')+'<label>'+escapeHtml(t('Mínimo Y'))+'<input name="minimum" type="number" step="any" required value="'+shownMin+'"></label><label>'+escapeHtml(t('Máximo Y'))+'<input name="maximum" type="number" step="any" required value="'+shownMax+'"></label><button type="submit" class="chart-apply">'+escapeHtml(t('Aplicar rango'))+'</button></form><button type="button" class="chart-reset" data-chart-action="reset">'+escapeHtml(t('Restablecer vista'))+'</button></div>';
  return '<div class="chart-shell" data-left-min="'+leftMin+'" data-left-max="'+leftMax+'" data-right-min="'+rightMin+'" data-right-max="'+rightMax+'">'+controls+'<p class="chart-control-error" role="status" hidden></p><div class="chart-panel"><div class="chart-legend">'+legend+'</div>'+svg+count+'</div></div>';
}
function bindChartControls(node,result) {
  const shell=$('.chart-shell',node);if(!shell)return;
  const panel=$('.result-panel',node),view=chartView(result);
  const redraw=focusTarget=>{
    const scroller=$('.chart-panel',shell),center=(scroller.scrollLeft+scroller.clientWidth/2)/Math.max(scroller.scrollWidth,1);
    panel.innerHTML=renderChart(result);
    bindPanel(node,result);
    const next=$('.chart-panel',panel);next.scrollLeft=Math.max(0,center*next.scrollWidth-next.clientWidth/2);
    if(focusTarget)$(focusTarget,panel)?.focus();
  };
  $$('[data-chart-action]',shell).forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.chartAction;
    if(action==='reset') {chartViews.delete(result.id||result.title);redraw('[data-chart-action="reset"]');return;}
    if(action.startsWith('x-')) view.xZoom=Math.max(0.5,Math.min(3,Number((view.xZoom*(action==='x-in'?1.5:1/1.5)).toFixed(3))));
    else {
      const axis=view.axis==='right'?'right':'left',min=Number(shell.dataset[axis+'Min']),max=Number(shell.dataset[axis+'Max']);
      const span=(max-min)*(action==='y-in'?0.75:1.5),mid=(max+min)/2;
      view[axis]=[mid-span/2,mid+span/2];
    }
    redraw('[data-chart-action="'+action+'"]');
  }));
  const form=$('.chart-range-form',shell);
  form.elements.axis?.addEventListener('change',event=>{view.axis=event.target.value;redraw('.chart-axis-picker select');});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const minInput=form.elements.minimum,maxInput=form.elements.maximum;
    const min=Number(minInput.value),max=Number(maxInput.value),error=$('.chart-control-error',shell);
    const valid=minInput.value.trim()!==''&&maxInput.value.trim()!==''&&Number.isFinite(min)&&Number.isFinite(max)&&min<max;
    minInput.setAttribute('aria-invalid',String(!valid));maxInput.setAttribute('aria-invalid',String(!valid));
    if(!valid){error.textContent=t('El mínimo Y debe ser menor que el máximo Y.');error.hidden=false;minInput.focus();return;}
    view[view.axis]=[min,max];redraw('.chart-range-form input[name="minimum"]');
  });
}
let mapSequence=0;
function renderMap(result) {
  const lat=result.map.latitude,lon=result.map.longitude;
  const rows=result.rows.filter(row=>Number.isFinite(Number(row[lat])) && Number.isFinite(Number(row[lon]))).slice(0,100);
  if(!rows.length)return '<div class="map-unavailable">'+escapeHtml(t('No hay coordenadas válidas.'))+'</div>';
  return '<div class="map-shell"><div id="result-map-'+(++mapSequence)+'" class="leaflet-map" role="region" aria-label="'+escapeHtml(t('Mapa interactivo con'))+' '+rows.length+' '+escapeHtml(t('ubicaciones'))+'"></div><p class="map-caption">'+rows.length+' '+escapeHtml(t('ubicaciones'))+' · '+escapeHtml(t('usa los controles para ampliar y desplazarte'))+'</p></div>';
}
function destroyMap(node) { const container=$('.leaflet-map',node); if(container?._mapInstance){container._mapInstance.remove();container._mapInstance=null;} }
function initMap(node,result) {
  const container=$('.leaflet-map',node);if(!container||container._mapInstance)return;
  if(!window.L){container.innerHTML='<div class="map-unavailable">'+escapeHtml(t('No se pudo cargar Leaflet.'))+'</div>';return;}
  const lat=result.map.latitude,lon=result.map.longitude,rows=result.rows.filter(row=>Number.isFinite(Number(row[lat]))&&Number.isFinite(Number(row[lon]))).slice(0,100);
  const label=result.columns.find(col=>![lat,lon].includes(col))||lat;
  const map=L.map(container,{scrollWheelZoom:false});container._mapInstance=map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  const bounds=[];
  rows.forEach(row=>{const point=[Number(row[lat]),Number(row[lon])];bounds.push(point);const detail=result.columns.filter(col=>![lat,lon].includes(col)).slice(0,5).map(col=>'<div><b>'+escapeHtml(col)+'</b><span>'+formatValue(row[col])+'</span></div>').join('');L.circleMarker(point,{radius:7,color:'#fff',weight:2,fillColor:'#f36a2f',fillOpacity:.9}).addTo(map).bindPopup('<section class="map-popup"><strong>'+escapeHtml(row[label])+'</strong>'+detail+'</section>');});
  if(bounds.length===1)map.setView(bounds[0],11);else map.fitBounds(bounds,{padding:[32,32],maxZoom:11});
  requestAnimationFrame(()=>map.invalidateSize());
}

function syncClouderaAuthFields() {
  const explicit = value('cloudera-auth-mode') === 'credentials';
  one('cloudera-credential-fields').hidden = !explicit;
  one('cloudera-auth-help').hidden = explicit;
  one('cloudera-auth-credentials-help').hidden = !explicit;
  one('cloudera-user').disabled = !explicit;
  one('cloudera-password').disabled = !explicit;
}
function connectionSpec() {
  const engine=value('connection-engine');
  if (engine==='cloudera') {
    const name=value('cloudera-name'),auth_mode=value('cloudera-auth-mode');
    if(!name)throw new Error(t('Indica el nombre registrado de la conexión.'));
    const spec={engine,name,auth_mode,dialect:value('cloudera-dialect')};
    if(auth_mode==='credentials') {
      const username=value('cloudera-user'),workload_password=one('cloudera-password').value;
      if(!username||!workload_password)throw new Error(t('Indica el nombre registrado, usuario y Workload Password.'));
      Object.assign(spec,{username,workload_password});
    }
    return spec;
  }
  if(engine==='postgresql') {
    const url=value('postgres-url'),database=value('postgres-database'),username=value('postgres-user');
    if(!url||!database||!username)throw new Error(t('Completa URL, base inicial y usuario de PostgreSQL.'));
    return {engine,url,database,username,password:one('postgres-password').value};
  }
  const jdbc_url=value('trino-url');
  if(!jdbc_url)throw new Error(t('Indica la JDBC URL de Trino.'));
  return {engine,jdbc_url,username:value('trino-user'),password:one('trino-password').value};
}
function resetConnectionDiscovery() {
  state.connectionTicket='';state.pendingConnection++;
  state.pendingTables++;
  one('connection-discovery').hidden=true;one('connection-database').innerHTML='';
  one('connection-tables').innerHTML='';status('#connection-status','');
}
async function discoverConnection() {
  const sequence=++state.pendingConnection,button=one('discover-connection');
  resetConnectionDiscovery();state.pendingConnection=sequence;
  try {
    const spec=connectionSpec();
    button.disabled=true;status('#connection-status',t('Comprobando acceso…'));
    const result=await post('/api/workspace/connections/discover',{spec});
    if(sequence!==state.pendingConnection)return;
    state.connectionTicket=result.ticket;
    one('connection-database').innerHTML=result.databases.map(name=>'<option value="'+escapeHtml(name)+'">'+escapeHtml(name)+'</option>').join('');
    one('connection-discovery').hidden=false;
    await loadConnectionTables(sequence);
    if(sequence===state.pendingConnection)status('#connection-status',t('Conexión comprobada. Selecciona las tablas.'));
  } catch(error) { if(sequence===state.pendingConnection)status('#connection-status',error.message,true); }
  finally {button.disabled=false;}
}
async function loadConnectionTables(sequence=state.pendingConnection) {
  if(!state.connectionTicket)return;
  const tableSequence=++state.pendingTables;
  one('connection-tables').innerHTML='<p class="empty-state">'+escapeHtml(t('Descubriendo tablas…'))+'</p>';
  try {
    const tables=await post('/api/workspace/connections/tables',{ticket:state.connectionTicket,database:value('connection-database')});
    if(sequence!==state.pendingConnection||tableSequence!==state.pendingTables)return;
    one('connection-tables').innerHTML=tables.map(name=>'<label class="table-check"><input type="checkbox" value="'+escapeHtml(name)+'"><b>'+escapeHtml(name)+'</b></label>').join('')||'<p class="empty-state">'+escapeHtml(t('No se encontraron tablas.'))+'</p>';
  } catch(error) { if(sequence===state.pendingConnection&&tableSequence===state.pendingTables)status('#connection-status',error.message,true); }
}
async function saveConnection(event) {
  event.preventDefault();
  const tables=$$('#connection-tables input:checked').map(input=>input.value),button=one('save-connection');
  if(!state.connectionTicket){status('#connection-status',t('Prueba la conexión antes de guardarla.'),true);return;}
  if(!value('connection-label')){status('#connection-status',t('Ponle un nombre para reconocerla.'),true);one('connection-label').focus();return;}
  if(!tables.length||tables.length>12){status('#connection-status',t('Selecciona entre 1 y 12 tablas.'),true);return;}
  button.disabled=true;status('#connection-status',t('Analizando tablas y columnas…'));
  try {
    const saved=await post('/api/workspace/connections',{ticket:state.connectionTicket,label:value('connection-label'),database:value('connection-database'),tables});
    one('connection-form').reset();one('connection-engine').value='cloudera';
    $$('[data-engine]').forEach(panel=>panel.hidden=panel.dataset.engine!=='cloudera');
    syncClouderaAuthFields();
    resetConnectionDiscovery();await refreshWorkspace();toast(tf('Conexión {name} guardada con su perfil.',{name:saved.label}));
    one('chat-connection').value=saved.id;renderChatSelectors();
  } catch(error) {status('#connection-status',error.message,true);}
  finally {button.disabled=false;}
}
function modelConfig() {
  const auth_type=value('auth-type');
  const config={endpoint:value('model-endpoint'),model:value('model-name'),auth_type,
    token:one('model-token').value,api_key_id:value('api-key-id'),api_key_value:one('api-key-value').value};
  if(!config.endpoint)throw new Error(t('Indica el endpoint del modelo.'));
  if(auth_type==='apikey'&&(!config.api_key_id||!config.api_key_value))throw new Error(t('Indica API Key ID y Value.'));
  if(auth_type!=='apikey'&&!config.token)throw new Error(t('Indica el token de acceso.'));
  return config;
}
function invalidateModelTest() {
  state.pendingModel++;state.modelTicket='';one('save-model').disabled=true;status('#model-status','');
}
async function testModel() {
  const button=one('test-model');invalidateModelTest();
  const sequence=state.pendingModel;
  try {
    const config=modelConfig();button.disabled=true;status('#model-status',t('Probando endpoint y credenciales…'));
    const result=await post('/api/workspace/models/test',config);
    if(sequence!==state.pendingModel)return;
    state.modelTicket=result.ticket;one('model-name').value=result.model;
    one('model-endpoint').value=result.endpoint;
    one('save-model').disabled=false;
    status('#model-status',tf('Conectado · {model} · {latency} ms',{model:result.model,latency:result.latency_ms}));
  } catch(error) {if(sequence===state.pendingModel)status('#model-status',error.message,true);}
  finally {button.disabled=false;}
}
async function saveModel(event) {
  event.preventDefault();
  if(!state.modelTicket){status('#model-status',t('Prueba el modelo antes de guardarlo.'),true);return;}
  if(!value('model-label')){status('#model-status',t('Ponle un nombre para reconocerlo.'),true);one('model-label').focus();return;}
  const button=one('save-model');button.disabled=true;
  try {
    const saved=await post('/api/workspace/models',{ticket:state.modelTicket,label:value('model-label')});
    one('model-form').reset();invalidateModelTest();await refreshWorkspace();
    toast(tf('Modelo {name} guardado y listo para usar.',{name:saved.label}));
    one('chat-model').value=saved.id;renderChatSelectors();
  } catch(error) {status('#model-status',error.message,true);button.disabled=false;}
}
function openNewChat() {
  renderChatSelectors();one('chat-create-status').textContent='';
  one('new-chat-dialog').showModal();one('chat-connection').focus();
}
async function createChat(event) {
  event.preventDefault();
  const connection_id=value('chat-connection'),model_id=value('chat-model'),button=one('create-chat');
  if(model_id==='demo'&&connection_id!=='demo'){status('#chat-create-status',t('Elige un modelo probado para esta conexión.'),true);return;}
  button.disabled=true;status('#chat-create-status',t('Analizando el perfil de datos con el modelo…'));
  try {
    const chat=await post('/api/workspace/chats',{connection_id,model_id,model_language:state.modelLanguage});
    one('new-chat-dialog').close();await refreshWorkspace();await openChat(chat.id);
    toast(t('Chat listo. Ya puedes preguntar.'));
  } catch(error) {status('#chat-create-status',error.message,true);}
  finally {button.disabled=false;}
}
async function deleteItem(kind,id) {
  const confirmation={
    chat:t('¿Eliminar este chat y todo su historial guardado? No se puede deshacer.'),
    connection:t('¿Eliminar esta conexión? Los chats asociados conservarán su historial, pero no podrán recibir nuevas preguntas.'),
    model:t('¿Eliminar este modelo? Los chats asociados conservarán su historial, pero no podrán recibir nuevas preguntas.')
  }[kind];
  if(!window.confirm(confirmation))return;
  const path=kind==='chat'?'/api/workspace/chats/':'/api/workspace/'+kind+'s/';
  try {
    await api(path+encodeURIComponent(id),{method:'DELETE'});
    if(kind==='chat'&&state.chatId===id){state.chatId='';state.chat=null;localStorage.removeItem('ttd-chat-id');one('chat-stream').innerHTML=welcome();}
    translateStatic();
    await refreshWorkspace();toast(t('Elemento eliminado.'));
  } catch(error) {toast(error.message,true);}
}
function updateThemeControl() {
  const button=one('top-theme'),light=state.uiTheme==='light';
  const label=t(light?'Cambiar a tema oscuro':'Cambiar a tema claro');
  button.textContent=light?'☾':'☀';
  button.setAttribute('aria-label',t('Tema claro'));
  button.title=label;
  button.setAttribute('aria-pressed',String(light));
}
function applyTheme(theme) {
  state.uiTheme=theme==='light'?'light':'dark';
  localStorage.setItem('ttd-theme',state.uiTheme);
  document.documentElement.dataset.theme=state.uiTheme;
  document.querySelector('meta[name="theme-color"]').content=state.uiTheme==='light'?'#f3f5f8':'#07111f';
  one('ui-theme').value=state.uiTheme;
  updateThemeControl();
}
function savePreferences(event) {
  event.preventDefault();
  state.modules=Object.fromEntries($$('[data-module]').map(el=>[el.dataset.module,el.checked]));
  applyTheme(value('ui-theme'));
  applyLanguage(value('ui-language'),value('model-language'));
  one('preferences-dialog').close();toast(t('Preferencias guardadas.'));
}
function applyLanguage(uiLanguage, modelLanguage=uiLanguage) {
  state.uiLanguage=validLanguage(uiLanguage);state.modelLanguage=validLanguage(modelLanguage);
  localStorage.setItem('ttd-language',state.uiLanguage);
  localStorage.setItem('ttd-model-language',state.modelLanguage);
  one('ui-language').value=state.uiLanguage;
  one('model-language').value=state.modelLanguage;
  translateStatic();setView(state.view);renderSidebar();renderCatalogs();renderChatSelectors();renderContext();renderCurrentChat();
}
let recognition;
const instructionTimers = new Map();
function queueInstructionSave(chatId, instructions) {
  clearTimeout(instructionTimers.get(chatId));
  instructionTimers.set(chatId, setTimeout(async () => {
    instructionTimers.delete(chatId);
    try { await api('/api/workspace/chats/' + encodeURIComponent(chatId), {method:'PATCH',body:JSON.stringify({instructions})}); }
    catch(error) { toast(t('No se guardaron las instrucciones:')+' '+error.message,true); }
  }, 450));
}
function toggleSpeech() {
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechRecognition){toast(t('El reconocimiento de voz no está disponible en este navegador.'),true);return;}
  if(recognition){recognition.stop();return;}
  recognition=new SpeechRecognition();recognition.lang={es:'es-ES',ca:'ca-ES',eu:'eu-ES',gl:'gl-ES',en:'en-US',it:'it-IT',de:'de-DE',fr:'fr-FR'}[state.uiLanguage];
  recognition.interimResults=true;
  recognition.onstart=()=>{one('mic-button').classList.add('listening');one('mic-status').textContent=t('Escuchando…');};
  recognition.onresult=event=>{one('question').value=[...event.results].map(result=>result[0].transcript).join('');resizeComposer();};
  recognition.onend=()=>{one('mic-button').classList.remove('listening');one('mic-status').textContent='';recognition=null;};
  recognition.onerror=event=>toast(t('Micrófono:')+' '+event.error,true);
  recognition.start();
}
function bindEvents() {
  one('top-language').addEventListener('change',event=>applyLanguage(event.target.value));
  one('top-theme').addEventListener('click',()=>applyTheme(state.uiTheme==='light'?'dark':'light'));
  $$('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
  one('new-chat').addEventListener('click',openNewChat);
  one('new-connection').addEventListener('click',()=>{setView('connections');one('connection-label').focus();});
  one('new-model').addEventListener('click',()=>{setView('models');one('model-label').focus();});
  one('open-preferences').addEventListener('click',()=>one('preferences-dialog').showModal());
  one('context-toggle').addEventListener('click',()=>{const open=one('context-panel').classList.toggle('open');one('context-toggle').setAttribute('aria-expanded',String(open));if(open)one('context-close').focus();});
  one('context-close').addEventListener('click',()=>{one('context-panel').classList.remove('open');one('context-toggle').setAttribute('aria-expanded','false');one('context-toggle').focus();});
  $$('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  document.addEventListener('click',event=>{
    const newChat=event.target.closest('[data-open-new-chat]');if(newChat){openNewChat();return;}
    const chat=event.target.closest('[data-open-chat]');if(chat){openChat(chat.dataset.openChat);return;}
    const connection=event.target.closest('[data-open-connection]');if(connection){setView('connections');return;}
    const model=event.target.closest('[data-open-model]');if(model){setView('models');return;}
    for(const kind of ['chat','connection','model']){const target=event.target.closest('[data-delete-'+kind+']');if(target){deleteItem(kind,target.dataset['delete'+kind[0].toUpperCase()+kind.slice(1)]);return;}}
  });
  one('connection-engine').addEventListener('change',event=>{$$('[data-engine]').forEach(panel=>panel.hidden=panel.dataset.engine!==event.target.value);resetConnectionDiscovery();});
  one('cloudera-dialect').addEventListener('change',resetConnectionDiscovery);
  one('cloudera-auth-mode').addEventListener('change',()=>{syncClouderaAuthFields();resetConnectionDiscovery();});
  $$('#connection-form input').forEach(input=>input.addEventListener('input',()=>{if(input.id!=='connection-label'&&state.connectionTicket)resetConnectionDiscovery();}));
  one('discover-connection').addEventListener('click',discoverConnection);
  one('connection-database').addEventListener('change',()=>loadConnectionTables());
  one('select-all-tables').addEventListener('click',()=>{const inputs=$$('#connection-tables input');const checked=!inputs.every(input=>input.checked);inputs.slice(0,12).forEach(input=>input.checked=checked);});
  one('connection-form').addEventListener('submit',saveConnection);
  one('auth-type').addEventListener('change',event=>{one('token-fields').hidden=event.target.value==='apikey';one('apikey-fields').hidden=event.target.value!=='apikey';invalidateModelTest();});
  $$('#model-form input').forEach(input=>input.addEventListener('input',event=>{if(event.target.id!=='model-label')invalidateModelTest();}));
  one('test-model').addEventListener('click',testModel);one('model-form').addEventListener('submit',saveModel);
  one('chat-connection').addEventListener('change',renderChatSelectors);one('chat-model').addEventListener('change',renderChatSelectors);
  one('new-chat-form').addEventListener('submit',createChat);
  one('preferences-form').addEventListener('submit',savePreferences);
  one('model-context').addEventListener('input',event=>{
    const item=chatById(state.chatId);
    if(item){item.instructions=event.target.value;queueInstructionSave(item.id,item.instructions);}
  });
  one('ask-form').addEventListener('submit',event=>{event.preventDefault();ask(value('question'));});
  one('question').addEventListener('input',resizeComposer);
  one('question').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();one('ask-form').requestSubmit();}});
  one('mic-button').addEventListener('click',toggleSpeech);
}
async function initialize() {
  bindEvents();
  syncClouderaAuthFields();
  one('ui-language').value=state.uiLanguage;one('model-language').value=state.modelLanguage;one('top-language').value=state.uiLanguage;
  applyTheme(state.uiTheme);
  document.documentElement.lang=state.uiLanguage;
  one('chat-stream').innerHTML=welcome();
  translateStatic();setView('chat');
  try {
    await refreshWorkspace();
    if(!chatById(state.chatId)) state.chatId=state.workspace.chats[0]?.id||'';
    if(state.chatId) await openChat(state.chatId);
  }
  catch(error){renderError(error.message);toast(error.message,true);}
  renderContext();
}
initialize();
