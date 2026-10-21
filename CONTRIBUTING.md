# Contributing

Issues and pull requests are welcome.

## Before you open a pull request

1. Open an issue first for larger changes, so we can agree on the approach.
2. Build and lint the control:

   ```powershell
   Set-Location src\WhatsAppConversationViewer
   npm ci
   npm run refreshTypes
   npm run lint
   npm run build
   ```

   Run the build outside a OneDrive or other synced folder. `npm` installs
   example certificates with `browser-sync` that security scanners flag.

3. Raise the control version in `ControlManifest.Input.xml` and the solution
   version when you change behavior. Dataverse keeps serving the previous
   bundle if the version does not change.
4. Do not commit transcripts, customer data, environment URLs, tenant IDs, or
   `.env` files.

By contributing you agree that your contribution is licensed under the MIT
License of this repository.

## The solution has no forms

The release package contains the control and three anchor columns, and no
forms. Forms exported from a development environment depend on every app
installed there. After exporting, run `python scripts\prepare_core_package.py`
on the unpacked source. See "Build the package to share" in the README.
