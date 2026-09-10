import React from 'react';

export interface FounderProfile {
  id: string;
  name: string;
  role: string;
  bio: string;
  avatarUrl?: string;
  githubUrl?: string;
  linkedinUrl?: string;
}

export interface TeamCredibilityProps {
  founders?: FounderProfile[];
  contactEmail?: string;
  contactWhatsapp?: string;
  title?: string;
  subtitle?: string;
  className?: string;
}

export function TeamCredibility({
  founders = [],
  contactEmail = 'skillswap165@gmail.com',
  contactWhatsapp = '6284387420',
  title = 'Team & Platform Credibility',
  subtitle = 'Direct, transparent communication and human accountability power the SkillSwap ecosystem.',
  className = '',
}: TeamCredibilityProps) {
  const hasFounders = founders && founders.length > 0;

  return (
    <section
      className={`team-credibility-section ${className}`.trim()}
      aria-labelledby="team-credibility-heading"
      style={{
        padding: '3rem 1.5rem',
        background: 'var(--color-surface, #1e293b)',
        borderRadius: '1rem',
        border: '1px solid var(--border-color, rgba(148, 163, 184, 0.15))',
        margin: '2rem 0',
      }}
    >
      <div className="section-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <span
          className="section-eyebrow"
          style={{
            color: '#d6a64a',
            fontSize: '0.8rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            display: 'block',
            marginBottom: '0.4rem',
          }}
        >
          Verifiable Support &amp; Leadership
        </span>
        <h2
          id="team-credibility-heading"
          className="section-title"
          style={{
            fontSize: 'clamp(1.5rem, 2.5vw, 2.1rem)',
            fontWeight: 800,
            color: 'var(--text-color, #f8fafc)',
            margin: '0 0 0.5rem',
          }}
        >
          {title}
        </h2>
        <p
          className="section-description"
          style={{
            color: 'var(--text-muted, #94a3b8)',
            fontSize: '0.95rem',
            maxWidth: '640px',
            margin: '0 auto',
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      </div>

      {hasFounders ? (
        <div
          className="founders-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.5rem',
            marginBottom: '2rem',
          }}
        >
          {founders.map((founder) => {
            const initials = founder.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase();

            return (
              <div
                key={founder.id}
                className="founder-card"
                style={{
                  background: 'var(--color-canvas, #0f172a)',
                  padding: '1.5rem',
                  borderRadius: '0.75rem',
                  border: '1px solid var(--border-color, rgba(148, 163, 184, 0.15))',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {founder.avatarUrl ? (
                    <img
                      src={founder.avatarUrl}
                      alt={`${founder.name} profile picture`}
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid rgba(214, 166, 74, 0.4)',
                      }}
                    />
                  ) : (
                    <div
                      aria-label={`${founder.name} avatar placeholder`}
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #a8781d 0%, #d6a64a 100%)',
                        color: '#0f172a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '1.2rem',
                        border: '2px solid rgba(214, 166, 74, 0.4)',
                      }}
                    >
                      {initials}
                    </div>
                  )}
                  <div>
                    <h3
                      style={{
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        margin: 0,
                        color: 'var(--text-color, #f8fafc)',
                      }}
                    >
                      {founder.name}
                    </h3>
                    <span
                      style={{
                        fontSize: '0.825rem',
                        color: '#d6a64a',
                        fontWeight: 600,
                      }}
                    >
                      {founder.role}
                    </span>
                  </div>
                </div>

                <p
                  style={{
                    fontSize: '0.875rem',
                    color: 'var(--text-muted, #94a3b8)',
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {founder.bio}
                </p>

                {(founder.githubUrl || founder.linkedinUrl) && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.75rem',
                      marginTop: 'auto',
                      paddingTop: '0.5rem',
                      borderTop: '1px solid rgba(148, 163, 184, 0.1)',
                    }}
                  >
                    {founder.githubUrl && (
                      <a
                        href={founder.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.825rem',
                          color: 'var(--text-color, #f8fafc)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontWeight: 600,
                        }}
                        aria-label={`${founder.name}'s GitHub Profile (opens in new tab)`}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                        </svg>
                        GitHub
                      </a>
                    )}
                    {founder.linkedinUrl && (
                      <a
                        href={founder.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.825rem',
                          color: 'var(--text-color, #f8fafc)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontWeight: 600,
                        }}
                        aria-label={`${founder.name}'s LinkedIn Profile (opens in new tab)`}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.72a1.4 1.4 0 1 0 1.4 1.4 1.4 1.4 0 0 0-1.4-1.4z" />
                        </svg>
                        LinkedIn
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Symmetrical Direct Contact Paths */}
      <div
        className="contact-paths-box"
        style={{
          background: 'var(--color-canvas, #0f172a)',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          border: '1px solid var(--border-color, rgba(148, 163, 184, 0.15))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          textAlign: 'center',
        }}
      >
        <h3
          style={{
            fontSize: '1rem',
            fontWeight: 700,
            margin: 0,
            color: 'var(--text-color, #f8fafc)',
          }}
        >
          Symmetric &amp; Direct Support Channels
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            color: 'var(--text-muted, #94a3b8)',
            maxWidth: '520px',
            lineHeight: 1.45,
          }}
        >
          Need help, have feedback, or want to report an issue? Reach out directly to the SkillSwap team via email or WhatsApp.
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '1rem',
            width: '100%',
            marginTop: '0.25rem',
          }}
        >
          {contactEmail && (
            <a
              href={`mailto:${contactEmail}`}
              className="action-button action-button--outline"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1.25rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
              aria-label={`Send email to SkillSwap support at ${contactEmail}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span>{contactEmail}</span>
            </a>
          )}

          {contactWhatsapp && (
            <a
              href={`https://wa.me/91${contactWhatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="action-button action-button--outline"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1.25rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
              aria-label={`Chat on WhatsApp with SkillSwap support at ${contactWhatsapp}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <span>WhatsApp: {contactWhatsapp}</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
