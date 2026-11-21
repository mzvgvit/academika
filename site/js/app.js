/* «Академика» — клиент: меню, запись, подбор, интерактивы, аналитика */
(function () {
  "use strict";

  // ---- аналитика: единый трекер (Яндекс Метрика / dataLayer, если подключены) ----
  function track(name, params) {
    params = params || {};
    params.page = location.pathname;
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: name }, params));
      if (window.ym && window.YA_METRIKA_ID) window.ym(window.YA_METRIKA_ID, "reachGoal", name, params);
    } catch (e) { /* аналитика не должна ломать сайт */ }
  }
  document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
    a.addEventListener("click", function () {
      track("phone_click", { place: a.closest(".mob-cta") ? "mob-cta" : a.closest("footer") ? "footer" : a.closest("header") ? "nav" : "body" });
    });
  });

  // ---- мобильное меню ----
  var burger = document.querySelector(".burger");
  var links = document.querySelector(".nav-links");
  if (burger && links) burger.addEventListener("click", function () { links.classList.toggle("open"); });

  // ---- модальная запись ----
  var modal = document.getElementById("book-modal");
  var step = 0;
  var steps = document.querySelectorAll("[data-step]");
  var dots = document.querySelectorAll(".stepper div");
  var msg = document.getElementById("book-msg");
  var data = { who: "", service: "", age: "Взрослый", time: "", doctor: "" };

  function show(n) {
    step = n;
    steps.forEach(function (s) { s.classList.toggle("vis", +s.dataset.step === n); });
    dots.forEach(function (d, i) { d.classList.toggle("on", i <= n); });
    var sn = document.getElementById("step-now"); if (sn) sn.textContent = n + 1;
    msg.className = "form-msg"; msg.textContent = "";
  }
  function fillDocSelect() {
    var sel = document.getElementById("f-doctor");
    if (!sel) return;
    if (data.doctor) {
      var hit = Array.prototype.some.call(sel.options, function (o) { return o.value === data.doctor; });
      if (!hit) { var o = document.createElement("option"); o.value = data.doctor; o.textContent = data.doctor; sel.appendChild(o); }
      sel.value = data.doctor;
    }
  }
  function openModal(pref) {
    if (pref) data.service = pref;
    fillWho();
    if (typeof modal.showModal === "function") modal.showModal();
    // обычная кнопка «Записаться» пропускает пустой первый шаг: сразу услуги для себя
    data.who = "Для себя"; data.age = "Взрослый";
    show(1); renderServices("adult"); fillDocSelect();
    track("book_open", { source: "button", prefilled_service: pref || "" });
  }
  function bookWith(service, who, age, kidMode) {
    data.service = service || "";
    data.who = who || "Для себя";
    data.age = age || "Взрослый";
    if (typeof modal.showModal === "function") modal.showModal();
    if (kidMode) { show(1); renderServices("kid"); }
    else { show(2); loadSlots(); }
    renderServices(kidMode ? "kid" : "adult"); // чтобы «Назад» показывал заполненный список
    if (kidMode) fillDocSelect();
    track("book_open", { source: kidMode ? "kid" : "quiz", prefilled_service: service || "" });
  }

  document.querySelectorAll("[data-book]").forEach(function (el) {
    el.addEventListener("click", function () {
      if (el.dataset.doctorPref) { data.doctor = el.dataset.doctorPref; }
      else data.doctor = "";
      if (el.dataset.book === "kid") { bookWith("", "Для ребёнка или подростка", "Ребёнок", true); fillDocSelect(); }
      else openModal();
    });
  });

  var SERVICES = [
    { name: "Первичный приём психиатра взрослых", price: "10 000 ₽" },
    { name: "Первичный приём детского психиатра", price: "13 000 ₽", kid: true },
    { name: "Консультация психотерапевта (к.м.н.)", price: "14 000 ₽" },
    { name: "Консультация клинического психолога", price: "8 000 ₽" },
    { name: "Консультация детского клинического психолога", price: "11 000 ₽", kid: true },
    { name: "Психоаналитик (взрослый / детско-родительская)", price: "9 000–11 000 ₽", kid: true },
    { name: "Нейрокогнитивный тренинг", price: "6 000 ₽", kid: true },
    { name: "Арт-терапия", price: "6 500 ₽", kid: true },
    { name: "Приём невролога", price: "6 000 ₽" },
    { name: "Приём педиатра", price: "6 000 ₽", kid: true },
    { name: "Тест Векслера / нейропсихологическое обследование", price: "10 000–18 000 ₽", kid: true },
    { name: "Дневной стационар", price: "по программе" },
  ];

  function renderServices(mode) {
    var wrap = document.getElementById("svc-list");
    if (!wrap) return;
    wrap.innerHTML = "";
    SERVICES.forEach(function (s) {
      if (mode === "kid" && !s.kid) return;
      if (mode === "adult" && s.kid) return;
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = s.name + (s.price ? " · " + s.price : "");
      b.style.cssText = "padding:12px 16px;border-radius:14px;border:1.5px solid var(--line);background:#fff;cursor:pointer;font:600 .9rem var(--font-body);text-align:left";
      b.addEventListener("click", function () {
        data.service = s.name + (s.price ? " (" + s.price + ")" : "");
        track("service_select", { service: s.name, age: data.who });
        show(2); loadSlots();
      });
      wrap.appendChild(b);
    });
  }

  function fillWho() {
    var w = document.getElementById("f-who");
    if (!w) return;
    w.innerHTML = "";
    [["Для себя", "Взрослый"], ["Для ребёнка или подростка", "Ребёнок"], ["Для пары или семьи", "Семья"]].forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = p[0];
      b.style.cssText = "padding:14px 18px;border-radius:14px;border:1.5px solid var(--line);background:#fff;cursor:pointer;font:600 .95rem var(--font-body)";
      b.addEventListener("click", function () {
        data.who = p[0]; data.age = p[1];
        track("service_select", { service: "(категория) " + p[0], age: p[1] });
        show(1);
        renderServices(p[1] === "Ребёнок" ? "kid" : "adult");
      });
      w.appendChild(b);
    });
  }

  // ---- слоты ----
  var dateInput = document.getElementById("f-date");
  function today() { var d = new Date(); var p = function (x) { return (x < 10 ? "0" : "") + x; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function loadSlots() {
    if (!dateInput || !dateInput.value) {
      dateInput.value = today();
    }
    var box = document.getElementById("slot-list");
    box.innerHTML = "<span style='color:var(--ink-soft);font-size:.85rem'>Загружаю время…</span>";
    fetch("/api/slots?date=" + dateInput.value).then(function (r) { return r.json(); }).then(function (j) {
      box.innerHTML = "";
      if (!j.slots) { box.textContent = "Не удалось получить слоты — позвоните нам: +7 (495) 120-02-62"; return; }
      if (!j.slots.length) {
        var note = document.createElement("div");
        note.style.cssText = "grid-column:1/-1;color:var(--ink-soft);font-size:.9rem";
        var when = j.next && j.next !== dateInput.value ? new Date(j.next).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" }) : "";
        note.innerHTML = "На эту дату свободного времени нет." + (when ? " Ближайшее: <b>" + when + "</b>." : "");
        box.appendChild(note);
        if (j.next) {
          var jump = document.createElement("button");
          jump.type = "button"; jump.className = "btn btn-ghost"; jump.style.padding = "10px 18px";
          jump.textContent = "Взять ближайший день";
          jump.addEventListener("click", function () { dateInput.value = j.next; loadSlots(); });
          box.appendChild(jump);
        }
        return;
      }
      j.slots.forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = t;
        if (t === data.time) b.classList.add("sel");
        b.addEventListener("click", function () {
          data.time = t;
          box.querySelectorAll("button").forEach(function (x) { x.classList.remove("sel"); });
          b.classList.add("sel");
          track("slot_selected", { date: dateInput.value, time: t, service: data.service });
          show(3);
        });
        box.appendChild(b);
      });
    }).catch(function () { box.textContent = "Ошибка сети — позвоните нам: +7 (495) 120-02-62"; });
  }
  if (dateInput) {
    dateInput.min = today();
    if (!dateInput.value) dateInput.value = today();
    dateInput.addEventListener("change", loadSlots);
  }

  // ---- финальный шаг, отправка ----
  var form = document.getElementById("book-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (step !== 3) return; // Enter на ранних шагах не должен отправлять форму
      var btn = form.querySelector("button[type=submit]");
      var fldoctor = document.getElementById("f-doctor");
      if (fldoctor) data.doctor = fldoctor.value || "";
      data.name = document.getElementById("f-name").value.trim();
      data.phone = document.getElementById("f-phone").value.trim();
      data.email = document.getElementById("f-email").value.trim();
      data.comment = document.getElementById("f-comment").value.trim();
      data.consent = document.getElementById("f-consent").checked;
      data.date = dateInput.value;
      data.who = data.who || "Для себя";
      if (btn) { btn.disabled = true; btn.textContent = "Отправляю…"; }
      var attempt = (form.dataset.attempts | 0) + 1;
      form.dataset.attempts = attempt;
      fetch("/api/booking", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) {
            msg.className = "form-msg err"; msg.textContent = res.j.error || "Ошибка";
            track("booking_result", { status: "error", error: res.j.error, attempt: attempt });
            if (/(занято|недоступно)/.test(res.j.error || "")) show(2);
            return;
          }
          track("booking_result", { status: "success", service: data.service, date: data.date, time: data.time, has_email: !!data.email, attempt: attempt });
          msg.className = "form-msg ok";
          msg.innerHTML =
            "<b>Записаны: " + data.date + " в " + data.time + "</b><br>" +
            "ул. Трубная, 29, стр. 6 · Москва<br>" +
            "Администратор позвонит вам и подтвердит запись." +
            (data.email ? " Подтверждение отправлено на " + data.email + "." : "");
          if (btn) { btn.hidden = true; }
          form.dataset.attempts = 0;
          setTimeout(function () { modal.close(); }, 12000);
        })
        .catch(function () {
          msg.className = "form-msg err";
          msg.textContent = "Ошибка сети. Позвоните: +7 (495) 120-02-62";
          track("booking_result", { status: "error", error: "network", attempt: attempt });
        })
        .finally(function () { if (btn && !btn.hidden) { btn.disabled = false; btn.textContent = "Записаться"; } });
    });
  }

  document.querySelectorAll("[data-back]").forEach(function (b) {
    b.addEventListener("click", function () { show(Math.max(0, step - 1)); });
  });
  modal && modal.addEventListener("close", function () { data.time = ""; });
  document.querySelectorAll(".modal-close").forEach(function (b) {
    b.addEventListener("click", function () { modal.close(); });
  });

  // ---- дыхание 4-7-8 (текст — «пауза можно пропустить») ----
  var bc = document.getElementById("breath-circle");
  if (bc) {
    var label = bc.querySelector("span");
    var stepsEl = document.getElementById("breath-steps");
    var phase = 0, running = false;
    var plan = [
      { t: "На вдохе…", ms: 4000, big: true },
      { t: "Пауза (не успеваешь — выдыхай)", ms: 7000, big: true },
      { t: "Выдох…", ms: 8000, big: false },
    ];
    function tick() {
      if (!running) return;
      var p = plan[phase % plan.length];
      label.textContent = p.t;
      stepsEl.textContent = "Цикл " + (Math.floor(phase / 3) + 1) + " из 4 · вдох 4 · пауза 7 · выдох 8. Секунды — ориентир: дышать удобно, не по секундомеру.";
      bc.classList.toggle("big", p.big);
      phase++;
      setTimeout(tick, p.ms);
      if (phase === 12) {
        running = false;
        setTimeout(function () {
          label.textContent = "Ещё раз?";
          stepsEl.textContent = "Готово. Как самочувствие?";
          bc.classList.remove("big");
        }, 8000);
      }
    }
    bc.addEventListener("click", function () {
      if (running) return;
      running = true; phase = 0; tick();
      track("kids_engagement", { widget: "breath" });
    });
  }

  // ---- экспресс-подбор специалиста (3 вопроса) ----
  var quizAnswers = {};
  var QUIZ_MAP = {
    'psi': { title: 'Начнёте с врача-психиатра', text: 'Тревога и настроение — его профессия. На первом приёме (50 минут) врач оценит состояние и предложит тактику: психотерапию, поддержку или медикаменты.', service: 'Первичный приём психиатра взрослых', who: 'Для себя' },
    'burn': { title: 'Начнёте с клинического психолога', text: '«Ничего не радует» и хроническая усталость — запрос, с которым работают психолог и психотерапевт: первый разговор выстроит план, откуда брать силы.', service: 'Консультация клинического психолога', who: 'Для себя' },
    'sleep': { title: 'Начнёте с врача-психиатра', text: 'Когда сбивается сон, важно успеть оценить состояние целиком — это делает психиатр и подбирает терапию.', service: 'Первичный приём психиатра взрослых', who: 'Для себя' },
    'fam': { title: 'Подойдёт семейная консультация', text: 'Пара и семья — формат, где работают с отношением, а не с одним человеком. Есть супружеское консультирование и детско-родительские встречи.', service: 'Консультация психотерапевта (к.м.н.)', who: 'Для пары или семьи' },
    'kid-emo': { title: 'Начнёте с детского психиатра', text: 'Первый приём детского психиатра — 80 минут: время освоиться, поиграть и разобраться. Дальше план выстраивается вместе с вами.', service: 'Первичный приём детского психиатра', who: 'Для ребёнка', kid: true },
    'kid-learn': { title: 'Начнёте с детского психолога', text: 'Обучение, речь и внимание — территория детского клинического психолога и нейропсихолога: обследование в игровой форме и занятия.', service: 'Консультация детского клинического психолога', who: 'Для ребёнка', kid: true },
    'body': { title: 'Начнёте с соматического специалиста', text: 'Боли, ЖКТ и сердце разбирают невролог, терапевт или кардиолог. При необходимости к работе подключат психотерапию.', service: 'Приём невролога', who: 'Для себя' },
  };
  document.querySelectorAll('.q-opts').forEach(function (group) {
    group.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        group.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        quizAnswers[group.dataset.q] = b.dataset.r;
        if (group.dataset.q === '3') runQuiz();
      });
    });
  });
  function runQuiz() {
    if (!QUIZ_MAP[quizAnswers[1]]) return;
    var r = QUIZ_MAP[quizAnswers[1]];
    var hints = {
      'recent': 'Недавно началось — самый простой сценарий для терапии.',
      'months': 'Если тянется месяцами, помочь может короткий курс с проверяемым планом.',
      'years': 'Проблема, которая тянется долго, — не значит безнадёжная: с хроническими состояниями работают регулярно и бережно.',
      'talk': 'Первый разговор с любым специалистом клиники уже прояснит направление.',
      'meds': 'Назначить и скорректировать препараты может психиатр или врач-психотерапевт.',
      'tests': 'Диагностику (обследование, тесты) подберёт врач — сдавать всё заранее не нужно.',
    };
    document.getElementById('qr-title').textContent = r.title;
    document.getElementById('qr-text').textContent = r.text + ' ' + (hints[quizAnswers[2]] || '') + ' ' + (hints[quizAnswers[3]] || '');
    var qrBook = document.getElementById('qr-book');
    qrBook.dataset.svc = r.service;
    qrBook.dataset.who = r.who;
    qrBook.dataset.kid = r.kid ? "1" : "";
    var res = document.getElementById('q-result');
    res.classList.add('show');
    res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    track('quiz_result', { problem: quizAnswers[1], duration: quizAnswers[2], entry: quizAnswers[3], kid: !!r.kid });
  }
  var qrBook = document.getElementById('qr-book');
  qrBook && qrBook.addEventListener('click', function () {
    bookWith(qrBook.dataset.svc, qrBook.dataset.who, qrBook.dataset.kid === "1" ? 'Ребёнок' : 'Взрослый', qrBook.dataset.kid === "1");
  });
  var qrAgain = document.getElementById('qr-again');
  qrAgain && qrAgain.addEventListener('click', function () {
    quizAnswers = {};
    document.querySelectorAll('.q-opts button.on').forEach(function (b) { b.classList.remove('on'); });
    document.getElementById('q-result').classList.remove('show');
  });

  // ---- дневник настроения (неделя, дети) ----
  var mwDays = document.getElementById('mw-days');
  if (mwDays) {
    var FACES = ['·', '🙂', '😐', '😟', '😖'];
    var FACE_TITLES = ['—', 'было хорошо', 'обычный день', 'было трудно', 'очень трудно'];
    var NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var stored = [];
    try { stored = JSON.parse(localStorage.getItem('aka-mood-week') || '[]'); } catch (e) { stored = []; }
    function mwSave() { try { localStorage.setItem('aka-mood-week', JSON.stringify(stored)); } catch (e) {} }
    function mwNote() {
      var filled = stored.filter(function (v) { return v > 0; });
      var note = document.getElementById('mw-note');
      if (!filled.length) { note.textContent = 'Пустая неделя — тоже результат. Заполняйте постепенно, никто не торопится.'; return; }
      var hard = filled.filter(function (v) { return v >= 3; }).length;
      var veryHard = filled.filter(function (v) { return v >= 4; }).length;
      if (veryHard >= 5) {
        note.innerHTML = 'На этой неделе почти каждый день был очень трудным — так долго тяжело, и это важно. Ты не обязан(а) справляться в одиночку: поговори со взрослым, которому доверяешь. Если поговорить не с кем или страшно — позвони бесплатно и анонимно, круглосуточно: <a href="tel:88002000122">8-800-2000-122</a> (телефон доверия для детей и подростков). Мы тоже рядом, но ждать записи, чтобы стало легче, не нужно.';
      } else if (hard >= 3) {
        note.textContent = 'Трудных дней за неделю: ' + hard + '. Если это повторяется не одну неделю — расскажи об этом близкому взрослому и вместе обсуди с детским психологом. И никто не запрещает просто прийти и посмотреть, как это устроено.';
      } else {
        note.textContent = 'Отмечено дней: ' + filled.length + '. Трудные дни бывают у всех — один-два за неделю это обычная жизнь. С такой картинкой тоже можно прийти к психологу, а можно просто ничего не делать.';
      }
    }
    for (var i = 0; i < 7; i++) (function (i) {
      var d = document.createElement('button');
      d.type = 'button'; d.className = 'mw-day';
      var v = stored[i] || 0;
      function paint() {
        d.innerHTML = '<span class="face">' + (FACES[v] || '·') + '</span>' + NAMES[i];
        d.title = FACE_TITLES[v];
      }
      paint();
      d.addEventListener('click', function () {
        v = (v + 1) % FACES.length;
        stored[i] = v; mwSave(); paint(); mwNote();
        track('kids_engagement', { widget: 'mood-diary' });
      });
      mwDays.appendChild(d);
    })(i);
    document.getElementById('mw-reset').addEventListener('click', function () {
      stored = []; mwSave(); location.reload();
    });
    mwNote();
  }

  // ---- появление секций при скролле ----
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); obs.unobserve(en.target); }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('section > .wrap, .hero .wrap').forEach(function (el) {
      el.classList.add('reveal');
      obs.observe(el);
    });
    requestAnimationFrame(function () {
      document.querySelectorAll('.reveal').forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.9) el.classList.add('in');
      });
    });
  }

  // ---- уголок настроения ----
  var moods = document.getElementById("moods");
  if (moods) {
    var NOTES = {
      "🙂": ["Радость — здорово!", "Нарисуй этот день. Если захочешь, расскажешь о нём на приёме — ничего никуда не отправляется само.",
            "«Мне плохо, даже когда всё хорошо» — это тоже повод поговорить с психологом."],
      "😟": ["Иногда тревожно — это нормально и с этим работают.",
            "Попробуй дыхание выше: вдох 4, пауза 7, выдох 8.",
            "Детский психолог умеет превращать «не могу» в «получается». Можно записаться так же, как к врачу."],
      "😠": ["Злость — это энергия, она бывает нужна. Важно, куда она идёт.",
            "Попробуй «выпустить злость на бумагу»: зачеркни всё, что злит.",
            "Есть занятия по эмоциональной регуляции — попроси родителей выбрать «для ребёнка» при записи."],
      "😴": ["Устать — нормально. Иногда усталость — это сигнал, что сил не хватает: об этом тоже можно говорить."],
      "🤔": ["Думать о себе — уже взрослое дело.",
            "Группы для подростков: там обсуждают именно то, что волнует, без лекций.",
            "Можно записаться и просто поговорить с психологом один раз."],
      "😔": ["Грустить — можно. Если грусть не отпускает много дней подряд, это важно, а не «плаксивость».",
            "Расскажи тому взрослому, которому доверяешь; рядом есть бесплатный круглосуточный телефон доверия <a href='tel:88002000122'>8-800-2000-122</a>.",
            "В клинике про грусть тоже разговаривают — мягко и по желанию."],
    };
    var note = document.getElementById("mood-note");
    moods.querySelectorAll(".mood").forEach(function (m) {
      m.addEventListener("click", function () {
        moods.querySelectorAll(".mood").forEach(function (x) { x.classList.remove("sel"); });
        m.classList.add("sel");
        var n = NOTES[m.dataset.mood] || [];
        note.classList.add("show");
        note.innerHTML =
          "<b>" + m.dataset.mood + " " + (m.title || "") + "</b><ul style='margin:10px 0 0 18px'>" +
          n.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>";
        track("kids_engagement", { widget: "moods", mood: m.dataset.mood });
      });
    });
  }
})();
