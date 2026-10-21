export const NOTE_MAX_CHARACTERS = 32767

/** 与 Rust Unicode scalar 计数一致，emoji 不按 UTF-16 两个字符计数。 */
export function validateNoteText(input: string): { text: string; error: string } {
  const text = input.replace(/\r\n?/g, '\n')
  const error = !text.replace(/\p{White_Space}/gu, '').length
    ? 'Enter note text. Use Delete note to remove an existing note.'
    : text.includes('\0') ? 'Note text cannot contain a null character.'
    : Array.from(text).length > NOTE_MAX_CHARACTERS ? 'Note text cannot exceed 32767 characters.' : ''
  return { text, error }
}
