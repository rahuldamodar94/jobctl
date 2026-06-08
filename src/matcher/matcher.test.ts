import { describe, expect, test } from 'vitest';
import { matchJob } from './matcher.js';
import { parsePostedDate } from './dates.js';
import type { RoleConfig } from '../shared/types.js';

// Mirrors profile/roles.yaml senior_backend (trimmed but same shape/weights)
const seniorBackend: RoleConfig = {
  id: 'senior_backend',
  label: 'Senior Backend Engineer',
  lane: 'ic',
  titleKeywords: ['senior backend', 'staff backend', 'senior software engineer', 'backend engineer', 'tech lead', 'technical lead'],
  mustHaveStack: ['typescript', 'node.js', 'node', 'javascript'],
  niceToHave: {
    idempotency: 10,
    reconciliation: 10,
    indexer: 10,
    'cross-chain': 10,
    settlement: 5,
    stablecoin: 5,
    payments: 5,
    'event-driven': 5,
    kafka: 5,
    postgresql: 4,
    websocket: 5,
    'distributed systems': 5,
    sdk: 5,
    evm: 5,
    'go is a plus': -5,
    solana: -3,
  },
  excludeIfPrimary: ['rust', 'golang', 'python', 'java', 'c++', 'solidity'],
  geoPriority: ['dubai', 'uae', 'remote', 'emea', 'india'],
  geoRelocationOk: ['united states', 'london', 'spain', 'germany', 'netherlands', 'singapore'],
};

const em: RoleConfig = {
  id: 'engineering_manager',
  label: 'Engineering Manager',
  lane: 'em',
  titleKeywords: ['engineering manager', 'head of engineering'],
  mustHaveStack: ['typescript', 'node', 'backend'],
  niceToHave: { hiring: 5, 'hands-on': 8, roadmap: 5 },
  excludeIfPrimary: ['rust', 'golang'],
  geoPriority: ['dubai', 'remote'],
  geoRelocationOk: ['london'],
};

const ROLES = [seniorBackend, em];

// Reconstructed from the real Plasma listing tracked in job_tracker.xlsx
const PLASMA_JD = `
Plasma is building stablecoin payments infrastructure. We're hiring a Senior/Staff
Backend Payments Engineer to own core money movement services.

What you'll do:
- Design and build payment processing services in TypeScript and Node.js
- Build idempotent, retry-safe workflows with queues and state machines
- Own settlement and reconciliation pipelines and the ledger
- Work with blockchain transaction lifecycles across EVM chains
- Operate event-driven systems processing high transaction volumes

What we look for:
- Deep experience with TypeScript, Node.js, PostgreSQL
- Experience with stablecoin or payments systems
- Strong instincts around idempotency, reconciliation, and distributed systems
`;

const RUST_JD = `
We are looking for a Senior Backend Engineer to join our protocol team.
Requirements:
- 5+ years of Rust in production — Rust is our primary language
- Rust, Tokio, async systems programming
- Experience with Solana program development
- TypeScript for tooling is a plus
`;

describe('hard filter', () => {
  test('ACCEPTANCE: Plasma JD passes and scores 85+', () => {
    const r = matchJob(
      {
        title: 'Senior/Staff Backend Payments Engineer',
        description: PLASMA_JD,
        tags: ['TypeScript', 'Node.js', 'Stablecoin'],
        location: 'Remote (London office option, visa sponsored)',
      },
      ROLES
    );
    expect(r.isMatch).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.matchedRoleIds).toContain('senior_backend');
    expect(r.reasons.matchedKeywords).toContain('idempotency');
    expect(r.reasons.matchedKeywords).toContain('reconciliation');
  });

  test('ACCEPTANCE: Rust-primary role fails hard filter', () => {
    const r = matchJob(
      { title: 'Senior Backend Engineer', description: RUST_JD, tags: [], location: 'Remote' },
      ROLES
    );
    expect(r.isMatch).toBe(false);
    expect(r.reasons.roleOutcomes['senior_backend']).toMatch(/rust/i);
  });

  test('title_exclude hard-rejects junior/intern variants of matching titles', () => {
    const roleWithExclude: RoleConfig = {
      ...seniorBackend,
      titleExclude: ['junior', 'intern', 'working student'],
    };
    const junior = matchJob(
      {
        title: 'Junior Backend Engineer',
        description: 'TypeScript and Node.js services for our platform.',
        tags: [],
        location: 'Remote',
      },
      [roleWithExclude]
    );
    expect(junior.isMatch).toBe(false);
    expect(junior.reasons.roleOutcomes['senior_backend']).toMatch(/junior/i);

    const intern = matchJob(
      { title: 'Backend Engineer Intern', description: 'TypeScript, Node.js.', tags: [], location: 'Remote' },
      [roleWithExclude]
    );
    expect(intern.isMatch).toBe(false);
  });

  test('title without any role keyword fails', () => {
    const r = matchJob(
      { title: 'Senior Frontend Engineer', description: 'React and TypeScript', tags: [], location: 'Remote' },
      ROLES
    );
    expect(r.isMatch).toBe(false);
  });

  test('no must-have stack term in a full JD fails', () => {
    const r = matchJob(
      {
        title: 'Senior Backend Engineer',
        description:
          'We need deep Ruby on Rails experience for our monolith. '.repeat(10) +
          'You will work with Rails, Sidekiq and MySQL every day across our backend services.',
        tags: [],
        location: 'Remote',
      },
      ROLES
    );
    expect(r.isMatch).toBe(false);
  });

  test('missing description falls back to title+tags and does NOT hard-fail', () => {
    const r = matchJob(
      {
        title: 'Senior Backend Engineer',
        description: null,
        tags: ['TypeScript', 'Node.js', 'DeFi'],
        location: 'Dubai, UAE',
      },
      ROLES
    );
    expect(r.isMatch).toBe(true);
    expect(r.reasons.descriptionMissing).toBe(true);
  });

  test('no JD AND no stack evidence → include with stackUnverified flag (CONTEXT: include with a flag, not exclude)', () => {
    const r = matchJob(
      {
        title: 'Technical Lead - Wallets (100% remote)',
        description: null,
        tags: ['remote', 'lead', 'tech lead', 'backend'], // no stack terms at all
        location: 'Remote',
      },
      ROLES
    );
    expect(r.isMatch).toBe(true);
    expect(r.reasons.stackUnverified).toBe(true);
    expect(r.reasons.descriptionMissing).toBe(true);
    // no must-have points, but geo + seniority still count
    expect(r.score).toBeGreaterThan(0);
  });

  test('full JD with no stack evidence still fails (real negative signal)', () => {
    const r = matchJob(
      {
        title: 'Senior Backend Engineer',
        description: 'We are a Ruby on Rails shop. '.repeat(20) + 'Rails, Sidekiq, MySQL daily.',
        tags: [],
        location: 'Remote',
      },
      ROLES
    );
    expect(r.isMatch).toBe(false);
  });

  test('NEGATED exclude term ("no Rust required") does not exclude', () => {
    const r = matchJob(
      {
        title: 'Senior Backend Engineer',
        description:
          'No Rust required — this is a TypeScript and Node.js role. ' +
          'You will build payment services with PostgreSQL and Kafka. '.repeat(8),
        tags: [],
        location: 'Remote',
      },
      ROLES
    );
    expect(r.isMatch).toBe(true);
  });

  test('word-boundary stack matching: "anode" does not satisfy "node"', () => {
    const r = matchJob(
      {
        title: 'Senior Backend Engineer',
        description:
          'We build anode-monitoring hardware in Ruby. '.repeat(10) +
          'Rails and MySQL daily across our backend services.',
        tags: [],
        location: 'Remote',
      },
      ROLES
    );
    expect(r.isMatch).toBe(false); // 'node' must not match inside 'anode'
  });

  test('word-boundary still matches dotted/suffixed forms: node.js, typescript,', () => {
    const r = matchJob(
      {
        title: 'Senior Backend Engineer',
        description: 'Our stack: TypeScript, node.js, PostgreSQL. '.repeat(10),
        tags: [],
        location: 'Remote',
      },
      ROLES
    );
    expect(r.isMatch).toBe(true);
  });

  test('exclude term mentioned casually (non-primary) does not exclude', () => {
    const r = matchJob(
      {
        title: 'Senior Backend Engineer',
        description:
          'Build TypeScript and Node.js services for our payments platform with PostgreSQL. ' +
          'Our team values event-driven architecture and observability across distributed systems. '.repeat(5) +
          'Bonus: familiarity with Rust is nice to have but not required.',
        tags: [],
        location: 'Remote',
      },
      ROLES
    );
    expect(r.isMatch).toBe(true);
  });
});

describe('exclusion-path word boundaries (audit findings)', () => {
  const base = {
    title: 'Senior Backend Engineer',
    tags: [] as string[],
    location: 'Remote',
  };
  const filler = 'You will build TypeScript and Node.js services with PostgreSQL. '.repeat(8);

  test('"scalable" never triggers the scala exclusion', () => {
    const r = matchJob(
      { ...base, description: 'Highly scalable systems. Scalability matters. We design for scale. ' + filler },
      ROLES
    );
    expect(r.isMatch).toBe(true);
  });

  test('"trust"/"trusted" never triggers the rust exclusion', () => {
    const r = matchJob(
      { ...base, description: 'Trust is core. Our trusted, trustworthy platform earns user trust. ' + filler },
      ROLES
    );
    expect(r.isMatch).toBe(true);
  });

  test('"javascript" never triggers a java exclusion', () => {
    const roleWithJava: RoleConfig = { ...seniorBackend, excludeIfPrimary: ['java'] };
    const r = matchJob(
      { ...base, description: 'JavaScript everywhere: javascript services, JavaScript tooling. ' + filler },
      [roleWithJava]
    );
    expect(r.isMatch).toBe(true);
  });

  test('"governments"/"category"/"good" never triggers a go exclusion', () => {
    const roleWithGo: RoleConfig = { ...seniorBackend, excludeIfPrimary: ['go'] };
    const r = matchJob(
      { ...base, description: 'Work with governments. A good category of goals, ongoing progress. ' + filler },
      [roleWithGo]
    );
    expect(r.isMatch).toBe(true);
  });

  test('real Rust-primary JD still excluded (boundary matching keeps catching it)', () => {
    const r = matchJob(
      {
        ...base,
        description:
          'Deep Rust experience required. You will write Rust daily; our services are Rust. '.repeat(3) +
          'Some TypeScript for internal tooling only.',
      },
      ROLES
    );
    expect(r.isMatch).toBe(false);
  });

  test('polyglot OR-list with TS co-primary is NOT excluded (Sei/Browserbase pattern)', () => {
    const r = matchJob(
      {
        ...base,
        description:
          'Proficiency with Go / Typescript. Build backend services in TypeScript or Go. ' +
          'Node.js, PostgreSQL, distributed systems. '.repeat(6),
      },
      [{ ...seniorBackend, excludeIfPrimary: ['golang', 'go'] }]
    );
    expect(r.isMatch).toBe(true);
  });

  test('language-dominant JD with token TS mention is still excluded (Squads pattern)', () => {
    const r = matchJob(
      {
        ...base,
        description:
          'Our backend is Rust (Axum). Rust experience required: you will design Rust services, ' +
          'review Rust code, and own our Rust infrastructure. TypeScript only on the frontend. ' +
          'More about our Rust stack: Rust tokio, Rust async. '.repeat(3),
      },
      ROLES
    );
    expect(r.isMatch).toBe(false);
  });

  test('title language-exclude skipped when title also names a must-have (1inch OR-title)', () => {
    const role: RoleConfig = {
      ...seniorBackend,
      titleExclude: ['golang', 'rust'],
    };
    const polyglotTitle = matchJob(
      {
        title: 'Senior Backend Engineer (Golang or Typescript)',
        description: 'TypeScript and Node.js backend. ' + filler,
        tags: [],
        location: 'Dubai',
      },
      [role]
    );
    expect(polyglotTitle.isMatch).toBe(true);

    const soloLang = matchJob(
      { title: 'Senior Backend Engineer (Rust)', description: filler, tags: [], location: 'Remote' },
      [role]
    );
    expect(soloLang.isMatch).toBe(false);
  });
});

describe('P4 review findings (pinned)', () => {
  const filler = 'You will build TypeScript and Node.js services with PostgreSQL. '.repeat(8);

  test('title_exclude is word-boundary: "go" must not exclude "Good Systems"', () => {
    const role: RoleConfig = { ...seniorBackend, titleExclude: ['go'] };
    const r = matchJob(
      { title: 'Senior Backend Engineer, Good Systems', description: filler, tags: [], location: 'Remote' },
      [role]
    );
    expect(r.isMatch).toBe(true);
  });

  test('title_exclude "java" (boundary) excludes Java titles but never JavaScript titles', () => {
    const role: RoleConfig = { ...seniorBackend, titleExclude: ['java'] };
    expect(
      matchJob({ title: 'Senior Backend Engineer, Java', description: filler, tags: [], location: 'Remote' }, [role]).isMatch
    ).toBe(false);
    expect(
      matchJob(
        { title: 'Senior Backend Engineer, JavaScript Platform', description: filler, tags: [], location: 'Remote' },
        [role]
      ).isMatch
    ).toBe(true);
  });

  test('dominance bar: "node.js" must not double-count into must-have mentions', () => {
    // rust appears 3× (primary); user stack appears as exactly TWO tokens:
    // "node.js" once + "typescript" once. Double-counting node.js as
    // node + node.js would make mustMentions 3 and wrongly keep the job.
    const r = matchJob(
      {
        title: 'Senior Backend Engineer',
        description:
          'Rust is required for this role. You will write Rust services and review Rust code daily. ' +
          'We also keep some node.js utilities and typescript scripts around the edges. ' +
          'Distributed systems experience expected. PostgreSQL. Kafka. Observability. '.repeat(3),
        tags: [],
        location: 'Remote',
      },
      ROLES
    );
    expect(r.isMatch).toBe(false); // 3 rust > 2 true stack tokens → excluded
  });

  test('negated must-have mentions do not inflate the dominance bar', () => {
    // "no TypeScript / not Node" must not count as stack evidence that
    // protects a Rust-primary JD from exclusion.
    const r = matchJob(
      {
        title: 'Senior Backend Engineer',
        description:
          'Rust required: Rust services, Rust tooling, Rust reviews. ' +
          'No TypeScript here, not Node either, and definitely no javascript in production. ' +
          'One legacy node.js script exists. ' +
          'Distributed systems, PostgreSQL, Kafka. '.repeat(4),
        tags: [],
        location: 'Remote',
      },
      ROLES
    );
    expect(r.isMatch).toBe(false);
  });

  test('epoch 0 / negative postedDate → null, not 1970', () => {
    expect(parsePostedDate(0)).toBe(null);
    expect(parsePostedDate(-5)).toBe(null);
  });
});

describe('scoring', () => {
  test('geo priority adds more than relocation geo', () => {
    const base = {
      title: 'Senior Backend Engineer',
      description: 'TypeScript and Node.js services.',
      tags: [],
    };
    const dubai = matchJob({ ...base, location: 'Dubai, UAE' }, ROLES);
    const london = matchJob({ ...base, location: 'London, UK' }, ROLES);
    const nowhere = matchJob({ ...base, location: 'Tokyo, Japan' }, ROLES);
    expect(dubai.score).toBeGreaterThan(london.score);
    expect(london.score).toBeGreaterThan(nowhere.score);
  });

  test('EM role matches via its own keywords; score is max across roles', () => {
    const r = matchJob(
      {
        title: 'Engineering Manager, Backend',
        description: 'Hands-on EM for our Node.js backend team. Hiring and roadmap ownership.',
        tags: [],
        location: 'Remote',
      },
      ROLES
    );
    expect(r.isMatch).toBe(true);
    expect(r.matchedRoleIds).toContain('engineering_manager');
  });

  test('negative keywords subtract', () => {
    const base = {
      title: 'Senior Backend Engineer',
      tags: [] as string[],
      location: 'Remote',
    };
    const clean = matchJob({ ...base, description: 'TypeScript, Node.js, PostgreSQL services.' }, ROLES);
    const tainted = matchJob(
      { ...base, description: 'TypeScript, Node.js, PostgreSQL services. Go is a plus. Solana experience preferred.' },
      ROLES
    );
    expect(tainted.score).toBeLessThan(clean.score);
  });

  test('abbreviated seniority titles ("Sr.", "Jr."-guard aside) earn the seniority bonus', () => {
    const base = { description: 'TypeScript and Node.js services.', tags: [] as string[], location: 'Remote' };
    // both titles contain the 'backend engineer' keyword — isolating the bonus
    const abbreviated = matchJob({ ...base, title: 'Sr. Backend Engineer' }, ROLES);
    const spelled = matchJob({ ...base, title: 'Senior Backend Engineer' }, ROLES);
    expect(abbreviated.score).toBe(spelled.score);
  });

  test('score bounded 0..100', () => {
    const r = matchJob(
      {
        title: 'Senior Staff Backend Engineer',
        description: PLASMA_JD + ' indexer cross-chain kafka websocket sdk evm distributed systems',
        tags: [],
        location: 'Dubai, UAE',
      },
      ROLES
    );
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
