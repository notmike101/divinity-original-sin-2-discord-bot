/** Source text is plain, escaped Discord text; no accidental mentions or embedded source links. */
export function safe(text) {
    return String(text).replaceAll(/https?:\/\/\S+/gi, '[external reference]').replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replaceAll('@', '@\u200B').replaceAll(/([*<>[\\\]_`|~])/g, '\\$1');
}

/** Split without dropping any content, including long unbroken source table cells. */
export function chunks(text, size = 2_800) {
    const pages = []; let rest = safe(text);

    while (rest.length > size) {
        let cut = rest.lastIndexOf('\n', size);

        if (cut < size / 2) {
            cut = size;
        }

        if (/[\uD800-\uDBFF]/.test(rest[cut - 1])) {
            cut--;
        }

        pages.push(rest.slice(0, cut)); rest = rest.slice(cut);
    }

    pages.push(rest || 'No content in this section.');

    return pages;
}
