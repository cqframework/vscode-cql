'use strict';

import { workspace, WorkspaceConfiguration } from 'vscode';

export function getCqlConfiguration(): WorkspaceConfiguration {
	return workspace.getConfiguration('cql');
}
