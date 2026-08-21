'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const runtimeSources = {
    source: fs.readFileSync(path.join(__dirname, '..', 'cookie-consent.js'), 'utf8'),
    minified: fs.readFileSync(path.join(__dirname, '..', 'cookie-consent.min.js'), 'utf8')
};

function dataName(name) {
    return name.slice(5).replace(/-([a-z])/g, function (_, letter) {
        return letter.toUpperCase();
    });
}

class FakeEventTarget {
    constructor() {
        this.listeners = Object.create(null);
    }

    addEventListener(type, listener) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(listener);
    }

    dispatchEvent(event) {
        (this.listeners[event.type] || []).slice().forEach(function (listener) {
            listener.call(this, event);
        }, this);
        return true;
    }
}

class FakeNode extends FakeEventTarget {
    constructor(tagName) {
        super();
        this.tagName = String(tagName || '').toUpperCase();
        this.nodeType = 1;
        this.children = [];
        this.attributes = Object.create(null);
        this.dataset = Object.create(null);
        this.className = '';
        this.isConnected = false;
        this.shadowRoot = null;
        this.textContent = '';
        this.src = '';
        this.classList = {
            toggle: function (name, force) {
                const names = this.className.split(/\s+/).filter(Boolean);
                const present = names.indexOf(name) >= 0;
                if (force && !present) names.push(name);
                if (!force && present) names.splice(names.indexOf(name), 1);
                this.className = names.join(' ');
            }.bind(this)
        };
    }

    setAttribute(name, value) {
        const normalized = String(value);
        this.attributes[name] = normalized;
        if (name.indexOf('data-') === 0) this.dataset[dataName(name)] = normalized;
    }

    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name)
            ? this.attributes[name]
            : null;
    }

    hasAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name);
    }

    append() {
        Array.prototype.forEach.call(arguments, this.appendChild.bind(this));
    }

    appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        child.isConnected = this.isConnected;
        if (child.isConnected && typeof child.connectedCallback === 'function') {
            child.connectedCallback();
        }
        return child;
    }

    replaceChildren() {
        this.children = [];
        this.append.apply(this, arguments);
    }

    attachShadow() {
        this.shadowRoot = new FakeNode('shadow-root');
        this.shadowRoot.host = this;
        return this.shadowRoot;
    }

    querySelectorAll(selector) {
        const matches = [];
        function visit(node) {
            node.children.forEach(function (child) {
                if (selector === 'script' && child.tagName === 'SCRIPT') matches.push(child);
                visit(child);
            });
        }
        visit(this);
        return matches;
    }

    querySelector(selector) {
        let match = null;
        function visit(node) {
            if (match) return;
            node.children.forEach(function (child) {
                if (match) return;
                const classMatch = selector.match(/^\.([a-z0-9-]+)/i);
                const hasClass = classMatch &&
                    child.className.split(/\s+/).indexOf(classMatch[1]) >= 0;
                const pressedMatch = selector.match(/\[aria-pressed="([^"]+)"\]/);
                const hasPressedValue = !pressedMatch ||
                    child.getAttribute('aria-pressed') === pressedMatch[1];
                if (hasClass && hasPressedValue) {
                    match = child;
                    return;
                }
                visit(child);
            });
        }
        visit(this);
        return match;
    }

    focus() {}

    click() {
        this.dispatchEvent({ type: 'click', target: this });
    }
}

class FakeHTMLElement extends FakeNode {
    constructor() {
        super('ets-cookie-consent');
    }
}

function findPart(node, part) {
    if ((node.getAttribute('part') || '').split(/\s+/).indexOf(part) >= 0) return node;
    for (const child of node.children) {
        const match = findPart(child, part);
        if (match) return match;
    }
    return null;
}

function createRuntime(options, runtimeSource) {
    const settings = options || {};
    const registry = new Map();
    const events = [];
    const storage = new Map();
    const document = new FakeEventTarget();
    const currentScript = new FakeNode('script');
    currentScript.src = 'https://cdn.example.test/cookie-consent.js';
    if (settings.googleTagId) {
        currentScript.setAttribute('data-google-tag-id', settings.googleTagId);
    }
    if (settings.gaId) currentScript.setAttribute('data-ga-id', settings.gaId);

    document.baseURI = 'https://www.example.test/';
    document.cookieWrites = [];
    Object.defineProperty(document, 'cookie', {
        get: function () { return settings.cookie || ''; },
        set: function (value) { document.cookieWrites.push(value); }
    });
    document.currentScript = currentScript;
    document.readyState = 'complete';
    document.documentElement = new FakeNode('html');
    document.documentElement.lang = 'en';
    document.head = new FakeNode('head');
    document.body = new FakeNode('body');
    document.head.isConnected = true;
    document.body.isConnected = true;
    document.scripts = [currentScript];
    document.createElement = function (tagName) {
        const constructor = registry.get(String(tagName).toLowerCase());
        return constructor ? new constructor() : new FakeNode(tagName);
    };
    document.createElementNS = function (_, tagName) {
        return new FakeNode(tagName);
    };
    document.dispatchEvent = function (event) {
        events.push(event);
        return FakeEventTarget.prototype.dispatchEvent.call(this, event);
    };
    const appendToHead = document.head.appendChild.bind(document.head);
    document.head.appendChild = function (child) {
        if (child.tagName === 'SCRIPT') document.scripts.push(child);
        return appendToHead(child);
    };

    const window = new FakeEventTarget();
    window.window = window;
    window.document = document;
    window.navigator = {
        globalPrivacyControl: false,
        languages: ['en-CA'],
        language: 'en-CA',
        onLine: true
    };
    window.location = { hostname: 'www.example.test' };
    window.localStorage = {
        getItem: function (key) { return storage.has(key) ? storage.get(key) : null; },
        setItem: function (key, value) { storage.set(key, String(value)); },
        removeItem: function (key) { storage.delete(key); }
    };
    window.crypto = {
        randomUUID: function () { return '00000000-0000-4000-8000-000000000000'; }
    };
    window.customElements = {
        define: function (name, constructor) { registry.set(name, constructor); },
        get: function (name) { return registry.get(name); }
    };
    window.dataLayer = (settings.dataLayer || []).map(function (entry) {
        return entry.slice();
    });
    window.setTimeout = setTimeout;
    window.clearTimeout = clearTimeout;
    window.scrollY = 0;

    const context = vm.createContext({
        window: window,
        document: document,
        navigator: window.navigator,
        location: window.location,
        localStorage: window.localStorage,
        customElements: window.customElements,
        HTMLElement: FakeHTMLElement,
        CustomEvent: class CustomEvent {
            constructor(type, init) {
                this.type = type;
                this.detail = init && init.detail;
            }
        },
        URL: URL,
        console: console,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout
    });
    vm.runInContext(runtimeSource, context, { filename: 'cookie-consent.js' });

    const consentElement = document.body.children.find(function (node) {
        return node.tagName === 'ETS-COOKIE-CONSENT';
    });
    return { consentElement, document, events, storage, window };
}

function googleLoaders(document) {
    return document.scripts.filter(function (script) {
        return /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=/.test(script.src);
    });
}

Object.entries(runtimeSources).forEach(function ([buildName, runtimeSource]) {
    test(buildName + ': denied consent defaults precede queued Google Site Kit configuration', function () {
        const runtime = createRuntime({
            dataLayer: [['js', new Date()], ['config', 'GT-TNFMNLB9']]
        }, runtimeSource);
        const commands = runtime.window.dataLayer.map(function (entry) {
            return Array.from(entry);
        });

        assert.equal(commands[0][0], 'consent');
        assert.equal(commands[0][1], 'default');
        assert.equal(commands[0][2].analytics_storage, 'denied');
        assert.equal(commands[0][2].ad_storage, 'denied');
        assert.ok(commands.findIndex(function (command) {
            return command[0] === 'config' && command[1] === 'GT-TNFMNLB9';
        }) > 0);
        assert.deepEqual(googleLoaders(runtime.document), []);
    });

    ['GT-TNFMNLB9', 'G-ABCDEF12', 'AW-123456789'].forEach(function (tagId) {
        test(buildName + ': ' + tagId + ' loads only after acceptance', function () {
            const runtime = createRuntime({ googleTagId: tagId }, runtimeSource);
            assert.deepEqual(googleLoaders(runtime.document), []);

            const accept = findPart(runtime.consentElement.shadowRoot, 'accept-button');
            assert.ok(accept);
            accept.click();

            assert.equal(googleLoaders(runtime.document).length, 1);
            assert.equal(
                googleLoaders(runtime.document)[0].src,
                'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(tagId)
            );
            assert.equal(runtime.window.ETSCookieConsent.getState().purposeDecisions.analytics, true);
        });
    });

    test(buildName + ': decline keeps a configured Google tag unloaded', function () {
        const runtime = createRuntime({ googleTagId: 'GT-TNFMNLB9' }, runtimeSource);
        const decline = findPart(runtime.consentElement.shadowRoot, 'decline-button');
        assert.ok(decline);
        decline.click();

        assert.deepEqual(googleLoaders(runtime.document), []);
        assert.equal(runtime.window.ETSCookieConsent.getState().purposeDecisions.analytics, false);
    });

    test(buildName + ': denied state clears accessible Google Analytics and Ads cookies', function () {
        const runtime = createRuntime({
            cookie: '_ga=analytics; _gcl_au=ads; _gac_G-ABCDEF12=campaign; FPGCLAW=first-party; session=required'
        }, runtimeSource);
        const deletedNames = runtime.document.cookieWrites.map(function (value) {
            return value.split('=', 1)[0];
        });

        assert.ok(deletedNames.indexOf('_ga') >= 0);
        assert.ok(deletedNames.indexOf('_gcl_au') >= 0);
        assert.ok(deletedNames.indexOf('_gac_G-ABCDEF12') >= 0);
        assert.ok(deletedNames.indexOf('FPGCLAW') >= 0);
        assert.equal(deletedNames.indexOf('session'), -1);
    });

    test(buildName + ': legacy data-ga-id remains supported', function () {
        const runtime = createRuntime({ gaId: 'G-LEGACY12' }, runtimeSource);
        findPart(runtime.consentElement.shadowRoot, 'accept-button').click();

        assert.equal(googleLoaders(runtime.document).length, 1);
        assert.equal(googleLoaders(runtime.document)[0].src.endsWith('id=G-LEGACY12'), true);
    });

    test(buildName + ': legacy data-ga-id rejects non-G identifiers', function () {
        const runtime = createRuntime({ gaId: 'GT-TNFMNLB9' }, runtimeSource);
        findPart(runtime.consentElement.shadowRoot, 'accept-button').click();

        assert.deepEqual(googleLoaders(runtime.document), []);
        assert.ok(runtime.events.some(function (event) {
            return event.type === 'ets-cookie-consent:diagnostic' &&
                event.detail.code === 'invalid-ga-id';
        }));
    });
});
