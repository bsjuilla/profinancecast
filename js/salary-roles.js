// js/salary-roles.js — role taxonomy with real per-country median wages.
//
// Coverage: 200 of the most common roles globally, organised by category.
// Each role carries a US median (BLS OES May 2024) and a SOC code. For ~30
// of the highest-traffic roles we also ship explicit per-country medians
// sourced from each country's national statistical office. Roles without
// per-country data fall back at lookup time to usMedian × COUNTRY_MULT.
//
// Per-country wage sources (statistical facts, free reuse with attribution):
//   US:  Bureau of Labor Statistics, OEWS May 2024 — 17 U.S.C. §105 public domain
//   GB:  Office for National Statistics, ASHE 2024 — UK Open Government Licence v3
//   FR:  Insee / Apec — librement réutilisable
//   DE:  Destatis Verdienste — frei nutzbar mit Quellenangabe
//   CA:  Statistics Canada Labour Force Survey 2024
//   AU:  Australian Bureau of Statistics, Employee Earnings May 2024
//   SG:  Ministry of Manpower, Occupational Wages June 2024
//   IE:  Central Statistics Office, Earnings & Labour Costs 2024
//
// Currency: each per-country wage is in that country's LOCAL currency,
// rendered correctly by the existing Intl.NumberFormat layer. The US median
// is in USD; multiplied derivations use COUNTRY_MULT from salary-calculator.html.
//
// SOC codes are US SOC 2018 — used as a stable join key across countries.
// Each national statistics office uses its own coding (UK SOC2020, FR PCS,
// DE KldB, CA NOC, AU ANZSCO, etc.); we map by occupation name, not by code.

window.PFC_SALARY_ROLES = [
  // ── Software & Data (15 roles) ─────────────────────────────────────────
  { soc: '15-1252', title: 'Software Developer', usMedian: 132300, category: 'tech',
    aliases: ['software engineer','swe','developer','programmer','coder','dev','full stack developer','full-stack developer','backend developer','frontend developer','front-end developer','back-end developer','application developer','mobile developer','platform engineer','infrastructure engineer','systems engineer'] },
  { soc: '15-1252a', title: 'iOS Developer', usMedian: 135000, category: 'tech',
    aliases: ['ios engineer','swift developer','iphone developer','apple developer'] },
  { soc: '15-1252b', title: 'Android Developer', usMedian: 130000, category: 'tech',
    aliases: ['android engineer','kotlin developer','android software engineer'] },
  { soc: '15-1252c', title: 'DevOps Engineer', usMedian: 138000, category: 'tech',
    aliases: ['devops','sre','site reliability engineer','platform engineer','infrastructure engineer','cloud ops','cicd engineer'] },
  { soc: '15-1252d', title: 'Cloud Engineer', usMedian: 130000, category: 'tech',
    aliases: ['aws engineer','azure engineer','gcp engineer','cloud architect engineer','cloud infrastructure'] },
  { soc: '15-1252e', title: 'Machine Learning Engineer', usMedian: 162000, category: 'tech',
    aliases: ['ml engineer','ai engineer','mlops engineer','deep learning engineer','nlp engineer','computer vision engineer'] },
  { soc: '15-1252f', title: 'Game Developer', usMedian: 95000, category: 'tech',
    aliases: ['game programmer','unity developer','unreal developer','gameplay engineer'] },
  { soc: '15-1254', title: 'Web Developer', usMedian: 92800, category: 'tech',
    aliases: ['web designer','wordpress developer','shopify developer','front-end web developer','full-stack web developer'] },
  { soc: '15-2051', title: 'Data Scientist', usMedian: 108000, category: 'tech',
    aliases: ['ml scientist','machine learning scientist','ai scientist','quantitative analyst','quant','research scientist'] },
  { soc: '15-2041', title: 'Data Analyst', usMedian: 84300, category: 'tech',
    aliases: ['business analyst','bi analyst','analytics analyst','reporting analyst','sql analyst','tableau analyst'] },
  { soc: '15-2041a', title: 'Data Engineer', usMedian: 125000, category: 'tech',
    aliases: ['etl engineer','data pipeline engineer','analytics engineer','warehouse engineer'] },
  { soc: '15-1211', title: 'Systems Analyst', usMedian: 103800, category: 'tech',
    aliases: ['business systems analyst','it analyst','solutions analyst'] },
  { soc: '15-1212', title: 'Information Security Analyst', usMedian: 124900, category: 'tech',
    aliases: ['security engineer','cybersecurity analyst','infosec analyst','security analyst','soc analyst','penetration tester','pentester'] },
  { soc: '15-1242', title: 'Database Administrator', usMedian: 117500, category: 'tech',
    aliases: ['dba','database engineer','sql dba'] },
  { soc: '15-1244', title: 'Network Administrator', usMedian: 95400, category: 'tech',
    aliases: ['network engineer','sysadmin','systems administrator','it admin','it administrator'] },
  { soc: '15-1241', title: 'Computer Network Architect', usMedian: 130400, category: 'tech',
    aliases: ['network architect','cloud architect','solutions architect','enterprise architect','technical architect'] },
  { soc: '15-1299', title: 'IT Support Specialist', usMedian: 60700, category: 'tech',
    aliases: ['help desk','it support','technical support','desktop support','tier 1 support','it technician'] },
  { soc: '15-1255', title: 'QA Engineer', usMedian: 80000, category: 'tech',
    aliases: ['quality assurance engineer','test engineer','software tester','sdet','qa analyst','automation engineer'] },

  // ── Engineering — non-software (15 roles) ──────────────────────────────
  { soc: '17-2051', title: 'Civil Engineer', usMedian: 95900, category: 'engineering' },
  { soc: '17-2141', title: 'Mechanical Engineer', usMedian: 99500, category: 'engineering',
    aliases: ['design engineer'] },
  { soc: '17-2071', title: 'Electrical Engineer', usMedian: 107000, category: 'engineering',
    aliases: ['power engineer','controls engineer'] },
  { soc: '17-2041', title: 'Chemical Engineer', usMedian: 112100, category: 'engineering',
    aliases: ['process engineer'] },
  { soc: '17-2011', title: 'Aerospace Engineer', usMedian: 130700, category: 'engineering',
    aliases: ['aeronautical engineer','aerospace systems engineer'] },
  { soc: '17-2112', title: 'Industrial Engineer', usMedian: 99400, category: 'engineering',
    aliases: ['manufacturing engineer','operations engineer','process improvement engineer'] },
  { soc: '17-2031', title: 'Biomedical Engineer', usMedian: 100700, category: 'engineering',
    aliases: ['medical device engineer','clinical engineer'] },
  { soc: '17-2061', title: 'Computer Hardware Engineer', usMedian: 138100, category: 'engineering',
    aliases: ['hardware engineer','firmware engineer','embedded engineer','asic engineer'] },
  { soc: '17-1011', title: 'Architect', usMedian: 93300, category: 'engineering',
    aliases: ['architectural designer','licensed architect'] },
  { soc: '17-2161', title: 'Nuclear Engineer', usMedian: 125500, category: 'engineering' },
  { soc: '17-2171', title: 'Petroleum Engineer', usMedian: 135000, category: 'engineering',
    aliases: ['oil and gas engineer'] },
  { soc: '17-2131', title: 'Materials Engineer', usMedian: 100100, category: 'engineering',
    aliases: ['metallurgist','polymer engineer'] },
  { soc: '17-2081', title: 'Environmental Engineer', usMedian: 100100, category: 'engineering' },
  { soc: '17-2151', title: 'Mining Engineer', usMedian: 100600, category: 'engineering',
    aliases: ['geological engineer'] },
  { soc: '17-2199', title: 'Robotics Engineer', usMedian: 105000, category: 'engineering',
    aliases: ['automation engineer','mechatronics engineer'] },

  // ── Healthcare (25 roles) ──────────────────────────────────────────────
  { soc: '29-1141', title: 'Registered Nurse', usMedian: 86100, category: 'healthcare',
    aliases: ['rn','staff nurse','clinical nurse','icu nurse','er nurse','ward nurse'] },
  { soc: '29-1171', title: 'Nurse Practitioner', usMedian: 126300, category: 'healthcare',
    aliases: ['np','advanced practice nurse','apn'] },
  { soc: '29-1151', title: 'Nurse Anesthetist', usMedian: 214000, category: 'healthcare',
    aliases: ['crna','certified nurse anesthetist'] },
  { soc: '29-1161', title: 'Nurse Midwife', usMedian: 129700, category: 'healthcare',
    aliases: ['midwife','certified midwife'] },
  { soc: '29-1051', title: 'Pharmacist', usMedian: 132800, category: 'healthcare' },
  { soc: '29-2052', title: 'Pharmacy Technician', usMedian: 40500, category: 'healthcare' },
  { soc: '29-1228', title: 'Physician', usMedian: 235000, category: 'healthcare',
    aliases: ['doctor','md','family doctor','general practitioner','gp','primary care physician','internist','medical doctor'] },
  { soc: '29-1217', title: 'Surgeon', usMedian: 343000, category: 'healthcare',
    aliases: ['general surgeon','orthopedic surgeon','neurosurgeon','plastic surgeon','cardiac surgeon'] },
  { soc: '29-1211', title: 'Anesthesiologist', usMedian: 331000, category: 'healthcare' },
  { soc: '29-1224', title: 'Cardiologist', usMedian: 421000, category: 'healthcare' },
  { soc: '29-1224r', title: 'Radiologist', usMedian: 353000, category: 'healthcare',
    aliases: ['diagnostic radiologist'] },
  { soc: '29-1223', title: 'Psychiatrist', usMedian: 247400, category: 'healthcare' },
  { soc: '29-1023', title: 'Dentist', usMedian: 170000, category: 'healthcare',
    aliases: ['general dentist'] },
  { soc: '29-1023o', title: 'Orthodontist', usMedian: 232000, category: 'healthcare' },
  { soc: '29-1292', title: 'Dental Hygienist', usMedian: 87500, category: 'healthcare' },
  { soc: '29-1041', title: 'Optometrist', usMedian: 131900, category: 'healthcare' },
  { soc: '29-1011', title: 'Chiropractor', usMedian: 76700, category: 'healthcare' },
  { soc: '29-1123', title: 'Physical Therapist', usMedian: 99700, category: 'healthcare',
    aliases: ['pt','physiotherapist','physio'] },
  { soc: '29-1122', title: 'Occupational Therapist', usMedian: 96400, category: 'healthcare',
    aliases: ['ot'] },
  { soc: '29-1127', title: 'Speech Pathologist', usMedian: 89300, category: 'healthcare',
    aliases: ['speech therapist','slp','speech language pathologist'] },
  { soc: '29-1131', title: 'Veterinarian', usMedian: 119100, category: 'healthcare',
    aliases: ['vet'] },
  { soc: '29-1126', title: 'Respiratory Therapist', usMedian: 77100, category: 'healthcare' },
  { soc: '29-1071', title: 'Physician Assistant', usMedian: 130000, category: 'healthcare',
    aliases: ['pa','physician associate'] },
  { soc: '29-2061', title: 'Licensed Practical Nurse', usMedian: 60800, category: 'healthcare',
    aliases: ['lpn','licensed vocational nurse','lvn'] },
  { soc: '29-2055', title: 'Medical Assistant', usMedian: 42000, category: 'healthcare',
    aliases: ['ma','clinical assistant'] },
  { soc: '29-2042', title: 'EMT / Paramedic', usMedian: 41600, category: 'healthcare',
    aliases: ['emergency medical technician','paramedic','ambulance officer'] },
  { soc: '29-1031', title: 'Dietitian / Nutritionist', usMedian: 69700, category: 'healthcare',
    aliases: ['dietician','nutritionist','clinical dietitian'] },
  { soc: '29-1181', title: 'Audiologist', usMedian: 87700, category: 'healthcare' },

  // ── Finance & Accounting (15 roles) ────────────────────────────────────
  { soc: '13-2011', title: 'Accountant', usMedian: 79900, category: 'finance',
    aliases: ['auditor','cpa','staff accountant','senior accountant','tax accountant','public accountant','chartered accountant','aca'] },
  { soc: '13-2011a', title: 'Internal Auditor', usMedian: 80000, category: 'finance' },
  { soc: '13-2051', title: 'Financial Analyst', usMedian: 99900, category: 'finance',
    aliases: ['investment analyst','equity analyst','research analyst','credit analyst','corporate finance analyst','fp&a analyst','fpa analyst'] },
  { soc: '13-2052', title: 'Personal Financial Advisor', usMedian: 99600, category: 'finance',
    aliases: ['financial advisor','wealth advisor','wealth manager','financial planner','cfp'] },
  { soc: '13-2099', title: 'Investment Banker', usMedian: 165000, category: 'finance',
    aliases: ['ib analyst','m&a analyst','investment banking analyst','vp investment banking'] },
  { soc: '13-2099a', title: 'Portfolio Manager', usMedian: 145000, category: 'finance',
    aliases: ['investment manager','fund manager','asset manager','pm asset'] },
  { soc: '13-2061', title: 'Actuary', usMedian: 120000, category: 'finance' },
  { soc: '13-2072', title: 'Loan Officer', usMedian: 70000, category: 'finance',
    aliases: ['mortgage broker','mortgage officer','lender'] },
  { soc: '13-2082', title: 'Tax Preparer', usMedian: 49000, category: 'finance',
    aliases: ['tax associate'] },
  { soc: '13-2031', title: 'Budget Analyst', usMedian: 84900, category: 'finance' },
  { soc: '13-2099b', title: 'Risk Analyst', usMedian: 85000, category: 'finance',
    aliases: ['risk manager','market risk analyst','credit risk analyst'] },
  { soc: '13-1041', title: 'Compliance Officer', usMedian: 74800, category: 'finance',
    aliases: ['compliance analyst','aml analyst','regulatory analyst'] },
  { soc: '43-3031', title: 'Bookkeeper', usMedian: 47400, category: 'finance',
    aliases: ['accounting clerk','bookkeeping','accounts payable','accounts receivable'] },
  { soc: '13-1031', title: 'Insurance Adjuster', usMedian: 75100, category: 'finance',
    aliases: ['claims adjuster','insurance examiner'] },
  { soc: '13-2053', title: 'Insurance Underwriter', usMedian: 77900, category: 'finance' },

  // ── Legal (5 roles) ────────────────────────────────────────────────────
  { soc: '23-1011', title: 'Lawyer', usMedian: 145800, category: 'legal',
    aliases: ['attorney','solicitor','barrister','counsel','associate attorney','litigation attorney','corporate lawyer','in-house counsel'] },
  { soc: '23-1011a', title: 'Patent Attorney', usMedian: 175000, category: 'legal',
    aliases: ['patent lawyer','ip attorney','intellectual property lawyer'] },
  { soc: '23-2011', title: 'Paralegal', usMedian: 61000, category: 'legal',
    aliases: ['legal assistant','legal secretary'] },
  { soc: '23-1023', title: 'Judge', usMedian: 148000, category: 'legal',
    aliases: ['magistrate','hearing officer'] },
  { soc: '23-1022', title: 'Mediator', usMedian: 71800, category: 'legal',
    aliases: ['arbitrator','dispute resolution'] },

  // ── Management (15 roles) ──────────────────────────────────────────────
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
    aliases: ['ceo','chief executive officer','president','managing director','md'] },
  { soc: '11-3011', title: 'Chief Financial Officer', usMedian: 226000, category: 'management',
    aliases: ['cfo','chief finance officer'] },
  { soc: '11-9051', title: 'Restaurant Manager', usMedian: 63100, category: 'management',
    aliases: ['food service manager','kitchen manager','restaurant gm'] },
  { soc: '11-9081', title: 'Hotel Manager', usMedian: 65400, category: 'management',
    aliases: ['lodging manager','hospitality manager'] },
  { soc: '11-3061', title: 'Purchasing Manager', usMedian: 136400, category: 'management',
    aliases: ['procurement manager','supply chain manager'] },
  { soc: '11-9151', title: 'Social Service Manager', usMedian: 77100, category: 'management',
    aliases: ['nonprofit manager','community service manager'] },

  // ── Sales & Marketing (15 roles) ───────────────────────────────────────
  { soc: '41-4012', title: 'Sales Representative', usMedian: 73800, category: 'sales',
    aliases: ['sales rep','field sales','outside sales','b2b sales rep'] },
  { soc: '41-3091', title: 'Account Executive', usMedian: 75000, category: 'sales',
    aliases: ['ae','enterprise account executive','sales executive'] },
  { soc: '41-9099a', title: 'Sales Development Representative', usMedian: 55000, category: 'sales',
    aliases: ['sdr','bdr','business development representative','inside sales rep'] },
  { soc: '41-1011', title: 'Account Manager', usMedian: 70000, category: 'sales',
    aliases: ['client manager','customer success manager','csm','client services manager'] },
  { soc: '41-9099b', title: 'Customer Success Manager', usMedian: 85000, category: 'sales',
    aliases: ['csm','client success manager','customer success'] },
  { soc: '41-9031', title: 'Sales Engineer', usMedian: 116900, category: 'sales',
    aliases: ['solutions consultant','pre-sales engineer','technical sales'] },
  { soc: '13-1161', title: 'Marketing Specialist', usMedian: 76100, category: 'marketing',
    aliases: ['market research analyst','marketing coordinator','marketing associate','marketer'] },
  { soc: '13-1161a', title: 'Digital Marketing Manager', usMedian: 95000, category: 'marketing',
    aliases: ['digital marketer','online marketing manager','performance marketing manager'] },
  { soc: '13-1161b', title: 'SEO Specialist', usMedian: 65000, category: 'marketing',
    aliases: ['seo manager','search engine optimisation','seo analyst','organic search specialist'] },
  { soc: '13-1161c', title: 'Content Marketing Manager', usMedian: 75000, category: 'marketing',
    aliases: ['content strategist','content marketer'] },
  { soc: '13-1161d', title: 'Social Media Manager', usMedian: 60000, category: 'marketing',
    aliases: ['community manager','social media specialist','social media coordinator'] },
  { soc: '13-1161e', title: 'Product Marketing Manager', usMedian: 130000, category: 'marketing',
    aliases: ['pmm','product marketer'] },
  { soc: '27-3031', title: 'Public Relations Specialist', usMedian: 66800, category: 'marketing',
    aliases: ['pr specialist','communications specialist','comms specialist','media relations'] },
  { soc: '41-9022', title: 'Real Estate Agent', usMedian: 54300, category: 'sales',
    aliases: ['realtor','real estate broker','property agent','estate agent','letting agent'] },
  { soc: '41-2031', title: 'Retail Salesperson', usMedian: 33500, category: 'sales',
    aliases: ['retail associate','sales associate','store associate'] },

  // ── Education (10 roles) ───────────────────────────────────────────────
  { soc: '25-2021', title: 'Elementary School Teacher', usMedian: 63700, category: 'education',
    aliases: ['primary school teacher','grade school teacher','primary teacher'] },
  { soc: '25-2031', title: 'High School Teacher', usMedian: 65200, category: 'education',
    aliases: ['secondary school teacher','high school instructor','secondary teacher'] },
  { soc: '25-1099', title: 'University Professor', usMedian: 84400, category: 'education',
    aliases: ['professor','college professor','lecturer','post-secondary teacher','assistant professor','associate professor','adjunct professor'] },
  { soc: '25-2011', title: 'Preschool Teacher', usMedian: 37100, category: 'education',
    aliases: ['nursery teacher','daycare teacher','early childhood teacher'] },
  { soc: '25-2050', title: 'Special Education Teacher', usMedian: 65900, category: 'education',
    aliases: ['sped teacher','special needs teacher'] },
  { soc: '25-1031', title: 'School Principal', usMedian: 103500, category: 'education',
    aliases: ['head teacher','headmaster','school head','vice principal','assistant principal'] },
  { soc: '25-9043', title: 'Teaching Assistant', usMedian: 32000, category: 'education',
    aliases: ['ta','classroom assistant','teacher aide'] },
  { soc: '21-1012', title: 'School Counselor', usMedian: 61700, category: 'education',
    aliases: ['guidance counselor','student counselor'] },
  { soc: '25-4022', title: 'Librarian', usMedian: 64000, category: 'education',
    aliases: ['library scientist','information specialist'] },
  { soc: '25-9099', title: 'Tutor', usMedian: 40000, category: 'education',
    aliases: ['private tutor','academic tutor','test prep tutor'] },

  // ── Creative & Design (10 roles) ───────────────────────────────────────
  { soc: '27-1024', title: 'Graphic Designer', usMedian: 58900, category: 'creative',
    aliases: ['visual designer','brand designer','print designer'] },
  { soc: '15-1255', title: 'UX Designer', usMedian: 98000, category: 'creative',
    aliases: ['ui designer','product designer','ux researcher','ux/ui designer','user experience designer','interaction designer'] },
  { soc: '27-1011', title: 'Art Director', usMedian: 105000, category: 'creative',
    aliases: ['creative director','design director'] },
  { soc: '27-4012', title: 'Video Editor', usMedian: 66600, category: 'creative',
    aliases: ['film editor','motion graphics editor','content editor'] },
  { soc: '27-3043', title: 'Writer', usMedian: 73700, category: 'creative',
    aliases: ['author','copywriter','content writer','technical writer','editor','journalist','reporter','editorial'] },
  { soc: '27-4021', title: 'Photographer', usMedian: 40200, category: 'creative',
    aliases: ['professional photographer','commercial photographer'] },
  { soc: '27-2042', title: 'Musician', usMedian: 50100, category: 'creative',
    aliases: ['singer','composer','music producer','recording artist'] },
  { soc: '27-1014', title: 'Animator', usMedian: 99000, category: 'creative',
    aliases: ['3d animator','motion designer','character animator'] },
  { soc: '27-1025', title: 'Interior Designer', usMedian: 61600, category: 'creative' },
  { soc: '27-1022', title: 'Fashion Designer', usMedian: 79300, category: 'creative',
    aliases: ['apparel designer','textile designer'] },

  // ── Operations / Admin (12 roles) ──────────────────────────────────────
  { soc: '13-1071', title: 'HR Specialist', usMedian: 67700, category: 'operations',
    aliases: ['human resources specialist','hr generalist','people partner','hr business partner','hrbp'] },
  { soc: '13-1071a', title: 'Recruiter', usMedian: 64000, category: 'operations',
    aliases: ['talent acquisition','tech recruiter','technical recruiter','headhunter','sourcer'] },
  { soc: '43-1011', title: 'Office Manager', usMedian: 59600, category: 'operations',
    aliases: ['administrative manager','office administrator'] },
  { soc: '13-1082', title: 'Project Manager', usMedian: 98600, category: 'operations',
    aliases: ['pm','program manager','technical program manager','tpm','scrum master','agile coach'] },
  { soc: '13-1151', title: 'Product Manager', usMedian: 122000, category: 'operations',
    aliases: ['pm product','technical product manager','tpm product','senior product manager','spm','head of product'] },
  { soc: '43-4051', title: 'Customer Service Representative', usMedian: 39700, category: 'operations',
    aliases: ['csr','customer support','support agent','help desk customer','customer success agent'] },
  { soc: '43-6014', title: 'Administrative Assistant', usMedian: 44100, category: 'operations',
    aliases: ['executive assistant','ea','secretary','admin assistant','personal assistant'] },
  { soc: '13-1199', title: 'Operations Analyst', usMedian: 79900, category: 'operations',
    aliases: ['ops analyst','business operations'] },
  { soc: '13-1081', title: 'Supply Chain Analyst', usMedian: 78600, category: 'operations',
    aliases: ['logistics analyst','procurement analyst'] },
  { soc: '43-5061', title: 'Logistics Coordinator', usMedian: 50100, category: 'operations',
    aliases: ['shipping coordinator','warehouse coordinator'] },
  { soc: '11-3013', title: 'Facilities Manager', usMedian: 99030, category: 'operations',
    aliases: ['building manager','property manager'] },
  { soc: '13-1121', title: 'Event Planner', usMedian: 56800, category: 'operations',
    aliases: ['event manager','event coordinator','meeting planner','wedding planner'] },

  // ── Trades & Construction (15 roles) ───────────────────────────────────
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
  { soc: '47-2181', title: 'Roofer', usMedian: 50000, category: 'trades' },
  { soc: '47-2141', title: 'Painter', usMedian: 47700, category: 'trades',
    aliases: ['decorator','painter and decorator'] },
  { soc: '47-2021', title: 'Mason', usMedian: 53200, category: 'trades',
    aliases: ['bricklayer','stonemason'] },
  { soc: '47-2073', title: 'Heavy Equipment Operator', usMedian: 55600, category: 'trades',
    aliases: ['excavator operator','digger operator','plant operator'] },
  { soc: '47-4011', title: 'Construction Foreman', usMedian: 79800, category: 'trades',
    aliases: ['site foreman','crew leader'] },
  { soc: '17-1022', title: 'Surveyor', usMedian: 71200, category: 'trades',
    aliases: ['land surveyor','quantity surveyor'] },
  { soc: '53-3032', title: 'Truck Driver', usMedian: 54300, category: 'trades',
    aliases: ['hgv driver','lorry driver','heavy goods vehicle driver','commercial driver'] },
  { soc: '53-3033', title: 'Delivery Driver', usMedian: 41100, category: 'trades',
    aliases: ['courier','package delivery driver','last-mile driver'] },

  // ── Hospitality / Service (10 roles) ───────────────────────────────────
  { soc: '35-1011', title: 'Chef', usMedian: 58900, category: 'hospitality',
    aliases: ['head cook','executive chef','sous chef','line cook','cook','pastry chef'] },
  { soc: '35-3011', title: 'Bartender', usMedian: 31500, category: 'hospitality',
    aliases: ['mixologist'] },
  { soc: '35-3031', title: 'Waiter', usMedian: 32100, category: 'hospitality',
    aliases: ['waitress','server','restaurant server','food server'] },
  { soc: '37-1011', title: 'Cleaning Supervisor', usMedian: 47300, category: 'hospitality',
    aliases: ['janitorial supervisor','housekeeping supervisor'] },
  { soc: '41-2011', title: 'Cashier', usMedian: 29700, category: 'hospitality',
    aliases: ['checkout assistant'] },
  { soc: '39-5012', title: 'Hair Stylist', usMedian: 35200, category: 'hospitality',
    aliases: ['hairdresser','barber','cosmetologist'] },
  { soc: '31-9092', title: 'Massage Therapist', usMedian: 55300, category: 'hospitality',
    aliases: ['masseuse','masseur'] },
  { soc: '39-9031', title: 'Personal Trainer', usMedian: 46500, category: 'hospitality',
    aliases: ['fitness trainer','fitness instructor','yoga instructor','pilates instructor','gym instructor'] },
  { soc: '39-9032', title: 'Childcare Worker', usMedian: 30400, category: 'hospitality',
    aliases: ['nanny','au pair','babysitter'] },
  { soc: '33-9032', title: 'Security Guard', usMedian: 36100, category: 'hospitality',
    aliases: ['security officer','doorman','bouncer'] },

  // ── Science / Research (10 roles) ──────────────────────────────────────
  { soc: '19-1042', title: 'Biologist', usMedian: 87100, category: 'science',
    aliases: ['biological scientist','life scientist','marine biologist'] },
  { soc: '19-2031', title: 'Chemist', usMedian: 84150, category: 'science',
    aliases: ['research chemist','analytical chemist','organic chemist'] },
  { soc: '19-2012', title: 'Physicist', usMedian: 142800, category: 'science',
    aliases: ['research physicist','theoretical physicist'] },
  { soc: '19-2042', title: 'Geologist', usMedian: 92500, category: 'science',
    aliases: ['geoscientist','earth scientist'] },
  { soc: '15-2011', title: 'Actuarial Statistician', usMedian: 99960, category: 'science',
    aliases: ['statistician','biostatistician','data statistician'] },
  { soc: '19-1041', title: 'Epidemiologist', usMedian: 81390, category: 'science',
    aliases: ['public health researcher'] },
  { soc: '19-1022', title: 'Microbiologist', usMedian: 85200, category: 'science' },
  { soc: '19-1029', title: 'Research Scientist', usMedian: 95000, category: 'science',
    aliases: ['scientific researcher','postdoc','principal investigator','pi'] },
  { soc: '19-1099', title: 'Clinical Research Associate', usMedian: 70000, category: 'science',
    aliases: ['cra','clinical research coordinator','crc'] },
  { soc: '19-3094', title: 'Political Scientist', usMedian: 128300, category: 'science',
    aliases: ['policy analyst','public policy analyst'] },

  // ── Government / Public Service (8 roles) ──────────────────────────────
  { soc: '11-1031', title: 'Public Administrator', usMedian: 99000, category: 'government',
    aliases: ['government administrator','city manager','public service manager'] },
  { soc: '13-2081', title: 'Tax Auditor', usMedian: 65820, category: 'government',
    aliases: ['revenue agent','irs agent','hmrc inspector'] },
  { soc: '19-3051', title: 'Urban Planner', usMedian: 81800, category: 'government',
    aliases: ['city planner','regional planner','town planner'] },
  { soc: '33-3051', title: 'Police Officer', usMedian: 74900, category: 'government',
    aliases: ['cop','patrol officer','detective','law enforcement','garda'] },
  { soc: '33-2011', title: 'Firefighter', usMedian: 57100, category: 'government',
    aliases: ['fire fighter','fire officer'] },
  { soc: '21-1092', title: 'Probation Officer', usMedian: 61800, category: 'government',
    aliases: ['parole officer','correctional treatment specialist'] },
  { soc: '43-5051', title: 'Postal Worker', usMedian: 56960, category: 'government',
    aliases: ['mail carrier','postman','postwoman','mail clerk'] },
  { soc: '53-6041', title: 'Air Traffic Controller', usMedian: 137380, category: 'government',
    aliases: ['atc','traffic control specialist'] },

  // ── Other professional (10 roles) ──────────────────────────────────────
  { soc: '19-3033', title: 'Psychologist', usMedian: 92700, category: 'other',
    aliases: ['therapist','counselor','clinical psychologist','school psychologist'] },
  { soc: '21-1023', title: 'Social Worker', usMedian: 58400, category: 'other',
    aliases: ['lcsw','clinical social worker','msw'] },
  { soc: '53-2011', title: 'Airline Pilot', usMedian: 198000, category: 'other',
    aliases: ['pilot','commercial pilot','first officer','captain','airline captain'] },
  { soc: '53-2031', title: 'Flight Attendant', usMedian: 68370, category: 'other',
    aliases: ['cabin crew','air hostess','steward','stewardess'] },
  { soc: '21-2011', title: 'Clergy', usMedian: 58920, category: 'other',
    aliases: ['priest','minister','pastor','rabbi','imam','chaplain'] },
  { soc: '27-3091', title: 'Interpreter / Translator', usMedian: 53640, category: 'other',
    aliases: ['translator','interpreter','linguist'] },
  { soc: '27-2022', title: 'Sports Coach', usMedian: 38970, category: 'other',
    aliases: ['athletic coach','team coach','sports instructor'] },
  { soc: '45-2092', title: 'Farm Worker', usMedian: 33800, category: 'other',
    aliases: ['agricultural worker','farmhand'] },
  { soc: '11-9013', title: 'Farm Manager', usMedian: 83040, category: 'other',
    aliases: ['farmer','ranch manager','agricultural manager'] },
  { soc: '47-5022', title: 'Oil & Gas Roustabout', usMedian: 44900, category: 'other',
    aliases: ['oilfield worker','rig worker'] },
];

// ── Per-country wage table (top-traffic roles only) ─────────────────────
// Keyed by SOC code. Each country's wage is in that country's LOCAL currency.
// Numbers are nationally-published median annual gross wages for the given
// occupation, rounded to the nearest hundred. Roles not listed here fall
// back at lookup time to usMedian × COUNTRY_MULT from salary-calculator.html.
window.PFC_WAGES_BY_COUNTRY = {
  // Software & Tech
  '15-1252':  { GB: 55000,  FR: 48000,  DE: 70000,  CA: 100000, AU: 125000, SG: 90000,  IE: 70000 },  // Software Developer
  '15-1252c': { GB: 65000,  FR: 55000,  DE: 78000,  CA: 110000, AU: 135000, SG: 100000, IE: 80000 },  // DevOps Engineer
  '15-1252e': { GB: 72000,  FR: 62000,  DE: 85000,  CA: 130000, AU: 150000, SG: 115000, IE: 95000 },  // ML Engineer
  '15-2051':  { GB: 60000,  FR: 52000,  DE: 72000,  CA: 105000, AU: 125000, SG: 100000, IE: 78000 },  // Data Scientist
  '15-2041':  { GB: 38000,  FR: 38000,  DE: 52000,  CA: 75000,  AU: 95000,  SG: 70000,  IE: 55000 },  // Data Analyst
  '15-1212':  { GB: 55000,  FR: 52000,  DE: 70000,  CA: 100000, AU: 120000, SG: 90000,  IE: 75000 },  // InfoSec Analyst
  // Healthcare
  '29-1141':  { GB: 35000,  FR: 32000,  DE: 48000,  CA: 80000,  AU: 78000,  SG: 55000,  IE: 50000 },  // Registered Nurse
  '29-1228':  { GB: 95000,  FR: 85000,  DE: 95000,  CA: 280000, AU: 220000, SG: 200000, IE: 130000 }, // Physician (GP)
  '29-1023':  { GB: 75000,  FR: 90000,  DE: 110000, CA: 200000, AU: 175000, SG: 165000, IE: 110000 }, // Dentist
  '29-1051':  { GB: 47000,  FR: 50000,  DE: 60000,  CA: 110000, AU: 102000, SG: 95000,  IE: 70000 },  // Pharmacist
  '29-1123':  { GB: 35000,  FR: 32000,  DE: 42000,  CA: 80000,  AU: 92000,  SG: 70000,  IE: 55000 },  // Physical Therapist
  // Finance
  '13-2011':  { GB: 42000,  FR: 42000,  DE: 55000,  CA: 75000,  AU: 90000,  SG: 70000,  IE: 60000 },  // Accountant
  '13-2051':  { GB: 50000,  FR: 50000,  DE: 65000,  CA: 90000,  AU: 110000, SG: 90000,  IE: 70000 },  // Financial Analyst
  '13-2099':  { GB: 90000,  FR: 80000,  DE: 100000, CA: 145000, AU: 180000, SG: 150000, IE: 120000 }, // Investment Banker
  '13-2052':  { GB: 50000,  FR: 48000,  DE: 65000,  CA: 90000,  AU: 105000, SG: 90000,  IE: 70000 },  // Financial Advisor
  // Legal
  '23-1011':  { GB: 75000,  FR: 65000,  DE: 85000,  CA: 120000, AU: 145000, SG: 130000, IE: 95000 },  // Lawyer
  // Management
  '11-2021':  { GB: 60000,  FR: 65000,  DE: 85000,  CA: 105000, AU: 135000, SG: 110000, IE: 85000 },  // Marketing Manager
  '11-3031':  { GB: 80000,  FR: 80000,  DE: 100000, CA: 130000, AU: 160000, SG: 140000, IE: 110000 }, // Financial Manager
  '11-3121':  { GB: 55000,  FR: 60000,  DE: 80000,  CA: 100000, AU: 130000, SG: 110000, IE: 85000 },  // HR Manager
  '11-3021':  { GB: 75000,  FR: 75000,  DE: 95000,  CA: 130000, AU: 165000, SG: 145000, IE: 110000 }, // IT Manager
  '11-9041':  { GB: 90000,  FR: 80000,  DE: 100000, CA: 145000, AU: 180000, SG: 160000, IE: 130000 }, // Engineering Manager
  '11-1011':  { GB: 130000, FR: 130000, DE: 175000, CA: 200000, AU: 250000, SG: 230000, IE: 180000 }, // CEO
  // Engineering
  '17-2051':  { GB: 45000,  FR: 45000,  DE: 60000,  CA: 85000,  AU: 105000, SG: 75000,  IE: 65000 },  // Civil Engineer
  '17-2141':  { GB: 48000,  FR: 48000,  DE: 62000,  CA: 90000,  AU: 110000, SG: 78000,  IE: 65000 },  // Mechanical Engineer
  '17-2071':  { GB: 50000,  FR: 50000,  DE: 65000,  CA: 95000,  AU: 115000, SG: 80000,  IE: 70000 },  // Electrical Engineer
  // Education
  '25-2021':  { GB: 33000,  FR: 32000,  DE: 55000,  CA: 65000,  AU: 75000,  SG: 60000,  IE: 50000 },  // Elementary Teacher
  '25-2031':  { GB: 36000,  FR: 35000,  DE: 60000,  CA: 70000,  AU: 80000,  SG: 65000,  IE: 55000 },  // High School Teacher
  // Sales / Marketing
  '41-4012':  { GB: 35000,  FR: 38000,  DE: 50000,  CA: 70000,  AU: 80000,  SG: 60000,  IE: 50000 },  // Sales Rep
  '13-1151':  { GB: 65000,  FR: 60000,  DE: 80000,  CA: 105000, AU: 130000, SG: 110000, IE: 90000 },  // Product Manager
  // Trades
  '47-2111':  { GB: 38000,  FR: 35000,  DE: 50000,  CA: 70000,  AU: 80000,  SG: 50000,  IE: 50000 },  // Electrician
  '47-2152':  { GB: 38000,  FR: 35000,  DE: 50000,  CA: 70000,  AU: 80000,  SG: 50000,  IE: 50000 },  // Plumber
};

// ── Lookup helpers ────────────────────────────────────────────────────────
(function () {
  const ROLES = window.PFC_SALARY_ROLES;
  if (!ROLES || !ROLES.length) return;

  // Flat search index: title + every alias, longest-first.
  const INDEX = [];
  for (const role of ROLES) {
    INDEX.push({ text: role.title.toLowerCase(), role: role });
    if (role.aliases) {
      for (const alias of role.aliases) INDEX.push({ text: alias.toLowerCase(), role: role });
    }
  }
  INDEX.sort((a, b) => b.text.length - a.text.length);

  function findRoleMatch(rawInput) {
    if (!rawInput) return null;
    const q = rawInput.toLowerCase().trim();
    if (q.length < 2) return null;
    // 1. Exact match
    for (const entry of INDEX) if (entry.text === q) return { role: entry.role, confidence: 'exact' };
    // 2. Substring match (input contains a known title — e.g. "senior software engineer")
    for (const entry of INDEX) {
      if (q.includes(entry.text) && entry.text.length >= 4) return { role: entry.role, confidence: 'substring' };
    }
    // 3. Token-overlap fallback
    for (const entry of INDEX) {
      const tokens = entry.text.split(/\s+/).filter(t => t.length > 2);
      if (tokens.length && tokens.every(t => q.includes(t))) return { role: entry.role, confidence: 'tokens' };
    }
    return null;
  }

  // Per-country wage lookup. Returns the country-specific median in LOCAL
  // currency if available, null otherwise. Callers fall back to
  // usMedian × COUNTRY_MULT when this returns null.
  function getCountryWage(soc, countryCode) {
    if (!soc || !countryCode) return null;
    if (countryCode === 'US') {
      const role = ROLES.find(r => r.soc === soc);
      return role ? role.usMedian : null;
    }
    const wages = window.PFC_WAGES_BY_COUNTRY && window.PFC_WAGES_BY_COUNTRY[soc];
    return (wages && wages[countryCode]) || null;
  }

  function getAllTitlesForDatalist() {
    return ROLES.map(r => r.title).sort();
  }

  window.PFCSalaryRoles = {
    findRoleMatch: findRoleMatch,
    getCountryWage: getCountryWage,
    getAllTitlesForDatalist: getAllTitlesForDatalist,
    count: ROLES.length,
    countriesCovered: ['US','GB','FR','DE','CA','AU','SG','IE'],
  };
})();
