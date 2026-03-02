# CQL Service Modules

The cqlService modules are intended to be the link between the VSCode extension and the external services that handle CQL operations.

Currently, CQL operations are passed through the CQL Language Server(java) via the cqlLanguageClient.
Future plans intent to move the CQL operations to a JS based library(s) which will remove the need for a CQL Language Server.

_Note: There should be no UI operations in these modules, those are 'upstream' functions. Limit code in these modules to dealing with
interacting with external services/libraries only._

_Note: It is acceptable to use the cqlLanguageClient sendRequest function to handle the REST operations needed to interact with an
external Language Server. The communication between the extension and the Language Server is an implementation detail that
only clutters the `business logic` of cql operations._
