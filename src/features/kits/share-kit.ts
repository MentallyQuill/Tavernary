export function kitShareUrl(kitId: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("mode", "kits");
  url.searchParams.set("kit", kitId);
  return url.toString();
}

export async function copyKitLink(
  kitId: string,
): Promise<"copied" | "fallback"> {
  try {
    await navigator.clipboard.writeText(kitShareUrl(kitId));
    return "copied";
  } catch {
    return "fallback";
  }
}
