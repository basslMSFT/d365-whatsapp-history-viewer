import * as React from "react";
import { AdaptiveCardView } from "./AdaptiveCardView";
import {
    listWhatsAppConversations,
    loadConversation,
    loadCustomerName,
} from "./ConversationService";
import { Conversation, ConversationMessage, ConversationSummary } from "./models";

export interface IConversationViewerProps {
    // Height in pixels allocated by the form; -1 when the form doesn't allocate one.
    allocatedHeight: number;
    customerId: string;
    customerName: string;
    // Explicit height in pixels; 0 fits the control to the available space.
    height: number;
    historyMonths: number;
    maximumConversations: number;
    // Newest conversation and message first; false lists oldest first.
    newestFirst: boolean;
    pageSize: number;
    showSystemMessages: boolean;
    webApi: ComponentFramework.WebApi;
}

interface ViewerState {
    conversations: Conversation[];
    error?: string;
    hasMore: boolean;
    loading: boolean;
    loadingMore: boolean;
    total: number;
}

const EMPTY_STATE: ViewerState = {
    conversations: [],
    hasMore: false,
    loading: false,
    loadingMore: false,
    total: 0,
};
const MIN_HEIGHT = 320;
const BOTTOM_MARGIN = 16;
const NARROW_WIDTH = 520;
const LOAD_AHEAD_MARGIN = "240px";

function describeError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    // Dataverse Web API failures are plain objects with a message property.
    if (typeof error === "object" && error !== null) {
        const details = error as { code?: unknown; message?: unknown };
        const message =
            typeof details.message === "string" ? details.message : "";
        const code =
            typeof details.code === "string" || typeof details.code === "number"
                ? String(details.code)
                : "";
        if (message || code) {
            return [code, message].filter(Boolean).join(": ");
        }
    }
    return typeof error === "string" && error ? error : "Onbekende fout";
}

function formatDate(value: Date | undefined): string {
    if (!value) {
        return "Datum onbekend";
    }
    return new Intl.DateTimeFormat("nl-NL", {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(value);
}

function formatTime(value: Date | undefined): string {
    if (!value) {
        return "";
    }
    return new Intl.DateTimeFormat("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
    }).format(value);
}

function MessageBubble({ message }: { message: ConversationMessage }): React.ReactElement {
    const directionClass = `wacv-message--${message.direction}`;
    return (
        <div className={`wacv-message ${directionClass}`}>
            <div className="wacv-message__meta">
                <span className="wacv-message__author">{message.author}</span>
                <time dateTime={message.timestamp?.toISOString()}>
                    {formatTime(message.timestamp)}
                </time>
            </div>
            <div
                className={`wacv-message__bubble${
                    message.cards.length > 0 ? " wacv-message__bubble--card" : ""
                }`}
            >
                {message.text}
                {message.cards.map((card, index) => (
                    <AdaptiveCardView card={card} key={`${message.id}-card-${index}`} />
                ))}
            </div>
        </div>
    );
}

// Measures the space below the control so it can fill the visible form area.
function useLayout(rootRef: React.RefObject<HTMLElement>): { fitHeight: number; narrow: boolean } {
    const [layout, setLayout] = React.useState({ fitHeight: 480, narrow: false });

    React.useEffect(() => {
        const root = rootRef.current;
        if (!root) {
            return undefined;
        }

        const update = (): void => {
            // Controls on a hidden tab have no layout box yet.
            if (root.offsetParent === null) {
                return;
            }
            const rect = root.getBoundingClientRect();
            const fitHeight = Math.max(
                MIN_HEIGHT,
                Math.floor(window.innerHeight - rect.top - BOTTOM_MARGIN)
            );
            const narrow = rect.width < NARROW_WIDTH;
            setLayout((current) =>
                current.fitHeight === fitHeight && current.narrow === narrow
                    ? current
                    : { fitHeight, narrow }
            );
        };

        update();
        window.addEventListener("resize", update);
        const observer =
            typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
        observer?.observe(root);

        return () => {
            window.removeEventListener("resize", update);
            observer?.disconnect();
        };
    }, [rootRef]);

    return layout;
}

export const ConversationViewer: React.FC<IConversationViewerProps> = (props) => {
    const {
        customerId,
        customerName,
        historyMonths,
        maximumConversations,
        newestFirst,
        pageSize,
        showSystemMessages,
        webApi,
    } = props;
    const [state, setState] = React.useState<ViewerState>({
        ...EMPTY_STATE,
        loading: Boolean(customerId),
    });
    const [reloadToken, setReloadToken] = React.useState(0);
    const rootRef = React.useRef<HTMLElement>(null);
    const threadRef = React.useRef<HTMLDivElement>(null);
    const sentinelRef = React.useRef<HTMLDivElement>(null);
    const summariesRef = React.useRef<ConversationSummary[]>([]);
    const nextIndexRef = React.useRef(0);
    const generationRef = React.useRef(0);
    const loadingRef = React.useRef(false);
    const nameRef = React.useRef("");
    const layout = useLayout(rootRef);

    const loadNextPage = React.useCallback(
        async (generation: number): Promise<void> => {
            const summaries = summariesRef.current;
            const start = nextIndexRef.current;
            if (loadingRef.current || start >= summaries.length) {
                return;
            }

            loadingRef.current = true;
            nextIndexRef.current = Math.min(start + pageSize, summaries.length);
            setState((current) => ({ ...current, loadingMore: true }));
            try {
                const batch = await Promise.all(
                    summaries
                        .slice(start, nextIndexRef.current)
                        .map((summary) =>
                            loadConversation(webApi, summary, nameRef.current, showSystemMessages)
                        )
                );
                if (generation !== generationRef.current) {
                    return;
                }
                // Release the lock first so the scroll observer can request the next page.
                loadingRef.current = false;
                const loaded = batch.filter(
                    (conversation): conversation is Conversation => conversation !== undefined
                );
                setState((current) => ({
                    ...current,
                    conversations: [...current.conversations, ...loaded],
                    hasMore: nextIndexRef.current < summaries.length,
                    loadingMore: false,
                }));
            } catch (error: unknown) {
                if (generation !== generationRef.current) {
                    return;
                }
                loadingRef.current = false;
                setState((current) => ({
                    ...current,
                    error: describeError(error),
                    hasMore: false,
                    loadingMore: false,
                }));
            }
        },
        [pageSize, showSystemMessages, webApi]
    );

    const loadMore = React.useCallback((): void => {
        void loadNextPage(generationRef.current);
    }, [loadNextPage]);

    React.useEffect(() => {
        generationRef.current += 1;
        const generation = generationRef.current;
        loadingRef.current = false;
        summariesRef.current = [];
        nextIndexRef.current = 0;

        if (!customerId) {
            setState(EMPTY_STATE);
            return;
        }

        setState({ ...EMPTY_STATE, loading: true });
        const start = async (): Promise<void> => {
            try {
                nameRef.current = customerName || (await loadCustomerName(webApi, customerId));
                const summaries = await listWhatsAppConversations(
                    webApi,
                    customerId,
                    historyMonths,
                    maximumConversations
                );
                if (generation !== generationRef.current) {
                    return;
                }
                summariesRef.current = newestFirst ? summaries : [...summaries].reverse();
                setState({
                    ...EMPTY_STATE,
                    hasMore: summaries.length > 0,
                    total: summaries.length,
                });
                await loadNextPage(generation);
            } catch (error: unknown) {
                if (generation === generationRef.current) {
                    setState({ ...EMPTY_STATE, error: describeError(error) });
                }
            }
        };
        void start();
    }, [
        customerId,
        customerName,
        historyMonths,
        loadNextPage,
        maximumConversations,
        newestFirst,
        reloadToken,
        webApi,
    ]);

    // Load the next page when the end of the list scrolls into view.
    React.useEffect(() => {
        const sentinel = sentinelRef.current;
        if (
            !sentinel ||
            !state.hasMore ||
            state.loadingMore ||
            typeof IntersectionObserver === "undefined"
        ) {
            return undefined;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    loadMore();
                }
            },
            { root: threadRef.current, rootMargin: LOAD_AHEAD_MARGIN }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [loadMore, state.conversations.length, state.hasMore, state.loadingMore]);

    const totalMessages = state.conversations.reduce(
        (total, conversation) => total + conversation.messages.length,
        0
    );
    const rootHeight =
        props.height > 0
            ? props.height
            : props.allocatedHeight > 0
              ? props.allocatedHeight
              : layout.fitHeight;
    const hasConversations = state.conversations.length > 0;
    const showThread = !state.loading && (hasConversations || state.hasMore);

    return (
        <section
            aria-label="Samengestelde WhatsApp-conversatie"
            className={`wacv-root${layout.narrow ? " wacv-root--narrow" : ""}`}
            ref={rootRef}
            style={{ height: rootHeight }}
        >
            <header className="wacv-header">
                <div>
                    <div className="wacv-header__eyebrow">WHATSAPP-HISTORIE</div>
                    <h2>{nameRef.current || customerName || "Klant"}</h2>
                    {!state.loading && (hasConversations || !state.hasMore) && (
                        <p>
                            {state.hasMore
                                ? `${state.conversations.length} van ${state.total} gesprekken geladen`
                                : `${state.conversations.length} gesprekken`}
                            {` · ${totalMessages} berichten · ${
                                newestFirst ? "nieuwste eerst" : "oudste eerst"
                            }`}
                        </p>
                    )}
                </div>
                <button
                    className="wacv-refresh"
                    aria-label="Historie vernieuwen"
                    disabled={state.loading || state.loadingMore || !customerId}
                    onClick={() => setReloadToken((value) => value + 1)}
                    type="button"
                >
                    Vernieuwen
                </button>
            </header>

            {!customerId && (
                <div className="wacv-state">
                    Koppel de control aan een Contact- of Account-lookup om de historie te tonen.
                </div>
            )}

            {(state.loading || (state.loadingMore && !hasConversations)) && (
                <div className="wacv-state">
                    <div className="wacv-spinner" aria-hidden="true" />
                    <span>WhatsApp-historie laden...</span>
                </div>
            )}

            {state.error && (
                <div
                    className={`wacv-state wacv-state--error${
                        hasConversations ? " wacv-state--compact" : ""
                    }`}
                    role="alert"
                >
                    <strong>De WhatsApp-historie kon niet worden geladen.</strong>
                    <span>{state.error}</span>
                </div>
            )}

            {!state.loading &&
                !state.loadingMore &&
                !state.hasMore &&
                !state.error &&
                customerId &&
                !hasConversations && (
                    <div className="wacv-state">
                        Geen WhatsApp-transcripts gevonden binnen de ingestelde periode.
                    </div>
                )}

            {showThread && (
                <div className="wacv-thread" ref={threadRef}>
                    {state.conversations.map((conversation) => (
                        <React.Fragment key={conversation.id}>
                            <div className="wacv-boundary">
                                <span />
                                <div>
                                    <strong>{formatDate(conversation.createdOn)}</strong>
                                    <small>
                                        {conversation.title}
                                        {conversation.state ? ` · ${conversation.state}` : ""}
                                    </small>
                                </div>
                                <span />
                            </div>
                            {(newestFirst
                                ? [...conversation.messages].reverse()
                                : conversation.messages
                            ).map((message) => (
                                <MessageBubble
                                    key={`${conversation.id}-${message.id}`}
                                    message={message}
                                />
                            ))}
                        </React.Fragment>
                    ))}
                    {state.hasMore && (
                        <div className="wacv-more" ref={sentinelRef}>
                            {state.loadingMore ? (
                                <>
                                    <div className="wacv-spinner" aria-hidden="true" />
                                    <span>
                                        {newestFirst
                                            ? "Oudere gesprekken laden..."
                                            : "Nieuwere gesprekken laden..."}
                                    </span>
                                </>
                            ) : (
                                <button className="wacv-refresh" onClick={loadMore} type="button">
                                    {newestFirst
                                        ? "Oudere gesprekken laden"
                                        : "Nieuwere gesprekken laden"}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};
