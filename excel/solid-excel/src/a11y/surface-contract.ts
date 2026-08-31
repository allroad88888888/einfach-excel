export type KeyboardA11ySurface = 'grid' | 'menu' | 'dialog'

export type KeyboardA11yIssueCode =
  | 'surface.role'
  | 'grid.tab-stop'
  | 'grid.row-count'
  | 'grid.column-count'
  | 'grid.active-descendant'
  | 'grid.active-descendant-role'
  | 'menu.item'
  | 'menu.item-name'
  | 'menu.trigger-expanded'
  | 'menu.empty-popup'
  | 'dialog.name'
  | 'dialog.labelledby-target'
  | 'dialog.modal-focus-target'

export interface KeyboardA11yIssue {
  code: KeyboardA11yIssueCode
  message: string
}

function issue(code: KeyboardA11yIssueCode, message: string): KeyboardA11yIssue {
  return { code, message }
}

function hasText(value: string | null): boolean {
  return Boolean(value?.trim())
}

function hasPositiveIntegerAttribute(element: HTMLElement, name: string): boolean {
  const value = Number(element.getAttribute(name))
  return Number.isInteger(value) && value > 0
}

function labelledByTargets(root: HTMLElement): HTMLElement[] {
  const ids = root.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean)
  if (!ids?.length) return []
  return ids
    .map((id) => root.ownerDocument.getElementById(id))
    .filter((target): target is HTMLElement => target instanceof HTMLElement)
}

function hasExplicitDialogName(root: HTMLElement): boolean {
  return (
    hasText(root.getAttribute('aria-label')) ||
    labelledByTargets(root).some((target) => hasText(target.textContent))
  )
}

function hasMenuItemName(item: HTMLElement): boolean {
  return (
    hasText(item.getAttribute('aria-label')) ||
    labelledByTargets(item).some((target) => hasText(target.textContent)) ||
    hasText(item.textContent)
  )
}

function hasFocusableDescendant(root: HTMLElement): boolean {
  return (
    root.querySelector(
      [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[contenteditable="true"]',
        '[tabindex]:not([tabindex="-1"])',
      ].join(','),
    ) !== null
  )
}

function auditGrid(root: HTMLElement): KeyboardA11yIssue[] {
  const issues: KeyboardA11yIssue[] = []
  if (root.tabIndex < 0) {
    issues.push(issue('grid.tab-stop', 'A grid needs one keyboard tab stop on its root.'))
  }
  if (!hasPositiveIntegerAttribute(root, 'aria-rowcount')) {
    issues.push(issue('grid.row-count', 'A grid needs a positive aria-rowcount.'))
  }
  if (!hasPositiveIntegerAttribute(root, 'aria-colcount')) {
    issues.push(issue('grid.column-count', 'A grid needs a positive aria-colcount.'))
  }

  const activeDescendant = root.getAttribute('aria-activedescendant')
  const activeCell = activeDescendant ? root.ownerDocument.getElementById(activeDescendant) : null
  if (!activeCell || !root.contains(activeCell)) {
    issues.push(
      issue(
        'grid.active-descendant',
        'A grid needs aria-activedescendant to reference a rendered descendant cell.',
      ),
    )
  } else if (activeCell.getAttribute('role') !== 'gridcell') {
    issues.push(
      issue(
        'grid.active-descendant-role',
        'A grid aria-activedescendant must reference an element with role="gridcell".',
      ),
    )
  }
  return issues
}

function auditMenu(root: HTMLElement): KeyboardA11yIssue[] {
  const issues: KeyboardA11yIssue[] = []
  const items = Array.from(
    root.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
    ),
  )
  if (items.length === 0) {
    issues.push(issue('menu.item', 'A menubar needs at least one menu item.'))
  }
  for (const item of items) {
    if (!hasMenuItemName(item)) {
      issues.push(issue('menu.item-name', 'Every menu item needs an accessible name.'))
    }
    if (
      item.getAttribute('aria-haspopup') === 'menu' &&
      item.getAttribute('aria-expanded') === null
    ) {
      issues.push(
        issue(
          'menu.trigger-expanded',
          'A menu trigger needs aria-expanded to announce its current popup state.',
        ),
      )
    }
  }
  for (const popup of root.querySelectorAll<HTMLElement>('[role="menu"]')) {
    if (
      !popup.querySelector('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')
    ) {
      issues.push(issue('menu.empty-popup', 'An open menu popup needs at least one menu item.'))
    }
  }
  return issues
}

function auditDialog(root: HTMLElement): KeyboardA11yIssue[] {
  const issues: KeyboardA11yIssue[] = []
  const labelledBy = root.getAttribute('aria-labelledby')
  if (
    labelledBy &&
    labelledByTargets(root).length !== labelledBy.split(/\s+/).filter(Boolean).length
  ) {
    issues.push(
      issue(
        'dialog.labelledby-target',
        'Every aria-labelledby reference on a dialog must resolve to an element.',
      ),
    )
  }
  if (!hasExplicitDialogName(root)) {
    issues.push(issue('dialog.name', 'A dialog needs an aria-label or a labelled heading.'))
  }
  if (root.getAttribute('aria-modal') === 'true' && !hasFocusableDescendant(root)) {
    issues.push(
      issue(
        'dialog.modal-focus-target',
        'A modal dialog needs a focusable descendant for its focus entry point.',
      ),
    )
  }
  return issues
}

/**
 * Inspects a rendered interactive surface without owning its focus, listeners,
 * or product state. Feature adapters may run this in focused tests or their
 * host's development diagnostics before a serial a11y migration lands.
 */
export function auditKeyboardA11ySurface(
  surface: KeyboardA11ySurface,
  root: HTMLElement,
): KeyboardA11yIssue[] {
  const expectedRole = surface === 'menu' ? 'menubar' : surface === 'dialog' ? 'dialog' : 'grid'
  const issues: KeyboardA11yIssue[] = []
  if (root.getAttribute('role') !== expectedRole) {
    issues.push(issue('surface.role', `Expected role="${expectedRole}" on the ${surface} root.`))
    return issues
  }
  switch (surface) {
    case 'grid':
      return [...issues, ...auditGrid(root)]
    case 'menu':
      return [...issues, ...auditMenu(root)]
    case 'dialog':
      return [...issues, ...auditDialog(root)]
  }
}
