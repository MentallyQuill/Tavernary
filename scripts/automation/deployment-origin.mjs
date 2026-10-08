// Keep origin policy independent of CLI entrypoints and browser loading.
export function deploymentSiteOrigin({
  mode = "production",
  fixtureOrigin,
} = {}) {
  if (mode === "production") return "https://tavernary.org";
  if (
    mode !== "fixture" ||
    !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/u.test(fixtureOrigin ?? "") ||
    Number(new URL(fixtureOrigin).port) > 65535
  )
    throw new Error("Local deployment fixture origin is invalid.");
  return fixtureOrigin;
}
