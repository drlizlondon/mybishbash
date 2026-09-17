(function () {
  'use strict';

  // Consent-gated analytics for myBishBash — the Big Picture Planner pattern
  // (~/Planner/planner-v1/public/clarity-consent.js): Google Analytics 4 for
  // aggregate usage plus Microsoft Clarity for interaction insight (clicks,
  // scrolling), both behind ONE "Allow analytics" choice. Pre-consent this
  // script makes zero network requests. On grant the app root is masked with
  // data-clarity-mask so card content is never captured. The "Privacy choices"
  // link attaches to the real site footer once React renders it, since this is
  // a client-rendered SPA.
  var GA4_MEASUREMENT_ID = 'G-509B78PVCB';
  var CLARITY_PROJECT_ID = 'yjr0aptax3';
  var CONSENT_KEY = 'mbb_analytics_consent_v1';
  var CONSENT_MAX_AGE_MS = 13 * 30 * 24 * 60 * 60 * 1000;
  var PRODUCTION_HOSTS = ['mybishbash.app', 'www.mybishbash.app'];

  if (PRODUCTION_HOSTS.indexOf(window.location.hostname) === -1) return;

  function readConsent() {
    try {
      var stored = window.localStorage.getItem(CONSENT_KEY);
      if (!stored) return null;
      // Re-prompt legacy string choices and choices older than 13 months.
      var choice = JSON.parse(stored);
      if (!choice || !choice.value || !choice.decidedAt) return null;
      if (Date.now() - choice.decidedAt > CONSENT_MAX_AGE_MS) return null;
      return choice.value;
    }
    catch (error) { return null; }
  }

  function writeConsent(value) {
    try {
      window.localStorage.setItem(CONSENT_KEY, JSON.stringify({
        value: value,
        decidedAt: Date.now()
      }));
    }
    catch (error) { /* The choice still applies for this page load. */ }
  }

  // Mask the application root so Clarity records interaction shape only, never
  // the visitor's card content.
  function maskAppRoot() {
    var root = document.getElementById('root');
    if (root) root.setAttribute('data-clarity-mask', 'true');
  }

  function loadGoogleAnalytics() {
    if (document.querySelector('script[data-mbb-ga4]')) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA4_MEASUREMENT_ID, {
      anonymize_ip: true,
      cookie_flags: 'SameSite=None;Secure'
    });

    var script = document.createElement('script');
    script.async = true;
    script.dataset.mbbGa4 = 'true';
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_MEASUREMENT_ID);
    document.head.appendChild(script);
  }

  function signalClarityConsent(value) {
    if (typeof window.clarity !== 'function') return;
    window.clarity('consentv2', {
      ad_Storage: 'denied',
      analytics_Storage: value === 'granted' ? 'granted' : 'denied'
    });
  }

  function loadClarity() {
    if (document.querySelector('script[data-mbb-clarity]')) {
      signalClarityConsent('granted');
      return;
    }

    window.clarity = window.clarity || function () {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };

    // Queue consent before the asynchronous tag executes so Clarity has the
    // visitor's choice before it attempts to use analytics storage.
    signalClarityConsent('granted');

    var script = document.createElement('script');
    script.async = true;
    script.dataset.mbbClarity = 'true';
    script.src = 'https://www.clarity.ms/tag/' + CLARITY_PROJECT_ID;
    document.head.appendChild(script);
  }

  function loadAnalytics() {
    maskAppRoot();
    loadClarity();
    loadGoogleAnalytics();
  }

  function removePrompt() {
    var prompt = document.getElementById('mbb-analytics-consent');
    if (prompt) prompt.remove();
  }

  function clearAnalyticsCookies() {
    document.cookie.split(';').forEach(function (cookie) {
      var name = cookie.split('=')[0].trim();
      if (name === '_ga' || name.indexOf('_ga_') === 0 || name === '_gid') {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
        document.cookie = name + '=; Max-Age=0; path=/; domain=.' + window.location.hostname + '; SameSite=Lax';
      }
    });
  }

  // The real footer is rendered client-side by React, so watch for it
  // instead of assuming it exists at DOMContentLoaded.
  function installPrivacyChoicesLink() {
    var privacyLink = document.querySelector('footer a[href$="/privacy"], footer a[href*="/privacy?"], footer a[href$="/privacy/"]');
    if (!privacyLink) return false;
    if (privacyLink.parentElement.querySelector('[data-mbb-privacy-choices]')) return true;

    var link = document.createElement('a');
    link.href = '#privacy-choices';
    link.textContent = 'Privacy choices';
    link.setAttribute('data-mbb-privacy-choices', '');
    link.addEventListener('click', function (event) {
      event.preventDefault();
      showPrompt(true);
    });
    privacyLink.insertAdjacentElement('afterend', link);
    return true;
  }

  function watchForFooter() {
    if (installPrivacyChoicesLink()) return;
    var observer = new MutationObserver(function () {
      if (installPrivacyChoicesLink()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function choose(value) {
    var analyticsWasLoaded = Boolean(
      document.querySelector('script[data-mbb-ga4]') ||
      document.querySelector('script[data-mbb-clarity]')
    );
    writeConsent(value);
    removePrompt();
    if (value === 'granted') {
      loadAnalytics();
    } else {
      clearAnalyticsCookies();
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', { analytics_storage: 'denied' });
      }
      signalClarityConsent('denied');
      if (typeof window.clarity === 'function') window.clarity('consent', false);
      // Reload without the tags so no further collection continues after a
      // visitor withdraws consent during an active session.
      if (analyticsWasLoaded) {
        window.location.reload();
        return;
      }
    }
  }

  function showPrompt(isPreferences) {
    if (document.getElementById('mbb-analytics-consent')) return;

    var prompt = document.createElement('section');
    prompt.id = 'mbb-analytics-consent';
    prompt.setAttribute('role', 'dialog');
    prompt.setAttribute('aria-modal', 'false');
    prompt.setAttribute('aria-labelledby', 'mbb-analytics-title');
    prompt.innerHTML =
      '<div>' +
        '<strong id="mbb-analytics-title">' + (isPreferences ? 'Privacy choices' : 'A quieter kind of analytics') + '</strong>' +
        '<p>With your permission, Google Analytics and Microsoft Clarity help us see how myBishBash is used and where it is confusing — in aggregate, with your card content masked. Nothing personal, no ads. You can change your mind any time.</p>' +
        '<a href="/privacy">Read our privacy policy</a>' +
      '</div>' +
      '<div class="mbb-consent-actions">' +
        '<button type="button" data-consent="denied">No thanks</button>' +
        '<button type="button" data-consent="granted">Allow analytics</button>' +
      '</div>';

    prompt.querySelector('[data-consent="denied"]').addEventListener('click', function () { choose('denied'); });
    prompt.querySelector('[data-consent="granted"]').addEventListener('click', function () { choose('granted'); });
    document.body.appendChild(prompt);
  }

  function addStyles() {
    var style = document.createElement('style');
    style.textContent =
      '#mbb-analytics-consent{position:fixed;z-index:2147483646;left:16px;right:16px;bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:20px;max-width:720px;margin:0 auto;padding:16px 18px;border:1px solid #e4ded4;border-radius:16px;background:#F7F2EE;color:#171512;box-shadow:0 12px 40px rgba(20,16,10,.16);font:14px/1.45 system-ui,-apple-system,sans-serif}' +
      '#mbb-analytics-consent strong{display:block;margin-bottom:4px;font-size:15px}' +
      '#mbb-analytics-consent p{margin:0;color:#5c564c}' +
      '#mbb-analytics-consent a{display:inline-block;margin-top:5px;color:#171512;font-weight:600;text-decoration:underline}' +
      '.mbb-consent-actions{display:flex;flex:0 0 auto;gap:8px}' +
      '.mbb-consent-actions button{border:1px solid #d8d1c4;border-radius:10px;background:#fff;color:#302c24;cursor:pointer;font:600 13px/1 system-ui,-apple-system,sans-serif;min-height:38px;padding:0 14px}' +
      '.mbb-consent-actions [data-consent="granted"]{border-color:#171512;background:#171512;color:#fff}' +
      '[data-mbb-privacy-choices]{margin-left:6px}' +
      '[data-mbb-privacy-choices]:focus-visible{outline:2px solid #171512;outline-offset:3px;border-radius:3px}' +
      '@media(max-width:620px){#mbb-analytics-consent{align-items:stretch;flex-direction:column;gap:12px}.mbb-consent-actions{justify-content:flex-end}}';
    document.head.appendChild(style);
  }

  function initialise() {
    addStyles();
    watchForFooter();
    var consent = readConsent();
    if (consent === 'granted') loadAnalytics();
    if (consent !== 'granted' && consent !== 'denied') showPrompt(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise);
  else initialise();
})();
