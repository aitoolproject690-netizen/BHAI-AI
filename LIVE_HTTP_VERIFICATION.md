# Live HTTP verification

This marker exists only to trigger the existing production medical smoke workflow, which independently curls `/api/health` and requires HTTP 200 plus exact deployment/health checks.
