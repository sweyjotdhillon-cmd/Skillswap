export interface Swap {
  id: string;
  personName: string;
  avatar: string;
  rating: number;
  needSkill: string;
  description: string;
  offerSkill?: string;
  skillCredits: number;
  category: string;
}

export const MOCK_SWAPS: Swap[] = [
  {
    id: '1',
    personName: 'Maya Sharma',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    rating: 4.8,
    needSkill: 'Logo Design',
    description: 'Looking for someone to create a clean logo for my new project.',
    offerSkill: 'SEO Strategy',
    skillCredits: 30,
    category: 'Design',
  },
  {
    id: '2',
    personName: 'Arjun Mehta',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    rating: 4.9,
    needSkill: 'Short Video Editing',
    description: 'Need help editing a 60-second promotional video.',
    offerSkill: 'UI/UX Design Feedback',
    skillCredits: 25,
    category: 'Video Editing',
  },
  {
    id: '3',
    personName: 'Priya Nair',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    rating: 4.7,
    needSkill: 'English Conversation',
    description: 'Want to improve my spoken English and fluency.',
    offerSkill: 'Python Basics Tutoring',
    skillCredits: 20,
    category: 'Languages',
  },
  {
    id: '4',
    personName: 'Rahul Verma',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    rating: 4.6,
    needSkill: 'Product Photography',
    description: 'Need clean product photos for my online store.',
    offerSkill: 'Copywriting',
    skillCredits: 30,
    category: 'Photography',
  },
  {
    id: '5',
    personName: 'Kabir Singh',
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80',
    rating: 4.8,
    needSkill: 'Guitar Lessons',
    description: 'Beginner here and looking to learn acoustic guitar.',
    offerSkill: 'Website Development',
    skillCredits: 35,
    category: 'Music',
  },
  {
    id: '6',
    personName: 'Nisha Iyer',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    rating: 4.7,
    needSkill: 'Resume Review',
    description: 'Need help improving my resume and LinkedIn profile.',
    offerSkill: 'Social Media Marketing',
    skillCredits: 25,
    category: 'Career',
  },
  {
    id: '7',
    personName: 'Sneha Patel',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80',
    rating: 4.6,
    needSkill: 'Excel Help',
    description: 'Need help with advanced Excel formulas.',
    offerSkill: 'Graphic Design',
    skillCredits: 20,
    category: 'Coding',
  },
  {
    id: '8',
    personName: 'Aman Gupta',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
    rating: 4.9,
    needSkill: 'Fitness Coaching',
    description: 'Looking for a personalized workout plan.',
    offerSkill: 'Content Writing',
    skillCredits: 20,
    category: 'Fitness',
  },
  {
    id: '9',
    personName: 'Vikram Malhotra',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
    rating: 4.8,
    needSkill: 'Marketing Strategy',
    description: 'Need a comprehensive launch strategy for a tech product.',
    offerSkill: 'Webflow Development',
    skillCredits: 40,
    category: 'Marketing',
  },
  {
    id: '10',
    personName: 'Ananya Roy',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    rating: 4.9,
    needSkill: 'Blog Copywriting',
    description: 'Looking for engaging articles on tech and design trends.',
    offerSkill: 'Video Editing',
    skillCredits: 30,
    category: 'Writing',
  },
];
