// Minimal CBOR encoder — the inverse of cborDecode() in src/main.js, covering
// exactly what ord writes for --json-metadata: text keys, nested maps, integers
// and floats. It exists so the boot test can hand the engine bytes shaped like a
// real inscription's metadata instead of a convenient JS object.
//
// Numbers follow the JSON path: integers encode as CBOR integers, everything
// else as float64. That is what matters for fidelity — a dataset value that
// survived here would survive on chain.

export function cborEncode(value) {
  const out = [];
  const head = (mt, n) => {
    if (n < 24) out.push((mt << 5) | n);
    else if (n < 0x100) out.push((mt << 5) | 24, n);
    else if (n < 0x10000) out.push((mt << 5) | 25, n >> 8, n & 255);
    else out.push((mt << 5) | 26, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  };
  const enc = (x) => {
    if (typeof x === 'number') {
      if (Number.isInteger(x) && x >= 0) return head(0, x);
      if (Number.isInteger(x)) return head(1, -1 - x);
      out.push(0xfb);
      const b = new Uint8Array(8);
      new DataView(b.buffer).setFloat64(0, x, false);
      out.push(...b);
      return;
    }
    if (typeof x === 'string') {
      const u = [...Buffer.from(x, 'utf8')];
      head(3, u.length); out.push(...u); return;
    }
    if (Array.isArray(x)) { head(4, x.length); x.forEach(enc); return; }
    if (x && typeof x === 'object') {
      const keys = Object.keys(x);
      head(5, keys.length);
      for (const k of keys) { enc(k); enc(x[k]); }
      return;
    }
    throw new Error(`cborEncode: unsupported value ${String(x)}`);
  };
  enc(value);
  return Buffer.from(out).toString('hex');
}
