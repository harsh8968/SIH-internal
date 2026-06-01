import { AIDetectionResult, AIVideoDetectionResult } from '../types';
import { API_BASE_URL, FEATURES, TIMEOUTS } from '../config/api';

class AIService {
    /**
     * Real AI detection using backend YOLO model
     */
    async detectDamage(imageUri: string): Promise<AIDetectionResult> {
        if (!FEATURES.USE_REAL_AI) {
            console.log('🤖 AI Detection: using mock mode (Real AI disabled)');
            return this.mockDetection();
        }

        try {
            // Create FormData to send image
            const formData = new FormData();

            // Convert image URI to blob
            const uriToBlob = (uri: string): Promise<Blob> => {
                return new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.onload = function () {
                        resolve(xhr.response);
                    };
                    xhr.onerror = function (e) {
                        console.error('❌ uriToBlob failed:', e);
                        reject(new Error('uriToBlob failed'));
                    };
                    xhr.responseType = 'blob';
                    xhr.open('GET', uri, true);
                    xhr.send(null);
                });
            };

            const blob = await uriToBlob(imageUri);

            // Append image to form data
            formData.append('image', blob, 'damage.jpg');

            // Send to backend API
            const apiResponse = await fetch(`${API_BASE_URL}/detect`, {
                method: 'POST',
                body: formData,
            });

            if (!apiResponse.ok) {
                throw new Error('AI detection failed');
            }

            const data = await apiResponse.json();

            if (data.success && data.detection) {
                return {
                    damageType: data.detection.damageType,
                    confidence: data.detection.confidence,
                    severity: data.detection.severity,
                    boundingBox: data.detection.boundingBox,
                };
            } else {
                console.log('AI: No significant damage detected.');
                return {
                    damageType: 'other', // or 'none' if your types allow
                    confidence: 0,
                    severity: 'low',
                    boundingBox: { x: 0, y: 0, width: 0, height: 0 }
                };
            }
        } catch (error) {
            console.error('AI detection error:', error);
            // If we are expecting real AI, do not return random false-positive mocks
            if (FEATURES.USE_REAL_AI) {
                return {
                    damageType: 'other',
                    confidence: 0,
                    severity: 'low',
                    boundingBox: { x: 0, y: 0, width: 0, height: 0 }
                };
            }
            return this.mockDetection();
        }
    }

    /**
     * Real AI video detection using backend YOLO model on each frame
     */
    async detectVideo(videoUri: string): Promise<AIVideoDetectionResult[]> {
        if (!FEATURES.USE_REAL_AI) {
            console.log('🤖 AI Video Detection: using mock mode (Real AI disabled)');
            return this.mockVideoDetections();
        }

        try {
            // Create FormData to send video
            const formData = new FormData();

            // Convert video URI to blob
            const uriToBlob = (uri: string): Promise<Blob> => {
                return new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.onload = function () {
                        resolve(xhr.response);
                    };
                    xhr.onerror = function (e) {
                        console.error('❌ uriToBlob for video failed:', e);
                        reject(new Error('uriToBlob for video failed'));
                    };
                    xhr.responseType = 'blob';
                    xhr.open('GET', uri, true);
                    xhr.send(null);
                });
            };

            const blob = await uriToBlob(videoUri);

            // Append video to form data
            formData.append('video', blob, 'video.mp4');

            console.log(`📤 Sending video to backend for frame-by-frame analysis: ${API_BASE_URL}/detect-video`);

            // Send to backend API
            const apiResponse = await fetch(`${API_BASE_URL}/detect-video`, {
                method: 'POST',
                body: formData,
            });

            if (!apiResponse.ok) {
                throw new Error('AI video detection failed');
            }

            const data = await apiResponse.json();

            if (data.success && data.detections) {
                return data.detections;
            } else {
                console.log('AI Video: No significant damage detected in any frames.');
                return [];
            }
        } catch (error) {
            console.error('AI video detection error:', error);
            // Return empty list on failure when real AI is active
            return [];
        }
    }

    /**
     * Mock video detection as fallback in mock mode
     */
    private mockVideoDetections(): AIVideoDetectionResult[] {
        return [
            {
                frameIndex: 3,
                timestamp: "00:03",
                damageType: "pothole",
                confidence: 0.82,
                severity: "high",
                boundingBox: { x: 0.15, y: 0.2, width: 0.35, height: 0.3 },
                frameImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
            },
            {
                frameIndex: 7,
                timestamp: "00:07",
                damageType: "crack",
                confidence: 0.68,
                severity: "medium",
                boundingBox: { x: 0.4, y: 0.5, width: 0.25, height: 0.2 },
                frameImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
            }
        ];
    }

    /**
     * Mock detection as fallback
     */
    private mockDetection(): AIDetectionResult {
        const damageTypes: any[] = ['crack', 'pothole', 'other'];
        const damageType = damageTypes[Math.floor(Math.random() * damageTypes.length)];
        const confidence = 0.6 + Math.random() * 0.35;

        return {
            damageType,
            confidence: parseFloat(confidence.toFixed(2)),
            severity: this.calculateSeverity(confidence),
            boundingBox: {
                x: Math.random() * 0.3,
                y: Math.random() * 0.3,
                width: 0.2 + Math.random() * 0.4,
                height: 0.2 + Math.random() * 0.4,
            },
        };
    }

    /**
     * Calculate severity based on confidence score
     */
    private calculateSeverity(confidence: number): 'low' | 'medium' | 'high' {
        if (confidence >= 0.8) {
            return 'high';
        } else if (confidence >= 0.6) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    /**
     * Check if backend API is available
     */
    async checkAPIHealth(): Promise<boolean> {
        try {
            const response = await fetch(`${API_BASE_URL.replace('/api', '')}/health`, {
                method: 'GET',
            });
            const data = await response.json();
            return data.status === 'healthy';
        } catch (error) {
            console.error('API health check failed:', error);
            return false;
        }
    }
}

export default new AIService();
