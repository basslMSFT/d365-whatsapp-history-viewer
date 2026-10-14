import * as React from "react";

// Links and WhatsApp formatting: *bold*, _italic_, ~strikethrough~ and ```monospace```.
// Markers only apply at word boundaries, so snake_case or 2*3*4 stay as typed.
const PATTERN =
    /(https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"\u2019\u201D])|(```[\s\S]+?```)|(^|[\s([{])([*_~])(?=\S)([^\n]*?\S)\4(?=$|[\s.,;:!?)\]}])/g;
const MAX_DEPTH = 2;

export function renderMessageText(text: string, depth = 0): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    const push = (node: React.ReactNode): void => {
        nodes.push(<React.Fragment key={nodes.length}>{node}</React.Fragment>);
    };

    const pattern = new RegExp(PATTERN.source, "g");
    let last = 0;
    let match = pattern.exec(text);
    while (match) {
        const [whole, url, monospace, prefix = "", marker, inner = ""] = match;
        // The prefix belongs to the text before the marker, not to the formatted part.
        const start = match.index + (url || monospace ? 0 : prefix.length);
        if (start > last) {
            push(text.slice(last, start));
        }

        if (url) {
            push(
                <a href={url} rel="noopener noreferrer" target="_blank">
                    {url}
                </a>
            );
        } else if (monospace) {
            push(<code>{monospace.slice(3, -3)}</code>);
        } else {
            const children = depth < MAX_DEPTH ? renderMessageText(inner, depth + 1) : inner;
            push(marker === "*" ? <strong>{children}</strong> : marker === "_" ? <em>{children}</em> : <s>{children}</s>);
        }

        last = match.index + whole.length;
        match = pattern.exec(text);
    }
    if (last < text.length) {
        push(text.slice(last));
    }
    return nodes;
}
