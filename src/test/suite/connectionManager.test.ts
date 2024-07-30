import { Connection, ConnectionManager, Context, guid } from '../../connectionManager';

export function connectionManagerTester(): void {
  const manager = new ConnectionManager();
  console.log('Testing Connection Manager');

  console.log('Testing Current Connection');
  let currentConnection = manager.getCurrentConnection();
  console.log(currentConnection);

  console.log('Testing Adding a Connection');
  let connectionContexts = new Array<Context>();
  connectionContexts.push({
    id: guid('123-context'),
    resourceID: 'test',
    resourceType: 'Patient',
  });
  manager.addConnection({
    id: guid('123-connection'),
    url: new URL('http://smilecdr/fhir'),
    active: true,
    context: connectionContexts,
  });

  console.log('Testing Current Connection');
  currentConnection = manager.getCurrentConnection();
  console.log(currentConnection);

  console.log('Testing Add Context');
  let newContext: Context = {
    id: guid('123-second-context'),
    resourceID: 'test-2',
    resourceType: 'Patient',
    resourceDisplay: 'A Test Patient',
  };
  manager.addContext(manager.getCurrentConnection(), newContext);

  console.log('Gathering All Connections');
  console.log(manager.getAllConnections());

  console.log('Adding Multiple Connections');
  connectionContexts = new Array<Context>();
  newContext = { id: guid('456-first-context'), resourceID: 'test-3', resourceType: 'Patient' };
  connectionContexts.push(newContext);
  manager.addConnection({
    id: guid('connection-2'),
    url: new URL('http://smilecdr/fhir'),
    active: true,
    context: connectionContexts,
  });
  connectionContexts = new Array<Context>();
  newContext = { id: guid('789-first-context'), resourceID: 'test-4', resourceType: 'Patient' };
  connectionContexts.push(newContext);
  manager.addConnection({
    id: guid('connection-3'),
    url: new URL('http://smilecdr/fhir'),
    active: false,
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
    .indexOf(guid('123-connection'));

  var value2 = manager
    .getAllConnections()
    .map(function (x) {
      return x.id;
    })
    .indexOf(guid('connection-3'));

  manager.deleteConnection(
    manager
      .getAllConnections()
      .find(x => x != undefined && (x.id = guid('123-connection'))) as Connection,
  );

  console.log('Gathering All Connections');
  console.log(manager.getAllConnections());

  console.log('End of Connection Manager Testing');
}
