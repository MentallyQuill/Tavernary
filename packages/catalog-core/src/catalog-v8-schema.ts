import { catalogV7Schema } from "./catalog-v7-schema";

interface MutableReportSchema {
  required: string[];
  properties: Record<string, unknown>;
}

interface MutableCatalogSchema {
  $id: string;
  properties: { schemaVersion: { const: number } };
  $defs: {
    project: {
      properties: {
        tavernKeeper: {
          anyOf: [
            unknown,
            {
              properties: {
                report: { anyOf: [MutableReportSchema, unknown] };
                history: { items: MutableReportSchema };
              };
            },
          ];
        };
      };
    };
  };
}

const schema = structuredClone(catalogV7Schema) as unknown as MutableCatalogSchema;
schema.$id = "https://tavernary.org/schemas/catalog-v8.json";
schema.properties.schemaVersion.const = 8;

const tavernKeeper = schema.$defs.project.properties.tavernKeeper.anyOf[1];
const reportSchemas = [
  tavernKeeper.properties.report.anyOf[0],
  tavernKeeper.properties.history.items,
];
for (const report of reportSchemas) {
  report.required.push("javascriptAnalysisStatus");
  report.properties.javascriptAnalysisStatus = {
    enum: ["complete", "incomplete", "legacy"],
  };
}

export const catalogV8Schema = schema;
