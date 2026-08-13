# @einfach/spreadsheet-ui-styles

Framework-neutral CSS for Einfach spreadsheet surfaces. This package has no
runtime JavaScript and no framework dependency.

## Use

Load the shared surface layer once for a spreadsheet implementation:

```ts
import '@einfach/spreadsheet-ui-styles/styles.css'
```

Feature styles are exported individually so adapters can preserve their own
lazy-loading lifecycle:

```ts
import '@einfach/spreadsheet-ui-styles/features/find-replace-dialog.css'
```

The selectors describe a DOM contract rather than a component API. Consumers
must render the matching markup and may provide the documented CSS custom
properties from the shared style layer.
