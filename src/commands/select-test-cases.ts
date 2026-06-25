import { commands, ExtensionContext, Uri, window } from 'vscode';
import { Utils } from 'vscode-uri';
import { Commands } from '../commands/commands';
import { getCqlPaths, getExcludedTestCases, loadTestConfig } from '../helpers/cqlHelpers';
import { getMeasureReportData, getTestCases, TestCase } from '../model/testCase';
import * as log from '../log-services/logger';
import { executeCQLFile } from './execute-cql-file';

let _context: ExtensionContext | undefined;

export function register(context: ExtensionContext): void {
  _context = context;

  context.subscriptions.push(
    commands.registerCommand(Commands.EXECUTE_CQL_COMMAND_SELECT_TEST_CASES, async (uri: Uri) => {
      selectTestCases(uri);
    }),
  );
}

export async function selectTestCases(cqlFileUri: Uri): Promise<void> {
  const cqlPaths = getCqlPaths(cqlFileUri);
  if (!cqlPaths) {
    const msg = 'Unable to resolve needed CQL project paths.';
    log.error(msg);
    window.showErrorMessage(msg);
    return;
  }

  const quickPick = window.createQuickPick();
  const libraryName = Utils.basename(cqlFileUri).replace('.cql', '');
  const testConfig = loadTestConfig(cqlPaths.testConfigPath);
  const excludedTestCases = getExcludedTestCases(libraryName, testConfig.testCasesToExclude);
  const testCases = getTestCases(
    cqlPaths.testDirectoryPath,
    libraryName,
    Array.from(excludedTestCases.keys()),
  );
  const namedTestCases = testCases.filter(
    (testCase): testCase is Required<TestCase> => testCase.name !== undefined,
  );
  const quickPickItems = namedTestCases.map(testCase => ({
    label: testCase.name,
    detail: getMeasureReportData(testCase.path)?.description,
  }));

  if (quickPickItems.length > 0) {
    quickPick.items = quickPickItems;
    quickPick.canSelectMany = true;
    quickPick.matchOnDetail = true;

    const stateKey = `selectTestCases.selections.${libraryName}`;
    const savedSelections = _context?.workspaceState.get<string[]>(stateKey) ?? [];
    if (savedSelections.length > 0) {
      quickPick.selectedItems = quickPick.items.filter(item =>
        savedSelections.includes(item.label),
      );
    }

    quickPick.show();

    quickPick.onDidAccept(() => {
      const selectedLabels = quickPick.selectedItems.map(item => item.label);
      _context?.workspaceState.update(stateKey, selectedLabels);

      const selected = namedTestCases.filter(testCase =>
        selectedLabels.some(label => label === testCase.name),
      );
      quickPick.hide();
      executeCQLFile(cqlFileUri, selected);
    });
  }
}
