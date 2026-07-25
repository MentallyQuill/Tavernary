import { format } from "prettier";

export function formatJson(value) {
  return format(JSON.stringify(value), {
    parser: "json",
    filepath: "catalog.json",
  });
}
