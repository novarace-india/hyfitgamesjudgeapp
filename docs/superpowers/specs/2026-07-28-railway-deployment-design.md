# Railway Deployment Design

## Goal

Make the HYFIT Games Judge App deployable from its GitHub repository to Railway with configuration stored in code, while combining the completed cognitive R/G/Y redesign and all Railway deployment changes into one commit.

## Deployment Architecture

- Deploy the repository as one Railway persistent web service.
- Use Railway's current Railpack builder for Node.js.
- Install dependencies from the committed `package-lock.json`.
- Build the production Vinext application with `npm run build`.
- Start it with `npm start`.
- Rely on Vinext's production server behavior to bind to `0.0.0.0` and Railway's injected `PORT`.
- Use `/` as the deployment health-check path because the app is a single web experience and the root already returns an HTTP 200 response.

## Configuration as Code

Add a root-level `railway.json` containing:

- Railway's published JSON schema.
- `RAILPACK` as the explicit builder.
- `npm run build` as the build command.
- `npm start` as the start command.
- `/` as the health-check path.
- A reasonable health-check timeout.
- Restart-on-failure behavior with a bounded retry count.

Repository configuration must override conflicting dashboard build or start settings.

## Package Scripts

- Preserve `npm run dev` for local development.
- Preserve `npm run build` for production builds.
- Ensure `npm start` runs the built Vinext production server.
- Keep the start command free of hard-coded ports because Railway injects `PORT`.
- Keep Node.js 22 as the declared minimum runtime.

## Documentation

Extend the README with a Railway section covering:

1. Connect the GitHub repository to a new Railway project.
2. Deploy the service from the repository root.
3. Allow `railway.json` to supply build, start, and health-check configuration.
4. Generate a Railway public domain after the service becomes healthy.
5. Explain that no application variables are currently required.

Document that participant data remains sample frontend data and browser storage remains device-local.

## Verification

- Validate `railway.json` as JSON.
- Confirm the configured build and start commands match `package.json`.
- Run lint.
- Run the production Vinext build.
- Start the production server with a test `PORT` and confirm `/` returns HTTP 200.
- Run all tests, including cognitive sequence scoring and rendered HTML checks.
- Confirm the working tree contains only the intended cognitive redesign, Railway configuration, tests, documentation, and design specs.
- Commit all pending implementation and deployment changes together as one commit.

## Error Handling

- Railway must reject an unhealthy deployment when `/` does not become available before the health-check timeout.
- The service should restart only on failure and stop retrying after the configured maximum.
- Build failures must stop deployment rather than starting an incomplete artifact.

## Out of Scope

- Creating or configuring the Railway project through the Railway dashboard or CLI.
- Adding a central database, authentication service, or shared persistence.
- Adding secrets or environment variables that the current frontend does not use.
- Replacing Railpack with a custom Docker image.
- Changing the application's domain or DNS.
