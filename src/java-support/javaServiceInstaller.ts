import * as fs from 'fs';
import fetch from 'node-fetch';
import * as path from 'path';
import { ExtensionContext, Progress, ProgressLocation, window } from 'vscode';
import * as log from '../log-services/logger';
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
  const jarPath = getServicePathFromCoords(extensionPath, coords);
  if (isServiceInstalled(extensionPath, coords)) {
    log.debug(`Using ${serviceName} at ${jarPath}`);
    return;
  }

  const url = getSearchUrl(coords);
  log.info(`${serviceName} not found at ${jarPath}; downloading from ${url}`);
  const startedAt = Date.now();
  try {
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        cancellable: false,
        title: `Downloading CQL Language Server ${coords.version} (first run only)`,
      },
      async progress => {
        await installJar(extensionPath, serviceName, coords, progress);
      },
    );
  } catch (e) {
    log.error(`Failed to download ${serviceName} from ${url}`, e);
    throw e;
  }
  const mb = (fs.statSync(jarPath).size / BYTES_PER_MB).toFixed(1);
  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  log.info(`Downloaded ${serviceName} (${mb} MB) in ${secs}s to ${jarPath}`);
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

const BYTES_PER_MB = 1024 * 1024;

export function partialPath(jarPath: string): string {
  return `${jarPath}.part`;
}

// VS Code's `increment` is additive percent points, so report only the delta since the last report.
export function progressStep(
  bytesSoFar: number,
  totalBytes: number | undefined,
  lastPct: number,
): { pct: number; increment: number } {
  if (!totalBytes || totalBytes <= 0) {
    return { pct: lastPct, increment: 0 };
  }
  const pct = Math.min(100, Math.floor((bytesSoFar / totalBytes) * 100));
  return { pct, increment: Math.max(0, pct - lastPct) };
}

export function formatProgressMessage(bytesSoFar: number, totalBytes?: number): string {
  const soFarMb = (bytesSoFar / BYTES_PER_MB).toFixed(1);
  if (!totalBytes || totalBytes <= 0) {
    return `Downloading ${soFarMb} MB`;
  }
  const totalMb = (totalBytes / BYTES_PER_MB).toFixed(1);
  const pct = Math.min(100, Math.floor((bytesSoFar / totalBytes) * 100));
  return `Downloading ${soFarMb} / ${totalMb} MB (${pct}%)`;
}

// Best-effort delete: a failure (e.g. EPERM/EBUSY on Windows) must not mask the caller's error.
// A leftover .part is cleared at the start of the next download.
export function safeRemove(file: string): void {
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch (err) {
    log.warn(`Could not remove partial download ${file}`, err);
  }
}

async function downloadFile(
  url: string,
  jarPath: string,
  _serviceName: string,
  totalBytes?: number,
  progress?: Progress<{ message?: string; increment?: number }>,
) {
  const part = partialPath(jarPath);
  // Clear any partial left by an earlier interrupted run.
  safeRemove(part);
  let fileStream: fs.WriteStream | undefined;
  let streamClosed: Promise<void> | undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download ${url}: ${res.statusText} (${res.status})`);
    }
    fileStream = fs.createWriteStream(part);
    const out = fileStream;
    streamClosed = new Promise<void>(resolve => out.once('close', () => resolve()));
    let bytesSoFar = 0;
    let lastPct = 0;
    let lastMb = -1;
    await new Promise((resolve, reject) => {
      res.body.pipe(out);
      res.body.on('data', chunk => {
        bytesSoFar += chunk.length;
        if (!progress) {
          return;
        }
        if (totalBytes) {
          const step = progressStep(bytesSoFar, totalBytes, lastPct);
          if (step.pct !== lastPct) {
            lastPct = step.pct;
            progress.report({
              message: formatProgressMessage(bytesSoFar, totalBytes),
              increment: step.increment,
            });
          }
        } else {
          const mb = Math.floor(bytesSoFar / BYTES_PER_MB);
          if (mb !== lastMb) {
            lastMb = mb;
            progress.report({ message: formatProgressMessage(bytesSoFar) });
          }
        }
      });
      res.body.on('error', err => {
        res.body.unpipe(out);
        reject(err);
      });
      out.on('error', reject);
      out.on('finish', resolve);
    });
    if (totalBytes !== undefined && out.bytesWritten !== totalBytes) {
      throw new Error(
        `Incomplete download of ${url}: expected ${totalBytes} bytes, got ${out.bytesWritten}`,
      );
    }
    // Same directory, so the rename is atomic: jarPath never holds a truncated file.
    fs.renameSync(part, jarPath);
  } catch (e) {
    // Release the file handle first: on Windows, deleting an open file throws EPERM/EBUSY.
    if (fileStream && streamClosed) {
      fileStream.destroy();
      await streamClosed;
    }
    safeRemove(part);
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
