# Clearbook frontend

## Public landing page

Signed-out visitors see a responsive landing page with a locally bundled Three.js
scene, optional motion, product-preview tabs and the existing Cognito sign-in
action. Signed-in users continue directly to their workspace. Sample records on
the landing page are illustrative; no organization data is fetched while signed
out. The 3D scene loads only on the landing page, pauses offscreen and in hidden
tabs, respects reduced motion, and has a CSS fallback when WebGL is unavailable.
The hero keeps its camera and worksite fixed while scrolling drives two workers,
a hammer strike, and a fragment that morphs from rough stone into a rupee coin.
The formed coin spins downward with a short trail, bounces on the worksite, and
triggers expanding rings and sparks; effects are driven by scroll and reverse with it.
The same coin mesh then leaves the worksite and follows a continuous path through
platform, payment, people, workflow, access and footer stations. A fixed transparent
renderer carries only the coin; content and the worksite remain steady. Its overlay
ignores pointer events, reuses its renderer, supports reverse scrolling, and returns
the mesh to the original scene when scrolling back. Mobile uses smaller coins and
separate station spacing; reduced motion uses static coin artwork.
Reversing scroll reverses the sequence. A clearly marked sample payment appears
at the end. The scene renders only while its pose changes, pauses offscreen and
in hidden tabs, and shows a static final pose for reduced motion. Native scrolling
stays intact, and all effects are cleaned up when the landing page is removed.

Run `npm ci` before development. `npm run dev` also builds the 3D bundle. Visit
`http://127.0.0.1:5173/?landing=1` to preview the signed-out page locally without
starting the backend. `npm run build` bundles the scene and copies its assets.
`npm run test:landing` runs desktop/mobile and login-handoff checks using an
installed Edge browser on Windows (override with `PLAYWRIGHT_CHANNEL`).


The Cognito classic login uses matching static construction artwork and green form
styling. Run `node scripts/build-auth-header.cjs` to render the JPEG from the local
construction scene, then `python scripts/deploy-auth-branding.py --apply` to update
only this app client's image and CSS. The deployment script backs up its previous
image and CSS under `.local/auth-branding/` before applying and verifying the theme.
Cognito classic supports image/CSS branding rather than the landing's WebGL motion;
users, passwords, OAuth settings and callback URLs are unchanged.


Independent frontend repository. Backend: sibling `clearbook-backend` repository. The landing page uses Three.js, bundled with esbuild; browser checks use Playwright.

## Staff and salaries

LABOUR PAYMENTS, Labour Tips and LABOUR ADVANCE are default categories. For these
three categories the transaction form shows an optional Payee name (up to 120
characters) instead of the Vendor selector. Names are stored on each payment;
no vendor record is created. Names appear in the To column, details, search and
CSV exports, including the analytics transaction explorer. Existing payments
without names remain valid. Other categories keep their vendor/staff selection.
Payee name suggests previously saved names across these three labour categories
in the current organization. Users can choose a name, type a new one or leave it
blank. Suggestions ignore capitalization and surrounding spaces, exclude reversed
payments and are derived from the organization's dashboard summary without a new table
or browser storage. Names are available after the payment is saved and refreshed.

Vendors, Subcontractors and Staff have separate directory screens. Vendors lists
payees with the Supplier role; Subcontractors lists those with the Subcontractor
role. Payees with multiple roles appear in each matching directory, using the
same record and payment history. Each Add form selects its directory role by
default. Staff-only payees appear only in Staff.
Choose Add staff to enter an employee and job title, then Record salary to
enter the amount, payment date and paying account. Salary month is no longer
requested in the transaction form or shown in transaction details.
Staff totals and exports exclude reversed salary payments. Salary month is also
included in transaction CSV exports only when at least one exported payment has
a recorded salary month. Otherwise, the column is omitted.

The existing Amplify app `d1cy6ym167mgbw` is in **ap-northeast-3 (Osaka)**;
the API, Cognito and DynamoDB backend remain in **ap-south-2 (Hyderabad)**.

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

The UI resolves access through `/api/session`. Software-provider accounts see Customers and Users; active customer accounts see their own business ledger. The backend enforces both role separation and workspace isolation. Public signup remains disabled. Verify a real login after pushing and deploying; local mocked OAuth tests cannot prove live Cognito callbacks or the final deployed CORS settings.

## Verification

Transaction filters support multiple accounts, clients, payees, categories and
locations through checkbox dropdowns. A record can match any selected value in
one dropdown and must match each active filter. Payees includes vendor records
and saved labour payee names. Date range, search, pagination and CSV exports use
the same filtered records. Clear filters resets all selections.

`npm run check` checks JavaScript syntax. `npm test` covers PKCE, callback validation, session renewal and logout with mocked Cognito responses. `npm run build` creates static output. `npm run test:integration` starts an isolated backend and this repository's development proxy, then exercises the actual frontend handlers against the HTTP API. It requires the backend checkout alongside this one, or `CLEARBOOK_BACKEND_DIR` pointing at it. Python and the backend's development requirements must be installed. The test uses DOM stubs; it is not a visual browser test.

The overview requests five transactions for the selected month; the transaction
ledger requests ten per page. Search, tabs, date ranges and multi-select filters
are applied by the API before pagination. Overview charts and directory totals
come from dashboard aggregates, so they include payments outside the visible page.
References load as needed and remain cached in memory for the current workspace.
Saves invalidate the affected references, summaries and ledger pages; **Refresh**
clears the cache. Navigation and filtering load missing data without polling.
CSV export retrieves every matching page only when requested.

Deploy the backend changes before this frontend: `/dashboard?month=YYYY-MM`
returns monthly chart and directory aggregates, and `/transactions` accepts `tab`
and a JSON `filters` object containing arrays of account, client, payee, category
and location values. The existing document store still reads workspace records
on the server; this change bounds normal browser downloads, not DynamoDB reads.
Each transaction has a location; expenses can select a vendor.

## Provider and customer dashboards

Deploy this frontend together with the backend provider/customer update. Providers use **Organizations / Onboard organization** and **Users / Add user** to provision access. Each organization can have up to two customer users. New users change their temporary password at first Cognito sign-in; share it privately, since invitation emails are suppressed. Existing users keep their password. Disable controls revoke application access on subsequent API requests. Providers cannot enter customer ledgers, and accounts without organization membership cannot load business data.

The backend [provider access and deployment guide](../clearbook-backend/backend/README.md#provider-and-customer-access) describes storage, migration limits and deployment checks. Existing shared ledger records are not assigned to a newly onboarded organization automatically. Loopback development remains the offline demo ledger. `npm test` also covers hosted provider/customer routing, customer creation, user access controls and unassigned-account denial; hosted API/Cognito responses are mocked.


## Clients and incoming credits

Customer workspaces have a Clients directory with add/edit forms and receipt history. When adding a transaction, choose Expense, Payback or Credit. Credit requires a client, receiving business account, amount, date, payment mode and location. Remarks are optional for every transaction. Use + Add client in the Credit form to onboard a client without losing entered values. Click a transaction row to view its details and remarks.

Credits appear as Received, can be filtered by client or account, and are included in CSV exports and dashboard client receipt totals. Account cards show client credits, incoming, outgoing and net movement; net movement excludes opening balances. Existing transfers remain visible and editable under their original type, while new-entry options offer Credit in place of Transfer.

Deploy the matching backend and clients table before publishing this frontend. See the sibling backend's CLIENT_CREDITS.md for deployment order. Tests exercise the real local HTTP API, including client creation and credit create/edit/reverse. Visual browser verification is separate from these DOM-stub integration tests.


## Location dropdown

Every transaction form includes a required Location dropdown and + Add location. Adding a location preserves the transaction draft, saves the location to the workspace and selects it immediately. Historical transaction locations are available automatically; filters also include saved locations. Deploy the backend's GET/POST /api/locations routes before this frontend. No new physical DynamoDB table is needed.

## Analytics

Open **Analytics** in the workspace navigation, or visit `/#analytics`. This page
loads the complete paginated ledger only when opened and caches it in memory.
Changing its filters, charts or saved views makes no API requests; **Refresh**
loads current data. Large all-time analytics reports can still take time to load.

The page includes client credits, expenses, credits less expenses, net account movement, period comparisons, daily/weekly/monthly charts, breakdowns by category/vendor/client/location/account/payment mode, location performance, client and vendor rankings, business account movement, and a searchable transaction explorer with sorting, pagination and record details. Date presets include the Indian financial year starting April 1. Long chart ranges automatically use a coarser grouping and show the effective grouping; the chart data table provides exact values.

**Customize** shows or hides six panels and saves up to 12 named views. Views and layout preferences are stored in this browser's localStorage under the workspace ID; they contain filters and presentation settings, not transaction records. They do not sync across devices. Saving an existing view name updates that view. **Reset filters** keeps the selected layout; **Restore default layout** restores panels and chart settings.

Exports include all records matching the analytics filters, or the current breakdown. The transaction explorer's own export also respects its selected group and search, across all pages. CSV cells are escaped, including spreadsheet formula prefixes. Purpose/notes remain hidden and are not included in analytics exports.

Calculations use integer paise and exclude reversals. Paybacks do not count as expenses. Externally paid expenses are included in spending without reducing business account funds. Internal transfers cancel in consolidated cash flow and appear as movement on the individual accounts. Net account movement excludes opening balances, and credits less expenses is not accounting profit. Comparisons use the preceding period of the same duration with the same filters. Composite location names remain a single group.

The feature lives in `analytics.js` and `analytics.css`, separate from the existing app. `npm test` covers monetary calculations, comparisons, filters, export escaping, saved views and workspace isolation; `npm run test:integration` covers navigation, rendering and event wiring against an isolated local API. The build includes both assets.
