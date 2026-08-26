import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalysisRequestBody } from '../supabase/functions/_shared/idea-radar.ts';

const idea = 'How does political polarization change trust in public institutions?';

test('analysis options accept only the two product models and bounded evidence depths', () => {
  assert.deepEqual(
    parseAnalysisRequestBody({
      idea,
      model: 'super_apodex',
      matchCount: 100,
      clientRequestId: '4ce588ff-2350-4c59-a9af-b0df8ac8544e',
      externalProcessingConsent: true,
    }),
    {
      idea,
      model: 'super_apodex',
      effort: 'standard',
      matchCount: 100,
      anonymousId: null,
      attachmentIds: [],
      clientRequestId: '4ce588ff-2350-4c59-a9af-b0df8ac8544e',
      externalProcessingConsent: true,
    },
  );

  assert.throws(() => parseAnalysisRequestBody({ idea, model: 'unknown', matchCount: 20 }), /invalid_analysis_options/);
  assert.throws(() => parseAnalysisRequestBody({ idea, model: 'default', matchCount: 50 }), /invalid_analysis_options/);
  assert.throws(() => parseAnalysisRequestBody({ idea, model: 'default', matchCount: 20.5 }), /invalid_analysis_options/);
});

test('legacy default requests receive safe server defaults and a new idempotency key', () => {
  const parsed = parseAnalysisRequestBody({ idea });

  assert.equal(parsed.idea, idea);
  assert.equal(parsed.model, 'default');
  assert.equal(parsed.matchCount, null);
  assert.match(parsed.clientRequestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('client request ids must be canonical UUIDs when supplied', () => {
  assert.throws(
    () => parseAnalysisRequestBody({ idea, clientRequestId: 'same-request' }),
    /invalid_analysis_options/,
  );
});

test('SUPER requires explicit third-party processing consent while default never does', () => {
  assert.throws(
    () => parseAnalysisRequestBody({ idea, model: 'super_apodex', matchCount: 20 }),
    /external_processing_consent_required/,
  );
  assert.equal(parseAnalysisRequestBody({ idea, model: 'default' }).externalProcessingConsent, false);
});
