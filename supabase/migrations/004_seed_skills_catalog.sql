-- Migration: 004_seed_skills_catalog.sql
-- Description: Seed 100+ predefined skills across diverse categories into public.skills table

INSERT INTO public.skills (name, category) VALUES
  -- Programming
  ('Python', 'Programming'),
  ('JavaScript', 'Programming'),
  ('TypeScript', 'Programming'),
  ('Java', 'Programming'),
  ('C++', 'Programming'),
  ('C#', 'Programming'),
  ('Rust', 'Programming'),
  ('Go', 'Programming'),
  ('PHP', 'Programming'),
  ('Ruby', 'Programming'),
  ('Swift', 'Programming'),
  ('Kotlin', 'Programming'),

  -- Web Development
  ('React', 'Web Development'),
  ('Vue.js', 'Web Development'),
  ('Angular', 'Web Development'),
  ('Next.js', 'Web Development'),
  ('Node.js', 'Web Development'),
  ('HTML & CSS', 'Web Development'),
  ('Tailwind CSS', 'Web Development'),
  ('GraphQL', 'Web Development'),
  ('REST API Design', 'Web Development'),
  ('Web Architecture', 'Web Development'),

  -- Mobile Development
  ('React Native', 'Mobile Development'),
  ('Flutter', 'Mobile Development'),
  ('iOS Development', 'Mobile Development'),
  ('Android Development', 'Mobile Development'),
  ('SwiftUI', 'Mobile Development'),

  -- AI & Machine Learning
  ('Machine Learning', 'AI & Machine Learning'),
  ('Deep Learning', 'AI & Machine Learning'),
  ('Prompt Engineering', 'AI & Machine Learning'),
  ('PyTorch', 'AI & Machine Learning'),
  ('TensorFlow', 'AI & Machine Learning'),
  ('Computer Vision', 'AI & Machine Learning'),
  ('Natural Language Processing', 'AI & Machine Learning'),
  ('AI Agents & LLMs', 'AI & Machine Learning'),

  -- Data & Analytics
  ('Data Analysis', 'Data & Analytics'),
  ('SQL & Database Design', 'Data & Analytics'),
  ('Pandas & NumPy', 'Data & Analytics'),
  ('Power BI', 'Data & Analytics'),
  ('Tableau', 'Data & Analytics'),
  ('Data Visualization', 'Data & Analytics'),
  ('Big Data & Spark', 'Data & Analytics'),
  ('Statistics & Probability', 'Data & Analytics'),

  -- Design
  ('UI/UX Design', 'Design'),
  ('Figma', 'Design'),
  ('Graphic Design', 'Design'),
  ('Brand Identity', 'Design'),
  ('Illustrator', 'Design'),
  ('Photoshop', 'Design'),
  ('3D Modeling & Blender', 'Design'),
  ('Motion Graphics', 'Design'),
  ('Design Systems', 'Design'),

  -- Video & Media
  ('Video Editing', 'Video & Media'),
  ('Premiere Pro', 'Video & Media'),
  ('DaVinci Resolve', 'Video & Media'),
  ('After Effects', 'Video & Media'),
  ('Animation', 'Video & Media'),
  ('Audio Engineering & Mixing', 'Video & Media'),
  ('Podcast Production', 'Video & Media'),

  -- Marketing
  ('Digital Marketing', 'Marketing'),
  ('Search Engine Optimization (SEO)', 'Marketing'),
  ('Social Media Marketing', 'Marketing'),
  ('Content Strategy', 'Marketing'),
  ('Email Marketing', 'Marketing'),
  ('Paid Ads & PPC', 'Marketing'),
  ('Growth Hacking', 'Marketing'),
  ('Brand Strategy', 'Marketing'),

  -- Business
  ('Product Management', 'Business'),
  ('Project Management', 'Business'),
  ('Agile & Scrum', 'Business'),
  ('Entrepreneurship', 'Business'),
  ('Business Strategy', 'Business'),
  ('Sales & Outreach', 'Business'),
  ('Market Research', 'Business'),
  ('Customer Success', 'Business'),

  -- Finance
  ('Financial Modeling', 'Finance'),
  ('Accounting & Bookkeeping', 'Finance'),
  ('Excel & Spreadsheets', 'Finance'),
  ('Personal Finance', 'Finance'),
  ('Investing & Stocks', 'Finance'),
  ('Crypto & Web3', 'Finance'),

  -- Writing
  ('Copywriting', 'Writing'),
  ('Technical Writing', 'Writing'),
  ('Blogging & Articles', 'Writing'),
  ('Creative Writing', 'Writing'),
  ('UX Writing', 'Writing'),
  ('Proofreading & Editing', 'Writing'),

  -- Communication
  ('Public Speaking', 'Communication'),
  ('Negotiation', 'Communication'),
  ('Interpersonal Communication', 'Communication'),
  ('Storytelling', 'Communication'),
  ('Presentation Design', 'Communication'),

  -- Languages
  ('English Speaking', 'Languages'),
  ('Spanish Speaking', 'Languages'),
  ('French Speaking', 'Languages'),
  ('German Speaking', 'Languages'),
  ('Mandarin Speaking', 'Languages'),
  ('Japanese Speaking', 'Languages'),

  -- Education
  ('Tutoring & Mentorship', 'Education'),
  ('Course Creation', 'Education'),
  ('Instructional Design', 'Education'),
  ('Academic Research', 'Education'),

  -- Music
  ('Music Production', 'Music'),
  ('Guitar', 'Music'),
  ('Piano & Keyboards', 'Music'),
  ('Vocal Training', 'Music'),
  ('Songwriting', 'Music'),

  -- Photography
  ('Portrait Photography', 'Photography'),
  ('Product Photography', 'Photography'),
  ('Photo Editing & Lightroom', 'Photography'),
  ('Videography', 'Photography'),

  -- Productivity
  ('Notion & Workspace Setup', 'Productivity'),
  ('Time Management', 'Productivity'),
  ('Workflow Automation (Zapier/Make)', 'Productivity'),

  -- Career
  ('Resume & CV Writing', 'Career'),
  ('Interview Preparation', 'Career'),
  ('LinkedIn Optimization', 'Career'),
  ('Career Coaching', 'Career'),

  -- Other
  ('Problem Solving', 'Other'),
  ('Critical Thinking', 'Other'),
  ('Event Planning', 'Other')
ON CONFLICT (LOWER(name)) DO NOTHING;

NOTIFY pgrst, 'reload schema';
