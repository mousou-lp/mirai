// futures/*.md を読んで、未来のことの一覧と、1件ずつのページを dist に書き出す。依存なし（Node 20 以上）
// 使い方: node build.mjs（中身を確かめるだけなら node build.mjs --check）
import { readFile, writeFile, mkdir, cp, rm, readdir } from "node:fs/promises";

const PORTAL = "https://mousou-lp.github.io/";
const REQUEST = "https://github.com/mousou-lp/mousou-lp.github.io/issues/new?template=lp-request.yml";
const REPO = "https://github.com/mousou-lp/mirai";
const REQUIRED = ["title", "when", "area", "summary"];
const SECTIONS = ["いまどこまで来ているか", "実現すると、くらしはどう変わるか", "妄想のタネ"];
const ICON = '<svg class="button__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>';
const checkOnly = process.argv.includes("--check");

const files = (await readdir("futures")).filter((f) => f.endsWith(".md")).sort();
const futures = [];
const errors = [];
for (const file of files) {
  const slug = file.replace(/\.md$/, "");
  const { meta, body } = parseFrontMatter(await readFile(`futures/${file}`, "utf8"));
  for (const key of REQUIRED) if (!meta[key]) errors.push(`${file}: ${key} がありません`);
  if (!/^[a-z0-9-]+$/.test(slug)) errors.push(`${file}: ファイル名は英小文字・数字・ハイフンだけにしてください`);
  if (meta.summary && [...meta.summary].length > 60) errors.push(`${file}: summary は 60 字までにしてください`);
  for (const s of SECTIONS) if (!body.includes(`## ${s}`)) errors.push(`${file}: 「## ${s}」の見出しがありません`);
  futures.push({ slug, ...meta, body });
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
if (checkOnly) {
  console.log(`futures: ${futures.length} 件、問題なし`);
  process.exit(0);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// 分野ごとにまとめる。分野の並びは、はじめて出てきた順
const areas = [...new Set(futures.map((f) => f.area))];
const groups = areas
  .map((area) => {
    const items = futures
      .filter((f) => f.area === area)
      .map(
        (f) => `
            <li class="future">
              <a class="future__link" href="${f.slug}/">
                <h3 class="future__title">${esc(f.title)}</h3>
              </a>
              <p class="future__summary">${esc(f.summary)}</p>
              <p class="future__when">${esc(f.when)}</p>
            </li>`,
      )
      .join("");
    return `
        <section class="area" aria-labelledby="area-${esc(area)}">
          <h2 class="area__title" id="area-${esc(area)}">${esc(area)}</h2>
          <ul class="futures" role="list">${items}
          </ul>
        </section>`;
  })
  .join("");

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("src/style.css", "dist/style.css");
await cp("src/favicon.svg", "dist/favicon.svg");

await writeFile(
  "dist/index.html",
  page({
    title: "未来のこと | 妄想LP",
    root: "",
    description: "妄想のもとにする、未来の技術とくらしのまとめです。",
    main: `
      <header class="page-header">
        <h1 class="page-title">未来のこと</h1>
        <p class="page-lead">妄想のもとにする、未来の技術とくらしのまとめです。気になる未来を1つ選んで、自分の偏愛とかけあわせてみてください。</p>
        <p class="page-note">どれも予想で、確かなことではありません。まとめている未来：${futures.length}件</p>
      </header>
      ${groups}`,
  }),
);

for (const f of futures) {
  await mkdir(`dist/${f.slug}`, { recursive: true });
  await writeFile(
    `dist/${f.slug}/index.html`,
    page({
      title: `${f.title} | 未来のこと | 妄想LP`,
      root: "../",
      description: f.summary,
      main: `
      <p class="back"><a href="../">未来のことの一覧</a></p>
      <article class="article">
        <p class="article__meta">${esc(f.area)}・${esc(f.when)}</p>
        <h1 class="page-title">${esc(f.title)}</h1>
        <p class="page-lead">${esc(f.summary)}</p>
        ${markdown(f.body)}
      </article>
      <aside class="next" aria-labelledby="next-title">
        <h2 class="next__title" id="next-title">この未来で妄想する</h2>
        <p>自分の偏愛とかけあわせると、どんなサービスができそうですか。思いついたら、LPにしてみてください。自分で作らなくても、リクエストに書いておけば、だれかが作るかもしれません。思いつかないときは、<a href="${PORTAL}tane/">妄想のタネ</a>で問いを出してみてください。</p>
        <p class="next__actions">
          <a class="button" href="${REQUEST}">LPのリクエストを書く${ICON}</a>
          <a href="https://github.com/mousou-lp/lp-template">自分でLPを作る</a>
        </p>
      </aside>`,
    }),
  );
}
// 妄想のタネ（mousou-lp.github.io/tane/）が読むデータ
const seedsOf = (body) => {
  const part = body.split("## 妄想のタネ")[1] ?? "";
  return part.split("\n").filter((l) => /^-\s+/.test(l)).map((l) => l.replace(/^-\s+/, "").trim());
};
await writeFile(
  "dist/futures.json",
  JSON.stringify(
    futures.map((f) => ({ slug: f.slug, title: f.title, when: f.when, area: f.area, summary: f.summary, seeds: seedsOf(f.body) })),
    null,
    2,
  ),
);
console.log(`dist: ${futures.length} 件の未来を書き出しました`);

function page({ title, root, description, main }) {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="icon" href="${root}favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="${root}style.css" />
  </head>
  <body>
    <nav class="site-nav container" aria-label="妄想LP">
      <a href="${PORTAL}">妄想LP</a>
      <a href="${root || "./"}" aria-current="${root ? "false" : "page"}">未来のこと</a>
      <a href="${PORTAL}tane/">妄想のタネ</a>
    </nav>
    <main class="container">${main}
    </main>
    <footer class="site-footer">
      <div class="container">
        <a href="${REPO}">未来のことを足すには</a>
        <a href="${PORTAL}">妄想LPのポータル</a>
      </div>
    </footer>
  </body>
</html>
`;
}

function parseFrontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

// 使うのは見出し（##）、箇条書き（-）、段落、リンク、太字だけ
function markdown(src) {
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out = [];
  let list = null;
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(""))}</p>`);
    para = [];
    if (list) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
    list = null;
  };
  for (const line of src.split("\n")) {
    if (/^##\s+/.test(line)) {
      flush();
      out.push(`<h2>${inline(line.replace(/^##\s+/, ""))}</h2>`);
    } else if (/^-\s+/.test(line)) {
      if (para.length) flush();
      (list ??= []).push(line.replace(/^-\s+/, ""));
    } else if (line.trim() === "") {
      flush();
    } else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return out.join("\n        ");
}
