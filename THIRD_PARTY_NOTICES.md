# Third-party notices

## Code derived from microsoft/Dataverse-skills

`scripts/auth.py` is derived from
[microsoft/Dataverse-skills](https://github.com/microsoft/Dataverse-skills),
which is licensed under the MIT License:

```
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Dependencies that are not redistributed

This repository does not contain the following packages. They are downloaded
when you build, under their own license terms:

- `react`, `@types/*`, ESLint plugins: MIT or ISC
- `typescript`: Apache-2.0
- `pcf-scripts`, `pcf-start`, `Microsoft.PowerApps.MSBuild.*`: Microsoft
  software license terms for the Power Apps CLI. They are used to build and
  test the control and are not part of the built solution.
- `PowerPlatform-Dataverse-Client`, `azure-identity`, `requests`: used by the
  Python scripts and installed with `pip`
