// Both the browser parser and native recovery validator use this exact schema.
export function createCatalogV8Schema(catalogV7Schema) {
  const schema = structuredClone(catalogV7Schema);
  schema.$id = "https://tavernary.org/schemas/catalog-v8.json";
  schema.properties.schemaVersion.const = 8;
  const tavernKeeper = schema.$defs.project.properties.tavernKeeper.anyOf[1];
  for (const report of [
    tavernKeeper.properties.report.anyOf[0],
    tavernKeeper.properties.history.items,
  ]) {
    report.required.push("javascriptAnalysisStatus");
    report.properties.javascriptAnalysisStatus = {
      enum: ["complete", "incomplete", "legacy"],
    };
  }
  return schema;
}
