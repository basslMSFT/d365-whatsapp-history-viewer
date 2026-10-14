import os
import sys
import json

import requests

sys.path.insert(0, os.path.dirname(__file__))

from auth import get_credential, get_token, load_env
from PowerPlatform.Dataverse.client import DataverseClient


CONTROL_NAME = "NLDrive.ContactCenter.WhatsAppConversationViewer"
DEPLOYED_CONTROL_NAME = "nldrive_NLDrive.ContactCenter.WhatsAppConversationViewer"
SOLUTION_NAME = "WhatsAppConversationViewer"
EXPECTED_FORMS = {
    "contact": {
        "anchor": "nldrive_contactwhatsappvieweranchor",
        "bindings": (
            '<entityId type="SingleLine.Text">contactid</entityId>',
            (
                '<entityName static="true" '
                'type="SingleLine.Text">contact</entityName>'
            ),
        ),
        "forms": {"Contact", "Information"},
    },
    "incident": {
        "anchor": "nldrive_casewhatsappvieweranchor",
        "bindings": (
            '<customer type="Lookup.Simple">customerid</customer>',
        ),
        "forms": {"Case", "Information"},
    },
    "msdyn_ocliveworkitem": {
        "anchor": "nldrive_conversationwhatsappvieweranchor",
        "bindings": (
            '<customer type="Lookup.Simple">msdyn_customer</customer>',
        ),
        "forms": {"Active Conversation"},
    },
}


def main() -> None:
    load_env()
    client = DataverseClient(
        base_url=os.environ["DATAVERSE_URL"],
        credential=get_credential(),
    )
    pages = client.records.get(
        "customcontrol",
        select=["customcontrolid", "name", "version"],
        orderby=["modifiedon desc"],
        top=100,
    )
    controls = [
        record
        for page in pages
        for record in page
        if "whatsappconversationviewer" in record.get("name", "").lower()
    ]
    if not controls:
        raise RuntimeError(f"PCF control not found: {CONTROL_NAME}")

    control = controls[0]
    version = control.get("version", "unknown")
    if version != "1.5.0":
        raise RuntimeError(f"Expected control version 1.5.0, found {version}")
    print(
        f"Verified PCF control: {control['name']} "
        f"version {version} "
        f"({control['customcontrolid']})"
    )

    environment_url = os.environ["DATAVERSE_URL"].rstrip("/")
    headers = {
        "Authorization": f"Bearer {get_token()}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    }
    for table, configuration in EXPECTED_FORMS.items():
        anchor = configuration["anchor"]
        metadata_response = requests.get(
            (
                f"{environment_url}/api/data/v9.2/"
                f"EntityDefinitions(LogicalName='{table}')/Attributes"
            ),
            headers=headers,
            params={
                "$select": "LogicalName",
                "$filter": f"LogicalName eq '{anchor}'",
            },
            timeout=120,
        )
        metadata_response.raise_for_status()
        if not metadata_response.json()["value"]:
            raise RuntimeError(f"Missing anchor column: {table}.{anchor}")

        forms_response = requests.get(
            f"{environment_url}/api/data/v9.2/systemforms",
            headers=headers,
            params={
                "$select": "name,formxml",
                "$filter": f"objecttypecode eq '{table}' and type eq 2",
            },
            timeout=120,
        )
        forms_response.raise_for_status()
        matching_forms = {
            form["name"]: form["formxml"]
            for form in forms_response.json()["value"]
            if form["name"] in configuration["forms"]
        }
        missing_forms = configuration["forms"] - set(matching_forms)
        if missing_forms:
            raise RuntimeError(
                f"Missing forms on {table}: {', '.join(sorted(missing_forms))}"
            )
        for form_name, form_xml in matching_forms.items():
            if anchor not in form_xml or DEPLOYED_CONTROL_NAME not in form_xml:
                raise RuntimeError(
                    f"Control isn't configured on {table} form {form_name}"
                )
            missing_bindings = [
                binding
                for binding in configuration["bindings"]
                if binding not in form_xml
            ]
            if missing_bindings:
                raise RuntimeError(
                    f"Incorrect bindings on {table} form {form_name}: "
                    f"{', '.join(missing_bindings)}"
                )
            print(f"Verified form: {table} - {form_name} ({anchor})")

    dependencies_response = requests.get(
        (
            f"{environment_url}/api/data/v9.2/"
            "RetrieveMissingDependencies"
            f"(SolutionUniqueName='{SOLUTION_NAME}')"
        ),
        headers=headers,
        timeout=120,
    )
    dependencies_response.raise_for_status()
    missing_dependencies = dependencies_response.json().get("value", [])
    if missing_dependencies:
        details = json.dumps(missing_dependencies, indent=2)
        raise RuntimeError(f"Missing solution dependencies: {details}")
    print("Verified solution dependencies: none missing")


if __name__ == "__main__":
    main()
