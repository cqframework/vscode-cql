import * as fs from 'node:fs';
import * as path from 'node:path';
import { Disposable, Uri, ViewColumn, WebviewPanel, window } from 'vscode';
import { Utils } from 'vscode-uri';
import { loadTestConfig, resolveTestConfigPath, TestConfig } from '../helpers/cqlHelpers';
import { CqlProject } from '../model/cqlProject';
import * as log from '../log-services/logger';

export class ConfigEditorWebview {
  private static readonly viewType = 'cql.configEditor';
  private static instances = new Map<string, ConfigEditorWebview>();

  readonly panel: WebviewPanel;
  private readonly project: CqlProject;
  private readonly configPath: Uri;
  private config: TestConfig;
  private readonly disposables: Disposable[] = [];

  private constructor(
    panel: WebviewPanel,
    project: CqlProject,
    configPath: Uri,
    config: TestConfig,
  ) {
    this.panel = panel;
    this.project = project;
    this.configPath = configPath;
    this.config = config;
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
    panel.webview.onDidReceiveMessage(
      msg => { this.handleMessage(msg).catch(err => log.error('handleMessage error', err)); },
      null,
      this.disposables,
    );
  }

  static createOrShow(project: CqlProject): void {
    const existing = ConfigEditorWebview.instances.get(project.igRoot);
    if (existing) {
      existing.panel.reveal();
      return;
    }

    const testDirectoryPath = Utils.resolvePath(Uri.file(project.igRoot), 'input', 'tests');
    const configPath = resolveTestConfigPath(testDirectoryPath);
    const config = loadTestConfig(configPath);

    const panel = window.createWebviewPanel(
      ConfigEditorWebview.viewType,
      `Config: ${project.name}`,
      ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    const editor = new ConfigEditorWebview(panel, project, configPath, config);
    ConfigEditorWebview.instances.set(project.igRoot, editor);
    editor.render();
  }

  private render(): void {
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const isJsonc = this.configPath.fsPath.endsWith('.jsonc');
    const params = this.config.parameters ?? [];
    const exclusions = this.config.testCasesToExclude;

    const exclusionRows = exclusions
      .map(
        (e, i) => `
      <tr>
        <td><input name="library-${i}" value="${this.esc(e.library)}" placeholder="Library name" /></td>
        <td><input name="testCase-${i}" value="${this.esc(e.testCase)}" placeholder="Patient UUID" /></td>
        <td><input name="reason-${i}" value="${this.esc(e.reason)}" placeholder="Reason" /></td>
        <td><button class="remove" data-index="${i}">✕</button></td>
      </tr>`,
      )
      .join('');

    const paramTypes = [
      'String', 'Integer', 'Decimal', 'Boolean', 'DateTime', 'Date', 'Time',
      'Interval<DateTime>', 'Interval<Date>', 'Quantity',
    ];
    const typeOptions = (selected: string) =>
      paramTypes
        .map(t => `<option value="${t}"${t === selected ? ' selected' : ''}>${this.esc(t)}</option>`)
        .join('');

    const renderParamEntry = (p: { name: string; type: string; value: string }) => `
      <div class="param-row">
        <input class="p-name" value="${this.esc(p.name)}" placeholder="Name" />
        <select class="p-type">${typeOptions(p.type)}</select>
        <input class="p-value" value="${this.esc(p.value)}" placeholder="Value" />
        <button class="remove" onclick="this.closest('.param-row').remove()">✕</button>
      </div>`;

    const globalParams = params
      .filter((e): e is { name: string; type: string; value: string } => !('library' in e))
      .map(renderParamEntry)
      .join('');

    const libBlocks = params
      .filter((e): e is { library: string; version?: string; parameters?: any[]; testCases?: Record<string, any[]> } => 'library' in e);

    const renderLibBlock = (b: typeof libBlocks[number], bi: number) => {
      const libParams = (b.parameters ?? []).map(renderParamEntry).join('');
      const tcEntries = Object.entries(b.testCases ?? {});
      const tcBlocks = tcEntries
        .map(([patientId, tcParams], ti) => `
          <div class="tc-block" data-tc-index="${ti}">
            <div class="tc-header">
              <input class="tc-patient" value="${this.esc(patientId)}" placeholder="Patient UUID" />
              <button class="remove" onclick="this.closest('.tc-block').remove()">✕</button>
            </div>
            <div class="tc-params">${tcParams.map(renderParamEntry).join('')}</div>
            <button class="add" onclick="addTcParam(this, ${bi}, ${ti})">+ Add Parameter</button>
          </div>`).join('');

      return `
        <div class="lib-block" data-lib-index="${bi}">
          <div class="lib-header">
            <input class="lib-name" value="${this.esc(b.library)}" placeholder="Library name" />
            <input class="lib-version" value="${this.esc(b.version ?? '')}" placeholder="Version (optional)" />
            <button class="remove" onclick="this.closest('.lib-block').remove()">✕</button>
          </div>
          <h5>Library Parameters</h5>
          <div class="lib-params">${libParams}</div>
          <button class="add" onclick="addLibParam(this, ${bi})">+ Add Parameter</button>
          <h5>Test Case Overrides</h5>
          <div class="tc-overrides">${tcBlocks}</div>
          <button class="add" onclick="addTcOverride(this, ${bi})">+ Add Test Case Override</button>
        </div>`;
    };

    const libBlockHtml = libBlocks.map((b, i) => renderLibBlock(b, i)).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
:root {
  --bg: var(--vscode-editor-background, #1e1e1e);
  --fg: var(--vscode-editor-foreground, #d4d4d4);
  --input-bg: var(--vscode-input-background, #3c3c3c);
  --input-fg: var(--vscode-input-foreground, #cccccc);
  --border: var(--vscode-input-border, #555);
  --btn-bg: var(--vscode-button-background, #0e639c);
  --btn-fg: var(--vscode-button-foreground, #ffffff);
  --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
  --danger-bg: var(--vscode-errorForeground, #f14c4c);
  --warn-bg: var(--vscode-inputValidation-warningBackground, #352a05);
  --warn-fg: var(--vscode-inputValidation-warningForeground, #ffcc00);
  --section-bg: var(--vscode-sideBar-background, #252526);
  --heading-fg: var(--vscode-editorWidget-foreground, #cccccc);
  font-family: var(--vscode-font-family, sans-serif);
  font-size: var(--vscode-font-size, 13px);
  color: var(--fg);
  background: var(--bg);
  padding: 16px;
}
body { margin: 0; }
h2 { margin: 0 0 16px 0; font-weight: 400; }
h3 { margin: 20px 0 8px 0; font-weight: 400; }
h4 { margin: 16px 0 8px 0; font-weight: 500; color: var(--heading-fg); }
h5 { margin: 12px 0 6px 0; font-weight: 400; font-size: 0.95em; color: var(--heading-fg); }
label { display: block; margin-bottom: 4px; }
select, input[type="text"] {
  width: 100%;
  padding: 4px 8px;
  background: var(--input-bg);
  color: var(--input-fg);
  border: 1px solid var(--border);
  box-sizing: border-box;
  font-family: inherit;
  font-size: inherit;
}
select { cursor: pointer; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 4px 8px; text-align: left; border-bottom: 1px solid var(--border); }
th { font-weight: 600; }
button {
  padding: 4px 12px;
  background: var(--btn-bg);
  color: var(--btn-fg);
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
  white-space: nowrap;
}
button:hover { background: var(--btn-hover); }
button.remove { background: transparent; color: var(--danger-bg); padding: 4px; font-size: 14px; }
button.remove:hover { background: rgba(241, 76, 76, 0.1); }
button.add { margin-top: 4px; }
.actions { margin-top: 24px; display: flex; gap: 8px; align-items: center; }
.actions button { padding: 8px 24px; }
.warning {
  background: var(--warn-bg);
  color: var(--warn-fg);
  padding: 8px 12px;
  margin-bottom: 16px;
  border-radius: 2px;
}
.hidden { display: none; }
.param-row {
  display: flex; gap: 6px; align-items: center; margin: 4px 0;
}
.param-row .p-name { flex: 2; }
.param-row .p-type { flex: 1.5; }
.param-row .p-value { flex: 3; }
.lib-block {
  background: var(--section-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 12px;
  margin: 8px 0;
}
.lib-header { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.lib-header .lib-name { flex: 1; }
.lib-header .lib-version { flex: 1; }
.tc-block {
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 8px;
  margin: 6px 0;
}
.tc-header { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.tc-header .tc-patient { flex: 1; }
.tc-params { margin-left: 8px; }
.section-divider {
  border: none; border-top: 1px solid var(--border); margin: 16px 0;
}
</style>
</head>
<body>
<h2>${this.esc(this.project.name)} Configuration</h2>

${isJsonc ? '<div class="warning">⚠ Comments in config.jsonc will be removed on save.</div>' : ''}

<div>
  <h3>Result Format</h3>
  <select id="resultFormat">
    <option value="flat" ${this.config.resultFormat === 'flat' ? 'selected' : ''}>Flat</option>
    <option value="individual" ${this.config.resultFormat === 'individual' ? 'selected' : ''}>Individual</option>
  </select>
  <div style="margin-top: 8px">
    <label>
      <input type="checkbox" id="flatResultsInSubfolder" ${this.config.flatResultsInSubfolder ? 'checked' : ''} />
      Store flat results in library-named subfolder
    </label>
  </div>
</div>

<hr class="section-divider" />

<div>
  <h3>Test Case Exclusions</h3>
  <table id="exclusions">
    <thead><tr><th>Library</th><th>Patient UUID</th><th>Reason</th><th></th></tr></thead>
    <tbody id="exclusionsBody">${exclusionRows}</tbody>
  </table>
  <button class="add" onclick="addRow()">+ Add Exclusion</button>
</div>

<hr class="section-divider" />

<div>
  <h3>Parameters</h3>

  <h4>Global Parameters</h4>
  <div id="globalParams">${globalParams}</div>
  <button class="add" onclick="addGlobalParam()">+ Add Global Parameter</button>

  <h4>Library-Scoped Parameters</h4>
  <div id="libParamsContainer">${libBlockHtml}</div>
  <button class="add" onclick="addLibBlock()">+ Add Library Block</button>
</div>

<div class="actions">
  <button onclick="save()">Save Configuration</button>
  <span id="status"></span>
</div>

<script>
const vscode = acquireVsCodeApi();
const TYPES = ${JSON.stringify(paramTypes)};

let rowIndex = ${exclusions.length};

function addRow() {
  const body = document.getElementById('exclusionsBody');
  const i = rowIndex++;
  const tr = document.createElement('tr');
  tr.innerHTML = \`
    <td><input name="library-\${i}" value="" placeholder="Library name" /></td>
    <td><input name="testCase-\${i}" value="" placeholder="Patient UUID" /></td>
    <td><input name="reason-\${i}" value="" placeholder="Reason" /></td>
    <td><button class="remove" data-index="\${i}">✕</button></td>\`;
  tr.querySelector('.remove').onclick = () => tr.remove();
  body.appendChild(tr);
}

document.querySelectorAll('#exclusionsBody .remove').forEach(btn => {
  btn.onclick = () => btn.closest('tr').remove();
});

function makeParamRow(name, type, value) {
  const div = document.createElement('div');
  div.className = 'param-row';
  const opts = TYPES.map(t => \`<option value="\${t}"\${t === type ? ' selected' : ''}>\${escHtml(t)}</option>\`).join('');
  div.innerHTML = \`
    <input class="p-name" value="\${escHtml(name)}" placeholder="Name" />
    <select class="p-type">\${opts}</select>
    <input class="p-value" value="\${escHtml(value)}" placeholder="Value" />
    <button class="remove" onclick="this.closest('.param-row').remove()">✕</button>\`;
  return div;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function gatherParams(container) {
  const rows = container.querySelectorAll('.param-row');
  const out = [];
  rows.forEach(r => {
    const name = r.querySelector('.p-name').value.trim();
    const type = r.querySelector('.p-type').value;
    const value = r.querySelector('.p-value').value.trim();
    if (name && value) out.push({ name, type, value });
  });
  return out;
}

function addGlobalParam() {
  const div = document.getElementById('globalParams');
  div.appendChild(makeParamRow('', 'String', ''));
}

function addLibBlock() {
  const container = document.getElementById('libParamsContainer');
  const bi = container.querySelectorAll('.lib-block').length;
  const block = document.createElement('div');
  block.className = 'lib-block';
  block.setAttribute('data-lib-index', bi);
  block.innerHTML = \`
    <div class="lib-header">
      <input class="lib-name" placeholder="Library name" />
      <input class="lib-version" placeholder="Version (optional)" />
      <button class="remove" onclick="this.closest('.lib-block').remove()">✕</button>
    </div>
    <h5>Library Parameters</h5>
    <div class="lib-params"></div>
    <button class="add" onclick="addLibParam(this, \${bi})">+ Add Parameter</button>
    <h5>Test Case Overrides</h5>
    <div class="tc-overrides"></div>
    <button class="add" onclick="addTcOverride(this, \${bi})">+ Add Test Case Override</button>\`;
  container.appendChild(block);
}

function addLibParam(btn, bi) {
  const paramsDiv = btn.closest('.lib-block').querySelector('.lib-params');
  paramsDiv.appendChild(makeParamRow('', 'String', ''));
}

function addTcOverride(btn, bi) {
  const overridesDiv = btn.closest('.lib-block').querySelector('.tc-overrides');
  const ti = overridesDiv.querySelectorAll('.tc-block').length;
  const block = document.createElement('div');
  block.className = 'tc-block';
  block.innerHTML = \`
    <div class="tc-header">
      <input class="tc-patient" placeholder="Patient UUID" />
      <button class="remove" onclick="this.closest('.tc-block').remove()">✕</button>
    </div>
    <div class="tc-params"></div>
    <button class="add" onclick="addTcParam(this, \${bi}, \${ti})">+ Add Parameter</button>\`;
  overridesDiv.appendChild(block);
}

function addTcParam(btn, bi, ti) {
  const paramsDiv = btn.closest('.tc-block').querySelector('.tc-params');
  paramsDiv.appendChild(makeParamRow('', 'String', ''));
}

function save() {
  const exclusions = [];
  const body = document.getElementById('exclusionsBody');
  for (let i = 0; i < body.rows.length; i++) {
    const cells = body.rows[i].cells;
    const library = cells[0].querySelector('input').value.trim();
    const testCase = cells[1].querySelector('input').value.trim();
    const reason = cells[2].querySelector('input').value.trim();
    if (library && testCase) {
      exclusions.push({ library, testCase, reason });
    }
  }

  const parameters = [];

  document.querySelectorAll('#globalParams .param-row').forEach(r => {
    const name = r.querySelector('.p-name').value.trim();
    const type = r.querySelector('.p-type').value;
    const value = r.querySelector('.p-value').value.trim();
    if (name && value) parameters.push({ name, type, value });
  });

  document.querySelectorAll('#libParamsContainer .lib-block').forEach(lb => {
    const library = lb.querySelector('.lib-name').value.trim();
    if (!library) return;
    const version = lb.querySelector('.lib-version').value.trim() || undefined;
    const libParams = [];
    lb.querySelectorAll(':scope > .lib-params .param-row').forEach(r => {
      const name = r.querySelector('.p-name').value.trim();
      const type = r.querySelector('.p-type').value;
      const value = r.querySelector('.p-value').value.trim();
      if (name && value) libParams.push({ name, type, value });
    });
    const testCases = {};
    lb.querySelectorAll(':scope > .tc-overrides .tc-block').forEach(tc => {
      const patientId = tc.querySelector('.tc-patient').value.trim();
      if (!patientId) return;
      const tcParams = [];
      tc.querySelectorAll('.tc-params .param-row').forEach(r => {
        const name = r.querySelector('.p-name').value.trim();
        const type = r.querySelector('.p-type').value;
        const value = r.querySelector('.p-value').value.trim();
        if (name && value) tcParams.push({ name, type, value });
      });
      if (tcParams.length > 0) testCases[patientId] = tcParams;
    });
    const entry = { library }  ;
    if (version) entry.version = version;
    if (libParams.length > 0) entry.parameters = libParams;
    if (Object.keys(testCases).length > 0) entry.testCases = testCases;
    parameters.push(entry);
  });

  const flatInSubfolder = document.getElementById('flatResultsInSubfolder');
  const config = {
    testCasesToExclude: exclusions,
    resultFormat: document.getElementById('resultFormat').value,
    flatResultsInSubfolder: flatInSubfolder ? flatInSubfolder.checked : false,
  };
  if (parameters.length > 0) config.parameters = parameters;

  vscode.postMessage({ type: 'save', config });
  document.getElementById('status').textContent = 'Saving\u2026';
}

window.addEventListener('message', event => {
  const msg = event.data;
  if (msg.type === 'save-result') {
    document.getElementById('status').textContent = msg.ok ? 'Saved' : 'Error';
    setTimeout(() => document.getElementById('status').textContent = '', 3000);
  }
});
<\/script>
</body>
</html>`;
  }

  private async handleMessage(msg: any): Promise<void> {
    if (msg.type === 'save') {
      const ok = await this.saveConfig(msg.config);
      void this.panel.webview.postMessage({ type: 'save-result', ok });
    }
  }

  private async saveConfig(updated: TestConfig): Promise<boolean> {
    if (this.configPath.fsPath.endsWith('.jsonc')) {
      const confirmed = await window.showWarningMessage(
        `Saving will permanently remove all comments from ${path.basename(this.configPath.fsPath)}. Continue?`,
        { modal: true },
        'Save',
      );
      if (confirmed !== 'Save') {
        void this.panel.webview.postMessage({ type: 'save-result', ok: false });
        return false;
      }
    }
    const data = JSON.stringify(updated, null, 2);
    try {
      await fs.promises.writeFile(this.configPath.fsPath, data, 'utf-8');
      this.config = updated;
      window.showInformationMessage(`Configuration saved for ${this.project.name}`);
      return true;
    } catch (err) {
      window.showErrorMessage(`Failed to save configuration: ${err}`);
      return false;
    }
  }

  private dispose(): void {
    ConfigEditorWebview.instances.delete(this.project.igRoot);
    this.disposables.forEach(d => d.dispose());
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
}
