export const GENERATED_SUMMARY_MIN_LENGTH = 120;
export const GENERATED_SUMMARY_MAX_LENGTH = 220;

const lineBreak = /[\r\n\u2028\u2029]/u;
const markdownOrList = /```|`|[*_#[\]>]|^\s*(?:[-*+]\s|\d+[.)]\s)/mu;
const urlOrDomain =
  /(?:\b(?:https?:\/\/|www\.)|(?:^|\s)\/\/)\S+|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}\b/iu;

export function generatedSummaryTextErrors(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return ["summary value must be a non-empty string"];
  }
  const errors = [];
  if (value.length < GENERATED_SUMMARY_MIN_LENGTH) {
    errors.push(
      `summary value must be at least ${GENERATED_SUMMARY_MIN_LENGTH} characters`,
    );
  }
  if (value.length > GENERATED_SUMMARY_MAX_LENGTH) {
    errors.push(
      `summary value must be ${GENERATED_SUMMARY_MAX_LENGTH} characters or fewer`,
    );
  }
  if (lineBreak.test(value)) {
    errors.push("summary value must not contain line breaks");
  }
  if (markdownOrList.test(value)) {
    errors.push("summary value must not contain markdown or list syntax");
  }
  if (urlOrDomain.test(value)) {
    errors.push("summary value must not contain URLs or domain-style links");
  }
  return errors;
}
