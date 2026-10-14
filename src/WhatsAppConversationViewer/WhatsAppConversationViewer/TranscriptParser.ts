import { ConversationMessage, MessageAttachment, MessageDirection } from "./models";

type JsonObject = Record<string, unknown>;

const ARRAY_KEYS = ["messages", "activities", "value", "transcript", "items"];
const TEXT_KEYS = ["text", "content", "message", "body", "value"];
const DATE_KEYS = ["createdDateTime", "timestamp", "createdOn", "sentOn", "localTimestamp"];
const AUTHOR_KEYS = ["senderDisplayName", "displayName", "userDisplayName", "name"];
const SENDER_KINDS = ["user", "application", "bot", "device", "phone", "guest"];
// Messages Contact Center adds for its own bookkeeping; never meant for display.
const HIDDEN_TAGS = ["hidden", "omnichannelcontextmessage"];

function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getValue(object: JsonObject, key: string): unknown {
    const matchingKey = Object.keys(object).find(
        (candidate) => candidate.toLowerCase() === key.toLowerCase()
    );
    return matchingKey ? object[matchingKey] : undefined;
}

function getString(object: JsonObject, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = getValue(object, key);
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
        if (isObject(value)) {
            const nested = getString(value, ["text", "content", "name", "value"]);
            if (nested) {
                return nested;
            }
        }
    }
    return undefined;
}

function getBoolean(object: JsonObject, key: string): boolean {
    return getValue(object, key) === true;
}

function getNestedObject(object: JsonObject, key: string): JsonObject | undefined {
    const value = getValue(object, key);
    return isObject(value) ? value : undefined;
}

function findMessageArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
        if (
            value.length === 1 &&
            isObject(value[0])
        ) {
            const content = getString(value[0], ["content"]);
            if (content?.startsWith("[") || content?.startsWith("{")) {
                try {
                    const nested = findMessageArray(parseJson(content));
                    if (nested.length > 0) {
                        return nested;
                    }
                } catch {
                    return value;
                }
            }
        }
        return value;
    }
    if (!isObject(value)) {
        return [];
    }

    for (const key of ARRAY_KEYS) {
        const candidate = getValue(value, key);
        if (Array.isArray(candidate)) {
            return candidate;
        }
        if (isObject(candidate)) {
            const nested = findMessageArray(candidate);
            if (nested.length > 0) {
                return nested;
            }
        }
    }

    return [];
}

function parseJson(transcript: string): unknown {
    let value: unknown = transcript;
    for (let attempt = 0; attempt < 2 && typeof value === "string"; attempt += 1) {
        value = JSON.parse(value);
    }
    return value;
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function parseEmbeddedJson(value: unknown): unknown {
    if (typeof value !== "string") {
        return value;
    }
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        return undefined;
    }
    try {
        return JSON.parse(trimmed) as unknown;
    } catch {
        return undefined;
    }
}

function isAdaptiveCard(value: unknown): value is JsonObject {
    return isObject(value) && asString(getValue(value, "type")).toLowerCase() === "adaptivecard";
}

function isDefined<T>(value: T | undefined): value is T {
    return value !== undefined;
}

// WhatsApp and Contact Center add zero-width and braille-blank characters that
// would otherwise create empty-looking bubbles.
function cleanText(value: string): string {
    return value.replace(/[\u200B\uFEFF]/g, "").replace(/\u2800/g, " ").trim();
}

const BOT_CARD_KINDS = ["animation", "audio", "hero", "oauth", "receipt", "signin", "thumbnail", "video"];
const MEDIA_LABELS: Record<string, string> = {
    animation: "Animatie openen",
    audio: "Audio afspelen",
    video: "Video afspelen",
};

function toAction(action: unknown): JsonObject | undefined {
    if (!isObject(action)) {
        return undefined;
    }
    const title = getString(action, ["title", "text"]);
    if (!title) {
        return undefined;
    }
    const type = asString(getValue(action, "type")).toLowerCase();
    const value = getValue(action, "value");
    if (["openurl", "signin", "downloadfile"].includes(type) && typeof value === "string") {
        return { type: "Action.OpenUrl", title, url: value };
    }
    return { type: "Action.Submit", title };
}

function toActionSet(actions: unknown): JsonObject | undefined {
    const list = Array.isArray(actions) ? (actions as unknown[]).map(toAction).filter(isDefined) : [];
    return list.length > 0 ? { type: "ActionSet", actions: list } : undefined;
}

// Bot Framework hero, thumbnail, video, audio and animation cards are shown with the
// same read-only renderer as adaptive cards. External media is linked, not auto-loaded.
function botCardToAdaptiveCard(kind: string, card: JsonObject, activityText: string): JsonObject {
    const body: JsonObject[] = [];
    const images = Array.isArray(getValue(card, "images")) ? (getValue(card, "images") as unknown[]) : [];
    const thumbnail = getNestedObject(card, "image");
    for (const image of [...images, thumbnail]) {
        const url = isObject(image) ? getString(image, ["url"]) : undefined;
        const alt = isObject(image) ? getString(image, ["alt"]) : undefined;
        if (url) {
            body.push({ type: "Image", url, altText: alt ?? "" });
        }
    }

    const title = getString(card, ["title"]);
    if (title && title !== activityText) {
        body.push({ type: "TextBlock", text: title, weight: "Bolder", wrap: true });
    }
    const subtitle = getString(card, ["subtitle"]);
    if (subtitle) {
        body.push({ type: "TextBlock", text: subtitle, isSubtle: true, wrap: true });
    }
    const text = getString(card, ["text"]);
    if (text && text !== activityText) {
        body.push({ type: "TextBlock", text, wrap: true });
    }

    const media = Array.isArray(getValue(card, "media")) ? (getValue(card, "media") as unknown[]) : [];
    for (const item of media) {
        const url = isObject(item) ? getString(item, ["url"]) : undefined;
        if (url && /^https?:\/\//i.test(url)) {
            body.push({ type: "TextBlock", text: `[${MEDIA_LABELS[kind] ?? "Openen"}](${url})`, wrap: true });
        }
    }

    const actions = toActionSet(getValue(card, "buttons"));
    if (actions) {
        body.push(actions);
    }
    return { type: "AdaptiveCard", version: "1.5", body };
}

function cardsFromAttachments(attachments: unknown, activityText: string): JsonObject[] {
    const cards: JsonObject[] = [];
    if (!Array.isArray(attachments)) {
        return cards;
    }
    for (const attachment of attachments as unknown[]) {
        if (!isObject(attachment)) {
            continue;
        }
        const contentType = asString(getValue(attachment, "contentType")).toLowerCase();
        const content = parseEmbeddedJson(getValue(attachment, "content"));
        if (contentType.includes("adaptive") && isAdaptiveCard(content)) {
            cards.push(content);
            continue;
        }
        const kind = /card\.([a-z]+)/.exec(contentType)?.[1];
        if (kind && BOT_CARD_KINDS.includes(kind) && isObject(content)) {
            const card = botCardToAdaptiveCard(kind, content, activityText);
            if (nodesIn(card).length > 0) {
                cards.push(card);
            }
        }
    }
    return cards;
}

function nodesIn(card: JsonObject): unknown[] {
    const body = getValue(card, "body");
    return Array.isArray(body) ? (body as unknown[]) : [];
}

interface Interpreted {
    cards: JsonObject[];
    hide?: boolean;
    text: string;
}

// Contact Center stores bot activities and cards as a JSON string in `content`.
// What the customer typed is never interpreted: a customer may send "{...}".
function interpretContent(message: JsonObject, direction: MessageDirection): Interpreted {
    const payload = direction === "customer" ? undefined : parseEmbeddedJson(getValue(message, "content"));

    if (isAdaptiveCard(payload)) {
        return { cards: [payload], text: "" };
    }

    if (isObject(payload)) {
        // Technical context events (setcontext, startConversation, ...).
        if (getValue(payload, "EventName") !== undefined) {
            return { cards: [], hide: true, text: "" };
        }
        const text = cleanText(asString(getValue(payload, "text")));
        const cards = cardsFromAttachments(getValue(payload, "attachments"), text);
        const suggestions = toActionSet(getValue(getNestedObject(payload, "suggestedActions") ?? {}, "actions"));
        if (suggestions) {
            cards.push({ type: "AdaptiveCard", version: "1.5", body: [suggestions] });
        }
        if (cards.length > 0 || text) {
            return { cards, text };
        }
        const system = cleanText(asString(getValue(payload, "system")));
        if (system) {
            return { cards: [], text: system };
        }
        if (direction === "system") {
            return { cards: [], hide: true, text: "" };
        }
    }

    const plain = cleanText(getString(message, TEXT_KEYS) ?? "");
    const cards = cardsFromAttachments(getValue(message, "attachments"), plain);
    if (cards.length === 0) {
        const fallback = parseEmbeddedJson(getValue(message, "adaptiveCardText"));
        if (isAdaptiveCard(fallback)) {
            cards.push(fallback);
        }
    }
    return { cards, text: cards.length > 0 ? "" : plain };
}

const MIME_BY_EXTENSION: Record<string, string> = {
    "3gp": "video/3gpp",
    aac: "audio/aac",
    amr: "audio/amr",
    bmp: "image/bmp",
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    m4a: "audio/mp4",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    pdf: "application/pdf",
    png: "image/png",
    wav: "audio/wav",
    webm: "video/webm",
    webp: "image/webp",
};

// Files sent by the customer or representative: the transcript lists them and the
// file itself is stored as a note (annotation) on the conversation.
function extractAttachments(message: JsonObject): MessageAttachment[] {
    const list = getValue(message, "attachments");
    if (!Array.isArray(list)) {
        return [];
    }
    const result: MessageAttachment[] = [];
    (list as unknown[]).forEach((entry, index) => {
        if (!isObject(entry)) {
            return;
        }
        const declared = asString(getValue(entry, "contentType")).toLowerCase();
        if (declared.includes("card.")) {
            return;
        }
        const name = getString(entry, ["name", "fileName"]) ?? "";
        const annotationId = getString(entry, ["annotationid"]);
        if (!name && !annotationId) {
            return;
        }
        const extension =
            /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? asString(getValue(entry, "fileType")).toLowerCase();
        const guessed: string | undefined = MIME_BY_EXTENSION[extension];
        const contentType =
            declared && declared !== "application/octet-stream" ? declared : guessed ?? "application/octet-stream";
        result.push({
            annotationId,
            contentType,
            id: getString(entry, ["id"]) ?? annotationId ?? `attachment-${index}`,
            name,
        });
    });
    return result;
}

interface Sender {
    name?: string;
    participantType?: string;
}

function describeSender(message: JsonObject): Sender {
    const from = getNestedObject(message, "from") ?? getNestedObject(message, "sender");
    if (!from) {
        return {};
    }
    for (const participantType of SENDER_KINDS) {
        const participant = getNestedObject(from, participantType);
        if (participant) {
            return {
                name: getString(participant, ["displayName", "name"]),
                participantType,
            };
        }
    }
    return { name: getString(from, AUTHOR_KEYS) };
}

function getTags(message: JsonObject): string[] {
    const tags = getValue(message, "tags") ?? getValue(message, "tag");
    const values = Array.isArray(tags) ? (tags as unknown[]).map(asString) : asString(tags).split(",");
    return values.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
}

function classifyDirection(
    message: JsonObject,
    sender: Sender,
    author: string,
    customerName: string
): MessageDirection {
    const tags = getTags(message);
    const marker = [
        getString(message, ["senderType", "role", "participantType"]),
        getString(getNestedObject(message, "from") ?? {}, ["role", "type"]),
    ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase();

    if (tags.includes("system") || marker.includes("system") || marker.includes("control")) {
        return "system";
    }
    if (
        tags.includes("fromcustomer") ||
        sender.participantType === "application" ||
        marker.includes("customer") ||
        marker.includes("visitor") ||
        marker.includes("user") ||
        marker.includes("external")
    ) {
        return "customer";
    }
    if (
        tags.includes("public") ||
        sender.participantType === "user" ||
        marker.includes("agent") ||
        marker.includes("representative") ||
        marker.includes("bot") ||
        marker.includes("internal")
    ) {
        return "representative";
    }
    const normalizedCustomer = customerName.trim().toLowerCase();
    if (normalizedCustomer !== "" && author.trim().toLowerCase() === normalizedCustomer) {
        return "customer";
    }
    return "unknown";
}

function isPrivateMessage(message: JsonObject): boolean {
    const tags = getValue(message, "tags") ?? getValue(message, "tag");
    if (Array.isArray(tags)) {
        return tags.some((tag) => String(tag).toLowerCase() === "private");
    }
    return typeof tags === "string" && tags.toLowerCase().includes("private");
}

function parseDate(message: JsonObject): Date | undefined {
    const value = getString(message, DATE_KEYS);
    if (!value) {
        return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseTranscript(
    transcript: string | undefined,
    includeSystemMessages: boolean,
    customerName = ""
): ConversationMessage[] {
    if (!transcript?.trim()) {
        return [];
    }

    try {
        const messages = findMessageArray(parseJson(transcript));
        return messages
            .map((item, index): ConversationMessage | undefined => {
                if (
                    !isObject(item) ||
                    getBoolean(item, "isControlMessage") ||
                    getBoolean(item, "deleted") ||
                    isPrivateMessage(item) ||
                    getTags(item).some((tag) => HIDDEN_TAGS.includes(tag))
                ) {
                    return undefined;
                }

                const sender = describeSender(item);
                const senderName =
                    sender.name ??
                    getString(item, AUTHOR_KEYS) ??
                    "Onbekend";
                const direction = classifyDirection(
                    item,
                    sender,
                    senderName,
                    customerName
                );
                if (direction === "system" && !includeSystemMessages) {
                    return undefined;
                }

                // The channel participant is identified by phone number; prefer the contact's name.
                const author =
                    direction === "customer" &&
                    customerName &&
                    sender.participantType === "application"
                        ? customerName
                        : senderName === "__customer__"
                          ? "Systeem"
                          : senderName;

                const interpreted = interpretContent(item, direction);
                const attachments = extractAttachments(item);
                if (interpreted.hide || (!interpreted.text && interpreted.cards.length === 0 && attachments.length === 0)) {
                    return undefined;
                }

                return {
                    id: getString(item, ["id", "messageId", "activityId"]) ?? `message-${index}`,
                    attachments,
                    author,
                    cards: interpreted.cards,
                    direction,
                    text: interpreted.text,
                    timestamp: parseDate(item),
                };
            })
            .filter((message): message is ConversationMessage => Boolean(message))
            .sort((left, right) => {
                const leftTime = left.timestamp?.getTime() ?? 0;
                const rightTime = right.timestamp?.getTime() ?? 0;
                return leftTime - rightTime;
            });
    } catch {
        return [];
    }
}
