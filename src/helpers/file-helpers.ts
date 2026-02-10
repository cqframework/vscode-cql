import * as fs from 'node:fs';
import * as path from 'node:path';

export function deleteDirectory(dir: fs.PathLike) {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach(child => {
      const entry = path.join(dir.toString(), child);
      if (fs.lstatSync(entry).isDirectory()) {
        deleteDirectory(entry);
      } else {
        fs.unlinkSync(entry);
      }
    });
    fs.rmdirSync(dir);
  }
}

export function ensureExists(folder: fs.PathLike) {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
  }
}

export function getFiles(dir: fs.PathLike, ext: string | undefined): Array<string> {
  if (!fs.existsSync(dir)) 
    throw new Error(`dir ${dir} does not exist`);

  if (!isDirectory(dir))
    throw new Error(`expecting a directory but ${dir} is not`)
    
  return fs.readdirSync(dir).filter(file => {
    return !ext || path.extname(file).toLowerCase() == ext.toLowerCase();
  });
}

export function getTimestamp(file: fs.PathLike) {
  if (!fs.existsSync(file)) {
    return -1;
  }
  const stat = fs.statSync(file);
  return stat.mtimeMs;
}

export function isDirectory(path: fs.PathLike): boolean {
  try {
    const stats = fs.lstatSync(path);
    return stats.isDirectory();
  } catch (e) {
    // lstatSync throws an error if the path doesn't exist
    return false;
  }
}
