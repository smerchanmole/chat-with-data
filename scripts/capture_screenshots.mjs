// Capture reproducible, secret-free README screenshots from the local demo app.
// Usage: node scripts/capture_screenshots.mjs (app.py must be running on 8091).
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const output = resolve('docs/screenshots');
const profile = await mkdtemp(join(tmpdir(), 'talk-to-data-capture-'));
await mkdir(output, { recursive: true });
const browser = spawn(chrome, [
  '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,900', '--remote-debugging-port=9339',
  `--user-data-dir=${profile}`, 'http://127.0.0.1:8091/',
], { stdio: 'ignore' });

let socket;
try {
  let page;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const pages = await (await fetch('http://127.0.0.1:9339/json')).json();
      page = pages.find(item => item.type === 'page' && item.url.includes('8091'));
      if (page) break;
    } catch { /* Chrome is still starting. */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  if (!page) throw new Error('Chrome could not open the local demo app.');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const response = JSON.parse(event.data);
    if (!response.id || !pending.has(response.id)) return;
    const [resolveCall, rejectCall] = pending.get(response.id);
    pending.delete(response.id);
    response.error ? rejectCall(new Error(response.error.message)) : resolveCall(response.result);
  });
  const call = (method, params = {}) => new Promise((resolveCall, rejectCall) => {
    const id = ++sequence;
    pending.set(id, [resolveCall, rejectCall]);
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  };
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate(expression)) return;
      await new Promise(resolveWait => setTimeout(resolveWait, 200));
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  const screenshot = async name => {
    await evaluate("document.activeElement?.blur(); document.querySelector('#toast').className=''");
    await new Promise(resolveWait => setTimeout(resolveWait, 450));
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(join(output, name), Buffer.from(shot.data, 'base64'));
    process.stdout.write(`Saved ${name}\n`);
  };

  await call('Page.enable');
  await call('Runtime.enable');
  await waitFor("document.querySelector('#connection-count')?.textContent === '1'");
  await screenshot('inicio.png');
  await evaluate("document.querySelector('#new-chat').click()");
  await waitFor("document.querySelector('#new-chat-dialog')?.open");
  await screenshot('nuevo-chat.png');
  await evaluate("document.querySelector('#create-chat').click()");
  await waitFor("!!document.querySelector('.overview-message')");
  await evaluate("document.querySelector('#question').value='Ingresos por mes'; document.querySelector('#ask-form').requestSubmit()");
  await waitFor("!!document.querySelector('.answer-tabs')");
  await evaluate("document.querySelector('[data-result-tab=chart]')?.click()");
  await screenshot('conversacion.png');
  await evaluate("document.querySelector('#ui-theme').value='light'; document.querySelector('#preferences-form').requestSubmit()");
  await waitFor("document.documentElement.dataset.theme === 'light'");
  await evaluate("document.querySelector('#top-language').value='ca'; document.querySelector('#top-language').dispatchEvent(new Event('change',{bubbles:true}))");
  await waitFor("document.documentElement.lang === 'ca'");
  await waitFor("!!document.querySelector('.answer-tabs')");
  await evaluate("document.querySelector('[data-result-tab=chart]').click()");
  await screenshot('conversacion-clara-ca.png');
  await evaluate("document.querySelector('[data-view=connections]').click()");
  await screenshot('conexiones.png');
} finally {
  socket?.close();
  browser.kill();
}
