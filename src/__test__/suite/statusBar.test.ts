import { expect } from 'chai';
import * as vscode from 'vscode';
import { statusBar } from '../../statusBar';

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
