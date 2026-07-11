const { API_BASE, USER_AGENT, REQUEST_DELAY_MS } = require("./config");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Low-level call to the MediaWiki API. Always requests JSON.
 * Retries a couple of times on network hiccups / 5xx before giving up.
 */
async function callApi(params, { retries = 3 } = {}) {
  const url = new URL(API_BASE);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }

      const data = await res.json();

      if (data.error) {
        throw new Error(`MediaWiki API error: ${JSON.stringify(data.error)}`);
      }

      return data;
    } catch (err) {
      const isLastAttempt = attempt === retries;
      console.warn(
        `[wikiApi] attempt ${attempt}/${retries} failed for ${params.action}: ${err.message}`
      );
      if (isLastAttempt) throw err;
      await sleep(500 * attempt); // simple backoff
    } finally {
      // Always leave a small gap between requests, even on failures,
      // so a burst of retries doesn't turn into a burst of hammering.
      await sleep(REQUEST_DELAY_MS);
    }
  }
}

/**
 * Runs `worker` over `items` with at most `concurrency` in flight at once.
 * Deliberately simple (no external queue library) so it's easy to read/modify.
 */
async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    const currentIndex = nextIndex++;
    if (currentIndex >= items.length) return;
    results[currentIndex] = await worker(items[currentIndex], currentIndex);
    await runNext();
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, runNext);
  await Promise.all(workers);
  return results;
}

module.exports = { callApi, runWithConcurrency, sleep };
