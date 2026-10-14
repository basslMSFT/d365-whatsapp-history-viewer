import os
import sys
import uuid
import xml.etree.ElementTree as ET

import requests

sys.path.insert(0, os.path.dirname(__file__))

from auth import get_token, load_env


SOLUTION_NAME = "WhatsAppConversationViewer"
CONTROL_NAME = "nldrive_NLDrive.ContactCenter.WhatsAppConversationViewer"
TEXT_CONTROL_ID = "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}"

FORM_CONFIGURATIONS = (
    {
        "table": "contact",
        "form_names": ("Contact", "Information"),
        "anchor": "nldrive_contactwhatsappvieweranchor",
        "entity_id": "contactid",
        "entity_name": "contact",
    },
    {
        "table": "incident",
        "form_names": ("Case", "Information"),
        "anchor": "nldrive_casewhatsappvieweranchor",
        "customer": "customerid",
    },
    {
        "table": "msdyn_ocliveworkitem",
        "form_names": ("Active Conversation",),
        "anchor": "nldrive_conversationwhatsappvieweranchor",
        "customer": "msdyn_customer",
    },
)


def guid() -> str:
    return "{" + str(uuid.uuid4()).upper() + "}"


def add_labels(parent: ET.Element, english: str, dutch: str) -> None:
    labels = ET.SubElement(parent, "labels")
    ET.SubElement(
        labels,
        "label",
        {"description": english, "languagecode": "1033"},
    )
    ET.SubElement(
        labels,
        "label",
        {"description": dutch, "languagecode": "1043"},
    )


def add_parameter(
    parameters: ET.Element,
    name: str,
    value: str,
    static_type: str | None = None,
) -> None:
    attributes = (
        {"static": "true", "type": static_type}
        if static_type is not None
        else {}
    )
    ET.SubElement(parameters, name, attributes).text = value


def add_typed_bound_parameter(
    parameters: ET.Element,
    name: str,
    attribute_name: str,
    property_type: str,
) -> None:
    ET.SubElement(
        parameters,
        name,
        {"type": property_type},
    ).text = attribute_name


def create_control_description(
    control_unique_id: str,
    configuration: dict[str, object],
) -> ET.Element:
    description = ET.Element(
        "controlDescription",
        {"forControl": control_unique_id},
    )
    default_control = ET.SubElement(
        description,
        "customControl",
        {"id": TEXT_CONTROL_ID},
    )
    default_parameters = ET.SubElement(default_control, "parameters")
    ET.SubElement(default_parameters, "datafieldname").text = str(
        configuration["anchor"]
    )

    for form_factor in ("0", "1", "2"):
        custom_control = ET.SubElement(
            description,
            "customControl",
            {"formFactor": form_factor, "name": CONTROL_NAME},
        )
        parameters = ET.SubElement(custom_control, "parameters")
        add_parameter(parameters, "anchor", str(configuration["anchor"]))
        if configuration.get("customer"):
            add_typed_bound_parameter(
                parameters,
                "customer",
                str(configuration["customer"]),
                "Lookup.Simple",
            )
        if configuration.get("entity_id"):
            add_typed_bound_parameter(
                parameters,
                "entityId",
                str(configuration["entity_id"]),
                "SingleLine.Text",
            )
        if configuration.get("entity_name"):
            add_parameter(
                parameters,
                "entityName",
                str(configuration["entity_name"]),
                "SingleLine.Text",
            )

    return description


def add_whatsapp_tab(
    root: ET.Element,
    configuration: dict[str, object],
) -> None:
    tabs = root.find("tabs")
    if tabs is None:
        raise RuntimeError("Form XML has no tabs element")

    tab = ET.SubElement(
        tabs,
        "tab",
        {
            "name": "nldrive_whatsapphistory",
            "id": guid(),
            "IsUserDefined": "1",
            "locklevel": "0",
            "showlabel": "true",
            "expanded": "true",
        },
    )
    add_labels(tab, "WhatsApp history", "WhatsApp-historie")
    columns = ET.SubElement(tab, "columns")
    column = ET.SubElement(columns, "column", {"width": "100%"})
    sections = ET.SubElement(column, "sections")
    section = ET.SubElement(
        sections,
        "section",
        {
            "name": "nldrive_whatsapphistory_section",
            "id": guid(),
            "IsUserDefined": "1",
            "locklevel": "0",
            "showlabel": "false",
            "showbar": "false",
            "columns": "111",
        },
    )
    add_labels(section, "WhatsApp history", "WhatsApp-historie")
    rows = ET.SubElement(section, "rows")
    row = ET.SubElement(rows, "row")
    cell = ET.SubElement(
        row,
        "cell",
        {
            "id": guid(),
            "showlabel": "false",
            "locklevel": "0",
            "colspan": "3",
            "rowspan": "20",
            "auto": "true",
        },
    )
    add_labels(cell, "WhatsApp history", "WhatsApp-historie")
    control_unique_id = guid()
    ET.SubElement(
        cell,
        "control",
        {
            "id": str(configuration["anchor"]),
            "classid": TEXT_CONTROL_ID,
            "datafieldname": str(configuration["anchor"]),
            "disabled": "false",
            "uniqueid": control_unique_id,
        },
    )

    descriptions = root.find("controlDescriptions")
    if descriptions is None:
        descriptions = ET.SubElement(root, "controlDescriptions")
    descriptions.append(
        create_control_description(control_unique_id, configuration)
    )


def get_forms(
    environment_url: str,
    headers: dict[str, str],
    table: str,
    form_names: tuple[str, ...],
) -> list[dict[str, object]]:
    escaped_names = (name.replace("'", "''") for name in form_names)
    names_filter = " or ".join(
        f"name eq '{name}'" for name in escaped_names
    )
    filter_value = (
        f"objecttypecode eq '{table}' and type eq 2 and ({names_filter})"
    )
    response = requests.get(
        f"{environment_url}/api/data/v9.2/systemforms",
        headers=headers,
        params={
            "$select": "formid,name,formxml,iscustomizable",
            "$filter": filter_value,
        },
        timeout=120,
    )
    response.raise_for_status()
    forms = response.json()["value"]
    found_names = {str(form["name"]) for form in forms}
    missing = set(form_names) - found_names
    if missing:
        raise RuntimeError(
            f"Missing forms on {table}: {', '.join(sorted(missing))}"
        )
    return forms


def remove_existing_configuration(
    root: ET.Element,
    anchor: str,
) -> None:
    anchor_control = root.find(f".//control[@datafieldname='{anchor}']")
    control_unique_id = (
        anchor_control.get("uniqueid")
        if anchor_control is not None
        else None
    )

    tabs = root.find("tabs")
    if tabs is not None:
        for tab in list(tabs):
            if tab.get("name") == "nldrive_whatsapphistory":
                tabs.remove(tab)

    descriptions = root.find("controlDescriptions")
    if descriptions is not None and control_unique_id:
        for description in list(descriptions):
            if description.get("forControl") == control_unique_id:
                descriptions.remove(description)


def patch_form(
    environment_url: str,
    headers: dict[str, str],
    form: dict[str, object],
    configuration: dict[str, object],
) -> None:
    root = ET.fromstring(str(form["formxml"]))
    anchor = str(configuration["anchor"])
    if root.find(f".//control[@datafieldname='{anchor}']") is not None:
        remove_existing_configuration(root, anchor)

    add_whatsapp_tab(root, configuration)
    form_xml = ET.tostring(root, encoding="unicode")
    response = requests.patch(
        f"{environment_url}/api/data/v9.2/systemforms({form['formid']})",
        headers={**headers, "Content-Type": "application/json"},
        json={"formxml": form_xml},
        timeout=120,
    )
    response.raise_for_status()
    print(f"Configured: {configuration['table']} - {form['name']}")


def add_form_to_solution(
    environment_url: str,
    headers: dict[str, str],
    form_id: str,
) -> None:
    response = requests.post(
        f"{environment_url}/api/data/v9.2/AddSolutionComponent",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "ComponentId": form_id,
            "ComponentType": 60,
            "SolutionUniqueName": SOLUTION_NAME,
            "AddRequiredComponents": False,
            "DoNotIncludeSubcomponents": True,
        },
        timeout=120,
    )
    response.raise_for_status()


def publish_tables(
    environment_url: str,
    headers: dict[str, str],
) -> None:
    entities = "".join(
        f"<entity>{configuration['table']}</entity>"
        for configuration in FORM_CONFIGURATIONS
    )
    response = requests.post(
        f"{environment_url}/api/data/v9.2/PublishXml",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "ParameterXml": (
                "<importexportxml><entities>"
                f"{entities}"
                "</entities></importexportxml>"
            )
        },
        timeout=300,
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

    for configuration in FORM_CONFIGURATIONS:
        forms = get_forms(
            environment_url,
            headers,
            str(configuration["table"]),
            tuple(configuration["form_names"]),
        )
        for form in forms:
            customizable = form.get("iscustomizable", {}).get("Value")
            if customizable is not True:
                raise RuntimeError(
                    f"Form isn't customizable: {configuration['table']} - "
                    f"{form['name']}"
                )
            patch_form(environment_url, headers, form, configuration)
            add_form_to_solution(environment_url, headers, str(form["formid"]))

    publish_tables(environment_url, headers)
    print("Published Contact, Case, and Conversation forms.")


if __name__ == "__main__":
    main()
