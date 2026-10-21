# Changelog

All notable changes to this solution are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/), and the project follows
[Semantic Versioning](https://semver.org/).

## [2.0.0] - 2026-10-22

### Changed (breaking)
- **New publisher and prefix: Bassl Labs, `bassllab_`.** The solution was
  published under another publisher and prefix. The three anchor columns are now
  `bassllab_ContactWhatsAppViewerAnchor`, `bassllab_CaseWhatsAppViewerAnchor`, and
  `bassllab_ConversationWhatsAppViewerAnchor`, and the control is now
  `bassllab_BasslLabs.ContactCenter.WhatsAppConversationViewer` (namespace
  `BasslLabs.ContactCenter`). Behaviour and screens are unchanged.
- **2.0.0 cannot be installed over 1.x.** A solution can't change publisher and
  Dataverse columns can't be renamed, so this is a new solution. Remove the
  control from your forms, delete the old solution, import 2.0.0, and add the
  control to your forms again. See "Moving from 1.x to 2.0" in the README.

### Fixed
- The package no longer carries the default grid configuration of Contact and
  Case that a development environment adds to a solution export. It could refer
  to tables that don't exist in your environment and overwrite your own default
  grid settings. `scripts/prepare_core_package.py` now removes it.

## [1.7.1] - 2026-10-14

### Security
- Remote images in adaptive cards load only after a click.
- Files from customers download with a neutral type, and file names are cleaned
  of control and direction-override characters. Names that look executable get a
  `.txt` extension.
- Record ids are validated, card formatting values come from fixed lists, cards
  are never built from customer messages, and links show their real address.

## [1.7.0] - 2026-10-14

### Changed
- The package contains only the control and the three anchor columns. It no
  longer ships forms, so it imports in environments without the same apps.

## [1.6.0]

### Added
- Photos, video, audio, files, bot cards, links, and WhatsApp text formatting.
- Context events and other Contact Center bookkeeping messages are hidden.
