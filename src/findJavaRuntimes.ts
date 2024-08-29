// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as cp from 'child_process';
import expandTilde from 'expand-tilde';
import * as fse from 'fs-extra';
import _ from 'lodash';
import * as os from 'os';
import * as path from 'path';
import WinReg from 'winreg';

// Platform detection
const isWindows: boolean = process.platform.indexOf('win') === 0;
const isMac: boolean = process.platform.indexOf('darwin') === 0;
const isLinux: boolean = process.platform.indexOf('linux') === 0;

const JAVAC_FILENAME = 'javac' + (isWindows ? '.exe' : '');
const JAVA_FILENAME = 'java' + (isWindows ? '.exe' : '');

export interface JavaRuntime {
  home: string;
  version: number;
  sources: string[];
}

/**
 * Return metadata for all installed JDKs.
 * This function searches for Java installations in common locations,
 * environment variables, and the Windows Registry (if applicable).
 * @returns {Promise<JavaRuntime[]>} A promise that resolves with an array of JavaRuntime objects.
 */
export async function findJavaHomes(): Promise<JavaRuntime[]> {
  const ret: JavaRuntime[] = [];
  const jdkMap = new Map<string, string[]>();

  updateJDKs(jdkMap, await fromEnv('JDK_HOME'), 'env.JDK_HOME');
  updateJDKs(jdkMap, await fromEnv('JAVA_HOME'), 'env.JAVA_HOME');
  updateJDKs(jdkMap, await fromPath(), 'env.PATH');
  updateJDKs(jdkMap, await fromWindowsRegistry(), 'WindowsRegistry');
  updateJDKs(jdkMap, await fromCommonPlaces(), 'DefaultLocation');

  for (const elem of jdkMap) {
    const home = elem[0];
    const sources = elem[1];
    const version = await getJavaVersion(home);
    if (version) {
      ret.push({
        home,
        sources,
        version,
      });
    } else {
      console.warn(`Unknown version of JDK ${home}`);
    }
  }
  return ret;
}

/**
 * Updates the JDK map with new entries.
 * @param {Map<string, string[]>} map - The map of JDKs.
 * @param {string[]} newJdks - The new JDK paths to add.
 * @param {string} source - The source from which these JDKs were found.
 */
function updateJDKs(map: Map<string, string[]>, newJdks: string[], source: string) {
  for (const newJdk of newJdks) {
    const sources = map.get(newJdk);
    if (sources !== undefined) {
      map.set(newJdk, [...sources, source]);
    } else {
      map.set(newJdk, [source]);
    }
  }
}

/**
 * Retrieves Java home paths from the specified environment variable.
 * @param {string} name - The environment variable name.
 * @returns {Promise<string[]>} A promise that resolves with an array of Java home paths.
 */
async function fromEnv(name: string): Promise<string[]> {
  const ret: string[] = [];
  if (process.env[name]) {
    const javaHome = await verifyJavaHome(process.env[name]!, JAVAC_FILENAME);
    if (javaHome) {
      ret.push(javaHome);
    }
  }
  return ret;
}

/**
 * Retrieves Java home paths from the system PATH.
 * @returns {Promise<string[]>} A promise that resolves with an array of Java home paths.
 */
async function fromPath(): Promise<string[]> {
  const ret: string[] = [];

  const paths = process.env.PATH ? process.env.PATH.split(path.delimiter).filter(Boolean) : [];
  for (const p of paths) {
    const proposed = path.dirname(p); // remove "bin"
    const javaHome = await verifyJavaHome(proposed, JAVAC_FILENAME);
    if (javaHome) {
      ret.push(javaHome);
    }

    if (isMac) {
      let dir = expandTilde(p);
      dir = await findLinkedFile(dir);
      // on mac, java install has a utility script called java_home
      const macUtility = path.join(dir, 'java_home');
      if (await fse.pathExists(macUtility)) {
        let buffer;
        try {
          buffer = cp.execSync(macUtility, { cwd: dir });
          const absoluteJavaHome = '' + buffer.toString().replace(/\n$/, '');
          const verified = await verifyJavaHome(absoluteJavaHome, JAVAC_FILENAME);
          if (verified) {
            ret.push(absoluteJavaHome);
          }
        } catch (error) {
          // do nothing
        }
      }
    }
  }

  if (isMac) {
    // Exclude /usr, because in macOS Big Sur /usr/bin/javac is no longer symlink.
    // See https://github.com/redhat-developer/vscode-java/issues/1700#issuecomment-729478810
    return ret.filter(item => item !== '/usr');
  } else {
    return ret;
  }
}

/**
 * Retrieves Java home paths from the Windows Registry.
 * @returns {Promise<string[]>} A promise that resolves with an array of Java home paths.
 */
async function fromWindowsRegistry(): Promise<string[]> {
  if (!isWindows) {
    return [];
  }

  const keyPaths: string[] = [
    '\\SOFTWARE\\JavaSoft\\JDK',
    '\\SOFTWARE\\JavaSoft\\Java Development Kit',
  ];

  const promisifyFindPossibleRegKey = (
    keyPath: string,
    regArch: string,
  ): Promise<Winreg.Registry[]> => {
    return new Promise<Winreg.Registry[]>(resolve => {
      const winreg: Winreg.Registry = new WinReg({
        hive: WinReg.HKLM,
        key: keyPath,
        arch: regArch,
      });
      winreg.keys((err, result) => {
        if (err) {
          return resolve([]);
        }
        resolve(result);
      });
    });
  };

  const promisifyFindJavaHomeInRegKey = (reg: Winreg.Registry): Promise<string | null> => {
    return new Promise<string | null>(resolve => {
      reg.get('JavaHome', (err, home) => {
        if (err || !home) {
          return resolve(null);
        }
        resolve(home.value);
      });
    });
  };

  const promises = [];
  for (const arch of ['x64', 'x86']) {
    for (const keyPath of keyPaths) {
      promises.push(promisifyFindPossibleRegKey(keyPath, arch));
    }
  }

  const keysFoundSegments: Winreg.Registry[][] = await Promise.all(promises);
  const keysFound: Winreg.Registry[] = Array.prototype.concat.apply([], keysFoundSegments);
  if (!keysFound.length) {
    return [];
  }

  const sortedKeysFound = keysFound.sort((a, b) => {
    const aVer = parseFloat(a.key);
    const bVer = parseFloat(b.key);
    return bVer - aVer;
  });

  const javaHomes: string[] = [];
  for (const key of sortedKeysFound) {
    const candidate = await promisifyFindJavaHomeInRegKey(key);
    if (candidate) {
      javaHomes.push(candidate);
    }
  }

  const ret: string[] = [];
  for (const proposed of javaHomes) {
    const javaHome = await verifyJavaHome(proposed, JAVAC_FILENAME);
    if (javaHome) {
      ret.push(javaHome);
    }
  }
  return ret;
}

/**
 * Searches for Java installations in common locations on macOS, Windows, and Linux.
 * @returns {Promise<string[]>} A promise that resolves with an array of Java home paths.
 */
async function fromCommonPlaces(): Promise<string[]> {
  const ret: string[] = [];

  // common place for mac
  if (isMac) {
    const jvmStore = '/Library/Java/JavaVirtualMachines';
    const subfolder = 'Contents/Home';
    let jvms: string[] = [];
    try {
      jvms = await fse.readdir(jvmStore);
    } catch (error) {
      // ignore
    }
    for (const jvm of jvms) {
      const proposed = path.join(jvmStore, jvm, subfolder);
      const javaHome = await verifyJavaHome(proposed, JAVAC_FILENAME);
      if (javaHome) {
        ret.push(javaHome);
      }
    }
  }

  // common place for Windows
  if (isWindows) {
    const localAppDataFolder = process.env.LOCALAPPDATA
      ? process.env.LOCALAPPDATA
      : path.join(os.homedir(), 'AppData', 'Local');
    const possibleLocations: string[] = [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Java'), // Oracle JDK per machine
      process.env.ProgramW6432 && path.join(process.env.ProgramW6432, 'Java'), // Oracle JDK per machine
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'AdoptOpenJDK'), // AdoptOpenJDK per machine
      process.env.ProgramW6432 && path.join(process.env.ProgramW6432, 'AdoptOpenJDK'), // AdoptOpenJDK per machine
      path.join(localAppDataFolder, 'Programs', 'AdoptOpenJDK'), // AdoptOpenJDK per user
    ].filter(Boolean) as string[];
    const jvmStores = _.uniq(possibleLocations);
    for (const jvmStore of jvmStores) {
      let jvms: string[] = [];
      try {
        jvms = await fse.readdir(jvmStore);
      } catch (error) {
        // ignore
      }
      for (const jvm of jvms) {
        const proposed = path.join(jvmStore, jvm);
        const javaHome = await verifyJavaHome(proposed, JAVAC_FILENAME);
        if (javaHome) {
          ret.push(javaHome);
        }
      }
    }
  }

  // common place for Linux
  if (isLinux) {
    const jvmStore = '/usr/lib/jvm';
    let jvms: string[] = [];
    try {
      jvms = await fse.readdir(jvmStore);
    } catch (error) {
      // ignore
    }
    for (const jvm of jvms) {
      const proposed = path.join(jvmStore, jvm);
      const javaHome = await verifyJavaHome(proposed, JAVAC_FILENAME);
      if (javaHome) {
        ret.push(javaHome);
      }
    }
  }

  return ret;
}

/**
 * Verifies if the provided path is a valid Java home by checking for the existence of `javac`.
 * @param {string} raw - The raw path to check.
 * @param {string} javaFilename - The name of the Java executable (e.g., `javac`).
 * @returns {Promise<string | undefined>} A promise that resolves with the verified Java home path, or undefined if the path is invalid.
 */
export async function verifyJavaHome(
  raw: string,
  javaFilename: string,
): Promise<string | undefined> {
  const dir = expandTilde(raw);
  const targetJavaFile = await findLinkedFile(path.resolve(dir, 'bin', javaFilename));
  const proposed = path.dirname(path.dirname(targetJavaFile));
  if (
    (await fse.pathExists(proposed)) &&
    (await fse.pathExists(path.resolve(proposed, 'bin', javaFilename)))
  ) {
    return proposed;
  }
  return undefined;
}

/**
 * Iterates through symbolic links until the final file is found.
 * @param {string} file - The file path to check for symbolic links.
 * @returns {Promise<string>} A promise that resolves with the final file path.
 */
async function findLinkedFile(file: string): Promise<string> {
  if (!(await fse.pathExists(file)) || !(await fse.lstat(file)).isSymbolicLink()) {
    return file;
  }
  return findLinkedFile(await fse.readlink(file));
}

/**
 * Retrieves the Java version from the specified Java home.
 * @param {string} javaHome - The path to the Java home directory.
 * @returns {Promise<number | undefined>} A promise that resolves with the Java version number, or undefined if the version could not be determined.
 */
export async function getJavaVersion(javaHome: string): Promise<number | undefined> {
  let javaVersion = await checkVersionInReleaseFile(javaHome);
  if (!javaVersion) {
    javaVersion = await checkVersionByCLI(javaHome);
  }
  return javaVersion;
}

/**
 * Parses the major version number from a Java version string.
 * @param {string} version - The Java version string.
 * @returns {number} The major version number.
 */
export function parseMajorVersion(version: string): number {
  if (!version) {
    return 0;
  }
  // Ignore '1.' prefix for legacy Java versions
  if (version.startsWith('1.')) {
    version = version.substring(2);
  }
  // look into the interesting bits now
  const regexp = /\d+/g;
  const match = regexp.exec(version);
  let javaVersion = 0;
  if (match) {
    javaVersion = parseInt(match[0]);
  }
  return javaVersion;
}

/**
 * Retrieves the Java version by checking the `JAVA_HOME/release` file.
 * @param {string} javaHome - The path to the Java home directory.
 * @returns {Promise<number>} A promise that resolves with the Java version number.
 */
async function checkVersionInReleaseFile(javaHome: string): Promise<number> {
  if (!javaHome) {
    return 0;
  }
  const releaseFile = path.join(javaHome, 'release');
  if (!(await fse.pathExists(releaseFile))) {
    return 0;
  }

  try {
    const content = await fse.readFile(releaseFile);
    const regexp = /^JAVA_VERSION="(.*)"/gm;
    const match = regexp.exec(content.toString());
    if (!match) {
      return 0;
    }
    const majorVersion = parseMajorVersion(match[1]);
    return majorVersion;
  } catch (error) {
    // ignore
  }
  return 0;
}

/**
 * Retrieves the Java version by parsing the output of `JAVA_HOME/bin/java -version`.
 * @param {string} javaHome - The path to the Java home directory.
 * @returns {Promise<number>} A promise that resolves with the Java version number.
 */
async function checkVersionByCLI(javaHome: string): Promise<number> {
  if (!javaHome) {
    return 0;
  }
  return new Promise((resolve, _reject) => {
    const javaBin = path.join(javaHome, 'bin', JAVA_FILENAME);
    cp.execFile(javaBin, ['-version'], {}, (_stdout, stderr) => {
      const regexp = /version "(.*)"/g;
      const match = regexp.exec(stderr);
      if (!match) {
        return resolve(0);
      }
      const javaVersion = parseMajorVersion(match[1]);
      resolve(javaVersion);
    });
  });
}
