/**
 * This file contains the public api for the extension. Anything that other extensions may be dependent upon should be defined here
 */
export enum ClientStatus {
	Uninitialized = "Uninitialized",
	Initialized = "Initialized",
	Starting = "Starting",
	Started = "Started",
	Error = "Error",
	Stopping = "Stopping",
}
