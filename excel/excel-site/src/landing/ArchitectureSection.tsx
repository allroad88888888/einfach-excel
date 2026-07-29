import { useLocale } from '../i18n/use-site-t'

const copy = {
  en: {
    heading: 'How it is layered',
    intro:
      'Every layer only knows about the one directly below it. The headless UI-core never ' +
      'imports Solid, the DOM, or WASM — it talks to workbook facts through a backend port. ' +
      'Swap the backend and the UI keeps working: a host that skips an optional port just ' +
      'loses that one feature, cleanly, instead of crashing.',
  },
  zh: {
    heading: '架构分层',
    intro:
      '每一层只认识紧挨着它下面的那一层。无头的 UI-core 从不引入 Solid、DOM 或 WASM——' +
      '它通过后端端口读写表格事实。替换后端时 UI 依旧可用：宿主省略某个可选端口，' +
      '只会优雅地少掉那一个功能，而不会崩溃。',
  },
} as const

type Box = {
  x: number
  y: number
  w: number
  h: number
  title: string
  detail: string
  accent?: boolean
}

const LAYERS: Box[] = [
  { x: 60, y: 20, w: 600, h: 74, title: '@einfach/core', detail: 'atom store' },
  {
    x: 40,
    y: 132,
    w: 640,
    h: 74,
    title: '@einfach/spreadsheet-ui-core',
    detail: 'headless spreadsheet atoms + backend port',
    accent: true,
  },
  {
    x: 60,
    y: 244,
    w: 600,
    h: 74,
    title: '@einfach/solid-excel',
    detail: 'Solid.js chrome (grid, toolbar, dialogs)',
  },
]

const BACKENDS: Box[] = [
  { x: 30, y: 366, w: 200, h: 64, title: 'static', detail: '(in-memory)' },
  { x: 260, y: 366, w: 200, h: 64, title: 'TS engine', detail: 'worker' },
  { x: 490, y: 366, w: 200, h: 64, title: 'Rust/WASM engine', detail: 'worker' },
]

function LayerRect(props: { box: Box }) {
  const cx = props.box.x + props.box.w / 2
  const cy = props.box.y + props.box.h / 2
  return (
    <g>
      <rect
        x={props.box.x}
        y={props.box.y}
        width={props.box.w}
        height={props.box.h}
        rx="10"
        fill="var(--site-bg-elevated)"
        stroke={props.box.accent ? 'var(--site-accent)' : 'var(--site-border)'}
        stroke-width={props.box.accent ? 2 : 1}
      />
      <text
        x={cx}
        y={cy - 6}
        text-anchor="middle"
        fill="currentColor"
        font-size="16"
        font-weight="600"
      >
        {props.box.title}
      </text>
      <text x={cx} y={cy + 16} text-anchor="middle" fill="currentColor" font-size="12">
        {props.box.detail}
      </text>
    </g>
  )
}

export default function ArchitectureSection() {
  const locale = useLocale()
  const t = () => copy[locale()]

  return (
    <section class="site-arch">
      <h2 class="site-arch-heading">{t().heading}</h2>
      <div class="site-arch-body">
        <svg
          class="site-arch-diagram"
          viewBox="0 0 720 450"
          role="img"
          aria-label={
            'einfach/core atom store, under spreadsheet-ui-core, under solid-excel, backed by ' +
            'three swappable backends: static, TS worker, Rust/WASM worker'
          }
        >
          <path
            d="M360,94 V132 M360,206 V244"
            fill="none"
            stroke="var(--site-border)"
            stroke-width="1.5"
          />
          <path
            d="M360,318 V342 M130,342 H620 M130,342 V366 M360,342 V366 M620,342 V366"
            fill="none"
            stroke="var(--site-border)"
            stroke-width="1.5"
          />
          {LAYERS.map((box) => (
            <LayerRect box={box} />
          ))}
          {BACKENDS.map((box) => (
            <LayerRect box={box} />
          ))}
        </svg>
        <p class="site-arch-intro">{t().intro}</p>
      </div>
    </section>
  )
}
