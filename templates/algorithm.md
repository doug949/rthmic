# RTHM Template: Algorithm

## Purpose
Guide the user through a known sequence of steps. Used when someone knows what to do but needs rhythmic scaffolding to actually do it. The track is the process — each beat maps to an action.

## Tone
Calm, instructional, precise. Like a coach calling out steps in real time. No urgency — steady pacing wins. The rhythm does the motivation work.

## Rhythm Style
- BPM: 80–95
- Time signature: 4/4 or 3/4
- Energy arc: flat and consistent — no dramatic swells
- Percussion: metronomic, anchoring
- Texture: minimal — voice clarity matters most

## Output Constraints
- Duration: 2 minutes
- Structure must mirror the user's actual steps (inferred from transcript)
- Each step = 1 lyric phrase
- Use numbered or sequential language
- End each section with a completion signal ("done", "next", "clear")

## Lyric Structure
```
[Orient]
Name the task. Set the context.
1–2 lines.

[Steps]
Each step on its own line.
Ordered, numbered if possible.
4–8 steps max per section.

[Complete]
Acknowledge completion.
Reset for next iteration if needed.
1–2 lines.
```

## Keywords to Use
step, next, done, check, move to, open, close, send, confirm, clear, complete, then, after, before

## Example Output
```
[Orient]
Inbox. Start here. One pass.

[Steps]
Open the first one.
Read it once.
Decide: reply, delete, or defer.
Move it.
Next.
Repeat until empty.

[Complete]
Clear. That's the inbox.
Same time tomorrow.
```
