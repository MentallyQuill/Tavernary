# Supported runtime

Production builds and automation use Node 24 LTS, selected through
.node-version and config/supported-runtimes.json. Node declarations use the
same major. The official Node release schedule on GitHub determines support.

Weekly compatibility checks cover the current and next stable LTS, including
static, unit, build, browser and visual checks. A constrained runtime PR must
pass full checks for its exact head and the current runtime before merging.
Failed candidates preserve the working runtime and deployed bundle.

An incident warns 90 days before support ends without a verified successor.
An expired runtime remains unhealthy until a supported transition is merged.
GitHub outages or disabled schedules require the owner to restore automation.
