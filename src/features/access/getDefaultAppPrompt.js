export function getDefaultAppPrompt(versionId, appName) {
  const prompts = {
    safari: "Why are you opening Safari right now?",
    instagram: "Why are you opening Instagram right now?",
    whatsapp: "Who are you hoping to contact?",
    youtube: "What are you hoping to watch?",
  };
  return prompts[versionId] ?? `Why are you opening ${appName} right now?`;
}
