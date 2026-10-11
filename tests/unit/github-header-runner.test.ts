import { expect, test } from "vitest";
import {
  parseGithubCliResponse,
  createGithubCliFailure,
} from "../../scripts/submissions/kit-submission-reconciliation.mjs";
test("header-aware gh captures only retry metadata without changing parsed JSON output", () => {
  const stdout = Buffer.from(
    'HTTP/2.0 200 OK\r\nX-RateLimit-Reset: 1791635400\r\n\r\n{"ok":true}\n',
  );
  expect(parseGithubCliResponse(stdout).body.toString("utf8")).toBe(
    '{"ok":true}\n',
  );
  const failure = createGithubCliFailure(
    ["api", "repos/MentallyQuill/Tavernary"],
    1,
    "secondary rate limit (HTTP 403)",
    Buffer.from(
      "HTTP/2.0 403 Forbidden\r\nRetry-After: 420\r\nX-RateLimit-Reset: 1791635400\r\nAuthorization: secret\r\n\r\n{}",
    ),
  );
  expect(failure).toMatchObject({
    headers: { "retry-after": "420", "x-ratelimit-reset": "1791635400" },
  });
  expect(JSON.stringify(failure)).not.toContain("secret");
});

test("paginated slurped headers preserve a valid array of pages", () => {
  const response = Buffer.from(
    '[HTTP/2.0 200 OK\r\nX-Ratelimit-Reset: 1791635400\r\n\r\n{"jobs":[{"id":1}]},HTTP/2.0 200 OK\r\nRetry-After: 420\r\n\r\n{"jobs":[{"id":2}]}]',
  );
  const parsed = parseGithubCliResponse(response);
  expect(JSON.parse(parsed.body.toString("utf8"))).toEqual([
    { jobs: [{ id: 1 }] },
    { jobs: [{ id: 2 }] },
  ]);
  expect(parsed.headers).toEqual({
    "retry-after": "420",
    "x-ratelimit-reset": "1791635400",
  });
});
