let extensionVersion: string = '0.0.0';

export function setExtensionVersion(version: string) {
    extensionVersion = version;
}

export function getExtensionVersion(): string {
    return extensionVersion;
}