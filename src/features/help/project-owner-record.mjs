import { createHash } from "node:crypto";

function fingerprintRecord(record) {
  return createHash("sha256")
    .update(JSON.stringify(record), "utf8")
    .digest("hex");
}

export function fingerprintProjectRecord(record) {
  return fingerprintRecord(record);
}

export function fingerprintSourceRecord(record) {
  return fingerprintRecord(record);
}
