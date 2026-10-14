# Dynamics 365 WhatsApp Conversation Viewer

React Power Apps Component Framework (PCF) control that presents separate
Dynamics 365 Contact Center WhatsApp transcripts as one chronological customer
conversation.

## Why PCF

The control is implemented as a React PCF instead of a standalone web resource:

- it uses the signed-in representative's Dataverse security context;
- it can be deployed and versioned in a Dataverse solution;
- it works in model-driven apps and the Copilot Service workspace;
- it doesn't require an external service or duplicate transcript data.

## Behavior

The control:

1. receives a Contact or Account lookup;
2. queries `msdyn_ocliveworkitem` by `msdyn_customer`;
3. limits results to the configured history period and WhatsApp channel and
   lists them newest first (or oldest first, see `sortOrder`);
4. loads the transcripts a page of conversations at a time, and loads the next
   page when the user scrolls to the end of the list;
5. reads and decodes the base64 transcript from the related `msdyn_transcript`
   annotation;
6. parses public transcript messages and excludes private representative notes;
7. renders one thread, newest message first by default, while retaining subtle
   technical conversation boundaries.

The thread scrolls inside the control. The control fills the available height
of the form and adapts to the width it is given. Give the form cell the full
section width (3 columns); version 1.4 does this on the standard forms.

Adaptive cards sent during the conversation (for example suggested replies) are
rendered read-only: text, containers, columns, fact sets, images, tables and
links are displayed, and buttons are shown as non-interactive labels. Only
`http(s)` links and images are rendered.

The first version intentionally reads closed conversation transcripts. The live
communication panel remains the source for the currently active conversation.

## Project structure

- `src/WhatsAppConversationViewer` - React PCF project
- `solutions/WhatsAppConversationViewer` - unmanaged solution project
- `scripts` - Dataverse authentication and solution setup utilities

## Control properties

| Property | Purpose | Default |
| --- | --- | --- |
| `anchor` | Bound text column used to host the control | Required |
| `customer` | Contact or Account lookup | Optional |
| `entityId` | Current record ID; used on Contact forms | Optional |
| `entityName` | Current table logical name | Optional |
| `historyMonths` | Number of months to retrieve | 12, maximum 60 |
| `maximumConversations` | Maximum technical conversations to list | 50, maximum 100 |
| `pageSize` | Conversations loaded per page while scrolling | 3, maximum 20 |
| `height` | Fixed height in pixels; empty fits the available form space | Auto |
| `sortOrder` | `Newest first` or `Oldest first` for conversations and messages | Newest first |
| `showSystemMessages` | Include public system messages | No |

## Build

```powershell
Set-Location src\WhatsAppConversationViewer
npm install
npm run refreshTypes
npm run lint
npm run build

Set-Location ..\..\solutions\WhatsAppConversationViewer
dotnet build -c Release
```

## Deploy to the development environment

The repository's local `.env` is ignored by Git. Confirm the active Power
Platform environment before deployment:

```powershell
pac org who
Set-Location solutions\WhatsAppConversationViewer
dotnet build -c Release
pac solution import --path bin\Release\WhatsAppConversationViewerSolution.zip --force-overwrite --publish-changes --async --max-async-wait-time 40
```

Always import with `--publish-changes`. Without publishing, Dataverse keeps the
previous PCF bundle even though the solution version increased. Increase the
control version in `ControlManifest.Input.xml` and the solution version for
every change, then verify the deployed `customcontrol.version`.

Version 1.5 contains three unique anchor columns and preconfigures the control
on these standard main forms:

| Table | Anchor column | Forms | Customer mapping |
| --- | --- | --- | --- |
| Contact | `nldrive_contactwhatsappvieweranchor` | Contact, Information | `contactid` |
| Case | `nldrive_casewhatsappvieweranchor` | Case, Information | `customerid` |
| Conversation | `nldrive_conversationwhatsappvieweranchor` | Active Conversation | `msdyn_customer` |

The anchor columns remain empty. Their only purpose is to host the PCF control.
The form XML, property bindings, columns, and forms are solution components, so
the mappings move with the solution and do not need to be repeated after every
deployment.

## Building the package to share

The standard forms are exported from a development environment, so the exported
FormXml can also contain fields and web resources that other people added to
those forms. They have nothing to do with this control, and shipping them would
create unrelated components in every environment that imports the solution.

Do not hand out a package exported straight from a customized environment.
Build it from a managed export with those components removed:

```powershell
# 0. One time: list the components to remove (this file is ignored by Git)
Copy-Item scripts\foreign_components.example.json scripts\foreign_components.local.json

# 1. Export the managed solution and unpack it into a temporary folder
pac solution export --name WhatsAppConversationViewer --path temp\export_managed.zip --managed true
pac solution unpack --zipfile temp\export_managed.zip --folder temp\managed-src --packagetype Managed

# 2. Remove the other components, then raise <Version> in temp\managed-src\Other\Solution.xml
python scripts\strip_foreign_components.py temp\managed-src

# 3. Pack the package to share
pac solution pack --zipfile solutions\WhatsAppConversationViewer\bin\Release\WhatsAppConversationViewer_<version>_managed.zip --folder temp\managed-src --packagetype Managed
```

`pac solution pack` refuses to build a managed package from the unmanaged source
in the repository, which is why the package comes from a managed export. After
unpacking an unmanaged export into `solutions\WhatsAppConversationViewer\src`,
run `python scripts\strip_foreign_components.py` without arguments so the
repository source stays clean too.

`strip_foreign_components.py` is idempotent. It removes the columns, choices and
web resources named in `scripts\foreign_components.local.json`, together with
their form references.

`ensure_solution_dependencies.py` adds only the Contact, Case, and Conversation
table shells that the forms need. Use `python scripts\verify_deployment.py` to
check the development environment.

Importing this package into an environment where the forms already carry other
customizations replaces the managed form layer. Customizations in the
unmanaged layer keep winning; check them with **Show layers** if a field or
button seems to be missing.

Representatives need read access to Conversation (`msdyn_ocliveworkitem`),
Transcript (`msdyn_transcript`), Note (`annotation`), and the form's customer
record. Dataverse applies those permissions to every Web API request made by
the control.

## Known considerations

- Dynamics 365 stores separate Contact Center conversations even though the
  customer's WhatsApp client displays one continuous thread.
- Transcript JSON can vary by channel provider and platform release. The parser
  supports the common `messages`, `activities`, `value`, `transcript`, and
  `items` shapes.
- A WhatsApp Business-Scoped User ID should remain linked through the Dynamics
  Social Profile so future conversations resolve to the same Contact.
- The control does not bypass Dataverse permissions or call third-party APIs.

## Disclaimer

This is an independent, community project. It is not affiliated with, endorsed
by, or supported by Microsoft Corporation or Meta Platforms, Inc.

WhatsApp is a trademark of Meta Platforms, Inc. Microsoft, Dynamics 365,
Dataverse, Power Apps, and Copilot Studio are trademarks of Microsoft
Corporation. The names are used only to describe what the control works with.
The solution contains the standard Dynamics 365 Contact, Case, and Conversation
forms with the control placed on them; those forms remain the property of their
owner.

The software is provided as is, without warranty. Test it in a non-production
environment first.

## License

[MIT](LICENSE). Third-party notices are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). See also
[CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
