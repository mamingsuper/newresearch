export function initPublicAnalysisForm({
  form,
  readIdea,
  minLength = 20,
  onReset = () => {},
  onInvalid = () => {},
  onStart = () => {},
  analyze,
  onSuccess = () => {},
  onFailure = () => {},
  onFinish = () => {},
} = {}) {
  if (!form?.addEventListener || typeof readIdea !== 'function' || typeof analyze !== 'function') {
    throw new Error('Public analysis form requires a form, idea reader, and analysis callback');
  }

  const submit = async (event) => {
    event.preventDefault();
    onReset();
    const idea = String(readIdea() ?? '').trim();
    if (idea.length < minLength) {
      onInvalid(idea);
      return;
    }

    onStart(idea);
    try {
      const response = await analyze(idea);
      const payload = await response.json();
      if (!response.ok) {
        const error = new Error('analysis-failed');
        error.code = payload?.error?.code ?? 'ANALYSIS_FAILED';
        throw error;
      }
      await onSuccess(payload.data ?? payload, idea);
    } catch (error) {
      onFailure(idea, error);
    } finally {
      onFinish(idea);
    }
  };

  form.addEventListener('submit', submit);
  return Object.freeze({
    submit,
    destroy() { form.removeEventListener?.('submit', submit); },
  });
}
