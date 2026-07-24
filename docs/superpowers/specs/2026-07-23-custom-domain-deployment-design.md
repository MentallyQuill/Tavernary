# Custom-domain deployment correction

## Problem

GitHub Pages now serves Tavernary from `tavernary.org/`, but the deployment
workflow still builds Next.js with the project-site base path `/Tavernary`.
The resulting HTML loads while its CSS and JavaScript requests return 404.

## Design

- Set `TAVERNARY_BASE_PATH` to an explicit empty string in the Pages build job.
  This makes the custom-domain deployment emit root-relative `/_next/` assets.
- Keep the existing fallback base-path calculation for local project-page
  testing and any explicitly configured non-root deployment.
- Strengthen static-export verification: root deployments must contain
  root-relative Next.js assets and must reject repository-prefixed assets.
- Add regression coverage for both the export contract and the workflow
  environment.

## Verification

Run the full check, end-to-end, and visual suites. After deployment, confirm
that `tavernary.org/` returns the current catalog, referenced CSS and JavaScript
return 200, and the rendered desktop page is styled correctly. Check HTTPS
separately because certificate provisioning is controlled by GitHub Pages.
