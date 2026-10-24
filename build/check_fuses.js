// Read ALL Electron fuse wire occurrences in a binary (read-only verification)
// Electron fuse states are ASCII digits: '0'=REMOVED '1'=DISABLED '2'=ENABLED
// Usage: node check_fuses.js <path-to-binary>
const fs = require('fs');
const exe = process.argv[2];
const buf = fs.readFileSync(exe);
const sent = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'ascii');
const names = [
  'RunAsNode', 'CookieEncryption', 'NodeOptions', 'NodeCliInspect',
  'EmbeddedAsarIntegrity', 'OnlyLoadAppFromAsar', 'LoadBrowserV8Snapshot',
  'GrantFileProtocolExtraPriv', 'WasmTrapHandlers'
];
let idx = 0;
let count = 0;
while ((idx = buf.indexOf(sent, idx)) >= 0) {
  const head = buf.subarray(idx + sent.length, idx + sent.length + 2 + names.length);
  count++;
  console.log(`--- occurrence ${count} @ offset ${idx} ---`);
  if (head[0] !== 1) { console.log(`  unexpected fuse_version=${head[0]}, skip`); idx += sent.length; continue; }
  console.log(`  fuse_version=${head[0]} wire_length=${head[1]}`);
  for (let i = 0; i < Math.min(head[1], names.length); i++) {
    const b = head[2 + i];
    const state = b === 0x30 ? 'REMOVED' : b === 0x31 ? 'DISABLED' : b === 0x32 ? 'ENABLED' : 'unknown(' + b + ')';
    console.log(`  fuse[${i}] ${names[i]} = ${state}`);
  }
  idx += sent.length;
}
if (count === 0) console.log('sentinel NOT FOUND');
