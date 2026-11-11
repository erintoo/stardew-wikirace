const fs = require("fs/promises");
const { getArticle } = require("./articleLookup");

async function loadPages() {
    const text = await fs.readFile("data/sample-pages.json", "utf8");
    const pages = JSON.parse(text);
    let title = process.argv[2];
    const article = getArticle(pages, title);

    if (article === null) {
        console.log('Unknown/missing article');
    } else {
        console.log(article);
    }
}

loadPages();