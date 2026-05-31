"""
Video Processing Service for Road Damage Detection
Watches for new video reports and analyzes them frame-by-frame using YOLO model
"""

import time
import os
import sys
import cv2
import requests
from pathlib import Path
from supabase import create_client, Client
from inference import RoadDamageDetector
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Supabase Configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')  # Use service key for backend

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env file")
    sys.exit(1)

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Initialize YOLO model
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model" / "best.pt"
detector = RoadDamageDetector(str(MODEL_PATH))

# Configuration
POLLING_INTERVAL = 30  # seconds
FRAME_EXTRACTION_RATE = 1  # Extract 1 frame per second
MIN_CONFIDENCE_THRESHOLD = 0.3
TEMP_DIR = BASE_DIR / "temp_videos"
TEMP_DIR.mkdir(exist_ok=True)

print(f"🎬 Video Processor Started")
print(f"📍 Model Path: {MODEL_PATH}")
print(f"🔄 Polling Interval: {POLLING_INTERVAL}s")
print(f"📁 Temp Directory: {TEMP_DIR}")


def get_pending_video_reports():
    """
    Query Supabase for reports with videos that haven't been analyzed
    Returns reports where videoUri exists AND confidence = 0
    """
    try:
        response = supabase.table('reports')\
            .select('*')\
            .not_.is_('video_uri', 'null')\
            .eq('ai_detection->>confidence', '0')\
            .execute()
        
        return response.data if response.data else []
    except Exception as e:
        print(f"❌ Error fetching pending reports: {e}")
        return []


def download_video(video_url, report_id):
    """Download video from Supabase storage to temp directory"""
    try:
        print(f"📥 Downloading video for report {report_id}...")
        response = requests.get(video_url, stream=True)
        response.raise_for_status()
        
        video_path = TEMP_DIR / f"{report_id}.mp4"
        with open(video_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f"✅ Video downloaded: {video_path}")
        return video_path
    except Exception as e:
        print(f"❌ Error downloading video: {e}")
        return None


def extract_frames(video_path, report_id):
    """Extract frames from video at specified rate"""
    try:
        print(f"🎞️  Extracting frames from {video_path}...")
        
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            print(f"❌ Failed to open video: {video_path}")
            return []
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_interval = int(fps / FRAME_EXTRACTION_RATE)  # Every N frames
        
        frames = []
        frame_count = 0
        extracted_count = 0
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            if frame_count % frame_interval == 0:
               frames.append(frame)
                extracted_count += 1
            
            frame_count += 1
        
        cap.release()
        print(f"✅ Extracted {extracted_count} frames from {frame_count} total frames")
        return frames
        
    except Exception as e:
        print(f"❌ Error extracting frames: {e}")
        return []


def analyze_frames(frames):
    """Analyze each frame with YOLO model and aggregate results"""
    try:
        print(f"🔍 Analyzing {len(frames)} frames...")
        
        detections = []
        
        for idx, frame in enumerate(frames):
            # Convert frame to bytes for detector
            _, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            
            # Run detection
            result = detector.predict(frame_bytes)
            
            if result and result['confidence'] >= MIN_CONFIDENCE_THRESHOLD:
                detections.append(result)
                print(f"  Frame {idx+1}/{len(frames)}: {result['damageType']} ({result['confidence']:.2f})")
            else:
                print(f"  Frame {idx+1}/{len(frames)}: No detection")
        
        if not detections:
            print("❌ No confident detections found in any frame")
            return None
        
        # Aggregate results - find best detection
        best_detection = max(detections, key=lambda x: x['confidence'])
        
        # Calculate statistics
        damage_types = {}
        for d in detections:
            dt = d['damageType']
            damage_types[dt] = damage_types.get(dt, 0) + 1
        
        most_common_type = max(damage_types, key=damage_types.get)
        
        print(f"✅ Analysis Complete:")
        print(f"   Frames with damage: {len(detections)}/{len(frames)}")
        print(f"   Most common: {most_common_type} ({damage_types[most_common_type]} frames)")
        print(f"   Best detection: {best_detection['damageType']} ({best_detection['confidence']:.2f})")
        
        return best_detection
        
    except Exception as e:
        print(f"❌ Error analyzing frames: {e}")
        return None


def update_report_with_ai_results(report_id, detection):
    """Update Supabase report with AI detection results"""
    try:
        print(f"💾 Updating report {report_id} with AI results...")
        
        ai_detection = {
            'damageType': detection['damageType'],
            'confidence': float(detection['confidence']),
            'severity': detection['severity'],
            'boundingBox': detection['boundingBox']
        }
        
        response = supabase.table('reports')\
            .update({'ai_detection': ai_detection})\
            .eq('id', report_id)\
            .execute()
        
        print(f"✅ Report updated successfully")
        return True
        
    except Exception as e:
        print(f"❌ Error updating report: {e}")
        return False


def cleanup_temp_files(report_id):
    """Delete temporary video file"""
    try:
        video_path = TEMP_DIR / f"{report_id}.mp4"
        if video_path.exists():
            video_path.unlink()
            print(f"🗑️  Cleaned up temp file: {video_path}")
    except Exception as e:
        print(f"⚠️  Warning: Failed to cleanup temp file: {e}")


def process_video_report(report):
    """Main processing function for a single video report"""
    report_id = report['id']
    video_url = report['video_uri']
    
    print(f"\n{'='*60}")
    print(f"🎬 Processing Video Report: {report_id}")
    print(f"{'='*60}")
    
    try:
        # Step 1: Download video
        video_path = download_video(video_url, report_id)
        if not video_path:
            return False
        
        # Step 2: Extract frames
        frames = extract_frames(video_path, report_id)
        if not frames:
            cleanup_temp_files(report_id)
            return False
        
        # Step 3: Analyze frames with YOLO
        detection = analyze_frames(frames)
        if not detection:
            cleanup_temp_files(report_id)
            return False
        
        # Step 4: Update database
        success = update_report_with_ai_results(report_id, detection)
        
        # Step 5: Cleanup
        cleanup_temp_files(report_id)
        
        if success:
            print(f"✅ Successfully processed report {report_id}")
        
        return success
        
    except Exception as e:
        print(f"❌ Error processing report {report_id}: {e}")
        cleanup_temp_files(report_id)
        return False


def main():
    """Main polling loop"""
    print("\n🚀 Starting Video Processing Service...")
    print("👀 Watching for new video reports...\n")
    
    while True:
        try:
            # Get pending reports
            pending_reports = get_pending_video_reports()
            
            if pending_reports:
                print(f"\n📋 Found {len(pending_reports)} pending video report(s)")
                
                for report in pending_reports:
                    process_video_report(report)
            else:
                print(f"⏳ No pending videos. Waiting {POLLING_INTERVAL}s...")
            
            # Wait before next poll
            time.sleep(POLLING_INTERVAL)
            
        except KeyboardInterrupt:
            print("\n\n⛔ Shutting down video processor...")
            break
        except Exception as e:
            print(f"❌ Unexpected error in main loop: {e}")
            time.sleep(POLLING_INTERVAL)


if __name__ == "__main__":
    main()
