// Central config for the crawler. Tweak these instead of hunting through crawl.js.

module.exports = {
  API_BASE: "https://stardewvalleywiki.com/mediawiki/api.php",

  // Be a polite scraper: identify yourself and don't hammer the site.
  USER_AGENT: "stardew-wikirace-crawler/0.1 (personal learning project)",

  // How many pages to request per allpages/query call (MediaWiki allows up to 500 for a normal client).
  PAGE_LIST_BATCH: 500,

  // How many titles to pack into a single redirect-resolution query (MediaWiki caps this at 50 for anonymous users).
  REDIRECT_RESOLVE_BATCH: 50,

  // How many parse (links+text) requests to run at once. Keep this low and polite.
  CONCURRENCY: 4,

  // Minimum delay (ms) between requests fired by a single worker, on top of concurrency limiting.
  REQUEST_DELAY_MS: 150,

  // Namespace 0 = main article namespace. This is what filters out Talk:, Category:, Modding:, etc.
  MAIN_NAMESPACE: 0,

  OUTPUT_DIR: "data",
};
