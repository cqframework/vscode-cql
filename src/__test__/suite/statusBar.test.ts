import { expect } from 'chai';
import * as vscode from 'vscode';
import { statusBar } from '../../statusBar';
import { VersionInfo } from '../../protocol';

suite('statusBar', () => {
  teardown(() => {
    statusBar.setReady();
  });

  test('showStatusBar() sets busy icon', () => {
    statusBar.showStatusBar();
    expect(statusBar.text).to.equal('$(sync~spin) CQL');
    expect(statusBar.tooltip).to.equal('Server Busy');
  });

  test('setBusy() sets spinning icon', () => {
    statusBar.setBusy();
    expect(statusBar.text).to.equal('$(sync~spin) CQL');
    expect(statusBar.tooltip).to.equal('Server Busy');
  });

  test('setReady() sets check icon', () => {
    statusBar.setReady();
    expect(statusBar.text).to.equal('$(check) CQL');
  });

  test('setReady() sets Server Ready tooltip', () => {
    statusBar.setReady();
    const tooltip = statusBar.tooltip as vscode.MarkdownString;
    expect(tooltip.value).to.include('Server Ready');
  });

  test('setReady(version) includes version in tooltip', () => {
    statusBar.setReady('4.2.0');
    expect(statusBar.text).to.equal('$(check) CQL');
    const tooltip = statusBar.tooltip as vscode.MarkdownString;
    expect(tooltip.value).to.include('4.2.0');
  });

  test('setReady with VersionInfo shows all component versions', () => {
    const vi: VersionInfo = {
      translator: '4.9.0',
      engine: '4.9.0',
      clinicalReasoning: '4.7.0',
      languageServer: '4.8.0',
    };
    statusBar.setReady(undefined, vi);
    expect(statusBar.text).to.equal('$(check) CQL');
    const tooltip = statusBar.tooltip as vscode.MarkdownString;
    expect(tooltip.value).to.include('Translator: 4.9.0');
    expect(tooltip.value).to.include('Engine: 4.9.0');
    expect(tooltip.value).to.include('Clinical Reasoning: 4.7.0');
    expect(tooltip.value).to.include('Language Server: 4.8.0');
  });

  test('setReady with partial VersionInfo omits undefined lines', () => {
    const vi: VersionInfo = { translator: '4.9.0', engine: undefined, clinicalReasoning: undefined, languageServer: undefined };
    statusBar.setReady(undefined, vi);
    const tooltip = statusBar.tooltip as vscode.MarkdownString;
    expect(tooltip.value).to.include('Translator: 4.9.0');
    expect(tooltip.value).not.to.include('Engine');
    expect(tooltip.value).not.to.include('Clinical Reasoning');
    expect(tooltip.value).not.to.include('Language Server');
  });

  test('setError() sets error icon', () => {
    statusBar.setError();
    expect(statusBar.text).to.equal('$(error) CQL');
    expect(statusBar.tooltip).to.equal('Server Error');
  });

  test('updateText() sets custom text', () => {
    statusBar.updateText('custom text');
    expect(statusBar.text).to.equal('custom text');
  });

  test('updateTooltip() sets custom tooltip', () => {
    statusBar.updateTooltip('my tooltip');
    expect(statusBar.tooltip).to.equal('my tooltip');
  });

  test('can transition between states', () => {
    statusBar.setBusy();
    expect(statusBar.text).to.equal('$(sync~spin) CQL');

    statusBar.setError();
    expect(statusBar.text).to.equal('$(error) CQL');

    statusBar.setReady('1.0.0');
    expect(statusBar.text).to.equal('$(check) CQL');

    statusBar.setBusy();
    expect(statusBar.text).to.equal('$(sync~spin) CQL');

    statusBar.setReady();
    expect(statusBar.text).to.equal('$(check) CQL');
  });
});
