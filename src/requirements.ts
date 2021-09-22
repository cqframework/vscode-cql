'use strict';

import { Uri, env, ExtensionContext } from 'vscode';
import * as path from 'path';
import * as fse from 'fs-extra';
import * as expandHomeDir from 'expand-home-dir';
import { Commands } from './commands';
import { findJavaHomes, getJavaVersion, JavaRuntime } from './findJavaRuntimes';
import { readManifest } from 'vscode-read-manifest';
import { ensureExists } from './utils';
import Downloader from 'nodejs-file-downloader';

const isWindows = process.platform.indexOf('win') === 0;
const JAVAC_FILENAME = 'javac' + (isWindows ? '.exe' : '');
const JAVA_FILENAME = 'java' + (isWindows ? '.exe' : '');
const REQUIRED_JDK_VERSION = 8;
export interface RequirementsData {
	java_requirements: JavaRequirements;
	cql_ls_requirements: CqlLsRequirements;
}

export interface JavaRequirements {
	java_home: string;
    java_version: number;
}

export interface CqlLsRequirements {
	cql_ls_jar: string;
	cql_ls_version: string;
}

/**
 * Resolves the requirements needed to run the extension.
 * Returns a promise that will resolve to a RequirementsData if
 * all requirements are resolved, it will reject with ErrorData if
 * if any of the requirements fails to resolve.
 *
 */
export async function resolveJavaRequirements(context: ExtensionContext): Promise<JavaRequirements> {
    return new Promise(async (resolve, reject) => {
        let source: string;
        let javaVersion: number = 0;

		let javaHome: string;
		// java.home not specified, search valid JDKs from env.JAVA_HOME, env.PATH, Registry(Window), Common directories
		const javaRuntimes = await findJavaHomes();
		const validJdks = javaRuntimes.filter(r => r.version >= REQUIRED_JDK_VERSION);
		if (validJdks.length > 0) {
			sortJdksBySource(validJdks);
			javaHome = validJdks[0].home;
			javaVersion = validJdks[0].version;
		}
        if (javaHome) {
            // java.home explictly specified
            source = `java.home variable defined in ${env.appName} settings`;
            javaHome = expandHomeDir(javaHome);
            if (!await fse.pathExists(javaHome)) {
                rejectWithMessage(reject, `The ${source} points to a missing or inaccessible folder (${javaHome})`);
            } else if (!await fse.pathExists(path.resolve(javaHome, 'bin', JAVAC_FILENAME))) {
                let msg: string;
                if (await fse.pathExists(path.resolve(javaHome, JAVAC_FILENAME))) {
                    msg = `'bin' should be removed from the ${source} (${javaHome})`;
                } else {
                    msg = `The ${source} (${javaHome}) does not point to a JDK.`;
                }
                rejectWithMessage(reject, msg);
            }
            javaVersion = await getJavaVersion(javaHome);
        }

        if (javaVersion < REQUIRED_JDK_VERSION) {
            openJDKDownload(reject, `Java ${REQUIRED_JDK_VERSION} or more recent is required to run the Java extension. Please download and install a recent JDK.`);
        }

        resolve({ java_home: javaHome, java_version: javaVersion });
    });
}

export async function resolveCqlRequirements(context: ExtensionContext): Promise<CqlLsRequirements> {
    return new Promise(async (resolve, reject) => {
		const cqlLsVersion = await getCqlLsVersion();
		const fileDownloader = new Downloader({
			url: 'http://212.183.159.230/200MB.zip',
			directory: "./downloads"
		  });

		await fileDownloader.download();
        resolve({ cql_ls_jar: "", cql_ls_version: cqlLsVersion });
    });
}

export async function resolveRequirements(context: ExtensionContext): Promise<RequirementsData> {
	const javaRequirements = await resolveJavaRequirements(context);
	const cqlRequirements = await resolveCqlRequirements(context);

	return { java_requirements: javaRequirements, cql_ls_requirements: cqlRequirements};
}

async function getCqlLsVersion(): Promise<string> {
	const manifest = await readManifest();
	return (manifest as any).javaDependencies.cql_language_server;
}

function sortJdksBySource(jdks: JavaRuntime[]) {
    const rankedJdks = jdks as Array<JavaRuntime & { rank: number }>;
    const sources = ["env.JDK_HOME", "env.JAVA_HOME", "env.PATH"];
    for (const [index, source] of sources.entries()) {
        for (const jdk of rankedJdks) {
            if (jdk.rank === undefined && jdk.sources.includes(source)) {
                jdk.rank = index;
            }
        }
    }
    rankedJdks.filter(jdk => jdk.rank === undefined).forEach(jdk => jdk.rank = sources.length);
    rankedJdks.sort((a, b) => a.rank - b.rank);
}

function openJDKDownload(reject, cause) {
    const jdkUrl = getJdkUrl();
    reject({
        message: cause,
        label: 'Get the Java Development Kit',
        command: Commands.OPEN_BROWSER,
        commandParam: Uri.parse(jdkUrl),
    });
}

function getJdkUrl() {
    const jdkUrl = 'https://adoptopenjdk.net/';
    return jdkUrl;
}

function rejectWithMessage(reject, cause: string) {
	reject({
		message: cause,
	});
}