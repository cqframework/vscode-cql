// executeCQL.test must run before the extension itself is loaded
require('./executeCQL.test');

// Loads the extension.
require('./extension.test');

require('./connectionManager.test');
