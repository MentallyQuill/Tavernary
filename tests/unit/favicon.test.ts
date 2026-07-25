import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const sha256 = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

describe("site favicon", () => {
  test("declares the favicon assets in the root metadata", async () => {
    const layout = await readFile("src/app/layout.tsx", "utf8");

    expect(layout).toContain('"./favicon.ico"');
    expect(layout).toContain('"./tavernary-favicon-32.png"');
    expect(layout).toContain('"./tavernary-favicon-16.png"');
    expect(layout).toContain('"./tavernary-favicon-192.png"');
    expect(layout).toContain('"./tavernary-favicon-512.png"');
    expect(layout).toContain('"./apple-touch-icon.png"');
  });

  test("uses the trihex-derived favicon family", async () => {
    const expectedHashes = {
      "public/tavernary-trihex.png":
        "6f4b52faeae340736bb1d2956a44bc00903c624ca3772aed24923e0822f2ddee",
      "public/favicon.ico":
        "2166fd1c14c1953cb8bb6b01d3e5acee2e75d20e5a288a15aa75db43110bf1e5",
      "public/tavernary-favicon-16.png":
        "c393a281b581ef419083c118e93f65de76ee8a8131dba71c5fa04fbaf4a0fc2e",
      "public/tavernary-favicon-32.png":
        "c033fc868b66ae497c509fd027518ae771901e8b945bdc089afd6a2fc9087e78",
      "public/tavernary-favicon-192.png":
        "cd2de7e919666820f6f1f4022d11786ddb1e8764ce76e8d72d8344151013213a",
      "public/tavernary-favicon-512.png":
        "de5d0658c045fc5cd66eeb5b68b21f08c2776e76dd55852d7106986fd442af20",
      "public/apple-touch-icon.png":
        "020e659e1a5e761df26462263f65d0ba750a5649942e47821115154d494758b2",
    };

    await expect(
      Promise.all(
        Object.entries(expectedHashes).map(async ([path, hash]) => [
          path,
          await sha256(path),
          hash,
        ]),
      ),
    ).resolves.toEqual(
      Object.entries(expectedHashes).map(([path, hash]) => [path, hash, hash]),
    );
  });
});
