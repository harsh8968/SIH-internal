from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from inference import RoadDamageDetector
import uvicorn
import os
import io
from PIL import Image

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

# Background Task Management
import asyncio
from video_processor import get_pending_video_reports, process_video_report

async def video_processing_loop():
    print("🚀 Background Video Processing Task Started")
    while True:
        try:
            # Run blocking DB/IO operations in a thread to avoid blocking the event loop
            pending_reports = await asyncio.to_thread(get_pending_video_reports)
            
            if pending_reports:
                print(f"📋 Found {len(pending_reports)} pending video report(s)")
                for report in pending_reports:
                    await asyncio.to_thread(process_video_report, report)
            
            # Wait 30 seconds before next poll
            await asyncio.sleep(30)
            
        except asyncio.CancelledError:
            print("⛔ Video processing task cancelled")
            break
        except Exception as e:
            print(f"❌ Error in video processing loop: {e}")
            await asyncio.sleep(30)

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
    
    # Start background task
    asyncio.create_task(video_processing_loop())

@app.get("/health")
async def health_check():
    if detector and detector.model:
        return {"status": "healthy", "message": "Model loaded"}
    return {"status": "unhealthy", "message": "Model not loaded"}

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
            return {"success": False, "message": "No significant damage detected or low confidence"}
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error processing request: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)
