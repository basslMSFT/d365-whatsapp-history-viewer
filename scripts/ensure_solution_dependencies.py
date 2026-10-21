import os
import sys

import requests

sys.path.insert(0, os.path.dirname(__file__))

from auth import get_credential, get_token, load_env
from PowerPlatform.Dataverse.client import DataverseClient


SOLUTION_NAME = "WhatsAppConversationViewer"
# Table shells only: the forms need their parent tables, but not the other
# customizations that happen to be on them. See strip_foreign_components.py.
TABLES = ("contact", "incident", "msdyn_ocliveworkitem")


def add_solution_component(
    environment_url: str,
    headers: dict[str, str],
    component_id: str,
    component_type: int,
) -> None:
    response = requests.post(
        f"{environment_url}/api/data/v9.2/AddSolutionComponent",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "ComponentId": component_id,
            "ComponentType": component_type,
            "SolutionUniqueName": SOLUTION_NAME,
            "AddRequiredComponents": False,
            "DoNotIncludeSubcomponents": component_type == 1,
        },
        timeout=120,
    )
    if not response.ok:
        raise RuntimeError(
            f"AddSolutionComponent failed ({component_type}, {component_id}): "
            f"{response.status_code} {response.text}"
        )


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

    for table in TABLES:
        table_info = client.tables.get(table)
        add_solution_component(
            environment_url,
            headers,
            table_info.metadata_id,
            1,
        )
        print(f"Added table shell: {table} ({table_info.metadata_id})")


if __name__ == "__main__":
    main()
