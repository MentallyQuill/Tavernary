import { createHash } from "node:crypto";
import { crc32, inflateRawSync } from "node:zlib";

function fail() {
  throw new Error("Prepared artifact integrity or format is invalid.");
}
export function decodePreparedArtifact({
  archive,
  digest,
  filename = "result.json",
}) {
  if (!["result.json", "diagnostic.json"].includes(filename)) fail();
  const maximumBytes = filename === "diagnostic.json" ? 16_384 : 33_554_432;
  if (
    !(archive instanceof Uint8Array) ||
    archive.byteLength < 22 ||
    archive.byteLength > maximumBytes ||
    !/^sha256:[a-f0-9]{64}$/u.test(digest ?? "") ||
    `sha256:${createHash("sha256").update(archive).digest("hex")}` !== digest
  )
    fail();
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  const uint16 = (offset) => view.getUint16(offset, true);
  const uint32 = (offset) => view.getUint32(offset, true);
  let end = archive.byteLength - 22;
  while (
    end >= Math.max(0, archive.byteLength - 65_557) &&
    uint32(end) !== 0x06054b50
  )
    end--;
  if (
    end < 0 ||
    end < archive.byteLength - 65_557 ||
    end + 22 + uint16(end + 20) !== archive.byteLength ||
    uint16(end + 4) !== 0 ||
    uint16(end + 6) !== 0 ||
    uint16(end + 8) !== 1 ||
    uint16(end + 10) !== 1
  )
    fail();
  const central = uint32(end + 16);
  const centralBytes = uint32(end + 12);
  if (
    central < 30 ||
    centralBytes < 46 ||
    central + centralBytes !== end ||
    uint32(central) !== 0x02014b50
  )
    fail();
  const flags = uint16(central + 8);
  const compression = uint16(central + 10);
  const size = uint32(central + 24);
  const compressedSize = uint32(central + 20);
  const nameBytes = uint16(central + 28);
  const local = uint32(central + 42);
  const attributes = uint32(central + 38);
  const fileType = (attributes >>> 28) & 15;
  if (
    (flags & 1) !== 0 ||
    ![0, 8].includes(compression) ||
    size < 1 ||
    size > maximumBytes ||
    compressedSize < 1 ||
    local !== 0 ||
    (fileType !== 0 && fileType !== 8) ||
    (attributes & 16) !== 0 ||
    central + 46 + nameBytes + uint16(central + 30) + uint16(central + 32) !==
      end
  )
    fail();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  if (
    decoder.decode(archive.subarray(central + 46, central + 46 + nameBytes)) !==
      filename ||
    uint32(local) !== 0x04034b50 ||
    uint16(local + 6) !== flags ||
    uint16(local + 8) !== compression
  )
    fail();
  const localNameBytes = uint16(local + 26);
  const dataStart = local + 30 + localNameBytes + uint16(local + 28);
  if (
    decoder.decode(
      archive.subarray(local + 30, local + 30 + localNameBytes),
    ) !== filename ||
    dataStart > central ||
    dataStart + compressedSize > central
  )
    fail();
  const encoded = archive.subarray(dataStart, dataStart + compressedSize);
  const content =
    compression === 0
      ? encoded
      : inflateRawSync(encoded, { maxOutputLength: size });
  if (content.byteLength !== size || crc32(content) !== uint32(central + 16))
    fail();
  const result = JSON.parse(decoder.decode(content));
  if (result === null || typeof result !== "object" || Array.isArray(result))
    fail();
  return result;
}
