---
'@einfach/solid-excel': minor
---

Make the current spreadsheet UI the package root API, add canonical worker and
stylesheet subpaths, and retain the existing `vnext` paths as aliases. Consumers
of the previous root API should import from `@einfach/solid-excel/legacy`.
