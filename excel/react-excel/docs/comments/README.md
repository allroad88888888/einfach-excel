# Cell comments

Select one cell (or a merged anchor) and choose **Comments**. Enter a workbook display
name and plain text, then choose **New comment**. The same window shows every author,
local date and time, message, resolution and reopening. **Post reply** appends a message;
**Resolve discussion** prevents further replies until **Reopen discussion** is chosen.
Each action is one native undo step. Undo and redo preserve the original author and time.

A display name is user supplied text stored inside this workbook. It is not an
authenticated identity. Dates come from this device's clock and are shown in this
device's time zone. This feature does not provide online presence, notifications,
remote access controls, or real time collaboration.

Close comments or press Escape to discard the current draft. Loading may be cancelled;
saving disables close and duplicate submissions until Rust returns. Errors keep the
draft available for correction. If the workbook changed, close and reopen the window
to read the current native thread before retrying.

Names may contain up to 100 Unicode characters; message bodies may contain up to 32767.
Line endings are normalized to LF. A thread supports 1000 entries, including resolution
events. Author and body are rendered as text, so HTML remains visible text. A visible
cell carries only a small comment marker; its complete thread is read when opened.

Comments are separate from cell notes, values, formulas and formatting. Value changes
do not remove the discussion. Inserting or deleting whole rows and columns moves or
removes its cell together with the thread; native undo restores both. A merged region
is edited through its anchor. Freezing panes keeps the comment marker visible. Locked
cells reject comment changes on protected sheets; permitted edit ranges use the same
native permission check.

Workbook download stores threads as `workbook.comments` records containing a sheet,
zero based row and column, and the complete thread. Opening a file validates all events
in a temporary workbook before replacing the current workbook. A legacy file without
the optional `comments` field opens with no comment threads. Invalid or duplicate
records fail the open operation and keep the current workbook.

The original Summary sheet contains an empty cell example at H84. The original Orders
layout is retained. English and Chinese browser scenarios cover 1280px and 390px;
screenshots are captured by the persistent Playwright comments suite during integration.
