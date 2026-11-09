import { expect } from 'chai';
import sinon from 'sinon';
import { CancellationToken, commands, Progress, Uri, window } from 'vscode';
import { runLibraryBatch } from '../../../commands/library-batch';

/** Lets the non-awaited summary toast's `.then()` chain run before asserting on it. */
const flushPromises = () => new Promise(resolve => setImmediate(resolve));

suite('runLibraryBatch', () => {
  const libs = [
    { name: 'LibA', uri: Uri.file('/project/input/cql/LibA.cql') },
    { name: 'LibB', uri: Uri.file('/project/input/cql/LibB.cql') },
    { name: 'LibC', uri: Uri.file('/project/input/cql/LibC.cql') },
  ];

  let token: { isCancellationRequested: boolean };
  let reports: Array<{ message?: string; increment?: number }>;
  let withProgressStub: sinon.SinonStub;
  let showInfoStub: sinon.SinonStub;
  let showWarningStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;

  setup(() => {
    token = { isCancellationRequested: false };
    reports = [];
    const progress: Progress<{ message?: string; increment?: number }> = {
      report: value => reports.push(value),
    };
    withProgressStub = sinon
      .stub(window, 'withProgress')
      .callsFake((_options, task) =>
        Promise.resolve(task(progress, token as unknown as CancellationToken)),
      );
    showInfoStub = sinon.stub(window, 'showInformationMessage');
    showWarningStub = sinon.stub(window, 'showWarningMessage').resolves(undefined as any);
    executeCommandStub = sinon.stub(commands, 'executeCommand').resolves();
  });

  teardown(() => {
    withProgressStub.restore();
    showInfoStub.restore();
    showWarningStub.restore();
    executeCommandStub.restore();
  });

  test('uses a single cancellable progress notification with the given title', async () => {
    await runLibraryBatch(libs, 'Execute CQL', { execute: async () => {} });
    expect(withProgressStub.calledOnce).to.be.true;
    const options = withProgressStub.firstCall.args[0];
    expect(options.title).to.equal('Execute CQL');
    expect(options.cancellable).to.be.true;
  });

  test('executes every library in order and reports X of Y progress with summed increments', async () => {
    const executed: string[] = [];
    await runLibraryBatch(libs, 'Execute CQL', {
      execute: async uri => {
        executed.push(uri.fsPath);
      },
    });
    expect(executed).to.deep.equal(libs.map(l => l.uri.fsPath));
    expect(reports.map(r => r.message)).to.deep.equal([
      'LibA (1 of 3)',
      'LibB (2 of 3)',
      'LibC (3 of 3)',
    ]);
    // Each report had ~33.33%, sum should be ~100% (allow tiny float drift).
    const totalIncrement = reports.reduce(
      (sum, r) => sum + (r.increment ?? 0),
      0,
    );
    expect(totalIncrement).to.be.closeTo(100, 0.01);
  });

  test('shows exactly one completion summary for the whole batch', async () => {
    await runLibraryBatch(libs, 'Execute CQL', { execute: async () => {} });
    expect(showInfoStub.calledOnce).to.be.true;
    expect(showWarningStub.called).to.be.false;
    expect(showInfoStub.firstCall.args[0]).to.match(/^CQL execution complete — 3 libraries \(/);
  });

  test('uses singular wording for a one-library batch', async () => {
    await runLibraryBatch(libs.slice(0, 1), 'Execute CQL', { execute: async () => {} });
    expect(showInfoStub.firstCall.args[0]).to.match(/^CQL execution complete — 1 library \(/);
  });

  test('stops after cancellation and reports a cancelled summary', async () => {
    const executed: string[] = [];
    await runLibraryBatch(libs, 'Execute CQL', {
      execute: async uri => {
        executed.push(uri.fsPath);
        token.isCancellationRequested = true;
      },
    });
    expect(executed).to.deep.equal([libs[0].uri.fsPath]);
    expect(showInfoStub.calledOnce).to.be.true;
    expect(showWarningStub.called).to.be.false;
    expect(showInfoStub.firstCall.args[0]).to.match(/^CQL execution cancelled — 1\/3 libraries \(/);
  });

  test('continues after a mid-batch failure and shows a warning listing failed libraries', async () => {
    const executed: string[] = [];
    let warningsCalled = 0;
    showWarningStub.callsFake(async () => {
      warningsCalled++;
      return undefined as any;
    });
    await runLibraryBatch(libs, 'Execute CQL', {
      execute: async uri => {
        executed.push(uri.fsPath);
        if (uri.fsPath === libs[1].uri.fsPath) {
          throw new Error('boom');
        }
      },
    });
    // All three libs ran in spite of the middle one failing.
    expect(executed).to.deep.equal(libs.map(l => l.uri.fsPath));
    expect(showInfoStub.called).to.be.false;
    expect(warningsCalled).to.equal(1);
    const message = showWarningStub.firstCall.args[0];
    expect(message).to.match(/^CQL execution finished — 1 of 3 libraries failed: LibB \(/);
    // Open Logs button is offered.
    expect(showWarningStub.firstCall.args[1]).to.equal('Open Logs');
  });

  test('truncates the failed-names list to 3 with an ellipsis when more than 3 fail', async () => {
    const eightLibs = Array.from({ length: 8 }, (_, i) => ({
      name: `Lib${i}`,
      uri: Uri.file(`/project/input/cql/Lib${i}.cql`),
    }));
    const failedEverywhereExec = async () => {
      throw new Error('always fails');
    };
    await runLibraryBatch(eightLibs, 'Execute CQL', { execute: failedEverywhereExec });
    const message = showWarningStub.firstCall.args[0];
    // 8 of 8 failed, but only the first 3 names are shown, then "…".
    expect(message).to.match(/^CQL execution finished — 8 of 8 libraries failed: Lib0, Lib1, Lib2… \(/);
  });

  test('always pluralizes "libraries" in the failure summary (agrees with total)', async () => {
    const oneFailingOnePassing = [
      { name: 'LibPass', uri: Uri.file('/project/input/cql/p.cql') },
      { name: 'LibFail', uri: Uri.file('/project/input/cql/f.cql') },
    ];
    await runLibraryBatch(oneFailingOnePassing, 'Execute CQL', {
      execute: async uri => {
        if (uri.fsPath === oneFailingOnePassing[1].uri.fsPath) {
          throw new Error('boom');
        }
      },
    });
    const message = showWarningStub.firstCall.args[0];
    expect(message).to.match(/^CQL execution finished — 1 of 2 libraries failed: LibFail \(/);
  });

  test('runs cql.open.logs when the user clicks "Open Logs" in the warning', async () => {
    showWarningStub.resolves('Open Logs' as any);
    await runLibraryBatch(libs, 'Execute CQL', {
      execute: async uri => {
        if (uri.fsPath === libs[1].uri.fsPath) {
          throw new Error('boom');
        }
      },
    });
    await flushPromises();
    expect(executeCommandStub.calledWith('cql.open.logs')).to.be.true;
  });

  test('does not run cql.open.logs when the user dismisses the warning without picking "Open Logs"', async () => {
    showWarningStub.resolves(undefined as any);
    await runLibraryBatch(libs, 'Execute CQL', {
      execute: async uri => {
        if (uri.fsPath === libs[1].uri.fsPath) {
          throw new Error('boom');
        }
      },
    });
    await flushPromises();
    expect(executeCommandStub.calledWith('cql.open.logs')).to.be.false;
  });

  test('runs the next library only after delayMs have elapsed between calls', async () => {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      const startTimestamps: number[] = [];
      const startMs = Date.now();
      const batch = runLibraryBatch(libs, 'Execute CQL', {
        delayMs: 200,
        execute: async () => {
          startTimestamps.push(Date.now() - startMs);
        },
      });
      await clock.tickAsync(400);
      await batch;
      // Three libs, two inter-library gaps of exactly delayMs.
      expect(startTimestamps).to.deep.equal([0, 200, 400]);
    } finally {
      clock.restore();
    }
  });

  test('does not sleep after the last library (delayMs tail elision)', async () => {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      let done = false;
      const batch = runLibraryBatch(libs.slice(0, 1), 'Execute CQL', {
        delayMs: 200,
        execute: async () => {},
      }).then(() => {
        done = true;
      });
      // Well short of delayMs: resolving here proves no trailing sleep was scheduled.
      await clock.tickAsync(1);
      expect(done).to.be.true;
      await batch;
    } finally {
      clock.restore();
    }
  });

  test('resolves even if the failure warning toast is never dismissed', async () => {
    // A non-modal toast's promise only settles on user interaction; simulate one that never does.
    showWarningStub.returns(new Promise(() => {}));
    const outcome = await Promise.race([
      runLibraryBatch(libs, 'Execute CQL', {
        execute: async uri => {
          if (uri.fsPath === libs[1].uri.fsPath) {
            throw new Error('boom');
          }
        },
      }).then(() => 'resolved'),
      new Promise(resolve => setTimeout(() => resolve('timed out'), 500)),
    ]);
    expect(outcome).to.equal('resolved');
    expect(showWarningStub.calledOnce).to.be.true;
  });

  test('shows the summary after the progress task has finished', async () => {
    let progressDone = false;
    withProgressStub.callsFake(async (_options, task) => {
      const result = await task({ report: () => {} }, token as unknown as CancellationToken);
      progressDone = true;
      return result;
    });
    showInfoStub.callsFake(() => {
      expect(progressDone, 'summary shown while progress notification was still open').to.be.true;
      return Promise.resolve(undefined);
    });
    await runLibraryBatch(libs, 'Execute CQL', { execute: async () => {} });
    expect(showInfoStub.calledOnce).to.be.true;
  });

  test('reports cancelled when Cancel is clicked during the last library', async () => {
    const result = await runLibraryBatch(libs, 'Execute CQL', {
      execute: async uri => {
        if (uri.fsPath === libs[2].uri.fsPath) {
          token.isCancellationRequested = true;
        }
      },
    });
    expect(result.cancelled).to.be.true;
    expect(showInfoStub.firstCall.args[0]).to.match(/^CQL execution cancelled — 3\/3 libraries \(/);
  });

  test('a cancelled batch with failures says cancelled and counts libraries not run', async () => {
    await runLibraryBatch(libs, 'Execute CQL', {
      execute: async uri => {
        if (uri.fsPath === libs[0].uri.fsPath) {
          token.isCancellationRequested = true;
          throw new Error('boom');
        }
      },
    });
    expect(showInfoStub.called).to.be.false;
    expect(showWarningStub.firstCall.args[0]).to.match(
      /^CQL execution cancelled — 1 of 3 libraries failed: LibA; 2 not run \(/,
    );
  });

  test('returns BatchResult fields consistent with observed behavior', async () => {
    let result;
    await runLibraryBatch(libs, 'Execute CQL', {
      execute: async uri => {
        if (uri.fsPath === libs[1].uri.fsPath) {
          throw new Error('boom');
        }
      },
    }).then(r => {
      result = r;
    });
    expect(result!.completed).to.equal(2);
    expect(result!.failed).to.equal(1);
    expect(result!.failedNames).to.deep.equal(['LibB']);
    expect(result!.cancelled).to.be.false;
    expect(result!.elapsedSeconds).to.be.a('number');
  });
});
