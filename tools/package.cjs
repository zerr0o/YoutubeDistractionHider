/* Dependency-free ZIP packaging of extension runtime files only. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {deflateRawSync} = require('node:zlib');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = ['manifest.json', 'background.js', 'INSTALL.md', 'PRIVACY.md'];
function walk(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), {withFileTypes: true})) {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) walk(name);
    else files.push(name);
  }
}
for (const directory of ['assets', 'content', 'options', 'popup', 'shared']) walk(directory);
const crcTable = Array.from({length: 256}, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
const local = [], central = [];
let offset = 0;
for (const file of files.sort()) {
  const name = Buffer.from(file);
  const data = fs.readFileSync(path.join(root, file));
  const compressed = deflateRawSync(data, {level: 9});
  const crc = crc32(data);
  // A fixed ZIP date keeps packaging reproducible. No personal file metadata.
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  local.push(header, name, compressed);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50, 0);
  directory.writeUInt16LE(20, 4);
  header.copy(directory, 6, 4, 28);
  directory.writeUInt32LE(offset, 42);
  central.push(directory, name);
  offset += header.length + name.length + compressed.length;
}
const centralDirectory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...local, centralDirectory, end]);
fs.mkdirSync(path.join(root, 'dist'), {recursive: true});
const output = path.join(root, 'dist', `work-time-v${manifest.version}.zip`);
fs.writeFileSync(output, zip);
console.log(`${files.length} runtime/documentation files → ${output} (${zip.length} bytes)`);
