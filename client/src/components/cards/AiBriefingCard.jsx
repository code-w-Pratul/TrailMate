import SectionCard from '../ui/SectionCard.jsx';
import { SkeletonText } from '../ui/Skeleton.jsx';
import { Badge } from '../ui/Badge.jsx';
import { RefreshIcon, SparklesIcon } from '../ui/Icons.jsx';

/**
 * The written trip briefing.
 *
 * Two honesty features earn their place in the UI:
 *
 *  - **Provenance.** The badge names what produced the text — `groq`, `gemini`,
 *    `ollama`, or the deterministic `rules` engine. A reader always knows whether
 *    they are looking at model output.
 *  - **Grounding note.** The server strips any place name the model invented and
 *    reports the count. When it removed something, the card says so, rather than
 *    quietly presenting filtered output as pristine.
 */
export default function AiBriefingCard({
  data,
  meta,
  loading,
  error,
  onRetry,
  onRegenerate,
  regenerating,
}) {
  const byRules = data?.generatedBy === 'rules';

  return (
    <SectionCard
      title="Trip briefing"
      subtitle={data ? data.headline : 'What to expect'}
      icon={SparklesIcon}
      meta={meta}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeleton={<SkeletonText lines={5} />}
      actions={
        <div className="flex items-center gap-2">
          {data ? (
            <Badge
              tone={byRules ? 'neutral' : 'brand'}
              title={
                byRules
                  ? 'Assembled by TrailMate\u2019s deterministic rule engine from the data on this page. Set GROQ_API_KEY or GEMINI_API_KEY for a model-written version.'
                  : `Written by ${data.model ?? data.generatedBy}, grounded strictly in this page\u2019s data.`
              }
            >
              {byRules ? 'rules' : data.generatedBy}
            </Badge>
          ) : null}
          {onRegenerate ? (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating || loading}
              className="tm-btn-ghost px-2 py-1"
              aria-label="Regenerate briefing"
              title="Regenerate briefing"
            >
              <RefreshIcon className={`size-4 ${regenerating ? 'animate-spin' : ''}`} />
            </button>
          ) : null}
        </div>
      }
      footer={
        data ? (
          <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            {data.disclaimer}
            {data.ungroundedSuggestionsRemoved > 0
              ? ` ${data.ungroundedSuggestionsRemoved} suggestion${data.ungroundedSuggestionsRemoved === 1 ? '' : 's'} mentioning places not in the data were removed.`
              : ''}
          </p>
        ) : null
      }
    >
      {data ? (
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {data.overview}
          </p>

          {data.whatToExpect?.length ? (
            <Block title="What to expect">
              <ul className="space-y-1.5">
                {data.whatToExpect.map((item, index) => (
                  <li key={index} className="flex gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-400"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          {data.dayPlan?.length ? (
            <Block title="A possible shape for the days">
              <ol className="space-y-2.5">
                {data.dayPlan.map((day) => (
                  <li key={day.day} className="flex gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                      {day.day}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {day.theme}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{day.suggestion}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Block>
          ) : null}

          {data.localTips?.length ? (
            <Block title="Local tips">
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {data.localTips.map((tip, index) => (
                  <li
                    key={index}
                    className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400"
                  >
                    {tip}
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}

function Block({ title, children }) {
  return (
    <section>
      <h3 className="tm-label mb-2">{title}</h3>
      {children}
    </section>
  );
}
