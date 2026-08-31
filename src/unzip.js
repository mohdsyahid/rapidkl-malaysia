#!/usr/bin/env node
/**
 * Minimal, dependency-free ZIP reader (enough for GTFS static feeds:
 * flat archives of small text files, stored or deflated, no encryption,
 * no zip64). Good enough to avoid shelling out to `unzip` and to avoid
 * a third-party dependency just for this.
 */

const zlib = require("zlib");

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(buf) {
  // EOCD is near the end of the file; scan backwards for its signature.
  const maxScan = Math.min(buf.length, 65557); // 22 (EOCD) + 65535 (max comment)
  for (let i = buf.length - 22; i >= buf.length - maxScan; i--) {
    if (i < 0) break;
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  throw new Error("Not a valid ZIP file (EOCD not found)");
}

/** Returns a Map of fileName -> Buffer (decompressed contents). */
function unzip(buf) {
  const eocdOffset = findEndOfCentralDirectory(buf);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);
  const entryCount = buf.readUInt16LE(eocdOffset + 10);

  const files = new Map();
  let offset = centralDirOffset;

  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`Bad central directory entry at offset ${offset}`);
    }
    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const fileNameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const fileName = buf.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    if (!fileName.endsWith("/")) {
      files.set(fileName.replace(/^.*\//, ""), () => readLocalEntry(buf, localHeaderOffset, compressionMethod, compressedSize));
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  const result = new Map();
  for (const [name, reader] of files) result.set(name, reader());
  return result;
}

function readLocalEntry(buf, localHeaderOffset, compressionMethod, compressedSize) {
  if (buf.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error(`Bad local file header at offset ${localHeaderOffset}`);
  }
  const fileNameLength = buf.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buf.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressedData = buf.subarray(dataStart, dataStart + compressedSize);

  if (compressionMethod === 0) return compressedData; // stored
  if (compressionMethod === 8) return zlib.inflateRawSync(compressedData); // deflate
  throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
}

module.exports = { unzip };
