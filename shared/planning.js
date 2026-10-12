// Pure suggestions: never create, complete, or reschedule work.
export function dailyPriority(state, day) {
  const candidates = [];
  function collect(tasks, mission) {
    if (mission?.status === 'PARKED') return;
    for (const task of tasks || []) {
      if (task.done || !task.text?.trim()) continue;
      const deadline = /^\d{4}-\d{2}-\d{2}$/.test(task.deadline || '') ? task.deadline : '';
      const due = deadline && deadline <= day;
      if (!due && !task.today && (task.when || task.whenAt || '').slice(0, 10) > day) continue;
      const rank = due ? 0 : task.today ? 1 : mission?.status === 'LIVE' ? 2 : 3;
      candidates.push({ taskId: task.id, missionId: mission?.id || null, text: task.text,
        project: mission?.name || 'Inbox', rank, deadline, order: task.order || 0,
        reason: due ? `Deadline ${deadline}` : task.today ? 'You marked this for Today' : mission?.status === 'LIVE' ? 'Open task in a LIVE project' : 'Next available task' });
    }
  }
  collect(state.inbox);
  for (const mission of state.missions || []) collect(mission.tasks, mission);
  candidates.sort((a, b) => a.rank - b.rank || (a.rank === 0 ? a.deadline.localeCompare(b.deadline) : 0) || a.order - b.order);
  return candidates[0] || null;
}

export const handoverFields = {
  completed: 'Completed / attempted', evidence: 'Verification evidence',
  next: 'Next action', blocked: 'Blocked', resume: 'Resume context'
};

export function resumeText(mission) {
  const h = mission.handover || {};
  return [mission.name, 'Project handover — self-reported; evidence is not independently checked.',
    ...Object.entries(handoverFields).map(([key, label]) => `${label}: ${h[key] || 'Not recorded'}`)
  ].join('\n');
}
