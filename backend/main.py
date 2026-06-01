from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from inference import RoadDamageDetector
import uvicorn
import os
import io
import cv2
import base64
import shutil
import uuid
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
from PIL import Image

from fastapi.responses import FileResponse

app = FastAPI()

# Enable CORS for mobile/web app access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Ideally restrict this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Model
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model", "best.pt")
detector = None

# Temp directory for video processing
TEMP_VIDEO_DIR = os.path.join(BASE_DIR, "temp_videos")
os.makedirs(TEMP_VIDEO_DIR, exist_ok=True)

@app.on_event("startup")
async def startup_event():
    global detector
    print(f"Initializing model from: {MODEL_PATH}")
    if not os.path.exists(MODEL_PATH):
        print(f"WARNING: Model file not found at {MODEL_PATH}")
    else:
        try:
            detector = RoadDamageDetector(MODEL_PATH)
        except Exception as e:
            print(f"Failed to load model: {e}")

@app.get("/health")
async def health_check():
    if detector and detector.model:
        return {"status": "healthy", "message": "Model loaded"}
    return {"status": "unhealthy", "message": "Model not loaded"}

@app.get("/download-apk")
async def download_apk():
    apk_path = os.path.join(BASE_DIR, "crackx.apk")
    if os.path.exists(apk_path):
        return FileResponse(apk_path, media_type='application/vnd.android.package-archive', filename="crackx.apk")
    raise HTTPException(
        status_code=404,
        detail="APK file not found on the server. Please place your compiled 'crackx.apk' inside the 'backend/' directory to enable downloads."
    )

@app.post("/api/detect")
async def detect_damage(image: UploadFile = File(...)):
    if not detector:
        raise HTTPException(status_code=503, detail="Model not initialized")
    
    try:
        contents = await image.read()
        
        # Run inference
        result = detector.predict(contents)
        
        if result:
            return {
                "success": True,
                "detection": {
                    "damageType": result["damageType"],     # crack / pothole
                    "confidence": float(result["confidence"]),
                    "severity": result["severity"],         # low / medium / high
                    "boundingBox": result["boundingBox"]
                }
            }
        else:
            # If no detection found above threshold, return failure? Or mock response if requested?
            # The app likely expects success=false or empty detection?
            # Based on ai.ts, if success=false, it falls back to mock.
            return {"success": False, "message": "No significant damage detected or low confidence"}
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error processing request: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/detect-video")
async def detect_video_damage(video: UploadFile = File(...)):
    if not detector:
        raise HTTPException(status_code=503, detail="Model not initialized")
    
    # Create a unique filename to avoid collisions
    temp_file_name = f"{uuid.uuid4()}_{video.filename}"
    temp_file_path = os.path.join(TEMP_VIDEO_DIR, temp_file_name)
    
    try:
        # Save uploaded video file
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
            
        print(f"🎬 Saved temporary video for analysis: {temp_file_path}")
        
        # Open video with OpenCV
        cap = cv2.VideoCapture(temp_file_path)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Failed to open uploaded video file")
            
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            fps = 30.0
            
        # Extract 1 frame per second
        FRAME_EXTRACTION_RATE = 1
        frame_interval = max(1, int(fps / FRAME_EXTRACTION_RATE))
        
        detections = []
        frame_count = 0
        extracted_count = 0
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            if frame_count % frame_interval == 0:
                extracted_count += 1
                # Run YOLO inference
                _, img_buffer = cv2.imencode('.jpg', frame)
                frame_bytes = img_buffer.tobytes()
                
                result = detector.predict(frame_bytes)
                
                # Check if we got a valid detection
                if result and result.get('confidence', 0) >= detector.conf_threshold:
                    # Resize and compress frame image for lightweight frontend transport
                    h, w = frame.shape[:2]
                    target_w = 640
                    target_h = int(h * (target_w / w))
                    small_frame = cv2.resize(frame, (target_w, target_h))
                    
                    # Encode to low-quality JPEG
                    _, small_buffer = cv2.imencode('.jpg', small_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 50])
                    frame_base64 = base64.b64encode(small_buffer).decode('utf-8')
                    
                    timestamp_sec = frame_count / fps
                    timestamp_str = f"{int(timestamp_sec // 60):02d}:{int(timestamp_sec % 60):02d}"
                    
                    detections.append({
                        "frameIndex": frame_count,
                        "timestamp": timestamp_str,
                        "damageType": result["damageType"],
                        "confidence": float(result["confidence"]),
                        "severity": result["severity"],
                        "boundingBox": result["boundingBox"],
                        "frameImage": f"data:image/jpeg;base64,{frame_base64}"
                    })
                    
            frame_count += 1
            
        cap.release()
        
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            print(f"🗑️ Cleaned up temporary video: {temp_file_path}")
            
        print(f"✅ Video analysis complete. Analyzed {extracted_count} frames. Found {len(detections)} detections.")
        
        return {
            "success": True,
            "detections": detections,
            "frameCount": extracted_count
        }
        
    except Exception as e:
        # Clean up in case of error
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except:
                pass
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    uvicorn.run(app, host="0.0.0.0", port=port)
