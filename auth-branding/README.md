# Cognito sign-in branding

`cognito.css` and `header.jpg` style the existing Cognito Hosted UI (classic)
for Clearbook's app client. Credentials, password reset and first-login password
setup continue on Cognito. This change leaves the Lite tier and auth flows intact.
The rendered header uses the same local 3D sculpture as the public landing page.

Rebuild the artwork with `node scripts/build-auth-header.cjs`. This uses the
installed Edge browser through Playwright (override `PLAYWRIGHT_CHANNEL`). The
700 × 356 JPEG is displayed at the hosted page's logo size and remains under the
100 KB limit. CSS stays under 3 KB and uses the supported customization classes.

Preview deployment settings with `python scripts/deploy-auth-branding.py`.
Apply with `--apply`, using locally configured AWS credentials. The helper
saves the existing app-client CSS and logo, when present, under
`.local/auth-branding/` before changing the theme. It verifies the saved CSS and
image URL and writes a receipt. Propagation can take about a minute.

For rollback, reapply the saved CSS and image with Cognito `set-ui-customization`
for the same pool and client. If the old theme had no image, a transparent logo
and the original/default CSS restore an unbranded appearance. Never change the
pool tier, callback URLs, OAuth configuration or users to undo a visual theme.

The classic hosted page has a fixed layout and doesn't run custom JavaScript.
The sign-in header is a render; the public landing page has the interactive 3D
scene. These source assets are operator tools, not part of the public static build.

AWS reference: https://docs.aws.amazon.com/cognito/latest/developerguide/hosted-ui-classic-branding.html
