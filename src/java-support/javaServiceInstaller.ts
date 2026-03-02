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

function getJarHome(): string {
  return path.join(__dirname, 'jars');
}

export function getServicePath(context: ExtensionContext, serviceName: string): string {
  const coords = getCoords(context);
  const serviceCoords = coords[serviceName];
  if (!serviceCoords) {
    throw Error(`Maven coordinates not found for ${serviceName}`);
  }

  return getServicePathFromCoords(serviceCoords);
}

function getCoords(context: ExtensionContext): {
  [serviceName: string]: MavenCoords;
} {
  const extensionPath = path.resolve(context.extensionPath, 'package.json');
  const packageFile = JSON.parse(fs.readFileSync(extensionPath, 'utf8'));

  const javaDependencies = packageFile['javaDependencies'];
  return javaDependencies as { [serviceName: string]: MavenCoords };
}

function getServicePathFromCoords(coords: MavenCoords): string {
  const jarHome = getJarHome();
  const jarName = getLocalName(coords);
  return path.join(jarHome, jarName);
}

export async function installJavaDependencies(context: ExtensionContext): Promise<void> {
  const coords = getCoords(context);
  await installJavaDependenciesFromCoords(coords);
}

async function installJavaDependenciesFromCoords(coordsMaps: {
  [serviceName: string]: MavenCoords;
}): Promise<void> {
  for (const [key, value] of Object.entries(coordsMaps)) {
    await installServiceIfMissing(key, value);
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

function isServiceInstalled(coords: MavenCoords): boolean {
  const jarPath = getServicePathFromCoords(coords);
  try {
    const stats = fs.lstatSync(jarPath);
    return stats != null;
  } catch (e) {
    return false;
  }
}

// Installs a jar using maven coordinates
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
