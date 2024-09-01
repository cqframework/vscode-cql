import * as assert from 'assert';
import type { Disposable } from 'vscode';
import { commands, Uri, window } from 'vscode';

import { existsSync } from 'fs';
import { createFileSync, removeSync } from 'fs-extra';
import { join } from 'path';
import { Commands } from '../commands';
import { executeCQL } from '../executeCql';

const OUT_FILE_PATH = join(__dirname, 'out.txt');
const TERMINOLOGY_FILE_PATH = join(__dirname, 'terminology.txt');

suite('executeCQL test', () => {
  suiteSetup(() => {
    if (!existsSync(OUT_FILE_PATH)) {
      createFileSync(OUT_FILE_PATH);
    }
  });

  suiteTeardown(() => {
    disposable?.dispose();
    if (existsSync(OUT_FILE_PATH)) {
      removeSync(OUT_FILE_PATH);
    }
  });

  let disposable: Disposable | undefined = undefined;
  setup(() => {
    disposable?.dispose();
  });

  test('It calls the execute workspace command with EXECUTE_CQL', async () => {
    let called = false;
    disposable = commands.registerCommand(Commands.EXECUTE_WORKSPACE_COMMAND, (...args) => {
      assert.equal(args[0], Commands.EXECUTE_CQL);
      assert.equal(args[1], 'cql');
      called = true;
    });
    await executeCQL({
      operationArgs: ['cql', '-mu=fake/test/path'],
      outputPath: Uri.file(OUT_FILE_PATH),
      testPath: Uri.file(''),
    });
    assert.ok(called);
  });

  test('It writes the result to the text editor', async () => {
    let called = false;
    disposable = commands.registerCommand(Commands.EXECUTE_WORKSPACE_COMMAND, (...args) => {
      called = true;
      return 'Result=Result';
    });
    await executeCQL({
      operationArgs: ['cql', '-mu=fake/model/path'],
      outputPath: Uri.file(join(__dirname, 'out.txt')),
      testPath: Uri.file(''),
    });
    assert.ok(called);
    assert.ok(window.activeTextEditor?.document.getText()?.trim()?.includes('Result=Result'));
  });

  test('It writes a warning if no test path is specified, but still attempts to execute', async () => {
    let called = false;
    disposable = commands.registerCommand(Commands.EXECUTE_WORKSPACE_COMMAND, (...args) => {
      called = true;
      return 'Result=Result';
    });
    await executeCQL({
      operationArgs: ['cql'],
      outputPath: Uri.file(join(__dirname, 'out.txt')),
      testPath: Uri.file(''),
    });
    assert.ok(called);
    const resultText = window.activeTextEditor?.document.getText()?.trim();
    assert.ok(resultText);
    assert.ok(resultText.includes('Result=Result'));
    assert.ok(resultText.includes('No data found at path'));
  });

  test('It prints a message with the library URL', async () => {
    let called = false;
    disposable = commands.registerCommand(Commands.EXECUTE_WORKSPACE_COMMAND, (...args) => {
      called = true;
      return 'Result=Result';
    });
    await executeCQL({
      operationArgs: ['cql', '-lu=fake/library/path', '-mu=fake/model/path'],
      outputPath: Uri.file(join(__dirname, 'out.txt')),
      testPath: Uri.file(''),
    });
    assert.ok(called);
    const resultText = window.activeTextEditor?.document.getText()?.trim();
    assert.ok(resultText);
    assert.ok(resultText.includes('Result=Result'));
    assert.ok(resultText.includes('CQL: fake/library/path'));
  });

  test('It reads the terminology file', async () => {
    if (!existsSync(TERMINOLOGY_FILE_PATH)) {
      createFileSync(TERMINOLOGY_FILE_PATH);
    }
    let called = false;
    disposable = commands.registerCommand(Commands.EXECUTE_WORKSPACE_COMMAND, (...args) => {
      called = true;
      return 'Result=Result';
    });
    await executeCQL({
      operationArgs: ['cql', '-mu=fake/model/path', `-t=${TERMINOLOGY_FILE_PATH}`],
      outputPath: Uri.file(join(__dirname, 'out.txt')),
      testPath: Uri.file(''),
    });
    assert.ok(called);
    const resultText = window.activeTextEditor?.document.getText()?.trim();
    assert.ok(resultText);
    assert.ok(resultText.includes('Result=Result'));
    assert.ok(resultText.includes(`Terminology: ${TERMINOLOGY_FILE_PATH}`));
    removeSync(TERMINOLOGY_FILE_PATH);
  });

  test('It writes a warning if terminology is not found, but still executes', async () => {
    console.log(existsSync(TERMINOLOGY_FILE_PATH));
    let called = false;
    disposable = commands.registerCommand(Commands.EXECUTE_WORKSPACE_COMMAND, (...args) => {
      called = true;
      return 'Result=Result';
    });
    await executeCQL({
      operationArgs: ['cql', '-mu=fake/model/path', `-t=${TERMINOLOGY_FILE_PATH}`],
      outputPath: Uri.file(join(__dirname, 'out.txt')),
      testPath: Uri.file(''),
    });
    assert.ok(called);
    const resultText = window.activeTextEditor?.document.getText()?.trim();
    assert.ok(resultText);
    assert.ok(resultText.includes('Result=Result'));
    assert.ok(resultText.includes(`No terminology found at ${TERMINOLOGY_FILE_PATH}`));
  });

  test('It interleaves context values with results', async () => {
    let called = false;
    disposable = commands.registerCommand(Commands.EXECUTE_WORKSPACE_COMMAND, (...args) => {
      called = true;
      return 'Result=Result1\n\nResult=Result2\n\nResult=Result3';
    });
    await executeCQL({
      operationArgs: ['cql', '-e=Result', '-cv=Patient-1', '-cv=Patient-2', '-cv=Patient-3'],
      outputPath: Uri.file(join(__dirname, 'out.txt')),
      testPath: Uri.file(''),
    });
    assert.ok(called);
    const resultText = window.activeTextEditor?.document.getText()?.trim();
    assert.ok(resultText);
    assert.ok(
      resultText.includes(
        'Patient-1:\nResult=Result1\n\nPatient-2:\nResult=Result2\n\nPatient-3:\nResult=Result3',
      ),
    );
  });
});
