const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'static', 'app.js'), 'utf8');
const escapeSource = source.slice(source.indexOf('function escapeHtml('), source.indexOf('async function api('));
const renderSource = source.slice(source.indexOf('function renderError('), source.indexOf('function scrollChat('));
const sqlSource = source.slice(source.indexOf('function highlightSql('), source.indexOf('const chartColors='));
function render(error) {
  let rendered;
  const context = {
    document: {createElement: () => ({})},
    one: () => ({append: node => {rendered = node.innerHTML;}}),
    $: () => null, scrollChat: () => {}, t: key => key,
  };
  vm.runInNewContext(escapeSource + sqlSource + renderSource + '\nglobalThis.renderError = renderError;', context);
  context.renderError(error);
  return rendered;
}

test('query diagnostics render the model as escaped text and show attempted SQL', () => {
  const html = render({stage: 'execution', error: 'Failed', cause: 'AnalysisException',
    model_response: '<script>alert(1)</script>', sql_sent: 'SELECT value FROM sales LIMIT 500', trace_id: 'trace-123'});
  assert.match(html, /Respuesta del modelo:/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /SQL enviada al motor:/);
  assert.match(html, /AnalysisException/);
  assert.match(html, /trace-123/);
});

test('validation diagnostics do not claim the generated SQL was sent', () => {
  const html = render({stage: 'validation', cause: 'Read-only queries only',
    generated_sql: 'DELETE FROM sales', sql_sent: '', trace_id: 'trace-456'});
  assert.match(html, /SQL generada \(no enviada\):/);
  assert.doesNotMatch(html, /SQL enviada al motor:/);
  assert.match(html, /No se recibió una respuesta del modelo\./);
});
