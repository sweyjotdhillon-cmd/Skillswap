import React from 'react';
import { SWAP_TEMPLATES, SwapTemplate } from '../../constants/templates';
import { getTagLabel } from '../../constants/tags';

interface TemplateGalleryProps {
  onSelectTemplate: (template: SwapTemplate) => void;
  onStartFromScratch: () => void;
  activeTemplateId?: string | null;
}

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
  onSelectTemplate,
  onStartFromScratch,
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

        <button
          type="button"
          onClick={onStartFromScratch}
          className="start-from-scratch-btn"
          aria-label="Start with a blank swap form from scratch"
        >
          <span>✏️ Start from scratch</span>
        </button>
      </div>

      <div className="template-gallery-grid">
        {SWAP_TEMPLATES.map((tpl) => {
          const isActive = activeTemplateId === tpl.id;
          return (
            <div
              key={tpl.id}
              className={`template-card ${isActive ? 'template-card--active' : ''}`}
            >
              <div className="template-card-header">
                <span className="template-icon" role="img" aria-hidden="true">
                  {tpl.icon}
                </span>
                <span className="template-tag-badge">
                  {getTagLabel(tpl.categoryTag)}
                </span>
              </div>

              <h3 className="template-card-title">{tpl.name}</h3>
              <p className="template-card-desc">{tpl.description}</p>

              <div className="template-useful-box">
                <span className="template-useful-label">Ideal for:</span>
                <p className="template-useful-text">{tpl.usefulFor}</p>
              </div>

              <div className="template-card-footer">
                <button
                  type="button"
                  onClick={() => onSelectTemplate(tpl)}
                  className={`template-use-btn ${isActive ? 'template-use-btn--active' : ''}`}
                  aria-label={`Use template: ${tpl.name}`}
                >
                  {isActive ? '✓ Template Applied' : 'Use Template →'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
