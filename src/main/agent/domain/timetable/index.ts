import type { AgentTool } from '../shared';
import { createEventTool } from './create-event';
import { deleteEventTool } from './delete-event';
import { queryScheduleTool } from './query-schedule';
import { queryExamsTool, queryGradesTool } from './academic-records';

export const timetableTools = {
  query_grades: queryGradesTool,
  query_exams: queryExamsTool,
  query_schedule: queryScheduleTool,
  create_event: createEventTool,
  delete_event: deleteEventTool,
} satisfies Record<string, AgentTool>;
