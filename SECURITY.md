# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's
**Report a vulnerability** option on the Security tab of this repository.

## What the control does and does not do

- It runs in the browser as a Power Apps component and calls the Dataverse Web
  API with the signed-in user's own permissions.
- It does not call external services and does not store transcript data.
- It renders adaptive cards read-only and only follows `http` and `https`
  links. The real address is shown next to each link, cards are never built
  from customer messages, and remote card images load only after a click.
- Customer-controlled values are validated before use: record ids must be
  GUIDs, card formatting values come from fixed lists, and very long text is
  shown unformatted.
- Attachments from customers are downloaded with a neutral content type, file
  names are stripped of control and direction-override characters, and names
  that look executable get a `.txt` extension. Only photos, video and audio
  with a known type are shown in the page; SVG never is.

Known limitation: the 25 MB size check is skipped for attachments that a
transcript declares as an image, because those load automatically. A very large
image could therefore slow the browser tab. Files are not scanned for malware.

If you find a way to read data the signed-in user cannot access, or to run
script from transcript content, please report it.
