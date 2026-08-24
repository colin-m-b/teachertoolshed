/* ══════════════════════════════════════════════════════════
   Teacher Toolshed — minimal ZIP writer

   STORE method only (no compression). Both callers package data that
   is either tiny (a single essay's XML) or already compressed (PDF
   page streams), so deflate would buy a couple of percent in exchange
   for an entire class of correctness risk. Not worth it.

   Entries are { name, text } or { name, bytes }. Returns a Uint8Array.

   Note: no ZIP64. A single archive past 4GB would need it, which no
   realistic class set reaches.

   Used by: purewrite-export.js (.docx packaging)
            stack-splitter.html (per-student PDF bundles)
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(d) {
    const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() >> 1) & 0x1F);
    const date = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F);
    return { time, date };
  }

  function makeZip(files) {
    const enc = new TextEncoder();
    const { time, date } = dosDateTime(new Date());
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach(f => {
      const nameBytes = enc.encode(f.name);
      const dataBytes = f.bytes ? f.bytes : enc.encode(f.text);
      const crc = crc32(dataBytes);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);        // version needed
      local.setUint16(6, 0, true);         // flags
      local.setUint16(8, 0, true);         // method: store
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, dataBytes.length, true); // compressed size
      local.setUint32(22, dataBytes.length, true); // uncompressed size
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);        // extra field length
      localParts.push(new Uint8Array(local.buffer), nameBytes, dataBytes);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);      // version made by
      central.setUint16(6, 20, true);      // version needed
      central.setUint16(8, 0, true);
      central.setUint16(10, 0, true);
      central.setUint16(12, time, true);
      central.setUint16(14, date, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, dataBytes.length, true);
      central.setUint32(24, dataBytes.length, true);
      central.setUint16(28, nameBytes.length, true);
      central.setUint16(30, 0, true);      // extra length
      central.setUint16(32, 0, true);      // comment length
      central.setUint16(34, 0, true);      // disk number
      central.setUint16(36, 0, true);      // internal attrs
      central.setUint32(38, 0, true);      // external attrs
      central.setUint32(42, offset, true); // offset of local header
      centralParts.push(new Uint8Array(central.buffer), nameBytes);

      offset += 30 + nameBytes.length + dataBytes.length;
    });

    const centralStart = offset;
    let centralSize = 0;
    centralParts.forEach(p => centralSize += p.length);

    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(4, 0, true);
    eocd.setUint16(6, 0, true);
    eocd.setUint16(8, files.length, true);
    eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, centralSize, true);
    eocd.setUint32(16, centralStart, true);
    eocd.setUint16(20, 0, true);

    const all = [...localParts, ...centralParts, new Uint8Array(eocd.buffer)];
    const total = all.reduce((sum, p) => sum + p.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    all.forEach(p => { out.set(p, pos); pos += p.length; });
    return out;
  }

  window.ToolshedZip = { makeZip: makeZip, crc32: crc32 };
})();
