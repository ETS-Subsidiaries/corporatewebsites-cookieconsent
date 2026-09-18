# Corporate Websites Cookie Consent

A static, dependency-free cookie consent runtime for public corporate websites, with optional consent receipt logging through an Azure Function and Azure Table Storage.

The browser's local choice is authoritative. The banner, settings, locale selection, Google tag decision, and YouTube iframe gate continue to work when the receipt endpoint is missing, offline, or not deployed.

## Contents

| File | Purpose |
| --- | --- |
| `cookie-consent.js` | Static browser runtime served through jsDelivr or a website's own static hosting |
| `cookie-consent.min.js` | Minified build of the browser runtime |
| `preview.html` | Manual preview with unchanged YouTube embeds, responsive/dynamic cases, and cookie settings |
| `function_app.py` | Optional Azure Functions Python v2 receipt endpoint |
| `host.json` | Azure Functions host and telemetry settings |
| `local.settings.example.json` | Secret-free local settings template |
| `requirements.txt` | Python runtime dependencies |
| `tests/test_cookie_consent_runtime.js` | Dependency-free browser runtime regression tests |
| `tests/test_function_app.py` | Backend contract tests |

The browser runtime has no production dependencies or browser build step. Node.js runs the dependency-free runtime tests, and release maintainers use a pinned Terser command to regenerate the minified file; no npm project is required.

## Quick start

These examples target version `1.3.0` and assume its release tag has been published; source changes do not publish that tag. Repository maintainers should complete [Publish through jsDelivr](#publish-through-jsdelivr) before giving a CDN URL to a website owner.

Place the script in the document `<head>` before Google Analytics, Google Ads, Google Tag Manager, or any other analytics loader. For strict opt-in, no plugin or other integration may insert a Google tag independently; configure the tag on this runtime instead.

For YouTube, keep the runtime early in the head without `async` or `defer` to reduce the detection race. Automatic iframe gating is **best effort, not strict cookie prevention**; see [YouTube embeds](#youtube-embeds).

### Consent UI and YouTube gating

```html
<script src="https://cdn.jsdelivr.net/gh/ETS-Subsidiaries/corporatewebsites-cookieconsent@v1.3.0/cookie-consent.js"></script>
```

The banner, local consent settings, and automatic YouTube iframe detection work without any attributes. Analytics loading and receipt logging remain disabled.

### Consent UI with a Google tag

```html
<script
  src="https://cdn.jsdelivr.net/gh/ETS-Subsidiaries/corporatewebsites-cookieconsent@v1.3.0/cookie-consent.js"
  data-google-tag-id="GT-TAG123456"
  data-position="bottom-right"
></script>
```

The runtime establishes denied Google Consent Mode defaults immediately. It does not request `gtag.js` until the visitor agrees, which is the strict or basic consent path. `data-google-tag-id` accepts `GT-`, `G-`, `AW-`, and `DC-` IDs. The legacy `data-ga-id` attribute remains supported for `G-` IDs.

### Existing Google tag integration

The runtime detects supported IDs from existing `gtag.js` sources and `gtag('config', '...')` commands. It places denied defaults ahead of commands that are still queued, sets Google's per-measurement disable flag for detected `G-` IDs, and guards later configurations and dynamically inserted loaders. When the visitor agrees, it enables and configures known IDs.

This compatibility path is not strict opt-in. A Google tag that another integration already requested can send cookieless pings while storage is denied, and the runtime cannot retract a request or transmission that occurred before it loaded. To send nothing to Google before agreement, remove or disable every other Google loader and use `data-google-tag-id`.

### WordPress Site Kit strict opt-in

Site Kit inserts its own Google tag unless its Analytics snippet is blocked. Add the supported filter in a small custom plugin or child theme:

```php
add_filter( 'googlesitekit_analytics-4_tag_blocked', '__return_true' );
```

Then configure the same Google tag ID on this runtime with `data-google-tag-id`. If Site Kit's Tag Manager, AdSense, or another plugin also inserts Google scripts, disable those snippets separately. Confirm from a fresh browser profile that no request to `googletagmanager.com`, `google-analytics.com`, `googleadservices.com`, or `doubleclick.net` occurs before agreement or after decline.

### Consent UI, Google tag, and receipt logging

```html
<script
  src="https://cdn.jsdelivr.net/gh/ETS-Subsidiaries/corporatewebsites-cookieconsent@v1.3.0/cookie-consent.js"
  data-site-id="example-entity"
  data-google-tag-id="GT-TAG123456"
  data-receipt-endpoint="https://FUNCTION-APP.azurewebsites.net/api/consent-receipts"
  data-position="bottom-left"
></script>
```

Use a release tag or exact commit in production. Do not use a mutable `@main` URL for a legal notice.

## Configuration

The editable block is at the top of `cookie-consent.js`:

```javascript
const CONFIG = {
    runtimeVersion: '1.3.0',
    protocolVersion: 1,
    noticeVersion: '2026-09-18',
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
| `data-google-tag-id` | Only for Google measurement | Preferred Google tag ID in `GT-`, `G-`, `AW-`, or `DC-` format |
| `data-ga-id` | No | Backward-compatible alias for a GA4 `G-...` measurement ID |
| `data-receipt-endpoint` | Only for logging | Overrides `receiptEndpoint`; must be HTTPS, except HTTP localhost during development |
| `data-position` | No | Overrides `position` with one of the four supported corner values |

Precedence is:

1. Editable `CONFIG` block
2. `data-config`
3. Dedicated `data-receipt-endpoint` and `data-position` attributes

`data-site-id` and the Google tag attributes are dedicated integration attributes rather than fields in the editable block. Do not provide both tag attributes with different values; `data-google-tag-id` takes precedence and emits a diagnostic.

### `data-config` overrides

Use valid JSON inside a single-quoted HTML attribute:

```html
<script
  src="https://cdn.jsdelivr.net/gh/ETS-Subsidiaries/corporatewebsites-cookieconsent@v1.3.0/cookie-consent.js"
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

`mediaBlockedMessage` is optional and supplies the video-placeholder explanation. If omitted, it defaults to the English text "Accept cookies to view this video." Existing custom locales remain valid without this new field; translate it for a fully localized placeholder. The CTA reuses `settingsLabel`, and GPC uses `gpcMessage`. An explicitly supplied empty or invalid media message rejects the override through the existing `invalid-data-config` diagnostic.

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

After a visitor has made a choice, the persistent settings button collapses to its cookie icon whenever the page is scrolled away from the top. Its label expands again on hover or keyboard focus, and remains visible at the top of the page.

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

1. The runtime places denied Google Consent Mode defaults before queued measurement commands.
2. With no current choice, it shows the notice.
3. Acceptance is saved locally, activates configured or detected Google tag IDs, and restores eligible YouTube embeds.
4. Decline or withdrawal keeps analytics denied, unloads detected YouTube embeds, and removes accessible first-party Google Analytics and Ads cookies, including `_ga`, `_gid`, `_gat`, `_gac_*`, `_gcl_*`, `FPGCLAW`, and `FPGCLGB`.
5. A choice expires after six months by default.
6. Changing `noticeVersion` invalidates the previous choice and shows the notice again.
7. Global Privacy Control records a local rejection, keeps analytics and detected videos disabled, and leaves settings available.

With `data-google-tag-id` and no competing loader, this runtime uses strict opt-in: the Google script and its network requests do not exist before acceptance. If another integration loads Google first, the runtime applies denied consent and guards future configuration, but Google's advanced consent behavior can still send cookieless pings. It cannot undo requests that were already sent before the runtime loaded.

For Google Consent Mode, the runtime always denies advertising storage, ad user data, and ad personalization. It grants only `analytics_storage`. These Google tag settings do not control the cookies or tracking used by an enabled YouTube iframe.

## YouTube embeds

**Automatic blocking is best effort.** An unchanged iframe's `src` can trigger a request before the runtime or its mutation observer unloads it. YouTube may already have received data or set cookies. The runtime cannot retract those requests, stop every in-flight request, or erase cross-origin YouTube cookies. This feature is not a guarantee of zero pre-consent requests or cookies.

Keep standard embed markup unchanged:

```html
<iframe
  width="560"
  height="315"
  src="https://www.youtube.com/embed/VIDEO_ID"
  title="YouTube video player"
  referrerpolicy="strict-origin-when-cross-origin"
  allowfullscreen
></iframe>
```

The runtime recognizes HTTP(S) `/embed/...` URLs on `youtube.com`, `www.youtube.com`, `youtube-nocookie.com`, and `www.youtube-nocookie.com`. It scans existing frames and observes new frames and source changes, including multiple videos on a page.

- Without a valid agreement, it removes the detected iframe's active URL and places a local, thumbnail-free placeholder over its reserved space. Merely covering a live player would not block loading.
- The **Cookie settings** button opens the original popup. Clicking it does not grant consent or activate a player.
- Agreement restores eligible iframe URLs, including their original playback parameters. The runtime does not add autoplay or simulate Play.
- A returning visitor with valid agreement to the current notice sees videos enabled without another click or an extra runtime-induced navigation.
- Decline, withdrawal, and Global Privacy Control keep or return detected videos to the blocked state. Withdrawal unloads a running player; it does not remove cookies already set by YouTube.
- With JavaScript disabled or this runtime unavailable, the original embeds load normally. If mutation observation is unavailable, the runtime emits `media-observer-unavailable`; initial scans and consent changes still process present frames, but continuous detection is unavailable.

### Scope and integration limits

This version handles standard iframes in the page's light DOM. Standalone thumbnail images, CSS poster backgrounds, preloads/preconnects, YouTube API scripts, lite-player/plugin integrations, frames inside other documents, and private shadow DOM are not managed. `youtube-nocookie.com` is still gated; changing domains is not a substitute for consent.

Blocked frames temporarily live inside an `ets-consent-media` wrapper, which is removed on activation. The same iframe node, author attributes, and URL are retained. Verify your website's layout, especially CSS that depends on an iframe being a direct child. Fixed-size and responsive examples are provided in `preview.html`.

For a strict zero-request requirement, the website must deliver initially inert embed URLs and omit/defer associated remote assets, for example through a CMS/server rewrite plus consent-controlled activation. That integration is not implemented by this automatic detector. No browser-side overlay can make an already-started request unsent.

### Shared choice and notice migration

YouTube uses the existing agreement, not a new category or storage flag. The legacy `purposeDecisions.analytics` boolean controls both analytics and eligible videos; the receipt schema, Azure `AnalyticsAllowed` field, and protocol version remain unchanged.

Version `1.3.0` updates the default notice to `2026-09-18` and describes analytics and embedded videos. Choices saved against the previous notice are invalidated, so visitors must decide again. **If your site overrides notice copy or `noticeVersion`, update those values too before deployment.** Custom legal copy is not rewritten automatically. Supply current translations for the notice, statuses, withdrawal label, and GPC explanation as well as the optional media message.

### Placeholder styling and other providers

The local placeholder loads no thumbnail, external image, font, or provider script. It uses the existing consent theme variables with built-in defaults. Apply shared overrides to both hosts when needed:

```css
ets-cookie-consent,
ets-consent-media {
  --ets-consent-panel-background: #ffffff;
  --ets-consent-panel-color: #383b42;
  --ets-consent-settings-background: #29526e;
}

ets-consent-media::part(media-placeholder) {
  border-radius: 4px;
}
```

The media component exposes `media-placeholder`, `media-message`, and `media-settings-button` parts. Its native button is keyboard operable; closing the settings dialog returns focus to the invoking button when it still exists.

The private `MEDIA_PROVIDERS` table is the extension point for another iframe provider: add its identifier, explicit hostnames, and embed-path matcher, then cover it with the same lifecycle tests. All entries share URL capture, consent activation, unloading, and placeholder behavior. Review notice copy and versioning whenever a provider is added. There is no public plugin registry or provider-specific loading framework.

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
  "decisionAt": "2026-09-18T14:00:00.000Z",
  "expiresAt": "2027-03-18T14:00:00.000Z",
  "locale": "en",
  "noticeVersion": "2026-09-18",
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
| `ets-cookie-consent:statechange` | Shared analytics/video choice changed |
| `ets-cookie-consent:localechange` | Visitor selected another configured locale |
| `ets-cookie-consent:provider-detected` | A Google tag was present before the runtime |
| `ets-cookie-consent:provider-activated` | A configured or detected Google tag was activated |
| `ets-cookie-consent:receipt-sent` | Backend acknowledged a receipt |
| `ets-cookie-consent:receipt-failed` | Receipt failed; detail says whether it is retryable |
| `ets-cookie-consent:receipt-skipped` | Logging is disabled because site ID or endpoint is absent |
| `ets-cookie-consent:storage-unavailable` | Browser local storage could not be read or written |
| `ets-cookie-consent:diagnostic` | Duplicate runtime, invalid config, provider load problem, or unavailable media observation |

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
  "clientDecisionAt": "2026-09-18T14:00:00.000Z",
  "noticeVersion": "2026-09-18",
  "runtimeVersion": "1.3.0",
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

## Development setup and tests

Python 3.11 or 3.12 is recommended for the Function tests. Node.js 20 or newer runs the browser runtime tests without installing packages.

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s .\tests -p "test_*.py" -v
node --test .\tests\test_cookie_consent_runtime.js
```

To run the Function locally, copy `local.settings.example.json` to `local.settings.json`, replace placeholders with organization-approved Azure Storage connection strings, and start it with an approved Azure Functions Core Tools installation:

```powershell
func start
```

The browser runtime itself remains dependency-free.

## Browser smoke check

Use an approved browser and Python's static server:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/preview.html` for the video and settings examples. It includes the supplied unchanged YouTube iframe, an add-video button, a responsive privacy-enhanced embed, and an unrelated local iframe.

From a fresh browser profile, inspect the iframe URLs and Network/Application panels before consent. Detected YouTube frames should lose their active `src` and show local placeholders; the browser may still record initial provider requests or cookies from the detection race. Do not interpret browser third-party-cookie restrictions as proof that the embed did not load.

Open the popup through a video's CTA, decline, reopen, agree, reload with saved agreement, and withdraw while a player is running. Check that all supported videos follow the choice, dynamically added videos use the current state, the local iframe stays unchanged, and keyboard focus and narrow-screen layouts remain usable. Repeat with GPC enabled. Inspect traffic from `youtube.com`, `youtube-nocookie.com`, `ytimg.com`, `googlevideo.com`, and related player endpoints; no remote assets should originate from the placeholder itself.

For configuration-specific checks, use a temporary page with the relevant attributes and verify:

1. The English notice appears with no attributes.
2. `data-position` moves the panel to each supported corner.
3. A second locale creates toggle buttons; a third creates a dropdown.
4. `data-config` overrides text and privacy URL.
5. Agreeing stores the state and reveals the settings button.
6. With `data-google-tag-id`, no Google script or request appears before agreement or after decline, and one appears after agreement.
7. With an existing or late-added `gtag('config', 'G-...')` command or `gtag.js` loader, its `ga-disable-G-...` flag is true before agreement, false after agreement, and true again after withdrawal.
8. With an unavailable receipt endpoint, the local choice still succeeds and a queued receipt remains.
9. Global Privacy Control produces a local rejection and disables acceptance.

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
- `cookie-consent.js` and its regenerated `cookie-consent.min.js` build must be committed at the repository root on the release commit.
- The `runtimeVersion` in `cookie-consent.js` must match the planned release.
- Any legally meaningful change must also have a new `noticeVersion`.
- The maintainer publishing the release must be allowed to push Git tags.

Private repositories cannot use jsDelivr's GitHub CDN endpoint.

Regenerate and check the minified build before tagging:

```powershell
npx --yes terser@5.43.1 .\cookie-consent.js --compress --mangle --output .\cookie-consent.min.js
node --check .\cookie-consent.js
node --check .\cookie-consent.min.js
```

### 2. Create an immutable release tag

After the release changes have been merged into `main`, tag that exact commit:

```powershell
git fetch origin main
git tag -a v1.3.0 -m "chore(release): publish v1.3.0" origin/main
git push origin v1.3.0
```

Use a new semantic version tag for every release. Never move, delete, or force-update a tag that a website may already reference. Creating a GitHub Release from the tag is useful for release notes, but jsDelivr only requires the public repository and Git tag.

### 3. Build the CDN URL

The GitHub URL format is:

```text
https://cdn.jsdelivr.net/gh/<owner>/<repository>@<tag>/<file-path>
```

After publishing the tag, the release URL is:

```text
https://cdn.jsdelivr.net/gh/ETS-Subsidiaries/corporatewebsites-cookieconsent@v1.3.0/cookie-consent.js
```

Requesting that URL is enough for jsDelivr to discover and cache the file. No separate registration or deployment is needed.

### 4. Verify the published file

Run this after pushing the tag:

```powershell
$Url = "https://cdn.jsdelivr.net/gh/ETS-Subsidiaries/corporatewebsites-cookieconsent@v1.3.0/cookie-consent.js"
$Response = Invoke-WebRequest -Uri $Url
$Response.StatusCode
$Response.Headers["Content-Type"]
$Response.Content.Contains("runtimeVersion: '1.3.0'")
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
| `@v1.3.0` | Always serves that release | Production default; deliberate, auditable updates |
| `@<full-commit-sha>` | Always serves that commit | Emergency pinning or pre-release review |
| `@1` | Follows the newest compatible `1.x` tag after CDN cache refresh | Centrally managed sites that have approved automatic minor and patch updates |
| `@main`, `@latest`, or no version | Follows mutable or latest content | Do not use for production consent notices |

An exact tag is safest, but each website must update its script URL to adopt a later release. A major-version alias such as `@1` reduces per-site maintenance, but a new compatible release can reach sites automatically. Select one policy for each entity and document that decision.

### 6. Add the URL to the website

Copy the appropriate example from [Quick start](#quick-start), keep the selected version in the URL, and place the script in the document `<head>` before Google Analytics, Google Ads, Google Tag Manager, or another analytics loader. Publish the CMS or website changes, then confirm in browser developer tools that:

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