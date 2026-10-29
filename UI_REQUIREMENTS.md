# AI Mystery Room UI Requirements

This document defines the required user experience for the Home, Create Mystery, Investigation Room, Accusation, and Results screens. A Stitch AI mockup can be used as a visual starting point, but it should be checked against the functional requirements and screen mapping below.

## Shared experience

- Keep the case-file visual language, readable contrast, clear focus indicators, and consistent button and form styling across screens.
- Keep secrets and solution data server-side until the player submits an accusation or explicitly reveals the solution.
- Show actionable errors beside the affected action and announce them to assistive technology. Preserve entered values and investigation progress when an action fails.
- Disable duplicate submissions while a request is in progress. Provide visible text alongside any spinner so loading is understandable without animation.
- Use a single-column layout on narrow screens, allow long story and clue text to wrap, and keep controls reachable without horizontal scrolling.

## 1. Home

**Purpose:** Introduce the mystery-solving experience and give the player a clear way to begin.

**Essential elements:**

- Product identity and a concise explanation of the investigation loop: examine evidence, consider suspects, and solve the case.
- A prominent **Start a mystery** action.
- Optional short note that the case is AI-generated and its solution remains hidden during investigation.

**States and errors:**

- Initial state: show the introduction and enabled start action.
- If an existing case is being restored, show a labeled “Restoring your case” state and prevent starting a competing case until restoration finishes.
- If restoration fails, show the server-provided error with a retry or start-new-case option; do not silently discard the player's saved case.

**Navigation:** Start opens Create Mystery. If an active case is restored, offer a direct way to resume it.

**Responsive behavior:** Keep the introduction and primary action prominent at all widths. Stack content vertically on mobile.

## 2. Create Mystery

**Purpose:** Collect the player's story premise and preferred difficulty before generating a case.

**Essential elements:**

- A labeled premise text area with concise guidance and a reasonable character limit.
- A required difficulty selector: Easy, Medium, or Hard, with a short explanation of how each affects the case.
- A **Create case** action and a back-to-Home action.
- Clear validation when the premise is empty or exceeds its limit.

**States and errors:**

- While generating, disable the form and show “Creating your mystery…” with a progress indicator.
- On success, save the case identifier and open Investigation Room.
- On failure, keep the premise and difficulty intact and show the API error, such as a configuration or rate-limit message, with a retry action.

**Navigation:** Home → Create Mystery → Investigation Room. Back returns to Home without submitting.

**Responsive behavior:** Use a full-width text area and stacked difficulty choices on mobile; never require side-by-side controls.

## 3. Investigation Room

**Purpose:** Let the player understand the case, inspect evidence, consider suspects, and track progress without exposing the solution.

**Essential elements:**

- Case title, premise/story introduction, and difficulty.
- Suspect cards with names, descriptions, motives, and alibis; keep culprit data hidden.
- Clue cards with sealed and discovered states. Discovery reveals the clue description and significance.
- A hint panel showing the latest hint and remaining hint count.
- Progress indicator for discovered clues and hints used.
- A clear action to proceed to Accusation when ready, plus a way to abandon the case and start over.

**States and errors:**

- While restoring a saved case, show a labeled loading state instead of an empty or misleading investigation.
- While a clue or hint loads, show a local loading indicator and disable only the relevant action.
- On request failure, retain the current case, clues, and hint state and show the returned error with a retry option.
- When all clues are discovered or hints are used, make the completed counts clear and prevent unavailable actions.

**Navigation:** Create Mystery → Investigation Room. **Make an accusation** opens Accusation. Starting a new case returns to Create Mystery or Home after a confirmation if progress would be lost.

**Responsive behavior:** Use a multi-column layout on wider screens; stack suspects, evidence, and hints vertically on tablet and mobile. Keep progress visible near the top and ensure cards fit the viewport.

## 4. Accusation

**Purpose:** Let the player make one deliberate, evidence-based selection of who committed the crime.

**Essential elements:**

- A concise reminder of the case title and a link back to review the story, suspects, and clues.
- A required suspect selection using clear selectable cards or a labeled selector.
- A **Submit accusation** button that is disabled until a suspect is selected.
- A confirmation step if submitting is irreversible for that case.

**States and errors:**

- While submitting, show “Submitting accusation…” and prevent duplicate submissions.
- On success, open Results.
- If submission fails, keep the selected suspect and show the server error so the player can retry.
- If the case is missing or already ended, explain that the accusation cannot be submitted and provide a route back to Home.

**Navigation:** Investigation Room → Accusation → Results. A **Review evidence** action returns to Investigation Room without clearing the selection.

**Responsive behavior:** Display suspect choices as a single-column list on small screens; make the submission action full-width and easy to reach.

## 5. Results

**Purpose:** Explain the outcome and reinforce how the evidence supports or contradicts the player's deduction.

**Essential elements:**

- A clear verdict: correct, incorrect, or solution revealed without accusation.
- The player's score, including its inputs (for example, correctness, clues found, and hints used). Define the scoring formula before presenting a numeric score.
- The culprit's identity, motive, and an explanation of how the clues fit together.
- A **Play again** action and, if supported, a way to review the investigation.

**States and errors:**

- While the result is loading, show “Checking your accusation…” and keep the result area from flashing empty content.
- If the result cannot be loaded, show the error and a retry action; do not display a guessed verdict or score.
- If the solution was explicitly revealed, label that outcome separately from a scored accusation.

**Navigation:** Accusation → Results. **Play again** starts at Create Mystery; **Review investigation** returns to the completed case without enabling new actions.

**Responsive behavior:** Present the verdict and score first, then stack culprit, motive, and explanation sections in a readable single column on mobile.

## Screen-to-project mapping

| Screen | Project responsibilities | Current implementation mapping and gaps |
|---|---|---|
| Home | Product introduction and start navigation | `src/App.jsx` presents the introduction, starts the Create Mystery step, and offers resume when a case is loaded. |
| Create Mystery | Premise, difficulty, validation, and generation state | The form accepts a premise (up to 500 characters) and difficulty, then posts both to `POST /api/cases`; the server includes the premise as story inspiration. |
| Investigation Room | Story, suspects, clues, hints, and progress | The investigation view displays story, suspect details, clue discovery, hints, progress, and explicit navigation to Accusation. |
| Accusation | Suspect selection and submission | A separate screen posts the selected suspect to `POST /api/cases/:caseId/accusations` and retains selection on failure. |
| Results | Verdict, score, culprit, and explanation | A separate screen displays the verdict, server-calculated score and breakdown, culprit, motive, and explanation. Solution reveal is labeled as an unscored outcome. |

The React app represents screens as hash-based steps and supports browser back/forward. Keep the API's rule that culprit and solution details are not returned before the case ends. The scoring formula is 60 points for a correct accusation, up to 30 points proportional to clues discovered, and up to 10 points proportional to unused hints; a revealed solution has no score.
