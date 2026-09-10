import React from 'react';
import { SWAP_TEMPLATES, SwapTemplate, getTemplatePreFilledSummary } from '../../constants/templates';
import { getTagLabel } from '../../constants/tags';

interface TemplateGalleryProps {
  onSelectTemplate: (template: SwapTemplate) => void;
  onStartFromScratch: () => void;
  onDismiss?: () => void;
  activeTemplateId?: string | null;
}

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
  onSelectTemplate,
  onStartFromScratch,
  onDismiss,
  activeTemplateId,
}) => {
  return (
    <section className="template-gallery-section" aria-label="Swap Template Gallery">
      <div className="template-gallery-header">
        <div className="template-gallery-title-group">
          <span className="template-gallery-eyebrow">⚡ Instant Starter Gallery</span>
          <h2 className="template-gallery-title">Choose a Starter Template</h2>
          <p className="template-gallery-subtitle">
            Skip the blank page. Select a worked example to pre-fill your swap request with sensible defaults. Every value remains 100% editable before publishing.
          </p>
        </div>

        <div className="template-gallery-actions">
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="scaffolding-dismiss-btn"
              title="Don't show this again"
              aria-label="Don't show starter templates again"
            >
              Don't show this again
            </button>
          )}

          <button
            type="button"
            onClick={onStartFromScratch}
            className="start-from-scratch-btn"
            aria-label="Start with a blank swap form from scratch"
          >
            <span>✏️ Start from scratch</span>
          </button>
        </div>
      </div>

      <div className="template-gallery-grid" role="region" aria-label="Swap Template Cards">
        {SWAP_TEMPLATES.map((tpl) => {
          const isActive = activeTemplateId === tpl.id;
          const prefillSummary = getTemplatePreFilledSummary(tpl);

          return (
            <article
              key={tpl.id}
              className={`template-card ${isActive ? 'template-card--active' : ''}`}
              aria-labelledby={`tpl-title-${tpl.id}`}
            >
              <div className="template-card-header">
                <span className="template-icon" role="img" aria-hidden="true">
                  {tpl.icon}
                </span>
                <span className="template-tag-badge">
                  {getTagLabel(tpl.categoryTag)}
                </span>
              </div>

              <h3 id={`tpl-title-${tpl.id}`} className="template-card-title">{tpl.name}</h3>
              <p className="template-card-desc">{tpl.description}</p>

              <div className="template-useful-box">
                <span className="template-useful-label">Ideal for:</span>
                <p className="template-useful-text">{tpl.usefulFor}</p>
              </div>

              <div className="template-prefill-pill" aria-label={prefillSummary}>
                <span className="template-prefill-icon" aria-hidden="true">📋</span>
                <span className="template-prefill-text">
                  <strong>Pre-fills:</strong> Topic, Tags, Description, <strong>{tpl.formValues.credits} Credits</strong> &amp; Requirements
                </span>
              </div>

              <div className="template-card-footer">
                <button
                  type="button"
                  onClick={() => onSelectTemplate(tpl)}
                  className={`template-use-btn ${isActive ? 'template-use-btn--active' : ''}`}
                  aria-label={isActive ? `Template applied: ${tpl.name}` : `Use template to pre-fill form: ${tpl.name}`}
                >
                  {isActive ? '✓ Template Applied' : 'Use Template →'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
