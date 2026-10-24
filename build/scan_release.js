// Scan release artifacts for sensitive-string leakage (read-only audit)
// Usage: node scan_release.js <file-or-dir> [<file-or-dir> ...]
const fs = require('fs');
const path = require('path');

const PATTERNS = [
  // internal infrastructure (should NEVER appear)
  'sw2-primary1', 'xiyoucloud', 'sw1-dynamic', 'biomamba@', 'zhuanye',
  '59416', '14856', '34039', '34180', '127.0.0.1:34',
  '/data3', 'ycfs-releases', 'ssh_tunnel', 'ProxyCommand',
  // build-machine paths (should not leak into artifacts)
  'Administrator', '.zcode', 'ycfs-tools', 'workspace\\default',
  // credential material
  'BEGIN PRIVATE KEY', 'BEGIN RSA', 'api_key', 'apikey', 'api-key',
  'sk-', 'Bearer ', 'authorization:',
  'ghp_', 'github_pat_', 'gho_', 'ghu_', 'ghs_', 'ghr_',
  // secrets file names
  'auth.json', 'ed25519'
];

const targets = process.argv.slice(2);
let totalHits = 0;

function scanBuffer(buf, label) {
  const hits = [];
  const text = buf.toString('latin1');
  for (const p of PATTERNS) {
    let idx = text.indexOf(p);
    if (idx >= 0) {
      let count = 0;
      const sample = [];
      while (idx >= 0 && count < 3) {
        sample.push(text.substring(Math.max(0, idx - 30), idx + p.length + 30).replace(/[\r\n\x00-\x1f]+/g, ' '));
        count++;
        idx = text.indexOf(p, idx + p.length);
      }
      hits.push({ pattern: p, count, sample });
    }
  }
  if (hits.length) {
    totalHits += hits.length;
    console.log('!! ' + label);
    for (const h of hits) {
      console.log('   [' + h.pattern + '] x' + (h.count > 3 ? '3+' : h.count));
      for (const s of h.sample) console.log('      ...' + s + '...');
    }
  } else {
    console.log('OK ' + label + '  (' + buf.length + ' bytes, no sensitive patterns)');
  }
}

for (const t of targets) {
  const st = fs.statSync(t);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(t, { recursive: true })) {
      const fp = path.join(t, f);
      if (fs.statSync(fp).isFile() && fs.statSync(fp).size < 300 * 1024 * 1024) {
        scanBuffer(fs.readFileSync(fp), fp);
      }
    }
  } else {
    scanBuffer(fs.readFileSync(t), t);
  }
}
console.log('---- total flagged files/patterns: ' + totalHits);
