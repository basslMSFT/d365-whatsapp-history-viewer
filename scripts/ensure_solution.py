import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from auth import get_credential, load_env
from PowerPlatform.Dataverse.client import DataverseClient


SOLUTION_VERSION = "1.7.0.0"


def get_publisher_id() -> str:
    publisher_id = os.environ.get("PUBLISHER_ID")
    if not publisher_id:
        raise SystemExit(
            "Set PUBLISHER_ID in .env to the GUID of the Dataverse publisher "
            "that should own the solution."
        )
    return publisher_id


def main() -> None:
    load_env()
    solution_name = os.environ["SOLUTION_NAME"]
    client = DataverseClient(
        base_url=os.environ["DATAVERSE_URL"],
        credential=get_credential(),
    )
    pages = client.records.get(
        "solution",
        filter=f"uniquename eq '{solution_name}'",
        select=["solutionid", "friendlyname", "uniquename", "version"],
        top=1,
    )
    existing = next((record for page in pages for record in page), None)
    if existing:
        if existing.get("version") != SOLUTION_VERSION:
            client.records.update(
                "solution",
                existing["solutionid"],
                {"version": SOLUTION_VERSION},
            )
            print(
                f"Updated solution version: {existing['uniquename']} "
                f"{existing.get('version')} -> {SOLUTION_VERSION}"
            )
            return
        print(
            f"Solution already exists: {existing['uniquename']} "
            f"({existing['solutionid']})"
        )
        return

    solution_id = client.records.create(
        "solution",
        {
            "uniquename": solution_name,
            "friendlyname": "WhatsApp Conversation Viewer",
            "version": SOLUTION_VERSION,
            "publisherid@odata.bind": f"/publishers({get_publisher_id()})",
            "description": (
                "Unified chronological WhatsApp conversation history for "
                "Dynamics 365 Contact Center representatives."
            ),
        },
    )
    print(f"Created solution: {solution_name} ({solution_id})")


if __name__ == "__main__":
    main()
