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
      if (!response.ok) throw new Error('analysis-failed');
      await onSuccess(payload.data ?? payload, idea);
    } catch {
      onFailure(idea);
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
