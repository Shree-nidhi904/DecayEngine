// Validation for the add/edit fact form (task 5.1).
// Source of truth: .kiro/specs/study-dungeon/requirements.md (Requirement 5)
// and the Type Contract there:
// - question and answer: required, at most 140 characters
// - why: optional, at most 80 characters ("" when not given)
// - knowledge: "new", "shaky" or "solid"
// - importance: 1, 2 or 3; review cost: 1, 2, 3 or 5 minutes
//
// Pure: no React, no engine, no clock. Text is trimmed before it is checked
// and stored. Lengths are counted in UTF-16 code units, the same unit the
// inputs' maxLength attribute uses, so the form and this check agree.

import type { FactPayload, Knowledge } from "./policy"
import { factFormText } from "./wording"

export const QUESTION_MAX = 140
export const ANSWER_MAX = 140
export const WHY_MAX = 80

export const KNOWLEDGE_LEVELS: readonly Knowledge[] = ["new", "shaky", "solid"]
export const IMPORTANCE_OPTIONS: readonly number[] = [1, 2, 3]
export const COST_OPTIONS: readonly number[] = [1, 2, 3, 5]

/** What the form holds. knowledge is a string because it comes from an input. */
export type FactFormValues = {
  question: string
  answer: string
  why: string
  knowledge: string
  importance: number
  costMinutes: number
}

export type FactFormField = keyof FactFormValues

/** One message per field that failed. Fields that passed are absent. */
export type FactFormErrors = Partial<Record<FactFormField, string>>

/** A checked fact, ready for engine.addItem or engine.edit. */
export type ValidFact = {
  payload: FactPayload
  importance: number
  costMinutes: number
}

export type FactFormResult = { ok: true; fact: ValidFact } | { ok: false; errors: FactFormErrors }

function isKnowledge(value: string): value is Knowledge {
  return (KNOWLEDGE_LEVELS as readonly string[]).includes(value)
}

/** Checks every field and returns either the fact to save or every error found. */
export function validateFactForm(values: FactFormValues): FactFormResult {
  const errors: FactFormErrors = {}
  const question = values.question.trim()
  const answer = values.answer.trim()
  const why = values.why.trim()

  if (question === "") errors.question = factFormText.errors.questionRequired
  else if (question.length > QUESTION_MAX) errors.question = factFormText.errors.tooLong(QUESTION_MAX)

  if (answer === "") errors.answer = factFormText.errors.answerRequired
  else if (answer.length > ANSWER_MAX) errors.answer = factFormText.errors.tooLong(ANSWER_MAX)

  if (why.length > WHY_MAX) errors.why = factFormText.errors.tooLong(WHY_MAX)

  if (!isKnowledge(values.knowledge)) errors.knowledge = factFormText.errors.knowledge
  if (!IMPORTANCE_OPTIONS.includes(values.importance)) errors.importance = factFormText.errors.importance
  if (!COST_OPTIONS.includes(values.costMinutes)) errors.costMinutes = factFormText.errors.cost

  const knowledge = values.knowledge
  // The isKnowledge check is repeated so TypeScript narrows knowledge here.
  if (Object.keys(errors).length > 0 || !isKnowledge(knowledge)) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    fact: {
      payload: { question, answer, why, knowledge },
      importance: values.importance,
      costMinutes: values.costMinutes,
    },
  }
}
