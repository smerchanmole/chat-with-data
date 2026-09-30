const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'static', 'app.js'), 'utf8');
const chartSource = source.slice(source.indexOf('const chartColors='), source.indexOf('let mapSequence='));
const context = {
  state: {uiLanguage: 'es'},
  escapeHtml: value => String(value),
  formatValue: value => String(value),
  compactNumber: value => String(value),
  t: value => value,
};
vm.runInNewContext(chartSource + '\nglobalThis.chartData = chartData; globalThis.renderChart = renderChart; globalThis.chartView = chartView;', context);

test('line chart includes every returned row, beyond the former 20-row cap', () => {
  const result = {
    columns: ['month', 'value'],
    rows: Array.from({length: 45}, (_, index) => ({month: 'month-' + index, value: index + 1})),
    chart: 'line', title: 'Evolution',
  };
  const data = context.chartData(result);
  assert.equal(data.labels.length, 45);
  assert.equal(data.series[0].values[44], 45);
  const html = context.renderChart(result);
  assert.match(html, /45 filas representadas/);
  assert.match(html, /month-44/);
  assert.equal((html.match(/<circle class="chart-point"/g) || []).length, 45);
});

test('stacked chart includes all groups and sums repeated category pairs', () => {
  const rows = [];
  for (let index = 0; index < 27; index++) {
    rows.push({month: 'month-' + index, category: 'A', value: 1});
    rows.push({month: 'month-' + index, category: 'B', value: 2});
  }
  rows.push({month: 'month-26', category: 'B', value: 3});
  const result = {columns: ['month', 'category', 'value'], rows, chart: 'stacked_bar', title: 'By category'};
  const data = context.chartData(result);
  assert.equal(data.labels.length, 27);
  assert.equal(data.series.length, 2);
  assert.equal(data.series[1].values[26], 5);
  assert.match(context.renderChart(result), /55 filas representadas/);
});

test('axis controls preserve all points, add vertical guides and respect custom Y bounds', () => {
  const result = {
    id: 'chart-controls', columns: ['month', 'value'],
    rows: Array.from({length: 30}, (_, index) => ({month: 'month-' + index, value: 100 + index / 10})),
    chart: 'line', title: 'Detailed evolution',
  };
  const original = context.renderChart(result);
  const view = context.chartView(result);
  view.xZoom = 2;
  view.left = [100.5, 101.5];
  const zoomed = context.renderChart(result);
  assert.equal((zoomed.match(/<circle class="chart-point"/g) || []).length, 30);
  assert.equal((zoomed.match(/class="chart-grid-vertical"/g) || []).length, 30);
  assert.match(zoomed, /data-left-min="100.5" data-left-max="101.5"/);
  assert.match(zoomed, /value="100.5"/);
  assert.match(zoomed, /value="101.5"/);
  assert.match(zoomed, /200%/);
  assert.match(zoomed, /clip-path="url\(#chart-clip-\d+\)"/);
  assert.notEqual(original.match(/min-width:(\d+)px/)[1], zoomed.match(/min-width:(\d+)px/)[1]);
});

test('secondary Y axis has an independent selectable range', () => {
  const result = {
    id: 'dual-axis', columns: ['month', 'revenue', 'rate'],
    rows: [{month: 'Jan', revenue: 1000, rate: 1}, {month: 'Feb', revenue: 2000, rate: 2}],
    chart: 'line', title: 'Dual axis',
  };
  const view = context.chartView(result);
  view.axis = 'right';
  view.right = [1.1, 1.9];
  const html = context.renderChart(result);
  assert.match(html, /data-right-min="1.1" data-right-max="1.9"/);
  assert.match(html, /<option value="right" selected>/);
  assert.match(html, /value="1.1"/);
  assert.match(html, /value="1.9"/);
});
