# Suno Sensitive-Term Notes

Suno does not appear to publish a complete blocked-word list. The API exposes `SENSITIVE_WORD_ERROR` when a generation is rejected, documented as content containing prohibited or sensitive wording. Treat this file as an observed RTHMIC workaround log, not a definitive policy list.

## Confirmed In RTHMIC

### Airport Packing Menu — 21 May 2026

Suno rejected versions containing ordinary packing terms. The successful version replaced more literal clothing / travel-supply wording with neutral phrases.

Observed risky wording:
- "undies"
- "underwear"
- "medication"
- "paracetamol"
- "flip flops"

Successful replacements:
- "base layers"
- "daily kit"
- "comfort kit"
- "sandals"

## Handling Pattern

When Suno returns `SENSITIVE_WORD_ERROR`:
- keep the user's actual meaning in app metadata where appropriate
- soften the generated lyrics before retrying
- prefer neutral category language over item names that might look medical, intimate, adult, copyrighted, or otherwise policy-sensitive out of context
- do not leave the queue item hanging as `generating`

Sources checked:
- SunoApi.org record-info docs list `SENSITIVE_WORD_ERROR` as a task status meaning content contains prohibited words.
- No official public list of specific prohibited words was found.
