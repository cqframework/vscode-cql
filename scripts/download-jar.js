//@ts-check
'use strict';

/**
 * Downloads the cql-language-server JAR from Maven Central into
 * dist/java-support/jars/ so it can be bundled into a local VSIX.
 *
 * Reads Maven coordinates from package.json javaDependencies.
 * Skips the download if the JAR is already present.
 *
 * Usage: node scripts/download-jar.js
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const coords = pkg['javaDependencies']['cql-language-server'];
const { groupId, artifactId, version } = coords;

const groupPath = groupId.replace(/\./g, '/');
const jarName = `${artifactId}-${version}.jar`;
const jarDir = path.join('dist', 'java-support', 'jars');
const jarPath = path.join(jarDir, jarName);
const url = `https://repo1.maven.org/maven2/${groupPath}/${artifactId}/${version}/${jarName}`;

if (fs.existsSync(jarPath)) {
  console.log(`JAR already present: ${jarPath}`);
  process.exit(0);
}

fs.mkdirSync(jarDir, { recursive: true });

console.log(`Downloading ${jarName}...`);
console.log(`  from: ${url}`);
console.log(`  to:   ${jarPath}`);

downloadFile(url, jarPath)
  .then(() => console.log('Done.'))
  .catch(err => {
    console.error(`Download failed: ${err.message}`);
    if (fs.existsSync(jarPath)) {
      fs.unlinkSync(jarPath);
    }
    process.exit(1);
  });

/**
 * Downloads a URL to a local file, following a single redirect if needed.
 * @param {string} url
 * @param {string} dest
 * @returns {Promise<void>}
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers['location'];
          if (!location) {
            return reject(new Error(`Redirect with no Location header from ${url}`));
          }
          return downloadFile(location, dest).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', err => {
          fs.unlink(dest, () => {});
          reject(err);
        });
      })
      .on('error', reject);
  });
}
