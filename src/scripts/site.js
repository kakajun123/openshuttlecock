// Open Shuttlecock. Small progressive enhancements; every page works without this file.
(function () {
  'use strict';

  // Entrances: reveal each marked part once, as it comes into view.
  var risers = [].slice.call(document.querySelectorAll('[data-rise]'));
  var show = function (el) { el.classList.add('is-in'); };
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { show(entry.target); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    risers.forEach(function (el) { io.observe(el); });
  } else {
    risers.forEach(show);
  }
  // Safety net: nothing stays hidden if the observer never fires.
  window.addEventListener('load', function () {
    setTimeout(function () {
      risers.forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight) show(el);
      });
    }, 1200);
  });

  // Tabs: without script every panel is shown, one under the other.
  [].forEach.call(document.querySelectorAll('[data-tabs]'), function (root) {
    var tabs = [].slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = [].slice.call(root.querySelectorAll('[role="tabpanel"]'));
    var select = function (index, focus) {
      tabs.forEach(function (tab, i) {
        tab.setAttribute('aria-selected', String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
        panels[i].hidden = i !== index;
      });
      if (focus) tabs[index].focus();
    };
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i, false); });
      tab.addEventListener('keydown', function (event) {
        var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        select((i + step + tabs.length) % tabs.length, true);
      });
    });
    select(0, false);
  });

  // Menus close when the visitor clicks elsewhere or presses Escape.
  [].forEach.call(document.querySelectorAll('[data-menu]'), function (menu) {
    document.addEventListener('click', function (event) {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    menu.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); }
    });
  });

  // Remember a language the visitor picked by hand.
  [].forEach.call(document.querySelectorAll('[data-lang]'), function (link) {
    link.addEventListener('click', function () {
      try { localStorage.setItem('lang', link.getAttribute('data-lang')); } catch (e) {}
    });
  });

  // Question form: until the submission service is live, hand the question to the visitor's email app.
  var form = document.querySelector('[data-ask]');
  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var question = form.elements.question.value.trim();
      var email = form.elements.email.value.trim();
      var body = question + (email ? '\n\n' + email : '');
      var note = form.querySelector('[data-sent]');
      if (note) note.hidden = false;
      location.href = 'mailto:' + form.getAttribute('data-email') +
        '?subject=' + encodeURIComponent(form.getAttribute('data-subject')) +
        '&body=' + encodeURIComponent(body);
    });
  }
})();
