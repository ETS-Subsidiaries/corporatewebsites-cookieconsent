# Corporate Websites Cookie Consent

A static, dependency-free cookie consent runtime for public corporate websites, with optional consent receipt logging through an Azure Function and Azure Table Storage.

The browser's local choice is authoritative. The banner, settings, locale selection, and Google Analytics decision continue to work when the receipt endpoint is missing, offline, or not deployed.

## Contents

| File | Purpose |
| --- | --- |
| `cookie-consent.js` | Static browser runtime served through jsDelivr or a website's own static hosting |
| `function_app.py` | Optional Azure Functions Python v2 receipt endpoint |
| `host.json` | Azure Functions host and telemetry settings |
| `local.settings.example.json` | Secret-free local settings template |
| `requirements.txt` | Python runtime dependencies |
| `tests/test_function_app.py` | Backend contract tests |

This repository does not use Node.js, npm, or a JavaScript build step.

## Quick start

These examples assume that a release tag has been published. Repository maintainers should complete [Publish through jsDelivr](#publish-through-jsdelivr) before giving a CDN URL to a website owner.

Place the script in the document `<head>` before Google Analytics, Google Tag Manager, or any other analytics loader.

### Consent UI only

```html
<script src="https://cdn.jsdelivr.net/gh/ETS-Subsidiaries/corporatewebsites-cookieconsent@v1.0.0/cookie-consent.js"></script>
```

The banner and local consent settings work without any attributes. Analytics loading and receipt logging remain disabled.

### Consent UI with GA4

```html
<script
  src="https://cdn.jsdelivr.net/gh/ETS-Subsidiaries/corporatewebsites-cookieconsent@v1.0.0/cookie-consent.js"
  data-ga-id="G-MEASURE123"
  data-position="bottom-right"
></script>
```

The runtime sets Google Consent Mode to denied before later scripts run. It loads GA4 only after the visitor agrees.

### Consent UI, GA4, and receipt logging

```html
<script
  src="https://cdn.jsdelivr.net/gh/ETS-Subsidiaries/corporatewebsites-cookieconsent@v1.0.0/cookie-consent.js"
  data-site-id="example-entity"
  data-ga-id="G-MEASURE123"
  data-receipt-endpoint="https://FUNCTION-APP.azurewebsites.net/api/consent-receipts"
  data-position="bottom-left"
></script>
```

Use a release tag or exact commit in production. Do not use a mutable `@main` URL for a legal notice.

## Configuration

The editable block is at the top of `cookie-consent.js`:

```javascript
const CONFIG = {
    runtimeVersion: '1.0.0',
    protocolVersion: 1,
    noticeVersion: '2026-07-30',
    defaultLocale: 'en',
    position: 'bottom-left',
    consentLifetimeMonths: 6,
    receiptEndpoint: '',
    receiptTimeoutMs: 4000,
    maxPendingReceipts: 10,
    privacyPolicyUrl: 'https://www.exchangeincomecorp.ca/privacy-policy',
    locales: {
        en: {
            // See the source file for every required text field.
        }
    }
};
```

| Setting | Meaning |
| --- | --- |
| `runtimeVersion` | Semantic version of the distributed JavaScript; code-owned and not HTML-overridable |
| `protocolVersion` | Browser/backend receipt contract; code-owned and not HTML-overridable |
| `noticeVersion` | Version of the legally meaningful notice; changing it prompts visitors again |
| `defaultLocale` | Fallback locale; defaults to `en` |
| `position` | `bottom-left`, `bottom-right`, `top-left`, or `top-right` |
| `consentLifetimeMonths` | Local choice lifetime, from 1 to 24 months; defaults to 6 |
| `receiptEndpoint` | Default optional Function URL; an empty string disables receipt submission |
| `receiptTimeoutMs` | Receipt request timeout from 1,000 to 30,000 milliseconds |
| `maxPendingReceipts` | Local retry queue size, capped at 25 |
| `privacyPolicyUrl` | HTTPS privacy policy URL; an empty or invalid value hides the link |
| `locales` | Open-ended map of BCP 47 locale tags to complete interface copy |

### Script attributes

| Attribute | Required | Purpose |
| --- | --- | --- |
| `data-config` | No | Bounded JSON object that overrides editable configuration values |
| `data-site-id` | Only for logging | Stable entity ID and Azure Table partition key; `A-Z`, `a-z`, `0-9`, `.`, `_`, and `-`, up to 128 characters |
| `data-ga-id` | Only for GA4 | GA4 measurement ID in `G-...` format |
| `data-receipt-endpoint` | Only for logging | Overrides `receiptEndpoint`; must be HTTPS, except HTTP localhost during development |
| `data-position` | No | Overrides `position` with one of the four supported corner values |

Precedence is:

1. Editable `CONFIG` block
2. `data-config`
3. Dedicated `data-receipt-endpoint` and `data-position` attributes

`data-site-id` and `data-ga-id` are dedicated integration attributes rather than fields in the editable block.

### `data-config` overrides

Use valid JSON inside a single-quoted HTML attribute:

```html
<script
  src="https://cdn.jsdelivr.net/gh/ETS-Subsidiaries/corporatewebsites-cookieconsent@v1.0.0/cookie-consent.js"
  data-config='{
    "position": "top-right",
    "privacyPolicyUrl": "https://www.example.com/privacy",
    "locales": {
      "en": {
        "heading": "Our cookie choices"
      }
    }
  }'
></script>
```

Existing locale objects merge field by field. A new locale must provide every required locale field. The JSON value is limited to 32,768 characters. Unknown keys, invalid JSON, arrays, incomplete new locales, and invalid scalar values are ignored as one override, the editable block remains active, and an `invalid-data-config` diagnostic event is emitted.

`data-config` may override:

- `noticeVersion`
- `defaultLocale`
- `position`
- `consentLifetimeMonths`
- `receiptEndpoint`
- `receiptTimeoutMs`
- `maxPendingReceipts`
- `privacyPolicyUrl`
- `locales`

It cannot override `runtimeVersion` or `protocolVersion`.

## Locales

English is the only built-in locale. Add any number of BCP 47 locale keys to `CONFIG.locales` or `data-config`.

Every locale requires:

| Field | Used for |
| --- | --- |
| `selectorLabel` | Locale name shown in the selector |
| `heading` | Notice heading |
| `body` | Notice body |
| `acceptLabel` | Initial acceptance button |
| `declineLabel` | Initial decline button |
| `settingsLabel` | Persistent settings button |
| `privacyLabel` | Privacy policy link |
| `withdrawLabel` | Withdrawal button after acceptance |
| `closeLabel` | Settings close button |
| `languageLabel` | Accessible selector label |
| `statusAccepted` | Accepted status text |
| `statusDeclined` | Declined status text |
| `gpcMessage` | Global Privacy Control explanation |

Locale resolution checks `navigator.languages` in order:

1. Exact normalized match, such as `fr-CA`
2. Base-language match, such as `fr`
3. The page's `<html lang>`
4. English

An explicit visitor selection is saved and takes precedence on later visits.

- One configured locale: no selector
- Two configured locales: toggle buttons
- Three or more configured locales: dropdown

To add a locale, copy the complete `en` object, use a normalized BCP 47 key, and translate every field.

## Position and styling

The default position is `bottom-left`. Set another corner in `CONFIG.position`, `data-config`, or `data-position`.

The built-in palette matches the EIC portal theme: EIC navy (`#29526E`) for the persistent settings control, EIC accent blue (`#008FC4`) for primary actions and links, accent hover (`#0079A5`), dark text (`#383B42`), subtle blue (`#D7EEF7`), and portal border gray (`#DEE2E8`).

### CSS custom properties

Set variables on the custom element from the website's stylesheet:

```css
ets-cookie-consent {
  --ets-consent-panel-background: #ffffff;
  --ets-consent-panel-color: #383b42;
  --ets-consent-panel-accent: #008fc4;
  --ets-consent-primary-background: #008fc4;
  --ets-consent-primary-hover: #0079a5;
  --ets-consent-link-color: #008fc4;
  --ets-consent-settings-background: #29526e;
  --ets-consent-heading-font-family: Georgia, serif;
  --ets-consent-panel-width: 700px;
  --ets-consent-edge-offset: 24px;
}
```

Available variables:

| Variable | Controls |
| --- | --- |
| `--ets-consent-z-index` | Panel and settings stacking order |
| `--ets-consent-edge-offset` | Distance from the configured viewport corner |
| `--ets-consent-panel-width` | Desktop panel width |
| `--ets-consent-panel-background` | Panel and active-locale background |
| `--ets-consent-panel-color` | Main text and heading color |
| `--ets-consent-panel-border` | Panel and selector border color |
| `--ets-consent-panel-accent` | Top rule and notice accent |
| `--ets-consent-panel-radius` | Panel corner radius |
| `--ets-consent-panel-padding` | Panel spacing |
| `--ets-consent-panel-shadow` | Panel shadow |
| `--ets-consent-font-family` | Body and control font |
| `--ets-consent-heading-font-family` | Heading font |
| `--ets-consent-heading-size` | Heading size |
| `--ets-consent-body-size` | Body copy size |
| `--ets-consent-primary-background` | Acceptance button background |
| `--ets-consent-primary-color` | Acceptance button text |
| `--ets-consent-primary-hover` | Acceptance button hover background |
| `--ets-consent-secondary-background` | Decline, withdrawal, and close background |
| `--ets-consent-secondary-color` | Secondary action text |
| `--ets-consent-secondary-border` | Secondary action border |
| `--ets-consent-secondary-hover` | Secondary action hover background |
| `--ets-consent-settings-background` | Persistent settings button background |
| `--ets-consent-settings-color` | Persistent settings button text |
| `--ets-consent-settings-radius` | Persistent settings button radius |
| `--ets-consent-link-color` | Privacy policy link |
| `--ets-consent-focus-color` | Keyboard focus outline |
| `--ets-consent-muted-color` | Status, notice, and selector text |

### Shadow parts

Use `::part(...)` for deeper entity-specific styling:

```css
ets-cookie-consent::part(panel) {
  border-width: 2px;
}

ets-cookie-consent::part(accept-button) {
  text-transform: uppercase;
  letter-spacing: .04em;
}
```

Available part names:

- `panel`
- `settings-button`
- `heading`
- `body`
- `privacy-link`
- `notice`
- `gpc-notice`
- `status`
- `actions`
- `action-button`
- `accept-button`
- `decline-button`
- `withdraw-button`
- `close-button`
- `locale-controls`
- `locale-button`
- `active-locale`
- `locale-label`
- `locale-select`

## Consent and analytics behavior

1. The runtime establishes denied Google Consent Mode defaults.
2. With no current choice, it shows the notice.
3. Acceptance is saved locally and GA4 is loaded immediately when `data-ga-id` is valid.
4. Decline or withdrawal keeps analytics denied and removes accessible first-party `_ga`, `_gid`, and `_gat` cookies.
5. A choice expires after six months by default.
6. Changing `noticeVersion` invalidates the previous choice and shows the notice again.
7. Global Privacy Control records a local rejection, keeps analytics disabled, and leaves settings available.

Load this script before any analytics code. If analytics already ran, the runtime disables known GA measurement IDs and emits `provider-detected`, but it cannot undo requests that were already sent.

The runtime always denies advertising storage, ad user data, and ad personalization. It grants only `analytics_storage`.

## Browser API

The runtime exposes:

```javascript
window.ETSCookieConsent.version;
window.ETSCookieConsent.openSettings();
window.ETSCookieConsent.getState();
window.ETSCookieConsent.setLocale('en');
```

`getState()` returns a privacy-minimized copy:

```json
{
  "purposeDecisions": { "analytics": true },
  "decisionSource": "accept",
  "decisionAt": "2026-07-30T14:00:00.000Z",
  "expiresAt": "2027-01-30T14:00:00.000Z",
  "locale": "en",
  "noticeVersion": "2026-07-30",
  "globalPrivacyControl": false
}
```

It returns `null` before a valid choice exists.

## Browser events

Listen before loading the runtime:

```html
<script>
  document.addEventListener('ets-cookie-consent:statechange', function (event) {
    console.log(event.detail.purposeDecisions.analytics);
  });
</script>
```

| Event | Meaning |
| --- | --- |
| `ets-cookie-consent:statechange` | Local analytics choice changed |
| `ets-cookie-consent:localechange` | Visitor selected another configured locale |
| `ets-cookie-consent:provider-detected` | GA was present before the runtime |
| `ets-cookie-consent:provider-activated` | Configured GA4 was activated |
| `ets-cookie-consent:receipt-sent` | Backend acknowledged a receipt |
| `ets-cookie-consent:receipt-failed` | Receipt failed; detail says whether it is retryable |
| `ets-cookie-consent:receipt-skipped` | Logging is disabled because site ID or endpoint is absent |
| `ets-cookie-consent:storage-unavailable` | Browser local storage could not be read or written |
| `ets-cookie-consent:diagnostic` | Duplicate runtime, invalid config, or provider load problem |

Receipt and storage events are diagnostic only. They do not change analytics activation or display an error to the visitor.

## Local storage

The runtime uses origin-scoped `localStorage`:

```text
ets-cookie-consent:<site-id-or-default>:state
ets-cookie-consent:<site-id-or-default>:locale
ets-cookie-consent:<site-id-or-default>:receipt-queue
```

Without `data-site-id`, it uses the `default` namespace. Since browser storage is already isolated by origin, unrelated websites cannot share this state.

If local storage is blocked, the current page still works but the visitor will be prompted again on a later page load.

## Optional receipt logging

Receipt logging is enabled only when both `data-site-id` and a valid endpoint are present.

The browser sends:

```json
{
  "receiptId": "00000000-0000-4000-8000-000000000000",
  "siteId": "example-entity",
  "purposeDecisions": { "analytics": true },
  "decisionSource": "accept",
  "locale": "en",
  "clientDecisionAt": "2026-07-30T14:00:00.000Z",
  "noticeVersion": "2026-07-30",
  "runtimeVersion": "1.0.0",
  "protocolVersion": 1
}
```

Supported sources are `accept`, `decline`, `withdraw`, and `gpc`.

The payload does not include an IP address, user agent, full page URL, referrer, cookie value, or visitor account identifier. The Function stores the browser origin because it is part of the configured site authorization and evidence record.

Receipt delivery is best effort:

- The local decision takes effect immediately.
- A failed receipt is retained in a queue of at most 10 by default.
- The runtime attempts the queue once on a later page load or when the browser returns online.
- It does not run a retry timer.
- Network errors, timeouts, HTTP 408, HTTP 429, and HTTP 5xx remain queued.
- Other HTTP 4xx responses are terminal and are removed.

The runtime adds `?siteId=<data-site-id>` to the Function URL so CORS preflight can authorize the site before the POST body is available.

## Azure Function

The optional backend exposes:

```text
POST /api/consent-receipts?siteId=<site-id>
OPTIONS /api/consent-receipts?siteId=<site-id>
```

It uses the Azure Functions Python v2 programming model and `azure-data-tables`.

### App settings

| Setting | Required | Description |
| --- | --- | --- |
| `AzureWebJobsStorage` | Yes | Azure Functions host storage connection string |
| `CONSENT_STORAGE_CONNECTION_STRING` | No | Separate Table Storage connection string; falls back to `AzureWebJobsStorage` |
| `CONSENT_TABLE_NAME` | No | Azure Table name; defaults to `ConsentReceipts` |
| `CONSENT_ALLOWED_ORIGINS` | Yes | JSON map of site IDs to exact allowed origins |
| `FUNCTIONS_WORKER_RUNTIME` | Yes | `python` |

Example origin map:

```json
{
  "example-entity": [
    "https://www.example.com",
    "https://example.com"
  ],
  "second-entity": [
    "https://www.second.example"
  ]
}
```

Store it as one compact JSON string in the app setting:

```text
{"example-entity":["https://www.example.com","https://example.com"],"second-entity":["https://www.second.example"]}
```

Production origins must use HTTPS. HTTP is accepted only for `localhost`, `127.0.0.1`, and `::1` development origins. Wildcards are rejected.

The Function creates the configured table on first use. The storage identity or connection string must allow table creation, entity creation, and entity reads.

### Table entity

| Property | Value |
| --- | --- |
| `PartitionKey` | Site ID |
| `RowKey` | Receipt UUID |
| `AnalyticsAllowed` | Boolean decision |
| `DecisionSource` | `accept`, `decline`, `withdraw`, or `gpc` |
| `Locale` | Normalized BCP 47 locale |
| `ClientDecisionAt` | Browser decision timestamp |
| `NoticeVersion` | Static notice version |
| `RuntimeVersion` | Browser runtime version |
| `ProtocolVersion` | Receipt contract version |
| `Origin` | Exact authorized website origin |
| `PayloadHash` | SHA-256 hash of canonical origin and receipt evidence |
| `ServerReceivedAt` | Azure Function UTC receive time |

Writes are idempotent. Reposting the same receipt returns the original acknowledgement. Reusing a receipt UUID with different evidence returns HTTP 409.

### CORS and abuse boundary

The Function:

- Requires an exact `Origin` match for the requested site ID.
- Returns that origin rather than `*`.
- Allows only `POST`, `OPTIONS`, and `Content-Type`.
- Does not allow credentials.
- Limits request bodies to 8 KiB.
- Validates an exact field list and returns non-echoing errors.

Origin validation reduces browser abuse; it is not strong client authentication because non-browser clients can forge an `Origin` header. Do not embed a reusable Function key or storage secret in public JavaScript. Use Azure monitoring, budgets, and platform controls for additional abuse protection if traffic warrants it.

If Azure portal CORS settings are used, do not configure `*`. Ensure platform CORS does not replace the Function's exact-origin response policy.

## Python setup and tests

Python 3.11 or 3.12 is recommended.

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s .\tests -p "test_*.py" -v
```

To run the Function locally, copy `local.settings.example.json` to `local.settings.json`, replace placeholders with organization-approved Azure Storage connection strings, and start it with an approved Azure Functions Core Tools installation:

```powershell
func start
```

No Node.js tooling is required by this repository.

## Browser smoke check

Use an approved browser and Python's static server:

```powershell
py -m http.server 8000
```

Create a temporary HTML page that loads `http://127.0.0.1:8000/cookie-consent.js`, then verify:

1. The English notice appears with no attributes.
2. `data-position` moves the panel to each supported corner.
3. A second locale creates toggle buttons; a third creates a dropdown.
4. `data-config` overrides text and privacy URL.
5. Agreeing stores the state and reveals the settings button.
6. With `data-ga-id`, no GA script appears before agreement and one appears after agreement.
7. With an unavailable receipt endpoint, the local choice still succeeds and a queued receipt remains.
8. Global Privacy Control produces a local rejection and disables acceptance.

Delete the temporary page after the check.

## Optional Azure deployment

1. Deploy `function_app.py`, `host.json`, and `requirements.txt` to a Python Azure Function App if receipt logging is approved.
2. Set the Function app settings and exact origin map.
3. Confirm preflight and receipt POSTs from each registered production origin.
4. Set the final receipt endpoint in the editable block, `data-config`, or `data-receipt-endpoint`.
5. Run the Python tests and browser smoke check.

The Azure Function is not required for jsDelivr publishing or for the consent interface to work.

## Publish through jsDelivr

jsDelivr serves files directly from public GitHub repositories. There is no jsDelivr account to create, file to upload, configuration file to add, or build to run.

### 1. Confirm the release prerequisites

Before publishing:

- The GitHub repository must be public.
- `cookie-consent.js` must be committed at the repository root on the release commit.
- The `runtimeVersion` in `cookie-consent.js` must match the planned release.
- Any legally meaningful change must also have a new `noticeVersion`.
- The maintainer publishing the release must be allowed to push Git tags.

Private repositories cannot use jsDelivr's GitHub CDN endpoint.

### 2. Create an immutable release tag

After the release changes have been merged into `main`, tag that exact commit. For the first release:

```powershell
git fetch origin main
git tag -a v1.0.0 -m "Release v1.0.0" origin/main
git push origin v1.0.0
```

Use a new semantic version tag for every release. Never move, delete, or force-update a tag that a website may already reference. Creating a GitHub Release from the tag is useful for release notes, but jsDelivr only requires the public repository and Git tag.

### 3. Build the CDN URL

The GitHub URL format is:

```text
https://cdn.jsdelivr.net/gh/<owner>/<repository>@<tag>/<file-path>
```

This repository's first tagged URL is:

```text
https://cdn.jsdelivr.net/gh/ETS-Subsidiaries/corporatewebsites-cookieconsent@v1.0.0/cookie-consent.js
```

Requesting that URL is enough for jsDelivr to discover and cache the file. No separate registration or deployment is needed.

### 4. Verify the published file

Run this after pushing the tag:

```powershell
$Url = "https://cdn.jsdelivr.net/gh/ETS-Subsidiaries/corporatewebsites-cookieconsent@v1.0.0/cookie-consent.js"
$Response = Invoke-WebRequest -Uri $Url
$Response.StatusCode
$Response.Headers["Content-Type"]
$Response.Content.Contains("runtimeVersion: '1.0.0'")
```

The expected status is `200`, the content type should identify JavaScript, and the final command should return `True`. Also open the URL in a browser and confirm that it shows the expected source rather than an error page.

If the request returns `404`, confirm that:

1. The repository is public.
2. The tag exists on GitHub.
3. The tagged commit contains `cookie-consent.js`.
4. The owner, repository, tag, and file path use the exact spelling and capitalization shown on GitHub.

### 5. Choose a version policy

| URL version | Update behavior | Recommended use |
| --- | --- | --- |
| `@v1.0.0` | Always serves that release | Production default; deliberate, auditable updates |
| `@<full-commit-sha>` | Always serves that commit | Emergency pinning or pre-release review |
| `@1` | Follows the newest compatible `1.x` tag after CDN cache refresh | Centrally managed sites that have approved automatic minor and patch updates |
| `@main`, `@latest`, or no version | Follows mutable or latest content | Do not use for production consent notices |

An exact tag is safest, but each website must update its script URL to adopt a later release. A major-version alias such as `@1` reduces per-site maintenance, but a new compatible release can reach sites automatically. Select one policy for each entity and document that decision.

### 6. Add the URL to the website

Copy the appropriate example from [Quick start](#quick-start), keep the selected version in the URL, and place the script in the document `<head>` before Google Analytics, Google Tag Manager, or another analytics loader. Publish the CMS or website changes, then confirm in browser developer tools that:

1. The jsDelivr request returns HTTP 200.
2. The consent script loads before analytics.
3. The banner or saved consent state works without console errors.

### 7. Handle CDN caching

Do not purge or replace an exact release tag. If an immutable release is wrong, fix the problem and publish a new tag.

Version aliases can remain cached for up to seven days. When an approved alias update must take effect sooner, purge only the alias URL through [jsDelivr's purge tool](https://www.jsdelivr.com/tools/purge) or:

```powershell
Invoke-RestMethod -Uri "https://purge.jsdelivr.net/gh/ETS-Subsidiaries/corporatewebsites-cookieconsent@1/cookie-consent.js"
```

After a purge, request the CDN URL again and repeat the verification steps.

## Release updates

When legally meaningful copy, the privacy link, purposes, or consent behavior changes:

1. Update the text or behavior.
2. Change `noticeVersion` so visitors are prompted again.
3. Increment `runtimeVersion` for JavaScript behavior changes.
4. Run the checks.
5. Publish a new immutable Git tag using the jsDelivr steps above.
6. Update sites pinned to an exact tag; approved version aliases update through jsDelivr.

For sites that cannot depend on jsDelivr, download the tagged `cookie-consent.js` and serve the same immutable file from the site's approved static hosting.
````