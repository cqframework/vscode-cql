import * as fs from 'fs';
import fetch from 'node-fetch';
import * as path from 'path';
import { ExtensionContext, Progress, ProgressLocation, window } from 'vscode';
import { ensureExists } from './utils';

interface MavenCoords {
  groupId: string;
  artifactId: string;
  version: string;
  classifier?: string;
  type?: string;
}

/**
 * Returns the directory path where JAR files are stored.
 * @returns {string} The JAR home directory path.
 */
function getJarHome(): string {
  return path.join(__dirname, '../jars');
}

/**
 * Retrieves the path of a service JAR file based on the Maven coordinates.
 * @param {ExtensionContext} context - The VS Code extension context.
 * @param {string} serviceName - The name of the service.
 * @returns {string} The path to the service JAR file.
 * @throws Will throw an error if the Maven coordinates for the service are not found.
 */
export function getServicePath(context: ExtensionContext, serviceName: string): string {
  const coords = getCoords(context);
  const serviceCoords = coords[serviceName];
  if (!serviceCoords) {
    throw Error(`Maven coordinates not found for ${serviceName}`);
  }

  return getServicePathFromCoords(serviceCoords);
}

/**
 * Retrieves Maven coordinates from the `package.json` file in the extension context.
 * @param {ExtensionContext} context - The VS Code extension context.
 * @returns {{ [serviceName: string]: MavenCoords }} An object containing Maven coordinates keyed by service name.
 */
function getCoords(context: ExtensionContext): {
  [serviceName: string]: MavenCoords;
} {
  const extensionPath = path.resolve(context.extensionPath, 'package.json');
  const packageFile = JSON.parse(fs.readFileSync(extensionPath, 'utf8'));

  const javaDependencies = packageFile['javaDependencies'];
  return javaDependencies as { [serviceName: string]: MavenCoords };
}

/**
 * Generates the path for a service JAR file based on Maven coordinates.
 * @param {MavenCoords} coords - The Maven coordinates of the service.
 * @returns {string} The path to the service JAR file.
 */
function getServicePathFromCoords(coords: MavenCoords): string {
  const jarHome = getJarHome();
  const jarName = getLocalName(coords);
  return path.join(jarHome, jarName);
}

/**
 * Installs Java dependencies specified in the `package.json` file.
 * @param {ExtensionContext} context - The VS Code extension context.
 * @returns {Promise<void>} A promise that resolves when all dependencies are installed.
 */
export async function installJavaDependencies(context: ExtensionContext): Promise<void> {
  const coords = getCoords(context);
  await installJavaDependenciesFromCoords(coords);
}

/**
 * Installs Java dependencies based on the provided Maven coordinates.
 * @param {{ [serviceName: string]: MavenCoords }} coordsMaps - An object containing Maven coordinates keyed by service name.
 * @returns {Promise<void>} A promise that resolves when all dependencies are installed.
 */
async function installJavaDependenciesFromCoords(coordsMaps: {
  [serviceName: string]: MavenCoords;
}): Promise<void> {
  for (const [key, value] of Object.entries(coordsMaps)) {
    await installServiceIfMissing(key, value);
  }
}

/**
 * Generates the local filename for a JAR file based on Maven coordinates.
 * @param {MavenCoords} coords - The Maven coordinates of the service.
 * @returns {string} The local filename for the JAR file.
 */
function getLocalName(coords: MavenCoords): string {
  return `${coords.artifactId}-${coords.version}${
    coords.classifier ? '-' + coords.classifier : ''
  }${coords.type ? '.' + coords.type : '.jar'}`;
}

/**
 * Generates the URL for searching and downloading a JAR file based on Maven coordinates.
 * @param {MavenCoords} coords - The Maven coordinates of the service.
 * @returns {string} The URL for searching and downloading the JAR file.
 */
function getSearchUrl(coords: MavenCoords): string {
  const repository = coords.version.toLowerCase().endsWith('-snapshot') ? 'snapshots' : 'releases';
  return (
    `https://oss.sonatype.org/service/local/artifact/maven/redirect?r=${repository}&g=${coords.groupId}&a=${coords.artifactId}&v=${coords.version}` +
    (coords.classifier ? `&c=${coords.classifier}` : ``)
  );
}

/**
 * Installs a service if its JAR file is missing.
 * @param {string} serviceName - The name of the service.
 * @param {MavenCoords} coords - The Maven coordinates of the service.
 * @returns {Promise<void>} A promise that resolves when the service is installed.
 */
async function installServiceIfMissing(serviceName: string, coords: MavenCoords): Promise<void> {
  const doesExist = isServiceInstalled(coords);
  if (!doesExist) {
    return window.withProgress(
      {
        location: ProgressLocation.Notification,
        cancellable: false,
        title: `Installing ${serviceName}`,
      },
      async progress => {
        await installJar(serviceName, coords, progress);
      },
    );
  }
}

/**
 * Checks if a service JAR file is already installed.
 * @param {MavenCoords} coords - The Maven coordinates of the service.
 * @returns {boolean} `true` if the service JAR file is installed, `false` otherwise.
 */
function isServiceInstalled(coords: MavenCoords): boolean {
  const jarPath = getServicePathFromCoords(coords);
  try {
    const stats = fs.lstatSync(jarPath);
    return stats != null;
  } catch (e) {
    return false;
  }
}

/**
 * Installs a JAR file based on Maven coordinates.
 * @param {string} serviceName - The name of the service.
 * @param {MavenCoords} coords - The Maven coordinates of the service.
 * @param {Progress<{ message?: string; increment?: number }>} [progress] - The progress reporter.
 * @returns {Promise<void>} A promise that resolves when the JAR file is installed.
 */
async function installJar(
  serviceName: string,
  coords: MavenCoords,
  progress?: Progress<{ message?: string; increment?: number }>,
): Promise<void> {
  const jarPath = getServicePathFromCoords(coords);
  const jarHome = getJarHome();

  if (progress) {
    progress.report({ message: `Starting download` });
  }
  ensureExists(jarHome);
  const searchUrl = getSearchUrl(coords);
  const setupInfo = await setupDownload(serviceName, searchUrl);

  await downloadFile(
    setupInfo.serverDownloadUrl,
    jarPath,
    serviceName,
    setupInfo.serverDownloadSize,
    progress,
  );

  if (progress) {
    progress.report({ message: `Download complete` });
  }

  const doesExist = fs.existsSync(jarPath);
  if (!doesExist) {
    throw Error(`Failed to install ${serviceName}`);
  }
}

/**
 * Downloads a file from a URL to a specified path.
 * @param {string} url - The URL of the file to download.
 * @param {string} path - The path to save the downloaded file.
 * @param {string} _serviceName - The name of the service.
 * @param {number} [totalBytes] - The total size of the file in bytes.
 * @param {Progress<{ message?: string; increment?: number }>} [progress] - The progress reporter.
 * @returns {Promise<void>} A promise that resolves when the file download is complete.
 */
async function downloadFile(
  url: string,
  path: string,
  _serviceName: string,
  totalBytes?: number,
  progress?: Progress<{ message?: string; increment?: number }>,
) {
  const res = await fetch(url);
  const fileStream = fs.createWriteStream(path);
  let bytesSoFar = 0;
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on('data', chunk => {
      if (progress) {
        bytesSoFar += chunk.length;
        progress.report({
          message: `Downloading`,
          increment: bytesSoFar / totalBytes!,
        });
      }
    });
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
}

/**
 * Sets up the download by determining the redirect URL and file size.
 * @param {string} serviceName - The name of the service.
 * @param {string} url - The URL to initiate the download.
 * @returns {Promise<{ serverDownloadUrl: string, serverDownloadSize: number | undefined }>} An object containing the redirect URL and the file size.
 * @throws Will throw an error if the redirect URL cannot be determined.
 */
async function setupDownload(serviceName: string, url: string) {
  let response = await fetch(url, { redirect: 'manual' });
  const redirectUrl = response.headers.get('location');

  if (!redirectUrl || redirectUrl === '') {
    throw new Error(`Unable to locate and/or download files for ${serviceName}`);
  }

  response = await fetch(redirectUrl, { method: 'head' });
  const length = response.headers.get('content-length');

  return {
    serverDownloadUrl: redirectUrl,
    serverDownloadSize: length ? parseInt(length) : undefined,
  };
}
