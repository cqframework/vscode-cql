import { expect } from 'chai';
import { statusBar } from '../../statusBar';

suite('statusBar', () => {
  teardown(() => {
    statusBar.setReady();
  });

  test('showStatusBar() does not throw', () => {
    expect(() => statusBar.showStatusBar()).to.not.throw();
  });

  test('setBusy() does not throw', () => {
    expect(() => statusBar.setBusy()).to.not.throw();
  });

  test('setReady() does not throw', () => {
    expect(() => statusBar.setReady()).to.not.throw();
  });

  test('setReady(version) does not throw', () => {
    expect(() => statusBar.setReady('4.2.0')).to.not.throw();
  });

  test('setError() does not throw', () => {
    expect(() => statusBar.setError()).to.not.throw();
  });

  test('updateText() does not throw', () => {
    expect(() => statusBar.updateText('custom text')).to.not.throw();
  });

  test('updateTooltip() does not throw', () => {
    expect(() => statusBar.updateTooltip('my tooltip')).to.not.throw();
  });

  test('can transition between states without throwing', () => {
    expect(() => {
      statusBar.setBusy();
      statusBar.setError();
      statusBar.setReady('1.0.0');
      statusBar.setBusy();
      statusBar.setReady();
    }).to.not.throw();
  });
});
