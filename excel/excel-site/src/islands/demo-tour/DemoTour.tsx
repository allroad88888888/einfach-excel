import { atom } from '@einfach/core'
import { useAtomValue, useSetAtom } from '@einfach/solid'

interface DemoTourProps {
  stepCount: number
  locale: 'en' | 'zh'
}

function createTourStepAtom() {
  return atom(0)
}

/** Activates the next statically documented action and focuses the real worksheet. */
export default function DemoTour(props: DemoTourProps) {
  const stepAtom = createTourStepAtom()
  const activeStep = useAtomValue(stepAtom)
  const setActiveStep = useSetAtom(stepAtom)

  function runNextStep() {
    const nextStep = Math.min(activeStep() + 1, props.stepCount)
    setActiveStep(nextStep)

    const steps = document.querySelectorAll<HTMLElement>('.demo-narrative > ol > li')
    for (const [index, step] of Array.from(steps).entries()) {
      step.toggleAttribute('data-tour-active', index + 1 === nextStep)
    }

    document.querySelector<HTMLElement>('.demo-grid-frame')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
    if (nextStep === 2) {
      document.querySelector<HTMLElement>('.spreadsheet-grid-scroll-viewport')?.scrollBy({
        top: 480,
        behavior: 'smooth',
      })
    }
  }

  const complete = () => activeStep() >= props.stepCount
  const tourText = () => props.locale === 'zh'
    ? {
        complete: '场景导览完成',
        step: `文档步骤 ${activeStep() + 1} / ${props.stepCount}`,
        completed: '已完成',
        next: '执行下一项文档步骤',
      }
    : {
        complete: 'Scenario guide complete',
        step: `Documented step ${activeStep() + 1} of ${props.stepCount}`,
        completed: 'Completed',
        next: 'Run next documented step',
      }
  return (
    <aside class="demo-tour" aria-label={props.locale === 'zh' ? '交互场景导览' : 'Interactive scenario guide'}>
      <span>{complete() ? tourText().complete : tourText().step}</span>
      <button type="button" onClick={runNextStep} disabled={complete()}>
        {complete() ? tourText().completed : tourText().next}
      </button>
    </aside>
  )
}
