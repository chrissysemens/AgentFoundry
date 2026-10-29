import { validateReviewContract } from './contracts.ts';
import { createHash } from 'node:crypto';
export const digest = (content: string) =>
  createHash('sha256').update(content).digest('hex');
export class WorkflowError extends Error {}
export function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new WorkflowError(message);
}
export type Payload = Record<string, unknown>;
export type Event = {
  event_id: string;
  ticket_id: string;
  event_type: string;
  actor: string;
  timestamp: string;
  payload: Payload;
};
export type Finding = {
  id: string;
  category: 'sip' | 'standard' | 'check' | 'advisory';
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;
  evidence: string;
  resolution: string;
  rule_ref?: string;
};
export type Review = {
  schema_version: '1';
  review_id: string;
  implementation_id: string;
  sip_revision: string;
  sip_sha256: string;
  code_revision: string;
  reviewer: string;
  scope: 'INITIAL_FULL' | 'INCREMENTAL' | 'JUSTIFIED_FULL';
  verdict: 'ACCEPT' | 'REJECT' | 'INCONCLUSIVE';
  timestamp: string;
  findings: Finding[];
  automated_check_refs: string[];
  checks_passed: boolean;
  escalation_reason?: string;
  scope_reason?: string;
  changed_files?: string[];
  outstanding_findings?: string[];
  affected_paths?: string[];
  regression_checks?: string[];
  usage?: { input_tokens?: number; output_tokens?: number };
};
export type State = {
  ticket_id: string;
  status: string;
  title: string;
  sip_revision?: string;
  sip_sha256?: string;
  approved_revision?: string;
  approved_sha256?: string;
  implementation_id?: string;
  code_revision?: string;
  repair_count: number;
  pending_repair: boolean;
  accepted_revision?: string;
  last_review_id?: string;
  escalation_reason?: string;
  proposals: Record<
    string,
    { description: string; status: 'PROPOSED' | 'APPROVED_FOR_BACKLOG' }
  >;
  history: Event[];
};
const nonempty = (x: unknown): x is string =>
  typeof x === 'string' && x.trim().length > 0;
const mandatory = new Set(['sip', 'standard', 'check']);
export function validateReview(
  value: unknown,
  expected: Pick<
    Review,
    'implementation_id' | 'sip_revision' | 'sip_sha256' | 'code_revision'
  >,
  repairs: number,
): asserts value is Review {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'Review must be object',
  );
  validateReviewContract(value);

  const r = value as Record<string, unknown>;
  for (const k of [
    'review_id',
    'implementation_id',
    'sip_revision',
    'sip_sha256',
    'code_revision',
    'reviewer',
    'scope',
    'verdict',
    'timestamp',
  ])
    assert(nonempty(r[k]), `Missing review field: ${k}`);
  for (const k of [
    'implementation_id',
    'sip_revision',
    'sip_sha256',
    'code_revision',
  ] as const)
    assert(r[k] === expected[k], `Stale review: ${k}`);

  assert((r.reviewer as string).startsWith('oracle:'), 'Oracle reviewer required');

  assert(
    ['ACCEPT', 'REJECT', 'INCONCLUSIVE'].includes(r.verdict as string),
    'Invalid verdict',
  );

  assert(
    ['INITIAL_FULL', 'INCREMENTAL', 'JUSTIFIED_FULL'].includes(r.scope as string),
    'Invalid scope',
  );

  assert(
    r.scope !== 'INITIAL_FULL' || repairs === 0,
    'Initial scope only for original submission',
  );
  assert(r.scope !== 'INCREMENTAL' || repairs > 0, 'Incremental scope requires repair');
  if (r.scope === 'INCREMENTAL') {
    for (const k of [
      'changed_files',
      'outstanding_findings',
      'affected_paths',
      'regression_checks',
    ])
      assert(Array.isArray(r[k]), `Incremental review missing ${k}`);
    assert((r.regression_checks as unknown[]).length > 0, 'Regression checks required');
  }
  if (r.scope === 'JUSTIFIED_FULL')
    assert(nonempty(r.scope_reason), 'Full review requires justification');
  assert(Array.isArray(r.findings), 'Findings must be an array');
  let blocking = 0;
  for (const f of r.findings as Record<string, unknown>[]) {
    assert(
      f !== null && typeof f === 'object' && !Array.isArray(f),
      'Finding must be object',
    );
    for (const k of ['id', 'category', 'severity', 'location', 'evidence', 'resolution'])
      assert(nonempty(f[k]), `Finding missing ${k}`);
    assert(
      ['low', 'medium', 'high', 'critical'].includes(f.severity as string),
      'Invalid severity',
    );
    assert([...mandatory, 'advisory'].includes(f.category as string), 'Invalid category');
    if (mandatory.has(f.category as string)) {
      assert(nonempty(f.rule_ref), 'Mandatory finding needs rule reference');
      blocking++;
    }
  }
  assert(
    Array.isArray(r.automated_check_refs) &&
      r.automated_check_refs.length > 0 &&
      r.automated_check_refs.every(nonempty) &&
      new Set(r.automated_check_refs).size === r.automated_check_refs.length,
    'Automated check references required',
  );
  assert(typeof r.checks_passed === 'boolean', 'checks_passed required');
  if (r.verdict === 'REJECT')
    assert(blocking > 0, 'Reject requires evidenced mandatory finding');
  if (r.verdict === 'ACCEPT') {
    assert(blocking === 0, 'Cannot accept blocking findings');
    assert(r.checks_passed, 'Required checks must pass');
  }
  if (r.verdict === 'INCONCLUSIVE')
    assert(nonempty(r.escalation_reason), 'Inconclusive requires escalation reason');
}
export type OracleRequest = {
  implementation_id: string;
  sip_revision: string;
  sip_sha256: string;
  code_revision: string;
  diff: string;
  standards: string[];
  checks: { name: string; passed: boolean }[];
  previous_findings: Finding[];
};
export interface OraclePort {
  review(request: OracleRequest): Promise<Review>;
}
export class FakeOracle implements OraclePort {
  private readonly responses: Review[];
  constructor(responses: Review[]) {
    this.responses = responses;
  }
  async review(_request: OracleRequest): Promise<Review> {
    const next = this.responses.shift();
    assert(next, 'No scripted Oracle response');
    return next;
  }
}
export function reduceEvents(ticket_id: string, events: Event[]): State {
  const s: State = {
    ticket_id,
    status: 'MISSING',
    title: '',
    repair_count: 0,
    pending_repair: false,
    proposals: {},
    history: [],
  };
  const seen = new Set<string>();
  for (const e of events) {
    assert(e.ticket_id === ticket_id, 'Mixed ticket histories');
    const p = e.payload;
    const human = e.actor.startsWith('human:');
    const oracle = e.actor.startsWith('oracle:');
    switch (e.event_type) {
      case 'TICKET_CREATED':
        assert(s.status === 'MISSING', 'Already created');
        assert(nonempty(p.title), 'Title required');
        s.title = p.title;
        s.status = 'DRAFT';
        break;
      case 'GRILL_STARTED':
        assert(['DRAFT', 'GRILLING'].includes(s.status), 'Cannot grill');
        s.status = 'GRILLING';
        break;
      case 'SIP_PROPOSED':
        assert(
          ['GRILLING', 'AWAITING_APPROVAL', 'APPROVED', 'ESCALATED'].includes(s.status),
          'Cannot propose SIP',
        );
        assert(nonempty(p.revision) && nonempty(p.sha256), 'SIP identity required');
        assert(
          p.revision !== s.sip_revision || p.sha256 === s.sip_sha256,
          'Revision reused with changed content',
        );
        if (s.implementation_id) {
          assert(s.status === 'ESCALATED', 'Cannot replan active work');
          assert(p.revision !== s.sip_revision, 'New SIP revision required');
        }
        s.sip_revision = p.revision;
        s.sip_sha256 = p.sha256;
        s.approved_revision = undefined;
        s.approved_sha256 = undefined;
        s.implementation_id = undefined;
        s.code_revision = undefined;
        s.accepted_revision = undefined;
        s.repair_count = 0;
        s.pending_repair = false;
        s.status = 'AWAITING_APPROVAL';
        break;
      case 'SIP_APPROVED':
        assert(s.status === 'AWAITING_APPROVAL', 'Not awaiting approval');
        assert(human, 'Human approval required');
        assert(
          p.revision === s.sip_revision && p.sha256 === s.sip_sha256,
          'Stale SIP approval',
        );
        s.approved_revision = s.sip_revision;
        s.approved_sha256 = s.sip_sha256;
        s.status = 'APPROVED';
        break;
      case 'IMPLEMENTATION_STARTED':
        assert(s.status === 'APPROVED', 'SIP approval required');
        assert(
          p.revision === s.approved_revision && p.sha256 === s.approved_sha256,
          'SIP mismatch',
        );
        assert(nonempty(p.implementation_id), 'Implementation ID required');
        s.implementation_id = p.implementation_id;
        s.status = 'IMPLEMENTING';
        break;
      case 'CODE_SUBMITTED':
        assert(s.status === 'IMPLEMENTING', 'Implementation not ready');
        assert(
          p.implementation_id === s.implementation_id && nonempty(p.code_revision),
          'Code submission mismatch',
        );
        s.code_revision = p.code_revision;
        s.accepted_revision = undefined;
        s.status = 'REVIEW_PENDING';
        break;
      case 'REPAIR_STARTED':
        assert(s.status === 'REWORK', 'No repair authorized');
        assert(s.repair_count < 3, 'Repair budget exhausted');
        assert(
          p.implementation_id === s.implementation_id,
          'Implementation identity mismatch',
        );
        s.pending_repair = true;
        s.status = 'REPAIRING';
        break;
      case 'REPAIR_SUBMITTED':
        assert(s.status === 'REPAIRING' && s.pending_repair, 'No repair in progress');
        assert(
          p.implementation_id === s.implementation_id,
          'Implementation identity mismatch',
        );
        assert(
          nonempty(p.code_revision) && p.code_revision !== s.code_revision,
          'New code revision required',
        );
        s.repair_count++;
        assert(s.repair_count <= 3, 'Repair budget exhausted');
        s.code_revision = p.code_revision;
        s.pending_repair = false;
        s.accepted_revision = undefined;
        s.status = 'REVIEW_PENDING';
        break;
      case 'ORACLE_REVIEWED': {
        assert(s.status === 'REVIEW_PENDING', 'No review pending');
        assert(oracle, 'Oracle actor required');
        validateReview(
          p.review,
          {
            implementation_id: s.implementation_id!,
            sip_revision: s.approved_revision!,
            sip_sha256: s.approved_sha256!,
            code_revision: s.code_revision!,
          },
          s.repair_count,
        );
        const r = p.review as Review;
        assert(r.reviewer === e.actor, 'Reviewer mismatch');
        assert(!seen.has(r.review_id), 'Duplicate review ID');
        seen.add(r.review_id);
        s.last_review_id = r.review_id;
        if (r.verdict === 'ACCEPT') {
          s.accepted_revision = s.code_revision;
          s.status = 'ACCEPTED';
        } else if (r.verdict === 'INCONCLUSIVE') {
          s.status = 'ESCALATED';
          s.escalation_reason = r.escalation_reason;
        } else {
          s.status = s.repair_count >= 3 ? 'ESCALATED' : 'REWORK';
          if (s.status === 'ESCALATED') s.escalation_reason = 'Three rejected repairs';
        }
        break;
      }
      case 'ESCALATED':
        assert(
          ['IMPLEMENTING', 'REPAIRING', 'REWORK', 'REVIEW_PENDING'].includes(s.status),
          'Cannot escalate',
        );
        assert(
          ['DEFECTIVE_SIP', 'REDESIGN', 'POLICY_FAILURE', 'PROVIDER_FAILURE'].includes(
            p.reason as string,
          ),
          'Invalid escalation reason',
        );
        s.escalation_reason = p.reason as string;
        s.status = 'ESCALATED';
        break;
      case 'ADVISORY_PROPOSED':
        assert(s.status !== 'MISSING' && oracle, 'Oracle proposal required');
        assert(
          nonempty(p.fingerprint) && nonempty(p.description),
          'Proposal identity required',
        );

        assert(!s.proposals[p.fingerprint], 'Duplicate proposal');

        s.proposals[p.fingerprint] = { description: p.description, status: 'PROPOSED' };
        break;
      case 'ADVISORY_APPROVED': {
        assert(human, 'Human approval required');
        assert(nonempty(p.fingerprint), 'Proposal identity required');

        const proposal = s.proposals[p.fingerprint];
        assert(
          proposal && proposal.status === 'PROPOSED',
          'Unknown or approved proposal',
        );

        proposal.status = 'APPROVED_FOR_BACKLOG';

        break;
      }
      case 'MERGE_AUTHORIZED':
        assert(
          s.status === 'ACCEPTED' && human,
          'Human authorization and Oracle acceptance required',
        );
        assert(
          p.implementation_id === s.implementation_id &&
            p.code_revision === s.accepted_revision &&
            p.review_id === s.last_review_id,
          'Stale merge authorization',
        );
        s.status = 'MERGE_AUTHORIZED';
        break;
      case 'COMPLETED':
        assert(
          s.status === 'MERGE_AUTHORIZED' && human,
          'Human completion authorization required',
        );
        s.status = 'COMPLETE';
        break;
      default:
        throw new WorkflowError(`Unknown event ${e.event_type}`);
    }
    s.history.push(e);
  }
  return s;
}
