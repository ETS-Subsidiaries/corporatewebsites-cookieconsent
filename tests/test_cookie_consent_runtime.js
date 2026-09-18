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

    addEventListener(type, listener, options) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push({ listener: listener, once: Boolean(options && options.once) });
    }

    removeEventListener(type, listener) {
        this.listeners[type] = (this.listeners[type] || []).filter(function (entry) {
            return entry.listener !== listener;
        });
    }

    dispatchEvent(event) {
        (this.listeners[event.type] || []).slice().forEach(function (entry) {
            if (entry.once) this.removeEventListener(event.type, entry.listener);
            entry.listener.call(this, event);
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
        this.parentNode = null;
        this.ownerDocument = null;
        this.documentRoot = false;
        this.shadowRoot = null;
        this.textContent = '';
        this.style = {};
        this.computedStyle = { display: this.tagName === 'IFRAME' ? 'inline' : 'block', position: 'static' };
        this.sourceWrites = [];
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

    get isConnected() {
        const parent = this.parentNode || this.host;
        return this.documentRoot || Boolean(parent && parent.isConnected);
    }

    get src() { return this.getAttribute('src') || ''; }
    set src(value) { this.setAttribute('src', value); }

    get offsetWidth() {
        if (this.hidden || this.computedStyle.display === 'none') return 0;
        return Number.parseFloat(this.style.width || this.getAttribute('width')) || 300;
    }

    get offsetHeight() {
        if (this.hidden || this.computedStyle.display === 'none') return 0;
        return Number.parseFloat(this.style.height || this.getAttribute('height')) || 150;
    }

    get offsetLeft() { return Number.parseFloat(this.style.left) || 0; }
    get offsetTop() { return Number.parseFloat(this.style.top) || 0; }

    get activeElement() {
        let node = this.ownerDocument && this.ownerDocument.focusedNode;
        while (node) {
            const root = node.getRootNode();
            if (root === this) return node;
            node = root.host;
        }
        return null;
    }

    getBoundingClientRect() {
        return { left: this.offsetLeft, top: this.offsetTop, width: this.offsetWidth, height: this.offsetHeight };
    }

    getRootNode() {
        let node = this;
        while (node.parentNode) node = node.parentNode;
        return node;
    }

    contains(node) {
        while (node) {
            if (node === this) return true;
            node = node.parentNode;
        }
        return false;
    }

    mutation(record) {
        if (this.ownerDocument) this.ownerDocument.queueMutation(Object.assign({ target: this }, record));
    }

    setAttribute(name, value) {
        const normalized = String(value);
        const oldValue = this.getAttribute(name);
        this.attributes[name] = normalized;
        if (name.indexOf('data-') === 0) this.dataset[dataName(name)] = normalized;
        if (name === 'src') this.sourceWrites.push(normalized);
        this.mutation({ type: 'attributes', attributeName: name, oldValue: oldValue });
    }

    removeAttribute(name) {
        if (!this.hasAttribute(name)) return;
        const oldValue = this.getAttribute(name);
        delete this.attributes[name];
        if (name.indexOf('data-') === 0) delete this.dataset[dataName(name)];
        if (name === 'src') this.sourceWrites.push(null);
        this.mutation({ type: 'attributes', attributeName: name, oldValue: oldValue });
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
        return this.insertBefore(child, null);
    }

    insertBefore(child, next) {
        if (child.parentNode) child.parentNode.removeChild(child);
        const index = next ? this.children.indexOf(next) : this.children.length;
        assert.ok(index >= 0, 'insertBefore reference must be a child');
        this.children.splice(index, 0, child);
        child.parentNode = this;
        child.setOwnerDocument(this.ownerDocument);
        child.connectionChanged();
        this.mutation({ type: 'childList', addedNodes: [child], removedNodes: [] });
        return child;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        assert.ok(index >= 0, 'removeChild target must be a child');
        const connected = child.isConnected;
        this.children.splice(index, 1);
        child.parentNode = null;
        if (connected) child.connectionChanged();
        this.mutation({ type: 'childList', addedNodes: [], removedNodes: [child] });
        return child;
    }

    remove() {
        if (this.parentNode) this.parentNode.removeChild(this);
    }

    setOwnerDocument(document) {
        this.ownerDocument = document;
        this.children.forEach(function (child) { child.setOwnerDocument(document); });
        if (this.shadowRoot) this.shadowRoot.setOwnerDocument(document);
    }

    connectionChanged() {
        const callback = this.isConnected ? this.connectedCallback : this.disconnectedCallback;
        if (typeof callback === 'function') callback.call(this);
        this.children.forEach(function (child) { child.connectionChanged(); });
    }

    replaceChildren() {
        this.children.slice().forEach(this.removeChild.bind(this));
        this.append.apply(this, arguments);
    }

    attachShadow() {
        this.shadowRoot = new FakeNode('shadow-root');
        this.shadowRoot.host = this;
        this.shadowRoot.ownerDocument = this.ownerDocument;
        return this.shadowRoot;
    }

    matches(selector) {
        return selector.split(',').some(function (part) {
            const tag = part.trim().match(/^[a-z][a-z0-9-]*/i);
            if (tag && this.tagName !== tag[0].toUpperCase()) return false;
            const classMatch = part.match(/\.([a-z0-9-]+)/i);
            if (classMatch && this.className.split(/\s+/).indexOf(classMatch[1]) < 0) return false;
            return Array.from(part.matchAll(/\[([a-z0-9-]+)(?:="([^"]*)")?\]/gi)).every(function (match) {
                return match[2] === undefined ? this.hasAttribute(match[1]) : this.getAttribute(match[1]) === match[2];
            }, this);
        }, this);
    }

    querySelectorAll(selector) {
        const matches = [];
        function visit(node) {
            node.children.forEach(function (child) {
                if (child.matches(selector)) matches.push(child);
                visit(child);
            });
        }
        visit(this);
        return matches;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    focus() {
        if (this.isConnected && this.ownerDocument) this.ownerDocument.focusedNode = this;
    }

    click() {
        if (this.disabled) return;
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
    const storage = new Map(Object.entries(settings.storage || {}));
    if (settings.state) storage.set('ets-cookie-consent:default:state', JSON.stringify(settings.state));
    const observers = [];
    const resizeObservers = [];
    const document = new FakeEventTarget();
    document.queueMutation = function (record) {
        observers.forEach(function (observer) {
            if (!observer.target || !observer.target.contains(record.target)) return;
            if (record.type === 'attributes' &&
                (!observer.options.attributes || observer.options.attributeFilter.indexOf(record.attributeName) < 0)) return;
            if (record.type === 'childList' && !observer.options.childList) return;
            observer.records.push(record);
        });
    };
    function flushMutations() {
        let rounds = 0;
        while (observers.some(function (observer) { return observer.records.length > 0; })) {
            assert.ok(rounds++ < 50, 'mutation delivery must settle without an observer loop');
            observers.forEach(function (observer) {
                if (observer.records.length) observer.callback(observer.records.splice(0));
            });
        }
        return rounds;
    }
    const currentScript = new FakeNode('script');
    currentScript.src = 'https://cdn.example.test/cookie-consent.js';
    if (settings.googleTagId) {
        currentScript.setAttribute('data-google-tag-id', settings.googleTagId);
    }
    if (settings.gaId) currentScript.setAttribute('data-ga-id', settings.gaId);
    if (settings.config) currentScript.setAttribute('data-config', JSON.stringify(settings.config));

    document.baseURI = 'https://www.example.test/';
    document.cookieWrites = [];
    Object.defineProperty(document, 'cookie', {
        get: function () { return settings.cookie || ''; },
        set: function (value) { document.cookieWrites.push(value); }
    });
    document.currentScript = currentScript;
    document.readyState = settings.readyState || 'complete';
    document.documentElement = new FakeNode('html');
    document.documentElement.ownerDocument = document;
    document.documentElement.documentRoot = true;
    document.documentElement.lang = 'en';
    document.head = new FakeNode('head');
    document.body = new FakeNode('body');
    document.documentElement.append(document.head, document.body);
    document.head.appendChild(currentScript);
    Object.defineProperty(document, 'scripts', {
        get: function () { return document.documentElement.querySelectorAll('script'); }
    });
    Object.defineProperty(document, 'activeElement', {
        get: function () {
            let node = document.focusedNode;
            while (node && node.getRootNode().host) node = node.getRootNode().host;
            return node || document.body;
        }
    });
    document.querySelectorAll = document.documentElement.querySelectorAll.bind(document.documentElement);
    document.querySelector = document.documentElement.querySelector.bind(document.documentElement);
    document.createElement = function (tagName) {
        const constructor = registry.get(String(tagName).toLowerCase());
        const node = constructor ? new constructor() : new FakeNode(tagName);
        node.setOwnerDocument(document);
        return node;
    };
    document.createElementNS = function (_, tagName) {
        return document.createElement(tagName);
    };
    document.dispatchEvent = function (event) {
        events.push(event);
        return FakeEventTarget.prototype.dispatchEvent.call(this, event);
    };
    const window = new FakeEventTarget();
    window.window = window;
    window.document = document;
    window.navigator = {
        globalPrivacyControl: Boolean(settings.gpc),
        languages: settings.languages || ['en-CA'],
        language: 'en-CA',
        onLine: true
    };
    window.location = { hostname: 'www.example.test' };
    window.localStorage = {
        getItem: function (key) {
            if (settings.storageUnavailable) throw new Error('Storage disabled');
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem: function (key, value) {
            if (settings.storageUnavailable) throw new Error('Storage disabled');
            storage.set(key, String(value));
        },
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
    window.getComputedStyle = function (node) {
        return Object.assign({}, node.computedStyle, node.style);
    };
    if (!settings.noMutationObserver) {
        window.MutationObserver = class MutationObserver {
            constructor(callback) {
                this.callback = callback;
                this.records = [];
                observers.push(this);
            }
            observe(target, options) {
                this.target = target;
                this.options = options;
            }
        };
    }
    window.ResizeObserver = class ResizeObserver {
        constructor(callback) {
            this.callback = callback;
            this.targets = new Set();
            resizeObservers.push(this);
        }
        observe(node) { this.targets.add(node); }
        unobserve(node) { this.targets.delete(node); }
    };
    if (settings.beforeLoad) settings.beforeLoad(document, window);

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
    flushMutations();
    return {
        get consentElement() { return document.querySelector('ets-cookie-consent'); },
        document, events, storage, window, flushMutations,
        flushResize: function () {
            resizeObservers.forEach(function (observer) { observer.callback([]); });
        },
        runAgain: function () { vm.runInContext(runtimeSource, context, { filename: 'cookie-consent.js' }); }
    };
}

function googleLoaders(document) {
    return document.scripts.filter(function (script) {
        return /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=/.test(script.src);
    });
}

const YOUTUBE_SOURCE = 'https://www.youtube.com/embed/dQw4w9WgXcQ?si=2INIyU6r-SEYJFZ6';

function appendIframe(document, source, attributes, parent) {
    const frame = document.createElement('iframe');
    const values = Object.assign({ width: '560', height: '315', title: 'YouTube video player' }, attributes);
    Object.entries(values).forEach(function ([name, value]) { frame.setAttribute(name, value); });
    if (source !== null) frame.setAttribute('src', source || YOUTUBE_SOURCE);
    (parent || document.body).appendChild(frame);
    return frame;
}

function placeholders(runtime) {
    return runtime.document.querySelectorAll('ets-consent-media');
}

function mediaButton(runtime, index) {
    return findPart(placeholders(runtime)[index || 0].shadowRoot, 'media-settings-button');
}

function accept(runtime) {
    runtime.window.ETSCookieConsent.openSettings();
    findPart(runtime.consentElement.shadowRoot, 'accept-button').click();
    runtime.flushMutations();
}

function legacyLocale(label) {
    return {
        selectorLabel: label, heading: 'Cookie notice', body: 'Test cookie notice.',
        acceptLabel: 'Agree', declineLabel: 'Decline', settingsLabel: 'Settings',
        privacyLabel: 'Privacy', withdrawLabel: 'Withdraw', closeLabel: 'Close',
        languageLabel: 'Language', statusAccepted: 'Enabled', statusDeclined: 'Disabled',
        gpcMessage: 'GPC is honored.'
    };
}

test('preview preserves the supplied iframe and loads the runtime before its embeds', function () {
    const preview = fs.readFileSync(path.join(__dirname, '..', 'preview.html'), 'utf8');
    const supplied = '<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=2INIyU6r-SEYJFZ6" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
    assert.ok(preview.includes(supplied));
    const loader = '<script src="./cookie-consent.js"></script>';
    assert.ok(preview.indexOf(loader) >= 0);
    assert.ok(preview.indexOf(loader) < preview.indexOf('</head>'));
    assert.ok(preview.indexOf(loader) < preview.indexOf(supplied));
});

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

    test(buildName + ': an existing YouTube iframe is unloaded and gets a local placeholder', function () {
        let frame;
        const attributes = {
            frameborder: '0',
            allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
            referrerpolicy: 'strict-origin-when-cross-origin',
            allowfullscreen: '',
            tabindex: '0',
            'aria-hidden': 'false'
        };
        const runtime = createRuntime({
            beforeLoad: function (document) { frame = appendIframe(document, YOUTUBE_SOURCE, attributes); }
        }, runtimeSource);

        assert.equal(frame.getAttribute('src'), null);
        assert.equal(frame.getAttribute('tabindex'), '-1');
        assert.equal(frame.getAttribute('aria-hidden'), 'true');
        assert.equal(runtime.window.ETSCookieConsent.getState(), null);
        assert.equal(placeholders(runtime).length, 1);
        const shadow = placeholders(runtime)[0].shadowRoot;
        assert.equal(findPart(shadow, 'media-message').textContent, 'Accept cookies to view this video.');
        assert.equal(findPart(shadow, 'media-settings-button').textContent, 'Cookie settings');
        assert.equal(shadow.querySelectorAll('img, iframe, script, link').length, 0);
        assert.equal(/url\s*\(/i.test(shadow.querySelector('style').textContent), false);

        accept(runtime);
        assert.equal(frame.src, YOUTUBE_SOURCE);
        Object.entries(attributes).forEach(function ([name, value]) {
            assert.equal(frame.getAttribute(name), value, name + ' is preserved');
        });
    });

    test(buildName + ': the media CTA opens and focuses the original popup without granting consent', async function () {
        const runtime = createRuntime({
            beforeLoad: function (document) { appendIframe(document); }
        }, runtimeSource);
        const button = mediaButton(runtime);

        button.focus();
        button.click();
        await Promise.resolve();

        assert.equal(runtime.window.ETSCookieConsent.getState(), null);
        assert.equal(runtime.document.querySelector('iframe').getAttribute('src'), null);
        assert.equal(runtime.document.querySelectorAll('ets-cookie-consent').length, 1);
        assert.equal(
            runtime.consentElement.shadowRoot.activeElement,
            findPart(runtime.consentElement.shadowRoot, 'panel')
        );
        assert.ok(findPart(runtime.consentElement.shadowRoot, 'accept-button'));
        assert.ok(findPart(runtime.consentElement.shadowRoot, 'decline-button'));
        assert.equal(runtime.events.some(function (event) {
            return event.type === 'ets-cookie-consent:statechange';
        }), false);
    });

    test(buildName + ': acceptance restores multiple providers URLs once without altering playback parameters', function () {
        const frames = [];
        const sources = [
            YOUTUBE_SOURCE,
            '//www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&autoplay=0#example',
            'https://youtube.com/embed/videoseries?list=example'
        ];
        const runtime = createRuntime({
            beforeLoad: function (document) {
                sources.forEach(function (source) { frames.push(appendIframe(document, source)); });
            }
        }, runtimeSource);
        assert.equal(placeholders(runtime).length, sources.length);

        accept(runtime);
        runtime.flushMutations();
        runtime.runAgain();
        runtime.flushMutations();

        assert.equal(placeholders(runtime).length, 0);
        frames.forEach(function (frame, index) {
            assert.equal(frame.getAttribute('src'), sources[index]);
            assert.equal(frame.parentNode, runtime.document.body);
            assert.deepEqual(frame.sourceWrites, [sources[index], null, sources[index]]);
            assert.equal(frame.getAttribute('tabindex'), null);
            assert.equal(frame.getAttribute('aria-hidden'), null);
        });
        assert.equal(runtime.document.querySelectorAll('ets-cookie-consent').length, 1);
    });

    test(buildName + ': returning current-notice acceptance leaves the existing iframe navigation alone', function () {
        const firstVisit = createRuntime({}, runtimeSource);
        accept(firstVisit);
        let frame;
        const runtime = createRuntime({
            storage: Object.fromEntries(firstVisit.storage),
            beforeLoad: function (document) { frame = appendIframe(document); }
        }, runtimeSource);

        assert.equal(runtime.window.ETSCookieConsent.getState().purposeDecisions.analytics, true);
        assert.equal(runtime.window.ETSCookieConsent.getState().noticeVersion, '2026-09-18');
        assert.equal(placeholders(runtime).length, 0);
        assert.deepEqual(frame.sourceWrites, [YOUTUBE_SOURCE]);
        assert.equal(frame.parentNode, runtime.document.body);
    });

    ['declined', 'expired', 'old-notice'].forEach(function (reason) {
        test(buildName + ': ' + reason + ' saved consent does not enable YouTube', function () {
            const firstVisit = createRuntime({}, runtimeSource);
            accept(firstVisit);
            const state = JSON.parse(firstVisit.storage.get('ets-cookie-consent:default:state'));
            if (reason === 'declined') {
                state.purposeDecisions.analytics = false;
                state.decisionSource = 'decline';
            }
            if (reason === 'expired') state.expiresAt = '2000-01-01T00:00:00.000Z';
            if (reason === 'old-notice') state.noticeVersion = '2026-08-21';
            const runtime = createRuntime({
                state: state,
                beforeLoad: function (document) { appendIframe(document); }
            }, runtimeSource);

            assert.equal(runtime.document.querySelector('iframe').getAttribute('src'), null);
            assert.equal(placeholders(runtime).length, 1);
            if (reason !== 'declined') assert.equal(runtime.window.ETSCookieConsent.getState(), null);
        });
    });

    test(buildName + ': withdrawal unloads all accepted frames and acceptance can restore them again', function () {
        const runtime = createRuntime({
            beforeLoad: function (document) {
                appendIframe(document);
                appendIframe(document, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
            }
        }, runtimeSource);
        const frames = runtime.document.querySelectorAll('iframe');
        accept(runtime);
        runtime.window.ETSCookieConsent.openSettings();
        findPart(runtime.consentElement.shadowRoot, 'withdraw-button').click();
        runtime.flushMutations();

        assert.equal(placeholders(runtime).length, 2);
        assert.ok(frames.every(function (frame) { return !frame.hasAttribute('src'); }));
        assert.equal(runtime.window.ETSCookieConsent.getState().decisionSource, 'withdraw');
        accept(runtime);
        assert.equal(placeholders(runtime).length, 0);
        assert.ok(frames.every(function (frame) { return frame.hasAttribute('src'); }));
        assert.deepEqual(frames[0].sourceWrites, [YOUTUBE_SOURCE, null, YOUTUBE_SOURCE, null, YOUTUBE_SOURCE]);
    });

    test(buildName + ': closing settings returns focus to the media CTA after a decline', async function () {
        const runtime = createRuntime({
            beforeLoad: function (document) { appendIframe(document); }
        }, runtimeSource);
        findPart(runtime.consentElement.shadowRoot, 'decline-button').click();
        const host = placeholders(runtime)[0];
        const button = mediaButton(runtime);
        button.focus();
        button.click();
        await Promise.resolve();
        findPart(runtime.consentElement.shadowRoot, 'close-button').click();
        await Promise.resolve();

        assert.equal(host.shadowRoot.activeElement, button);
        assert.equal(runtime.window.ETSCookieConsent.getState().purposeDecisions.analytics, false);
        assert.equal(runtime.document.querySelector('iframe').getAttribute('src'), null);
    });

    test(buildName + ': GPC overrides saved acceptance and does not let the CTA grant consent', function () {
        const firstVisit = createRuntime({}, runtimeSource);
        accept(firstVisit);
        const runtime = createRuntime({
            storage: Object.fromEntries(firstVisit.storage),
            gpc: true,
            beforeLoad: function (document) { appendIframe(document); }
        }, runtimeSource);

        assert.equal(runtime.document.querySelector('iframe').getAttribute('src'), null);
        assert.equal(runtime.window.ETSCookieConsent.getState().decisionSource, 'gpc');
        assert.match(findPart(placeholders(runtime)[0].shadowRoot, 'media-message').textContent, /Global Privacy Control/);
        mediaButton(runtime).click();
        const button = findPart(runtime.consentElement.shadowRoot, 'accept-button');
        assert.equal(button.disabled, true);
        button.click();
        assert.equal(runtime.window.ETSCookieConsent.getState().purposeDecisions.analytics, false);
    });

    test(buildName + ': observation blocks parser additions before DOMContentLoaded and later src assignments', function () {
        const runtime = createRuntime({ readyState: 'loading' }, runtimeSource);
        const container = runtime.document.createElement('div');
        const first = appendIframe(runtime.document, YOUTUBE_SOURCE, {}, container);
        runtime.document.body.appendChild(container);
        runtime.flushMutations();

        assert.equal(first.getAttribute('src'), null);
        assert.equal(runtime.consentElement, null);
        runtime.document.readyState = 'complete';
        runtime.document.dispatchEvent({ type: 'DOMContentLoaded' });
        runtime.flushMutations();
        assert.equal(placeholders(runtime).length, 1);
        assert.ok(runtime.consentElement);

        const later = appendIframe(runtime.document, null);
        runtime.flushMutations();
        assert.equal(placeholders(runtime).length, 1);
        later.src = YOUTUBE_SOURCE;
        runtime.flushMutations();
        assert.equal(later.getAttribute('src'), null);
        assert.equal(placeholders(runtime).length, 2);
        accept(runtime);
        const acceptedAddition = appendIframe(runtime.document);
        runtime.flushMutations();
        assert.deepEqual(acceptedAddition.sourceWrites, [YOUTUBE_SOURCE]);
    });

    test(buildName + ': changing a blocked video restores the latest source, not a stale one', function () {
        const runtime = createRuntime({
            beforeLoad: function (document) { appendIframe(document); }
        }, runtimeSource);
        const frame = runtime.document.querySelector('iframe');
        const replacement = 'https://www.youtube.com/embed/another-video?start=30';
        const host = placeholders(runtime)[0];
        frame.src = replacement;
        runtime.flushMutations();

        assert.equal(frame.getAttribute('src'), null);
        assert.equal(placeholders(runtime)[0], host);
        assert.equal(placeholders(runtime).length, 1);
        accept(runtime);
        assert.equal(frame.getAttribute('src'), replacement);
    });

    test(buildName + ': moved and reinserted frames retain the right source and a single placeholder', function () {
        const runtime = createRuntime({
            beforeLoad: function (document) { appendIframe(document); }
        }, runtimeSource);
        const frame = runtime.document.querySelector('iframe');
        const originalHost = placeholders(runtime)[0];
        const container = runtime.document.createElement('div');
        runtime.document.body.appendChild(container);
        container.appendChild(frame);
        runtime.flushMutations();

        assert.equal(originalHost.isConnected, false);
        assert.equal(placeholders(runtime).length, 1);
        assert.equal(placeholders(runtime)[0].parentNode, container);
        assert.equal(frame.getAttribute('src'), null);
        frame.remove();
        runtime.flushMutations();
        assert.equal(placeholders(runtime).length, 0);
        assert.equal(frame.getAttribute('src'), YOUTUBE_SOURCE);
        runtime.document.body.appendChild(frame);
        runtime.flushMutations();
        assert.equal(placeholders(runtime).length, 1);
        assert.equal(frame.getAttribute('src'), null);
        accept(runtime);
        assert.equal(frame.getAttribute('src'), YOUTUBE_SOURCE);
    });

    test(buildName + ': removing an ancestor cleans runtime markup before that content is reinserted', function () {
        let container;
        const runtime = createRuntime({
            beforeLoad: function (document) {
                container = document.createElement('div');
                document.body.appendChild(container);
                appendIframe(document, YOUTUBE_SOURCE, {}, container);
            }
        }, runtimeSource);
        const frame = runtime.document.querySelector('iframe');
        container.remove();
        runtime.flushMutations();

        assert.equal(frame.parentNode, container);
        assert.equal(frame.src, YOUTUBE_SOURCE);
        assert.equal(container.querySelectorAll('ets-consent-media').length, 0);
        runtime.document.body.appendChild(container);
        runtime.flushMutations();
        assert.equal(frame.getAttribute('src'), null);
        assert.equal(placeholders(runtime).length, 1);
    });

    test(buildName + ': unrelated, lookalike, and non-embed iframe URLs remain untouched', function () {
        const sources = [
            'https://player.vimeo.com/video/123456',
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'https://youtu.be/dQw4w9WgXcQ',
            'https://www.youtube.com.example.test/embed/video',
            'https://www.youtube.com@other.example.test/embed/video',
            'https://other.example.test/?url=https://www.youtube.com/embed/video',
            'ftp://www.youtube.com/embed/video',
            'about:blank'
        ];
        const frames = [];
        const runtime = createRuntime({
            beforeLoad: function (document) {
                sources.forEach(function (source) { frames.push(appendIframe(document, source)); });
            }
        }, runtimeSource);
        assert.equal(placeholders(runtime).length, 0);
        frames.forEach(function (frame, index) { assert.deepEqual(frame.sourceWrites, [sources[index]]); });
    });

    test(buildName + ': site-authored srcdoc and provider changes relinquish the placeholder without stale restoration', function () {
        let frame;
        const runtime = createRuntime({
            beforeLoad: function (document) {
                frame = appendIframe(document, YOUTUBE_SOURCE, { srcdoc: '<p>Local content</p>' });
            }
        }, runtimeSource);
        assert.equal(placeholders(runtime).length, 0);
        frame.removeAttribute('srcdoc');
        runtime.flushMutations();
        assert.equal(placeholders(runtime).length, 1);
        frame.src = 'https://player.vimeo.com/video/123456';
        runtime.flushMutations();
        assert.equal(placeholders(runtime).length, 0);
        assert.equal(frame.src, 'https://player.vimeo.com/video/123456');
        assert.equal(frame.hasAttribute('aria-hidden'), false);
        frame.src = YOUTUBE_SOURCE;
        runtime.flushMutations();
        frame.setAttribute('srcdoc', '<p>Replacement content</p>');
        runtime.flushMutations();
        accept(runtime);
        assert.equal(placeholders(runtime).length, 0);
        assert.equal(frame.getAttribute('srcdoc'), '<p>Replacement content</p>');
        assert.equal(frame.getAttribute('src'), null);
    });

    test(buildName + ': legacy locales stay valid and media translations update with the selected locale', function () {
        const runtime = createRuntime({
            languages: ['fr'],
            config: {
                locales: {
                    en: { mediaBlockedMessage: 'Choose cookies to enable this video.' },
                    fr: legacyLocale('French'),
                    es: Object.assign(legacyLocale('Spanish'), {
                        mediaBlockedMessage: 'Acepta cookies para ver este video.', settingsLabel: 'Opciones de cookies'
                    })
                }
            },
            beforeLoad: function (document) { appendIframe(document); }
        }, runtimeSource);
        const host = placeholders(runtime)[0];
        assert.equal(host.getAttribute('lang'), 'fr');
        assert.equal(findPart(host.shadowRoot, 'media-message').textContent, 'Accept cookies to view this video.');
        assert.equal(runtime.events.some(function (event) {
            return event.type === 'ets-cookie-consent:diagnostic' && event.detail.code === 'invalid-data-config';
        }), false);
        runtime.window.ETSCookieConsent.setLocale('es');
        assert.equal(host.getAttribute('lang'), 'es');
        assert.equal(findPart(host.shadowRoot, 'media-message').textContent, 'Acepta cookies para ver este video.');
        assert.equal(mediaButton(runtime).textContent, 'Opciones de cookies');
        runtime.window.ETSCookieConsent.setLocale('en');
        assert.equal(findPart(host.shadowRoot, 'media-message').textContent, 'Choose cookies to enable this video.');
    });

    test(buildName + ': an invalid supplied media translation uses the existing configuration diagnostic', function () {
        const runtime = createRuntime({
            config: { locales: { en: { mediaBlockedMessage: 42 } } },
            beforeLoad: function (document) { appendIframe(document); }
        }, runtimeSource);
        assert.ok(runtime.events.some(function (event) {
            return event.type === 'ets-cookie-consent:diagnostic' && event.detail.code === 'invalid-data-config';
        }));
        assert.equal(findPart(placeholders(runtime)[0].shadowRoot, 'media-message').textContent, 'Accept cookies to view this video.');
    });

    test(buildName + ': media consent still works for this page when local storage is unavailable', function () {
        const runtime = createRuntime({
            storageUnavailable: true,
            beforeLoad: function (document) { appendIframe(document); }
        }, runtimeSource);
        assert.equal(runtime.document.querySelector('iframe').getAttribute('src'), null);
        accept(runtime);
        assert.equal(runtime.document.querySelector('iframe').src, YOUTUBE_SOURCE);
        assert.equal(runtime.window.ETSCookieConsent.getState().purposeDecisions.analytics, true);
        assert.equal(runtime.storage.size, 0);
        assert.ok(runtime.events.some(function (event) {
            return event.type === 'ets-cookie-consent:storage-unavailable';
        }));
    });

    test(buildName + ': missing mutation observation is reported while existing frames are still blocked', function () {
        const runtime = createRuntime({
            noMutationObserver: true,
            beforeLoad: function (document) {
                appendIframe(document);
                appendIframe(document);
            }
        }, runtimeSource);
        assert.equal(placeholders(runtime).length, 2);
        assert.equal(runtime.events.filter(function (event) {
            return event.type === 'ets-cookie-consent:diagnostic' && event.detail.code === 'media-observer-unavailable';
        }).length, 1);
    });

    test(buildName + ': layout updates retain author sizing and do not navigate the iframe', function () {
        let frame;
        const runtime = createRuntime({
            beforeLoad: function (document) {
                frame = appendIframe(document);
                frame.style.width = '100%';
            }
        }, runtimeSource);
        const host = placeholders(runtime)[0];
        const overlay = findPart(host.shadowRoot, 'media-placeholder');
        assert.equal(host.style.display, 'block');
        assert.equal(overlay.style.height, '315px');
        frame.computedStyle.position = 'absolute';
        frame.style.left = '12px';
        frame.style.top = '20px';
        runtime.flushResize();
        assert.equal(host.style.display, 'contents');
        assert.equal(overlay.style.left, '12px');
        assert.equal(overlay.style.top, '20px');
        frame.computedStyle.display = 'none';
        runtime.flushResize();
        assert.equal(overlay.hidden, true);
        assert.equal(frame.style.width, '100%');
        assert.deepEqual(frame.sourceWrites, [YOUTUBE_SOURCE, null]);
    });

    test(buildName + ': shared node observation preserves late Google tag guards and advertising denial', function () {
        const runtime = createRuntime({}, runtimeSource);
        const script = runtime.document.createElement('script');
        script.src = 'https://www.googletagmanager.com/gtag/js?id=G-LATE1234';
        runtime.document.head.appendChild(script);
        appendIframe(runtime.document);
        runtime.flushMutations();
        assert.equal(runtime.window['ga-disable-G-LATE1234'], true);
        accept(runtime);
        assert.equal(runtime.window['ga-disable-G-LATE1234'], false);
        const updates = runtime.window.dataLayer.filter(function (entry) { return entry[0] === 'consent'; });
        assert.ok(updates.every(function (entry) {
            return entry[2].ad_storage === 'denied' && entry[2].ad_user_data === 'denied' &&
                entry[2].ad_personalization === 'denied';
        }));
        runtime.window.ETSCookieConsent.openSettings();
        findPart(runtime.consentElement.shadowRoot, 'withdraw-button').click();
        runtime.flushMutations();
        assert.equal(runtime.window['ga-disable-G-LATE1234'], true);
        assert.equal(runtime.document.querySelector('iframe').getAttribute('src'), null);
    });
});
