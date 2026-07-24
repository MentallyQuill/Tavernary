const SYSTEM_PROMPT = `Return only a JSON object with summary, metadata_status, primary_function, and capabilities. Write one factual sentence of 12-24 words and at most 140 characters, with no markdown or unsupported claims. Set metadata_status to curated. Use exactly one allowed primary-function ID and zero or more allowed capability IDs. If no usable source text is provided, use the exact summary "No README file found." with primary_function "uncategorized" and an empty capabilities array.`;

function idOf(entry) {
  return typeof entry === "string" ? entry : entry.id;
}

export function createEnrichmentProvider({
  apiUrl,
  apiKey,
  model,
  fetchImpl = fetch,
}) {
  return {
    async generate(input) {
      const response = await fetchImpl(apiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(input) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "tavernary_enrichment",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: [
                  "summary",
                  "metadata_status",
                  "primary_function",
                  "capabilities",
                ],
                properties: {
                  summary: { type: "string" },
                  metadata_status: { type: "string", enum: ["curated"] },
                  primary_function: {
                    type: "string",
                    enum: input.allowedPrimaryFunctions
                      .map(idOf)
                      .filter((id, index, ids) => ids.indexOf(id) === index),
                  },
                  capabilities: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: input.allowedCapabilities.map(idOf),
                    },
                  },
                },
              },
            },
          },
        }),
      });
      if (!response.ok)
        throw new Error(`Enrichment provider failed: ${response.status}`);
      const payload = await response.json();
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error("Enrichment provider returned no structured content");
      }
      return JSON.parse(content);
    },
  };
}
