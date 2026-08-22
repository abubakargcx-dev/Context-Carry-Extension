const ContextCarrySummarize = (() => {
  const SYSTEM_PROMPT = `You write portable handoff notes for continuing an LLM conversation in a new chat or with a different model.

Output Markdown with exactly these headings, in this order:
## Goal
## Key decisions made
## Completed so far
## In progress / partially done
## Remaining / next steps
## Important details to preserve verbatim

Rules:
- Be accurate. Do not invent work that is not in the transcript.
- Prefer concrete names, file paths, commands, IDs, APIs, constraints, and quoted user requirements.
- "Important details to preserve verbatim" should include exact strings the next model must not paraphrase (URLs, code identifiers, accepted decisions, user constraints).
- Write so a model with zero prior context can continue the work immediately.
- If the transcript is incomplete, say so under Remaining / next steps.
- Do not wrap the whole answer in a code fence.`;

  function formatTranscript(messages) {
    return messages
      .map((m) => {
        const who = m.role === "user" ? "User" : "Assistant";
        return `### ${who}\n${m.text}`;
      })
      .join("\n\n");
  }

  function wrapAsHandoff(summary) {
    return `You are continuing a task that was already in progress in another conversation. Treat the following handoff as ground truth of what was wanted, decided, and already done. Continue from **Remaining / next steps**. Do not redo completed work unless asked.

${summary.trim()}`;
  }

  function rawTranscriptDocument(messages, reason) {
    const body = formatTranscript(messages);
    return `You are continuing a task that was already in progress in another conversation. The original chat could not be summarized (${reason}). The raw transcript follows. Infer the goal, progress, and remaining work from it, then continue.

## Raw transcript (unsummarized)

${body}`;
  }

  function defaultTitle(messages, sourceSite) {
    const firstUser = (messages || []).find((m) => m.role === "user" && m.text);
    const snippet = (firstUser?.text || "Untitled context")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 72);
    const site = sourceSite && sourceSite !== "unknown" ? ` · ${sourceSite}` : "";
    return snippet + (firstUser?.text?.length > 72 ? "…" : "") + site;
  }

  async function summarizeWithFailover(messages, settings, onStatus) {
    const chain = ContextCarryProviders.failoverChain(settings);
    const userPrompt = `Create a handoff summary of this conversation.\n\n${formatTranscript(messages)}`;
    const llmMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];

    const errors = [];
    if (!chain.length) {
      return {
        summarized: false,
        content: rawTranscriptDocument(
          messages,
          "no API key configured"
        ),
        usedProvider: null,
        errors: ["No API keys configured. Saved the raw transcript instead."],
      };
    }

    for (const provider of chain) {
      try {
        if (onStatus) {
          onStatus(`Summarizing with ${provider.name}…`);
        }
        const summary = await ContextCarryProviders.callLLM(provider, llmMessages);
        return {
          summarized: true,
          content: wrapAsHandoff(summary),
          usedProvider: provider.name,
          errors,
        };
      } catch (err) {
        errors.push(err.message || String(err));
      }
    }

    return {
      summarized: false,
      content: rawTranscriptDocument(
        messages,
        errors[errors.length - 1] || "all providers failed"
      ),
      usedProvider: null,
      errors,
    };
  }

  return {
    formatTranscript,
    wrapAsHandoff,
    rawTranscriptDocument,
    defaultTitle,
    summarizeWithFailover,
  };
})();
