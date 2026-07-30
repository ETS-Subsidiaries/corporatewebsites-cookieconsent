(function () {
    'use strict';

    // EDITABLE ENTITY CONFIGURATION
    // Add any number of BCP 47 locale keys. Every locale must provide every field below.
    const CONFIG = {
        runtimeVersion: '1.1.0',
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
                selectorLabel: 'English',
                heading: 'We use cookies',
                body: 'This website uses cookies and other tracking technologies to enable basic functionality of the website, to provide a better experience on the website and to measure and analyze site traffic.',
                acceptLabel: 'I agree',
                declineLabel: 'I decline',
                settingsLabel: 'Cookie settings',
                privacyLabel: 'Privacy policy',
                withdrawLabel: 'Withdraw analytics consent',
                closeLabel: 'Close',
                languageLabel: 'Language',
                statusAccepted: 'Analytics cookies are enabled.',
                statusDeclined: 'Analytics cookies are disabled.',
                gpcMessage: 'Your Global Privacy Control preference is being honored. Analytics remains disabled.'
            }
        }
    };
    // END EDITABLE ENTITY CONFIGURATION

    const RUNTIME_FLAG = '__etsCookieConsentRuntime';
    const API_NAME = 'ETSCookieConsent';
    const EVENT_PREFIX = 'ets-cookie-consent:';
    const PROTOCOL_VERSION = 1;
    const RECEIPT_SOURCES = ['accept', 'decline', 'withdraw', 'gpc'];
    const POSITIONS = ['bottom-left', 'bottom-right', 'top-left', 'top-right'];
    const LOCALE_FIELDS = [
        'selectorLabel', 'heading', 'body', 'acceptLabel', 'declineLabel', 'settingsLabel',
        'privacyLabel', 'withdrawLabel', 'closeLabel', 'languageLabel', 'statusAccepted',
        'statusDeclined', 'gpcMessage'
    ];
    const CONFIG_OVERRIDE_FIELDS = [
        'noticeVersion', 'defaultLocale', 'position', 'consentLifetimeMonths', 'receiptEndpoint',
        'receiptTimeoutMs', 'maxPendingReceipts', 'privacyPolicyUrl', 'locales'
    ];
    const RECEIPT_FIELDS = [
        'receiptId', 'siteId', 'purposeDecisions', 'decisionSource', 'locale',
        'clientDecisionAt', 'noticeVersion', 'runtimeVersion', 'protocolVersion'
    ];
    const MAX_DATA_CONFIG_LENGTH = 32768;
    const STYLES = `
        :host {
            all: initial;
            --ets-consent-z-index: 2147483000;
            --ets-consent-edge-offset: 20px;
            --ets-consent-panel-width: 760px;
            --ets-consent-panel-background: #ffffff;
            --ets-consent-panel-color: #383b42;
            --ets-consent-panel-border: #dee2e8;
            --ets-consent-panel-accent: #008fc4;
            --ets-consent-panel-radius: 4px;
            --ets-consent-panel-padding: 24px;
            --ets-consent-panel-shadow: 0 18px 55px rgba(26, 51, 85, .22);
            --ets-consent-font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif;
            --ets-consent-heading-font-family: Georgia, "Times New Roman", serif;
            --ets-consent-heading-size: 1.55rem;
            --ets-consent-body-size: .96rem;
            --ets-consent-primary-background: #008fc4;
            --ets-consent-primary-color: #fff;
            --ets-consent-primary-hover: #0079a5;
            --ets-consent-secondary-background: transparent;
            --ets-consent-secondary-color: #008fc4;
            --ets-consent-secondary-border: #008fc4;
            --ets-consent-secondary-hover: #d7eef7;
            --ets-consent-settings-background: #29526e;
            --ets-consent-settings-color: #fff;
            --ets-consent-settings-radius: 999px;
            --ets-consent-link-color: #008fc4;
            --ets-consent-focus-color: #008fc4;
            --ets-consent-muted-color: #4b5563;
            color-scheme: light;
        }
        *, *::before, *::after { box-sizing: border-box; }
        .shell {
            color: var(--ets-consent-panel-color);
            font-family: var(--ets-consent-font-family);
            font-size: 16px;
            line-height: 1.5;
        }
        .settings-button {
            align-items: center;
            background: var(--ets-consent-settings-background);
            border: 1px solid color-mix(in srgb, var(--ets-consent-settings-background) 82%, #fff);
            border-radius: var(--ets-consent-settings-radius);
            box-shadow: 0 8px 24px rgba(26, 51, 85, .2);
            color: var(--ets-consent-settings-color);
            cursor: pointer;
            display: inline-flex;
            font: 650 .84rem/1 var(--ets-consent-font-family);
            gap: 8px;
            min-height: 44px;
            padding: 10px 16px;
            position: fixed;
            z-index: var(--ets-consent-z-index);
        }
        .settings-button:hover { filter: brightness(.92); transform: translateY(-1px); }
        .settings-button svg { height: 17px; width: 17px; }
        .panel {
            background:
                linear-gradient(90deg, var(--ets-consent-panel-accent), var(--ets-consent-panel-accent)) top / 100% 4px no-repeat,
                var(--ets-consent-panel-background);
            border: 1px solid var(--ets-consent-panel-border);
            border-radius: var(--ets-consent-panel-radius);
            box-shadow: var(--ets-consent-panel-shadow);
            color: var(--ets-consent-panel-color);
            max-height: calc(100vh - (var(--ets-consent-edge-offset) * 2));
            max-width: calc(100vw - (var(--ets-consent-edge-offset) * 2));
            overflow: auto;
            padding: var(--ets-consent-panel-padding);
            position: fixed;
            width: var(--ets-consent-panel-width);
            z-index: var(--ets-consent-z-index);
            animation: ets-consent-enter 180ms ease-out both;
        }
        .position-bottom-left .settings-button, .position-bottom-left .panel {
            bottom: max(var(--ets-consent-edge-offset), env(safe-area-inset-bottom));
            left: max(var(--ets-consent-edge-offset), env(safe-area-inset-left));
        }
        .position-bottom-right .settings-button, .position-bottom-right .panel {
            bottom: max(var(--ets-consent-edge-offset), env(safe-area-inset-bottom));
            right: max(var(--ets-consent-edge-offset), env(safe-area-inset-right));
        }
        .position-top-left .settings-button, .position-top-left .panel {
            left: max(var(--ets-consent-edge-offset), env(safe-area-inset-left));
            top: max(var(--ets-consent-edge-offset), env(safe-area-inset-top));
        }
        .position-top-right .settings-button, .position-top-right .panel {
            right: max(var(--ets-consent-edge-offset), env(safe-area-inset-right));
            top: max(var(--ets-consent-edge-offset), env(safe-area-inset-top));
        }
        .locale-row {
            align-items: center;
            display: flex;
            justify-content: flex-end;
            margin: 0 0 12px;
        }
        .locale-toggle {
            background: color-mix(in srgb, var(--ets-consent-panel-color) 7%, transparent);
            border: 1px solid color-mix(in srgb, var(--ets-consent-panel-color) 20%, transparent);
            border-radius: 999px;
            display: inline-flex;
            gap: 2px;
            padding: 3px;
        }
        .locale-button {
            background: transparent;
            border: 0;
            border-radius: 999px;
            color: var(--ets-consent-muted-color);
            cursor: pointer;
            font: 650 .78rem/1 var(--ets-consent-font-family);
            min-height: 34px;
            padding: 8px 12px;
        }
        .locale-button[aria-pressed="true"] {
            background: var(--ets-consent-panel-background);
            box-shadow: 0 1px 5px rgba(26, 51, 85, .16);
            color: var(--ets-consent-panel-color);
        }
        .locale-select-label {
            align-items: center;
            color: var(--ets-consent-muted-color);
            display: inline-flex;
            font: 600 .8rem/1.2 var(--ets-consent-font-family);
            gap: 8px;
        }
        .locale-select {
            background: var(--ets-consent-panel-background);
            border: 1px solid var(--ets-consent-panel-border);
            border-radius: 3px;
            color: var(--ets-consent-panel-color);
            font: 600 .84rem/1.2 var(--ets-consent-font-family);
            min-height: 38px;
            padding: 6px 30px 6px 10px;
        }
        h2 {
            color: var(--ets-consent-panel-color);
            font: 700 var(--ets-consent-heading-size)/1.16 var(--ets-consent-heading-font-family);
            letter-spacing: -.015em;
            margin: 0 0 10px;
        }
        .body {
            color: var(--ets-consent-panel-color);
            font: 400 var(--ets-consent-body-size)/1.58 var(--ets-consent-font-family);
            margin: 0;
            max-width: 70ch;
        }
        .privacy {
            color: var(--ets-consent-link-color);
            display: inline-block;
            font: 650 .86rem/1.3 var(--ets-consent-font-family);
            margin-top: 12px;
            text-decoration: underline;
            text-decoration-thickness: 1px;
            text-underline-offset: 3px;
        }
        .privacy:hover { text-decoration-thickness: 2px; }
        .notice, .status {
            border-left: 3px solid var(--ets-consent-panel-accent);
            color: var(--ets-consent-muted-color);
            font: 600 .86rem/1.45 var(--ets-consent-font-family);
            margin: 16px 0 0;
            padding: 8px 12px;
        }
        .actions {
            align-items: stretch;
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 20px;
        }
        .action {
            border-radius: 3px;
            cursor: pointer;
            font: 700 .9rem/1.2 var(--ets-consent-font-family);
            min-height: 46px;
            min-width: 132px;
            padding: 11px 18px;
        }
        .action:disabled { cursor: not-allowed; opacity: .5; }
        .primary {
            background: var(--ets-consent-primary-background);
            border: 2px solid var(--ets-consent-primary-background);
            color: var(--ets-consent-primary-color);
        }
        .primary:hover:not(:disabled) {
            background: var(--ets-consent-primary-hover);
            border-color: var(--ets-consent-primary-hover);
        }
        .secondary {
            background: var(--ets-consent-secondary-background);
            border: 2px solid var(--ets-consent-secondary-border);
            color: var(--ets-consent-secondary-color);
        }
        .secondary:hover:not(:disabled) { background: var(--ets-consent-secondary-hover); }
        button:focus-visible, select:focus-visible, a:focus-visible, .panel:focus-visible {
            outline: 3px solid var(--ets-consent-focus-color);
            outline-offset: 3px;
        }
        @keyframes ets-consent-enter {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 620px) {
            :host {
                --ets-consent-edge-offset: 12px;
                --ets-consent-panel-padding: 20px;
                --ets-consent-heading-size: 1.35rem;
            }
            .panel { width: calc(100vw - 24px); }
            .locale-row { justify-content: flex-start; }
            .locale-toggle { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
            .locale-button { width: 100%; }
            .locale-select-label { align-items: flex-start; flex-direction: column; width: 100%; }
            .locale-select { width: 100%; }
            .actions { display: grid; grid-template-columns: 1fr; }
            .action { width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
            .panel { animation: none; }
            .settings-button:hover { transform: none; }
        }
        @media (forced-colors: active) {
            .panel, .action, .settings-button, .locale-toggle, .locale-select { forced-color-adjust: auto; }
        }
    `;

    function emit(name, detail) {
        document.dispatchEvent(new CustomEvent(EVENT_PREFIX + name, { detail: detail || {} }));
    }

    if (window[RUNTIME_FLAG]) {
        emit('diagnostic', { code: 'duplicate-runtime' });
        return;
    }
    window[RUNTIME_FLAG] = true;

    function text(value, maximum) {
        const normalized = typeof value === 'string' ? value.trim() : '';
        return normalized && normalized.length <= (maximum || 4000) ? normalized : '';
    }

    function normalizeLocale(value) {
        if (typeof value !== 'string' || !value.trim()) return '';
        const parts = value.trim().replace(/_/g, '-').split('-');
        if (!/^[A-Za-z]{2,3}$/.test(parts[0])) return '';
        for (let index = 1; index < parts.length; index += 1) {
            if (!/^[A-Za-z0-9]{2,8}$/.test(parts[index])) return '';
        }
        return parts.map(function (part, index) {
            if (index === 0) return part.toLowerCase();
            if (/^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part)) return part.toUpperCase();
            if (/^[A-Za-z]{4}$/.test(part)) return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            return part.toLowerCase();
        }).join('-');
    }

    function validSiteId(value) {
        return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
    }

    function validGaId(value) {
        return typeof value === 'string' && /^G-[A-Z0-9]{6,}$/i.test(value) ? value.toUpperCase() : '';
    }

    function validSemver(value) {
        return typeof value === 'string' && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
    }

    function validNoticeVersion(value) {
        return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
    }

    function validEndpoint(value) {
        if (typeof value !== 'string' || !value.trim()) return '';
        try {
            const endpoint = new URL(value.trim(), document.baseURI);
            const localHttp = endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].indexOf(endpoint.hostname) >= 0;
            return endpoint.protocol === 'https:' || localHttp ? endpoint.href : '';
        } catch (error) {
            return '';
        }
    }

    function validPrivacyUrl(value) {
        if (typeof value !== 'string' || !value.trim()) return '';
        try {
            const url = new URL(value.trim(), document.baseURI);
            return url.protocol === 'https:' ? url.href : '';
        } catch (error) {
            return '';
        }
    }

    function findRuntimeScript() {
        if (document.currentScript) return document.currentScript;
        const scripts = Array.prototype.slice.call(document.scripts).reverse();
        return scripts.find(function (candidate) {
            return /(?:^|\/)cookie-consent(?:\.min)?\.js(?:[?#]|$)/i.test(candidate.src || '');
        }) || null;
    }

    function hasDataAttribute(script, name) {
        return Boolean(script && typeof script.hasAttribute === 'function' && script.hasAttribute('data-' + name));
    }

    function plainObject(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    }

    function configWithOverrides(rawConfig, script) {
        const merged = Object.assign({}, rawConfig);
        merged.locales = Object.create(null);
        Object.keys(rawConfig.locales || {}).forEach(function (locale) {
            merged.locales[locale] = Object.assign({}, rawConfig.locales[locale]);
        });
        if (!hasDataAttribute(script, 'config')) return { config: merged, diagnostics: [] };

        const rawOverride = script.getAttribute('data-config');
        try {
            if (!rawOverride || rawOverride.length > MAX_DATA_CONFIG_LENGTH) throw new Error('invalid data-config length');
            const override = JSON.parse(rawOverride);
            if (!plainObject(override)) throw new Error('data-config must be an object');
            if (Object.keys(override).some(function (key) { return CONFIG_OVERRIDE_FIELDS.indexOf(key) < 0; })) {
                throw new Error('data-config contains an unsupported key');
            }

            CONFIG_OVERRIDE_FIELDS.filter(function (field) { return field !== 'locales'; }).forEach(function (field) {
                if (Object.prototype.hasOwnProperty.call(override, field)) merged[field] = override[field];
            });

            if (Object.prototype.hasOwnProperty.call(override, 'locales')) {
                if (!plainObject(override.locales)) throw new Error('locales must be an object');
                Object.keys(override.locales).forEach(function (rawLocale) {
                    const locale = normalizeLocale(rawLocale);
                    const localeOverride = override.locales[rawLocale];
                    if (!locale || !plainObject(localeOverride)) throw new Error('locale override is invalid');
                    if (Object.keys(localeOverride).some(function (field) { return LOCALE_FIELDS.indexOf(field) < 0; })) {
                        throw new Error('locale override contains an unsupported key');
                    }
                    const mergedLocale = Object.assign({}, merged.locales[locale] || {}, localeOverride);
                    if (!LOCALE_FIELDS.every(function (field) { return Boolean(text(mergedLocale[field])); })) {
                        throw new Error('new locales must provide every field');
                    }
                    merged.locales[locale] = mergedLocale;
                });
            }
            if (Object.prototype.hasOwnProperty.call(override, 'noticeVersion') && !validNoticeVersion(override.noticeVersion)) {
                throw new Error('noticeVersion override is invalid');
            }
            if (Object.prototype.hasOwnProperty.call(override, 'defaultLocale')) {
                const defaultLocale = normalizeLocale(override.defaultLocale);
                if (!defaultLocale || !merged.locales[defaultLocale]) throw new Error('defaultLocale override is invalid');
            }
            if (Object.prototype.hasOwnProperty.call(override, 'position') && POSITIONS.indexOf(override.position) < 0) {
                throw new Error('position override is invalid');
            }
            if (Object.prototype.hasOwnProperty.call(override, 'consentLifetimeMonths') &&
                (!Number.isInteger(override.consentLifetimeMonths) || override.consentLifetimeMonths < 1 || override.consentLifetimeMonths > 24)) {
                throw new Error('consentLifetimeMonths override is invalid');
            }
            if (Object.prototype.hasOwnProperty.call(override, 'receiptEndpoint') &&
                (typeof override.receiptEndpoint !== 'string' || (override.receiptEndpoint && !validEndpoint(override.receiptEndpoint)))) {
                throw new Error('receiptEndpoint override is invalid');
            }
            if (Object.prototype.hasOwnProperty.call(override, 'receiptTimeoutMs') &&
                (!Number.isInteger(override.receiptTimeoutMs) || override.receiptTimeoutMs < 1000 || override.receiptTimeoutMs > 30000)) {
                throw new Error('receiptTimeoutMs override is invalid');
            }
            if (Object.prototype.hasOwnProperty.call(override, 'maxPendingReceipts') &&
                (!Number.isInteger(override.maxPendingReceipts) || override.maxPendingReceipts < 1 || override.maxPendingReceipts > 25)) {
                throw new Error('maxPendingReceipts override is invalid');
            }
            if (Object.prototype.hasOwnProperty.call(override, 'privacyPolicyUrl') &&
                (typeof override.privacyPolicyUrl !== 'string' || (override.privacyPolicyUrl && !validPrivacyUrl(override.privacyPolicyUrl)))) {
                throw new Error('privacyPolicyUrl override is invalid');
            }
            return { config: merged, diagnostics: [] };
        } catch (error) {
            return { config: rawConfig, diagnostics: ['invalid-data-config'] };
        }
    }

    function normalizeConfig(rawConfig, script) {
        const locales = {};
        Object.keys(rawConfig.locales || {}).forEach(function (rawLocale) {
            const locale = normalizeLocale(rawLocale);
            const copy = rawConfig.locales[rawLocale];
            if (!locale || !copy || typeof copy !== 'object') return;
            const normalizedCopy = {};
            const isComplete = LOCALE_FIELDS.every(function (field) {
                normalizedCopy[field] = text(copy[field]);
                return Boolean(normalizedCopy[field]);
            });
            if (isComplete) locales[locale] = normalizedCopy;
        });
        const localeKeys = Object.keys(locales);
        if (!localeKeys.length) throw new Error('No complete locale configuration is available.');

        const configuredDefault = normalizeLocale(rawConfig.defaultLocale);
        const defaultLocale = locales[configuredDefault] ? configuredDefault : locales.en ? 'en' : localeKeys[0];
        const rawSiteId = script && script.dataset ? text(script.dataset.siteId, 128) : '';
        const rawGaId = script && script.dataset ? text(script.dataset.gaId, 32) : '';
        const endpointValue = hasDataAttribute(script, 'receipt-endpoint') ? script.dataset.receiptEndpoint : rawConfig.receiptEndpoint;
        const positionValue = hasDataAttribute(script, 'position') ? script.dataset.position : rawConfig.position;
        const endpoint = validEndpoint(endpointValue);
        const diagnostics = [];

        if (rawSiteId && !validSiteId(rawSiteId)) diagnostics.push('invalid-site-id');
        if (rawGaId && !validGaId(rawGaId)) diagnostics.push('invalid-ga-id');
        if (text(endpointValue) && !endpoint) diagnostics.push('invalid-receipt-endpoint');
        if (positionValue !== undefined && positionValue !== '' && POSITIONS.indexOf(positionValue) < 0) diagnostics.push('invalid-position');
        if (!validSemver(rawConfig.runtimeVersion)) throw new Error('runtimeVersion must use semantic versioning.');
        if (rawConfig.protocolVersion !== PROTOCOL_VERSION) throw new Error('protocolVersion is not supported.');
        if (!validNoticeVersion(rawConfig.noticeVersion)) throw new Error('noticeVersion is invalid.');

        return {
            runtimeVersion: rawConfig.runtimeVersion,
            protocolVersion: PROTOCOL_VERSION,
            noticeVersion: rawConfig.noticeVersion,
            defaultLocale: defaultLocale,
            position: POSITIONS.indexOf(positionValue) >= 0 ? positionValue : 'bottom-left',
            consentLifetimeMonths: Number.isInteger(rawConfig.consentLifetimeMonths) && rawConfig.consentLifetimeMonths > 0 && rawConfig.consentLifetimeMonths <= 24 ? rawConfig.consentLifetimeMonths : 6,
            receiptEndpoint: endpoint,
            receiptTimeoutMs: Number.isInteger(rawConfig.receiptTimeoutMs) && rawConfig.receiptTimeoutMs >= 1000 && rawConfig.receiptTimeoutMs <= 30000 ? rawConfig.receiptTimeoutMs : 4000,
            maxPendingReceipts: Number.isInteger(rawConfig.maxPendingReceipts) && rawConfig.maxPendingReceipts > 0 ? Math.min(rawConfig.maxPendingReceipts, 25) : 10,
            privacyPolicyUrl: validPrivacyUrl(rawConfig.privacyPolicyUrl),
            locales: locales,
            siteId: validSiteId(rawSiteId) ? rawSiteId : '',
            gaId: validGaId(rawGaId),
            diagnostics: diagnostics
        };
    }

    function createId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        const bytes = new Uint8Array(16);
        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            window.crypto.getRandomValues(bytes);
        } else {
            for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
        }
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        return Array.prototype.map.call(bytes, function (byte, index) {
            const value = byte.toString(16).padStart(2, '0');
            return [4, 6, 8, 10].indexOf(index) >= 0 ? '-' + value : value;
        }).join('');
    }

    function expiresAt(months, decisionAt) {
        const expiry = new Date(decisionAt);
        const originalDay = expiry.getUTCDate();
        expiry.setUTCDate(1);
        expiry.setUTCMonth(expiry.getUTCMonth() + months);
        const lastDay = new Date(Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth() + 1, 0)).getUTCDate();
        expiry.setUTCDate(Math.min(originalDay, lastDay));
        return expiry.toISOString();
    }

    function consentCommand(value) {
        return {
            analytics_storage: value,
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied'
        };
    }

    function installDeniedConsentDefault() {
        window.dataLayer = window.dataLayer || [];
        window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
        window.gtag('consent', 'default', Object.assign({ wait_for_update: 500 }, consentCommand('denied')));
        window.gtag('set', 'ads_data_redaction', true);
    }

    function gaIdFromGtagScript(script) {
        if (!script || !script.src) return '';
        try {
            const source = new URL(script.src, document.baseURI);
            if (['www.googletagmanager.com', 'googletagmanager.com'].indexOf(source.hostname) < 0 || source.pathname !== '/gtag/js') {
                return '';
            }
            return validGaId(source.searchParams.get('id'));
        } catch (error) {
            return '';
        }
    }

    function hasGtagLoader(measurementId) {
        return Array.prototype.some.call(document.scripts, function (script) {
            return gaIdFromGtagScript(script) === measurementId;
        });
    }

    function dataLayerCommand(entry) {
        return entry && typeof entry.length === 'number' ? Array.prototype.slice.call(entry) : [];
    }

    function preloadedGaIds() {
        const ids = new Set();
        Array.prototype.forEach.call(document.scripts, function (script) {
            const id = gaIdFromGtagScript(script);
            if (id) ids.add(id);
        });
        if (Array.isArray(window.dataLayer)) {
            window.dataLayer.forEach(function (entry) {
                const command = dataLayerCommand(entry);
                if (command[0] === 'config') {
                    const id = validGaId(command[1]);
                    if (id) ids.add(id);
                }
            });
        }
        return Array.from(ids);
    }

    class JsonStorage {
        constructor(namespace) {
            this.prefix = 'ets-cookie-consent:' + namespace + ':';
        }

        read(name) {
            try {
                const value = window.localStorage.getItem(this.prefix + name);
                return value ? JSON.parse(value) : null;
            } catch (error) {
                emit('storage-unavailable', { operation: 'read' });
                return null;
            }
        }

        write(name, value) {
            try {
                window.localStorage.setItem(this.prefix + name, JSON.stringify(value));
                return true;
            } catch (error) {
                emit('storage-unavailable', { operation: 'write' });
                return false;
            }
        }

        remove(name) {
            try {
                window.localStorage.removeItem(this.prefix + name);
            } catch (error) {
                emit('storage-unavailable', { operation: 'remove' });
            }
        }
    }

    function cookieIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.8');
        svg.setAttribute('aria-hidden', 'true');
        const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        outline.setAttribute('d', 'M20.6 13.2A8.9 8.9 0 0 1 10.8 3.4 9 9 0 1 0 20.6 13.2Z');
        const dots = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        dots.setAttribute('d', 'M8.2 12.1h.01M12.1 16h.01M7.5 17.1h.01');
        dots.setAttribute('stroke-linecap', 'round');
        dots.setAttribute('stroke-width', '3');
        svg.append(outline, dots);
        return svg;
    }

    class ConsentElement extends HTMLElement {
        constructor() {
            super();
            this.controller = null;
            this.attachShadow({ mode: 'open' });
        }

        setController(controller) {
            this.controller = controller;
            this.render();
        }

        connectedCallback() {
            this.render();
        }

        actionButton(label, className, part, handler, disabled) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'action ' + className;
            button.setAttribute('part', 'action-button ' + part);
            button.textContent = label;
            button.disabled = Boolean(disabled);
            button.addEventListener('click', handler);
            return button;
        }

        localeControls(controller, copy) {
            const locales = Object.keys(controller.config.locales);
            if (locales.length <= 1) return null;
            const row = document.createElement('div');
            row.className = 'locale-row';
            row.setAttribute('part', 'locale-controls');

            if (locales.length === 2) {
                const group = document.createElement('div');
                group.className = 'locale-toggle';
                group.setAttribute('role', 'group');
                group.setAttribute('aria-label', copy.languageLabel);
                locales.forEach(function (locale) {
                    const button = document.createElement('button');
                    const isActive = locale === controller.locale;
                    button.type = 'button';
                    button.className = 'locale-button';
                    button.setAttribute('part', isActive ? 'locale-button active-locale' : 'locale-button');
                    button.setAttribute('aria-pressed', String(isActive));
                    button.dataset.locale = locale;
                    button.textContent = controller.config.locales[locale].selectorLabel;
                    button.addEventListener('click', function () { controller.setLocale(locale, true); });
                    group.appendChild(button);
                });
                row.appendChild(group);
                return row;
            }

            const label = document.createElement('label');
            label.className = 'locale-select-label';
            label.setAttribute('part', 'locale-label');
            const labelText = document.createElement('span');
            labelText.textContent = copy.languageLabel;
            const select = document.createElement('select');
            select.className = 'locale-select';
            select.setAttribute('part', 'locale-select');
            select.setAttribute('aria-label', copy.languageLabel);
            locales.forEach(function (locale) {
                const option = document.createElement('option');
                option.value = locale;
                option.textContent = controller.config.locales[locale].selectorLabel;
                option.selected = locale === controller.locale;
                select.appendChild(option);
            });
            select.addEventListener('change', function () { controller.setLocale(select.value, true); });
            label.append(labelText, select);
            row.appendChild(label);
            return row;
        }

        render() {
            if (!this.shadowRoot || !this.controller) return;
            const controller = this.controller;
            const copy = controller.copy();
            const style = document.createElement('style');
            style.textContent = STYLES;
            const shell = document.createElement('div');
            shell.className = 'shell position-' + controller.config.position;

            if (controller.mode === 'closed') {
                const settings = document.createElement('button');
                settings.type = 'button';
                settings.className = 'settings-button';
                settings.setAttribute('part', 'settings-button');
                settings.setAttribute('aria-haspopup', 'dialog');
                settings.setAttribute('aria-label', copy.settingsLabel);
                settings.append(cookieIcon(), document.createTextNode(copy.settingsLabel));
                settings.addEventListener('click', function () { controller.openSettings(); });
                shell.appendChild(settings);
                this.shadowRoot.replaceChildren(style, shell);
                controller.applyPendingFocus();
                return;
            }

            const panel = document.createElement('section');
            panel.className = 'panel';
            panel.setAttribute('part', 'panel');
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'false');
            panel.setAttribute('aria-labelledby', 'ets-consent-heading');
            panel.setAttribute('lang', controller.locale);
            panel.setAttribute('tabindex', '-1');
            panel.addEventListener('keydown', function (event) {
                if (event.key === 'Escape') controller.closeSettings();
            });

            const localeControls = this.localeControls(controller, copy);
            if (localeControls) panel.appendChild(localeControls);

            const heading = document.createElement('h2');
            heading.id = 'ets-consent-heading';
            heading.setAttribute('part', 'heading');
            heading.textContent = copy.heading;
            panel.appendChild(heading);

            const body = document.createElement('p');
            body.className = 'body';
            body.setAttribute('part', 'body');
            body.textContent = copy.body;
            panel.appendChild(body);

            if (controller.config.privacyPolicyUrl) {
                const privacy = document.createElement('a');
                privacy.className = 'privacy';
                privacy.setAttribute('part', 'privacy-link');
                privacy.href = controller.config.privacyPolicyUrl;
                privacy.target = '_blank';
                privacy.rel = 'noopener noreferrer';
                privacy.textContent = copy.privacyLabel;
                panel.appendChild(privacy);
            }

            if (controller.gpc) {
                const gpc = document.createElement('p');
                gpc.className = 'notice';
                gpc.setAttribute('part', 'notice gpc-notice');
                gpc.setAttribute('role', 'status');
                gpc.textContent = copy.gpcMessage;
                panel.appendChild(gpc);
            }

            if (controller.mode === 'settings' && controller.state) {
                const status = document.createElement('p');
                status.className = 'status';
                status.setAttribute('part', 'status');
                status.setAttribute('aria-live', 'polite');
                status.textContent = controller.state.purposeDecisions.analytics ? copy.statusAccepted : copy.statusDeclined;
                panel.appendChild(status);
            }

            const actions = document.createElement('div');
            actions.className = 'actions';
            actions.setAttribute('part', 'actions');

            if (controller.mode === 'prompt') {
                actions.append(
                    this.actionButton(copy.declineLabel, 'secondary', 'decline-button', function () {
                        controller.decide(false, 'decline');
                    }),
                    this.actionButton(copy.acceptLabel, 'primary', 'accept-button', function () {
                        controller.decide(true, 'accept');
                    }, controller.gpc)
                );
            } else {
                if (controller.state && controller.state.purposeDecisions.analytics) {
                    actions.appendChild(this.actionButton(copy.withdrawLabel, 'secondary', 'withdraw-button', function () {
                        controller.decide(false, 'withdraw');
                    }));
                } else {
                    actions.appendChild(this.actionButton(copy.acceptLabel, 'primary', 'accept-button', function () {
                        controller.decide(true, 'accept');
                    }, controller.gpc));
                }
                actions.appendChild(this.actionButton(copy.closeLabel, 'secondary', 'close-button', function () {
                    controller.closeSettings();
                }));
            }

            panel.appendChild(actions);
            shell.appendChild(panel);
            this.shadowRoot.replaceChildren(style, shell);
            controller.applyPendingFocus();
        }
    }

    class ConsentController {
        constructor(config) {
            this.config = config;
            this.gpc = navigator.globalPrivacyControl === true;
            this.storage = new JsonStorage(config.siteId || 'default');
            this.locale = this.resolveLocale();
            this.state = this.loadState();
            this.receiptQueue = this.loadReceiptQueue();
            this.receiptInFlight = false;
            this.mode = this.state ? 'closed' : 'prompt';
            this.pendingFocus = '';
            this.returnFocus = null;
            this.configuredGaIds = new Set();
            this.knownGaIds = new Set();
            (config.preloadedGaIds || []).forEach(this.registerKnownGaId.bind(this));
            this.registerKnownGaId(config.gaId);
            this.element = document.createElement('ets-cookie-consent');
            this.element.setController(this);

            this.installGa4Guards();
            this.denyAnalytics();
            if (!this.state || !this.state.purposeDecisions.analytics) this.removeGaCookies();
            if (this.gpc && (!this.state || this.state.purposeDecisions.analytics)) {
                this.decide(false, 'gpc', true);
            } else if (this.state && this.state.purposeDecisions.analytics) {
                this.grantAnalytics();
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', this.mount.bind(this), { once: true });
            } else {
                this.mount();
            }
            window.addEventListener('online', this.flushReceipts.bind(this));
        }

        mount() {
            if (!this.element.isConnected) document.body.appendChild(this.element);
            this.element.render();
            this.flushReceipts();
        }

        copy() {
            return this.config.locales[this.locale] || this.config.locales[this.config.defaultLocale];
        }

        analyticsAllowed() {
            return Boolean(!this.gpc && this.state && this.state.purposeDecisions.analytics);
        }

        registerKnownGaId(value) {
            const measurementId = validGaId(value);
            if (!measurementId) return '';
            this.knownGaIds.add(measurementId);
            if (!this.analyticsAllowed()) window['ga-disable-' + measurementId] = true;
            return measurementId;
        }

        installDataLayerGuard() {
            const dataLayer = window.dataLayer;
            if (!Array.isArray(dataLayer) || typeof dataLayer.push !== 'function') return;
            const push = dataLayer.push;
            const controller = this;
            dataLayer.push = function () {
                Array.prototype.forEach.call(arguments, function (entry) {
                    const command = dataLayerCommand(entry);
                    // Set the per-ID Google flag before a loaded tag processes a new config command.
                    if (command[0] === 'config') controller.registerKnownGaId(command[1]);
                });
                return push.apply(this, arguments);
            };
        }

        inspectGa4Node(node) {
            if (!node || node.nodeType !== 1) return;
            const scripts = node.tagName === 'SCRIPT'
                ? [node]
                : typeof node.querySelectorAll === 'function'
                    ? Array.prototype.slice.call(node.querySelectorAll('script'))
                    : [];
            scripts.forEach(function (script) {
                this.registerKnownGaId(gaIdFromGtagScript(script));
            }.bind(this));
        }

        observeGa4Loaders() {
            if (typeof window.MutationObserver !== 'function' || !document.documentElement) return;
            const inspect = this.inspectGa4Node.bind(this);
            this.ga4LoaderObserver = new window.MutationObserver(function (records) {
                records.forEach(function (record) {
                    if (record.type === 'attributes') {
                        if (record.target.tagName === 'SCRIPT') inspect(record.target);
                        return;
                    }
                    Array.prototype.forEach.call(record.addedNodes, inspect);
                });
            });
            this.ga4LoaderObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['src'],
                childList: true,
                subtree: true
            });
        }

        installGa4Guards() {
            this.installDataLayerGuard();
            this.observeGa4Loaders();
        }

        resolveLocale() {
            const locales = Object.keys(this.config.locales);
            const saved = normalizeLocale(this.storage.read('locale'));
            if (saved && this.config.locales[saved]) return saved;
            const candidates = [];
            Array.prototype.push.apply(candidates, navigator.languages || [navigator.language || '']);
            if (document.documentElement.lang) candidates.push(document.documentElement.lang);
            for (let index = 0; index < candidates.length; index += 1) {
                const candidate = normalizeLocale(candidates[index]);
                if (this.config.locales[candidate]) return candidate;
                const base = candidate.split('-')[0];
                const match = locales.find(function (locale) { return locale.split('-')[0] === base; });
                if (match) return match;
            }
            return this.config.locales.en ? 'en' : this.config.defaultLocale;
        }

        setLocale(locale, focusControl) {
            const normalized = normalizeLocale(locale);
            if (!this.config.locales[normalized]) return false;
            this.locale = normalized;
            this.storage.write('locale', normalized);
            this.pendingFocus = focusControl ? 'locale' : '';
            this.element.render();
            emit('localechange', { locale: normalized });
            return true;
        }

        validState(state) {
            if (!state || typeof state !== 'object') return false;
            if (state.protocolVersion !== PROTOCOL_VERSION || state.noticeVersion !== this.config.noticeVersion) return false;
            if (!state.purposeDecisions || typeof state.purposeDecisions.analytics !== 'boolean') return false;
            if (RECEIPT_SOURCES.indexOf(state.decisionSource) < 0) return false;
            if ((state.decisionSource === 'accept') !== state.purposeDecisions.analytics) return false;
            if (typeof state.expiresAt !== 'string' || !Number.isFinite(Date.parse(state.expiresAt)) || Date.parse(state.expiresAt) <= Date.now()) return false;
            return typeof state.decisionAt === 'string' && Number.isFinite(Date.parse(state.decisionAt));
        }

        loadState() {
            const state = this.storage.read('state');
            if (this.validState(state)) return state;
            if (state) this.storage.remove('state');
            return null;
        }

        validReceipt(payload) {
            if (!payload || typeof payload !== 'object') return false;
            const source = payload.decisionSource;
            return Object.keys(payload).length === RECEIPT_FIELDS.length &&
                RECEIPT_FIELDS.every(function (field) { return Object.prototype.hasOwnProperty.call(payload, field); }) &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.receiptId || '') &&
                payload.siteId === this.config.siteId &&
                payload.purposeDecisions && Object.keys(payload.purposeDecisions).length === 1 &&
                typeof payload.purposeDecisions.analytics === 'boolean' &&
                RECEIPT_SOURCES.indexOf(source) >= 0 &&
                ((source === 'accept') === payload.purposeDecisions.analytics) &&
                Boolean(normalizeLocale(payload.locale)) &&
                typeof payload.clientDecisionAt === 'string' && Number.isFinite(Date.parse(payload.clientDecisionAt)) &&
                validNoticeVersion(payload.noticeVersion) &&
                validSemver(payload.runtimeVersion) && payload.protocolVersion === PROTOCOL_VERSION;
        }

        loadReceiptQueue() {
            const queue = this.storage.read('receipt-queue');
            if (!Array.isArray(queue)) return [];
            return queue.filter(this.validReceipt.bind(this)).slice(-this.config.maxPendingReceipts);
        }

        publicState() {
            if (!this.state) return null;
            return {
                purposeDecisions: { analytics: this.state.purposeDecisions.analytics },
                decisionSource: this.state.decisionSource,
                decisionAt: this.state.decisionAt,
                expiresAt: this.state.expiresAt,
                locale: this.state.locale,
                noticeVersion: this.state.noticeVersion,
                globalPrivacyControl: this.gpc
            };
        }

        buildReceipt(decision, source, decisionAt) {
            return {
                receiptId: createId(),
                siteId: this.config.siteId,
                purposeDecisions: { analytics: decision },
                decisionSource: source,
                locale: this.locale,
                clientDecisionAt: decisionAt,
                noticeVersion: this.config.noticeVersion,
                runtimeVersion: this.config.runtimeVersion,
                protocolVersion: PROTOCOL_VERSION
            };
        }

        decide(decision, source, initializing) {
            if (source === 'accept' && this.gpc) return;
            if (RECEIPT_SOURCES.indexOf(source) < 0 || ((source === 'accept') !== decision)) return;
            const decisionAt = new Date().toISOString();
            this.state = {
                protocolVersion: PROTOCOL_VERSION,
                noticeVersion: this.config.noticeVersion,
                purposeDecisions: { analytics: decision },
                decisionSource: source,
                decisionAt: decisionAt,
                expiresAt: expiresAt(this.config.consentLifetimeMonths, decisionAt),
                locale: this.locale
            };
            this.storage.write('state', this.state);
            this.storage.write('locale', this.locale);
            this.mode = 'closed';

            if (decision) {
                this.grantAnalytics();
            } else {
                this.denyAnalytics();
                this.removeGaCookies();
            }

            this.queueReceipt(decision, source, decisionAt);
            if (!initializing) this.pendingFocus = 'settings';
            this.element.render();
            emit('statechange', this.publicState());
        }

        refreshKnownGaIds() {
            preloadedGaIds().forEach(function (measurementId) {
                this.registerKnownGaId(measurementId);
            }.bind(this));
            this.registerKnownGaId(this.config.gaId);
            return Array.from(this.knownGaIds);
        }

        denyAnalytics() {
            this.refreshKnownGaIds().forEach(function (measurementId) {
                window['ga-disable-' + measurementId] = true;
            });
            if (typeof window.gtag === 'function') window.gtag('consent', 'update', consentCommand('denied'));
        }

        grantAnalytics() {
            if (this.gpc || !this.state || !this.state.purposeDecisions.analytics) return;
            const measurementIds = this.refreshKnownGaIds();
            measurementIds.forEach(function (measurementId) {
                window['ga-disable-' + measurementId] = false;
            });
            window.gtag('consent', 'update', consentCommand('granted'));
            measurementIds.forEach(this.activateGa4.bind(this));
        }

        activateGa4(measurementId) {
            if (this.configuredGaIds.has(measurementId)) return;
            this.configuredGaIds.add(measurementId);

            const configure = function () {
                window.gtag('js', new Date());
                window.gtag('config', measurementId, {
                    allow_google_signals: false,
                    allow_ad_personalization_signals: false
                });
                emit('provider-activated', { provider: 'ga4', measurementId: measurementId });
            };
            if (hasGtagLoader(measurementId)) {
                configure();
                return;
            }
            const script = document.createElement('script');
            script.async = true;
            script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
            script.addEventListener('load', configure, { once: true });
            script.addEventListener('error', function () {
                this.configuredGaIds.delete(measurementId);
                emit('diagnostic', { code: 'ga4-load-failed', provider: 'ga4' });
            }.bind(this), { once: true });
            document.head.appendChild(script);
        }

        removeGaCookies() {
            const names = document.cookie.split(';').map(function (item) {
                return item.trim().split('=')[0];
            }).filter(function (name) {
                return /^_(?:ga(?:_.+)?|gid|gat(?:_.+)?)$/i.test(name);
            });
            if (!names.length) return;
            const hostnameParts = location.hostname.split('.');
            const domains = [''];
            for (let index = 0; index < hostnameParts.length - 1; index += 1) {
                domains.push('.' + hostnameParts.slice(index).join('.'));
            }
            names.forEach(function (name) {
                domains.forEach(function (domain) {
                    const domainAttribute = domain ? '; Domain=' + domain : '';
                    document.cookie = name + '=; Max-Age=0; Path=/' + domainAttribute + '; SameSite=Lax';
                });
            });
        }

        queueReceipt(decision, source, decisionAt) {
            if (!this.config.siteId || !this.config.receiptEndpoint) {
                emit('receipt-skipped', {
                    reason: !this.config.siteId ? 'missing-site-id' : 'missing-receipt-endpoint'
                });
                return;
            }
            const receipt = this.buildReceipt(decision, source, decisionAt);
            this.receiptQueue.push(receipt);
            this.receiptQueue = this.receiptQueue.slice(-this.config.maxPendingReceipts);
            this.storage.write('receipt-queue', this.receiptQueue);
            this.flushReceipts();
        }

        receiptUrl() {
            const url = new URL(this.config.receiptEndpoint);
            url.searchParams.set('siteId', this.config.siteId);
            return url.href;
        }

        async sendReceipt(payload) {
            if (typeof window.fetch !== 'function') return { retryable: true, code: 'fetch-unavailable' };
            const controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
            const timeout = controller ? window.setTimeout(function () { controller.abort(); }, this.config.receiptTimeoutMs) : null;
            try {
                const response = await window.fetch(this.receiptUrl(), {
                    method: 'POST',
                    mode: 'cors',
                    credentials: 'omit',
                    cache: 'no-store',
                    referrerPolicy: 'no-referrer',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller ? controller.signal : undefined
                });
                if (!response.ok) {
                    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
                    return { retryable: retryable, code: 'http-' + response.status };
                }
                let acknowledgement;
                try {
                    acknowledgement = await response.json();
                } catch (error) {
                    return { retryable: true, code: 'invalid-acknowledgement' };
                }
                const validAcknowledgement = acknowledgement && acknowledgement.receiptId === payload.receiptId &&
                    acknowledgement.siteId === payload.siteId &&
                    acknowledgement.purposeDecisions &&
                    acknowledgement.purposeDecisions.analytics === payload.purposeDecisions.analytics &&
                    typeof acknowledgement.serverReceivedAt === 'string' &&
                    Number.isFinite(Date.parse(acknowledgement.serverReceivedAt));
                return validAcknowledgement ? { sent: true } : { retryable: true, code: 'invalid-acknowledgement' };
            } catch (error) {
                return { retryable: true, code: error && error.name === 'AbortError' ? 'timeout' : 'network' };
            } finally {
                if (timeout !== null) window.clearTimeout(timeout);
            }
        }

        async flushReceipts() {
            if (this.receiptInFlight || !this.config.siteId || !this.config.receiptEndpoint || !this.receiptQueue.length) return;
            if (navigator.onLine === false) return;
            this.receiptInFlight = true;
            try {
                while (this.receiptQueue.length) {
                    const receipt = this.receiptQueue[0];
                    const result = await this.sendReceipt(receipt);
                    if (result.sent) {
                        this.receiptQueue.shift();
                        this.storage.write('receipt-queue', this.receiptQueue);
                        emit('receipt-sent', { receiptId: receipt.receiptId });
                        continue;
                    }
                    emit('receipt-failed', {
                        receiptId: receipt.receiptId,
                        retryable: Boolean(result.retryable),
                        code: result.code
                    });
                    if (result.retryable) break;
                    this.receiptQueue.shift();
                    this.storage.write('receipt-queue', this.receiptQueue);
                }
            } finally {
                this.receiptInFlight = false;
            }
        }

        openSettings() {
            if (!this.state) {
                this.mode = 'prompt';
            } else {
                this.mode = 'settings';
            }
            this.returnFocus = this.element.shadowRoot && this.element.shadowRoot.activeElement;
            this.pendingFocus = 'panel';
            this.element.render();
        }

        closeSettings() {
            if (!this.state || this.mode === 'prompt') return;
            this.mode = 'closed';
            this.pendingFocus = 'return';
            this.element.render();
        }

        applyPendingFocus() {
            if (!this.pendingFocus || !this.element.shadowRoot) return;
            const focusRequest = this.pendingFocus;
            this.pendingFocus = '';
            const shadowRoot = this.element.shadowRoot;
            Promise.resolve().then(function () {
                let target = null;
                if (focusRequest === 'panel') target = shadowRoot.querySelector('.panel');
                if (focusRequest === 'settings') target = shadowRoot.querySelector('.settings-button');
                if (focusRequest === 'locale') {
                    target = shadowRoot.querySelector('.locale-button[aria-pressed="true"]') || shadowRoot.querySelector('.locale-select');
                }
                if (focusRequest === 'return') {
                    target = this.returnFocus && this.returnFocus.isConnected ? this.returnFocus : shadowRoot.querySelector('.settings-button');
                }
                if (target && typeof target.focus === 'function') target.focus();
            }.bind(this));
        }
    }

    installDeniedConsentDefault();
    const preloaded = preloadedGaIds();
    if (preloaded.length) emit('provider-detected', { provider: 'ga4', measurementIds: preloaded });

    let runtimeConfig;
    try {
        const runtimeScript = findRuntimeScript();
        const configured = configWithOverrides(CONFIG, runtimeScript);
        try {
            runtimeConfig = normalizeConfig(configured.config, runtimeScript);
        } catch (error) {
            if (!hasDataAttribute(runtimeScript, 'config')) throw error;
            runtimeConfig = normalizeConfig(CONFIG, runtimeScript);
            if (configured.diagnostics.indexOf('invalid-data-config') < 0) configured.diagnostics.push('invalid-data-config');
        }
        runtimeConfig.diagnostics = configured.diagnostics.concat(runtimeConfig.diagnostics);
    } catch (error) {
        emit('diagnostic', { code: 'invalid-configuration' });
        return;
    }
    runtimeConfig.preloadedGaIds = preloaded;
    runtimeConfig.diagnostics.forEach(function (code) { emit('diagnostic', { code: code }); });

    if (!window.customElements.get('ets-cookie-consent')) {
        window.customElements.define('ets-cookie-consent', ConsentElement);
    }
    const controller = new ConsentController(runtimeConfig);
    window[API_NAME] = Object.freeze({
        version: runtimeConfig.runtimeVersion,
        openSettings: controller.openSettings.bind(controller),
        getState: controller.publicState.bind(controller),
        setLocale: controller.setLocale.bind(controller)
    });
}());
