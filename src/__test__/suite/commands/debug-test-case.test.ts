import { expect } from 'chai';
import sinon from 'sinon';
import { debug, Uri, window, workspace } from 'vscode';
import { CqlLibrary } from '../../../model/cqlProject';
import { promptAndDebugTestCase } from '../../../commands/debug-test-case';

suite('promptAndDebugTestCase', () => {
  let showInfoStub: sinon.SinonStub;
  let createQuickPickStub: sinon.SinonStub;
  let startDebuggingStub: sinon.SinonStub;
  let quickPickFake: {
    items: { label: string }[];
    canSelectMany: boolean;
    placeholder: string;
    title: string;
    selectedItems: { label: string }[];
    activeItems: { label: string }[];
    onDidAccept: (...args: any[]) => void;
    onDidHide: (...args: any[]) => void;
    show: () => void;
    hide: () => void;
  };
  let acceptHandlerRef: { current: (() => void) | undefined };
  let hideHandlerRef: { current: (() => void) | undefined };

  setup(() => {
    acceptHandlerRef = { current: undefined };
    hideHandlerRef = { current: undefined };
    showInfoStub = sinon.stub(window, 'showInformationMessage');

    const makeEvent = (ref: { current: (() => void) | undefined }) => {
      const eventFn = (cb: () => void) => {
        ref.current = cb;
        return { dispose: () => {} };
      };
      (eventFn as any).addListener = (cb: () => void) => {
        ref.current = cb;
      };
      (eventFn as any).removeListener = () => {};
      return eventFn;
    };

    quickPickFake = {
      items: [] as { label: string }[],
      canSelectMany: false,
      placeholder: '',
      title: '',
      selectedItems: [] as { label: string }[],
      activeItems: [] as { label: string }[],
      onDidAccept: makeEvent(acceptHandlerRef),
      onDidHide: makeEvent(hideHandlerRef),
      show: () => {},
      hide: () => {},
    };
    createQuickPickStub = sinon.stub(window, 'createQuickPick').returns(quickPickFake as any);
    startDebuggingStub = sinon.stub(debug, 'startDebugging').resolves();
  });

  teardown(() => {
    showInfoStub.restore();
    createQuickPickStub.restore();
    startDebuggingStub.restore();
  });

  test('with zero test cases, shows "No test cases found." message', async () => {
    const wsRoot = workspace.workspaceFolders![0].uri;
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    await promptAndDebugTestCase(lib);
    expect(showInfoStub.calledWith('No test cases found.')).to.be.true;
  });

  test('with exactly one test case, creates and shows quick pick (not skipped to direct debug)', async () => {
    const wsRoot = workspace.workspaceFolders![0].uri;
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    lib.addTestCase({ name: 'patient-1', uri: Uri.joinPath(wsRoot, 'fhir/patient-1.json') } as any);

    const acceptPromise = promptAndDebugTestCase(lib);

    expect(createQuickPickStub.called).to.be.true;
    expect(quickPickFake.items).to.have.length(1);
    expect(quickPickFake.items[0].label).to.equal('patient-1');
    expect(startDebuggingStub.called).to.be.false;

    quickPickFake.selectedItems = [quickPickFake.items[0]];
    expect(acceptHandlerRef.current).to.be.a('function');
    acceptHandlerRef.current!();

    await acceptPromise;
    expect(startDebuggingStub.calledWith(
      sinon.match.any,
      sinon.match({
        name: 'Debug SimpleMeasure — patient-1',
        libraryName: 'SimpleMeasure',
        testCaseName: 'patient-1',
      }),
    )).to.be.true;
  });

  test('with multiple test cases, creates and shows quick pick with all items', async () => {
    const wsRoot = workspace.workspaceFolders![0].uri;
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    lib.addTestCase({ name: 'patient-1', uri: Uri.joinPath(wsRoot, 'fhir/patient-1.json') } as any);
    lib.addTestCase({ name: 'patient-2', uri: Uri.joinPath(wsRoot, 'fhir/patient-2.json') } as any);

    const acceptPromise = promptAndDebugTestCase(lib);

    expect(createQuickPickStub.called).to.be.true;
    expect(quickPickFake.items).to.have.length(2);
    expect(quickPickFake.items.map(i => i.label)).to.deep.equal(['patient-1', 'patient-2']);
    expect(startDebuggingStub.called).to.be.false;

    quickPickFake.selectedItems = [quickPickFake.items[1]];
    acceptHandlerRef.current!();

    await acceptPromise;
    expect(startDebuggingStub.calledWith(
      sinon.match.any,
      sinon.match({
        name: 'Debug SimpleMeasure — patient-2',
        libraryName: 'SimpleMeasure',
        testCaseName: 'patient-2',
      }),
    )).to.be.true;
  });
});