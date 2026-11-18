export interface UpworkJobInput {
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  connectsRequired?: number;
  clientPaymentVerified?: boolean | null;
  clientHireRate?: number | null;
  clientTotalSpent?: number | null;
  clientAvgHourlyRate?: number | null;
  proposalsCount?: number | null;
  questions?: string[];
  budget?: string;
}

export interface UpworkRoiResult {
  roiScore: number;
  recommendation: 'apply_now' | 'worth_it' | 'caution' | 'skip';
  badgeTextRu: string;
  verdictRu: string;
  connectsRequired: number;
  connectsCostUsd: number;
  redFlags: string[];
  greenFlags: string[];
}

export interface UpworkPreviewAnalysis {
  first200Chars: string;
  after200Chars: string;
  charCount: number;
  hasFluffOpening: boolean;
  hasLinkInPreview: boolean;
  hasQuestion: boolean;
  previewScore: number;
  warnings: string[];
}

export interface UpworkProposalBundle {
  coverLetter: string;
  portfolioUrl: string;
  portfolioLabel: string;
  screeningAnswers: Array<{ question: string; answer: string }>;
  loomScript: string;
  previewAnalysis: UpworkPreviewAnalysis;
}

export function calculateConnectsRoi(job?: UpworkJobInput): UpworkRoiResult;
export function analyzeUpworkPreviewHook(proposalText?: string): UpworkPreviewAnalysis;
export function generateUpworkProposal(
  job?: UpworkJobInput,
  profile?: { name?: string; portfolioUrl?: string }
): UpworkProposalBundle;
export function parseUpworkPastedText(rawText?: string): UpworkJobInput;
