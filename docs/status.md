# Status

tier: beta

reason:
- Formal package loading, recorder proper, failure artifacts, secure secret provider, MCP export, review workflow, and the production Playwright BrowserDriver are implemented.
- CLI replay, daemon runtime creation, real-browser contract coverage, real-browser integration coverage, and real-browser E2E coverage are in place.
- The project is not declared stable; desktop automation and broader product hardening remain out of scope or incomplete.

policy:
- `stable` is forbidden unless the D-001 through D-007 feature matrix is fully implemented and verified.
- `beta` is forbidden if the production BrowserDriver is missing.
- If `src/drivers/playwright-browser-driver.ts` or the real-browser contract/integration/E2E suites are absent, the overall tier MUST be `alpha`.
