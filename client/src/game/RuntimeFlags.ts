// Development and audit switches are parsed once at module load. Keeping
// URLSearchParams out of the render loop avoids repeated allocations on mobile.
const parameters = typeof window === "undefined"
  ? new URLSearchParams()
  : new URLSearchParams(window.location.search);

export const runtimeFlags = Object.freeze({
  demo: parameters.has("demo"),
  audioAudit: parameters.has("audioAudit"),
  clashAudit: parameters.has("clashAudit"),
  combatAudit: parameters.has("combatAudit"),
  lockAudit: parameters.has("lockAudit"),
  adversarialAudit: parameters.has("adversarialAudit"),
  preloadAudit: parameters.has("preloadAudit"),
  preloadFailureAudit: parameters.has("preloadFailureAudit"),
  animationTest: parameters.has("animationTest"),
  animationTestPhase: parameters.get("animationTestPhase"),
  autoMusou: parameters.has("autoMusou"),
});
