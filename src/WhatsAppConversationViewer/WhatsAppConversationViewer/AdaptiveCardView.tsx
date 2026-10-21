import * as React from "react";
import { AdaptiveCardPayload } from "./models";

type CardNode = Record<string, unknown>;

const MAX_DEPTH = 8;
// The inline pattern can get slow on very long input; plain text is always safe.
const MAX_FORMATTED_LENGTH = 8000;
const INLINE_PATTERN = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
const LINK_PATTERN = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/;

// Card values end up in CSS class names, so only known values are used. Adaptive Cards
// write them capitalized ("Bolder"); the style sheet uses the canonical spelling below.
const SIZES = ["small", "default", "medium", "large", "extraLarge"];
const WEIGHTS = ["lighter", "default", "bolder"];
const COLORS = ["default", "dark", "light", "accent", "good", "warning", "attention"];
const ALIGNMENTS = ["left", "center", "right"];
const SPACINGS = ["none", "small", "default", "medium", "large", "extraLarge", "padding"];
const STYLES = ["default", "emphasis", "good", "attention", "warning", "accent"];
const IMAGE_SIZES = ["auto", "stretch", "small", "medium", "large"];

function pick(value: string | undefined, allowed: string[], fallback: string): string {
    const wanted = (value ?? "").toLowerCase();
    return allowed.find((candidate) => candidate.toLowerCase() === wanted) ?? fallback;
}

function isNode(value: unknown): value is CardNode {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(node: CardNode, key: string): string | undefined {
    const value = node[key];
    return typeof value === "string" && value ? value : undefined;
}

function nodes(node: CardNode, key: string): CardNode[] {
    const value = node[key];
    return Array.isArray(value) ? (value as unknown[]).filter(isNode) : [];
}

function cx(...names: (string | false | undefined)[]): string {
    return names.filter(Boolean).join(" ");
}

function safeUrl(url: string | undefined, allowDataImage: boolean): string | undefined {
    if (!url) {
        return undefined;
    }
    try {
        const parsed = new URL(url);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
            return parsed.href;
        }
        if (allowDataImage && parsed.protocol === "data:" && url.startsWith("data:image/")) {
            return url;
        }
    } catch {
        return undefined;
    }
    return undefined;
}

// A link label can say anything, so the real host is shown next to it.
function hostOf(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return "";
    }
}

function renderInline(value: string): React.ReactNode[] {
    if (value.length > MAX_FORMATTED_LENGTH) {
        return [value];
    }
    return value.split(INLINE_PATTERN).map((part, index) => {
        const link = LINK_PATTERN.exec(part);
        if (link) {
            const host = hostOf(link[2]);
            return (
                <React.Fragment key={index}>
                    <a href={link[2]} rel="noopener noreferrer" target="_blank">
                        {link[1]}
                    </a>
                    {host && !link[1].includes(host) && <span className="wacv-card__host"> ({host})</span>}
                </React.Fragment>
            );
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
    });
}

// Remote images are not fetched until the representative asks for them, so opening a
// conversation never tells a third party that, when, and from where it was read.
const ExternalImage: React.FC<{ alt: string; className: string; url: string }> = ({ alt, className, url }) => {
    const [shown, setShown] = React.useState(url.startsWith("data:"));
    if (shown) {
        return <img alt={alt} className={className} loading="lazy" referrerPolicy="no-referrer" src={url} />;
    }
    return (
        <button
            className="wacv-attachment__chip wacv-attachment__chip--button"
            onClick={() => setShown(true)}
            type="button"
        >
            Afbeelding van {hostOf(url)} laden
        </button>
    );
};

function textClasses(node: CardNode): string {
    return cx(
        "wacv-card__text",
        `wacv-card__text--size-${pick(text(node, "size"), SIZES, "default")}`,
        `wacv-card__text--weight-${pick(text(node, "weight"), WEIGHTS, "default")}`,
        `wacv-card__text--color-${pick(text(node, "color"), COLORS, "default")}`,
        node.isSubtle === true && "wacv-card__text--subtle",
        `wacv-card__text--align-${pick(text(node, "horizontalAlignment"), ALIGNMENTS, "left")}`
    );
}

function renderActions(actions: CardNode[], key: string): React.ReactNode {
    if (actions.length === 0) {
        return null;
    }
    return (
        <div className="wacv-card__actions" key={key}>
            {actions.map((action, index) => {
                const title = text(action, "title") ?? "Actie";
                const href =
                    text(action, "type") === "Action.OpenUrl"
                        ? safeUrl(text(action, "url"), false)
                        : undefined;
                return href ? (
                    <a
                        className="wacv-card__action wacv-card__action--link"
                        href={href}
                        key={index}
                        rel="noopener noreferrer"
                        target="_blank"
                        title={href}
                    >
                        {title}
                        <span className="wacv-card__host"> ({hostOf(href)})</span>
                    </a>
                ) : (
                    <span aria-disabled="true" className="wacv-card__action" key={index}>
                        {title}
                    </span>
                );
            })}
        </div>
    );
}

function renderChildren(items: CardNode[], prefix: string, depth: number): React.ReactNode[] {
    return items.map((item, index) => renderElement(item, `${prefix}-${index}`, depth + 1));
}

function renderTable(node: CardNode, key: string, depth: number): React.ReactNode {
    const rows = nodes(node, "rows");
    return (
        <table className="wacv-card__table" key={key}>
            <tbody>
                {rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                        {nodes(row, "cells").map((cell, cellIndex) => {
                            const Cell = rowIndex === 0 && node.firstRowAsHeaders !== false ? "th" : "td";
                            return (
                                <Cell key={cellIndex}>
                                    {renderChildren(nodes(cell, "items"), `${key}-${rowIndex}-${cellIndex}`, depth)}
                                </Cell>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function renderInput(node: CardNode, key: string): React.ReactNode {
    const label = text(node, "label") ?? text(node, "placeholder") ?? text(node, "title") ?? text(node, "id");
    const choices = nodes(node, "choices")
        .map((choice) => text(choice, "title"))
        .filter((title): title is string => Boolean(title));
    return (
        <div className="wacv-card__input" key={key}>
            {label && <span className="wacv-card__input-label">{label}</span>}
            {choices.length > 0 && (
                <span className="wacv-card__choices">
                    {choices.map((choice, index) => (
                        <span className="wacv-card__action" key={index}>
                            {choice}
                        </span>
                    ))}
                </span>
            )}
        </div>
    );
}

function renderRichText(node: CardNode, key: string): React.ReactNode {
    const inlines = Array.isArray(node.inlines) ? (node.inlines as unknown[]) : [];
    return (
        <p className={textClasses(node)} key={key}>
            {inlines.map((inline, index) => {
                if (typeof inline === "string") {
                    return <React.Fragment key={index}>{inline}</React.Fragment>;
                }
                if (!isNode(inline)) {
                    return null;
                }
                return (
                    <span
                        className={cx(
                            textClasses(inline),
                            inline.italic === true && "wacv-card__text--italic",
                            inline.strikethrough === true && "wacv-card__text--strike",
                            inline.underline === true && "wacv-card__text--underline"
                        )}
                        key={index}
                    >
                        {text(inline, "text")}
                    </span>
                );
            })}
        </p>
    );
}

function renderElement(node: CardNode, key: string, depth: number): React.ReactNode {
    if (depth > MAX_DEPTH || node.isVisible === false) {
        return null;
    }

    const type = text(node, "type") ?? "";
    const wrapperClass = cx(
        "wacv-card__element",
        node.separator === true && "wacv-card__element--separator",
        `wacv-card__element--spacing-${pick(text(node, "spacing"), SPACINGS, "default")}`
    );
    let content: React.ReactNode = null;

    switch (type) {
        case "TextBlock":
            content = <p className={textClasses(node)}>{renderInline(text(node, "text") ?? "")}</p>;
            break;
        case "RichTextBlock":
            content = renderRichText(node, `${key}-rich`);
            break;
        case "Image": {
            const source = safeUrl(text(node, "url"), true);
            content = source ? (
                <ExternalImage
                    alt={text(node, "altText") ?? ""}
                    className={`wacv-card__image wacv-card__image--${pick(text(node, "size"), IMAGE_SIZES, "auto")}`}
                    url={source}
                />
            ) : null;
            break;
        }
        case "ImageSet":
            content = (
                <div className="wacv-card__imageset">
                    {renderChildren(nodes(node, "images"), key, depth)}
                </div>
            );
            break;
        case "Container":
            content = (
                <div className={cx("wacv-card__container", `wacv-card__container--${pick(text(node, "style"), STYLES, "default")}`)}>
                    {renderChildren(nodes(node, "items"), key, depth)}
                </div>
            );
            break;
        case "ColumnSet":
            content = (
                <div className="wacv-card__columnset">
                    {nodes(node, "columns").map((column, index) => {
                        const width = column.width;
                        const style: React.CSSProperties =
                            typeof width === "number"
                                ? { flex: `${width} 1 0` }
                                : width === "auto"
                                  ? { flex: "0 1 auto" }
                                  : typeof width === "string" && /^\d+px$/.test(width)
                                    ? { flex: `0 0 ${width}` }
                                    : { flex: "1 1 0" };
                        return (
                            <div className="wacv-card__column" key={index} style={style}>
                                {renderChildren(nodes(column, "items"), `${key}-${index}`, depth)}
                            </div>
                        );
                    })}
                </div>
            );
            break;
        case "FactSet":
            content = (
                <dl className="wacv-card__facts">
                    {nodes(node, "facts").map((fact, index) => (
                        <React.Fragment key={index}>
                            <dt>{text(fact, "title")}</dt>
                            <dd>{text(fact, "value")}</dd>
                        </React.Fragment>
                    ))}
                </dl>
            );
            break;
        case "ActionSet":
            content = renderActions(nodes(node, "actions"), `${key}-actions`);
            break;
        case "Table":
            content = renderTable(node, `${key}-table`, depth);
            break;
        default:
            if (type.startsWith("Input.")) {
                content = renderInput(node, `${key}-input`);
            } else if (text(node, "text")) {
                content = <p className={textClasses(node)}>{renderInline(text(node, "text") ?? "")}</p>;
            } else if (nodes(node, "items").length > 0) {
                content = renderChildren(nodes(node, "items"), key, depth);
            }
    }

    return content === null ? null : (
        <div className={wrapperClass} key={key}>
            {content}
        </div>
    );
}

export const AdaptiveCardView: React.FC<{ card: AdaptiveCardPayload }> = ({ card }) => {
    const body = nodes(card, "body");
    const actions = nodes(card, "actions");
    const fallback = text(card, "fallbackText");

    return (
        <div className="wacv-card" role="group" aria-label="Adaptive card">
            {renderChildren(body, "card", 0)}
            {renderActions(actions, "card-actions")}
            {body.length === 0 && actions.length === 0 && fallback && (
                <p className="wacv-card__text">{fallback}</p>
            )}
        </div>
    );
};
