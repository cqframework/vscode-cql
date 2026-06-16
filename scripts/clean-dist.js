const fs = require('fs');
const path = require('path');

const distPath = path.resolve(__dirname, '..', 'dist');

if (!fs.existsSync(distPath)) {
  process.exit(0);
}

function deleteRecursively(targetPath, preservePaths) {
  if (!fs.existsSync(targetPath)) return;

  const stats = fs.lstatSync(targetPath);
  const relativePath = path.relative(distPath, targetPath);

  // Is this path exactly a preserved path or a child of one?
  const isPreserved = preservePaths.some(p => 
    relativePath === p || relativePath.startsWith(p + path.sep)
  );

  if (isPreserved) {
    // Keep it
    return;
  }

  // Is this path a parent of a preserved path?
  const isParentOfPreserved = preservePaths.some(p => 
    p.startsWith(relativePath + path.sep)
  );

  if (isParentOfPreserved) {
    if (stats.isDirectory()) {
      const files = fs.readdirSync(targetPath);
      for (const file of files) {
        deleteRecursively(path.join(targetPath, file), preservePaths);
      }
    }
  } else {
    // Not preserved and not a parent of something preserved, so delete it
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

// Preserve the java-support/jars directory
const preserve = [
  path.join('java-support', 'jars')
];

const topLevelFiles = fs.readdirSync(distPath);
for (const file of topLevelFiles) {
  deleteRecursively(path.join(distPath, file), preserve);
}
