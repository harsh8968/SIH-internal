// User Types
export type UserRole = 'citizen' | 'rso' | 'admin' | 'compliance_officer' | 'contractor';
export type Department = 'Engineering' | 'Water Supply' | 'Sanitation' | 'Disaster Management' | 'Traffic';

export interface Contractor {
  id: string;
  name: string;
  agencyName: string;
  licenseNumber?: string;
  rating?: number;
  zone?: string;
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  zone?: string; // For RSO users
  isApproved?: boolean; // For RSO (requires admin approval)
  points?: number; // Petty wallet points
  adminPointsPool?: number; // For admin to distribute
  contractorId?: string; // Links login to a specific Contractor Agency
}



// Report Types
export type ReportingMode = 'on-site' | 'from-elsewhere';
export type DamageType = 'crack' | 'pothole' | 'other' | 'manual';
export type SeverityLevel = 'low' | 'medium' | 'high';
export type ReportStatus = 'pending' | 'in-progress' | 'verification-pending' | 'completed';
export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
  roadName?: string;
  area?: string;
  zone?: string;
}

/** The routing decision recorded on a report at submission time. */
export interface ComplaintClassification {
  department: Department;
  /** 0-1 share of the evidence that pointed at this department. */
  confidence: number;
  /** The terms that decided it, so an officer can see the reasoning. */
  matchedTerms: string[];
  /** Too weakly evidenced to act on without a human glance. */
  needsReview: boolean;
}

export interface AIDetectionResult {
  damageType: DamageType;
  confidence: number;
  severity: SeverityLevel;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface AIVideoDetectionResult {
  frameIndex: number;
  timestamp: string;
  damageType: DamageType;
  confidence: number;
  severity: SeverityLevel;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  frameImage: string; // Base64 JPEG data URL
}

export interface Report {
  id: string;
  citizenId: string;
  reportingMode: ReportingMode;
  location: Location;
  photoUri: string;
  /**
   * What the citizen wrote about the defect, in whatever language they chose.
   * Optional because a photo alone is still a valid report, and because every
   * report filed before this field existed has none.
   */
  description?: string;
  /**
   * How the complaint was routed, and on what evidence. Stored rather than
   * recomputed so the dashboard shows the decision that was actually acted on,
   * even after the lexicon is later tuned.
   */
  classification?: ComplaintClassification;
  aiDetection?: AIDetectionResult;
  status: ReportStatus;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
  repairProofUri?: string;
  repairCompletedAt?: string;

  reportApprovedForPoints?: boolean;
  repairApprovedForPoints?: boolean;
  rsoId?: string;
  citizenRating?: number;
  citizenFeedback?: string;
  videoUri?: string; // URL to recorded video

  // New Fields
  assignedDepartment?: Department;
  originDepartment?: Department;
  rootCause?: string; // e.g., 'Monsoon/Rain', 'Heavy Vehicle Load', 'Utility Excavation'
  utilityType?: string; // e.g., 'Telecom', 'Gas', 'Electric'
  contractorId?: string;
  workOrderGeneratedAt?: string;
}

// Zone Types
export type ZoneId = 'zone1' | 'zone4' | 'zone8';

export interface Zone {
  id: ZoneId;
  name: string;
  boundaries: {
    latitude: number;
    longitude: number;
  }[];
}

// Analytics Types
export interface ZoneAnalytics {
  zoneId: ZoneId;
  totalReports: number;
  pendingReports: number;
  completedReports: number;
  averageSeverity: number;
  roadHealthIndex: number;
}

export interface RoadHealthData {
  roadName: string;
  zone: ZoneId;
  totalDamages: number;
  severityDistribution: {
    low: number;
    medium: number;
    high: number;
  };
  healthIndex: number;
  lastRepairDate?: string;
}
