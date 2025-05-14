from flask import Flask, request, jsonify
import cv2
import mediapipe as mp
import numpy as np
from flask_cors import CORS
import base64
import time
import json
import os
import sys
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Check if running in deployment
is_deployment = os.environ.get('DEPLOYMENT', 'false').lower() == 'true'

# Record startup time
startup_time = time.time()

# Set to True to enable detailed debug output for algorithm tuning
DEBUG_MODE = True

if is_deployment:
    logger.info("Running in deployment mode")
else:
    logger.info("Running in development mode")

# Initialize Flask with proper settings for deployment
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Error handling for imports
try:
    import cv2
    import mediapipe as mp
    import numpy as np
    logger.info("All required libraries loaded successfully")
except ImportError as e:
    logger.error(f"Failed to import required libraries: {e}")
    # Don't crash, we'll handle this in the API endpoints

# Initialize MediaPipe components
mp_face_mesh = mp.solutions.face_mesh
mp_face_detection = mp.solutions.face_detection
mp_drawing = mp.solutions.drawing_utils
mp_pose = mp.solutions.pose

# Initialize the Face Mesh, Face Detection and Pose models
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

face_detection = mp_face_detection.FaceDetection(
    model_selection=0,
    min_detection_confidence=0.5
)

pose = mp_pose.Pose(
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Define eye landmarks indices
LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]
RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]

# Global tracking variables
blink_count = 0
eye_movement_count = 0
posture_change_count = 0
last_eye_pos = None
last_posture = None
blink_threshold = 0.25
session_data = {
    "time_series": [],
    "facial_expressions": {
        "neutral": 0,
        "focused": 0,
        "confused": 0,
        "distracted": 0
    },
    "posture_states": {
        "upright": 0,
        "leaning_forward": 0,
        "slouching": 0,
        "away": 0
    }
}

def reset_tracking_vars():
    """Reset tracking variables to initial state"""
    global blink_count, eye_movement_count, posture_change_count
    global last_eye_pos, last_posture, last_posture_vector, blink_state, last_ear, frames_below_threshold
    global ear_history, current_blink_state, last_blink_time
    global session_data
    
    # Reset eye movement variables
    global eye_pos_history, last_significant_movement_time, eye_movement_baseline
    
    # Reset posture variables
    global posture_history, last_significant_posture_time, posture_baseline_diff
    
    # Reset all blink variables
    global last_blink_time, BLINK_COOLDOWN, blink_confirmation_counter, current_ear_velocity
    global last_ear_measurement_time
    
    # Reset counters
    blink_count = 0
    eye_movement_count = 0
    posture_change_count = 0
    
    # Reset eye movement tracking variables
    last_eye_pos = None
    eye_pos_history = []
    last_significant_movement_time = 0
    eye_movement_baseline = 0.01
    
    # Reset posture tracking variables
    last_posture = None
    last_posture_vector = None
    posture_history = []
    last_significant_posture_time = 0
    posture_baseline_diff = 0.05
    
    # Reset blink detection variables
    blink_state = False
    last_ear = 1.0
    frames_below_threshold = 0
    ear_history = []
    current_blink_state = BLINK_STATE_OPEN
    last_blink_time = 0
    blink_confirmation_counter = 0
    current_ear_velocity = 0
    last_ear_measurement_time = 0
    
    # Reset session data
    session_data = {
        "time_series": [],
        "facial_expressions": {
            "neutral": 0,
            "focused": 0,
            "confused": 0,
            "distracted": 0
        },
        "posture_states": {
            "upright": 0,
            "leaning_forward": 0,
            "slouching": 0,
            "away": 0
        }
    }
    
    print("Tracking variables reset successfully")

def calculate_ear(landmarks, eye_indices):
    """Calculate the Eye Aspect Ratio (EAR) for blink detection"""
    pts = [landmarks[idx] for idx in eye_indices]
    
    # Compute horizontal distance
    h_dist = np.linalg.norm(np.array([pts[0].x, pts[0].y]) - np.array([pts[3].x, pts[3].y]))
    
    # Compute vertical distances
    v1 = np.linalg.norm(np.array([pts[1].x, pts[1].y]) - np.array([pts[5].x, pts[5].y]))
    v2 = np.linalg.norm(np.array([pts[2].x, pts[2].y]) - np.array([pts[4].x, pts[4].y]))
    
    # Average vertical distance
    v_dist = (v1 + v2) / 2.0
    
    # Calculate EAR
    ear = v_dist / h_dist if h_dist > 0 else 0
    
    return ear

# Enhanced blink detection variables
blink_state = False
last_ear = 1.0
frames_below_threshold = 0
ear_history = []  # Track recent EAR values to detect patterns
EAR_HISTORY_SIZE = 10  # Keep track of the last 10 frames
MIN_FRAMES_FOR_BLINK = 2  # Minimum consecutive frames with closed eyes
CLOSED_TO_OPEN_TIME_WINDOW = 0.5  # Time window in seconds to detect a complete blink
last_blink_time = 0
BLINK_COOLDOWN = 0.2  # Seconds between blinks to avoid double counting
blink_confirmation_counter = 0
current_ear_velocity = 0
last_ear_measurement_time = 0

# We'll use a state machine approach for more accurate detection
BLINK_STATE_OPEN = 0      # Eyes are open
BLINK_STATE_CLOSING = 1   # Eyes are in the process of closing
BLINK_STATE_CLOSED = 2    # Eyes are closed
BLINK_STATE_OPENING = 3   # Eyes are in the process of opening
current_blink_state = BLINK_STATE_OPEN

def detect_blink(landmarks):
    """Detect eye blinks with improved accuracy using a state machine approach"""
    global blink_count, blink_state, last_ear, frames_below_threshold
    global ear_history, current_blink_state, last_blink_time
    global BLINK_COOLDOWN, blink_confirmation_counter, current_ear_velocity
    global last_ear_measurement_time
    
    # Get EAR for both eyes
    left_ear = calculate_ear(landmarks, LEFT_EYE_INDICES)
    right_ear = calculate_ear(landmarks, RIGHT_EYE_INDICES)
    
    # Average EAR - use max for robustness against detection errors in one eye
    avg_ear = (left_ear + right_ear) / 2.0
    
    # Add to history
    current_time = time.time()
    ear_history.append((avg_ear, current_time))
    if len(ear_history) > EAR_HISTORY_SIZE:
        ear_history.pop(0)  # Remove oldest entry
    
    # Calculate dynamic thresholds based on the person's baseline
    # Start with defaults but adjust as we collect more data
    if len(ear_history) >= 5:
        # Sort EAR values to find typical open eye value (upper percentile)
        sorted_ears = sorted([e[0] for e in ear_history])
        open_eye_baseline = sorted_ears[int(len(sorted_ears) * 0.8)]  # 80th percentile
        
        # Adapt thresholds based on the person's eye characteristics
        # IMPROVED: Lower thresholds to catch more subtle blinks (making detection more sensitive)
        blink_open_threshold = max(0.22, open_eye_baseline * 0.85)  # 85% of baseline open eye (was 90%)
        blink_closed_threshold = max(0.16, open_eye_baseline * 0.60)  # 60% of baseline open eye (was 65%)
        
        # For transitional states - also adjusted
        closing_threshold = max(0.19, open_eye_baseline * 0.70)  # 70% of baseline (was 75%)
        opening_threshold = max(0.18, open_eye_baseline * 0.65)  # 65% of baseline (was 70%)
    else:
        # Default thresholds until we have enough data - more sensitive than before
        blink_open_threshold = 0.22  # Was 0.25
        blink_closed_threshold = 0.16  # Was 0.19
        closing_threshold = 0.19  # Was 0.22
        opening_threshold = 0.18  # Was 0.21
    
    # Debug info
    if DEBUG_MODE:
        print(f"EAR: {avg_ear:.4f}, State: {current_blink_state}, Thresholds: {blink_closed_threshold:.2f}/{blink_open_threshold:.2f}")
    
    # Initialize return value
    blink_detected = False
    
    # Calculate velocity of EAR change - helps detect rapid blinks
    if len(ear_history) >= 2:
        time_diff = current_time - ear_history[-2][1]
        if time_diff > 0:
            current_ear_velocity = (ear_history[-2][0] - avg_ear) / time_diff
            
            # Extremely high velocities indicate very rapid blinks that might be missed
            if current_ear_velocity > 1.5 and current_blink_state == BLINK_STATE_OPEN:
                if DEBUG_MODE:
                    print(f"High velocity EAR change detected: {current_ear_velocity:.2f}/s")
                blink_confirmation_counter += 1
                if blink_confirmation_counter >= 2:
                    if (current_time - last_blink_time) > BLINK_COOLDOWN:
                        blink_count += 1
                        blink_detected = True
                        last_blink_time = current_time
                        if DEBUG_MODE:
                            print(f"VELOCITY-BASED BLINK DETECTED! Count: {blink_count}")
                    blink_confirmation_counter = 0
    
    # State machine logic for blink detection
    if current_blink_state == BLINK_STATE_OPEN:
        # Check if eyes are starting to close
        if avg_ear < closing_threshold:
            current_blink_state = BLINK_STATE_CLOSING
            if DEBUG_MODE:
                print("Eyes starting to close")
            
    elif current_blink_state == BLINK_STATE_CLOSING:
        # Check if eyes are now fully closed
        if avg_ear < blink_closed_threshold:
            current_blink_state = BLINK_STATE_CLOSED
            frames_below_threshold = 1
            if DEBUG_MODE:
                print("Eyes closed")
        # Or if they opened again without fully closing (abandoned blink)
        elif avg_ear > blink_open_threshold:
            current_blink_state = BLINK_STATE_OPEN
            if DEBUG_MODE:
                print("Abandoned blink")
            
    elif current_blink_state == BLINK_STATE_CLOSED:
        # Keep track of how long eyes have been closed
        if avg_ear < blink_closed_threshold:
            frames_below_threshold += 1
        # Check if eyes are starting to open
        elif avg_ear > opening_threshold:
            current_blink_state = BLINK_STATE_OPENING
            if DEBUG_MODE:
                print("Eyes starting to open")
            
    elif current_blink_state == BLINK_STATE_OPENING:
        # Check if eyes are fully open again - this completes a blink
        if avg_ear > blink_open_threshold:
            # IMPROVED: Reduced the minimum frames requirement
            # Only count as a blink if it was a proper sequence (but less strict)
            if frames_below_threshold >= 1:  # Was 2
                # IMPROVED: Shorter cooldown between blinks
                if (current_time - last_blink_time) > BLINK_COOLDOWN:
                    blink_count += 1
                    blink_detected = True
                    last_blink_time = current_time
                    print(f"COMPLETE BLINK DETECTED! Count: {blink_count}")
            
            # Reset to open state
            current_blink_state = BLINK_STATE_OPEN
            frames_below_threshold = 0
            if DEBUG_MODE:
                print("Eyes fully open again")
        
        # If they close again without fully opening, go back to closed state
        elif avg_ear < blink_closed_threshold:
            current_blink_state = BLINK_STATE_CLOSED
            if DEBUG_MODE:
                print("Eyes closed again without fully opening")
    
    # Also detect rapid decreases in EAR which might be very quick blinks
    # This is a backup detection method with improved sensitivity
    if len(ear_history) >= 3:
        # Look at EAR change over the last 3 frames
        ear_change = ear_history[-3][0] - avg_ear
        
        # IMPROVED: Lower threshold for detecting quick blinks
        if (ear_change > 0.08 and  # Was 0.12
            current_blink_state == BLINK_STATE_OPEN and 
            (current_time - last_blink_time) > BLINK_COOLDOWN):  # Shorter window
            
            # This looks like a rapid blink that our state machine might miss
            print(f"RAPID BLINK DETECTED! (Backup method) Change: {ear_change:.3f}")
            blink_count += 1
            blink_detected = True
            last_blink_time = current_time
            
    # Pattern-based detection for subtle blinks (new feature)
    # Look for characteristic pattern: decrease then increase
    if len(ear_history) >= 5:
        # Calculate the differences between consecutive frames
        diffs = []
        for i in range(1, len(ear_history)):
            diffs.append(ear_history[i][0] - ear_history[i-1][0])
        
        # Pattern: significant decrease followed by significant increase
        # This catches subtle blinks that might not cross the threshold
        if (len(diffs) >= 4 and
            diffs[-4] < -0.03 and diffs[-3] < -0.03 and  # Two consecutive decreases
            diffs[-2] > 0.02 and diffs[-1] > 0.02 and     # Two consecutive increases
            (current_time - last_blink_time) > BLINK_COOLDOWN):
            
            print(f"PATTERN-BASED BLINK DETECTED! Pattern: {diffs[-4]:.2f}, {diffs[-3]:.2f}, {diffs[-2]:.2f}, {diffs[-1]:.2f}")
            blink_count += 1
            blink_detected = True
            last_blink_time = current_time
    
    # Update last EAR for the next frame
    last_ear = avg_ear
    return blink_detected

# Eye movement detection variables
last_eye_pos = None
eye_pos_history = []  # Store recent eye positions
EYE_POS_HISTORY_SIZE = 10  # Decreased for faster adaptation to new eyes
last_significant_movement_time = 0
MOVEMENT_DEBOUNCE_TIME = 0.3  # Decreased to catch more movements
eye_movement_baseline = 0.01  # Much lower default threshold for better sensitivity

def detect_eye_movement(landmarks):
    """Detect eye movement with improved accuracy and reduced false positives"""
    global eye_movement_count, last_eye_pos, eye_pos_history, last_significant_movement_time
    global eye_movement_baseline
    
    current_time = time.time()
    
    # IMPROVED: Use more precise pupil landmarks with higher weighting on pupil center
    # Original code used mean of all pupil landmarks; this version emphasizes the central pupil landmark
    left_pupil_center = np.array([landmarks[468].x, landmarks[468].y])  # Central pupil landmark
    left_pupil_points = np.array([[landmarks[idx].x, landmarks[idx].y] for idx in [469, 470, 471, 472]])
    left_pupil = 0.6 * left_pupil_center + 0.4 * np.mean(left_pupil_points, axis=0)  # Weighted average
    
    right_pupil_center = np.array([landmarks[473].x, landmarks[473].y])  # Central pupil landmark
    right_pupil_points = np.array([[landmarks[idx].x, landmarks[idx].y] for idx in [474, 475, 476, 477]])
    right_pupil = 0.6 * right_pupil_center + 0.4 * np.mean(right_pupil_points, axis=0)  # Weighted average
    
    # Calculate eye corners for reference frame - with improved iris contour landmarks
    # This gives more precise eye contour for normalization
    left_eye_inner = np.array([landmarks[LEFT_EYE_INDICES[3]].x, landmarks[LEFT_EYE_INDICES[3]].y])
    left_eye_outer = np.array([landmarks[LEFT_EYE_INDICES[0]].x, landmarks[LEFT_EYE_INDICES[0]].y])
    right_eye_inner = np.array([landmarks[RIGHT_EYE_INDICES[0]].x, landmarks[RIGHT_EYE_INDICES[0]].y])
    right_eye_outer = np.array([landmarks[RIGHT_EYE_INDICES[3]].x, landmarks[RIGHT_EYE_INDICES[3]].y])
    
    # Additional landmarks for better eye shape mapping
    left_eye_top = np.array([landmarks[386].x, landmarks[386].y])  # Upper eyelid
    left_eye_bottom = np.array([landmarks[374].x, landmarks[374].y])  # Lower eyelid
    right_eye_top = np.array([landmarks[159].x, landmarks[159].y])  # Upper eyelid
    right_eye_bottom = np.array([landmarks[145].x, landmarks[145].y])  # Lower eyelid
    
    # Calculate eye widths and heights for improved normalization
    left_eye_width = np.linalg.norm(left_eye_outer - left_eye_inner)
    right_eye_width = np.linalg.norm(right_eye_outer - right_eye_inner)
    left_eye_height = np.linalg.norm(left_eye_top - left_eye_bottom)
    right_eye_height = np.linalg.norm(right_eye_top - right_eye_bottom)
    
    # IMPROVED: Create dynamic eye box for normalization 
    # Normalize based on both width and height for better aspect ratio handling
    left_eye_size = np.sqrt(left_eye_width * left_eye_height)
    right_eye_size = np.sqrt(right_eye_width * right_eye_height)
    eye_scale = (left_eye_size + right_eye_size) / 2
    
    # Create a coordinate system based on face orientation - improved stability
    # Use more stable facial landmarks and weight them by reliability
    # Nose bridge and eyes are more stable than chin or eyebrows
    face_center = np.mean([
        1.5 * np.array([landmarks[168].x, landmarks[168].y]),  # Nose bridge (higher weight)
        0.7 * np.array([landmarks[151].x, landmarks[151].y]),  # Chin (lower weight)
        1.0 * np.array([landmarks[8].x, landmarks[8].y]),      # Midpoint between eyes
        1.0 * np.array([landmarks[200].x, landmarks[200].y])   # Center of lips
    ], axis=0)
    
    # IMPROVED: Create face orientation vectors to normalize for head rotation
    # These vectors help create a reference frame that's invariant to head rotation
    face_vertical = np.array([landmarks[168].x, landmarks[168].y]) - np.array([landmarks[151].x, landmarks[151].y])
    face_vertical = face_vertical / (np.linalg.norm(face_vertical) + 1e-6)  # Normalize
    
    face_horizontal = np.array([landmarks[33].x, landmarks[33].y]) - np.array([landmarks[263].x, landmarks[263].y])
    face_horizontal = face_horizontal / (np.linalg.norm(face_horizontal) + 1e-6)  # Normalize
    
    # IMPROVED: Calculate gaze vector (direction of looking)
    # This is more accurate than just using pupil position
    left_gaze_vector = left_pupil - np.mean([left_eye_inner, left_eye_outer, left_eye_top, left_eye_bottom], axis=0)
    right_gaze_vector = right_pupil - np.mean([right_eye_inner, right_eye_outer, right_eye_top, right_eye_bottom], axis=0)
    
    # Normalize gaze vectors by eye size
    left_gaze_vector = left_gaze_vector / (left_eye_size + 1e-6)
    right_gaze_vector = right_gaze_vector / (right_eye_size + 1e-6)
    
    # Average the normalized gaze vectors from both eyes
    gaze_vector = (left_gaze_vector + right_gaze_vector) / 2.0
    
    # Project gaze into face coordinate system to make it invariant to head rotation
    gaze_h = np.dot(gaze_vector, face_horizontal)
    gaze_v = np.dot(gaze_vector, face_vertical)
    normalized_gaze = np.array([gaze_h, gaze_v])
    
    # Store this normalized gaze with timestamp
    current_pos = (normalized_gaze, current_time)
    eye_pos_history.append(current_pos)
    
    # Keep history within size limit
    if len(eye_pos_history) > EYE_POS_HISTORY_SIZE:
        eye_pos_history.pop(0)
    
    # IMPROVED: More adaptive threshold calculation
    # Dynamically adjust threshold based on recent eye movement patterns
    if len(eye_pos_history) >= 5:  # Need fewer samples for quicker adaptation
        # Calculate the average movement in recent history for baseline
        movements = []
        for i in range(1, len(eye_pos_history)):
            prev_pos = eye_pos_history[i-1][0]
            curr_pos = eye_pos_history[i][0]
            movements.append(np.linalg.norm(curr_pos - prev_pos))
        
        # More sophisticated noise estimation:
        # Use 60th percentile as baseline for normal movement (was 70th)
        movements.sort()
        noise_level = movements[int(len(movements) * 0.6)]
        
        # Lower multiplier for more sensitivity (was 3.0)
        # But keep a reasonable minimum to avoid false positives
        eye_movement_baseline = max(0.01, noise_level * 2.2)
    else:
        # More sensitive default (was 0.15)
        eye_movement_baseline = 0.01
    
    # Detect movement with improved sensitivity
    if last_eye_pos is not None:
        # Euclidean distance from last position
        dist = np.linalg.norm(current_pos[0] - last_eye_pos)
        
        # Print diagnostic info if in debug mode
        if DEBUG_MODE:
            print(f"Eye movement: {dist:.5f}, Threshold: {eye_movement_baseline:.5f}")
        
        # IMPROVED: More sensitive detection with shorter debounce time
        # We want to detect more subtle eye movements
        if dist > eye_movement_baseline and (current_time - last_significant_movement_time) > 0.3:  # Was 0.5s
            # IMPROVED: Less strict sustained movement requirement
            # Now we only need moderate movement in the previous frame
            if len(eye_pos_history) >= 3:
                prev_dist = np.linalg.norm(eye_pos_history[-2][0] - eye_pos_history[-3][0])
                if prev_dist > eye_movement_baseline * 0.5:  # Was 0.7
                    eye_movement_count += 1
                    last_significant_movement_time = current_time
                    print(f"Significant eye movement detected! Count: {eye_movement_count}")
    
    # IMPROVED: Add pattern-based detection for saccades (quick eye movements)
    # This catches rapid movements that might be missed by the main algorithm
    if len(eye_pos_history) >= 4:
        # Calculate movement velocities
        velocities = []
        for i in range(1, min(4, len(eye_pos_history))):
            time_diff = eye_pos_history[-i][1] - eye_pos_history[-(i+1)][1]
            if time_diff > 0:
                dist = np.linalg.norm(eye_pos_history[-i][0] - eye_pos_history[-(i+1)][0])
                velocities.append(dist/time_diff)
        
        # If we see a spike in velocity (characteristic of saccades)
        if len(velocities) >= 2 and velocities[0] > 0.5 and velocities[0] > 2.0*velocities[1]:
            if (current_time - last_significant_movement_time) > 0.3:  # Debounce
                eye_movement_count += 1
                last_significant_movement_time = current_time
                print(f"Saccade detected! Count: {eye_movement_count}")
    
    last_eye_pos = current_pos[0]
    return eye_movement_count

# Posture detection variables
last_posture_vector = None
posture_history = []  # Store recent posture vectors
POSTURE_HISTORY_SIZE = 15
last_significant_posture_time = 0
POSTURE_DEBOUNCE_TIME = 0.5  # Seconds to wait between counting posture changes
posture_baseline_diff = 0.05  # Default threshold, will be adjusted dynamically

def detect_posture_change(pose_landmarks):
    """Detect posture changes with improved accuracy and reduced false positives"""
    global posture_change_count, last_posture, last_posture_vector, session_data
    global posture_history, last_significant_posture_time, posture_baseline_diff
    
    current_time = time.time()
    
    if pose_landmarks is None:
        session_data["posture_states"]["away"] += 1
        return posture_change_count
    
    # Extract key landmarks for posture
    landmarks = []
    for landmark in pose_landmarks.landmark:
        landmarks.append([landmark.x, landmark.y, landmark.z])
    
    landmarks = np.array(landmarks)
    
    # Get more comprehensive landmarks for better posture detection
    left_shoulder = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value]
    right_shoulder = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value]
    left_hip = landmarks[mp_pose.PoseLandmark.LEFT_HIP.value]
    right_hip = landmarks[mp_pose.PoseLandmark.RIGHT_HIP.value]
    left_ear = landmarks[mp_pose.PoseLandmark.LEFT_EAR.value] if mp_pose.PoseLandmark.LEFT_EAR.value < len(landmarks) else None
    right_ear = landmarks[mp_pose.PoseLandmark.RIGHT_EAR.value] if mp_pose.PoseLandmark.RIGHT_EAR.value < len(landmarks) else None
    nose = landmarks[mp_pose.PoseLandmark.NOSE.value] if mp_pose.PoseLandmark.NOSE.value < len(landmarks) else None
    
    # Calculate centers
    shoulder_center = (left_shoulder + right_shoulder) / 2
    hip_center = (left_hip + right_hip) / 2
    
    # Calculate ear center if available (for head tilt detection)
    ear_center = None
    if left_ear is not None and right_ear is not None:
        ear_center = (left_ear + right_ear) / 2
    
    # Calculate multiple vectors for more comprehensive posture analysis
    spine_vector = shoulder_center - hip_center
    
    # Calculate head position relative to shoulders (forward lean)
    head_forward_vector = None
    if ear_center is not None:
        head_forward_vector = ear_center - shoulder_center
    elif nose is not None:
        head_forward_vector = nose - shoulder_center
    
    # Calculate shoulder tilt (left-right lean)
    shoulder_tilt = left_shoulder - right_shoulder
    
    # Calculate posture angles
    spine_angle = np.arctan2(spine_vector[1], spine_vector[0])
    shoulder_tilt_angle = np.arctan2(shoulder_tilt[1], shoulder_tilt[0])
    
    # Get depth info (z-axis) for 3D posture analysis
    if head_forward_vector is not None:
        head_forward_z = head_forward_vector[2]  # Z component indicates forward/backward lean
    else:
        head_forward_z = 0
    
    # Create a comprehensive posture feature vector
    posture_features = [
        spine_angle,
        shoulder_tilt_angle
    ]
    
    # Add head forward lean if available
    if head_forward_vector is not None:
        head_angle = np.arctan2(head_forward_vector[1], head_forward_vector[0])
        posture_features.append(head_angle)
        posture_features.append(head_forward_z)
    
    # Create final posture vector with all features
    posture_vector = np.array(posture_features)
    
    # Store posture with timestamp to history
    posture_history.append((posture_vector, current_time))
    
    # Keep history within size limit
    if len(posture_history) > POSTURE_HISTORY_SIZE:
        posture_history.pop(0)
    
    # If we have enough history, adapt the posture difference threshold
    if len(posture_history) >= 7:
        # Calculate the average posture differences in recent history for baseline
        differences = []
        for i in range(1, len(posture_history)):
            prev_pos = posture_history[i-1][0]
            curr_pos = posture_history[i][0]
            # Use only the most stable components of the vector to avoid noise
            stable_prev = prev_pos[:2]  # Use spine and shoulder angles
            stable_curr = curr_pos[:2]
            differences.append(np.linalg.norm(stable_curr - stable_prev))
        
        # Sort differences
        differences.sort()
        
        # Set baseline as the 70th percentile of differences (above normal movements)
        index = int(len(differences) * 0.7)
        if index < len(differences):
            noise_level = differences[index]
            # Set threshold as 1.5x the noise level
            posture_baseline_diff = max(0.05, noise_level * 1.5)
    
    # Determine posture state with more precise thresholds
    # Using spine angle for basic classification
    if abs(spine_angle) < 0.12:  # Nearly vertical
        current_posture = "upright"
        session_data["posture_states"]["upright"] += 1
    elif spine_angle < 0:  # Leaning forward (negative angle in screen coordinates)
        # Check degree of forward lean
        if spine_angle < -0.3:  # Significant forward lean
            current_posture = "leaning_forward"
        else:
            current_posture = "slight_forward"
        session_data["posture_states"]["leaning_forward"] += 1
    else:  # Leaning back (positive angle in screen coordinates)
        current_posture = "slouching"
        session_data["posture_states"]["slouching"] += 1
    
    # Additional posture refinement using head position if available
    if head_forward_vector is not None:
        head_forward_angle = np.arctan2(head_forward_vector[1], head_forward_vector[0])
        # If head is tilted down significantly, this could be looking at phone/desk
        if head_forward_angle < -0.25:
            current_posture = "looking_down"
            session_data["posture_states"]["leaning_forward"] += 1
    
    # Print diagnostic information
    print(f"Posture: {current_posture}, Spine angle: {spine_angle:.3f}, Threshold: {posture_baseline_diff:.3f}")
    
    # Check if posture has changed significantly
    posture_changed = False
    
    # First check if the posture state category changed
    if last_posture is not None and current_posture != last_posture:
        # Only count significant state changes and use debounce
        if (current_time - last_significant_posture_time) > POSTURE_DEBOUNCE_TIME:
            posture_changed = True
            posture_change_count += 1
            last_significant_posture_time = current_time
            print(f"Posture state changed from {last_posture} to {current_posture}. Count: {posture_change_count}")
    # Then check for subtle but significant changes using vector comparison
    elif last_posture_vector is not None:
        # Use only the most stable components of the vector to calculate differences
        stable_last = last_posture_vector[:2] if len(last_posture_vector) >= 2 else last_posture_vector
        stable_current = posture_vector[:2] if len(posture_vector) >= 2 else posture_vector
        
        # Calculate the difference
        posture_diff = np.linalg.norm(stable_current - stable_last)
        
        # Only count significant changes with debounce time
        if (posture_diff > posture_baseline_diff and 
            (current_time - last_significant_posture_time) > POSTURE_DEBOUNCE_TIME):
            posture_changed = True
            posture_change_count += 1
            last_significant_posture_time = current_time
            print(f"Subtle posture change detected! Diff: {posture_diff:.3f}, Count: {posture_change_count}")
    
    last_posture = current_posture
    last_posture_vector = posture_vector
    return posture_change_count

def detect_facial_expression(landmarks):
    """Estimate facial expression based on landmark positions with improved accuracy"""
    global session_data, eye_movement_count
    
    # Extract features for expression detection
    # Get eyebrow positions (for concentration detection)
    left_inner_eyebrow = landmarks[285].y
    right_inner_eyebrow = landmarks[55].y
    left_outer_eyebrow = landmarks[282].y
    right_outer_eyebrow = landmarks[52].y
    
    # Check eyebrow position relative to eye position
    left_eye_top = landmarks[159].y
    right_eye_top = landmarks[386].y
    eyebrow_to_eye_distance = ((left_inner_eyebrow - left_eye_top) + (right_inner_eyebrow - right_eye_top)) / 2
    
    # Check for furrowed brows (concentration)
    eyebrow_furrow = abs((left_inner_eyebrow - left_outer_eyebrow) - (right_inner_eyebrow - right_outer_eyebrow))
    
    # Check mouth (open or closed) with improved points
    upper_lip = landmarks[13].y
    lower_lip = landmarks[14].y
    mouth_distance = abs(upper_lip - lower_lip)
    
    # Check for smile using mouth corners
    left_mouth_corner = landmarks[61].y
    right_mouth_corner = landmarks[291].y
    center_mouth = landmarks[13].y
    smile_metric = ((left_mouth_corner - center_mouth) + (right_mouth_corner - center_mouth)) / 2
    
    # Check eyes squinting (for concentration)
    left_eye_top_to_bottom = abs(landmarks[159].y - landmarks[145].y)
    right_eye_top_to_bottom = abs(landmarks[386].y - landmarks[374].y)
    eye_openness = (left_eye_top_to_bottom + right_eye_top_to_bottom) / 2
    
    # More accurate expression detection
    if mouth_distance > 0.04:  # Open mouth
        if smile_metric > 0.01:  # Smiling with open mouth - engaged positively
            session_data["facial_expressions"]["focused"] += 1
            return "focused"
        else:  # Open mouth without smile - possibly confused/yawning
            session_data["facial_expressions"]["confused"] += 1
            return "confused"
    
    # Concentration indicators: raised eyebrows OR furrowed brow with squinted eyes
    elif (eyebrow_to_eye_distance > 0.025 or  # Raised eyebrows
          (eyebrow_furrow > 0.01 and eye_openness < 0.025)):  # Furrowed brow and squinted eyes
        session_data["facial_expressions"]["focused"] += 1
        return "focused"
    
    # Distraction indicators
    elif eye_movement_count > 10 or (  # Frequent eye movements
          mouth_distance < 0.015 and smile_metric < 0.005):  # Tight-lipped
        session_data["facial_expressions"]["distracted"] += 1
        return "distracted"
    
    # Neutral expression - default
    else:
        session_data["facial_expressions"]["neutral"] += 1
        return "neutral"

def process_frame(frame_data):
    """Process a single video frame for attention tracking"""
    global session_data
    
    # Decode base64 image
    try:
        image_data = base64.b64decode(frame_data.split(',')[1])
        nparr = np.frombuffer(image_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception as e:
        return {
            "error": f"Failed to decode image: {str(e)}"
        }
    
    # Convert to RGB for MediaPipe
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    # Process with Face Mesh
    face_mesh_results = face_mesh.process(rgb_frame)
    
    # Process with Pose
    pose_results = pose.process(rgb_frame)
    
    current_time = time.time()
    metrics = {
        "timestamp": current_time,
        "blink_detected": False,
        "eye_movements": eye_movement_count,
        "posture_changes": posture_change_count,
        "expression": "neutral"
    }
    
    # Process face mesh results
    if face_mesh_results.multi_face_landmarks:
        landmarks = face_mesh_results.multi_face_landmarks[0].landmark
        
        # Detect blink
        metrics["blink_detected"] = detect_blink(landmarks)
        
        # Detect eye movement
        metrics["eye_movements"] = detect_eye_movement(landmarks)
        
        # Detect facial expression
        metrics["expression"] = detect_facial_expression(landmarks)
    
    # Process pose results
    if pose_results.pose_landmarks:
        metrics["posture_changes"] = detect_posture_change(pose_results.pose_landmarks)
    else:
        metrics["posture_changes"] = detect_posture_change(None)
    
    # Add metrics to session data
    session_data["time_series"].append(metrics)
    
    # Calculate attentiveness score just for this frame
    current_attentiveness = 90  # Default score
    
    # Basic attentiveness calculation for real-time updates
    if metrics["blink_detected"]:
        current_attentiveness -= 5
    if eye_movement_count > 10:
        current_attentiveness -= 10
    if posture_change_count > 5:
        current_attentiveness -= 8
    if metrics["expression"] == "distracted":
        current_attentiveness -= 15
    
    # Ensure score is between 0-100
    current_attentiveness = max(0, min(100, current_attentiveness))
    
    # Return metrics with field names that match client-side expectations
    return {
        "blink_count": blink_count,
        "eye_movement_count": eye_movement_count,
        "posture_change_count": posture_change_count,
        "attentiveness_score": current_attentiveness,
        "facial_expression": metrics["expression"]
    }

def calculate_attentiveness_score():
    """Calculate an overall attentiveness score with improved accuracy"""
    global session_data
    
    # Get total frames analyzed
    total_frames = len(session_data["time_series"])
    if total_frames == 0:
        return 75  # Default score if no data - start with a positive assumption
    
    # Calculate focused time percentage from facial expressions
    focused_frames = session_data["facial_expressions"]["focused"] + session_data["facial_expressions"]["neutral"]
    focused_percentage = (focused_frames / total_frames) * 100
    
    # Consider leaning forward as acceptable posture for studying
    # This is a common posture when engaged in learning
    good_posture_frames = session_data["posture_states"]["upright"] + (session_data["posture_states"]["leaning_forward"] * 0.7)
    good_posture_percentage = min(100, (good_posture_frames / total_frames) * 100)
    
    # Determine session duration in seconds
    if len(session_data["time_series"]) >= 2:
        first_timestamp = session_data["time_series"][0]["timestamp"]
        last_timestamp = session_data["time_series"][-1]["timestamp"]
        session_duration = max(1, last_timestamp - first_timestamp)  # Ensure at least 1 second
    else:
        session_duration = 1  # Default to 1 second
    
    # Calculate normalized metrics per minute for fair scoring
    safe_duration = max(session_duration, 0.1)  # Protect against division by zero
    normalized_blinks = (blink_count / safe_duration) * 60  # Blinks per minute
    normalized_eye_movements = (eye_movement_count / safe_duration) * 60  # Eye movements per minute
    normalized_posture_changes = (posture_change_count / safe_duration) * 60  # Posture changes per minute
    
    # Define normal ranges for each metric
    # For average adults, 15-20 blinks per minute is normal
    normal_blinks_range = (8, 20)  # More lenient lower bound
    # 1-5 major eye movements per minute during focused work is reasonable
    normal_eye_movements_range = (1, 5)  # More lenient upper bound
    # 0-3 posture changes per minute during focused work is reasonable
    normal_posture_changes_range = (0, 3)  # More lenient upper bound
    
    # Calculate penalties with reduced weights
    # Blink penalties
    if normalized_blinks < normal_blinks_range[0]:  # Too few blinks (staring)
        blink_penalty = min(15, 3 + (normal_blinks_range[0] - normalized_blinks) * 0.8)
    elif normalized_blinks > normal_blinks_range[1]:  # Too many blinks
        blink_penalty = min(15, (normalized_blinks - normal_blinks_range[1]) * 0.7)
    else:
        blink_penalty = 0
    
    # Penalty for excessive eye movements (distraction)
    if normalized_eye_movements > normal_eye_movements_range[1]:
        eye_movement_penalty = min(20, (normalized_eye_movements - normal_eye_movements_range[1]) * 2.0)
    else:
        eye_movement_penalty = 0
    
    # Penalty for excessive posture changes (fidgeting)
    if normalized_posture_changes > normal_posture_changes_range[1]:
        posture_penalty = min(10, (normalized_posture_changes - normal_posture_changes_range[1]) * 3.0)
    else:
        posture_penalty = 0
    
    # Distraction penalty from facial expressions - reduced impact
    distracted_frames = session_data["facial_expressions"]["distracted"] + session_data["facial_expressions"]["confused"]
    distraction_percentage = (distracted_frames / total_frames) * 100
    distraction_penalty = min(25, distraction_percentage * 0.3)
    
    # Calculate base score with higher weight for focused time
    base_score = (focused_percentage * 0.7) + (good_posture_percentage * 0.3)
    
    # Apply penalties with a minimum score floor
    adjusted_score = max(30, base_score - blink_penalty - eye_movement_penalty - posture_penalty - distraction_penalty)
    
    # For very short sessions, give more benefit of the doubt
    if session_duration < 10:  # Less than 10 seconds
        adjusted_score = max(adjusted_score, 60)  # Minimum score of 60 for very short sessions
    
    # Print detailed scoring information for debugging
    print(f"Attentiveness Score Details:")
    print(f"  Session duration: {session_duration:.1f} seconds")
    print(f"  Metrics: Blinks={normalized_blinks:.1f}/min, Eye Movements={normalized_eye_movements:.1f}/min, Posture Changes={normalized_posture_changes:.1f}/min")
    print(f"  Base Score: {base_score:.2f} (Focus: {focused_percentage:.1f}%, Good Posture: {good_posture_percentage:.1f}%)")
    print(f"  Penalties - Blinks: {blink_penalty:.2f}, Eye Movements: {eye_movement_penalty:.2f}")
    print(f"  Penalties - Posture: {posture_penalty:.2f}, Distraction: {distraction_penalty:.2f}")
    print(f"  Final Score: {adjusted_score:.2f}")
    
    # Ensure score is between 0-100
    return max(0, min(100, adjusted_score))

@app.route('/process_frame', methods=['POST'])
def api_process_frame():
    """API endpoint to process a single video frame"""
    if 'frame' not in request.json:
        return jsonify({'error': 'No frame data provided'}), 400
    
    frame_data = request.json['frame']
    results = process_frame(frame_data)
    
    return jsonify(results)

@app.route('/get_tracking_results', methods=['GET'])
def api_get_tracking_results():
    """API endpoint to get accumulated tracking results"""
    attentiveness_score = calculate_attentiveness_score()
    
    # Format the response to match the client's expected structure
    results = {
        "eyeBlinks": blink_count,
        "eyeMovements": eye_movement_count,
        "postureChanges": posture_change_count,
        "attentivenessScore": attentiveness_score,
        "facialExpressions": session_data["facial_expressions"],
        "postureStates": session_data["posture_states"],
        "sessionData": json.dumps(session_data)
    }
    
    return jsonify(results)

@app.route('/reset_tracking', methods=['POST'])
def api_reset_tracking():
    """API endpoint to reset tracking variables"""
    reset_tracking_vars()
    return jsonify({"status": "Tracking reset successfully"})

@app.route('/health', methods=['GET'])
def health_check():
    """API health check endpoint"""
    return jsonify({"status": "Tracking service is running"})

# Add better error handling for all Flask routes
@app.errorhandler(Exception)
def handle_exception(e):
    """Global exception handler for all routes"""
    logger.error(f"Unhandled exception: {str(e)}", exc_info=True)
    return jsonify({
        "error": "Internal server error",
        "message": str(e),
        "status": "error"
    }), 500

# Health check with detailed status
@app.route('/detailed_health', methods=['GET'])
def detailed_health_check():
    """Detailed API health check endpoint with component status"""
    try:
        # Test MediaPipe
        test_image = np.zeros((100, 100, 3), dtype=np.uint8)
        _ = face_mesh.process(test_image)
        
        return jsonify({
            "status": "online",
            "components": {
                "flask": "ok",
                "opencv": "ok",
                "mediapipe": "ok",
                "face_mesh": "ok",
                "pose": "ok"
            },
            "uptime": time.time() - startup_time
        })
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return jsonify({
            "status": "degraded",
            "error": str(e)
        }), 500

if __name__ == '__main__':
    # Record startup time
    startup_time = time.time()
    logger.info(f"Starting Flask server on port {os.environ.get('PORT', '8000')}")
    
    # Get port from environment variable or use default
    port = int(os.environ.get('PORT', 8000))
    
    # Use threaded=True for better handling of concurrent requests
    # Use best settings for deployment environments
    app.run(
        host='0.0.0.0', 
        port=port,
        threaded=True,
        debug=not is_deployment  # Only use debug mode in development
    )
