import { AIDetectionResult } from '../types';
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
            console.error('AI detection error (falling back to mock):', error);
            // Fallback to mock detection so the app is usable without backend
            return this.mockDetection();
        }
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
