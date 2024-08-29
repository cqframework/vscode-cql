/**
 * Couldn't find a way to surface this documentation section. Would love to include most of the information from the buildParameters method here.
 */

import * as fs from 'fs';
import * as fse from 'fs-extra';
import { glob } from 'glob';
import path from 'path';
import { window, workspace } from 'vscode';
import { URI, Utils } from 'vscode-uri';
import { Connection, ConnectionManager, Context } from './connectionManager';

export type EvaluationParameters = {
  operationArgs: string[] | undefined;
  outputPath: URI | undefined;
  testPath: URI | undefined;
};

/**
 * Builds the parameters required for CQL evaluation.
 *
 * This function gathers and constructs all the necessary operational arguments for invoking the CQL
 * Language Service CLI. It retrieves and organizes the data points from the local environment,
 * which include CQL files, terminology, and test data, to prepare for evaluation. Currently, only local
 * paths are supported, but the design anticipates potential future support for remote URLs or database
 * locations.
 *
 * **Quick Examples:**
 *
 * - **Local CQL File without Expression:**
 *   ```typescript
 *   const uri = URI.parse("file:///Users/developer/vscode-project/input/cql/my-library.cql");
 *   const params = buildParameters(uri, undefined);
 *   console.log(params);
 *   // Output:
 *   // {
 *   //   operationArgs: [
 *   //     "-fv=R4",
 *   //     "-op=/Users/developer/vscode-project/input/cql/cql-options.json",
 *   //     "-lu=/Users/developer/vscode-project/input/cql",
 *   //     "-ln=my-library",
 *   //     "-t=/Users/developer/vscode-project/input/vocabulary/valueset",
 *   //     "-m=FHIR",
 *   //     "-c=Patient"
 *   //   ],
 *   //   outputPath: URI.parse("file:///Users/developer/vscode-project/input/tests/results/my-library.txt"),
 *   //   testPath: URI.parse("file:///Users/developer/vscode-project/input/tests")
 *   // }
 *   ```
 *
 * - **Local CQL File with Expression:**
 *   ```typescript
 *   const params = buildParameters(uri, "myExpression");
 *   console.log(params);
 *   // Output:
 *   // {
 *   //   operationArgs: [
 *   //     "-fv=R4",
 *   //     "-op=/Users/developer/vscode-project/input/cql/cql-options.json",
 *   //     "-lu=/Users/developer/vscode-project/input/cql",
 *   //     "-ln=my-library",
 *   //     "-e=myExpression",
 *   //     "-t=/Users/developer/vscode-project/input/vocabulary/valueset",
 *   //     "-m=FHIR",
 *   //     "-c=Patient"
 *   //   ],
 *   //   outputPath: URI.parse("file:///Users/developer/vscode-project/input/tests/results/my-library.txt"),
 *   //   testPath: URI.parse("file:///Users/developer/vscode-project/input/tests")
 *   // }
 *   ```
 *
 * - **Remote Connection with Expression:**
 *   ```typescript
 *   // Assuming ConnectionManager is configured to use a remote connection.
 *   const params = buildParameters(uri, "myExpression");
 *   console.log(params);
 *   // Output:
 *   // {
 *   //   operationArgs: [
 *   //     "-fv=R4",
 *   //     "-op=/Users/developer/vscode-project/input/cql/cql-options.json",
 *   //     "-lu=/Users/developer/vscode-project/input/cql",
 *   //     "-ln=my-library",
 *   //     "-e=myExpression",
 *   //     "-t=/Users/developer/vscode-project/input/vocabulary/valueset",
 *   //     "-m=FHIR",
 *   //     "-mu=remote-url",
 *   //     "-c=Patient"
 *   //   ],
 *   //   outputPath: URI.parse("file:///Users/developer/vscode-project/input/tests/results/my-library.txt"),
 *   //   testPath: URI.parse("remote-url")
 *   // }
 *   ```
 *
 * **Dependencies:**
 *
 * - **Active Editor Requirement:**
 *   The function is currently dependent on the active text editor being open with the CQL file.
 *   This is because the FHIR version is extracted from the open document. Ideally, this should
 *   be refactored to read from a file based on the URI to remove this dependency.
 *   See: [VS Code Active Text Editor Documentation](https://code.visualstudio.com/api/references/vscode-api#window.activeTextEditor).
 *
 * - **Connection Manager:**
 *   The function heavily relies on the {@link ConnectionManager} to determine the context and connection
 *   details, particularly when working with remote connections. If a remote connection is active,
 *   the function can use the remote connection URL as the test data path.
 *
 * **Operational Components:**
 *
 * 1. **CQL Data:**
 *    - The main CQL file specified by the `uri` parameter.
 *    - Extracts the `libraryName` and `libraryDirectory` from the given URI.
 *
 * 2. **Terminology Data:**
 *    - Points to local terminology files located in `input/vocabulary/valueset`.
 *
 * 3. **Test Data and Results:**
 *    - Test data is expected in `input/tests`, with results being saved in `input/tests/results`.
 *    - If a remote connection is active, the test data path may point to a remote URL instead.
 *
 * @remarks
 *
 * Build Parameters is meant to provide the extension with the capability of building a set of parameters
 * to reflect the execution requirements of the Language Service CLI.
 *
 * There is an expected format for the retrieval of necessary data required to build these parameters.
 * Those are identified as Module level constants.
 *
 * **Visual Representations:**
 *
 * ```
 * file:///Users/developer/vscode-project/input/cql/my-library.cql
 * \___________________________________/ \____/\_______/\____________/
 *               projectPath              input  lib_dir  my-library.cql
 * ```
 *
 * ```
 * ..projectPath/input/vocabulary/valueset
 *              \____/ \_________________/
 *               input  vocabulary/valueset
 * ```
 *
 * ```
 * ..projectPath/input/tests/results/my-library.txt
 *              \____/ \____/ \______/\___________/
 *               input   tests results  my-library.txt
 * ```
 *
 * **Example usage:**
 *
 * Given the following URI for a CQL file in a VS Code extension project:
 *
 * `uri: "file:///Users/developer/vscode-project/input/cql/my-library.cql"`
 *
 * **Breakdown of Example URI:**
 *
 * 1. **CQL:**
 *    - projectPath: `"file:///Users/developer/vscode-project"`
 *    - input: `"input"`
 *    - cql directory: `"cql"`
 *    - file name: `"my-library.cql"`
 *
 * 2. **Terminology:**
 *    - input: `"input"`
 *    - subdirectory: `"vocabulary/valueset"`
 *
 * 3. **Data/Results:**
 *    - input: `"input"`
 *    - test directory: `"tests"`
 *    - results directory: `"results"`
 *    - output file: `"my-library.txt"`
 *
 * **Derived Constants:**
 *
 * - **projectPath:** `"file:///Users/developer/vscode-project"`
 *    - The root path of the VS Code workspace.
 *
 * - **libraryDirectory:** `"file:///Users/developer/vscode-project/input/library"`
 *    - The directory containing the CQL file.
 *
 * - **libraryName:** `"my-library"`
 *    - The base name of the CQL file.
 *
 * - **terminologyPath:** `"file:///Users/developer/vscode-project/input/vocabulary/valueset"`
 *    - The path to the terminology files (value sets).
 *
 * - **testPath:** `"file:///Users/developer/vscode-project/input/tests"`
 *    - The path to test cases related to the CQL file.
 *
 * - **resultPath:** `"file:///Users/developer/vscode-project/input/tests/results"`
 *    - The directory where execution results will be stored.
 *
 * - **outputPath:** `"file:///Users/developer/vscode-project/input/tests/results/my-library.txt"`
 *    - The full path to the output file containing the evaluation results.
 * ---
 * **Considerations and Limitations:**
 *
 * - **Measurement Period:**
 *   *Currently not implemented; a default parameter is used during CQL execution.*
 *
 * - **FHIR as the Data Model:**
 *   *The function is limited to using FHIR as the data model.*
 *
 * - **CQL Options File Location:**
 *   *The `cql-options.json` file must be located in the same directory as the CQL libraries.*
 *
 * - **Library Name Dependency:**
 *   *The library name must be part of the CQL file name.*
 *
 * - **Context Limitations:**
 *   *The function is currently limited to handling the "Patient" context.*
 *
 * ---
 *
 * **Future Enhancements:**
 *
 * - **Measurement Period:**
 *   *Add support for defining and using measurement periods within CQL execution parameters.*
 *
 * - **Support for Additional Data Models:**
 *   *Expand support beyond FHIR to include other data models.*
 *
 * - **Flexible CQL Options File Location:**
 *   *Allow the `cql-options.json` file to be located in different directories or derive its path dynamically.*
 *
 * - **Automatic Library Name Extraction:**
 *   *Automatically derive the library name from the CQL file content, removing the dependency on the file name.*
 *
 * - **Expanded Context Support:**
 *   *Enable support for multiple contexts, such as Encounters or Organizations, for more complex CQL evaluations.*
 *
 * - **Remote URLs and Database Connections:**
 *   *Support retrieving CQL, terminology, and test data from remote URLs or databases.*
 *
 * - **Refactor FHIR Version Extraction:**
 *   *Eliminate the dependency on the active text editor by extracting the FHIR version directly from the CQL file.*
 *
 * @param {URI} uri - The URI of the CQL file.
 * @param {string | undefined} expression - The specific CQL expression to evaluate, if any.
 * @returns {EvaluationParameters} The parameters required for the CQL evaluation.
 */
export function buildParameters(uri: URI, expression: string | undefined): EvaluationParameters {
  if (!fs.existsSync(uri.fsPath)) {
    window.showInformationMessage('No library content found. Please save before executing.');
    return {
      operationArgs: undefined,
      outputPath: undefined,
      testPath: undefined,
    };
  }

  const libraryDirectory = Utils.dirname(uri);
  const libraryName = Utils.basename(uri).replace('.cql', '').split('-')[0];
  const projectPath = workspace.getWorkspaceFolder(uri)!.uri;
  const terminologyPath: URI = Utils.resolvePath(projectPath, 'input', 'vocabulary', 'valueset');
  const testPath = Utils.resolvePath(projectPath, 'input', 'tests');
  const resultPath = Utils.resolvePath(testPath, 'results');
  const outputPath = Utils.resolvePath(resultPath, `${libraryName}.txt`);
  const fhirVersion = getFhirVersion();
  const optionsPath = Utils.resolvePath(libraryDirectory, 'cql-options.json');
  const measurementPeriod = '';
  const connectionManager = ConnectionManager.getManager();

  fse.ensureFileSync(outputPath.fsPath);

  let contexts = connectionManager.getCurrentContexts();
  let connection = connectionManager.getCurrentConnection();

  if (
    contexts === undefined ||
    (contexts != undefined && connection?.name !== 'Local' && Object.values(contexts).length === 0)
  ) {
    window.showErrorMessage('Remote connection is selected but no contexts are provided.');
  }

  let operationArgs = getCqlCommandArgs({
    fhirVersion,
    optionsPath,
    libraryDirectory,
    libraryName,
    expression,
    terminologyPath,
    connection,
    contexts:
      contexts != undefined && connection?.name !== 'Local' && Object.values(contexts).length > 0
        ? new Map(Object.entries(contexts).map(([key, context]) => [key, context]))
        : getLocalContexts(testPath, libraryName),
    measurementPeriod,
  });

  let evaluationParams: EvaluationParameters = {
    operationArgs,
    outputPath,
    testPath,
  };
  return evaluationParams;
}

function getCqlCommandArgs({
  fhirVersion,
  optionsPath,
  libraryDirectory,
  libraryName,
  expression,
  terminologyPath,
  connection,
  contexts,
  measurementPeriod,
}: {
  fhirVersion: string;
  optionsPath: URI;
  libraryDirectory: URI;
  libraryName: string;
  expression: string | undefined;
  terminologyPath: URI;
  connection: Connection | undefined;
  contexts: Map<string, Context>;
  measurementPeriod: string;
}): string[] {
  const args = ['cql'];

  args.push(`-fv=${fhirVersion}`);
  if (optionsPath && fs.existsSync(optionsPath.fsPath)) {
    args.push(`-op=${optionsPath}`);
  }
  const modelType = 'FHIR';
  let modelPath: string | undefined = connection?.endpoint;

  if (contexts) {
    contexts.forEach((value: Context, key: string) => {
      args.push(`-ln=${libraryName}`);
      args.push(`-lu=${libraryDirectory}`);

      if (expression && expression != undefined) {
        args.push(`-e=${expression}`);
      }

      if (terminologyPath) {
        args.push(`-t=${terminologyPath}`);
      }

      if (connection?.name === 'Local') {
        modelPath = key;
      }
      if (modelPath) {
        args.push(`-m=${modelType}`);
        args.push(`-mu=${modelPath}`);
      }

      if (measurementPeriod && measurementPeriod !== '') {
        args.push(`-p=${libraryName}."Measurement Period"`);
        args.push(`-pv=${measurementPeriod}`);
      }
      args.push(`-c=${value.resourceType}`);
      args.push(`-cv=${value.resourceID}`);
    });
  }

  return args;
}

/**
 * Retrieves the local contexts for CQL evaluation based on the test path.
 * @param {URI} testPath - The URI of the test directory.
 * @param {string} libraryName - The name of the CQL library.
 * @returns {Map<string, Context>} A map of local contexts for CQL evaluation.
 */
function getLocalContexts(testPath: URI, libraryName: string): Map<string, Context> {
  let testCases: Map<string, Context> = new Map<string, Context>();
  if (!fs.existsSync(testPath.fsPath)) {
    return testCases;
  }
  let directories = glob
    .sync(testPath.fsPath + `/**/${libraryName}`)
    .filter(d => fs.statSync(d).isDirectory());
  for (let dir of directories) {
    let cases = fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory());
    for (let c of cases) {
      testCases.set(URI.file(path.join(dir, c)).toString(), {
        resourceType: 'Patient',
        resourceID: c,
      });
    }
  }
  return testCases;
}

/**
 * Determines the FHIR version used in the active text editor.
 * @returns {string} The FHIR version (e.g., 'R4').
 */
function getFhirVersion(): string {
  const fhirVersionRegex = /using (FHIR|"FHIR") version '(\d(.|\d)*)'/;
  const matches = window.activeTextEditor?.document.getText().match(fhirVersionRegex);
  if (matches && matches.length > 2) {
    const version = matches[2];
    if (version.startsWith('2')) {
      return 'DSTU2';
    } else if (version.startsWith('3')) {
      return 'DSTU3';
    } else if (version.startsWith('4')) {
      return 'R4';
    } else if (version.startsWith('5')) {
      return 'R5';
    }
  }
  window.showInformationMessage('Unable to determine version of FHIR used. Defaulting to R4.');
  return 'R4';
}
