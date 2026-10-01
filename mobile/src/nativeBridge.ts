// Injected into the web app before it runs. Browser downloads, the Web Share
// API, pop-ups and new-tab links don't work inside a WebView, so this routes
// them to the native side (see handleMessage in App.tsx).
export const NATIVE_BRIDGE_JS = `
(function () {
  if (window.__ftNative) return;
  window.__ftNative = true;

  function post(msg) {
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  // The page often revokes object URLs right after clicking them, so keep the
  // blob behind each URL long enough to read it.
  var blobs = {};
  var createObjectURL = URL.createObjectURL.bind(URL);
  var revokeObjectURL = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = function (obj) {
    var url = createObjectURL(obj);
    if (obj instanceof Blob) blobs[url] = obj;
    return url;
  };
  URL.revokeObjectURL = function (url) {
    setTimeout(function () { delete blobs[url]; revokeObjectURL(url); }, 60000);
  };

  function sendFile(blob, name, kind) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result);
        var comma = dataUrl.indexOf(',');
        var mime = blob.type || dataUrl.slice(5, dataUrl.indexOf(';')) || 'application/octet-stream';
        post({ type: 'file', kind: kind, name: name, mime: mime, data: dataUrl.slice(comma + 1) });
        resolve();
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  function absolute(href) {
    try { return new URL(href, location.href).href; } catch (e) { return String(href || ''); }
  }

  function fileNameFrom(url) {
    try { return decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'download'; } catch (e) { return 'download'; }
  }

  function saveUrl(href, name) {
    var url = absolute(href);
    name = name || fileNameFrom(url);
    var blob = blobs[url];
    var load = blob ? Promise.resolve(blob) : fetch(url).then(function (r) { return r.blob(); });
    load.then(function (b) { return sendFile(b, name, 'save'); }).catch(function () {
      if (/^https?:/i.test(url)) post({ type: 'open-url', url: url });
      else post({ type: 'error', message: 'Could not save ' + name });
    });
  }

  // Returns true when the native side has taken over the link.
  function handleAnchor(a) {
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return false;
    if (a.hasAttribute('download')) {
      saveUrl(a.href, a.getAttribute('download') || a.download);
      return true;
    }
    var url = absolute(href);
    if (!/^https?:/i.test(url)) {
      if (/^(mailto|tel|sms):/i.test(url)) { post({ type: 'open-url', url: url }); return true; }
      return false;
    }
    if (a.target === '_blank' || new URL(url).origin !== location.origin) {
      post({ type: 'open-url', url: url });
      return true;
    }
    return false;
  }

  var anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (handleAnchor(this)) return;
    return anchorClick.apply(this, arguments);
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a && !e.defaultPrevented && handleAnchor(a)) e.preventDefault();
  }, true);

  window.open = function (url) {
    if (url) {
      var abs = absolute(url);
      if (/^(blob|data):/i.test(abs)) saveUrl(abs);
      else if (/^https?:/i.test(abs)) post({ type: 'open-url', url: abs });
    }
    return null;
  };

  function share(data) {
    data = data || {};
    var files = data.files || [];
    if (files.length) return sendFile(files[0], files[0].name || 'file', 'share');
    post({ type: 'share-text', title: data.title || '', text: data.text || '', url: data.url || '' });
    return Promise.resolve();
  }
  try {
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: function () { return true; }, configurable: true });
  } catch (e) {}

  // Keep the native side told of the current address, which the page changes
  // with history.replaceState (e.g. /dealer-portal).
  function reportUrl() { post({ type: 'url', url: location.href }); }
  ['pushState', 'replaceState'].forEach(function (fn) {
    var orig = history[fn];
    history[fn] = function () {
      var result = orig.apply(this, arguments);
      reportUrl();
      return result;
    };
  });
  window.addEventListener('hashchange', reportUrl);
  reportUrl();
})();
true;
`;
