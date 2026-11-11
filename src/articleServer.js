const http = require("node:http");
const { getArticle } = require("./articleLookup");
const fs = require("fs/promises");

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost:3000");
    let path = url.pathname;

    if (path != "/article") {
        response.statusCode = 404;
        response.end("Error 404: Wrong Path");
        return;
    }
        
    const text = await fs.readFile("data/sample-pages.json", "utf8");
    const pages = JSON.parse(text);

    let title = url.searchParams.get("title");
    console.log(title);  // gets article title from http request

    const article = getArticle(pages, title);

    if (article === null) {
        response.statusCode = 404;
        response.end("Error 404: Unknown/missing article");
    } else {
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(article);
        }

});

server.listen(3000);