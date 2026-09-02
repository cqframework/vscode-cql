import { ExtensionContext, TextDocumentContentProvider, Uri, workspace } from 'vscode';
import { getVirtualSource } from './cqlService.getVirtualSource';
import * as log from '../log-services/logger';

/**
 * Serves read-only content for `cql-virtual:` URIs — synthetic locations minted by the
 * language server's go-to-definition support for libraries with no workspace file (bundled,
 * e.g. FHIRHelpers, or npm-installed, e.g. FHIRCommon). VS Code's built-in go-to-definition
 * machinery invokes this automatically whenever a `LocationLink`'s `targetUri` uses this scheme.
 */
export const CQL_VIRTUAL_SCHEME = 'cql-virtual';

export class CqlVirtualSourceContentProvider implements TextDocumentContentProvider {
  async provideTextDocumentContent(uri: Uri): Promise<string> {
    try {
      const content = await getVirtualSource(uri);
      if (content == null) {
        log.debug(`cqlVirtualSourceContentProvider: no content resolved for ${uri.toString()}`);
        return '';
      }
      return content;
    } catch (error) {
      log.error(`cqlVirtualSourceContentProvider: error resolving ${uri.toString()}`, error as Error);
      return '';
    }
  }
}

export function register(context: ExtensionContext): void {
  context.subscriptions.push(
    workspace.registerTextDocumentContentProvider(CQL_VIRTUAL_SCHEME, new CqlVirtualSourceContentProvider()),
  );
}
