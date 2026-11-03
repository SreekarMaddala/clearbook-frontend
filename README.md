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

The build inserts that URL into `dist/config.js`. Source `config.js` retains `/api` for local development. No credentials or client secrets belong in this repository. The deployed API requires a Cognito access token; browser sign-in/PKCE remains deferred from the earlier backend-only scope. Its current token hook reads `sessionStorage['clearbook-access-token']`. Update backend `AllowedOrigin` and `CallbackUrl` for the eventual Vercel URL.

## Verification

`npm run check` checks JavaScript syntax. `npm run build` creates static output. `npm run test:integration` starts an isolated backend and this repository's development proxy, then exercises the actual frontend handlers against the HTTP API. It requires the backend checkout alongside this one, or `CLEARBOOK_BACKEND_DIR` pointing at it. Python and the backend's development requirements must be installed. The test uses DOM stubs; it is not a visual browser test.

Changes load on startup, after saves and through **Refresh**. No endpoint polling is used. Each transaction has a location; expenses can select a vendor.
