import { apiRequest } from "./queryClient";

const BASE_URL = "/api";

export interface Subject {
  id: number;
  name: string;
  code: string;
  facultyName: string;
  schedule: string;
}

export interface TrackingResult {
  id: number;
  userId: number;
  subjectId: number;
  sessionDate: string;
  startTime: string;
  endTime: string;
  eyeMovementCount: number;
  eyeBlinkCount: number;
  postureChangeCount: number;
  attentivenessScore: number;
  sessionData: string;
}

export interface TrackingData {
  eyeMovements: number;
  eyeBlinks: number;
  postureChanges: number;
  attentivenessScore: number;
  facialExpressions: Record<string, number>;
  postureStates: Record<string, number>;
  sessionData: string;
}

// Get all subjects
export async function getSubjects(): Promise<Subject[]> {
  const response = await apiRequest("GET", `${BASE_URL}/subjects`);
  return await response.json();
}

// Get user enrollments
export async function getUserEnrollments(userId: number): Promise<Subject[]> {
  const response = await apiRequest("GET", `${BASE_URL}/users/${userId}/enrollments`);
  return await response.json();
}

// Check if user is enrolled in a subject
export async function isUserEnrolled(userId: number, subjectId: number): Promise<boolean> {
  const response = await apiRequest("GET", `${BASE_URL}/users/${userId}/subjects/${subjectId}/enrolled`);
  const data = await response.json();
  return data.enrolled;
}

// Enroll user in a subject
export async function enrollUser(userId: number, subjectId: number): Promise<void> {
  await apiRequest("POST", `${BASE_URL}/users/${userId}/subjects/${subjectId}/enroll`);
}

// Save tracking results
export async function saveTrackingResults(userId: number, subjectId: number, trackingData: TrackingData): Promise<void> {
  await apiRequest("POST", `${BASE_URL}/tracking/save`, {
    userId,
    subjectId,
    trackingData
  });
}

// Get tracking results for a user
export async function getUserTrackingResults(userId: number): Promise<TrackingResult[]> {
  const response = await apiRequest("GET", `${BASE_URL}/users/${userId}/tracking`);
  return await response.json();
}

// Get tracking results for a user and subject
export async function getUserSubjectTrackingResults(userId: number, subjectId: number): Promise<TrackingResult[]> {
  const response = await apiRequest("GET", `${BASE_URL}/users/${userId}/subjects/${subjectId}/tracking`);
  return await response.json();
}

// Process frame for attention tracking using Flask backend (via Express proxy)
export async function processFrame(frameData: string): Promise<any> {
  try {
    const response = await apiRequest("POST", `${BASE_URL}/flask/process_frame`, {
      frame: frameData
    });
    
    if (!response.ok) {
      console.error(`Failed to process frame: ${response.statusText}`);
      throw new Error(`Failed to process frame: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Process frame error:", error);
    throw error;
  }
}

// Get tracking results from Flask backend (via Express proxy)
export async function getTrackingResults(): Promise<TrackingData> {
  try {
    const response = await apiRequest("GET", `${BASE_URL}/flask/get_tracking_results`);
    
    if (!response.ok) {
      console.error(`Failed to get tracking results: ${response.statusText}`);
      throw new Error(`Failed to get tracking results: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Get tracking results error:", error);
    throw error;
  }
}

// Reset tracking in Flask backend (via Express proxy)
export async function resetTracking(): Promise<void> {
  try {
    const response = await apiRequest("POST", `${BASE_URL}/flask/reset_tracking`);
    
    if (!response.ok) {
      console.error(`Failed to reset tracking: ${response.statusText}`);
      throw new Error(`Failed to reset tracking: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Reset tracking error:", error);
    throw error;
  }
}

// Check if Flask server is available (via Express proxy)
export async function checkFlaskServer(): Promise<boolean> {
  try {
    const response = await apiRequest("GET", `${BASE_URL}/flask/health`);
    return response.ok;
  } catch (error) {
    console.error("Flask server health check error:", error);
    return false;
  }
}
