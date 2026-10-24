import { describe, expect, it } from 'vitest';
import {
  canTransitionConnection,
  canTransitionWorkflow,
  listWorkflowMoves,
  workflowTransitionBlockReason,
} from '../src/utils/statusMachines.js';

describe('canTransitionWorkflow', () => {
  it('allows forward one step', () => {
    expect(canTransitionWorkflow('Open', 'In-Progress')).toBe(true);
    expect(canTransitionWorkflow('In-Progress', 'Field Visit')).toBe(true);
    expect(canTransitionWorkflow('Field Visit', 'Resolved')).toBe(true);
  });

  it('disallows skip and leaving resolved', () => {
    expect(canTransitionWorkflow('Open', 'Resolved')).toBe(false);
    expect(canTransitionWorkflow('Resolved', 'Field Visit')).toBe(false);
  });

  it('allows backward only when opted in', () => {
    expect(canTransitionWorkflow('In-Progress', 'Open')).toBe(false);
    expect(canTransitionWorkflow('In-Progress', 'Open', { allowBackward: true })).toBe(true);
  });
});

describe('canTransitionConnection', () => {
  it('allows valid connection transitions', () => {
    expect(canTransitionConnection('Pending', 'Active')).toBe(true);
    expect(canTransitionConnection('Active', 'Suspended')).toBe(true);
    expect(canTransitionConnection('Terminated', 'Active')).toBe(false);
  });
});

describe('listWorkflowMoves', () => {
  it('labels forward step and blocks skip with reason', () => {
    const moves = listWorkflowMoves('Open', { allowBackward: false, unresolvedTaskCount: 0 });
    const start = moves.find((m) => m.to === 'In-Progress');
    const skip = moves.find((m) => m.to === 'Resolved');
    expect(start.allowed).toBe(true);
    expect(start.label).toBe('Start working');
    expect(skip.allowed).toBe(false);
    expect(skip.reason).toMatch(/one step/i);
  });

  it('blocks resolve when sub-tasks open', () => {
    expect(
      workflowTransitionBlockReason('Field Visit', 'Resolved', { unresolvedTaskCount: 2 })
    ).toMatch(/2 open sub-task/);
  });
});
