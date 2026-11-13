import type { CampusServicesApi } from '../shared/campus-services';
import { invoke } from './lib';

export const campusServices = {
  open: (service) => invoke('campus-services:open', service),
  attendance: (year, month) => invoke('campus-services:attendance', year, month),
  attendanceStatus: () => invoke('campus-services:attendance-status'),
  attendanceAutomation: () => invoke('campus-services:attendance-automation'),
  configureAttendance: (config) => invoke('campus-services:configure-attendance', config),
  signAttendance: (position) => invoke('campus-services:sign-attendance', position),
  networkState: () => invoke('campus-services:network-state'),
  configureNetwork: (config) => invoke('campus-services:configure-network', config),
  connectNetwork: () => invoke('campus-services:connect-network'),
  copyCommunityLink: () => invoke('campus-services:community'),
  enrollment: () => invoke('campus-services:enrollment'),
  scheduleEnrollment: (ids, runAt) => invoke('campus-services:schedule-enrollment', ids, runAt),
  stopEnrollment: () => invoke('campus-services:stop-enrollment'),
} satisfies CampusServicesApi;
