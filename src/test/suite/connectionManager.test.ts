import { ConnectionManager, Context } from '../../connectionManager';

export function connectionManagerTester(manager: ConnectionManager): void {
  console.log('Testing Connection Manager');

  console.log('Testing Adding a Connection');
  manager.upsertConnection({
    name: '123-connection',
    url: new URL('http://smilecdr/fhir'),
    contexts: {
      'Patient/test': {
        resourceID: 'test',
        resourceType: 'Patient',
      },
    },
  });

  console.log('Testing Current Connection');
  let currentConnection = manager.getCurrentConnection();
  console.log(currentConnection);

  console.log('Test Setting Current Connection');
  manager.setCurrentConnection('123-connection');
  console.log('Testing Current Connection');
  currentConnection = manager.getCurrentConnection();
  console.log(currentConnection);

  console.log('Testing Add Context');
  let newContext: Context = {
    resourceID: 'test-2',
    resourceType: 'Patient',
    resourceDisplay: 'A Test Patient',
  };
  manager.upsertContext(manager.getCurrentConnection()?.name as string, newContext);

  console.log('Gathering All Connections');
  console.log(manager.getAllConnections());

  console.log('Adding Multiple Connections');
  manager.upsertConnection({
    name: 'connection-2',
    url: new URL('http://smilecdr/fhir'),
    contexts: {
      'Patient/test-2': {
        resourceID: 'test-2',
        resourceType: 'Patient',
      },
    },
  });

  manager.upsertConnection({
    name: 'connection-3',
    url: new URL('http://smilecdr/fhir'),
    contexts: {
      'Patient/test-3': {
        resourceID: 'test-3',
        resourceType: 'Patient',
      },
    },
  });

  console.log('Gathering All Connections');
  console.log(manager.getAllConnections());

  console.log('Testing Delete Connection');
  manager.deleteConnection('123-connection');

  console.log('Gathering All Connections');
  console.log(manager.getAllConnections());

  console.log('End of Connection Manager Testing');
}
