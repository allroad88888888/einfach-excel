const tabs = document.querySelectorAll<HTMLButtonElement>('[data-home-path]')
const panels = document.querySelectorAll<HTMLElement>('[data-home-panel]')

function selectPath(path: string) {
  tabs.forEach((tab) => {
    const selected = tab.dataset.homePath === path
    tab.classList.toggle('is-active', selected)
    tab.setAttribute('aria-selected', String(selected))
  })
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.homePanel !== path
  })
}

tabs.forEach((tab) =>
  tab.addEventListener('click', () => selectPath(tab.dataset.homePath ?? 'workflow')),
)
