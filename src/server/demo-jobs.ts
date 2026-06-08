/**
 * Sample jobs for the in-app "Load sample jobs" demo. Tagged source_id = 'demo'
 * so they're obviously sample data and clearable in one click. Companies are
 * fictional on purpose — these are NOT real openings, just a realistic-looking
 * triage page so a new user can see the UI before configuring a real scrape.
 *
 * Pre-scored (matchScore/matchedKeywords baked) so the demo renders a populated,
 * matched list WITHOUT needing a configured profile/roles. `postedDaysAgo` is
 * resolved to an absolute date at load time so demo rows always look fresh.
 */

export interface DemoJob {
  company: string;
  title: string;
  location: string;
  workMode: 'remote' | 'hybrid' | 'onsite';
  salaryText: string | null;
  description: string;
  url: string;
  tags: string[];
  postedDaysAgo: number;
  category: string;
  matchScore: number;
  matchedRoleIds: string[];
  matchedKeywords: string[];
}

export const DEMO_JOBS: DemoJob[] = [
  {
    company: 'Northwind Labs', title: 'Senior Backend Engineer', location: 'Remote — US', workMode: 'remote',
    salaryText: '$180k–$220k', url: 'https://example.com/demo/northwind-backend',
    description: 'Build distributed services in TypeScript and Go. You will own core APIs, work with Postgres and Kafka, and scale our event pipeline. Strong fundamentals in concurrency and system design expected.',
    tags: ['typescript', 'go', 'kafka'], postedDaysAgo: 1, category: 'devtools', matchScore: 86,
    matchedRoleIds: ['backend_engineer'], matchedKeywords: ['typescript', 'distributed systems', 'kafka'],
  },
  {
    company: 'Helix Pay', title: 'Staff Software Engineer, Payments', location: 'New York, NY', workMode: 'hybrid',
    salaryText: '$210k–$260k', url: 'https://example.com/demo/helix-payments',
    description: 'Own the ledger and settlement systems powering billions in volume. Java/Kotlin, strong consistency, idempotency, and reconciliation. Fintech experience a plus.',
    tags: ['java', 'payments', 'ledger'], postedDaysAgo: 3, category: 'fintech', matchScore: 78,
    matchedRoleIds: ['backend_engineer'], matchedKeywords: ['java', 'settlement', 'ledger'],
  },
  {
    company: 'Cobalt Security', title: 'Application Security Engineer', location: 'Remote — EU', workMode: 'remote',
    salaryText: '€90k–€120k', url: 'https://example.com/demo/cobalt-appsec',
    description: 'Threat modeling, secure code review, and OWASP-aligned testing across our product. Partner with engineering to ship securely; build paved-road tooling. Pentest background welcome.',
    tags: ['appsec', 'owasp', 'threat modeling'], postedDaysAgo: 5, category: 'security', matchScore: 72,
    matchedRoleIds: ['security_engineer'], matchedKeywords: ['application security', 'owasp', 'threat modeling'],
  },
  {
    company: 'Lumen AI', title: 'Machine Learning Engineer', location: 'San Francisco, CA', workMode: 'onsite',
    salaryText: '$200k–$250k + equity', url: 'https://example.com/demo/lumen-mle',
    description: 'Train and serve LLMs in production. PyTorch, distributed training, inference optimization, and MLOps. Work alongside research on agentic systems.',
    tags: ['pytorch', 'llm', 'mlops'], postedDaysAgo: 2, category: 'ai-ml', matchScore: 81,
    matchedRoleIds: ['ml_engineer'], matchedKeywords: ['pytorch', 'llm', 'machine learning'],
  },
  {
    company: 'Drift Data', title: 'Senior Data Engineer', location: 'Remote — Global', workMode: 'remote',
    salaryText: '$170k–$200k', url: 'https://example.com/demo/drift-data-eng',
    description: 'Design pipelines on Spark and Airflow, model the warehouse in dbt/Snowflake, and own data quality. Python and SQL throughout.',
    tags: ['python', 'spark', 'dbt'], postedDaysAgo: 6, category: 'data', matchScore: 69,
    matchedRoleIds: ['data_engineer'], matchedKeywords: ['python', 'spark', 'dbt'],
  },
  {
    company: 'Meridian Cloud', title: 'Site Reliability Engineer', location: 'Remote — US', workMode: 'remote',
    salaryText: '$185k–$225k', url: 'https://example.com/demo/meridian-sre',
    description: 'Run a multi-region Kubernetes platform. Terraform, observability, incident response, and SLOs. Improve developer experience and reduce toil.',
    tags: ['kubernetes', 'terraform', 'observability'], postedDaysAgo: 4, category: 'cloud-infra', matchScore: 74,
    matchedRoleIds: ['devops_sre'], matchedKeywords: ['kubernetes', 'terraform', 'observability'],
  },
  {
    company: 'Ledgerline', title: 'Senior Frontend Engineer', location: 'Remote — Americas', workMode: 'remote',
    salaryText: '$160k–$195k', url: 'https://example.com/demo/ledgerline-fe',
    description: 'Build a fast, accessible React/TypeScript app with a mature design system. Care about performance, a11y, and craft. Next.js and GraphQL in the stack.',
    tags: ['react', 'typescript', 'next.js'], postedDaysAgo: 7, category: 'fintech', matchScore: 71,
    matchedRoleIds: ['frontend_engineer'], matchedKeywords: ['react', 'typescript', 'design systems'],
  },
  {
    company: 'Tessera', title: 'Product Designer', location: 'London, UK', workMode: 'hybrid',
    salaryText: '£70k–£95k', url: 'https://example.com/demo/tessera-designer',
    description: 'Own end-to-end product design — discovery, interaction, and a growing design system. Figma, prototyping, and close partnership with PM and engineering.',
    tags: ['figma', 'design systems'], postedDaysAgo: 8, category: 'saas', matchScore: 64,
    matchedRoleIds: ['product_designer'], matchedKeywords: ['figma', 'design systems', 'prototyping'],
  },
  {
    company: 'Orbit', title: 'Senior Product Manager', location: 'Remote — US', workMode: 'remote',
    salaryText: '$175k–$215k', url: 'https://example.com/demo/orbit-pm',
    description: 'Own a core product area: discovery, roadmap, and delivery. Partner with design and engineering, run experiments, and use analytics to drive decisions. B2B SaaS.',
    tags: ['product', 'roadmap', 'b2b'], postedDaysAgo: 2, category: 'saas', matchScore: 66,
    matchedRoleIds: ['product_manager'], matchedKeywords: ['product', 'roadmap', 'experimentation'],
  },
  {
    company: 'Chainforge', title: 'Backend Engineer, Protocol', location: 'Remote — Global', workMode: 'remote',
    salaryText: '$160k–$210k + tokens', url: 'https://example.com/demo/chainforge-protocol',
    description: 'Build indexing and node infrastructure for an EVM chain. Rust and Go, on-chain data, and high-throughput services. Web3 experience a plus, not required.',
    tags: ['rust', 'go', 'evm'], postedDaysAgo: 9, category: 'crypto', matchScore: 58,
    matchedRoleIds: ['backend_engineer'], matchedKeywords: ['go', 'indexer', 'on-chain'],
  },
  {
    company: 'Pixelforge Studios', title: 'Gameplay Engineer', location: 'Austin, TX', workMode: 'onsite',
    salaryText: '$130k–$170k', url: 'https://example.com/demo/pixelforge-gameplay',
    description: 'Build gameplay systems in Unreal Engine (C++). Multiplayer netcode, animation, and tooling for a new multiplayer title.',
    tags: ['c++', 'unreal engine', 'multiplayer'], postedDaysAgo: 11, category: 'gaming', matchScore: 52,
    matchedRoleIds: [], matchedKeywords: ['unreal engine', 'gameplay', 'multiplayer'],
  },
  {
    company: 'Cartwheel', title: 'Growth Marketing Manager', location: 'Remote — US', workMode: 'remote',
    salaryText: '$120k–$150k', url: 'https://example.com/demo/cartwheel-growth',
    description: 'Own acquisition and lifecycle. Run paid and SEO experiments, partner with product on activation, and report on funnel analytics. B2B SaaS growth.',
    tags: ['growth', 'seo', 'lifecycle'], postedDaysAgo: 10, category: 'saas', matchScore: 47,
    matchedRoleIds: ['growth_marketing'], matchedKeywords: ['growth', 'acquisition', 'seo'],
  },
  {
    company: 'Vantage Health', title: 'Senior Backend Engineer, Platform', location: 'Remote — US', workMode: 'remote',
    salaryText: '$175k–$210k', url: 'https://example.com/demo/vantage-platform',
    description: 'Build HIPAA-compliant services for care delivery. Python and FHIR, secure data handling, and reliable APIs for clinical workflows.',
    tags: ['python', 'fhir', 'hipaa'], postedDaysAgo: 12, category: 'healthtech', matchScore: 61,
    matchedRoleIds: ['backend_engineer'], matchedKeywords: ['python', 'fhir', 'hipaa'],
  },
  {
    company: 'Stackpath Tools', title: 'Developer Experience Engineer', location: 'Remote — EU', workMode: 'remote',
    salaryText: '€80k–€110k', url: 'https://example.com/demo/stackpath-devex',
    description: 'Own SDKs, CLI, and CI/CD tooling that thousands of developers depend on. TypeScript and Go; care deeply about ergonomics and docs.',
    tags: ['typescript', 'sdk', 'ci/cd'], postedDaysAgo: 5, category: 'devtools', matchScore: 68,
    matchedRoleIds: ['backend_engineer'], matchedKeywords: ['typescript', 'sdk', 'developer experience'],
  },
  {
    company: 'Marketmesh', title: 'Engineering Manager', location: 'Remote — Americas', workMode: 'remote',
    salaryText: '$220k–$270k', url: 'https://example.com/demo/marketmesh-em',
    description: 'Lead a team of 6–8 engineers building marketplace systems. Hiring, mentoring, roadmap ownership, and hands-on technical guidance. Strong backend background.',
    tags: ['leadership', 'marketplace'], postedDaysAgo: 6, category: 'ecommerce', matchScore: 55,
    matchedRoleIds: ['engineering_manager'], matchedKeywords: ['engineering', 'team', 'hiring'],
  },
  {
    company: 'Beacon Data', title: 'Data Scientist', location: 'Berlin, DE', workMode: 'hybrid',
    salaryText: '€75k–€100k', url: 'https://example.com/demo/beacon-ds',
    description: 'Modeling, experimentation, and causal inference on a large consumer dataset. Python, SQL, and strong statistics. Partner with product on A/B testing.',
    tags: ['python', 'statistics', 'experimentation'], postedDaysAgo: 13, category: 'data', matchScore: 60,
    matchedRoleIds: ['data_scientist'], matchedKeywords: ['python', 'machine learning', 'a/b testing'],
  },
];
