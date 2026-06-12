// db/ai_catalog.js — master list of AI solutions we can offer
// Used by the seed script to populate the catalog, and by the matching engine
// to suggest relevant solutions to a new client based on industry tags.

module.exports = [
  // ---- Document & Content ----
  { name: 'AI Document Intelligence', category: 'Document AI',
    description: 'Extract, classify, and Q&A over PDFs, contracts, CIMs, financial statements.',
    est_value: 'ZAR 60k setup + ZAR 5k/mo',
    industries: ['Finance', 'Banking', 'Legal', 'Accounting', 'Corporate Finance', 'Real Estate', 'Architecture', 'Engineering', 'Insurance'] },
  { name: 'AI Report Drafter', category: 'Document AI',
    description: 'Auto-draft professional reports from raw data/notes (pen-test, audit, progress, radiology).',
    est_value: 'ZAR 60k setup + ZAR 2k/mo',
    industries: ['Cybersecurity', 'Accounting', 'Engineering', 'Construction', 'Healthcare', 'Telecommunications'] },
  { name: 'AI Proposal & Bid Writer', category: 'Document AI',
    description: 'Generate tender responses, BOQs, technical proposals from past wins + brief.',
    est_value: 'ZAR 80k setup + ZAR 5k/mo',
    industries: ['Construction', 'Engineering', 'Architecture', 'IT Services'] },

  // ---- Conversational AI ----
  { name: 'AI Customer Support Bot', category: 'Conversational AI',
    description: '24/7 multilingual WhatsApp/web chatbot trained on your own knowledge base.',
    est_value: 'ZAR 18k setup + ZAR 1.5k/mo',
    industries: ['Banking', 'Telecommunications', 'Financial Advisory', 'Real Estate', 'Insurance', 'Healthcare', 'Retail'] },
  { name: 'Internal Knowledge Copilot', category: 'Conversational AI',
    description: 'Private RAG chatbot for your team: policies, contracts, SOPs, runbooks.',
    est_value: 'ZAR 70k setup + ZAR 4k/mo',
    industries: ['IT Services', 'HR Services', 'Accounting', 'Legal', 'Cybersecurity', 'Engineering'] },
  { name: 'AI Sales / Lead-Qual Bot', category: 'Conversational AI',
    description: 'Capture, qualify, and book leads from web/WhatsApp automatically.',
    est_value: 'ZAR 20k setup + ZAR 1.5k/mo',
    industries: ['Real Estate', 'Financial Advisory', 'Insurance', 'Professional Services'] },

  // ---- Vision ----
  { name: 'Computer Vision Inspection', category: 'Vision AI',
    description: 'Defect detection, PPE compliance, site progress from photos & video.',
    est_value: 'ZAR 70k pilot + ZAR 4k/mo',
    industries: ['Construction', 'Engineering', 'Manufacturing', 'Healthcare', 'Architecture'] },
  { name: 'Medical Imaging AI', category: 'Vision AI',
    description: 'Triage, second-read, and report-drafting for X-ray/CT/MRI and cathlab imaging.',
    est_value: 'ZAR 150k pilot + ZAR 12k/mo',
    industries: ['Healthcare', 'Radiology'] },
  { name: 'AI Photo Enhancement & Curation', category: 'Vision AI',
    description: 'Auto-tag, cull, enhance, and caption photo libraries for delivery & social.',
    est_value: 'ZAR 25k setup + ZAR 1.5k/mo',
    industries: ['Photography', 'Media', 'Real Estate', 'E-commerce', 'Events'] },

  // ---- Analytics & Prediction ----
  { name: 'Predictive Risk Scoring', category: 'Predictive AI',
    description: 'Credit, fraud, churn, and underwrite risk models on your own data.',
    est_value: 'ZAR 80k pilot',
    industries: ['Banking', 'Insurance', 'Telecommunications', 'Financial Advisory'] },
  { name: 'Revenue Assurance AI', category: 'Predictive AI',
    description: 'Detect revenue leakage, billing anomalies, and assurance gaps at scale.',
    est_value: 'ZAR 250k pilot + ZAR 25k/mo',
    industries: ['Telecommunications', 'Banking', 'Insurance', 'Utilities'] },
  { name: 'Forecasting & Scenario Modelling', category: 'Predictive AI',
    description: 'Cash-flow, demand, project-cost, and macro-scenario forecasts.',
    est_value: 'ZAR 50k pilot',
    industries: ['Finance', 'Retail', 'Construction', 'Energy', 'Accounting'] },

  // ---- Process Automation ----
  { name: 'Process / Workflow Automation', category: 'Automation',
    description: 'RPA + LLM agents to automate repetitive back-office workflows end-to-end.',
    est_value: 'ZAR 120k setup + ZAR 8k/mo',
    industries: ['Banking', 'Telecommunications', 'Insurance', 'HR Services', 'Accounting', 'Real Estate'] },
  { name: 'AI Vulnerability Triage', category: 'Automation',
    description: 'Triage pentest/SAST findings, draft reports, and propose fixes.',
    est_value: 'ZAR 80k setup + ZAR 6k/mo',
    industries: ['Cybersecurity', 'Banking', 'IT Services', 'Telecommunications'] },
  { name: 'Compliance & Control Testing', category: 'Automation',
    description: 'Auto-test controls, flag exceptions, generate compliance evidence.',
    est_value: 'ZAR 100k setup + ZAR 6k/mo',
    industries: ['Banking', 'Telecommunications', 'Insurance', 'Healthcare'] },

  // ---- Creative & Marketing ----
  { name: 'AI Marketing Content Engine', category: 'Creative AI',
    description: 'Generate social posts, ad copy, product descriptions, email sequences at scale.',
    est_value: 'ZAR 30k setup + ZAR 2k/mo',
    industries: ['Marketing', 'Retail', 'Real Estate', 'Fashion', 'Media', 'E-commerce'] },
  { name: 'AI Design Assistant', category: 'Creative AI',
    description: 'Moodboards, renders, fashion sketches, layout variants from a brief.',
    est_value: 'ZAR 35k setup + ZAR 2k/mo',
    industries: ['Fashion', 'Architecture', 'Interior Design', 'Marketing', 'Media'] },
  { name: 'AI Brand & Onboarding Assistant', category: 'Creative AI',
    description: 'Brand-consistent client onboarding, intake forms, and welcome flows.',
    est_value: 'ZAR 30k setup',
    industries: ['Creative Agencies', 'IT Services', 'Professional Services'] },

  // ---- DevOps / Engineering ----
  { name: 'AI Code Review & DevOps Copilot', category: 'Engineering AI',
    description: 'PR review, infra-cost optimization, runbook automation, on-call copilot.',
    est_value: 'ZAR 50k setup + ZAR 5k/mo',
    industries: ['IT Services', 'Banking', 'Insurance', 'Software Development'] },
  { name: 'AIOps / Log Intelligence', category: 'Engineering AI',
    description: 'Cluster incidents, predict outages, summarize logs, suggest fixes.',
    est_value: 'ZAR 90k pilot',
    industries: ['IT Services', 'Telecommunications', 'Banking', 'SaaS'] },

  // ---- People / HR ----
  { name: 'AI Recruitment & HR Assistant', category: 'HR AI',
    description: 'CV screening, interview summaries, employee query automation, policy drafting.',
    est_value: 'ZAR 35k setup + ZAR 2k/mo',
    industries: ['HR Services', 'All sectors'] },
];
