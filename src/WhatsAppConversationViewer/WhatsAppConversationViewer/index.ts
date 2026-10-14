import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { ConversationViewer, IConversationViewerProps } from "./ConversationViewer";
import * as React from "react";

export class WhatsAppConversationViewer implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    public init(
        context: ComponentFramework.Context<IInputs>,
        _notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary
    ): void {
        // Re-render with the allocated height when the form resizes the control.
        context.mode.trackContainerResize(true);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const customer = context.parameters.customer.raw?.[0];
        const entityName = context.parameters.entityName.raw?.toLowerCase() ?? "";
        const entityId =
            entityName === "contact" ? context.parameters.entityId.raw ?? "" : "";
        const props: IConversationViewerProps = {
            allocatedHeight: context.mode.allocatedHeight,
            customerId: customer?.id ?? entityId,
            customerName: customer?.name ?? "",
            height: Math.max(0, context.parameters.height.raw ?? 0),
            historyMonths: context.parameters.historyMonths.raw ?? 12,
            maximumConversations: context.parameters.maximumConversations.raw ?? 50,
            newestFirst: context.parameters.sortOrder.raw !== "2",
            pageSize: Math.max(1, Math.min(context.parameters.pageSize.raw ?? 3, 20)),
            showSystemMessages: context.parameters.showSystemMessages.raw ?? false,
            webApi: context.webAPI,
        };

        return React.createElement(ConversationViewer, props);
    }

    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        // ReactControl lifecycle handles component cleanup.
    }
}
