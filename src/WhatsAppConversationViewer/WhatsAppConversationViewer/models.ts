export type MessageDirection = "customer" | "representative" | "system" | "unknown";

export type AdaptiveCardPayload = Record<string, unknown>;

export interface ConversationMessage {
    id: string;
    author: string;
    cards: AdaptiveCardPayload[];
    direction: MessageDirection;
    text: string;
    timestamp?: Date;
}

export interface ConversationSummary {
    id: string;
    closedOn?: Date;
    createdOn?: Date;
    state: string;
    title: string;
}

export interface Conversation {
    id: string;
    channelType: string;
    closedOn?: Date;
    createdOn?: Date;
    messages: ConversationMessage[];
    state: string;
    title: string;
}

export interface LiveConversationRecord extends ComponentFramework.WebApi.Entity {
    activityid?: string;
    createdon?: string;
    msdyn_channel?: string | number;
    msdyn_ocliveworkitemid?: string;
    msdyn_title?: string;
    modifiedon?: string;
    statecode?: number;
    statuscode?: number;
}

export interface TranscriptRecord extends ComponentFramework.WebApi.Entity {
    _msdyn_liveworkitemidid_value?: string;
    createdon?: string;
    msdyn_transcriptid?: string;
}

export interface TranscriptAnnotation extends ComponentFramework.WebApi.Entity {
    annotationid?: string;
    createdon?: string;
    documentbody?: string;
    subject?: string;
}
