
import * as cp from "child_process";
import * as fse from "fs-extra";
import * as _ from "lodash";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { ensureExists } from './utils';
import fetch from 'node-fetch';
import { ExtensionContext, Progress, ProgressLocation, window } from "vscode";
import { VersionedTextDocumentIdentifier } from "vscode-languageserver-types";

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

export async function getServicePath(context: ExtensionContext, serviceName: string): Promise<string> {
	const coords = await getCoords(context);
	const serviceCoords = coords[serviceName];
	if (!serviceCoords) {
		throw `Maven coordinates not found for ${serviceName}`;
	}

	return getServicePathFromCoords(serviceCoords);
}

async function getCoords(context: ExtensionContext): Promise<{ [serviceName: string]: MavenCoords }> {
	const extensionPath = path.resolve(context.extensionPath, "package.json");
	const packageFile = JSON.parse(fs.readFileSync(extensionPath, 'utf8'));

	const javaDependencies = packageFile["javaDependencies"];
	return (javaDependencies as { [serviceName: string]: MavenCoords });
}

function getServicePathFromCoords(coords: MavenCoords): string {
	const jarHome = getJarHome();
	const jarName = getLocalName(coords);
	return path.join(jarHome, jarName);
}

export async function installJavaDependencies(context: ExtensionContext): Promise<void> {
	const coords = await getCoords(context);
	await installJavaDependenciesFromCoords(coords);
}

async function installJavaDependenciesFromCoords(coordsMaps: { [serviceName: string]: MavenCoords }): Promise<void> {
	for (const [key, value] of Object.entries(coordsMaps)) {
		await installServiceIfMissing(key, value);
	}
}

function getLocalName(coords: MavenCoords): string {
	return `${coords.artifactId}-${coords.version}${coords.classifier ? "-" + coords.classifier : ""}${coords.type ? "." + coords.type : ".jar"}`;
}

function getSearchUrl(coords: MavenCoords): string {
	const repository = coords.version.toLowerCase().endsWith("-snapshot") ? "snapshots" : "releases";
	return `https://oss.sonatype.org/service/local/artifact/maven/redirect?r=${repository}&g=${coords.groupId}&a=${coords.artifactId}&v=${coords.version}` + (coords.classifier ?
		`&c=${coords.classifier}` : ``);
}

async function installServiceIfMissing(serviceName: string, coords: MavenCoords): Promise<void> {
	const doesExist = await isServiceInstalled(coords);
	if (!doesExist) {

		return await window.withProgress({ location: ProgressLocation.Notification, cancellable: false, title: `Installing ${serviceName}` }, async (progress) => {
			await installJar(serviceName, coords, progress);
		});
	}

	return;
}

async function isServiceInstalled(coords: MavenCoords): Promise<boolean> {
	const jarPath = await getServicePathFromCoords(coords);
	return fs.existsSync(jarPath);
}

// Installs a jar using maven coordinates
async function installJar(serviceName: string, coords: MavenCoords, progress?: Progress<{ message?: string; increment?: number; }>): Promise<void> {
	const jarPath = await getServicePathFromCoords(coords);
	const jarHome = getJarHome();

	if (progress) {
		progress.report({ message: `Starting download`});
	}
	ensureExists(jarHome);
	const searchUrl = getSearchUrl(coords);
	const setupInfo = await setupDownload(serviceName, searchUrl);

	await downloadFile(setupInfo.serverDownloadUrl, jarPath, serviceName, setupInfo.serverDownloadSize, progress);

	if (progress) {
		progress.report({ message: `Download complete`});
	}

	const doesExist = fs.existsSync(jarPath);
	if (!doesExist) {
		throw Error(`Failed to install ${serviceName}`);
	}
}

async function downloadFile(url: string, path: string, serviceName: string, totalBytes?: number, progress?: Progress<{ message?: string; increment?: number; }>) {
	const res = await fetch(url);
	const fileStream = fs.createWriteStream(path);
	let bytesSoFar = 0;
	await new Promise((resolve, reject) => {
		res.body.pipe(fileStream);
		res.body.on("data", (chunk) => { if (progress) {
			bytesSoFar += chunk.length;
			progress.report({
				message: `Downloading`,
				increment: (bytesSoFar / totalBytes)
			});
		} });
		res.body.on("error", reject);
		fileStream.on("finish", resolve);
	});
}

async function setupDownload(serviceName: string, url: string) {
	let response = await fetch(url, { redirect: "manual" });
	const redirectUrl = response.headers.get("location");

	if (!redirectUrl || redirectUrl === '') {
		throw new Error(`Unable to locate and/or download files for ${serviceName}`);
	}

	response = await fetch(redirectUrl, { method: "head" });
	const length = response.headers.get("content-length");

	return { serverDownloadUrl: redirectUrl, serverDownloadSize: length ? parseInt(length) : null  };
}