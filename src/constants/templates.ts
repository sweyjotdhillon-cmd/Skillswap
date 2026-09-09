import { getTagSlug } from './tags';

export interface SwapTemplate {
  id: string;
  name: string;
  categoryTag: string; // Display tag or canonical slug
  icon: string;
  description: string;
  usefulFor: string;
  formValues: {
    topic: string;
    tags: string[];
    description: string;
    credits: string;
    requirements: string;
  };
}

export const SWAP_TEMPLATES: readonly SwapTemplate[] = [
  {
    id: 'design-feedback',
    name: 'UI/UX Design Feedback',
    categoryTag: 'design',
    icon: '🎨',
    description: 'Get constructive critique on web or mobile designs, Figma wireframes, and component systems.',
    usefulFor: 'Designers seeking visual hierarchy, contrast accessibility, and UX navigation feedback.',
    formValues: {
      topic: 'Mobile & Web UI/UX Design Review',
      tags: ['design'],
      description: 'Review my mobile app Figma prototypes for visual hierarchy, contrast accessibility, and intuitive navigation flows.',
      credits: '75',
      requirements: 'Annotated visual feedback on 5 core screen flows with accessibility recommendations.',
    },
  },
  {
    id: 'code-review',
    name: 'React & TS Code Review',
    categoryTag: 'coding',
    icon: '⚡',
    description: 'Get your pull requests, custom hooks, and state architecture reviewed by experienced engineers.',
    usefulFor: 'Developers looking for performance optimization, clean code patterns, and bug spot-checks.',
    formValues: {
      topic: 'React & TypeScript Code Architecture Review',
      tags: ['coding'],
      description: 'Review my React custom hooks and state management architecture for performance bottlenecks and clean code patterns.',
      credits: '50',
      requirements: 'Detailed pull request review comments with 3 actionable performance optimization suggestions.',
    },
  },
  {
    id: 'language-practice',
    name: 'Language Conversation Practice',
    categoryTag: 'languages',
    icon: '🗣️',
    description: 'Practice real-time spoken conversation with native or fluent language speakers.',
    usefulFor: 'Learners wanting 1-on-1 audio/video conversation practice for travel or professional fluency.',
    formValues: {
      topic: 'Spanish Conversation & Pronunciation Practice',
      tags: ['languages'],
      description: 'Practice 45 minutes of natural spoken conversation covering professional and everyday travel vocabulary.',
      credits: '30',
      requirements: '45-minute live audio or video call with constructive feedback notes on pronunciation and grammar.',
    },
  },
  {
    id: 'video-editing',
    name: 'Video Editing & Pacing Review',
    categoryTag: 'video-editing',
    icon: '🎬',
    description: 'Refine video cuts, audio transitions, color grading, and short-form video reel pacing.',
    usefulFor: 'Creators polishing YouTube shorts, reels, or promo videos before public release.',
    formValues: {
      topic: 'Short-Form Video Editing & Pacing Review',
      tags: ['video-editing'],
      description: 'Review my 60-second video reel pacing, color grading, audio leveling, and caption timing.',
      credits: '60',
      requirements: 'Timestamped feedback list covering cut transitions, audio leveling, and visual pacing.',
    },
  },
  {
    id: 'career-help',
    name: 'Career & Interview Prep',
    categoryTag: 'career',
    icon: '💼',
    description: 'Mock technical or behavioral interviews, resume reviews, and portfolio alignment.',
    usefulFor: 'Job seekers preparing for upcoming interview rounds or refining professional portfolios.',
    formValues: {
      topic: 'Tech Interview Prep & Resume Review',
      tags: ['career'],
      description: 'Mock technical interview session covering system design basics, resume alignment, and STAR method answers.',
      credits: '70',
      requirements: '45-minute mock interview session with personalized feedback on answers and resume formatting.',
    },
  },
  {
    id: 'tutoring-session',
    name: 'STEM & Math Foundations Tutoring',
    categoryTag: 'other',
    icon: '📐',
    description: 'Interactive 1-on-1 tutoring covering math, algorithms, or fundamental science concepts.',
    usefulFor: 'Students needing clear walkthroughs of problem sets or foundational core concepts.',
    formValues: {
      topic: 'Discrete Math & Algorithm Foundations Tutoring',
      tags: ['other'],
      description: 'Guided walkthrough of discrete mathematics proof techniques, graph theory, and algorithmic complexity.',
      credits: '40',
      requirements: '60-minute interactive tutoring session with step-by-step problem walkthroughs.',
    },
  },
] as const;

/**
 * Normalizes template tag values to canonical tag slugs.
 */
export function getTemplateCanonicalTags(template: SwapTemplate): string[] {
  return template.formValues.tags.map((t) => getTagSlug(t));
}
