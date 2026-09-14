# Skillswap Design System Rules

## Brand Preservation

Skillswap is an established product with an existing visual identity.

Agents MUST preserve the existing design system when modifying UI.

Do not invent a new visual theme for individual pages or components.

Before changing UI, inspect the existing design tokens, shared components, and neighbouring pages.

A component must visually belong to the same product as the rest of Skillswap.

## Semantic Colour System

Skillswap uses a semantic 60-30-10 colour architecture.

60%:
Foundation / canvas / surfaces.

30%:
Structural blue/cyan interaction system.

10%:
Warm gold/amber transactional and SkillCredits system.

Agents MUST use existing CSS variables and semantic utility classes where available.

Do not introduce arbitrary brand colours.

Do not hardcode replacement palettes such as slate/gray systems inside individual components.

## Theme Support

Skillswap supports light and dark themes.

Components MUST respect:

[data-theme='dark']

and the semantic theme variables already defined in global.css.

Do not hardcode colours that break automatic theme adaptation.

Prefer:

var(--color-*)
var(--surface-*)
var(--accent-*)
var(--status-*)

over duplicated literal colour values.

## Button Colour Semantics

Button colours communicate meaning.

Structural/primary actions:
use the established structural blue/cyan treatment.

Transactional/value/SkillCredits:
use the established warm gold/amber treatment.

Success:
use success semantic colours.

Warning:
use warning semantic colours.

Error/destructive:
use error semantic colours.

Secondary actions:
use the established secondary/outline treatment.

Agents MUST NOT recolour buttons arbitrarily for aesthetic reasons.

## Typography

Preserve the existing typography system:

- Inter for UI/body
- Playfair Display for major editorial/display headings

Do not introduce new fonts without explicit product approval.

## Layout Consistency

Responsive improvements are encouraged, but agents MUST preserve the established product layout language.

Do not fix mobile layouts by creating unrelated one-off layouts that look like a different product.

Avoid:
- unexplained fixed heights
- arbitrary absolute positioning
- excessive empty space
- horizontal overflow
- clipped controls
- overlapping content
- random spacing systems

Prefer:
- content-driven sizing
- shared spacing conventions
- responsive flex/grid layouts
- reusable components
- semantic design tokens

## Component Consistency

Before creating a new card, button, badge, input, modal or navigation element:

1. Search the repository for an existing equivalent.
2. Reuse or extend the existing component where practical.
3. Match its typography, radius, spacing, shadows and colour semantics.
4. Do not create a visually unrelated replacement.

## Brand Regression Check

After UI changes, verify:

- light mode still looks like Skillswap
- dark mode still looks like Skillswap
- buttons retain their semantic colour meanings
- SkillCredits remain gold/amber
- structural interactions remain blue/cyan
- typography remains consistent
- cards remain consistent
- mobile layouts do not overflow
- desktop layouts remain coherent

A layout improvement is NOT considered successful if it causes visual brand regression.

## No "Design From Scratch" Rule

When a task asks to improve an existing page:

IMPROVE THE EXISTING DESIGN.

Do not reinterpret the product identity.

The default assumption is:

"preserve the existing design system unless the user explicitly asks for a redesign."
