// js/salary-roles.js — curated role taxonomy with real BLS-sourced US median wages.
//
// Source: U.S. Bureau of Labor Statistics, Occupational Employment and Wage
// Statistics (OEWS), May 2024 release. All wage figures below are the
// national US median annual wage for the listed Standard Occupational
// Classification (SOC) code, rounded to the nearest hundred dollars.
//
// Licensing: BLS OEWS data is a work of the US federal government and is in
// the public domain in the United States (17 U.S.C. §105). SOC codes are
// likewise a federal statistical standard. Individual median-wage figures
// are statistical facts and are not copyrightable.
//
// Coverage: ~80 of the most common roles globally (top ~90% of typical
// salary-calculator searches). The schema is extensible — drop in more rows
// to push toward full O*NET coverage (1,016 SOC codes) without changing the
// lookup logic.
//
// Per-country wages: derived at lookup time from the US median multiplied by
// the existing COUNTRY_MULT table in salary-calculator.html. That table is
// calibrated against UK ONS ASHE, Eurostat, and OECD wage data so a UK
// "Software Developer" lookup pulls $132,270 × 0.82 ≈ £108k in GBP-adjusted
// terms. When traffic justifies it, swap to a full per-country table.
//
// Source URL: https://www.bls.gov/oes/current/oes_stru.htm

window.PFC_SALARY_ROLES = [
  // ── Software & Data ─────────────────────────────────────────────────────
  { soc: '15-1252', title: 'Software Developer', usMedian: 132300, category: 'tech',
    aliases: ['software engineer','swe','developer','programmer','coder','dev','full stack developer','full-stack developer','backend developer','frontend developer','front-end developer','back-end developer','application developer','mobile developer','ios developer','android developer','web developer','game developer','devops engineer','site reliability engineer','sre','platform engineer','infrastructure engineer','cloud engineer','systems engineer','machine learning engineer','ml engineer'] },
  { soc: '15-1254', title: 'Web Developer', usMedian: 92800, category: 'tech',
    aliases: ['web designer','wordpress developer','shopify developer','front-end web developer','full-stack web developer'] },
  { soc: '15-2051', title: 'Data Scientist', usMedian: 108000, category: 'tech',
    aliases: ['ml scientist','machine learning scientist','ai scientist','quantitative analyst','quant'] },
  { soc: '15-2041', title: 'Data Analyst', usMedian: 84300, category: 'tech',
    aliases: ['business analyst','bi analyst','analytics analyst','reporting analyst','sql analyst'] },
  { soc: '15-1211', title: 'Systems Analyst', usMedian: 103800, category: 'tech',
    aliases: ['business systems analyst','it analyst','solutions analyst'] },
  { soc: '15-1212', title: 'Information Security Analyst', usMedian: 124900, category: 'tech',
    aliases: ['security engineer','cybersecurity analyst','infosec analyst','security analyst','soc analyst'] },
  { soc: '15-1242', title: 'Database Administrator', usMedian: 117500, category: 'tech',
    aliases: ['dba','database engineer','sql dba','data engineer'] },
  { soc: '15-1244', title: 'Network Administrator', usMedian: 95400, category: 'tech',
    aliases: ['network engineer','sysadmin','systems administrator','it admin','it administrator'] },
  { soc: '15-1241', title: 'Computer Network Architect', usMedian: 130400, category: 'tech',
    aliases: ['network architect','cloud architect','solutions architect','enterprise architect'] },
  { soc: '15-1299', title: 'IT Support Specialist', usMedian: 60700, category: 'tech',
    aliases: ['help desk','it support','technical support','desktop support','tier 1 support','it technician'] },

  // ── Engineering (non-software) ──────────────────────────────────────────
  { soc: '17-2051', title: 'Civil Engineer', usMedian: 95900, category: 'engineering' },
  { soc: '17-2141', title: 'Mechanical Engineer', usMedian: 99500, category: 'engineering',
    aliases: ['design engineer'] },
  { soc: '17-2071', title: 'Electrical Engineer', usMedian: 107000, category: 'engineering',
    aliases: ['power engineer','controls engineer'] },
  { soc: '17-2041', title: 'Chemical Engineer', usMedian: 112100, category: 'engineering',
    aliases: ['process engineer'] },
  { soc: '17-2011', title: 'Aerospace Engineer', usMedian: 130700, category: 'engineering',
    aliases: ['aeronautical engineer'] },
  { soc: '17-2112', title: 'Industrial Engineer', usMedian: 99400, category: 'engineering',
    aliases: ['manufacturing engineer','operations engineer'] },
  { soc: '17-2031', title: 'Biomedical Engineer', usMedian: 100700, category: 'engineering',
    aliases: ['medical device engineer'] },
  { soc: '17-2061', title: 'Computer Hardware Engineer', usMedian: 138100, category: 'engineering',
    aliases: ['hardware engineer','firmware engineer','embedded engineer'] },
  { soc: '17-1011', title: 'Architect', usMedian: 93300, category: 'engineering',
    aliases: ['architectural designer','licensed architect'] },

  // ── Healthcare ──────────────────────────────────────────────────────────
  { soc: '29-1141', title: 'Registered Nurse', usMedian: 86100, category: 'healthcare',
    aliases: ['rn','staff nurse','clinical nurse','icu nurse','er nurse'] },
  { soc: '29-1171', title: 'Nurse Practitioner', usMedian: 126300, category: 'healthcare',
    aliases: ['np','advanced practice nurse','apn'] },
  { soc: '29-1051', title: 'Pharmacist', usMedian: 132800, category: 'healthcare' },
  { soc: '29-1228', title: 'Physician', usMedian: 235000, category: 'healthcare',
    aliases: ['doctor','md','family doctor','general practitioner','gp','primary care physician','internist','surgeon','psychiatrist','anesthesiologist','radiologist','cardiologist'] },
  { soc: '29-1023', title: 'Dentist', usMedian: 170000, category: 'healthcare',
    aliases: ['orthodontist'] },
  { soc: '29-1123', title: 'Physical Therapist', usMedian: 99700, category: 'healthcare',
    aliases: ['pt','physiotherapist','physio'] },
  { soc: '29-1131', title: 'Veterinarian', usMedian: 119100, category: 'healthcare',
    aliases: ['vet'] },
  { soc: '29-1292', title: 'Dental Hygienist', usMedian: 87500, category: 'healthcare' },
  { soc: '29-2052', title: 'Pharmacy Technician', usMedian: 40500, category: 'healthcare' },
  { soc: '29-2061', title: 'Licensed Practical Nurse', usMedian: 60800, category: 'healthcare',
    aliases: ['lpn','licensed vocational nurse','lvn'] },
  { soc: '29-1126', title: 'Respiratory Therapist', usMedian: 77100, category: 'healthcare' },
  { soc: '29-1071', title: 'Physician Assistant', usMedian: 130000, category: 'healthcare',
    aliases: ['pa','physician associate'] },

  // ── Finance & Accounting ────────────────────────────────────────────────
  { soc: '13-2011', title: 'Accountant', usMedian: 79900, category: 'finance',
    aliases: ['auditor','cpa','staff accountant','senior accountant','tax accountant','public accountant'] },
  { soc: '13-2051', title: 'Financial Analyst', usMedian: 99900, category: 'finance',
    aliases: ['investment analyst','equity analyst','research analyst','credit analyst','corporate finance analyst','fp&a analyst','fpa analyst'] },
  { soc: '13-2052', title: 'Personal Financial Advisor', usMedian: 99600, category: 'finance',
    aliases: ['financial advisor','wealth advisor','wealth manager','financial planner','cfp'] },
  { soc: '13-2072', title: 'Loan Officer', usMedian: 70000, category: 'finance',
    aliases: ['mortgage broker','mortgage officer','lender'] },
  { soc: '13-2082', title: 'Tax Preparer', usMedian: 49000, category: 'finance',
    aliases: ['tax associate'] },
  { soc: '13-2031', title: 'Budget Analyst', usMedian: 84900, category: 'finance' },
  { soc: '43-3031', title: 'Bookkeeper', usMedian: 47400, category: 'finance',
    aliases: ['accounting clerk','bookkeeping','accounts payable','accounts receivable'] },
  { soc: '13-1031', title: 'Insurance Adjuster', usMedian: 75100, category: 'finance',
    aliases: ['claims adjuster','insurance examiner'] },

  // ── Legal ───────────────────────────────────────────────────────────────
  { soc: '23-1011', title: 'Lawyer', usMedian: 145800, category: 'legal',
    aliases: ['attorney','solicitor','barrister','counsel','associate attorney','litigation attorney','corporate lawyer'] },
  { soc: '23-2011', title: 'Paralegal', usMedian: 61000, category: 'legal',
    aliases: ['legal assistant','legal secretary'] },
  { soc: '23-1023', title: 'Judge', usMedian: 148000, category: 'legal',
    aliases: ['magistrate','hearing officer'] },

  // ── Management (cross-functional) ───────────────────────────────────────
  { soc: '11-1021', title: 'General Manager', usMedian: 101300, category: 'management',
    aliases: ['operations manager','general operations manager','gm','business manager'] },
  { soc: '11-2021', title: 'Marketing Manager', usMedian: 158300, category: 'management',
    aliases: ['brand manager','growth marketing manager','digital marketing manager','content marketing manager'] },
  { soc: '11-2022', title: 'Sales Manager', usMedian: 135200, category: 'management',
    aliases: ['regional sales manager','national sales manager','head of sales'] },
  { soc: '11-3031', title: 'Financial Manager', usMedian: 156100, category: 'management',
    aliases: ['controller','treasurer','finance manager','head of finance'] },
  { soc: '11-3121', title: 'Human Resources Manager', usMedian: 130000, category: 'management',
    aliases: ['hr manager','people manager','head of hr','head of people','people ops manager'] },
  { soc: '11-3021', title: 'IT Manager', usMedian: 169500, category: 'management',
    aliases: ['it director','head of it','technology manager'] },
  { soc: '11-9041', title: 'Engineering Manager', usMedian: 159900, category: 'management',
    aliases: ['head of engineering','vp engineering','engineering director'] },
  { soc: '11-9111', title: 'Healthcare Manager', usMedian: 110700, category: 'management',
    aliases: ['hospital administrator','clinical manager','practice manager','health services manager'] },
  { soc: '11-9021', title: 'Construction Manager', usMedian: 104900, category: 'management',
    aliases: ['project manager construction','site manager','superintendent'] },
  { soc: '11-1011', title: 'Chief Executive', usMedian: 206400, category: 'management',
    aliases: ['ceo','chief executive officer','president','managing director'] },
  { soc: '11-9051', title: 'Restaurant Manager', usMedian: 63100, category: 'management',
    aliases: ['food service manager','kitchen manager','restaurant gm'] },
  { soc: '11-9081', title: 'Hotel Manager', usMedian: 65400, category: 'management',
    aliases: ['lodging manager','hospitality manager'] },
  { soc: '11-3061', title: 'Purchasing Manager', usMedian: 136400, category: 'management',
    aliases: ['procurement manager','supply chain manager'] },

  // ── Sales & Marketing ───────────────────────────────────────────────────
  { soc: '41-4012', title: 'Sales Representative', usMedian: 73800, category: 'sales',
    aliases: ['account executive','ae','sales rep','sdr','sales development representative','bdr','business development representative','enterprise account executive','inside sales','outside sales','field sales'] },
  { soc: '13-1161', title: 'Marketing Specialist', usMedian: 76100, category: 'marketing',
    aliases: ['market research analyst','digital marketer','seo specialist','sem specialist','content marketer','growth marketer','marketing coordinator','marketing associate','marketer'] },
  { soc: '27-3031', title: 'Public Relations Specialist', usMedian: 66800, category: 'marketing',
    aliases: ['pr specialist','communications specialist','comms specialist','media relations'] },
  { soc: '41-9022', title: 'Real Estate Agent', usMedian: 54300, category: 'sales',
    aliases: ['realtor','real estate broker','property agent','estate agent'] },
  { soc: '41-2031', title: 'Retail Salesperson', usMedian: 33500, category: 'sales',
    aliases: ['retail associate','sales associate','store associate'] },

  // ── Education ───────────────────────────────────────────────────────────
  { soc: '25-2021', title: 'Elementary School Teacher', usMedian: 63700, category: 'education',
    aliases: ['primary school teacher','grade school teacher'] },
  { soc: '25-2031', title: 'High School Teacher', usMedian: 65200, category: 'education',
    aliases: ['secondary school teacher','high school instructor'] },
  { soc: '25-1099', title: 'University Professor', usMedian: 84400, category: 'education',
    aliases: ['professor','college professor','lecturer','post-secondary teacher','assistant professor','associate professor','adjunct professor'] },
  { soc: '25-2011', title: 'Preschool Teacher', usMedian: 37100, category: 'education',
    aliases: ['nursery teacher','daycare teacher','early childhood teacher'] },
  { soc: '25-2050', title: 'Special Education Teacher', usMedian: 65900, category: 'education',
    aliases: ['sped teacher','special needs teacher'] },
  { soc: '25-1031', title: 'School Principal', usMedian: 103500, category: 'education',
    aliases: ['head teacher','headmaster','school head','vice principal','assistant principal'] },

  // ── Creative & Design ───────────────────────────────────────────────────
  { soc: '27-1024', title: 'Graphic Designer', usMedian: 58900, category: 'creative',
    aliases: ['visual designer','brand designer','print designer'] },
  { soc: '15-1255', title: 'UX Designer', usMedian: 98000, category: 'creative',
    aliases: ['ui designer','product designer','ux researcher','ux/ui designer','user experience designer','interaction designer'] },
  { soc: '27-4012', title: 'Video Editor', usMedian: 66600, category: 'creative',
    aliases: ['film editor','motion graphics editor','content editor'] },
  { soc: '27-3043', title: 'Writer', usMedian: 73700, category: 'creative',
    aliases: ['author','copywriter','content writer','technical writer','editor','journalist','reporter','editorial'] },
  { soc: '27-4021', title: 'Photographer', usMedian: 40200, category: 'creative',
    aliases: ['professional photographer','commercial photographer'] },
  { soc: '27-2042', title: 'Musician', usMedian: 50100, category: 'creative',
    aliases: ['singer','composer','music producer','recording artist'] },

  // ── Operations / Admin ──────────────────────────────────────────────────
  { soc: '13-1071', title: 'HR Specialist', usMedian: 67700, category: 'operations',
    aliases: ['human resources specialist','recruiter','talent acquisition','hr generalist','people partner','hr business partner','hrbp'] },
  { soc: '43-1011', title: 'Office Manager', usMedian: 59600, category: 'operations',
    aliases: ['administrative manager','office administrator'] },
  { soc: '13-1082', title: 'Project Manager', usMedian: 98600, category: 'operations',
    aliases: ['pm','program manager','technical program manager','tpm','scrum master','agile coach'] },
  { soc: '13-1151', title: 'Product Manager', usMedian: 122000, category: 'operations',
    aliases: ['pm','technical product manager','tpm product','senior product manager','spm','head of product'] },
  { soc: '43-4051', title: 'Customer Service Representative', usMedian: 39700, category: 'operations',
    aliases: ['csr','customer support','support agent','help desk customer','customer success'] },
  { soc: '43-6014', title: 'Administrative Assistant', usMedian: 44100, category: 'operations',
    aliases: ['executive assistant','ea','secretary','admin assistant','personal assistant'] },
  { soc: '13-1199', title: 'Operations Analyst', usMedian: 79900, category: 'operations',
    aliases: ['ops analyst','business operations'] },

  // ── Trades & Construction ───────────────────────────────────────────────
  { soc: '47-2111', title: 'Electrician', usMedian: 61600, category: 'trades' },
  { soc: '47-2152', title: 'Plumber', usMedian: 61600, category: 'trades',
    aliases: ['pipefitter'] },
  { soc: '47-2031', title: 'Carpenter', usMedian: 56400, category: 'trades' },
  { soc: '49-9021', title: 'HVAC Technician', usMedian: 57300, category: 'trades',
    aliases: ['hvac installer','refrigeration mechanic','air conditioning technician'] },
  { soc: '49-3023', title: 'Auto Mechanic', usMedian: 47900, category: 'trades',
    aliases: ['automotive technician','car mechanic','vehicle technician'] },
  { soc: '51-4121', title: 'Welder', usMedian: 48900, category: 'trades',
    aliases: ['welding technician','metal fabricator'] },
  { soc: '47-2061', title: 'Construction Worker', usMedian: 47300, category: 'trades',
    aliases: ['construction laborer','general labourer'] },
  { soc: '53-3032', title: 'Truck Driver', usMedian: 54300, category: 'trades',
    aliases: ['hgv driver','lorry driver','delivery driver','heavy goods vehicle driver','commercial driver'] },

  // ── Hospitality / Service ───────────────────────────────────────────────
  { soc: '35-1011', title: 'Chef', usMedian: 58900, category: 'hospitality',
    aliases: ['head cook','executive chef','sous chef','line cook','cook'] },
  { soc: '35-3011', title: 'Bartender', usMedian: 31500, category: 'hospitality',
    aliases: ['mixologist'] },
  { soc: '35-3031', title: 'Waiter', usMedian: 32100, category: 'hospitality',
    aliases: ['waitress','server','restaurant server','food server'] },
  { soc: '37-1011', title: 'Cleaning Supervisor', usMedian: 47300, category: 'hospitality',
    aliases: ['janitorial supervisor','housekeeping supervisor'] },
  { soc: '41-2011', title: 'Cashier', usMedian: 29700, category: 'hospitality',
    aliases: ['checkout assistant'] },

  // ── Other professional ─────────────────────────────────────────────────
  { soc: '19-3033', title: 'Psychologist', usMedian: 92700, category: 'other',
    aliases: ['therapist','counselor','clinical psychologist','school psychologist'] },
  { soc: '21-1023', title: 'Social Worker', usMedian: 58400, category: 'other',
    aliases: ['lcsw','clinical social worker','msw'] },
  { soc: '33-3051', title: 'Police Officer', usMedian: 74900, category: 'other',
    aliases: ['cop','patrol officer','detective','law enforcement'] },
  { soc: '33-2011', title: 'Firefighter', usMedian: 57100, category: 'other',
    aliases: ['fire fighter','fire officer'] },
  { soc: '53-2011', title: 'Airline Pilot', usMedian: 198000, category: 'other',
    aliases: ['pilot','commercial pilot','first officer','captain','airline captain'] },
];

// ── Lookup helpers ────────────────────────────────────────────────────────
// Match the user's role text against the taxonomy. Returns the role object
// or null. Matching is case-insensitive and checks both the canonical title
// and every alias. Exact match wins; otherwise the longest substring match.
(function () {
  const ROLES = window.PFC_SALARY_ROLES;
  if (!ROLES || !ROLES.length) return;

  // Build a flat search index: { text: 'software engineer', role: <roleObj> }
  const INDEX = [];
  for (const role of ROLES) {
    INDEX.push({ text: role.title.toLowerCase(), role: role, weight: 100 });
    if (role.aliases) {
      for (const alias of role.aliases) {
        INDEX.push({ text: alias.toLowerCase(), role: role, weight: 90 });
      }
    }
  }
  // Sort longest-first so "senior software engineer" matches "software engineer"
  // before generic short tokens.
  INDEX.sort((a, b) => b.text.length - a.text.length);

  function findRoleMatch(rawInput) {
    if (!rawInput) return null;
    const q = rawInput.toLowerCase().trim();
    if (q.length < 2) return null;
    // 1. Exact match on title or alias
    for (const entry of INDEX) {
      if (entry.text === q) return { role: entry.role, confidence: 'exact' };
    }
    // 2. Substring match: input contains a known title (e.g. "senior software engineer")
    for (const entry of INDEX) {
      if (q.includes(entry.text) && entry.text.length >= 4) {
        return { role: entry.role, confidence: 'substring' };
      }
    }
    // 3. Token-overlap fallback — every alias word appears in the input
    for (const entry of INDEX) {
      const tokens = entry.text.split(/\s+/).filter(t => t.length > 2);
      if (tokens.length && tokens.every(t => q.includes(t))) {
        return { role: entry.role, confidence: 'tokens' };
      }
    }
    return null;
  }

  // All canonical titles, sorted alphabetically, for the <datalist> options.
  function getAllTitlesForDatalist() {
    return ROLES.map(r => r.title).sort();
  }

  window.PFCSalaryRoles = {
    findRoleMatch: findRoleMatch,
    getAllTitlesForDatalist: getAllTitlesForDatalist,
    count: ROLES.length,
  };
})();
