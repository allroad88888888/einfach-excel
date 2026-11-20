import { expect, test } from 'vitest'
import type { SpreadsheetGradientFill } from '@einfach-excel/spreadsheet-ui-core'
import { gradientColorInput, gradientDraftFromFormat, gradientFromDraft, gradientNumericInput } from '../src/core/gradient-draft'

test('imported order, duplicates, precise coordinates and all middle stops survive endpoint edits', () => {
  const fill: SpreadsheetGradientFill = { kind: 'path-gradient', left: 0.1234567890123456,
    right: 0.1, top: 0.9, bottom: 0.2, stops: [
      { position: 1, color: '#0000ff' }, { position: 0, color: '#ff0000' },
      { position: 0.5, color: '#00ff00' }, { position: 0, color: '#abcdef' },
      { position: 0.5, color: '#ff00ff' },
    ] }
  const draft = gradientDraftFromFormat({ fill, bgColor: '#123456' })
  expect(draft.startColor).toBe('#abcdef')
  expect(draft.endColor).toBe('#0000ff')
  expect(gradientFromDraft(draft)).toEqual(fill)
  const edited = gradientColorInput(gradientColorInput(draft, 'startColor', '#112233'), 'endColor', '#445566')
  expect(gradientFromDraft(edited)).toEqual({ ...fill, stops: [
    { position: 1, color: '#445566' }, { position: 0, color: '#ff0000' },
    { position: 0.5, color: '#00ff00' }, { position: 0, color: '#112233' },
    { position: 0.5, color: '#ff00ff' },
  ] })
  expect(fill.stops[3].color).toBe('#abcdef')
})

test('missing endpoints edit their extended colors; a single stop stays a single stop', () => {
  const draft = gradientDraftFromFormat({ fill: { kind: 'linear-gradient', degree: -1e100, stops: [
    { position: 0.7, color: '#0000ff' }, { position: 0.2, color: '#ff0000' },
    { position: 0.2, color: '#00ff00' },
  ] } })
  expect(draft.startColor).toBe('#ff0000')
  expect(gradientFromDraft(gradientColorInput(draft, 'startColor', '#ABCDEF'))).toMatchObject({
    degree: -1e100, stops: [{ position: 0.7, color: '#0000ff' },
      { position: 0.2, color: '#abcdef' }, { position: 0.2, color: '#00ff00' }],
  })
  const single = gradientDraftFromFormat({ fill: { kind: 'linear-gradient', degree: 30,
    stops: [{ position: 0.3, color: '#abcdef' }] } })
  const edited = gradientColorInput(single, 'endColor', '#123456')
  expect(edited.startColor).toBe('#123456')
  expect(gradientFromDraft(edited)?.stops).toEqual([{ position: 0.3, color: '#123456' }])
})

test('empty imports stay empty until a color is edited; invalid drafts never become native fills', () => {
  const draft = gradientDraftFromFormat({ bgColor: '#123456', fill: { kind: 'linear-gradient', degree: 720, stops: [] } })
  expect(gradientFromDraft(draft)?.stops).toEqual([])
  expect(gradientFromDraft(gradientColorInput(draft, 'startColor', '#ffffff'))?.stops).toEqual([
    { position: 0, color: '#ffffff' }, { position: 1, color: '#123456' },
  ])
  for (const text of ['', 'Infinity', 'NaN', '0x12', '3deg', '1e309'])
    expect(gradientNumericInput(text).value).toBeNull()
  for (const text of ['-1', '100.01', 'Infinity']) expect(gradientNumericInput(text, true).value).toBeNull()
  expect(gradientNumericInput(' -4.5e2 ').value).toBe(-450)
  expect(gradientNumericInput('25', true).value).toBe(0.25)
  const invalidAngle = { ...draft, angle: gradientNumericInput('bad') }
  expect(gradientFromDraft(invalidAngle)).toBeNull()
  expect(gradientFromDraft({ ...invalidAngle, mode: 'path-gradient' })).not.toBeNull()
  expect(gradientFromDraft(gradientColorInput(draft, 'endColor', 'red'))).toBeNull()
})

test('duplicate end stops edit the first visible stop at 1.0 and non-hex bgColor falls back safely', () => {
  const fill: SpreadsheetGradientFill = {
    kind: 'linear-gradient', degree: 0, stops: [
      { position: 0, color: '#ff0000' },
      { position: 1, color: '#00ff00' },
      { position: 1, color: '#0000ff' },
    ],
  }
  const draft = gradientDraftFromFormat({ fill, bgColor: 'yellow' })
  expect(draft.endColor).toBe('#00ff00')
  expect(draft.fallback).toBe('#000000')
  const edited = gradientColorInput(draft, 'endColor', '#112233')
  expect(gradientFromDraft(edited)?.stops).toEqual([
    { position: 0, color: '#ff0000' },
    { position: 1, color: '#112233' },
    { position: 1, color: '#0000ff' },
  ])
  const emptyWithNonHex = gradientDraftFromFormat({
    bgColor: 'rgb(10, 20, 30)', fill: { kind: 'linear-gradient', degree: 0, stops: [] },
  })
  expect(emptyWithNonHex.fallback).toBe('#000000')
  expect(gradientFromDraft(emptyWithNonHex)).not.toBeNull()
})
