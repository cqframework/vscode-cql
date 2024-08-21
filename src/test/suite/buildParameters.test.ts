// import { Uri, window, workspace } from 'vscode';
// import { URI } from 'vscode-uri';
// import { buildParameters } from '../../buildParameters';
// import { Connection, ConnectionManager, Context } from '../../connectionManager';
// jest.mock('../../connectionManager');

// jest.mock('vscode', () =>
//   require('/Users/joshuareynolds/Documents/src/vscode-cql/src/test/mocks/vscode.mock.ts'),
// );
// jest.mock('vscode', () => ({
//   ...jest.requireActual('vscode'),
//   workspace: {
//     ...jest.requireActual('vscode').workspace,
//     getWorkspaceFolder: jest.fn(),
//   },
//   window: {
//     ...jest.requireActual('vscode').window,
//     showErrorMessage: jest.requireActual('vscode').window.showErrorMessage,
//     activeTextEditor: {
//       document: {
//         getText: jest.fn(),
//       },
//     },
//   },
// }));

// Object.defineProperty(window, 'showErrorMessage', {
//   value: jest.requireActual('vscode').window.showErrorMessage,
//   writable: true,
// });

// beforeAll(() => {
//   if (!window.showErrorMessage) {
//     window.showErrorMessage = jest.fn();
//   }
// });

// jest.spyOn(window, 'showErrorMessage');

// function mockEnvironment() {
//   (workspace.getWorkspaceFolder as jest.Mock).mockReturnValue({
//     uri: URI.file(
//       '/Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig',
//     ),
//   });
//   (window.activeTextEditor!.document.getText as jest.Mock).mockReturnValue(
//     "library Test version '1.0.2'\
//       using QICore version '4.1.1'\
//       include FHIRHelpers version '1.0.2' called FHIRHelpers\
//       valueset \"V2 Discharge Disposition ValueSet\" : 'http://example.org/ValueSet/v2-0112'\
//       context Patient\
//       define \"Test\": [Encounter/*: \"V2 Discharge Disposition ValueSet\"*/]\
//       ",
//   );
// }

// function mockConnectionManager(
//   resources: { resourceType: string; resourceId: string }[],
//   connectionName: string,
//   connectionEndpoint: string,
// ) {
//   const mockContext: Record<string, Context> = {};

//   resources.forEach((resource, index) => {
//     const contextKey = `context${index + 1}`;
//     mockContext[contextKey] = {
//       resourceID: resource.resourceId,
//       resourceType: resource.resourceType,
//     };
//   });
//   const mockConnection: Connection = {
//     name: connectionName,
//     endpoint: connectionEndpoint,
//     contexts: mockContext,
//   };
//   (ConnectionManager.getManager as jest.Mock) = jest.fn().mockReturnValue({
//     getCurrentContexts: jest.fn().mockReturnValue(mockContext),
//     getCurrentConnection: jest.fn().mockReturnValue(mockConnection),
//   });
// }

// describe('buildParameters - Public API Testing', () => {
//   beforeEach(() => {
//     jest.clearAllMocks();
//     mockEnvironment();
//   });

//   it('Should display no library content found information message when initial cql uri is not found.', () => {
//     const nonExistentUri = Uri.file('/path/to/non-existent-file.cql');
//     const expression = 'testExpression';

//     const params = buildParameters(nonExistentUri, expression);

//     expect(params.operationArgs).toBeUndefined();
//     expect(params.outputPath).toBeUndefined();
//     expect(params.testPath).toBeUndefined();
//     expect(window.showInformationMessage).toHaveBeenCalledWith(
//       'No library content found. Please save before executing.',
//     );
//   });

//   it('should generate correct parameters when file exists and connection is Local and Local does not contain context Values', () => {
//     mockConnectionManager(
//       [{ resourceType: '', resourceId: '' }],
//       'Local',
//       URI.file(
//         '/Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/tests/Test/simple-test',
//       ).fsPath,
//     );
//     const uri: Uri = URI.file(
//       '/Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/cql/Test.cql',
//     );
//     const expression = 'Test';
//     const params = buildParameters(uri, expression);

//     expect(params.operationArgs).toContain('cql');
//     expect(params.operationArgs).toContain('-fv=R4');
//     expect(params.operationArgs).toContain('-ln=Test');
//     expect(params.operationArgs).toContain(
//       '-lu=file:///Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/cql',
//     );
//     expect(params.operationArgs).toContain('-e=Test');
//     expect(params.operationArgs).toContain(
//       '-t=file:///Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/vocabulary/valueset',
//     );
//     expect(params.operationArgs).toContain('-m=FHIR');
//     expect(params.operationArgs).toContain(
//       '-mu=file:///Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/tests/Test/simple-test',
//     );
//     expect(params.operationArgs).toContain('-cv=simple-test');
//     expect(params.outputPath?.fsPath).toContain('results/Test.txt');
//     expect(params.testPath?.fsPath).toContain('input/tests');
//   });

//   it('should generate parameters with non-Local connection and no existing cql-options', () => {
//     mockConnectionManager(
//       [{ resourceType: 'Patient', resourceId: 'simple-test' }],
//       'Remote',
//       new URL('http://localhost:8000').href,
//     );
//     const uri: Uri = URI.file(
//       '/Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/cql/Test.cql',
//     );
//     const expression = 'Test';
//     const params = buildParameters(uri, expression);

//     expect(params.operationArgs).toContain('cql');
//     expect(params.operationArgs).toContain('-fv=R4');
//     expect(params.operationArgs).not.toContain('-op=');
//     expect(params.operationArgs).toContain('-ln=Test');
//     expect(params.operationArgs).toContain(
//       '-lu=file:///Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/cql',
//     );
//     expect(params.operationArgs).toContain('-e=Test');
//     expect(params.operationArgs).toContain(
//       '-t=file:///Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/vocabulary/valueset',
//     );
//     expect(params.operationArgs).toContain('-m=FHIR');
//     expect(params.operationArgs).toContain('-mu=http://localhost:8000/');
//     expect(params.operationArgs).toContain('-cv=simple-test');
//     expect(params.outputPath?.fsPath).toContain('results/Test.txt');
//     expect(params.testPath?.fsPath).toContain('input/tests');
//   });

//   it('should generate parameters with non-Local connection and multiple context parameters', () => {
//     mockConnectionManager(
//       [
//         { resourceType: 'Patient', resourceId: 'simple-test' },
//         { resourceType: 'Patient', resourceId: 'simple-test-2' },
//       ],
//       'Remote',
//       new URL('http://localhost:8000').href,
//     );
//     const uri: Uri = URI.file(
//       '/Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/cql/Test.cql',
//     );
//     const expression = 'Test';
//     const params = buildParameters(uri, expression);

//     expect(params.operationArgs).toContain('cql');
//     expect(params.operationArgs).toContain('-fv=R4');
//     expect(params.operationArgs).toContain('-ln=Test');
//     expect(params.operationArgs).toContain(
//       '-lu=file:///Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/cql',
//     );
//     expect(params.operationArgs).toContain('-e=Test');
//     expect(params.operationArgs).toContain(
//       '-t=file:///Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/vocabulary/valueset',
//     );
//     expect(params.operationArgs).toContain('-m=FHIR');
//     expect(params.operationArgs).toContain('-mu=http://localhost:8000/');
//     expect(params.operationArgs).toContain('-cv=simple-test');
//     expect(params.operationArgs).toContain('-cv=simple-test-2');
//     expect(params.outputPath?.fsPath).toContain('results/Test.txt');
//     expect(params.testPath?.fsPath).toContain('input/tests');
//   });

//   it('should show an error message when remote connection has no contexts', () => {
//     //  and not fallback to local contexts Not sure if we want this...
//     mockConnectionManager([], 'Remote', 'http://localhost:8000');
//     const uri: Uri = URI.file(
//       '/Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/cql/Test.cql',
//     );
//     const expression = 'Test';
//     const params = buildParameters(uri, expression);

//     expect(window.showErrorMessage).toHaveBeenCalledWith(
//       'Remote connection is selected but no contexts are provided.',
//     );

//     // expect(params.operationArgs).toBeUndefined();
//     expect(params.outputPath?.fsPath).toContain('results/Test.txt');
//     expect(params.testPath?.fsPath).toContain('input/tests');
//   });

//   it('should handle complex expressions correctly', () => {
//     mockConnectionManager(
//       [{ resourceType: 'Patient', resourceId: 'simple-test' }],
//       'Remote',
//       'http://localhost:8000',
//     );

//     const uri: Uri = URI.file(
//       '/Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/cql/Test.cql',
//     );
//     //Actually not working now.  Need to fix normalizeCqlExecution.ts and add a test like this there as well.
//     // Every step should make it through this check. I'm not actually sure of what the string should look like exactly
//     const complexExpression = 'Test & #"SpecialChars"';
//     const params = buildParameters(uri, complexExpression);

//     expect(params.operationArgs).toContain('-e=Test & #"SpecialChars"');
//   });

//   it('should handle empty CQL content', () => {
//     (window.activeTextEditor!.document.getText as jest.Mock).mockReturnValue('');
//     const uri: Uri = URI.file(
//       '/Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/cql/Test.cql',
//     );
//     const expression = 'Test';
//     const params = buildParameters(uri, expression);

//     expect(params.operationArgs).not.toBeUndefined();
//   });

//   // Technically right now my Test.cql is missing the FHIR version because it is using QICore.  getFHIRVersion needs some work.
//   // After that also need to make sure we mention that the FHIR version is wrong, but right now we have a catch all default.
//   it('should default to R4 when FHIR version is missing or malformed', () => {
//     (window.activeTextEditor!.document.getText as jest.Mock).mockReturnValue(
//       "library Test version '1.0.2'\n" +
//         "include FHIRHelpers version '1.0.2' called FHIRHelpers\n" +
//         'context Patient\n' +
//         'define "Test": [Encounter]',
//     );
//     const uri: Uri = URI.file(
//       '/Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/cql/Test.cql',
//     );
//     const expression = 'Test';
//     const params = buildParameters(uri, expression);
//     expect(params.operationArgs).toContain('-fv=R4');
//   });

//   it('should handle different FHIR versions correctly', () => {
//     (window.activeTextEditor!.document.getText as jest.Mock).mockReturnValue(
//       "library Test version '1.0.2'\
//       using FHIR version '3.0.1'\
//       include FHIRHelpers version '1.0.2' called FHIRHelpers\
//       context Patient\
//       define \"Test\": [Encounter/*: \"V2 Discharge Disposition ValueSet\"*/]\
//       ",
//     );
//     const uri: Uri = URI.file(
//       '/Users/joshuareynolds/Documents/src/vscode-cql/src/test/suite/resources/simple-test-ig/input/cql/Test.cql',
//     );
//     const expression = 'Test';
//     const params = buildParameters(uri, expression);
//     expect(params.operationArgs).toContain('-fv=DSTU3');
//   });
// });
