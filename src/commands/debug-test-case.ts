import { commands, debug, ExtensionContext, Uri, window, workspace } from 'vscode';
import { Commands } from '../commands/commands';
import { getCqlPaths, getFhirVersion, loadTestConfig, waitForTestCasesLoaded } from '../helpers/cqlHelpers';
import { resolveParameters } from '../helpers/parametersHelper';
import { CqlLibrary, CqlTestCase } from '../model/cqlProject';
import { CqlSolution } from '../model/cqlSolution';

let _context: ExtensionContext | undefined;

export function register(context: ExtensionContext): void {
  _context = context;

  context.subscriptions.push(
    commands.registerCommand(Commands.DEBUG_TEST_CASE_COMMAND, async (uri: Uri) => {
      await debugTestCase(uri);
    }),
  );
}

export async function debugTestCase(cqlFileUri: Uri): Promise<void> {
  const project = CqlSolution.getCurrent().findProjectForUri(cqlFileUri);
  if (!project) {
    window.showErrorMessage('Unable to resolve needed CQL project paths.');
    return;
  }
  const library = project.Libraries.find(lib => lib.uri.fsPath === cqlFileUri.fsPath);
  if (!library) {
    window.showErrorMessage('No CQL library found for the given file.');
    return;
  }
  await promptAndDebugTestCase(library);
}

export async function startDebuggingForTestCase(
  library: CqlLibrary,
  testCase: CqlTestCase,
): Promise<void> {
  const uri = library.uri;
  const cqlPaths = getCqlPaths(uri);
  if (!cqlPaths) {
    window.showErrorMessage('Unable to determine needed CQL Paths.');
    return;
  }
  const raw = await workspace.fs.readFile(uri);
  const cqlSource = Buffer.from(raw).toString();
  const fhirVersion = getFhirVersion(cqlSource) ?? 'R4';

  const testConfig = loadTestConfig(cqlPaths.testConfigPath);
  const resolvedParams = resolveParameters(
    testConfig.parameters ?? [],
    library.name,
    undefined,
    testCase.name,
  );

  const parameters = resolvedParams.map(p => ({
    parameterName: p.name,
    parameterType: p.type,
    parameterValue: p.value,
  }));

  await debug.startDebugging(
    workspace.getWorkspaceFolder(uri),
    {
      type: 'cql',
      request: 'launch',
      name: `Debug ${library.name} — ${testCase.name}`,
      libraryUri: uri.toString(),
      libraryName: library.name,
      fhirVersion,
      testCaseName: testCase.name,
      testCaseUri: testCase.uri.toString(),
      terminologyUri: cqlPaths.terminologyDirectoryPath?.toString(),
      rootDir: cqlPaths.projectDirectoryPath?.toString(),
      optionsPath: cqlPaths.optionsPath?.toString(),
      parameters: parameters.length > 0 ? parameters : undefined,
    },
  );
}

export async function promptAndDebugTestCase(library: CqlLibrary): Promise<void> {
  if (library.project) {
    await waitForTestCasesLoaded(library, library.project, false);
  }

  const testCases = library.TestCases;
  if (testCases.length === 0) {
    window.showInformationMessage('No test cases found.');
    return;
  }

  const stateKey = `debugTestCase.selections.${library.name}`;
  const saved = _context?.workspaceState.get<string>(stateKey);

  const quickPick = window.createQuickPick();
  quickPick.items = [...testCases]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(tc => ({ label: tc.name }));
  quickPick.canSelectMany = false;
  quickPick.placeholder = 'Select a test case to debug';
  quickPick.title = `Debug — ${library.name}`;

  const savedMatch = saved
    ? quickPick.items.find(item => item.label === saved)
    : undefined;

  const selectedTestCase = await new Promise<CqlTestCase | undefined>(resolve => {
    let accepted = false;

    quickPick.onDidAccept(() => {
      accepted = true;
      const selected = quickPick.selectedItems[0];
      quickPick.hide();
      resolve(
        selected
          ? testCases.find(tc => tc.name === selected.label)
          : undefined,
      );
    });

    quickPick.onDidHide(() => {
      if (!accepted) resolve(undefined);
    });

    setTimeout(() => {
      quickPick.show();
      if (savedMatch) {
        quickPick.activeItems = [savedMatch];
      }
    }, 0);
  });

  if (!selectedTestCase) return;
  await _context?.workspaceState.update(stateKey, selectedTestCase.name);
  await startDebuggingForTestCase(library, selectedTestCase);
}