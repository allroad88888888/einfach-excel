const key = 'einfach-site-theme'
const root = document.documentElement
const button = document.querySelector<HTMLButtonElement>('#theme-toggle')
const savedTheme = localStorage.getItem(key)

if (savedTheme === 'dark') root.dataset.theme = 'dark'

button?.addEventListener('click', () => {
  const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark'
  if (nextTheme === 'light') delete root.dataset.theme
  else root.dataset.theme = nextTheme
  localStorage.setItem(key, nextTheme)
})
