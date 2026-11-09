// Open Shuttlecock static site generator.
// Zero dependencies: `node build.mjs` writes the whole site to ./dist.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = import.meta.dirname;
const SRC = path.join(ROOT, 'src');
const CONTENT = path.join(ROOT, 'content');
const DIST = path.join(ROOT, 'dist');

const SITE = {
  url: 'https://openshuttlecock.com',
  email: 'hello@openshuttlecock.com',
  repo: 'https://github.com/kakajun123/openshuttlecock',
};
// Languages with a finished dictionary. The first one is the fallback.
const LANG_ORDER = ['en', 'zh', 'ms', 'id', 'th', 'ja', 'ko', 'hi'];
const LANGS = LANG_ORDER.filter((code) => fs.existsSync(path.join(SRC, 'i18n', `${code}.json`)));
const DEFAULT_LANG = 'en';
// Knowledge articles exist in these languages; others fall back to English.
const ARTICLE_LANGS = ['en', 'zh'];

/* ---------- helpers ---------- */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function write(relPath, html) {
  const file = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

// A small Markdown subset: ## headings, paragraphs, "- " lists, **bold**, [text](url).
function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
}

function markdown(source) {
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
    list = null;
  };
  for (const raw of source.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (line.startsWith('## ')) {
      flushPara();
      flushList();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith('- ')) {
      flushPara();
      (list ||= []).push(line.slice(2));
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return out.join('\n');
}

function readArticle(file) {
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Missing front matter: ${file}`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { ...meta, order: Number(meta.order || 99), html: markdown(match[2]) };
}

function loadArticles(lang, section = 'knowledge') {
  const dir = path.join(CONTENT, section, lang);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ slug: f.replace(/\.md$/, ''), ...readArticle(path.join(dir, f)) }))
    .sort((a, b) => a.order - b.order);
}

const img = (file, alt, { w, h, lazy = true, cls = '' } = {}) =>
  `<img src="/assets/img/${file}" alt="${esc(alt)}"${w ? ` width="${w}" height="${h}"` : ''}${
    lazy ? ' loading="lazy" decoding="async"' : ''
  }${cls ? ` class="${cls}"` : ''}>`;

/* ---------- shared layout ---------- */

const NAV = [
  ['knowledge', 'knowledge/'],
  ['ask', 'ask/'],
  ['records', 'records/'],
  ['factories', 'factories/'],
  ['about', 'about/'],
];

function navTiles(t, lang, current, pagePath) {
  const links = NAV.map(
    ([key, href]) =>
      `<a class="tile nav-tile" href="/${lang}/${href}"${current === key ? ' aria-current="page"' : ''}>${esc(
        t.nav[key],
      )}</a>`,
  ).join('');
  const langs = LANGS.filter((code) => code !== lang)
    .map(
      (code) =>
        `<li><a href="/${code}/${pagePath}" hreflang="${code}" lang="${code}" data-lang="${code}">${esc(
          DICTS[code].langName,
        )}</a></li>`,
    )
    .join('');
  return `${links}<details class="tile nav-tile nav-lang" data-menu><summary><span class="sr">${esc(
    t.nav.language,
  )}: </span>${esc(t.langName)}</summary><ul>${langs}</ul></details>`;
}

function footer(t, lang) {
  const word = (text) =>
    [...text]
      .map((ch, i) => `<span class="mark-block" data-ch="${ch}" style="--h:${[100, 72, 88, 64, 94, 78, 60, 84, 70, 96, 66][i % 11]}%"></span>`)
      .join('');
  const credits = CREDITS.map(
    (c) =>
      `<li><a href="${esc(c.page)}" rel="noopener">${esc(c.title)}</a>, ${esc(c.creator)}, <a href="${esc(
        c.licenceUrl,
      )}" rel="noopener license">${esc(c.licence)}</a></li>`,
  ).join('');
  return `
<footer class="footer">
  <div class="mark" role="img" aria-label="Open Shuttlecock">
    <div class="mark-word">${word('OPEN')}</div>
    <div class="mark-word mark-word-long">${word('SHUTTLECOCK')}</div>
  </div>
  <div class="footer-grid">
    <nav class="footer-links" aria-label="${esc(t.site.name)}">
      ${NAV.map(([key, href]) => `<a href="/${lang}/${href}">${esc(t.nav[key])}</a>`).join('')}
      <a href="${SITE.repo}" rel="noopener">${esc(t.footer.source)}</a>
      <a href="mailto:${SITE.email}">${esc(t.footer.email)}</a>
      <a href="/${lang}/privacy/">${esc(t.legal.privacy)}</a>
      <a href="/${lang}/terms/">${esc(t.legal.terms)}</a>
    </nav>
    <div class="footer-notes">
      <p>${esc(t.footer.run)}</p>
      <p>${esc(t.footer.region)}</p>
      <p>${esc(t.footer.licence)}</p>
    </div>
    <details class="footer-credits">
      <summary>${esc(t.footer.credits)}</summary>
      <p>${esc(t.footer.creditsNote)}</p>
      <ul>${credits}</ul>
    </details>
  </div>
  <div class="footer-last">
    <span>© 2026 SP x SPORT</span>
    <a class="button button-small" href="#top">${esc(t.footer.top)}</a>
  </div>
</footer>`;
}

function layout({ t, lang, pagePath, title, description, body, current }) {
  const alternates = LANGS.map(
    (code) => `<link rel="alternate" hreflang="${code}" href="${SITE.url}/${code}/${pagePath}">`,
  ).join('\n  ');
  return `<!doctype html>
<html lang="${lang}" dir="${t.dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description || t.site.description)}">
  <link rel="canonical" href="${SITE.url}/${lang}/${pagePath}">
  ${alternates}
  <link rel="alternate" hreflang="x-default" href="${SITE.url}/${DEFAULT_LANG}/${pagePath}">
  <link rel="stylesheet" href="/assets/fonts.css">
  <link rel="stylesheet" href="/assets/site.css">
  <script>document.documentElement.classList.add('js')</script>
</head>
<body id="top" data-page="${current}">
<a class="skip" href="#main">${esc(t.site.skip)}</a>
${body}
${footer(t, lang)}
<script src="/assets/site.js" defer></script>
</body>
</html>
`;
}

// Header for every page except the home page.
function pageHeader(t, lang, current, pagePath) {
  return `
<header class="top">
  <a class="tile top-name" href="/${lang}/" lang="en">${esc(t.site.name)}</a>
  <nav class="top-nav" aria-label="${esc(t.site.name)}">${navTiles(t, lang, current, pagePath)}</nav>
</header>`;
}

function pageTitle(p, photo) {
  return `
  <div class="tile title-tile c-7">
    <h1 data-rise>${esc(p.h1)}</h1>
    <p class="statement" data-rise style="--i:1">${esc(p.statement)}</p>
  </div>
  <div class="tile t-photo c-5 title-photo" data-rise style="--i:2">${img(photo, p.alt, { lazy: false })}</div>`;
}

const bandList = (items) =>
  `<ul class="bands">${items
    .map(
      (item, i) =>
        `<li class="band" data-rise style="--i:${i}"><span class="band-title">${esc(item.title)}</span><span class="band-note">${esc(
          item.note,
        )}</span></li>`,
    )
    .join('')}</ul>`;

const plainList = (items) => `<ul class="plain">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;

/* ---------- pages ---------- */

function homePage(t, lang) {
  const h = t.home;
  const thumbs = [
    img('shuttle-side-dark.jpg', h.how.slots[0]),
    img('shuttle-lying-dark.jpg', h.how.slots[1], { cls: 'zoom' }),
    img('shuttles-bright.jpg', h.how.slots[2], { cls: 'zoom-top' }),
  ];
  const card = (filled) => `
      <div class="shot-card" data-ui>
        <p class="shot-card-title">${esc(h.how.cardTitle)}</p>
        <ul class="shot-slots">
          ${h.how.slots
            .map(
              (label, i) =>
                `<li class="shot-slot${i < filled ? ' is-filled' : ''}">${
                  i < filled ? `<span class="shot-thumb">${thumbs[i]}</span>` : `<span class="shot-empty">${esc(h.how.empty)}</span>`
                }<span class="shot-label">${esc(label)}</span></li>`,
            )
            .join('')}
        </ul>
        ${
          filled === 4
            ? `<p class="shot-result"><strong>${esc(h.how.result)}</strong><span>${esc(h.how.resultNote)}</span></p>`
            : `<p class="shot-progress">${esc(h.how.progress[filled - 1])}</p>`
        }
      </div>`;
  const fields = h.how.clauses
    .map(
      (clause, i) => `
    <div class="how-field how-field-${i + 1}" data-rise style="--i:${i}">
      ${i === 0 ? `<h2 class="how-heading">${esc(h.how.heading)}</h2>` : ''}
      ${card(i === 3 ? 4 : i + 1)}
      <p class="how-clause">${esc(clause)}</p>
    </div>`,
    )
    .join('');

  const rows = h.sample.rows
    .map(
      (row, i) => `
      <details class="row" name="sample-row"${i === 5 ? ' open' : ''}>
        <summary>
          <span class="row-name">${esc(row.name)}</span>
          <span class="row-value">${esc(row.value)}</span>
          <span class="row-conf conf-${row.conf}"><span class="sr">${esc(h.sample.confidenceLabel)}: </span>${esc(
            h.sample.confidence[row.conf],
          )}</span>
        </summary>
        <p class="row-detail">${esc(row.detail)}</p>
      </details>`,
    )
    .join('');

  const tabs = h.limits.tabs;
  const tabButtons = tabs
    .map(
      (tab, i) =>
        `<button class="tab" type="button" role="tab" id="tab-${i}" aria-controls="panel-${i}" aria-selected="${
          i === 0
        }"><span class="tab-name">${esc(tab.name)}</span><span class="tab-note">${esc(tab.note)}</span></button>`,
    )
    .join('');
  const tabPanels = tabs
    .map(
      (tab, i) =>
        `<div class="panel" role="tabpanel" id="panel-${i}" aria-labelledby="tab-${i}"><h3 class="panel-heading">${esc(
          tab.name,
        )}</h3>${bandList(tab.items)}</div>`,
    )
    .join('');

  const openPhotos = ['shuttle-standing-dark.jpg', 'shuttles-grass.jpg', 'shuttle-lying-dark.jpg', 'shuttle-used-table.jpg'];
  const openTiles = h.open.tiles
    .map(
      (tile, i) => `
      <figure class="open-tile" data-rise style="--i:${i}">
        <div class="tint tint-${i + 1}">${img(openPhotos[i], tile.alt)}</div>
        <figcaption><span class="open-name">${esc(tile.name)}</span><span class="open-role">${esc(tile.role)}</span></figcaption>
      </figure>`,
    )
    .join('');

  const marquee = `<span>${esc(h.marquee)} · </span>`.repeat(6);

  const body = `
<header class="hero">
  <div class="hero-name"><h1 lang="en">${esc(t.site.name)}</h1></div>
  <nav class="hero-nav" aria-label="${esc(t.site.name)}">${navTiles(t, lang, 'home', '')}</nav>
  <div class="hero-left">
    <div class="tile t-photo hero-portrait">${img('shuttles-bright.jpg', h.railAlt, { lazy: false })}</div>
    <div class="tile hero-facts">${plainList(h.facts)}</div>
  </div>
  <div class="hero-centre">
    ${img('shuttle-side-dark.jpg', h.heroAlt, { lazy: false, cls: 'drift' })}
    <div class="tile hero-statement"><p class="statement">${esc(h.statement)}</p></div>
  </div>
  <div class="hero-rail">
    ${h.rail.map((text, i) => `<div class="tile rail-tile rail-${i + 1}">${esc(text)}</div>`).join('')}
    <a class="tile rail-tile rail-action" href="#sample">${esc(h.action)}</a>
  </div>
</header>

<main id="main">
  <section class="how" aria-label="${esc(h.how.heading)}">${fields}
  </section>

  <section class="sample" id="sample">
    <div class="sample-head" data-rise>
      <h2>${esc(h.sample.heading)}</h2>
      <p class="sample-note">${esc(h.sample.note)}</p>
    </div>
    <div class="sample-board" data-ui data-rise style="--i:1">
      <p class="sample-warning">${esc(h.sample.warning)}</p>
      ${rows}
    </div>
  </section>

  <div class="marquee" aria-hidden="true"><div class="marquee-track">${marquee}</div></div>

  <section class="limits">
    <div class="limits-head" data-rise>
      <h2><span class="soft">${esc(h.limits.headingSoft)}</span> ${esc(h.limits.headingFull)}</h2>
      <a class="button" href="/${lang}/knowledge/what-photos-cannot-tell/">${esc(h.limits.button)}</a>
    </div>
    <div class="limits-body" data-tabs>
      <div class="tabs" role="tablist" data-rise style="--i:1">${tabButtons}</div>
      <div class="panels" data-rise style="--i:2">${tabPanels}</div>
    </div>
  </section>

  <section class="open">
    <h2 data-rise>${esc(h.open.heading)}</h2>
    <div class="open-grid">${openTiles}
    </div>
  </section>

  <section class="cta" aria-labelledby="cta-heading">
    <div class="cta-flank cta-photo" data-rise>${img('shuttle-used-racket.jpg', h.cta.alt)}</div>
    <div class="cta-main" data-rise style="--i:1">
      <h2 id="cta-heading">${esc(h.cta.heading)}</h2>
      <p>${esc(h.cta.text)}</p>
      <a class="button button-paper" href="/${lang}/factories/">${esc(h.cta.button)}</a>
    </div>
    <div class="cta-flank cta-colour" data-rise style="--i:2"></div>
  </section>
</main>`;
  return layout({ t, lang, pagePath: '', title: h.title, body, current: 'home' });
}

function factoriesPage(t, lang) {
  const p = t.factories;
  const mail = `mailto:${SITE.email}?subject=${encodeURIComponent(p.mailSubject)}&body=${encodeURIComponent(p.mailBody)}`;
  const body = `
${pageHeader(t, lang, 'factories', 'factories/')}
<main id="main" class="board">
  ${pageTitle(p, 'shuttle-standing-dark.jpg')}
  <section class="tile t-paper c-6" data-rise>
    <h2>${esc(p.giveHeading)}</h2>
    ${plainList(p.give)}
  </section>
  <section class="tile t-deep c-6" data-rise style="--i:1">
    <h2>${esc(p.getHeading)}</h2>
    ${plainList(p.get)}
  </section>
  <section class="tile c-7" data-rise>
    <h2>${esc(p.termsHeading)}</h2>
    ${bandList(p.terms)}
  </section>
  <section class="tile t-tan c-5" data-rise style="--i:1">
    <h2>${esc(p.sampleHeading)}</h2>
    <div class="listing" data-ui>
      <p class="listing-name">${esc(p.sample.name)}</p>
      <dl>${p.sample.fields.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    </div>
    <p class="note">${esc(p.sampleNote)}</p>
  </section>
  <div class="tile t-photo c-3 side-photo" data-rise>${img('shuttles-bright.jpg', t.home.railAlt)}</div>
  <section class="tile t-paper c-4" data-rise style="--i:1">
    <h2>${esc(p.openHeading)}</h2>
    <p>${esc(p.openText)}</p>
  </section>
  <section class="tile t-accent c-5" data-rise style="--i:2">
    <h2>${esc(p.contactHeading)}</h2>
    <p>${esc(p.contactText)}</p>
    <a class="button button-paper" href="${esc(mail)}">${esc(p.contactButton)}</a>
  </section>
</main>`;
  return layout({ t, lang, pagePath: 'factories/', title: `${p.title} · ${t.site.name}`, description: p.statement, body, current: 'factories' });
}

function knowledgePage(t, lang, articles) {
  const p = t.knowledge;
  const fills = ['t-paper', 't-deep', 't-tan'];
  const tiles = articles
    .map(
      (a, i) => `
  <a class="tile article-tile ${fills[i % fills.length]} c-4" href="/${lang}/knowledge/${a.slug}/" data-rise style="--i:${i}">
    <h3>${esc(a.title)}</h3>
    <p>${esc(a.summary)}</p>
    <span class="article-read">${esc(p.read)}</span>
  </a>`,
    )
    .join('');
  const body = `
${pageHeader(t, lang, 'knowledge', 'knowledge/')}
<main id="main" class="board">
  ${pageTitle(p, 'shuttles-bright.jpg')}
  <h2 class="board-heading c-12" data-rise>${esc(p.listHeading)}</h2>
  ${tiles}
  <section class="tile c-7" data-rise>
    <h2>${esc(p.soonHeading)}</h2>
    ${bandList(p.soon)}
  </section>
  <section class="tile t-accent c-5" data-rise style="--i:1">
    <h2>${esc(p.licenceHeading)}</h2>
    <p>${esc(p.licenceText)}</p>
  </section>
</main>`;
  return layout({ t, lang, pagePath: 'knowledge/', title: `${p.title} · ${t.site.name}`, description: p.statement, body, current: 'knowledge' });
}

function articlePage(t, lang, article, isFallback) {
  const p = t.knowledge;
  const pagePath = `knowledge/${article.slug}/`;
  const body = `
${pageHeader(t, lang, 'knowledge', pagePath)}
<main id="main" class="board">
  <article class="tile t-paper c-8 article" data-rise${isFallback ? ' lang="en"' : ''}>
    <h1>${esc(article.title)}</h1>
    <p class="statement">${esc(article.summary)}</p>
    <div class="prose">${article.html}</div>
  </article>
  <aside class="c-4 article-side">
    <div class="tile t-photo side-photo" data-rise style="--i:1">${img('shuttle-standing-dark.jpg', t.factories.alt)}</div>
    <div class="tile t-deep" data-rise style="--i:2">
      <p>${esc(p.updated)} ${esc(article.date)}</p>
      ${isFallback ? `<p>${esc(p.fallbackNote)}</p>` : ''}
      <a class="button button-paper" href="/${lang}/knowledge/">${esc(p.back)}</a>
    </div>
    <div class="tile t-accent" data-rise style="--i:3">
      <h2>${esc(p.licenceHeading)}</h2>
      <p>${esc(p.licenceText)}</p>
    </div>
  </aside>
</main>`;
  return layout({ t, lang, pagePath, title: `${article.title} · ${t.site.name}`, description: article.summary, body, current: 'knowledge' });
}

function askPage(t, lang) {
  const p = t.ask;
  const body = `
${pageHeader(t, lang, 'ask', 'ask/')}
<main id="main" class="board">
  ${pageTitle(p, 'shuttles-grass.jpg')}
  <section class="tile t-paper c-7" data-rise>
    <h2>${esc(p.formHeading)}</h2>
    <form class="form" data-ask data-email="${SITE.email}" data-subject="${esc(p.mailSubject)}" action="mailto:${SITE.email}" method="post" enctype="text/plain">
      <label for="q">${esc(p.question)}</label>
      <textarea id="q" name="question" rows="6" required maxlength="1500" aria-describedby="q-hint"></textarea>
      <p class="hint" id="q-hint">${esc(p.questionHint)}</p>
      <label for="e">${esc(p.email)}</label>
      <input id="e" name="email" type="email" autocomplete="email" aria-describedby="e-hint">
      <p class="hint" id="e-hint">${esc(p.emailHint)}</p>
      <label class="check"><input type="checkbox" name="consent" required> <span>${esc(p.consent)}</span></label>
      <button class="button" type="submit">${esc(p.submit)}</button>
      <p class="hint" data-sent hidden>${esc(p.sentNote)}</p>
    </form>
  </section>
  <section class="tile t-deep c-5" data-rise style="--i:1">
    <h2>${esc(p.stepsHeading)}</h2>
    ${bandList(p.steps)}
  </section>
  <section class="tile t-tan c-12" data-rise>
    <h2>${esc(p.notHeading)}</h2>
    <p class="statement wide">${esc(p.notText)}</p>
  </section>
</main>`;
  return layout({ t, lang, pagePath: 'ask/', title: `${p.title} · ${t.site.name}`, description: p.statement, body, current: 'ask' });
}

function recordsPage(t, lang) {
  const p = t.records;
  const body = `
${pageHeader(t, lang, 'records', 'records/')}
<main id="main" class="board">
  ${pageTitle(p, 'shuttle-lying-dark.jpg')}
  <section class="tile t-accent c-8 empty" data-rise>
    <h2>${esc(p.emptyHeading)}</h2>
    <p class="statement">${esc(p.emptyText)}</p>
    <a class="button button-paper" href="/${lang}/#sample">${esc(p.sampleButton)}</a>
  </section>
  <div class="tile t-photo c-4 side-photo" data-rise style="--i:1">${img('shuttle-side-dark.jpg', t.home.heroAlt)}</div>
  <section class="tile t-paper c-6" data-rise>
    <h2>${esc(p.shownHeading)}</h2>
    ${bandList(p.shown)}
  </section>
  <section class="tile t-deep c-6" data-rise style="--i:1">
    <h2>${esc(p.neverHeading)}</h2>
    ${bandList(p.never)}
  </section>
  <section class="tile t-tan c-12" data-rise>
    <h2>${esc(p.deleteHeading)}</h2>
    <p class="statement wide">${esc(p.deleteText)}</p>
  </section>
</main>`;
  return layout({ t, lang, pagePath: 'records/', title: `${p.title} · ${t.site.name}`, description: p.statement, body, current: 'records' });
}

function aboutPage(t, lang) {
  const p = t.about;
  const fills = ['t-paper', 't-deep', '', 't-tan', 't-paper', 't-accent'];
  const spans = ['c-7', 'c-5', 'c-8', 'c-5', 'c-7', 'c-12'];
  const sidePhoto = `
  <div class="tile t-photo c-4 side-photo" data-rise style="--i:1">${img('shuttles-grass.jpg', t.ask.alt)}</div>`;
  const sections = p.sections
    .map(
      (s, i) => `
  <section class="tile ${fills[i]} ${spans[i]}" data-rise style="--i:${i % 2}">
    <h2>${esc(s.heading)}</h2>
    ${s.body.map((line) => `<p>${esc(line)}</p>`).join('')}
  </section>${i === 2 ? sidePhoto : ''}`,
    )
    .join('');
  const body = `
${pageHeader(t, lang, 'about', 'about/')}
<main id="main" class="board">
  ${pageTitle(p, 'shuttle-used-table.jpg')}
  ${sections}
</main>`;
  return layout({ t, lang, pagePath: 'about/', title: `${p.title} · ${t.site.name}`, description: p.statement, body, current: 'about' });
}

// Privacy policy and terms of use. Written in English and Chinese; other languages show the English text.
function legalPage(t, lang, doc, other, isFallback) {
  const pagePath = `${doc.slug}/`;
  const body = `
${pageHeader(t, lang, 'legal', pagePath)}
<main id="main" class="board">
  <article class="tile t-paper c-8 article" data-rise${isFallback ? ' lang="en"' : ''}>
    <h1>${esc(doc.title)}</h1>
    <p class="statement">${esc(doc.summary)}</p>
    <div class="prose">${doc.html}</div>
  </article>
  <aside class="c-4 article-side">
    <div class="tile t-deep" data-rise style="--i:1">
      <p>${esc(t.knowledge.updated)} ${esc(doc.date)}</p>
      ${doc.status === 'draft' ? `<p>${esc(t.legal.draft)}</p>` : ''}
      ${isFallback ? `<p>${esc(t.legal.fallbackNote)}</p>` : ''}
    </div>
    <div class="tile t-accent" data-rise style="--i:2">
      <a class="button button-paper" href="/${lang}/${other.slug}/">${esc(t.legal[other.slug])}</a>
    </div>
  </aside>
</main>`;
  return layout({ t, lang, pagePath, title: `${doc.title} · ${t.site.name}`, description: doc.summary, body, current: 'legal' });
}

// The bare domain sends each visitor to their own language.
function rootPage() {
  return `<!doctype html>
<html lang="${DEFAULT_LANG}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Open Shuttlecock</title>
  <link rel="canonical" href="${SITE.url}/${DEFAULT_LANG}/">
  <script>
    (function () {
      var supported = ${JSON.stringify(LANGS)};
      var saved = null;
      try { saved = localStorage.getItem('lang'); } catch (e) {}
      var wanted = (saved ? [saved] : []).concat(navigator.languages || [navigator.language || '']);
      var pick = '${DEFAULT_LANG}';
      for (var i = 0; i < wanted.length; i++) {
        var code = String(wanted[i]).toLowerCase().split('-')[0];
        if (supported.indexOf(code) !== -1) { pick = code; break; }
      }
      location.replace('/' + pick + '/');
    })();
  </script>
  <noscript><meta http-equiv="refresh" content="0; url=/${DEFAULT_LANG}/"></noscript>
</head>
<body>
  <p><a href="/${DEFAULT_LANG}/">Open Shuttlecock</a></p>
</body>
</html>
`;
}

/* ---------- build ---------- */

const DICTS = Object.fromEntries(LANGS.map((code) => [code, readJson(path.join(SRC, 'i18n', `${code}.json`))]));
const CREDITS = readJson(path.join(SRC, 'assets', 'img', 'credits.json'));

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
copyDir(path.join(SRC, 'assets', 'img'), path.join(DIST, 'assets', 'img'));
fs.rmSync(path.join(DIST, 'assets', 'img', 'credits.json'));
copyDir(path.join(SRC, 'assets', 'fonts'), path.join(DIST, 'assets', 'fonts'));
fs.copyFileSync(path.join(SRC, 'styles', 'fonts.css'), path.join(DIST, 'assets', 'fonts.css'));
fs.copyFileSync(path.join(SRC, 'styles', 'site.css'), path.join(DIST, 'assets', 'site.css'));
fs.copyFileSync(path.join(SRC, 'scripts', 'site.js'), path.join(DIST, 'assets', 'site.js'));

let count = 0;
const urls = [];
write('index.html', rootPage());
for (const lang of LANGS) {
  const t = DICTS[lang];
  const articleLang = ARTICLE_LANGS.includes(lang) ? lang : DEFAULT_LANG;
  const articles = loadArticles(articleLang);
  const pages = {
    'index.html': homePage(t, lang),
    'factories/index.html': factoriesPage(t, lang),
    'knowledge/index.html': knowledgePage(t, lang, articles),
    'ask/index.html': askPage(t, lang),
    'records/index.html': recordsPage(t, lang),
    'about/index.html': aboutPage(t, lang),
  };
  for (const a of articles) pages[`knowledge/${a.slug}/index.html`] = articlePage(t, lang, a, articleLang !== lang);
  const legal = loadArticles(articleLang, 'legal');
  for (const doc of legal) {
    const other = legal.find((d) => d.slug !== doc.slug);
    pages[`${doc.slug}/index.html`] = legalPage(t, lang, doc, other, articleLang !== lang);
  }
  for (const [rel, html] of Object.entries(pages)) {
    write(path.join(lang, rel), html);
    urls.push(`${SITE.url}/${lang}/${rel.replace(/index\.html$/, '')}`);
    count += 1;
  }
}

// Page for addresses that do not exist. Shown in the default language with a way back for everyone.
{
  const t = DICTS[DEFAULT_LANG];
  const body = `
${pageHeader(t, DEFAULT_LANG, 'missing', '')}
<main id="main" class="board">
  <div class="tile title-tile c-12">
    <h1>Page not found</h1>
    <p class="statement">This address does not exist. 这个地址不存在。</p>
    <p><a class="button" href="/">Open Shuttlecock</a></p>
  </div>
</main>`;
  write('404.html', layout({ t, lang: DEFAULT_LANG, pagePath: '', title: `Page not found · ${t.site.name}`, body, current: 'missing' }).replace('<link rel="canonical"', '<meta name="robots" content="noindex">\n  <link rel="canonical"'));
}

write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`);
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
);
// Response headers for the host. The page uses small inline scripts and inline style variables, hence 'unsafe-inline'.
// Cloudflare Web Analytics (cookieless visit counts) is allowed to load and report.
write(
  '_headers',
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; base-uri 'self'; form-action 'self' mailto:; frame-ancestors 'none'

/assets/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/assets/img/*
  Cache-Control: public, max-age=604800
`,
);

console.log(`Built ${count} pages in ${LANGS.length} languages to ${path.relative(ROOT, DIST)}/`);
