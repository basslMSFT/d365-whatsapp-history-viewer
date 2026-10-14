import {
    Conversation,
    ConversationSummary,
    LiveConversationRecord,
    TranscriptAnnotation,
    TranscriptRecord,
} from "./models";
import { normalizeGuid } from "./guid";
import { parseTranscript } from "./TranscriptParser";

const LIVE_CONVERSATION_ENTITY = "msdyn_ocliveworkitem";
const TRANSCRIPT_ENTITY = "msdyn_transcript";
const ANNOTATION_ENTITY = "annotation";
const WHATSAPP_CHANNEL = "192300000";
const MAX_CONVERSATION_QUERY = 100;
const FORMATTED_VALUE =
    "@OData.Community.Display.V1.FormattedValue";
function asDate(value: string | undefined): Date | undefined {
    if (!value) {
        return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

function decodeBase64(value: string): string {
    const bytes = Uint8Array.from(atob(value), (character) =>
        character.charCodeAt(0)
    );
    return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

function getFormattedValue(
    record: ComponentFramework.WebApi.Entity,
    property: string
): string {
    const value = record[`${property}${FORMATTED_VALUE}`] as unknown;
    return typeof value === "string" ? value : "";
}

export async function loadCustomerName(
    webApi: ComponentFramework.WebApi,
    contactId: string
): Promise<string> {
    const id = normalizeGuid(contactId);
    if (!id) {
        return "";
    }
    try {
        const contact = await webApi.retrieveRecord("contact", id, "?$select=fullname");
        const name = contact.fullname as unknown;
        return typeof name === "string" ? name : "";
    } catch {
        return "";
    }
}

async function loadTranscript(
    webApi: ComponentFramework.WebApi,
    conversationId: string
): Promise<{ annotation: TranscriptAnnotation; transcript: TranscriptRecord } | undefined> {
    const safeConversationId = normalizeGuid(conversationId);
    if (!safeConversationId) {
        return undefined;
    }
    const transcriptOptions =
        "?$select=msdyn_transcriptid,_msdyn_liveworkitemidid_value,createdon" +
        `&$filter=_msdyn_liveworkitemidid_value eq ${safeConversationId}` +
        "&$orderby=createdon desc&$top=1";
    const transcriptResponse = await webApi.retrieveMultipleRecords(
        TRANSCRIPT_ENTITY,
        transcriptOptions,
        1
    );
    const transcript = transcriptResponse.entities[0] as
        | TranscriptRecord
        | undefined;
    const transcriptId = normalizeGuid(transcript?.msdyn_transcriptid);
    if (!transcript || !transcriptId) {
        return undefined;
    }

    const annotationOptions =
        "?$select=annotationid,createdon,documentbody,subject" +
        `&$filter=_objectid_value eq ${transcriptId}&$top=1`;
    const annotationResponse = await webApi.retrieveMultipleRecords(
        ANNOTATION_ENTITY,
        annotationOptions,
        1
    );
    const annotation = annotationResponse.entities[0] as
        | TranscriptAnnotation
        | undefined;
    if (!annotation) {
        return undefined;
    }
    return { annotation, transcript };
}

/**
 * Lists the customer's WhatsApp conversations, newest first. Only lightweight
 * metadata is retrieved; transcripts are loaded per page by loadConversation.
 */
export async function listWhatsAppConversations(
    webApi: ComponentFramework.WebApi,
    customerId: string,
    historyMonths: number,
    maximumConversations: number
): Promise<ConversationSummary[]> {
    const normalizedCustomerId = normalizeGuid(customerId);
    if (!normalizedCustomerId) {
        return [];
    }

    const months = Math.max(1, Math.min(historyMonths, 60));
    const limit = Math.max(1, Math.min(maximumConversations, 100));
    const fromDate = new Date();
    fromDate.setUTCMonth(fromDate.getUTCMonth() - months);

    const filter = [
        `_msdyn_customer_value eq ${normalizedCustomerId}`,
        `createdon ge ${fromDate.toISOString()}`,
    ].join(" and ");
    const options =
        "?$select=activityid,createdon,modifiedon,msdyn_channel," +
        "msdyn_ocliveworkitemid,msdyn_title,statecode,statuscode" +
        `&$filter=${encodeURIComponent(filter)}` +
        "&$orderby=createdon desc" +
        `&$top=${MAX_CONVERSATION_QUERY}`;

    const response = await webApi.retrieveMultipleRecords(
        LIVE_CONVERSATION_ENTITY,
        options,
        MAX_CONVERSATION_QUERY
    );
    // msdyn_channel is text in some environments and a choice in others.
    return (response.entities as LiveConversationRecord[])
        .filter((record) => String(record.msdyn_channel) === WHATSAPP_CHANNEL)
        .slice(0, limit)
        .map((record): ConversationSummary | undefined => {
            const id = normalizeGuid(record.activityid ?? record.msdyn_ocliveworkitemid);
            if (!id) {
                return undefined;
            }
            const closedOn = asDate(record.modifiedon);
            return {
                id,
                closedOn,
                createdOn: asDate(record.createdon),
                state:
                    getFormattedValue(record, "statuscode") ||
                    (closedOn ? "afgesloten" : ""),
                title: record.msdyn_title ?? "WhatsApp-gesprek",
            };
        })
        .filter((summary): summary is ConversationSummary => Boolean(summary));
}

export async function loadConversation(
    webApi: ComponentFramework.WebApi,
    summary: ConversationSummary,
    customerName: string,
    showSystemMessages: boolean
): Promise<Conversation | undefined> {
    const result = await loadTranscript(webApi, summary.id);
    if (!result?.annotation.documentbody) {
        return undefined;
    }

    const messages = parseTranscript(
        decodeBase64(result.annotation.documentbody),
        showSystemMessages,
        customerName
    );
    if (messages.length === 0) {
        return undefined;
    }

    return {
        ...summary,
        channelType: "WhatsApp",
        createdOn: summary.createdOn ?? asDate(result.transcript.createdon),
        messages,
    };
}
