import os
import sys
import time

import requests

sys.path.insert(0, os.path.dirname(__file__))

from auth import get_credential, get_token, load_env
from PowerPlatform.Dataverse.client import DataverseClient


SOLUTION_NAME = "WhatsAppConversationViewer"
ANCHOR_COLUMNS = {
    "contact": "nldrive_ContactWhatsAppViewerAnchor",
    "incident": "nldrive_CaseWhatsAppViewerAnchor",
    "msdyn_ocliveworkitem": "nldrive_ConversationWhatsAppViewerAnchor",
}


def metadata_url(environment_url: str, table: str, schema_name: str) -> str:
    return (
        f"{environment_url}/api/data/v9.2/"
        f"EntityDefinitions(LogicalName='{table}')/Attributes"
        f"?$select=MetadataId,LogicalName,SchemaName"
        f"&$filter=SchemaName eq '{schema_name}'"
    )


def get_attribute(
    environment_url: str,
    headers: dict[str, str],
    table: str,
    schema_name: str,
) -> dict[str, str] | None:
    response = requests.get(
        metadata_url(environment_url, table, schema_name),
        headers=headers,
        timeout=120,
    )
    response.raise_for_status()
    records = response.json()["value"]
    return records[0] if records else None


def add_to_solution(
    environment_url: str,
    headers: dict[str, str],
    metadata_id: str,
) -> None:
    response = requests.post(
        f"{environment_url}/api/data/v9.2/AddSolutionComponent",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "ComponentId": metadata_id,
            "ComponentType": 2,
            "SolutionUniqueName": SOLUTION_NAME,
            "AddRequiredComponents": False,
            "DoNotIncludeSubcomponents": True,
        },
        timeout=120,
    )
    response.raise_for_status()


def main() -> None:
    load_env()
    environment_url = os.environ["DATAVERSE_URL"].rstrip("/")
    headers = {
        "Authorization": f"Bearer {get_token()}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    }
    client = DataverseClient(
        base_url=environment_url,
        credential=get_credential(),
    )

    for table, schema_name in ANCHOR_COLUMNS.items():
        attribute = get_attribute(environment_url, headers, table, schema_name)
        if attribute is None:
            created = client.tables.add_columns(table, {schema_name: "string"})
            print(f"Created on {table}: {', '.join(created)}")
            time.sleep(5)
            attribute = get_attribute(
                environment_url,
                headers,
                table,
                schema_name,
            )

        if attribute is None:
            raise RuntimeError(f"Column was not found after creation: {schema_name}")

        add_to_solution(environment_url, headers, attribute["MetadataId"])
        print(
            f"Added to {SOLUTION_NAME}: {table}."
            f"{attribute['LogicalName']} ({attribute['MetadataId']})"
        )


if __name__ == "__main__":
    main()
