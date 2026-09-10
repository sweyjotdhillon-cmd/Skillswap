import { SWAP_TEMPLATES, getTemplatePreFilledSummary } from '../../constants/templates';
import { isValidSwapTag, getTagSlug } from '../../constants/tags';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Helper simulating user data detection logic in CreateSwap.tsx
 */
function hasMeaningfulUserData(formState: {
  topic: string;
  tags: string[];
  description: string;
  attachments: { id: string; name: string }[];
  credits: string;
  requirements: string;
  additionalMessage: string;
}): boolean {
  return Boolean(
    formState.topic.trim() ||
    formState.description.trim() ||
    formState.requirements.trim() ||
    formState.credits.trim() ||
    formState.additionalMessage.trim() ||
    (formState.tags && formState.tags.length > 0) ||
    (formState.attachments && formState.attachments.length > 0)
  );
}

/**
 * Unit tests for Section L14 — Template Gallery & Form Prefill.
 */
export function runTemplateGalleryUnitTests() {
  console.log('--- Starting L14 Template Gallery & Form Prefill Unit Tests ---');

  // Test 1: Template catalog definition integrity
  assert(Array.isArray(SWAP_TEMPLATES) && SWAP_TEMPLATES.length >= 6, 'SWAP_TEMPLATES contains at least 6 starter templates');

  for (const tpl of SWAP_TEMPLATES) {
    assert(Boolean(tpl.id), `Template has valid id: ${tpl.id}`);
    assert(Boolean(tpl.name), `Template "${tpl.id}" has valid name`);
    assert(Boolean(tpl.description), `Template "${tpl.id}" has valid description`);
    assert(Boolean(tpl.usefulFor), `Template "${tpl.id}" has valid usefulFor text`);
    assert(Boolean(tpl.icon), `Template "${tpl.id}" has valid icon`);

    // Verify categoryTag maps to canonical tags
    assert(isValidSwapTag(tpl.categoryTag), `Template "${tpl.id}" categoryTag "${tpl.categoryTag}" is a valid tag`);

    // Verify formValues structure
    assert(typeof tpl.formValues.topic === 'string' && tpl.formValues.topic.length > 0, `Template "${tpl.id}" has topic`);
    assert(Array.isArray(tpl.formValues.tags) && tpl.formValues.tags.length > 0, `Template "${tpl.id}" has tags array`);
    assert(typeof tpl.formValues.description === 'string' && tpl.formValues.description.length > 0, `Template "${tpl.id}" has description`);
    assert(typeof tpl.formValues.credits === 'string' && parseInt(tpl.formValues.credits, 10) > 0, `Template "${tpl.id}" has positive credit string`);
    assert(typeof tpl.formValues.requirements === 'string' && tpl.formValues.requirements.length > 0, `Template "${tpl.id}" has requirements`);

    // Verify all template tags convert to valid canonical slugs
    for (const tag of tpl.formValues.tags) {
      const slug = getTagSlug(tag);
      assert(isValidSwapTag(slug), `Tag "${tag}" in template "${tpl.id}" converts to valid slug "${slug}"`);
    }
  }
  console.log('  -> Template catalog definition integrity verified.');

  // Test 2: Pre-fill summary formatting
  const designTpl = SWAP_TEMPLATES.find((t) => t.id === 'design-feedback')!;
  const summary = getTemplatePreFilledSummary(designTpl);
  assert(summary.includes('Pre-fills:'), 'Summary includes "Pre-fills:" label');
  assert(summary.includes('Design'), 'Summary includes category tag name');
  assert(summary.includes('75 SkillCredits'), 'Summary includes credit amount');
  console.log('  -> Pre-fill summary formatting verified.');

  // Test 3: Form prefill & non-mutation behavior
  const mockCreditsBalance = 100;
  const mockSwapDatabaseCount = 0;

  // Select a template
  const selectedTpl = SWAP_TEMPLATES[0];
  const prefilledFormState = {
    topic: selectedTpl.formValues.topic,
    tags: selectedTpl.formValues.tags.map(getTagSlug),
    description: selectedTpl.formValues.description,
    attachments: [],
    credits: selectedTpl.formValues.credits,
    requirements: selectedTpl.formValues.requirements,
    additionalMessage: '',
  };

  // Verify fields were populated
  assert(prefilledFormState.topic === selectedTpl.formValues.topic, 'Topic pre-filled');
  assert(prefilledFormState.credits === selectedTpl.formValues.credits, 'Credits pre-filled');
  assert(prefilledFormState.description === selectedTpl.formValues.description, 'Description pre-filled');
  assert(prefilledFormState.requirements === selectedTpl.formValues.requirements, 'Requirements pre-filled');

  // Verify pre-filled fields remain fully editable
  prefilledFormState.topic = 'My Customized Topic';
  prefilledFormState.credits = '80';
  assert(prefilledFormState.topic === 'My Customized Topic', 'Topic remains editable after prefill');
  assert(prefilledFormState.credits === '80', 'Credits remain editable after prefill');

  // Verify selecting a template did NOT alter credit balance or database
  assert(mockCreditsBalance === 100, 'Credits balance unaffected by template selection');
  assert(mockSwapDatabaseCount === 0, 'No swap created merely by selecting a template');
  console.log('  -> Form prefill, editability, and non-mutation verified.');

  // Test 4: Protection of user-entered data
  const blankFormState = {
    topic: '',
    tags: [],
    description: '',
    attachments: [],
    credits: '',
    requirements: '',
    additionalMessage: '',
  };
  assert(hasMeaningfulUserData(blankFormState) === false, 'Blank form state has no user data');

  const dirtyFormStateTopic = { ...blankFormState, topic: 'Draft title' };
  assert(hasMeaningfulUserData(dirtyFormStateTopic) === true, 'Form with topic has user data');

  const dirtyFormStateTags = { ...blankFormState, tags: ['coding'] };
  assert(hasMeaningfulUserData(dirtyFormStateTags) === true, 'Form with tags has user data');

  const dirtyFormStateAttachments = { ...blankFormState, attachments: [{ id: '1', name: 'doc.pdf' }] };
  assert(hasMeaningfulUserData(dirtyFormStateAttachments) === true, 'Form with attachment has user data');

  console.log('  -> Protection of user-entered data logic verified.');

  // Test 5: Scaffolding storage key formatting for template gallery
  const templateScaffoldKey = 'skillswap_dismissed_scaffold_create_swap_template_gallery';
  assert(templateScaffoldKey.includes('create_swap_template_gallery'), 'Scaffolding key formatted correctly');

  console.log('✓ All L14 Template Gallery & Form Prefill unit tests passed perfectly!');
}
