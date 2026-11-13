export type CampusService = 'attendance' | 'enrollment';

export interface AttendanceRecords {
  year: number;
  month: number;
  fetchedAt: string;
  inDays: number;
  outDays: number;
  records: { date: string; status: string; time: string; dorm: string }[];
}

export interface CampusPosition {
  longitude: number;
  latitude: number;
}

export interface AttendanceStatus {
  signed: boolean;
  required: boolean;
  inTime: boolean;
  startTime: string;
  endTime: string;
  mode: 'location' | 'qr';
  locations: (CampusPosition & { name: string; radius: number })[];
}

export interface AttendanceAutomationConfig {
  enabled: boolean;
  time: string;
  position: CampusPosition | null;
}

export interface AttendanceAutomation extends AttendanceAutomationConfig {
  lastDate: string | null;
  lastAttemptAt: string | null;
  result: 'running' | 'success' | 'skipped' | 'error' | null;
  message: string;
}

export interface CampusNetworkState {
  enabled: boolean;
  account: string;
  hasPassword: boolean;
  phase: 'idle' | 'online' | 'offline' | 'connecting' | 'error';
  message: string;
  checkedAt: string | null;
}

export interface CampusNetworkConfig {
  account: string;
  password?: string;
  enabled: boolean;
}

export interface EnrollmentChoice {
  id: string;
  label: string;
  handler: string;
}

export interface EnrollmentPlan {
  runAt: string;
  choices: EnrollmentChoice[];
  status: 'scheduled' | 'running' | 'submitted' | 'stopped' | 'needs-attention';
  message: string;
}

export interface EnrollmentState {
  available: boolean;
  message: string;
  choices: EnrollmentChoice[];
  plan: EnrollmentPlan | null;
}

export interface CampusServicesApi {
  open(service: CampusService): Promise<void>;
  attendance(year: number, month: number): Promise<AttendanceRecords>;
  attendanceStatus(): Promise<AttendanceStatus>;
  attendanceAutomation(): Promise<AttendanceAutomation>;
  configureAttendance(config: AttendanceAutomationConfig): Promise<AttendanceAutomation>;
  signAttendance(
    position: CampusPosition | null,
  ): Promise<{ message: string; outcome: 'success' | 'skipped' }>;
  networkState(): Promise<CampusNetworkState>;
  configureNetwork(config: CampusNetworkConfig): Promise<CampusNetworkState>;
  connectNetwork(): Promise<CampusNetworkState>;
  copyCommunityLink(): Promise<void>;
  enrollment(): Promise<EnrollmentState>;
  scheduleEnrollment(ids: string[], runAt: string): Promise<EnrollmentPlan>;
  stopEnrollment(): Promise<EnrollmentPlan | null>;
}
