import * as fs from 'fs';
import fetch from 'node-fetch';
import * as path from 'path';
import { ExtensionContext, Progress, ProgressLocation, window } from 'vscode';
import { ensureExists } from '../utils/file-utils';

interface MavenCoords {
  groupId: string;
  artifactId: string;
  version: string;
  classifier?: string;
  type?: string;
}

function getJarHome(extensionPath: string): string {
  return path.join(extensionPath, 'dist', 'java-support', 'jars');
}

export function getServicePath(context: ExtensionContext, serviceName: string): string {
  const coords = getCoords(context);
  const serviceCoords = coords[serviceName];
  if (!serviceCoords) {
    throw Error(`Maven coordinates not found for ${serviceName}`);
  }

  return getServicePathFromCoords(context.extensionPath, serviceCoords);
}

function getCoords(context: ExtensionContext): {
  [serviceName: string]: MavenCoords;
} {
  const extensionPath = path.resolve(context.extensionPath, 'package.json');
  const packageFile = JSON.parse(fs.readFileSync(extensionPath, 'utf8'));

  const javaDependencies = packageFile['javaDependencies'];
  return javaDependencies as { [serviceName: string]: MavenCoords };
}

function getServicePathFromCoords(extensionPath: string, coords: MavenCoords): string {
  const jarHome = getJarHome(extensionPath);
  const jarName = getLocalName(coords);
  return path.join(jarHome, jarName);
}

export async function installJavaDependencies(context: ExtensionContext): Promise<void> {
  const coords = getCoords(context);
  await installJavaDependenciesFromCoords(context.extensionPath, coords);
}

async function installJavaDependenciesFromCoords(
  extensionPath: string,
  coordsMaps: { [serviceName: string]: MavenCoords },
): Promise<void> {
  for (const [key, value] of Object.entries(coordsMaps)) {
    await installServiceIfMissing(extensionPath, key, value);
  }
}

function getLocalName(coords: MavenCoords): string {
  return `${coords.artifactId}-${coords.version}${
    coords.classifier ? '-' + coords.classifier : ''
  }${coords.type ? '.' + coords.type : '.jar'}`;
}

function getSearchUrl(coords: MavenCoords): string {
  const groupIdAsDirectory = coords.groupId.replace(/\./gi, '/');
  return `https://repo1.maven.org/maven2/${groupIdAsDirectory}/${coords.artifactId}/${coords.version}/${getLocalName(coords)}`;
}

async function installServiceIfMissing(
  extensionPath: string,
  serviceName: string,
  coords: MavenCoords,
): Promise<void> {
  const doesExist = isServiceInstalled(extensionPath, coords);
  if (!doesExist) {
    return window.withProgress(
      {
        location: ProgressLocation.Notification,
        cancellable: false,
        title: `Installing ${serviceName}`,
      },
      async progress => {
        await installJar(extensionPath, serviceName, coords, progress);
      },
    );
  }
}

function isServiceInstalled(extensionPath: string, coords: MavenCoords): boolean {
  const jarPath = getServicePathFromCoords(extensionPath, coords);
  try {
    const stats = fs.lstatSync(jarPath);
    return stats != null;
  } catch (e) {
    return false;
  }
}

// Installs a jar using maven coordinates
async function installJar(
  extensionPath: string,
  serviceName: string,
  coords: MavenCoords,
  progress?: Progress<{ message?: string; increment?: number }>,
): Promise<void> {
  const jarPath = getServicePathFromCoords(extensionPath, coords);
  const jarHome = getJarHome(extensionPath);

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

async function downloadFile(
  url: string,
  path: string,
  _serviceName: string,
  totalBytes?: number,
  progress?: Progress<{ message?: string; increment?: number }>,
) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.statusText} (${res.status})`);
  }
  const fileStream = fs.createWriteStream(path);
  let bytesSoFar = 0;
  try {
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
      fileStream.on('error', reject);
      fileStream.on('finish', resolve);
    });
  } catch (e) {
    if (fs.existsSync(path)) {
      fs.unlinkSync(path);
    }
    throw e;
  }
}

async function setupDownload(serviceName: string, url: string) {
  // BTR: This used to be because the oss service had a redirect in to get the actual location
  // We're now constructing the download URL directly according to maven2 repo structure:
  // https://maven.apache.org/repository/layout.html
  //let response = await fetch(url, { redirect: 'manual' });
  //const redirectUrl = response.headers.get('location');

  let redirectUrl = url;

  if (!redirectUrl || redirectUrl === '') {
    throw new Error(`Unable to locate and/or download files for ${serviceName}`);
  }

  let response = await fetch(redirectUrl, { method: 'head' });
  const length = response.headers.get('content-length');

  return {
    serverDownloadUrl: redirectUrl,
    serverDownloadSize: length ? parseInt(length) : undefined,
  };
}
