import { createHash } from "node:crypto";

export function fingerprintProjectRecord(record) {
  return createHash("sha256")
    .update(JSON.stringify(record), "utf8")
    .digest("hex");
}
