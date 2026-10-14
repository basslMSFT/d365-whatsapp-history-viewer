import * as React from "react";
import { normalizeGuid } from "./guid";
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

const RISKY_EXTENSIONS = new Set([
    "apk", "app", "bat", "cmd", "com", "cpl", "dll", "docm", "exe", "hta", "htm", "html", "iso", "jar",
    "js", "jse", "lnk", "mht", "mhtml", "msi", "pif", "ps1", "pptm", "reg", "scr", "sh", "svg", "vbe",
    "vbs", "wsf", "xhtml", "xlsm",
]);
const FILE_NAME_FORBIDDEN = /[\\/:*?"<>|]/g;
const MAX_FILE_NAME = 120;

function isStrippedChar(code: number): boolean {
    return (
        code < 32 ||
        (code >= 127 && code <= 159) ||
        code === 0x200e ||
        code === 0x200f ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)
    );
}

// The name comes from the customer. Control and direction-override characters are
// removed so the extension can't be disguised, and path characters can't be smuggled in.
function safeFileName(name: string | undefined, fallback: string): string {
    let cleaned = "";
    for (const char of name ?? "") {
        if (!isStrippedChar(char.charCodeAt(0))) {
            cleaned += char;
        }
    }
    cleaned = cleaned.replace(FILE_NAME_FORBIDDEN, "_").trim();
    while (cleaned.startsWith(".")) {
        cleaned = cleaned.slice(1);
    }
    return cleaned.slice(0, MAX_FILE_NAME).trim() || fallback;
}

// Files that could run or script when opened get a harmless extension appended.
function downloadName(name: string): string {
    const dot = name.lastIndexOf(".");
    const extension = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
    return RISKY_EXTENSIONS.has(extension) ? `${name}.txt` : name;
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
    const name = safeFileName(attachment.name, KIND_LABELS[kind]);
    const annotationId = normalizeGuid(attachment.annotationId) || undefined;

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
            // Only known media types keep their type; anything else is a neutral download.
            const blobType = kindOf(resolvedType) === "file" ? "application/octet-stream" : resolvedType;
            const blobUrl = URL.createObjectURL(base64ToBlob(body, blobType));
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
        <>
            <a className="wacv-attachment__chip wacv-attachment__chip--link" download={downloadName(name)} href={url}>
                {name} · Downloaden
            </a>
            <div className="wacv-attachment__caption">
                Niet gescand op virussen. Open alleen bestanden die je vertrouwt.
            </div>
        </>
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
