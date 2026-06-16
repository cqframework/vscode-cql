import { debug, Uri } from 'vscode';
import * as log from '../log-services/logger';
import { getElm } from '../cql-service/cqlService.getElm';

export async function fetchAstViaDap(
  cqlFileUri: Uri,
  _type: 'ast',
): Promise<string> {
  const session = debug.activeDebugSession;
  if (!session || session.type !== 'cql') throw new Error('No active CQL debug session');
  try {
    const resp = await session.customRequest('getAst', { uri: cqlFileUri.toString() });
    if (resp?.ast) {
      log.debug('fetchAstViaDap: DAP getAst succeeded for {} ({} chars)', cqlFileUri.toString(), resp.ast.length);
      return resp.ast;
    }
    log.debug('fetchAstViaDap: DAP getAst returned no ast for {}', cqlFileUri.toString());
  } catch (e) {
    log.debug('fetchAstViaDap: DAP getAst failed for {} err={}', cqlFileUri.toString(), e);
  }
  log.debug('fetchAstViaDap: falling back to getElm for {}', cqlFileUri.toString());
  return getElm(cqlFileUri, 'ast');
}
