const tabs = document.querySelectorAll('.path-tab')
const panels = document.querySelectorAll('.path-panel')

function selectPath(path) {
  tabs.forEach((tab) => {
    const selected = tab.dataset.path === path
    tab.classList.toggle('is-active', selected)
    tab.setAttribute('aria-selected', String(selected))
  })
  panels.forEach((panel) => panel.classList.toggle('is-hidden', panel.dataset.panel !== path))
}

tabs.forEach((tab) => tab.addEventListener('click', () => selectPath(tab.dataset.path)))
