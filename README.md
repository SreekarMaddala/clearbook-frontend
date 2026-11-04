# Clearbook frontend

Independent frontend repository. Backend: sibling `clearbook-backend` repository. No third-party Node dependencies are required.

## Local development

Start the backend in a separate terminal:

```powershell
cd ../clearbook-backend
python -m backend.server --seed-demo
```

Then from this frontend repository:

```powershell
npm run dev
```

Open http://localhost:5173. The frontend development server proxies `/api` to http://127.0.0.1:8000, so no CORS configuration is needed for offline development. Set `CLEARBOOK_API_PROXY` to change the local upstream and `PORT` to change the frontend port. Stop an older preview on port 5173 before starting this one.

## Vercel build

Import this repository in Vercel. `vercel.json` selects `npm run build` and the `dist` directory. Set this public environment variable:

```text
CLEARBOOK_API_BASE=https://6fevwj9dy0.execute-api.ap-south-2.amazonaws.com/api
```

The build inserts that URL into `dist/config.js`. Source `config.js` retains `/api` for local development. No credentials or client secrets belong in this repository. Cognito sign-in is enabled on hosted domains; loopback development stays offline without authentication.

## Cognito sign-in and Amplify

`auth.js` implements authorization-code login with S256 PKCE and a short-lived, single-use state/verifier pair. The browser redirects to the Cognito login screen; usernames/passwords are entered there, not sent through this app's Lambdas. Callback URLs use the current origin plus `/`. The hosted workspace waits for authentication before requesting application data. Public Cognito identifiers are configured in `config.js` for the deployed Hyderabad pool and browser client.

Access and refresh tokens are stored in sessionStorage (not localStorage) and cleared on sign-out. API calls send the access token. The server validates the JWT, client/issuer, expiry and ledger scope. The client parses access claims for expiry and display, not as a substitute for server signature validation. Concurrent API calls share a single on-demand refresh request. No renewal timers or endpoint polling are used. Logout revokes the refresh token when reachable and clears the Cognito browser session; API Gateway can still accept a copied access token until its 15-minute expiration. A browser tab session is not an HttpOnly cookie; avoid introducing untrusted scripts into the page.

For Amplify, push this repository and keep `CLEARBOOK_API_BASE` set to `https://6fevwj9dy0.execute-api.ap-south-2.amazonaws.com/api`. The included `amplify.yml` checks, tests and builds into `dist`. The backend's `AllowedOrigin` must match `https://main.d1cy6ym167mgbw.amplifyapp.com`, and `CallbackUrl` must match that URL with a trailing slash. Localhost callback/logout URLs remain configured in SAM. Set your super-admin password privately using the backend repository's `python scripts/bootstrap-backend.py --set-admin-password` before signing in.

The sign-in UI displays the Cognito role but does not add browser user-administration endpoints. Public signup remains disabled. Verify a real login after pushing and deploying; local mocked OAuth tests cannot prove live Cognito callbacks or the final deployed CORS settings.

## Verification

`npm run check` checks JavaScript syntax. `npm test` covers PKCE, callback validation, session renewal and logout with mocked Cognito responses. `npm run build` creates static output. `npm run test:integration` starts an isolated backend and this repository's development proxy, then exercises the actual frontend handlers against the HTTP API. It requires the backend checkout alongside this one, or `CLEARBOOK_BACKEND_DIR` pointing at it. Python and the backend's development requirements must be installed. The test uses DOM stubs; it is not a visual browser test.

Changes load on startup, after saves and through **Refresh**. No endpoint polling is used. Each transaction has a location; expenses can select a vendor.
