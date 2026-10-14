# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's
**Report a vulnerability** option on the Security tab of this repository.

## What the control does and does not do

- It runs in the browser as a Power Apps component and calls the Dataverse Web
  API with the signed-in user's own permissions.
- It does not call external services and does not store transcript data.
- It renders adaptive cards read-only and only follows `http` and `https`
  links.

If you find a way to read data the signed-in user cannot access, or to run
script from transcript content, please report it.
