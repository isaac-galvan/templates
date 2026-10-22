/* Prompt Filler — static, offline prompt template filler. No dependencies. */
(function () {
  'use strict';

  // ---------- Pure template logic (exposed on window.PromptFiller for tests) ----------
  // Matches {{name}}, {name}, with optional dropdown options and default:
  //   {name}  {name|default}  {name:opt1,opt2,opt3}  {name:opt1,opt2|opt2}
  // Names: letters, digits, space, _ - . (must start with a non-space).
  // Options: comma-separated, spaces allowed, "\," is a literal comma. Defaults: anything but { } and newline.
  var INNER = '\\s*([A-Za-z0-9_.\\-][A-Za-z0-9 _.\\-]*?)\\s*(?::((?:\\\\.|[^{}|\\n\\\\])*))?(?:\\|([^{}\\n]*?))?\\s*';
  var PLACEHOLDER_RE = new RegExp('\\{\\{' + INNER + '\\}\\}|\\{' + INNER + '\\}', 'g');

  function splitOptions(raw) {
    var out = [], cur = '';
    for (var i = 0; i < raw.length; i++) {
      var ch = raw[i];
      if (ch === '\\' && i + 1 < raw.length) {
        var nx = raw[i + 1];
        if (nx === ',' || nx === '\\') { cur += nx; i++; continue; }
        cur += ch; continue;
      }
      if (ch === ',') { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    var seen = Object.create(null);
    return out.map(function (o) { return o.trim(); }).filter(function (o) {
      if (!o || seen[o]) return false; seen[o] = true; return true;
    });
  }

  function matchParts(m) {
    var dbl = m[1] !== undefined;
    return { name: (dbl ? m[1] : m[4]).trim(), opts: dbl ? m[2] : m[5], def: dbl ? m[3] : m[6] };
  }

  // Returns [{ name, default, options }] where options is an array (dropdown) or null (text).
  // For dropdowns, default is the given default if it is one of the options, otherwise the first option.
  function parse(body) {
    var seen = Object.create(null);
    var out = [];
    var m;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((m = PLACEHOLDER_RE.exec(body || '')) !== null) {
      var pt = matchParts(m);
      var key = pt.name.toLowerCase();
      var opts = pt.opts !== undefined ? splitOptions(pt.opts) : null;
      if (opts && !opts.length) opts = null;
      var def = pt.def !== undefined ? pt.def.replace(/\\([,\\])/g, '$1').trim() : '';
      if (!seen[key]) {
        seen[key] = { name: pt.name, default: def, options: opts };
        out.push(seen[key]);
      } else {
        if (!seen[key].default && def) seen[key].default = def;
        if (!seen[key].options && opts) seen[key].options = opts;
      }
    }
    out.forEach(function (p) {
      if (p.options && p.options.indexOf(p.default) < 0) p.default = p.options[0];
    });
    return out;
  }

  // values: { name: value } (case-insensitive lookup). Empty value -> default -> leave placeholder visible.
  function fill(body, values, opts) {
    values = values || {};
    var lower = Object.create(null);
    Object.keys(values).forEach(function (k) { lower[k.toLowerCase()] = values[k]; });
    var defaults = Object.create(null);
    parse(body).forEach(function (p) { defaults[p.name.toLowerCase()] = p.default; });
    var keepMissing = !(opts && opts.blankMissing);
    return String(body || '').replace(PLACEHOLDER_RE, function () {
      var m = Array.prototype.slice.call(arguments, 0, 7);
      var key = matchParts(m).name.toLowerCase();
      var v = lower[key];
      if (v !== undefined && v !== '') return v;
      if (defaults[key]) return defaults[key];
      return keepMissing ? m[0] : '';
    });
  }

  window.PromptFiller = { parse: parse, fill: fill, splitOptions: splitOptions };

  // ---------- Storage ----------
  var KEY_T = 'pf.templates.v1';
  var KEY_V = 'pf.values.v1';

  function load(key, fallback) {
    try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { toast('Could not save (storage full or blocked)'); }
  }
  function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  var templates = load(KEY_T, null);
  var savedValues = load(KEY_V, {});

  function seed() {
    return fetch('templates.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .catch(function () { return []; })
      .then(function (list) { return normalize(list); });
  }

  function normalize(list) {
    if (list && !Array.isArray(list) && Array.isArray(list.templates)) list = list.templates;
    if (!Array.isArray(list)) throw new Error('JSON must be an array of templates');
    return list.filter(function (t) { return t && typeof t.body === 'string'; }).map(function (t) {
      return { id: String(t.id || uid()), title: String(t.title || 'Untitled').trim() || 'Untitled', body: t.body, updated: t.updated || Date.now() };
    });
  }

  function persist() { save(KEY_T, templates); }
  function byId(id) { for (var i = 0; i < templates.length; i++) if (templates[i].id === id) return templates[i]; return null; }

  // ---------- Clipboard ----------
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;';
    document.body.appendChild(ta);
    var range = document.createRange();
    range.selectNodeContents(ta);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    ta.setSelectionRange(0, text.length); // iOS needs this
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    sel.removeAllRanges();
    document.body.removeChild(ta);
    return ok;
  }

  // ---------- UI helpers ----------
  var $ = function (id) { return document.getElementById(id); };
  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }
  function show(viewId, title, opts) {
    ['listView', 'fillView', 'editView', 'dataView'].forEach(function (v) { $(v).hidden = v !== viewId; });
    $('title').textContent = title;
    $('backBtn').hidden = viewId === 'listView';
    $('newBtn').hidden = viewId !== 'listView';
    $('menuBtn').hidden = viewId !== 'listView';
    window.scrollTo(0, 0);
  }
  function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 320) + 'px'; }

  // ---------- Views ----------
  function renderList() {
    show('listView', 'Prompts');
    var q = $('search').value.trim().toLowerCase();
    var ul = $('templateList');
    ul.innerHTML = '';
    var items = templates.slice().sort(function (a, b) { return a.title.localeCompare(b.title); })
      .filter(function (t) { return !q || t.title.toLowerCase().indexOf(q) >= 0 || t.body.toLowerCase().indexOf(q) >= 0; });
    items.forEach(function (t) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#/t/' + encodeURIComponent(t.id);
      a.className = 'item';
      var h = document.createElement('span'); h.className = 'item-title'; h.textContent = t.title;
      var p = document.createElement('span'); p.className = 'item-sub';
      var n = parse(t.body).length;
      p.textContent = (n ? n + (n === 1 ? ' blank · ' : ' blanks · ') : '') + t.body.replace(/\s+/g, ' ').slice(0, 90);
      a.appendChild(h); a.appendChild(p);
      li.appendChild(a);
      ul.appendChild(li);
    });
    $('emptyMsg').hidden = items.length > 0;
    $('emptyMsg').textContent = templates.length ? 'No templates match.' : 'No templates yet. Tap ＋ to add one.';
  }

  var current = null;
  function renderFill(t) {
    current = t;
    show('fillView', t.title);
    var fieldsEl = $('fields');
    fieldsEl.innerHTML = '';
    var ph = parse(t.body);
    var vals = savedValues[t.id] || {};
    $('noFields').hidden = ph.length > 0;
    ph.forEach(function (p) {
      var label = document.createElement('label'); label.className = 'field';
      var span = document.createElement('span'); span.className = 'label'; span.textContent = p.name;
      var input;
      if (p.options) {
        input = document.createElement('select');
        p.options.forEach(function (o) {
          var opt = document.createElement('option'); opt.value = o; opt.textContent = o; input.appendChild(opt);
        });
        var remembered = vals[p.name];
        input.value = (remembered && p.options.indexOf(remembered) >= 0) ? remembered : p.default;
        input.addEventListener('change', updatePreview);
      } else {
        input = document.createElement('textarea');
        input.rows = 1;
        input.placeholder = p.default ? 'Default: ' + p.default : 'Enter ' + p.name;
        input.value = vals[p.name] || '';
        input.addEventListener('input', function () { autoGrow(input); updatePreview(); });
        requestAnimationFrame(function () { autoGrow(input); });
      }
      input.className = 'input';
      input.dataset.name = p.name;
      label.appendChild(span); label.appendChild(input);
      fieldsEl.appendChild(label);
    });
    updatePreview();
  }
  function currentValues() {
    var v = {};
    Array.prototype.forEach.call($('fields').querySelectorAll('[data-name]'), function (el) { v[el.dataset.name] = el.value; });
    return v;
  }
  function updatePreview() {
    if (!current) return;
    var v = currentValues();
    $('preview').textContent = fill(current.body, v);
    savedValues[current.id] = v;
    save(KEY_V, savedValues);
  }

  var editing = null;
  function renderEdit(t) {
    editing = t; // null = new
    show('editView', t ? 'Edit' : 'New template');
    $('editTitle').value = t ? t.title : '';
    $('editBody').value = t ? t.body : '';
    $('dupBtn').hidden = !t;
    $('delBtn').hidden = !t;
    updateBlanks();
    requestAnimationFrame(function () { autoGrow($('editBody')); });
  }
  function updateBlanks() {
    var ph = parse($('editBody').value);
    $('editBlanks').textContent = ph.length ? ph.map(function (p) { return p.name + (p.options ? ' [' + p.options.join(' / ') + ']' : '') + (p.default ? ' (default: ' + p.default + ')' : ''); }).join(', ') : 'none';
  }

  function renderData() { show('dataView', 'Import / Export'); }

  // ---------- Router ----------
  function route() {
    var h = location.hash || '#/';
    var m;
    if ((m = h.match(/^#\/t\/(.+)$/))) {
      var t = byId(decodeURIComponent(m[1]));
      return t ? renderFill(t) : (location.hash = '#/');
    }
    if (h === '#/new') return renderEdit(null);
    if ((m = h.match(/^#\/e\/(.+)$/))) {
      var te = byId(decodeURIComponent(m[1]));
      return te ? renderEdit(te) : (location.hash = '#/');
    }
    if (h === '#/data') return renderData();
    current = null;
    renderList();
  }
  function goBack() {
    var h = location.hash;
    var m = h.match(/^#\/e\/(.+)$/);
    location.hash = m ? '#/t/' + m[1] : '#/';
  }

  // ---------- Export / import ----------
  function exportJson() {
    var data = JSON.stringify(templates.map(function (t) { return { id: t.id, title: t.title, body: t.body }; }), null, 2);
    var name = 'prompt-templates-' + new Date().toISOString().slice(0, 10) + '.json';
    var file;
    try { file = new File([data], name, { type: 'application/json' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Prompt templates' }).catch(function () {});
      return;
    }
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function importJson(text) {
    var list;
    try { list = normalize(JSON.parse(text)); } catch (e) { toast('Invalid JSON: ' + e.message); return; }
    if (!list.length) { toast('No templates found'); return; }
    if ($('replaceAll').checked) {
      if (!confirm('Replace all ' + templates.length + ' templates with ' + list.length + ' imported?')) return;
      templates = list;
    } else {
      list.forEach(function (t) {
        var existing = byId(t.id);
        if (existing) { existing.title = t.title; existing.body = t.body; existing.updated = Date.now(); }
        else templates.push(t);
      });
    }
    persist();
    toast('Imported ' + list.length + ' template' + (list.length === 1 ? '' : 's'));
    $('importText').value = '';
    location.hash = '#/';
  }

  // ---------- Wire up ----------
  function bind() {
    window.addEventListener('hashchange', route);
    $('backBtn').addEventListener('click', goBack);
    $('newBtn').addEventListener('click', function () { location.hash = '#/new'; });
    $('menuBtn').addEventListener('click', function () { location.hash = '#/data'; });
    $('search').addEventListener('input', renderList);

    $('copyBtn').addEventListener('click', function () {
      var text = $('preview').textContent;
      copyText(text).then(function (ok) { toast(ok ? 'Copied ✓' : 'Copy failed — select the preview and copy manually'); });
    });
    $('clearBtn').addEventListener('click', function () {
      if (current) { delete savedValues[current.id]; save(KEY_V, savedValues); renderFill(current); }
    });
    $('editBtn').addEventListener('click', function () { if (current) location.hash = '#/e/' + encodeURIComponent(current.id); });

    $('editBody').addEventListener('input', function () { autoGrow($('editBody')); updateBlanks(); });
    $('saveBtn').addEventListener('click', function () {
      var title = $('editTitle').value.trim() || 'Untitled';
      var body = $('editBody').value;
      if (!body.trim()) { toast('Prompt is empty'); return; }
      var t = editing;
      if (t) { t.title = title; t.body = body; t.updated = Date.now(); }
      else { t = { id: uid(), title: title, body: body, updated: Date.now() }; templates.push(t); }
      persist();
      toast('Saved');
      location.hash = '#/t/' + encodeURIComponent(t.id);
    });
    $('dupBtn').addEventListener('click', function () {
      if (!editing) return;
      var c = { id: uid(), title: editing.title + ' (copy)', body: editing.body, updated: Date.now() };
      templates.push(c); persist(); toast('Duplicated');
      location.hash = '#/e/' + encodeURIComponent(c.id);
    });
    $('delBtn').addEventListener('click', function () {
      if (!editing || !confirm('Delete "' + editing.title + '"?')) return;
      var id = editing.id;
      templates = templates.filter(function (t) { return t.id !== id; });
      delete savedValues[id]; save(KEY_V, savedValues);
      persist(); toast('Deleted');
      location.hash = '#/';
    });

    $('exportBtn').addEventListener('click', exportJson);
    $('copyJsonBtn').addEventListener('click', function () {
      var data = JSON.stringify(templates.map(function (t) { return { id: t.id, title: t.title, body: t.body }; }), null, 2);
      copyText(data).then(function (ok) { toast(ok ? 'JSON copied ✓' : 'Copy failed'); });
    });
    $('importFileBtn').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { importJson(String(r.result)); e.target.value = ''; };
      r.readAsText(f);
    });
    $('importBtn').addEventListener('click', function () { importJson($('importText').value); });
    $('resetBtn').addEventListener('click', function () {
      if (!confirm('Add the example templates back? Your own templates are kept.')) return;
      seed().then(function (list) {
        list.forEach(function (t) { if (!byId(t.id)) templates.push(t); });
        persist(); toast('Examples restored'); location.hash = '#/';
      });
    });
  }

  function start() {
    bind();
    var ready = templates ? Promise.resolve() : seed().then(function (list) { templates = list; persist(); });
    ready.then(route);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
