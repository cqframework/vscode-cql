import * as fs from 'fs';
import * as path from 'path';

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

export function getTimestamp(file: fs.PathLike) {
  if (!fs.existsSync(file)) {
    return -1;
  }
  const stat = fs.statSync(file);
  return stat.mtimeMs;
}

export function ensureExists(folder: fs.PathLike) {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
  }
}
