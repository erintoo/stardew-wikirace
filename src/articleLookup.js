function getArticle(pages, title) {
    if (!Object.hasOwn(pages, title) ) {
        return null;
    }
    return pages[title];
}

module.exports = { getArticle };