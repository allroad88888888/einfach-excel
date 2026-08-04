/**
 * Wave C / C4 — Text functions.
 *
 * Functions: CONCATENATE, CONCAT, LEFT, RIGHT, MID, LEN, LOWER, UPPER, TRIM,
 *            TEXT, VALUE
 *
 * Discipline:
 *  - Pure: do not mutate `args`, `ctx`, or any captured state.
 *  - Total: every input returns a `Value`. Never throws.
 *  - Error short-circuit via `propagateError` (Excel "first-error-wins").
 *
 * Unicode discipline (LEFT/RIGHT/MID/LEN):
 *  - `String.prototype.length` counts UTF-16 *code units*, which mangles
 *    code-point counts for non-BMP characters (emoji, supplementary planes
 *    where each glyph = 2 code units = 1 codepoint).
 *  - Excel itself counts UTF-16 code units historically — but einfach-ts
 *    elects user-correct semantics: split via `Array.from(text)` so emoji
 *    count as 1 character. Tests pin this behavior.
 *
 * 本文件只是这一族的**注册表**：实现按函数族分住同目录的兄弟文件里，
 * 每个兄弟文件的文件头写着自己负责哪一件事。
 */

import type { FunctionImpl } from '../../../types'
import { CONCAT, CONCATENATE, REPT, TEXTJOIN } from './join'
import { LEFT, LEFTB, LEN, LENB, MID, MIDB, REPLACE, REPLACEB, RIGHT, RIGHTB } from './slice'
import { CLEAN, LOWER, PROPER, TRIM, UPPER } from './normalize'
import { EXACT, FIND, FINDB, SEARCH, SEARCHB } from './search'
import { SUBSTITUTE, TRANSLATE } from './substitute'
import { TEXTAFTER, TEXTBEFORE, TEXTSPLIT } from './split'
import { REGEXEXTRACT, REGEXREPLACE, REGEXTEST } from './regex'
import { TEXT } from './format'
import { NUMBERVALUE, VALUE } from './number-parse'
import { DOLLAR, FIXED } from './locale-number'
import { ARABIC, ROMAN } from './roman'
import { ARRAYTOTEXT, T, VALUETOTEXT } from './value-to-text'
import { CHAR, CODE, UNICHAR, UNICODE } from './char-codes'
import { ENCODEURL } from './encode-url'
import { ASC, DBCS, JIS } from './japanese-width'
import { HYPERLINK, IMAGE, PHONETIC } from './host-degraded'

/**
 * Wave C contract: each function file exports a `FUNCTIONS` record. The
 * evaluator's central index merges these into one dispatch Map.
 *
 * Names are uppercased — case-insensitive matching is the dispatcher's job,
 * but we keep them upper here to make the source readable as a manifest.
 */
export const FUNCTIONS: Record<string, FunctionImpl> = {
  CONCATENATE,
  CONCAT,
  LEFT,
  RIGHT,
  MID,
  LEN,
  LEFTB,
  RIGHTB,
  MIDB,
  LENB,
  LOWER,
  UPPER,
  TRIM,
  TEXT,
  VALUE,
  // Wave F / F1 additions
  SEARCH,
  FIND,
  SEARCHB,
  FINDB,
  // Phase 8 additions
  REPLACE,
  REPLACEB,
  SUBSTITUTE,
  REPT,
  CHAR,
  CODE,
  EXACT,
  PROPER,
  T,
  CLEAN,
  TEXTJOIN,
  TEXTSPLIT,
  TEXTBEFORE,
  TEXTAFTER,
  REGEXTEST,
  REGEXEXTRACT,
  REGEXREPLACE,
  NUMBERVALUE,
  DOLLAR,
  FIXED,
  ROMAN,
  ARABIC,
  VALUETOTEXT,
  ARRAYTOTEXT,
  ENCODEURL,
  ASC,
  JIS,
  DBCS,
  HYPERLINK,
  IMAGE,
  TRANSLATE,
  PHONETIC,
  UNICODE,
  UNICHAR,
}
