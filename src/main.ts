import './style.css';
import Module, { type Manifold } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { zipSync } from 'fflate';
import { CARD_SIZES } from './layout/cards';
import { generateLayout } from './layout/layout';
import { PRINTERS, type Layout } from './layout/types';
import { buildTray } from './geometry/tray';
import { toBinaryStl } from './export/stl';
import { Viewer } from './ui/viewer';
import {
  WINGSPAN_STATE, decodeState, encodeState, newCardRow, newTokenRow, toLayoutInput,
  type AppState, type Row,
} from './state';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
  boxW: $<HTMLInputElement>('boxW'),
  boxD: $<HTMLInputElement>('boxD'),
  boxH: $<HTMLInputElement>('boxH'),
  reserved: $<HTMLInputElement>('reserved'),
  printer: $<HTMLSelectElement>('printer'),
  rows: $<HTMLDivElement>('rows'),
  status: $<HTMLDivElement>('status'),
  issues: $<HTMLDivElement>('issues'),
  trays: $<HTMLUListElement>('trays'),
  downloadAll: $<HTMLButtonElement>('downloadAll'),
};

for (const p of PRINTERS) el.printer.add(new Option(p.label, p.id));

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
let state: AppState = decodeState(location.hash.replace(/^#d=/, '')) ?? clone(WINGSPAN_STATE);

// --- Form rendering ------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const num = (field: string, value: number, label: string, step = '1') =>
  `<label>${label}<input data-f="${field}" type="number" min="0" step="${step}" value="${value}" /></label>`;
const opt = (value: string, label: string, current: string) =>
  `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`;

function rowHtml(r: Row, i: number): string {
  const head = `
    <div class="row-head">
      <span class="badge ${r.kind}">${r.kind === 'cards' ? '卡牌' : 'Token'}</span>
      <input class="name" data-f="name" value="${esc(r.name)}" aria-label="名稱" />
      <button class="icon" data-del="${i}" aria-label="刪除">✕</button>
    </div>`;
  if (r.kind === 'cards') {
    const sizes = CARD_SIZES.map((s) => opt(s.id, s.label, r.sizeId)).join('') + opt('custom', '自訂尺寸', r.sizeId);
    const custom = r.sizeId === 'custom' ? `<div class="row2">${num('cw', r.cw, '卡闊', '0.5')}${num('ch', r.ch, '卡長', '0.5')}</div>` : '';
    return `<div class="item" data-i="${i}">${head}
      <label>規格<select data-f="sizeId">${sizes}</select></label>${custom}
      <div class="row3">
        ${num('count', r.count, '張數')}
        <label>卡套<select data-f="sleeve">${opt('none', '冇套', r.sleeve)}${opt('thin', '薄套', r.sleeve)}${opt('thick', '厚套', r.sleeve)}</select></label>
        <label>擺法<select data-f="orientation">${opt('auto', '自動', r.orientation)}${opt('upright', '企放', r.orientation)}${opt('flat', '平放', r.orientation)}</select></label>
      </div></div>`;
  }
  return `<div class="item" data-i="${i}">${head}
    <div class="row4">${num('w', r.w, '闊', '0.5')}${num('d', r.d, '深', '0.5')}${num('h', r.h, '高', '0.5')}${num('count', r.count, '數量')}</div></div>`;
}

function renderForm() {
  el.boxW.value = String(state.box.w);
  el.boxD.value = String(state.box.d);
  el.boxH.value = String(state.box.h);
  el.reserved.value = String(state.reservedTop);
  el.printer.value = state.printerId;
  el.rows.innerHTML = state.rows.map(rowHtml).join('');
}

// --- Generation ------------------------------------------------------------------

const viewer = new Viewer($('viewer'));
const wasm = await Module({ locateFile: () => wasmUrl });
wasm.setup();

let layout: Layout | null = null;
let solids: Manifold[] = [];

function fileName(i: number, label: string) {
  return `${String(i + 1).padStart(2, '0')}-${label.replace(/[\\/:*?"<>|\s+]+/g, '_')}.stl`;
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function regenerate() {
  const input = toLayoutInput(state);
  layout = generateLayout(input);
  solids.forEach((s) => s.delete());
  solids = layout.trays.map((t) => buildTray(wasm, t));
  viewer.show(layout, solids);

  const names = input.groups.map((g) => g.name);
  const issues = [
    ...layout.unplaced.map((u) => `<li class="bad">放唔落：${esc(names[u.groupIndex])} × ${u.count}（${u.reason}）</li>`),
    ...layout.warnings.map((w) => `<li class="warn">${esc(w)}</li>`),
  ];
  el.issues.innerHTML = issues.length ? `<ul class="issues">${issues.join('')}</ul>` : '';
  el.status.textContent = layout.trays.length
    ? `${layout.trays.length} 個 tray · 可用高度 ${layout.availableHeight.toFixed(1)} mm`
    : '未有 tray，加啲配件先';
  el.trays.innerHTML = layout.trays
    .map((t, i) => `<li data-t="${i}">
        <span class="swatch" style="background:${viewer.colorOf(i)}"></span>
        <span class="t-name">${esc(t.label)}</span>
        <span class="t-dims">${t.w.toFixed(1)} × ${t.d.toFixed(1)} × ${t.h.toFixed(1)} mm${t.z > 0 ? ` · 疊喺 ${t.z.toFixed(1)} mm` : ''}</span>
        <button class="ghost small" data-stl="${i}">STL</button>
      </li>`)
    .join('');
  el.downloadAll.disabled = !layout.trays.length;
  history.replaceState(null, '', `#d=${encodeState(state)}`);
}

let timer = 0;
const schedule = () => { clearTimeout(timer); timer = window.setTimeout(regenerate, 120); };

// --- Events ------------------------------------------------------------------------

const positive = (v: string, fallback: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : fallback);

for (const [input, key] of [[el.boxW, 'w'], [el.boxD, 'd'], [el.boxH, 'h']] as const)
  input.addEventListener('input', () => { state.box[key] = positive(input.value, state.box[key]); schedule(); });
el.reserved.addEventListener('input', () => { state.reservedTop = positive(el.reserved.value, 0); schedule(); });
el.printer.addEventListener('change', () => { state.printerId = el.printer.value; schedule(); });

el.rows.addEventListener('input', (e) => {
  const target = e.target as HTMLInputElement | HTMLSelectElement;
  const item = target.closest<HTMLElement>('.item');
  const field = target.dataset.f;
  if (!item || !field) return;
  const row = state.rows[Number(item.dataset.i)] as unknown as Record<string, unknown>;
  row[field] = target instanceof HTMLInputElement && target.type === 'number' ? positive(target.value, Number(row[field])) : target.value;
  if (field === 'sizeId') renderForm(); // show or hide the custom size fields
  schedule();
});

el.rows.addEventListener('click', (e) => {
  const del = (e.target as HTMLElement).closest<HTMLElement>('[data-del]');
  if (!del) return;
  state.rows.splice(Number(del.dataset.del), 1);
  renderForm();
  schedule();
});

$('addCards').addEventListener('click', () => { state.rows.push(newCardRow()); renderForm(); schedule(); });
$('addTokens').addEventListener('click', () => { state.rows.push(newTokenRow()); renderForm(); schedule(); });
$('example').addEventListener('click', () => { state = clone(WINGSPAN_STATE); renderForm(); regenerate(); });
$('share').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  try {
    await navigator.clipboard.writeText(location.href);
    btn.textContent = '已複製 ✓';
  } catch {
    btn.textContent = '請由網址列複製';
  }
  setTimeout(() => (btn.textContent = '複製分享連結'), 1800);
});

el.trays.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-stl]');
  if (!b || !layout) return;
  const i = Number(b.dataset.stl);
  download(toBinaryStl(solids[i]), fileName(i, layout.trays[i].label));
});
el.trays.addEventListener('mouseover', (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>('[data-t]');
  viewer.highlight(li ? Number(li.dataset.t) : -1);
});
el.trays.addEventListener('mouseleave', () => viewer.highlight(-1));

el.downloadAll.addEventListener('click', async () => {
  if (!layout) return;
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < solids.length; i++)
    files[fileName(i, layout.trays[i].label)] = new Uint8Array(await toBinaryStl(solids[i]).arrayBuffer());
  download(new Blob([zipSync(files)], { type: 'application/zip' }), 'boardgame-insert.zip');
});

renderForm();
regenerate();
