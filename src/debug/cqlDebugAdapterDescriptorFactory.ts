import * as vscode from 'vscode';
import { LanguageClient, ExecuteCommandRequest } from 'vscode-languageclient/node';

const START_DEBUG_SESSION_CMD = 'org.opencds.cqf.cql.debug.startDebugSession';

export class CqlDebugAdapterDescriptorFactory
  implements vscode.DebugAdapterDescriptorFactory
{
  constructor(private readonly client: LanguageClient) {}

  async createDebugAdapterDescriptor(
    _session: vscode.DebugSession,
  ): Promise<vscode.DebugAdapterDescriptor> {
    const port = await this.client.sendRequest(ExecuteCommandRequest.type, {
      command: START_DEBUG_SESSION_CMD,
      arguments: [],
    });
    return new vscode.DebugAdapterServer(port as number);
  }
}
