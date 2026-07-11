const fs = require("fs/promises");
const path = require("path");
const { callApi, runWithConcurrency } = require("./wikiApi");
const {
  PAGE_LIST_BATCH,
  REDIRECT_RESOLVE_BATCH,
  CONCURRENCY,
  MAIN_NAMESPACE,
  OUTPUT_DIR,
} = require("./config");

/**
 * Step 1: Get every "real" (non-redirect) article title in the main namespace.
 * These are the nodes of our game graph.
 */
async function fetchAllPageTitles() {
  const titles = [];
  let apcontinue;

  do {
    const data = await callApi({
      action: "query",
      list: "allpages",
      apnamespace: MAIN_NAMESPACE,
      apfilterredir: "nonredirects",
      aplimit: PAGE_LIST_BATCH,
      ...(apcontinue ? { apcontinue } : {}),
    });

    for (const page of data.query.allpages) {
      titles.push(page.title);
    }

    apcontinue = data.continue?.apcontinue;
  } while (apcontinue);

  return titles;
}

/**
 * Step 2: Get every redirect title in the main namespace, then resolve
 * each one to its real target. We need this because a link on a page
 * often points at a redirect (e.g. "Cauliflower" -> "Cauliflower (item)")
 * rather than directly at the canonical article.
 */
async function fetchAllRedirectTitles() {
  const titles = [];
  let apcontinue;

  do {
    const data = await callApi({
      action: "query",
      list: "allpages",
      apnamespace: MAIN_NAMESPACE,
      apfilterredir: "redirects",
      aplimit: PAGE_LIST_BATCH,
      ...(apcontinue ? { apcontinue } : {}),
    });

    for (const page of data.query.allpages) {
      titles.push(page.title);
    }

    apcontinue = data.continue?.apcontinue;
  } while (apcontinue);

  return titles;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Resolves a list of redirect titles to their real target titles.
 * Returns a Map of redirectTitle -> targetTitle.
 */
async function resolveRedirects(redirectTitles) {
  const map = new Map();
  const batches = chunk(redirectTitles, REDIRECT_RESOLVE_BATCH);

  await runWithConcurrency(batches, CONCURRENCY, async (batch) => {
    const data = await callApi({
      action: "query",
      titles: batch.join("|"),
      redirects: 1,
    });

    // The API returns a "redirects" array of { from, to } when redirects=1 is set.
    for (const r of data.query.redirects ?? []) {
      map.set(r.from, r.to);
    }
  });

  return map;
}

/**
 * Step 3: For each real page, fetch its rendered HTML and its outgoing links
 * in one call (parse action supports both props at once).
 */
async function fetchPageContentAndLinks(title) {
  const data = await callApi({
    action: "parse",
    page: title,
    prop: "text|links",
    redirects: 1,
  });

  const html = data.parse.text["*"];
  const rawLinks = data.parse.links ?? [];

  // Only keep links into the main article namespace (ns 0). Everything else
  // (Category:, File:, Modding:, external anchors, etc.) is noise for the game graph.
  const linkTitles = rawLinks
    .filter((link) => link.ns === MAIN_NAMESPACE)
    .map((link) => link["*"]);

  return { title, html, linkTitles };
}

async function main() {
  console.log("Fetching page titles (this is the node list for our graph)...");
  const pageTitles = await fetchAllPageTitles();
  const pageTitleSet = new Set(pageTitles);
  console.log(`Found ${pageTitles.length} real article pages.`);

  console.log("Fetching redirect titles...");
  const redirectTitles = await fetchAllRedirectTitles();
  console.log(`Found ${redirectTitles.length} redirects. Resolving them...`);
  const redirectMap = await resolveRedirects(redirectTitles);
  console.log(`Resolved ${redirectMap.size} redirects.`);

  console.log(
    `Fetching content + links for ${pageTitles.length} pages (concurrency=${CONCURRENCY})...`
  );

  let completed = 0;
  const pageResults = await runWithConcurrency(pageTitles, CONCURRENCY, async (title) => {
    const result = await fetchPageContentAndLinks(title);
    completed++;
    if (completed % 25 === 0 || completed === pageTitles.length) {
      console.log(`  ${completed}/${pageTitles.length} pages fetched`);
    }
    return result;
  });

  // Build the final graph: resolve each link through the redirect map,
  // then drop anything that doesn't land on a page we actually crawled
  // (this removes redlinks and any leftover non-article links).
  const graph = {};
  const pages = {};

  for (const { title, html, linkTitles } of pageResults) {
    pages[title] = html;

    const resolvedTargets = new Set();
    for (const rawTarget of linkTitles) {
      const target = redirectMap.get(rawTarget) ?? rawTarget;
      if (target === title) continue; // no self-loops
      if (!pageTitleSet.has(target)) continue; // drop redlinks / unknown pages
      resolvedTargets.add(target);
    }

    graph[title] = Array.from(resolvedTargets);
  }

  const outDir = path.join(__dirname, "..", "..", OUTPUT_DIR);
  await fs.mkdir(outDir, { recursive: true });

  await fs.writeFile(
    path.join(outDir, "graph.json"),
    JSON.stringify(graph, null, 2)
  );
  await fs.writeFile(
    path.join(outDir, "pages.json"),
    JSON.stringify(pages, null, 2)
  );
  await fs.writeFile(
    path.join(outDir, "redirects.json"),
    JSON.stringify(Object.fromEntries(redirectMap), null, 2)
  );

  const edgeCount = Object.values(graph).reduce((sum, targets) => sum + targets.length, 0);
  console.log(`\nDone.`);
  console.log(`  Nodes: ${Object.keys(graph).length}`);
  console.log(`  Edges: ${edgeCount}`);
  console.log(`  Written to: ${outDir}`);
}

main().catch((err) => {
  console.error("Crawl failed:", err);
  process.exit(1);
});
