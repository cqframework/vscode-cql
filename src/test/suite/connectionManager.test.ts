import { v4 as uuidv4 } from 'uuid';
import { Connection, ConnectionManager, Context } from '../../connectionManager';

export function connectionManagerTester(): void {
  const manager = new ConnectionManager();
  console.log('Testing Connection Manager');

  console.log('Testing Current Connection');
  let currentConnection = manager.getCurrentConnection();
  console.log(currentConnection);

  console.log('Testing Adding a Connection');
  let connectionContexts = new Array<Context>();
  connectionContexts.push({
    id: '123-context',
    resourceID: 'test',
    resourceType: 'Patient',
  });
  manager.addConnection({
    id: '123-connection',
    url: new URL('http://smilecdr/fhir'),
    context: connectionContexts,
  });

  console.log('Testing Current Connection');
  currentConnection = manager.getCurrentConnection();
  console.log(currentConnection);

  console.log('Test Setting Current Connection');
  currentConnection = manager
    .getAllConnections()
    .find(x => x != undefined && (x.id = '123-connection'));
  manager.setCurrentConnection(currentConnection);
  console.log('Testing Current Connection');
  currentConnection = manager.getCurrentConnection();
  console.log(currentConnection);

  console.log('Testing Add Context');
  let newContext: Context = {
    id: '123-second-context',
    resourceID: 'test-2',
    resourceType: 'Patient',
    resourceDisplay: 'A Test Patient',
  };
  manager.addContext(manager.getCurrentConnection(), newContext);

  console.log('Gathering All Connections');
  console.log(manager.getAllConnections());

  console.log('Adding Multiple Connections');
  connectionContexts = new Array<Context>();
  newContext = { id: '456-first-context', resourceID: 'test-3', resourceType: 'Patient' };
  connectionContexts.push(newContext);
  manager.addConnection({
    id: 'connection-2',
    url: new URL('http://smilecdr/fhir'),
    context: connectionContexts,
  });
  connectionContexts = new Array<Context>();
  newContext = { id: '789-first-context', resourceID: 'test-4', resourceType: 'Patient' };
  connectionContexts.push(newContext);
  manager.addConnection({
    id: 'connection-3',
    url: new URL('http://smilecdr/fhir'),
    context: connectionContexts,
  });

  console.log('Testing Current Connection 2');
  currentConnection = manager.getCurrentConnection();
  console.log(currentConnection);

  console.log('Gathering All Connections');
  console.log(manager.getAllConnections());

  console.log('Testing Delete Connection');
  var value = manager
    .getAllConnections()
    .map(function (x) {
      return x.id;
    })
    .indexOf('123-connection');

  var value2 = manager
    .getAllConnections()
    .map(function (x) {
      return x.id;
    })
    .indexOf('connection-3');

  manager.deleteConnection(
    manager
      .getAllConnections()
      .find(x => x != undefined && (x.id = '123-connection')) as Connection,
  );

  console.log('Gathering All Connections');
  console.log(manager.getAllConnections());

  console.log('Test UUID Library');
  var sampleUUID = uuidv4();
  var contextUUID = uuidv4();
  console.log(sampleUUID);
  console.log('Adding UUID Connection');

  connectionContexts = new Array<Context>();
  connectionContexts.push({
    id: contextUUID,
    resourceID: 'test',
    resourceType: 'Patient',
  });
  manager.addConnection({
    id: sampleUUID,
    url: new URL('http://smilecdr/fhir'),
    context: connectionContexts,
  });

  console.log('Gathering All Connections');
  console.log(manager.getAllConnections());

  console.log('End of Connection Manager Testing');
}
