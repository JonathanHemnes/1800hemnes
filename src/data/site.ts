/**
 * Every word on the site lives here. Edit this file, not the components.
 * Content is drawn from resume.json — keep the two in step.
 */

export const meta = {
  name: 'Jonathan Hemnes',
  /* Small mono mark in the top rail — the address people typed to get here. */
  wordmark: '1·800·HEMNES',
  role: 'EVP of Engineering',
  location: 'Denver, Colorado',
  description:
    'Jonathan Hemnes — EVP of Engineering at AdCellerant. Engineering organizations, AI systems, and technical strategy. Denver, Colorado.',
  url: 'https://www.1800hemnes.com',
};

export const hero = {
  eyebrow: 'EVP of Engineering · AdCellerant · Denver',
  /** Sits next to the pulsing lamp in the top rail. Three words, tops. */
  status: 'Line open',
  /* Two lines: the given name stroked, the surname solid. */
  lockup: { prefix: 'JONATHAN', name: 'HEMNES' },
  lede: [
    'I run engineering at AdCellerant — software, cloud and security, compliance, and QA.',
    'Before that, VP of Engineering at Only Sky and at Travelers Haven. I started out in QA and came up through full stack engineering, and I still write code.',
  ],
};

export const principles = {
  ext: '01',
  id: 'how-i-lead',
  title: 'How I lead',
  short: 'How I lead',
  items: [
    {
      name: 'Measure the system, not the people',
      body: 'Lead time, deploy frequency, change failure rate. DORA data moves the conversation off who is slow and onto where the pipeline is stuck — which is almost always somewhere nobody was arguing about.',
    },
    {
      name: 'Automate the work that repeats',
      body: 'Custom agents now carry a real share of the operational load. The point was never the technology. It was giving engineers back the hours that went to lookups and handoffs.',
    },
    {
      name: 'Compliance is engineering work',
      body: 'SOC 2 Type I and II, then ISO 27001. Two audit programs taught me that controls belong in the pipeline, not in a spreadsheet assembled the week the auditor arrives.',
    },
    {
      name: 'The org chart is a system design',
      body: 'Team boundaries become interface boundaries whether or not anyone planned it. Better to draw them on purpose, redraw them when the business moves, and build hiring and career paths that hold the shape.',
    },
    {
      name: 'Engineering belongs in the deal early',
      body: 'Enterprise buyers ask about security posture, integration, and roadmap long before anyone signs. Better to answer those in the room than inherit the commitments afterward, so I join deals early and stay through close.',
    },
  ],
};

export const work = {
  ext: '02',
  id: 'work',
  title: 'Selected work',
  short: 'Selected work',
  items: [
    {
      role: 'EVP of Engineering',
      org: 'AdCellerant',
      period: '2020 — now',
      body: 'Lead engineer, then Director of Applications, then VP, now EVP — same company, four jobs. The work today is platform strategy, the AI roadmap, and keeping a growing engineering organization healthy. I also work enterprise deals alongside the revenue team, from early scoping through security review and close.',
      outcomes: [
        'We stood up the AI automation practice — ADK, Vertex AI, and custom agents pointed at real operational workflows.',
        'We took the company through SOC 2 Type I and II, then ISO 27001 — and built the cloud and security governance to keep them.',
        'We rebuilt the SDLC around continuous delivery, automated testing, and observability, with DORA numbers to keep us honest.',
        'We restructured as the company scaled, and rebuilt hiring and talent development to keep up.',
      ],
    },
    {
      role: 'VP of Engineering',
      org: 'Only Sky',
      period: '2019 — 2020',
      body: 'Engineering leadership for a venture-backed B2B platform serving the global mountain destination industry.',
      outcomes: [
        'We scaled the platform to partners across the US, Europe, and New Zealand.',
        'We did the performance, reliability, and data work that fast growth demands.',
      ],
    },
    {
      role: 'VP of Engineering',
      org: 'Travelers Haven',
      period: '2016 — 2019',
      body: 'Arrived as a software engineer; left running engineering, product, and the HAVN team.',
      outcomes: [
        'We set architecture standards and rebuilt the SDLC — career paths included.',
        'Hands-on across Ruby on Rails, Angular, Vue, and React the whole way.',
      ],
    },
  ],
};

export const depth = {
  ext: '03',
  id: 'depth',
  title: 'Where I go deep',
  short: 'Where I go deep',
  groups: [
    {
      name: 'Executive leadership',
      keywords: [
        'Organizational design',
        'Technical strategy',
        'Engineering operations',
        'Cross-functional leadership',
        'OKR execution',
        'Enterprise deal support',
      ],
    },
    {
      name: 'AI, data, and automation',
      keywords: [
        'AI agents (ADK, LangGraph)',
        'RAG pipeline architecture',
        'Vertex AI',
        'BigQuery and Looker modeling',
        'ML-enabled product capabilities',
      ],
    },
    {
      name: 'Compliance and governance',
      keywords: [
        'SOC 2 Type I and II',
        'ISO 27001',
        'Cloud security governance',
        'Security and risk management',
      ],
    },
    {
      name: 'Architecture',
      keywords: [
        'Scalable platforms',
        'Microservices',
        'TypeScript',
        'Node.js',
        'React',
        'Ruby on Rails',
        'Python',
      ],
    },
    {
      name: 'Delivery and quality',
      keywords: [
        'Continuous delivery',
        'Automated testing',
        'Observability',
        'Performance engineering',
      ],
    },
  ],
};

export const background = {
  ext: '04',
  id: 'background',
  title: 'Background',
  short: 'Background',
  rows: [
    { label: 'MBA', value: 'University of Denver, Daniels College of Business' },
    { label: 'BS', value: 'Mechanical engineering, University of Denver (math minor)' },
    { label: 'Earlier', value: 'S&P Capital IQ · FoodServiceWarehouse · TalentKode Sports' },
    { label: 'Board', value: 'Central Park Communities, 2014 — 2021' },
    { label: 'Mentoring', value: 'Big Brothers Big Sisters of Colorado' },
    { label: 'Languages', value: 'English · French, professional working' },
    { label: 'Off the clock', value: 'Motorcycles, long routes, and a camera' },
  ],
};

export const contact = {
  ext: '05',
  id: 'contact',
  title: 'Direct lines',
  short: 'Direct lines',
  invitation:
    'Stuck on an org problem, standing up an AI practice, or hiring an engineering leader? Email is the fastest way through.',
  lines: [
    { label: 'Email', value: 'jhemnes@gmail.com', href: 'mailto:jhemnes@gmail.com' },
    // The domain sets up the joke; whether the switchboard actually rings is
    // your call. Uncomment to publish your number.
    // { label: 'Phone', value: '617·257·0047', href: 'tel:+16172570047' },
    {
      label: 'LinkedIn',
      value: 'in/jonathanhemnes',
      href: 'https://www.linkedin.com/in/jonathanhemnes/',
    },
    { label: 'GitHub', value: 'JonathanHemnes', href: 'https://github.com/JonathanHemnes' },
  ],
};

export const sections = [principles, work, depth, background, contact];
