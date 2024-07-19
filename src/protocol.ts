/**
 * This file defines the API for messages exchanged between the client and the server
 */

import { RequestType, NotificationType, ExecuteCommandParams } from 'vscode-languageclient';
import { Command } from 'vscode';

/**
 * The message type. Copied from vscode protocol
 */
export enum MessageType {
  /**
   * An error message.
   */
  Error = 1,
  /**
   * A warning message.
   */
  Warning = 2,
  /**
   * An information message.
   */
  Info = 3,
  /**
   * A log message.
   */
  Log = 4,
}
export interface StatusReport {
  message: string;
  type: string;
}

export interface ProgressReport {
  id: string;
  task: string;
  subTask: string;
  status: string;
  workDone: number;
  totalWork: number;
  complete: boolean;
}

export interface ActionableMessage {
  severity: MessageType;
  message: string;
  data?: any;
  commands?: Command[];
}
export namespace StatusNotification {
  export const type = new NotificationType<StatusReport>('language/status');
}

export namespace ProgressReportNotification {
  export const type = new NotificationType<ProgressReport>('language/progressReport');
}
export namespace ActionableNotification {
  export const type = new NotificationType<ActionableMessage>('language/actionableNotification');
}

export namespace ExecuteClientCommandRequest {
  export const type = new RequestType<ExecuteCommandParams, any, void>(
    'workspace/executeClientCommand',
  );
}

export namespace ServerNotification {
  export const type = new NotificationType<ExecuteCommandParams>('workspace/notify');
}
