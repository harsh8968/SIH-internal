import traceback
from PIL import Image
import io
from ultralytics import YOLO

class RoadDamageDetector:
    def __init__(self, model_path):
        self.model_path = model_path
        self.model = None
        # Default severity mapping
        self.default_severity_map = {
            'crack': 'low',
            'longitudinal crack': 'low',
            'transverse crack': 'low',
            'alligator crack': 'medium',
            'pothole': 'high',
            'd00': 'low',
            'd10': 'low',
            'd20': 'medium',
            'd40': 'high'
        }
        self._load_model()

    def _load_model(self):
        print(f"Loading YOLO model from {self.model_path}...")
        try:
            self.model = YOLO(self.model_path)
            print("Model loaded successfully!")
            if hasattr(self.model, 'names'):
                print(f"Classes: {self.model.names}")
        except Exception as e:
            print(f"Error loading model: {e}")
            traceback.print_exc()
            self.model = None

    def predict(self, image_data: bytes):
        if not self.model:
            print("Model not loaded.")
            return None

        try:
            # Convert bytes to PIL Image
            image = Image.open(io.BytesIO(image_data))
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # DEBUG: Save image to verify content
            # handle potential save errors gracefully
            try:
                debug_path = "debug_received_image.jpg"
                image.save(debug_path)
                print(f"Saved debug image to {debug_path}")
            except Exception as e:
                print(f"Warning: Failed to save debug image: {e}")

            # Run inference
            print(f"Running inference on image of size {image.size}...")
            # Low confidence to catch everything
            results = self.model(image, conf=0.01, verbose=True) 
            
            if not results:
                print("Results list is empty.")
                return None

            return self._process_detections(results[0], image.size)
        except Exception as e:
            print(f"Error during prediction: {e}")
            traceback.print_exc()
            return None

    def _process_detections(self, result, img_size):
        width, height = img_size
        best_detection = None
        max_score = 0.0

        for box in result.boxes:
            score = float(box.conf[0])
            class_id = int(box.cls[0])
            if hasattr(result, 'names'):
                class_name = result.names[class_id]
            else:
                class_name = str(class_id)
            
            # Standardize YOLO xyxyn [x1, y1, x2, y2] normalized
            xyxyn = box.xyxyn[0].tolist()
            x1, y1, x2, y2 = xyxyn
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(1, x2), min(1, y2)

            box_area = (x2 - x1) * (y2 - y1)
            
            damage_type = self._map_class_to_damage_type(class_name)
            base_severity = self._get_base_severity(class_name)
            severity = self._calculate_severity(base_severity, score, box_area)

            detection = {
                "damageType": damage_type,
                "confidence": score,
                "severity": severity,
                "boundingBox": {
                    "y": float(y1),
                    "x": float(x1),
                    "height": float(y2 - y1),
                    "width": float(x2 - x1)
                },
                "class_id": class_id,
                "class_name": class_name
            }

            print(f"---> Found {class_name} ({damage_type}) - Conf: {score:.2f}")

            if score > max_score:
                max_score = score
                best_detection = detection
        
        if best_detection:
            print(f"✅ Final Result: {best_detection['damageType']} ({best_detection['severity']}, {best_detection['confidence']:.2f})")
        else:
            print("❌ No confident detection found.")

        return best_detection

    def _map_class_to_damage_type(self, class_name):
        name_lower = class_name.lower()
        if 'pothole' in name_lower or 'd40' in name_lower:
            return 'pothole'
        elif 'crack' in name_lower or 'd00' in name_lower or 'd10' in name_lower or 'd20' in name_lower:
            return 'crack'
        elif 'alligator' in name_lower:
            return 'Alligator Crack'
        return 'other'

    def _get_base_severity(self, class_name):
        name_lower = class_name.lower()
        for key, severity in self.default_severity_map.items():
            if key.lower() in name_lower:
                return severity
        return 'low'

    def _calculate_severity(self, base_severity, confidence, box_area):
        level_map = {'low': 1, 'medium': 2, 'high': 3}
        reverse_map = {1: 'low', 2: 'medium', 3: 'high'}
        current_level = level_map.get(base_severity, 1)
        if box_area > 0.05:
            current_level += 1
        current_level = min(current_level, 3)
        return reverse_map[current_level]
