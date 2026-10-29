import { useEffect, useMemo, useState } from "react";

const premiseLimit = 500;
const steps = ["home", "create", "investigation", "accusation", "results"];
const difficulties = [
  { id: "easy", label: "Rookie", detail: "A few clear leads" },
  { id: "medium", label: "Detective", detail: "Look closer at the details" },
  { id: "hard", label: "Mastermind", detail: "Every detail matters" }
];

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { "content-type": "application/json", ...options.headers }
    });
  } catch {
    throw new Error("Unable to reach the case server. Check your connection and try again.");
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response. Please try again.");
  }
  if (!response.ok) throw new Error(result.error || "The request could not be completed. Please try again.");
  return result;
}

function Icon({ name, size = 18 }) {
  const common = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round",
    "aria-hidden": true
  };
  const paths = {
    mark: <><path d="M4 20 14.5 4l5.5 16" /><path d="M7.5 15h9" /><circle cx="14.5" cy="4" r="1.5" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    clue: <><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8.2 14.5A7 7 0 1 1 16 14.3c-.9.7-1.3 1.5-1.3 2.7h-5.4c0-1-.3-1.8-1.1-2.5Z" /></>,
    hint: <><path d="M12 3a7 7 0 0 0-4 12.7V19h8v-3.3A7 7 0 0 0 12 3Z" /><path d="M9 22h6" /></>,
    suspect: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
    seal: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function ErrorMessage({ children }) {
  if (!children) return null;
  return <p className="error-message" role="alert">{children}</p>;
}

function App() {
  const [step, setStep] = useState(() => {
    const requestedStep = window.location.hash.slice(1);
    return steps.includes(requestedStep) ? requestedStep : "home";
  });
  const [difficulty, setDifficulty] = useState("medium");
  const [premise, setPremise] = useState("");
  const [mystery, setMystery] = useState(null);
  const [loading, setLoading] = useState("");
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState("");
  const [selectedSuspect, setSelectedSuspect] = useState("");
  const [revealedClues, setRevealedClues] = useState({});
  const [hint, setHint] = useState("");

  const completed = mystery?.progress.status === "completed" || mystery?.progress.status === "revealed";
  const discoveredCount = mystery?.progress.collectedClueIds.length ?? 0;
  const hintLimit = mystery?.progress.hintLimit ?? 3;
  const progressPercent = useMemo(() => {
    if (!mystery?.clues.length) return 0;
    return Math.round((discoveredCount / mystery.clues.length) * 100);
  }, [discoveredCount, mystery]);

  function navigate(nextStep, replace = false) {
    if (!steps.includes(nextStep)) return;
    setStep(nextStep);
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({ step: nextStep }, "", `#${nextStep}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setError("");
  }

  function setCase(caseData) {
    setMystery(caseData);
    setRevealedClues(Object.fromEntries(
      caseData.clues
        .filter((clue) => clue.discovered)
        .map((clue) => [clue.id, clue])
    ));
    setHint(caseData.progress.latestHint || "");
    setSelectedSuspect(caseData.progress.accusation || "");
  }

  useEffect(() => {
    function syncStep() {
      const requestedStep = window.location.hash.slice(1);
      if (steps.includes(requestedStep)) {
        setStep(requestedStep);
        setError("");
      }
    }
    window.addEventListener("popstate", syncStep);
    window.addEventListener("hashchange", syncStep);
    return () => {
      window.removeEventListener("popstate", syncStep);
      window.removeEventListener("hashchange", syncStep);
    };
  }, []);

  useEffect(() => {
    const savedCaseId = sessionStorage.getItem("activeCaseId");
    if (!savedCaseId) {
      setRestoring(false);
      if (step === "investigation" || step === "accusation" || step === "results") setStep("home");
      return undefined;
    }

    let active = true;
    setLoading("restore");
    api(`/api/cases/${encodeURIComponent(savedCaseId)}`)
      .then((savedCase) => {
        if (!active) return;
        setCase(savedCase);
        const restoredStep = savedCase.progress.status === "investigating" ? "investigation" : "results";
        setStep(restoredStep);
        window.history.replaceState({ step: restoredStep }, "", `#${restoredStep}`);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.message);
      })
      .finally(() => {
        if (active) {
          setLoading("");
          setRestoring(false);
        }
      });

    return () => { active = false; };
  }, []);

  async function createCase(event) {
    event.preventDefault();
    const cleanPremise = premise.trim();
    if (!cleanPremise || cleanPremise.length > premiseLimit) {
      setError(`Enter a premise between 1 and ${premiseLimit} characters.`);
      return;
    }

    setLoading("case");
    setError("");
    try {
      const createdCase = await api("/api/cases", {
        method: "POST",
        body: JSON.stringify({ difficulty, premise: cleanPremise })
      });
      sessionStorage.setItem("activeCaseId", createdCase.id);
      setCase(createdCase);
      navigate("investigation");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading("");
    }
  }

  async function discoverClue(clueId) {
    if (revealedClues[clueId] || completed || loading) return;
    setLoading(`clue-${clueId}`);
    setError("");
    try {
      const clue = await api(`/api/cases/${mystery.id}/clues/${encodeURIComponent(clueId)}/discover`, { method: "POST" });
      setRevealedClues((current) => ({ ...current, [clueId]: clue }));
      setMystery((current) => ({
        ...current,
        clues: current.clues.map((item) => item.id === clueId ? { ...item, discovered: true } : item),
        progress: {
          ...current.progress,
          collectedClueIds: current.progress.collectedClueIds.includes(clueId)
            ? current.progress.collectedClueIds
            : [...current.progress.collectedClueIds, clueId]
        }
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading("");
    }
  }

  async function requestHint() {
    if (!mystery || loading) return;
    setLoading("hint");
    setError("");
    try {
      const result = await api(`/api/cases/${mystery.id}/hints`, { method: "POST" });
      setHint(result.hint || "No further hints remain. Review the evidence you have collected.");
      setMystery((current) => ({
        ...current,
        progress: { ...current.progress, hintsUsed: result.hintsUsed }
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading("");
    }
  }

  async function submitAccusation(event) {
    event.preventDefault();
    if (!selectedSuspect || loading) return;
    setLoading("accusation");
    setError("");
    try {
      const result = await api(`/api/cases/${mystery.id}/accusations`, {
        method: "POST",
        body: JSON.stringify({ suspectId: selectedSuspect })
      });
      setMystery(result);
      navigate("results");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading("");
    }
  }

  async function revealSolution() {
    if (!mystery || loading) return;
    setLoading("reveal");
    setError("");
    try {
      const result = await api(`/api/cases/${mystery.id}/reveal`, { method: "POST" });
      setMystery(result);
      navigate("results");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading("");
    }
  }

  function resumeCase() {
    if (!mystery) return;
    navigate(completed ? "results" : "investigation");
  }

  function startNewCase() {
    if (mystery && !completed && !window.confirm("Starting a new case will abandon your current investigation. Continue?")) return;
    sessionStorage.removeItem("activeCaseId");
    setMystery(null);
    setHint("");
    setRevealedClues({});
    setSelectedSuspect("");
    setError("");
    navigate("create");
  }

  function goHome() {
    navigate("home");
  }

  const stepTitles = {
    home: "CASE DESK",
    create: "NEW CASE",
    investigation: "INVESTIGATION",
    accusation: "FINAL ACCUSATION",
    results: "CASE RESULTS"
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={goHome} aria-label="The Mystery Room home">
          <span className="brand-mark"><Icon name="mark" size={23} /></span>
          <span>THE MYSTERY ROOM<span className="brand-sub">AN INTERACTIVE CASE FILE</span></span>
        </button>
        <div className="topbar-right"><span className="status-dot" /> {stepTitles[step]} <span className="topbar-divider">/</span> 01</div>
      </header>

      <div className="page-content">
        {step === "home" && (
          <section className="welcome-layout">
            <div className="welcome-copy">
              <div className="eyebrow"><span className="eyebrow-line" /> YOUR NEXT CASE AWAITS</div>
              <h1>Every clue<br />has a <em>story.</em></h1>
              <p className="welcome-description">Step into the investigation. Examine the evidence, question the suspects, and trust your instincts. The truth is in the details.</p>
              <div className="case-note"><Icon name="lock" size={16} /><span>Case solutions stay sealed until you&apos;re ready.</span></div>
            </div>
            <section className="start-card home-card">
              <div className="card-kicker">AI MYSTERY ROOM <span>CASE DESK</span></div>
              <h2>Your next investigation starts here</h2>
              <p className="muted">Bring a premise, choose your challenge, and follow the evidence wherever it leads.</p>
              <ErrorMessage>{error}</ErrorMessage>
              {restoring || loading === "restore" ? (
                <button className="button button-primary start-button" disabled><span className="spinner" /> RESTORING YOUR CASE</button>
              ) : (
                <>
                  {mystery && (
                    <button className="button button-secondary start-button resume-button" onClick={resumeCase}>
                      RESUME {completed ? "CASE RESULTS" : "INVESTIGATION"} <Icon name="arrow" size={16} />
                    </button>
                  )}
                  <button className="button button-primary start-button" onClick={() => navigate("create")}>
                    START A MYSTERY <Icon name="arrow" size={17} />
                  </button>
                </>
              )}
              <p className="card-footnote">A fresh fictional case, generated just for you.</p>
            </section>
          </section>
        )}

        {step === "create" && (
          <section className="form-page">
            <div className="eyebrow"><span className="eyebrow-line" /> BUILD YOUR CASE</div>
            <h1 className="page-title">Create a <em>mystery.</em></h1>
            <p className="page-lead">Start with a setting, a strange event, or a secret. The premise will inspire your original case.</p>
            <form className="panel create-form" onSubmit={createCase}>
              <label className="field-label" htmlFor="premise">YOUR MYSTERY PREMISE</label>
              <textarea
                id="premise"
                value={premise}
                onChange={(event) => setPremise(event.target.value)}
                maxLength={premiseLimit}
                placeholder="A priceless painting vanishes during a storm at a remote lighthouse..."
                rows={4}
                required
                disabled={loading === "case"}
                aria-describedby="premise-help premise-count"
              />
              <div className="textarea-meta">
                <span id="premise-help">Use up to {premiseLimit} characters. Avoid including personal information.</span>
                <span id="premise-count">{premise.length}/{premiseLimit}</span>
              </div>
              <span className="field-label difficulty-field-label">CHOOSE YOUR DIFFICULTY</span>
              <div className="difficulty-list" role="radiogroup" aria-label="Case difficulty">
                {difficulties.map((option, index) => (
                  <button
                    className={`difficulty-option ${difficulty === option.id ? "selected" : ""}`}
                    key={option.id}
                    onClick={() => setDifficulty(option.id)}
                    role="radio"
                    aria-checked={difficulty === option.id}
                    type="button"
                    disabled={loading === "case"}
                  >
                    <span className="difficulty-number">0{index + 1}</span>
                    <span className="difficulty-label">{option.label}<small>{option.detail}</small></span>
                    <span className="radio-mark">{difficulty === option.id && <span />}</span>
                  </button>
                ))}
              </div>
              <ErrorMessage>{error}</ErrorMessage>
              <div className="form-actions">
                <button className="button button-quiet" type="button" onClick={goHome} disabled={loading === "case"}>BACK HOME</button>
                <button className="button button-primary form-submit" type="submit" disabled={loading === "case" || !premise.trim()}>
                  {loading === "case" ? <><span className="spinner" /> CREATING YOUR MYSTERY…</> : <>CREATE CASE <Icon name="arrow" size={16} /></>}
                </button>
              </div>
            </form>
          </section>
        )}

        {step === "investigation" && mystery && (
          <section className="investigation">
            <div className="case-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-line" /> ACTIVE INVESTIGATION <span className="case-number">/ {mystery.id.slice(0, 8).toUpperCase()}</span></div>
                <h1>{mystery.title}</h1>
                <p className="case-intro">{mystery.introduction}</p>
              </div>
              <button className="button button-quiet" onClick={startNewCase}><Icon name="reset" size={16} /> NEW CASE</button>
            </div>
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <div className="progress-strip">
              <div className="progress-label"><span>INVESTIGATION PROGRESS</span><strong>{discoveredCount} <i>/</i> {mystery.clues.length} CLUES</strong></div>
              <div className="progress-track"><span style={{ width: `${progressPercent}%` }} /></div>
              <div className="progress-meta"><span>{mystery.difficulty.toUpperCase()} CASE</span><span>{mystery.progress.hintsUsed} HINTS USED</span></div>
            </div>
            <div className="investigation-grid">
              <section className="panel suspects-panel">
                <div className="panel-heading"><span className="panel-icon"><Icon name="suspect" /></span><div><span className="panel-overline">PEOPLE OF INTEREST</span><h2>The Suspects</h2></div><span className="panel-count">{mystery.suspects.length.toString().padStart(2, "0")}</span></div>
                <div className="suspect-list">
                  {mystery.suspects.map((suspect, index) => (
                    <details className="suspect-item" key={suspect.id}>
                      <summary><span className="suspect-index">{String(index + 1).padStart(2, "0")}</span><span className="suspect-name">{suspect.name}</span><span className="suspect-chevron">+</span></summary>
                      <div className="suspect-details">
                        <p>{suspect.description}</p>
                        <div className="detail-row"><span>MOTIVE</span><p>{suspect.motive}</p></div>
                        <div className="detail-row"><span>ALIBI</span><p>{suspect.alibi}</p></div>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
              <section className="panel evidence-panel">
                <div className="panel-heading"><span className="panel-icon"><Icon name="clue" /></span><div><span className="panel-overline">GATHERED FROM THE SCENE</span><h2>Evidence Locker</h2></div><span className="panel-count">{discoveredCount.toString().padStart(2, "0")}</span></div>
                <div className="clue-list">
                  {mystery.clues.map((clue, index) => {
                    const discovered = revealedClues[clue.id];
                    return (
                      <article className={`clue-card ${discovered ? "clue-discovered" : ""}`} key={clue.id}>
                        <span className="clue-index">{String(index + 1).padStart(2, "0")}</span>
                        <div className="clue-content">
                          <h3>{clue.title}</h3>
                          {discovered ? <><p>{discovered.description}</p><small>{discovered.significance}</small></> : <p className="clue-sealed">Details sealed — examine this evidence</p>}
                        </div>
                        {!discovered && (
                          <button className="inspect-button" onClick={() => discoverClue(clue.id)} disabled={completed || Boolean(loading)} aria-label={`Examine ${clue.title}`}>
                            {loading === `clue-${clue.id}` ? <span className="spinner" /> : <Icon name="arrow" size={16} />}
                          </button>
                        )}
                        {discovered && <span className="discovered-check"><Icon name="check" size={15} /></span>}
                      </article>
                    );
                  })}
                </div>
              </section>
              <aside className="side-column">
                <section className="panel hint-panel">
                  <div className="panel-heading compact"><span className="panel-icon"><Icon name="hint" /></span><div><span className="panel-overline">A NUDGE, NOT AN ANSWER</span><h2>Detective&apos;s Notes</h2></div></div>
                  {hint ? <p className="hint-copy">{hint}</p> : <p className="muted hint-placeholder">If you find yourself at a dead end, ask for a hint.</p>}
                  <button className="button button-secondary hint-button" onClick={requestHint} disabled={completed || Boolean(loading) || mystery.progress.hintsUsed >= hintLimit}>
                    {loading === "hint" ? <><span className="spinner" /> THINKING</> : mystery.progress.hintsUsed >= hintLimit ? "ALL HINTS USED" : <>REQUEST A HINT <Icon name="arrow" size={15} /></>}
                  </button>
                  <p className="hint-count">{mystery.progress.hintsUsed} / {hintLimit} NOTES REVEALED</p>
                </section>
                <section className="panel next-step-panel">
                  <div className="panel-heading compact"><span className="panel-icon"><Icon name="seal" /></span><div><span className="panel-overline">READY TO DECIDE?</span><h2>Make Your Case</h2></div></div>
                  <p className="muted">Review what you have found, then choose who you believe is responsible.</p>
                  <button className="button button-primary accusation-button" onClick={() => navigate("accusation")} disabled={completed || Boolean(loading)}>
                    MAKE AN ACCUSATION <Icon name="arrow" size={15} />
                  </button>
                  {!completed && <button className="reveal-link" onClick={revealSolution} disabled={Boolean(loading)}>{loading === "reveal" ? "Opening case file…" : "Reveal the solution instead"}</button>}
                </section>
              </aside>
            </div>
            <footer className="case-footer"><span>AI MYSTERY ROOM <span className="footer-divider">/</span> A CASE BUILT FOR CURIOSITY</span><span><Icon name="lock" size={13} /> SOLUTION STORED SECURELY</span></footer>
          </section>
        )}

        {step === "accusation" && mystery && (
          <section className="form-page">
            <div className="eyebrow"><span className="eyebrow-line" /> YOUR INVESTIGATION</div>
            <h1 className="page-title">Make your <em>accusation.</em></h1>
            <p className="page-lead">Who committed the crime in <strong>{mystery.title}</strong>? Your choice will close the case and reveal the solution.</p>
            <button className="text-link review-link" onClick={() => navigate("investigation")}>← REVIEW STORY AND EVIDENCE</button>
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <form className="panel accusation-form" onSubmit={submitAccusation}>
              <label className="field-label" htmlFor="suspect-choice">SELECT A SUSPECT</label>
              <div className="accusation-choices">
                {mystery.suspects.map((suspect, index) => (
                  <label className={`accusation-choice ${selectedSuspect === suspect.id ? "selected" : ""}`} key={suspect.id}>
                    <input type="radio" name="suspect" value={suspect.id} checked={selectedSuspect === suspect.id} onChange={(event) => setSelectedSuspect(event.target.value)} />
                    <span className="difficulty-number">{String(index + 1).padStart(2, "0")}</span>
                    <span><strong>{suspect.name}</strong><small>{suspect.description}</small></span>
                  </label>
                ))}
              </div>
              <p className="muted confirmation-note">Submitting ends the investigation. You can still review the case after seeing the results.</p>
              <button className="button button-primary start-button" type="submit" disabled={!selectedSuspect || Boolean(loading)}>
                {loading === "accusation" ? <><span className="spinner" /> SUBMITTING ACCUSATION…</> : <>SUBMIT ACCUSATION <Icon name="arrow" size={16} /></>}
              </button>
            </form>
          </section>
        )}

        {step === "results" && mystery?.solution && (
          <section className="results-page">
            <div className="eyebrow"><span className="eyebrow-line" /> CASE FILE DECLASSIFIED</div>
            <h1 className="page-title">The truth is <em>revealed.</em></h1>
            <div className={`verdict-card ${mystery.progress.status === "revealed" ? "verdict-neutral" : mystery.correct ? "verdict-correct" : "verdict-incorrect"}`}>
              <div>
                <span className="panel-overline">YOUR VERDICT</span>
                <h2>{mystery.progress.status === "revealed" ? "Solution revealed" : mystery.correct ? "Case solved" : "Incorrect accusation"}</h2>
                <p>{mystery.progress.status === "revealed" ? "You chose to open the case file without making an accusation." : mystery.correct ? `You correctly identified ${mystery.solution.culprit.name}.` : `The evidence points to ${mystery.solution.culprit.name}, not your selection.`}</p>
              </div>
              {mystery.score && (
                <div className="score-display"><strong>{mystery.score.total}</strong><span> / 100 POINTS</span></div>
              )}
            </div>
            {error && <ErrorMessage>{error}</ErrorMessage>}
            {mystery.score && (
              <section className="panel score-breakdown">
                <div className="panel-heading compact"><span className="panel-icon"><Icon name="seal" /></span><div><span className="panel-overline">HOW YOU SCORED</span><h2>Score Breakdown</h2></div></div>
                <div className="score-lines">
                  <div><span>Correct accusation</span><strong>{mystery.score.correctAccusation} / 60</strong></div>
                  <div><span>Clues discovered ({discoveredCount} / {mystery.clues.length})</span><strong>{mystery.score.clueDiscovery} / 30</strong></div>
                  <div><span>Hints used ({mystery.progress.hintsUsed} / {hintLimit})</span><strong>{mystery.score.hintEfficiency} / 10</strong></div>
                </div>
                <p className="score-rule">Score = correct accusation (60) + clue discovery (up to 30) + unused hints (up to 10).</p>
              </section>
            )}
            <section className="solution-panel result-solution">
              <div className="solution-topline"><span><Icon name="lock" size={14} /> CASE FILE DECLASSIFIED</span><span>{mystery.title}</span></div>
              <div className="solution-main">
                <div><span className="panel-overline">THE CULPRIT</span><h2>{mystery.solution.culprit.name}</h2><p>{mystery.solution.culprit.description}</p></div>
                <div className="solution-motive"><span className="panel-overline">THE MOTIVE</span><p>{mystery.solution.motive}</p></div>
              </div>
              <div className="solution-explanation"><span className="panel-overline">HOW THE EVIDENCE FITS</span><p>{mystery.solution.explanation}</p><p>{mystery.solution.narrative}</p></div>
            </section>
            <div className="results-actions">
              <button className="button button-quiet" onClick={() => navigate("investigation")}>REVIEW INVESTIGATION</button>
              <button className="button button-primary" onClick={startNewCase}>PLAY AGAIN <Icon name="arrow" size={16} /></button>
            </div>
          </section>
        )}

        {(step === "investigation" || step === "accusation" || step === "results") && !mystery && (
          <section className="loading-page">
            {restoring ? <><span className="spinner" /> RESTORING YOUR CASE…</> : <><p className="error-message" role="alert">{error || "No active case was found."}</p><button className="button button-primary" onClick={() => navigate("home")}>RETURN HOME</button></>}
          </section>
        )}
      </div>
    </main>
  );
}

export default App;
