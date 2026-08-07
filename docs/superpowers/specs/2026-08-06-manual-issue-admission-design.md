# Manual Issue Admission Dispatch Design

## Goal

Allow maintainers to recover missed issue webhooks by running **Submission intake: Check issue eligibility** with an issue number.

## Design

- Add a required numeric `issue_number` input to `workflow_dispatch`.
- Use the input or the issue event number consistently in the run name, concurrency key, and admission step.
- When the event has no issue payload, fetch the current issue through the existing authenticated GitHub request boundary, reject pull requests, and synthesize a `reopened` admission event.
- Reuse the existing admission policy and downstream route dispatches without bypass labels or special recovery policy.

## Safety and verification

- Reject missing, non-positive, or non-integer issue numbers.
- Reject API objects representing pull requests.
- Preserve existing opened, reopened, and edited behavior.
- Cover manual event resolution and workflow input/concurrency contracts with focused unit tests.
