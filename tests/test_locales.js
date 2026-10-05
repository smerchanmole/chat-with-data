const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'static', 'app.js'), 'utf8');
const localeSource = fs.readFileSync(path.join(root, 'static', 'i18n.js'), 'utf8');
const template = fs.readFileSync(path.join(root, 'templates', 'index.html'), 'utf8');
const languageCodes = ['es', 'ca', 'eu', 'gl', 'en', 'fr', 'it', 'de'];
const appCatalog = appSource.slice(appSource.indexOf('const translations = {'), appSource.indexOf('const originalText'));
const context = {languages: languageCodes};
vm.runInNewContext(localeSource + '\n' + appCatalog + '\nglobalThis.catalog = translations;', context);

const dynamicKeys = [...appSource.matchAll(/\btf?\('([^']+)'/g)].map(match => match[1]);
const ignoredTemplateText = new Set([
  'Talk to Data', 'Conversational analytics', 'AI DATA ASSISTANT', '0', '/', '⚙', '◉', '↑', '×',
  'Cloudera', 'PostgreSQL', 'Trino', 'Impala', 'Hive', 'Workload Password', 'JDBC URL',
  'Model ID', 'Endpoint', 'Token', 'CDP token', 'JWT token', 'API Key ID + Value', 'API Key ID',
  'API Key Value', 'SQL', 'Español', 'Català', 'Euskara', 'Galego', 'English', 'Français',
  'Italiano', 'Deutsch', '1 · 2 · 3',
]);
const templateKeys = [...template.matchAll(/>([^<>]+)</g)]
  .map(match => match[1].trim())
  .filter(key => key && /[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(key) && !key.includes('document.') && !ignoredTemplateText.has(key));
const required = [...new Set([...dynamicKeys, ...templateKeys, 'Generación de SQL', 'Validación de SQL', 'Ejecución de SQL', 'Cambiar a tema claro', 'Cambiar a tema oscuro'])];

test('every supported language covers all UI copy keys', () => {
  for (const code of languageCodes.filter(code => code !== 'es')) {
    const missing = required.filter(key => !Object.hasOwn(context.catalog[code], key));
    assert.deepEqual(missing, [], `${code} is missing: ${missing.join(', ')}`);
  }
});

test('all eight languages are offered for app and model responses', () => {
  for (const id of ['top-language', 'ui-language', 'model-language']) {
    const select = template.match(new RegExp(`<select id="${id}"[^>]*>(.*?)<\\/select>`));
    assert.ok(select, `${id} missing`);
    for (const code of languageCodes) assert.match(select[1], new RegExp(`value="${code}"`));
  }
});

test('theme toggle is beside the language selector in the top bar', () => {
  const topbar = template.match(/<header class="topbar">(.*?)<\/header>/s)?.[1];
  assert.ok(topbar);
  assert.ok(topbar.indexOf('id="top-language"') < topbar.indexOf('id="top-theme"'));
  assert.ok(topbar.indexOf('id="top-theme"') < topbar.indexOf('id="context-toggle"'));
  assert.match(topbar, /id="top-theme"[^>]*aria-pressed="false"/);
});
