# Third-Party Notices

CriteriaIQ's own source code is licensed under the [MIT License](LICENSE.txt). It depends on third-party packages that keep their own licenses. The full list of dependencies and their versions is in `package.json` and `package-lock.json`; each package's license ships with it under `node_modules/<package>/`.

## Components with copyleft licenses

| Component | License | How CriteriaIQ uses it |
| --- | --- | --- |
| [TinyMCE](https://github.com/tinymce/tinymce) | GPL-2.0-or-later (used with `licenseKey='gpl'`) | Rich-text editor in the email template and email design editors. It is copied from `node_modules/tinymce` into the client build at build time and is not modified. |

Distributing a build or Docker image of CriteriaIQ means distributing TinyMCE under the GPL. The GPL's terms apply to that distribution: provide the corresponding source (this repository plus the unmodified TinyMCE package), and keep the license notices. If you need to ship a closed-source build, buy a commercial TinyMCE license and set your own license key instead of `gpl`.
