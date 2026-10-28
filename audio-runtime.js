



window.__CE2_AUDIO_TEACHER__=false;

window.__CE2_AUDIO_SCHOOL__=false;

/* CE2 recorded Mandarin audio. This file is also importable from Node for inventory/tests. */

(function (root, factory) {

  var api = factory();

  if (typeof module === 'object' && module.exports) module.exports = api;

  if (root && root.document) { root.CE2AudioV2 = api; api.install(root); }

})(typeof window !== 'undefined' ? window : null, function () {

  'use strict';

  var roles = ['teacher', 'girl', 'boy', 'narrator', 'students'];

  function textOf(value) { return String(value == null ? '' : value).trim(); }

  function hasSpeech(value) { return /[A-Za-zÀ-ÿ0-9\u3400-\u9fff]/.test(textOf(value)); }

  function normalizeRole(role) {

    if (role === 'male') return 'boy';

    if (role === 'female') return 'girl';

    if (role === 'child') return 'students';

    return roles.indexOf(role) >= 0 ? role : 'narrator';

  }

  function readingRole(row) {

    var speaker = textOf(typeof row === 'string' ? row : (row && (row.speaker || row.s)));

    if (/全体|同学们|学生们|大家|合读|齐读|和|與|与/.test(speaker)) return 'students';

    if (/老师|教師|教师|teacher|professeur/i.test(speaker)) return 'teacher';

    if (/^(Lucas|A)$/i.test(speaker)) return 'boy';

    if (/^(Léa|Lea|Emma|B)$/i.test(speaker)) return 'girl';

    return 'narrator';

  }

  function titleText(lesson) {

    var nums = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四'];

    return '第' + (nums[Number(lesson.no)] || lesson.no) + '课，' + textOf(lesson.titleZh) + '。';

  }

  function lessonReadingEntries(lesson) {

    var out = [{text: titleText(lesson), role: 'narrator', kind: 'title'}];

    (lesson.reading || []).forEach(function (row, index) {

      out.push({text: textOf(row.zh), role: readingRole(row), kind: 'reading', readIndex: index});

    });

    if (Number(lesson.no) === 14) (lesson.poem || []).forEach(function (row, index) {

      out.push({text: textOf(row.zh), role: 'narrator', kind: 'poem', poemIndex: index});

    });

    return out.filter(function (entry) { return entry.text; });

  }

  function createCe2AudioPlayer(options) {

    options = options || {};

    var version = 0, session = null, audio = null;

    function context() { return options.getContext ? options.getContext() : ''; }

    function valid(id) { return !!session && session.id === id && session.context === context(); }

    function signal(status, detail) { if (options.onStatus) options.onStatus(status, detail || {}); }

    function release() {

      if (!audio) return;

      audio.onended = null; audio.onerror = null; audio.onloadedmetadata = null;

      try { audio.pause(); } catch (_) {}

      audio = null;

    }

    function stop() {

      version += 1; release(); session = null; signal('stopped');

    }

    function source(entry) {

      var map = options.getMap ? options.getMap() : (options.map || {});

      return entry.src || map[normalizeRole(entry.role) + ':' + textOf(entry.text)] || '';

    }

    function fail(id, reason) {

      if (!valid(id)) return;

      release(); session.failed = true; session.paused = true;

      signal('error', {entry: session.entries[session.index], reason: reason, retry: retry});

    }

    function playCurrent(id) {

      if (!valid(id) || session.paused) return;

      var entry = session.entries[session.index];

      if (!entry) { session = null; release(); signal('finished'); if (options.onFinish) options.onFinish(); return; }

      release(); session.failed = false;

      if (options.onEntry) options.onEntry(entry, session.index, session.kind);

      if (!valid(id)) return;

      var src = source(entry);

      if (!src) { fail(id, 'missing'); return; }

      var a;

      try { a = new options.Audio(src); } catch (_) { fail(id, 'load'); return; }

      audio = a; a.preload = 'auto';

      a.playbackRate = Number(entry.rate || session.rate || 1);

      a.preservesPitch = true; a.mozPreservesPitch = true; a.webkitPreservesPitch = true;

      a.onended = function () {

        if (!valid(id) || audio !== a || session.paused) return;

        session.index += 1; playCurrent(id);

      };

      a.onerror = function () { if (audio === a) fail(id, 'load'); };

      signal('playing', {entry: entry});

      try {

        var result = a.play();

        if (result && result.catch) result.catch(function () { if (audio === a && valid(id) && !session.paused) fail(id, 'play'); });

      } catch (_) { fail(id, 'play'); }

    }

    function start(entries, settings) {

      stop(); settings = settings || {};

      entries = (entries || []).map(function (entry) {

        return Object.assign({}, entry, {text: textOf(entry.text), role: normalizeRole(entry.role)});

      }).filter(function (entry) { return hasSpeech(entry.text); });

      if (!entries.length) return;

      session = {id: version, entries: entries, index: 0, context: context(), rate: settings.rate || 1,

        kind: settings.kind || 'single', paused: false, failed: false};

      playCurrent(version);

    }

    function enqueueWriting(entry) {
      if (session && valid(session.id) && session.kind === 'writing-card' && !session.failed) {
        var last = session.entries[session.entries.length - 1];
        if (last.text !== entry.text) session.entries.push(entry);
        if (session.paused) resume();
        return;
      }
      start([entry], {kind:'writing-card'});
    }
    function pause() {

      if (!session) return;

      session.paused = true;

      if (audio) { try { audio.pause(); } catch (_) {} }

      signal('paused');

    }

    function resume() {

      if (!session) return false;

      if (!valid(session.id)) { stop(); return false; }

      session.paused = false;

      if (session.failed || !audio) { playCurrent(session.id); return true; }

      var id = session.id, a = audio; signal('playing', {entry: session.entries[session.index]});

      try {

        var result = a.play();

        if (result && result.catch) result.catch(function () { if (audio === a && valid(id) && !session.paused) fail(id, 'play'); });

      } catch (_) { fail(id, 'play'); }

      return true;

    }

    function retry() { if (session) { session.paused = false; playCurrent(session.id); } }

    function syncContext() { if (session && session.context !== context()) stop(); }

    function snapshot() { return session ? {index: session.index, length: session.entries.length, paused: session.paused,

      failed: session.failed, kind: session.kind, entry: session.entries[session.index], src: audio && audio.src} : null; }

    return {start: start, enqueueWriting: enqueueWriting, stop: stop, pause: pause, resume: resume, retry: retry, source: source,

      syncContext: syncContext, snapshot: snapshot};

  }

  function install(g) {

    if (g.__ce2AudioV2Installed) return g.ce2AudioPlayer;

    g.__ce2AudioV2Installed = true;

    var doc = g.document, teacher = !!g.__CE2_AUDIO_TEACHER__, school = !!g.__CE2_AUDIO_SCHOOL__;

    function currentLesson() {

      if (typeof g.L === 'function') { var lesson = g.L(); if (lesson) return lesson; }

      return g.__CE2_AUDIO_LESSON__ || (g.lessonData && g.lessonData[0]);

    }

    function context() {

      if (teacher) return 'teacher:' + String(typeof g.idx !== 'undefined' ? g.idx : '') + ':' + String(g.__ce2AudioSlide || 0);

      var s = g.state || {};

      return [s.lesson, s.page, s.teacherTool, s.teacherSlide, s.say, s.practiceIndex].join('|');

    }

    function hideError() { var box = doc.getElementById('ce2AudioError'); if (box) box.remove(); }

    function status(name, detail) {
      if(typeof g.updateWritingAudioState === 'function') g.updateWritingAudioState();

      if (name === 'playing' || name === 'stopped' || name === 'finished') hideError();

      if (school && (name === 'stopped' || name === 'finished' || name === 'error')) doc.querySelectorAll('.speaking').forEach(function (el) { el.classList.remove('speaking'); });

      if (!teacher && g.state) {

        var snap = player && player.snapshot();

        g.state.fullReading = !!(snap && snap.kind === 'lesson' && !snap.paused);

        g.state.fullReadingPaused = !!(snap && snap.kind === 'lesson' && snap.paused);

      }

      if (name !== 'error' || !doc.body) return;

      hideError();

      var box = doc.createElement('div'); box.id = 'ce2AudioError'; box.setAttribute('role', 'alert');

      box.style.cssText = 'position:fixed;bottom:18px;left:18px;right:18px;z-index:99999;background:#fff;border:2px solid #b42318;border-radius:12px;padding:14px;box-shadow:0 4px 20px #0002;color:#172b4d;font-size:18px';

      var message = doc.createElement('span'); message.textContent = '这段朗读暂时无法播放，请重试。 Audio indisponible. ';

      var retryButton = doc.createElement('button'); retryButton.textContent = '重试 / Réessayer'; retryButton.onclick = detail.retry;

      var dismiss = doc.createElement('button'); dismiss.textContent = '关闭 / Fermer'; dismiss.onclick = function () { player.stop(); };

      box.appendChild(message); box.appendChild(retryButton); box.appendChild(dismiss); doc.body.appendChild(box);

    }

    var offlineMedia=doc.createElement('audio');offlineMedia.id='ce2-offline-audio';offlineMedia.preload='auto';offlineMedia.hidden=true;doc.body.appendChild(offlineMedia);
    function offlineAudio(src){offlineMedia.pause();offlineMedia.src=src;offlineMedia.muted=false;offlineMedia.volume=1;offlineMedia.load();return offlineMedia;}
    var player = createCe2AudioPlayer({Audio: offlineAudio, getMap: function () { return g.voiceAssetMap || {}; }, getContext: context,

      onStatus: status, onEntry: function (entry, index, kind) {

        if (teacher || kind !== 'lesson' || !g.state) return;

        if (entry.kind === 'reading') g.state.read = entry.readIndex;

        g.state.readingMode = false;

        if (typeof g.render === 'function') g.render();

        if (entry.kind === 'reading' && typeof g.scrollToCurrentReading === 'function') g.scrollToCurrentReading();

      }, onFinish: function () { if (g.state) { g.state.fullReading = false; g.state.fullReadingPaused = false; } }});

    g.ce2AudioPlayer = player; g.readingRole = readingRole;

    g.audioFor = function (text, role) { return player.source({text: text, role: role}); };

    g.speak = function (text, role) { player.start([{text: text, role: normalizeRole(role)}], {rate: role === 'slow' ? 0.8 : 1}); };

    g.speakBrowser = g.speak;

    g.stopSpeak = g.stopVoiceAudio = function () { player.stop(); };

    g.speakSequence = function (entries, rate) { player.start(entries, {rate: rate || 1}); };

    g.speakPair = function (question, answer, slow) {

      player.start([{text: question, role: 'narrator'}, {text: answer, role: 'narrator'}], {rate: slow ? 0.8 : 1});

    };

    g.speakReadingText = function (text, role) {

      var row = ((currentLesson() || {}).reading || []).find(function (r) { return textOf(r.zh) === textOf(text); });

      g.speak(text, role || readingRole(row));

    };

    g.speakReadingLine = function (index, slow) {

      var row = ((currentLesson() || {}).reading || [])[index]; if (!row) return;

      if (g.state) g.state.read = index;

      player.start([{text: row.zh, role: readingRole(row)}], {rate: slow ? 0.8 : 1});

    };

    g.speakCurrentReading = function (slow) { g.speakReadingLine((g.state || {}).read || 0, slow); };

    g.speakFullText = function () {

      var lesson = currentLesson(); if (!lesson) return;

      player.start(lessonReadingEntries(lesson), {kind: 'lesson'});

    };

    g.stopFullReading = function () { player.pause(); };

    g.continueFullReading = function () { if (!player.resume()) g.speakFullText(); };

    g.speakPractice = function (slow) {

      var q = doc.getElementById('practiceQuestion'), a = doc.getElementById('practiceAnswerText');

      if (q && q.textContent.indexOf('____') < 0) { g.speakPair(q.textContent, a ? a.textContent : '', slow); return; }

      var game = g.state && g.state.practiceGame;

      if (game && typeof g.practicePairMeta === 'function') {

        var pair = g.practicePairMeta(game, (game.answers || [])[0] || ''); g.speakPair(pair.q, pair.a, slow);

      }

    };

    g.speakSentenceModel = function () {

      var game = g.state && g.state.sentenceGame; if (!game) return;

      var answer = (game.answers || [])[0]; if (!answer) return;

      var text = game.make ? game.make(answer) : String(game.blank || '').replace('____', answer);

      if (typeof g.normalizeChineseSentence === 'function') text = g.normalizeChineseSentence(text);

      g.speak(text, 'narrator');

    };

    g.bindReadingControls = function () {

      doc.querySelectorAll('[data-read-action]').forEach(function (btn) { btn.onclick = function (event) {

        event.preventDefault(); var s = g.state, action = btn.dataset.readAction;

        if (action === 'full-read') { if (s.fullReadingPaused) g.continueFullReading(); else g.speakFullText(); return; }

        if (action === 'pause-read') { player.pause(); return; }

        if (action === 'continue-read') { g.continueFullReading(); return; }

        if (action === 'repeat' || action === 'slow') { g.speakCurrentReading(action === 'slow'); return; }

        if (action === 'toggle-py') s.showPy = !s.showPy;

        else if (action === 'toggle-fr') s.showFr = !s.showFr;

        else if (action === 'toggle-en') s.showEn = !s.showEn;

        else if (action === 'reading-mode') s.readingMode = !s.readingMode;

        else if (action === 'previous' || action === 'next') {

          player.stop(); s.read = Math.max(0, Math.min(currentLesson().reading.length - 1, (s.read || 0) + (action === 'next' ? 1 : -1)));

        }

        g.render();

      }; });

      doc.querySelectorAll('.read-sentence').forEach(function (el) { el.onclick = function () {

        g.speakReadingLine(Number(el.dataset.readIndex) || 0, false); g.render();

      }; });

    };

    g.bindSayControls = function () {

      function pair() {

        var l = currentLesson(), patterns = l.speakingPatterns && l.speakingPatterns.length ? l.speakingPatterns : (l.patterns || []);

        var p = patterns.length ? patterns[((g.state.say || 0) + patterns.length) % patterns.length] : {};

        return {q: p.prompt || p.title || (typeof p === 'string' ? p : '') || ((l.reading || [])[0] || {}).zh || l.titleZh,

          a: p.answer || ((l.reading || [])[g.state.read % (l.reading || []).length] || {}).zh || '', count: patterns.length};

      }

      function automatic(p) { player.start([{text: p.q, role: 'boy'}, {text: p.a, role: 'girl'}]); }

      doc.querySelectorAll('.say-card,.say-section .image-full').forEach(function (el) { el.onclick = function () {

        if (el.classList.contains('image-full')) { automatic(pair()); return; }

        g.speak(el.dataset.sayText, el.dataset.sayVoice);

      }; });

      doc.querySelectorAll('[data-say-action]').forEach(function (btn) { btn.onclick = function (event) {

        event.preventDefault(); var p = pair(), action = btn.dataset.sayAction;

        if (action === 'prev' || action === 'next') { player.stop(); if (p.count) g.state.say = ((g.state.say || 0) + p.count + (action === 'next' ? 1 : -1)) % p.count; g.render(); return; }

        if (action === 'listen-q') g.speak(p.q, 'boy');

        if (action === 'listen-a') g.speak(p.a, 'girl');

        if (action === 'auto' || action === 'image') automatic(p);

        if (action === 'practice') { g.speak('真棒，请再读一次。', 'narrator'); var fb = doc.getElementById('sayFeedback'); if (fb) fb.textContent = '⭐ 真棒！请注意声调和节奏，再读一次会更自然。'; }

      }; });

    };

    if (typeof g.render === 'function' && !teacher) {

      var originalRender = g.render;

      g.render = function () { player.syncContext(); var result = originalRender.apply(this, arguments); player.syncContext(); return result; };

    }

    if (typeof g.orderCardHtml === 'function') {

      var originalOrder = g.orderCardHtml;

      g.orderCardHtml = function (row, placed) {

        var html = originalOrder.call(this, row, placed), role = readingRole(row);

        return html.replace(/speak\(([^)]*)\)/g, 'speakReadingText($1,\'' + role + '\')');

      };

    }

    if (teacher) {

      g.readAll = function () { var lesson = currentLesson(); if (lesson) player.start(lessonReadingEntries(lesson), {kind: 'lesson'}); };

      if (typeof g.show === 'function') {

        var originalShow = g.show;

        g.show = function (index) { player.stop(); g.__ce2AudioSlide = Number(index) || 0; return originalShow.apply(this, arguments); };

      }

      function teacherReadingRow(target, text) {

        var lesson = currentLesson(), rows = lesson && lesson.reading || [];

        var index = Array.from(doc.querySelectorAll('.dialogue-line')).indexOf(target);

        if (rows[index] && textOf(rows[index].zh) === textOf(text)) return rows[index];

        return rows.find(function (row) { return textOf(row.zh) === textOf(text); });

      }

      doc.querySelectorAll('.dialogue-line').forEach(function (target) {

        var line = target.querySelector('.zh'), label = target.querySelector('b');

        var row = line && teacherReadingRow(target, line.textContent);

        if (row && label) label.textContent = row.speaker || row.s || '旁白';

      });

      doc.addEventListener('click', function (event) {

        var model = event.target && event.target.closest ? event.target.closest('.pattern-practice-zh') : null;

        if (model && model.textContent.indexOf('____') >= 0) {

          var card = model.closest('.pattern-practice-card'), game = null;

          try { game = card && JSON.parse(card.dataset.practice || '{}'); } catch (_) {}

          if (game && game.answers && game.answers.length && typeof g.practicePairMeta === 'function') {

            event.preventDefault(); event.stopImmediatePropagation();

            var pair = g.practicePairMeta(game, game.answers[0]); g.speakPair(pair.q, pair.a); return;

          }

        }

        var target = event.target && event.target.closest ? event.target.closest('.dialogue-line') : null;

        if (!target) return;

        var line = target.querySelector('.zh'), label = target.querySelector('b'); if (!line) return;

        var row = teacherReadingRow(target, line.textContent);

        event.preventDefault(); event.stopImmediatePropagation(); g.speak(line.textContent, readingRole(row || (label ? label.textContent : '')));

      }, true);

    }

    if (school) {

      g.speak = function (text, lang, element) {

        var role = element && element.dataset ? normalizeRole(element.dataset.voice) : 'narrator';

        player.start([{text: text, role: role}]);

        var snap = player.snapshot(); if (element && snap && !snap.failed) element.classList.add('speaking');

      };

      var pageRead = doc.getElementById('play');

      if (pageRead) pageRead.onclick = function () {

        var slide = doc.querySelector('.slide.active'); if (!slide) return;

        var lines = Array.from(slide.querySelectorAll('[data-voice][data-speak]'));

        if (lines.length) player.start(lines.map(function (el) { return {text: el.dataset.speak, role: normalizeRole(el.dataset.voice)}; }));

        else g.speak(slide.dataset.speak || slide.dataset.title, 'zh-CN', pageRead);

      };

    }

    if (typeof g.runGameAction === 'function') {

      var originalGame = g.runGameAction;

      g.runGameAction = function () { player.stop(); return originalGame.apply(this, arguments); };

    }

    g.addEventListener('pagehide', function () { player.stop(); });

    g.addEventListener('beforeunload', function () { player.stop(); });

    if (!teacher && typeof g.render === 'function') g.render();

    return player;

  }

  return {readingRole: readingRole, normalizeRole: normalizeRole, titleText: titleText, hasSpeech: hasSpeech,

    lessonReadingEntries: lessonReadingEntries, createCe2AudioPlayer: createCe2AudioPlayer, install: install};

});



