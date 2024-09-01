import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConnectionManager, Context } from '../connectionManager';

suite('Connection Manager Test', () => {
  test('Connection Manager -- should be present', async function () {
    this.timeout(0);
    const extension = vscode.extensions.getExtension('cqframework.cql'); // as unknown as vscode.ExtensionContext;
    if (!extension?.isActive) {
      await extension?.activate();
    }
    ConnectionManager._initialize(extension?.activate() as unknown as vscode.ExtensionContext);

    assert.ok(ConnectionManager.getManager() !== undefined);
  });

  test('Connection Manager -- Add Test Connection', () => {
    ConnectionManager.getManager().upsertConnection({
      name: '123-connection',
      endpoint: 'http://smilecdr/fhir',
      contexts: {
        'Patient/test': {
          resourceID: 'test',
          resourceType: 'Patient',
        },
      },
    });
    assert.ok(ConnectionManager.getManager().getAllConnections()['123-connection'] !== undefined);
  });

  test('Connection Manager -- Current Connection', () => {
    ConnectionManager.getManager().setCurrentConnection('123-connection');
    assert.ok(ConnectionManager.getManager().getCurrentConnection()?.name === '123-connection');
  });

  test('Connection Manager -- Add Context', () => {
    let newContext: Context = {
      resourceID: 'test-add-context',
      resourceType: 'Patient',
      resourceDisplay: 'A Test Patient',
    };

    ConnectionManager.getManager().upsertContext(
      ConnectionManager.getManager().getCurrentConnection()?.name as string,
      newContext,
    );

    assert.ok(
      ConnectionManager.getManager().getCurrentConnection()?.contexts['Patient/test-add-context']
        .resourceID === 'test-add-context',
    );
  });

  test('Connection Manager -- Multiple Connections', () => {
    ConnectionManager.getManager().upsertConnection({
      name: 'connection-2',
      endpoint: 'http://smilecdr/fhir',
      contexts: {
        'Patient/test-2': {
          resourceID: 'test-2',
          resourceType: 'Patient',
        },
      },
    });

    ConnectionManager.getManager().upsertConnection({
      name: 'connection-3',
      endpoint: 'http://smilecdr/fhir',
      contexts: {
        'Patient/test-3': {
          resourceID: 'test-3',
          resourceType: 'Patient',
        },
      },
    });

    console.log(ConnectionManager.getManager().getAllConnections());

    assert.ok(ConnectionManager.getManager().getAllConnections()['123-connection'] !== undefined);
    assert.ok(ConnectionManager.getManager().getAllConnections()['connection-2'] !== undefined);
    assert.ok(ConnectionManager.getManager().getAllConnections()['connection-3'] !== undefined);
    assert.ok(
      ConnectionManager.getManager().getAllConnections()['not-a-real-connection'] === undefined,
    );
  });

  test('Connection Manager -- Testing Delete Connection', () => {
    assert.ok(ConnectionManager.getManager().getAllConnections()['123-connection'] !== undefined);

    ConnectionManager.getManager().deleteConnection('123-connection');

    assert.ok(ConnectionManager.getManager().getAllConnections()['123-connection'] === undefined);
  });
});
