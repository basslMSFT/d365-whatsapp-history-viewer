import * as React from "react";
import { MessageAttachment } from "./models";

type Status = "idle" | "loading" | "ready" | "failed" | "toolarge";
type Kind = "image" | "video" | "audio" | "file";

const MAX_BYTES = 25 * 1024 * 1024;
// SVG is deliberately not an image here: it can carry script when opened on its own.
const INLINE_IMAGE = /^image\/(jpeg|png|gif|webp|bmp)$/i;
const INLINE_VIDEO = /^video\/(mp4|webm|ogg|quicktime|3gpp)$/i;
const INLINE_AUDIO = /^audio\/[a-z0-9.+-]+$/i;
const KIND_LABELS: Record<Kind, string> = {
    audio: "Audio",
    file: "Bestand",
    image: "Afbeelding",
    video: "Video",
};

function kindOf(contentType: string): Kind {
    if (INLINE_IMAGE.test(contentType)) {
        return "image";
    }
    if (INLINE_VIDEO.test(contentType)) {
        return "video";
    }
    if (INLINE_AUDIO.test(contentType)) {
        return "audio";
    }
    return "file";
}

function formatSize(bytes: number | undefined): string {
    if (bytes === undefined || !Number.isFinite(bytes)) {
        return "";
    }
    return bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function base64ToBlob(base64: string, type: string): Blob {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type });
}

export interface IAttachmentViewProps {
    attachment: MessageAttachment;
    webApi: ComponentFramework.WebApi;
}

// The file is stored as a Dataverse note (annotation). Images load right away; other
// files load on request so a long history doesn't download videos nobody opens.
export const AttachmentView: React.FC<IAttachmentViewProps> = ({ attachment, webApi }) => {
    // A transcript entry without a stored file can't be loaded.
    const [status, setStatus] = React.useState<Status>(attachment.annotationId ? "idle" : "failed");
    const [url, setUrl] = React.useState<string>();
    const [contentType, setContentType] = React.useState(attachment.contentType);
    const [size, setSize] = React.useState<number>();
    const [mediaFailed, setMediaFailed] = React.useState(false);
    const urlRef = React.useRef<string>();
    const mountedRef = React.useRef(true);
    const kind = kindOf(contentType);
    const name = attachment.name || KIND_LABELS[kind];
    const { annotationId } = attachment;

    const load = React.useCallback(async (): Promise<void> => {
        if (!annotationId) {
            setStatus("failed");
            return;
        }
        setStatus("loading");
        try {
            if (kindOf(attachment.contentType) !== "image") {
                const meta = await webApi.retrieveRecord("annotation", annotationId, "?$select=filesize");
                const bytes = Number(meta.filesize as unknown);
                if (Number.isFinite(bytes)) {
                    if (mountedRef.current) {
                        setSize(bytes);
                    }
                    if (bytes > MAX_BYTES) {
                        setStatus("toolarge");
                        return;
                    }
                }
            }

            const record = await webApi.retrieveRecord(
                "annotation",
                annotationId,
                "?$select=documentbody,mimetype,filesize"
            );
            const body = record.documentbody as unknown;
            const mime = record.mimetype as unknown;
            if (typeof body !== "string" || !body) {
                throw new Error("De bijlage bevat geen bestand.");
            }
            const resolvedType = typeof mime === "string" && mime ? mime : attachment.contentType;
            const blobUrl = URL.createObjectURL(base64ToBlob(body, resolvedType));
            if (!mountedRef.current) {
                URL.revokeObjectURL(blobUrl);
                return;
            }
            urlRef.current = blobUrl;
            setContentType(resolvedType);
            setUrl(blobUrl);
            setStatus("ready");
        } catch {
            if (mountedRef.current) {
                setStatus("failed");
            }
        }
    }, [annotationId, attachment.contentType, webApi]);

    React.useEffect(() => {
        mountedRef.current = true;
        if (kindOf(attachment.contentType) === "image" && annotationId) {
            void load();
        }
        return () => {
            mountedRef.current = false;
            if (urlRef.current) {
                URL.revokeObjectURL(urlRef.current);
            }
        };
        // Load once per attachment.
    }, [annotationId]);

    const download = url && (
        <a className="wacv-attachment__chip wacv-attachment__chip--link" download={name} href={url}>
            {name} · Downloaden
        </a>
    );

    return (
        <div className={`wacv-attachment wacv-attachment--${kind}`}>
            {status === "ready" && url && kind === "image" && (
                <a href={url} rel="noopener noreferrer" target="_blank" title={name}>
                    <img alt={name} className="wacv-attachment__image" src={url} />
                </a>
            )}
            {status === "ready" && url && kind === "video" && !mediaFailed && (
                <video
                    className="wacv-attachment__video"
                    controls
                    onError={() => setMediaFailed(true)}
                    preload="metadata"
                    src={url}
                />
            )}
            {status === "ready" && url && kind === "audio" && !mediaFailed && (
                <audio
                    className="wacv-attachment__audio"
                    controls
                    onError={() => setMediaFailed(true)}
                    preload="metadata"
                    src={url}
                />
            )}
            {status === "ready" && url && (kind === "file" || mediaFailed) && download}
            {status === "ready" && url && kind !== "file" && !mediaFailed && (
                <div className="wacv-attachment__caption">{name}</div>
            )}

            {status === "idle" && kind !== "image" && (
                <button
                    className="wacv-attachment__chip wacv-attachment__chip--button"
                    onClick={() => {
                        void load();
                    }}
                    type="button"
                >
                    {KIND_LABELS[kind]} laden: {name}
                </button>
            )}
            {(status === "loading" || (status === "idle" && kind === "image")) && (
                <span className="wacv-attachment__chip">{KIND_LABELS[kind]} laden...</span>
            )}
            {status === "failed" && (
                <span className="wacv-attachment__chip wacv-attachment__chip--error" title="Controleer of je leesrechten op notities hebt.">
                    {name} is niet beschikbaar
                </span>
            )}
            {status === "toolarge" && (
                <span className="wacv-attachment__chip wacv-attachment__chip--error">
                    {name} ({formatSize(size)}) is te groot om hier te tonen
                </span>
            )}
        </div>
    );
};
