import { ConversationMessage, MessageDirection } from "./models";

type JsonObject = Record<string, unknown>;

const ARRAY_KEYS = ["messages", "activities", "value", "transcript", "items"];
const TEXT_KEYS = ["text", "content", "message", "body", "value"];
const DATE_KEYS = ["createdDateTime", "timestamp", "createdOn", "sentOn", "localTimestamp"];
const AUTHOR_KEYS = ["senderDisplayName", "displayName", "userDisplayName", "name"];
const SENDER_KINDS = ["user", "application", "bot", "device", "phone", "guest"];

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

function cardsFromAttachments(attachments: unknown): JsonObject[] {
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
        }
    }
    return cards;
}

// Contact Center stores cards as a JSON string in `content`; `adaptiveCardText`
// is a simplified fallback that is only used when the full card is unavailable.
function extractCards(message: JsonObject): JsonObject[] {
    const content = parseEmbeddedJson(getValue(message, "content"));
    if (isAdaptiveCard(content)) {
        return [content];
    }
    const fromContent = isObject(content)
        ? cardsFromAttachments(getValue(content, "attachments"))
        : [];
    if (fromContent.length > 0) {
        return fromContent;
    }
    const fromAttachments = cardsFromAttachments(getValue(message, "attachments"));
    if (fromAttachments.length > 0) {
        return fromAttachments;
    }
    const fallback = parseEmbeddedJson(getValue(message, "adaptiveCardText"));
    return isAdaptiveCard(fallback) ? [fallback] : [];
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
                    isPrivateMessage(item)
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

                const cards = extractCards(item);
                const text = cards.length > 0 ? "" : getString(item, TEXT_KEYS) ?? "";
                if (!text && cards.length === 0) {
                    return undefined;
                }

                return {
                    id: getString(item, ["id", "messageId", "activityId"]) ?? `message-${index}`,
                    author,
                    cards,
                    direction,
                    text,
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
