/**
 * Road Health Index (RHI) Calculation Service
 * 
 * Calculates a numerical 1-100 score for different city blocks/zones
 * based on damage frequency, severity, and temporal factors
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Report } from '../types';

export interface RHIScore {
    zone: string;
    score: number;
    grade: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical';
    color: string;
    metrics: {
        totalDamages: number;
        highSeverity: number;
        mediumSeverity: number;
        lowSeverity: number;
        avgAge: number;
        pendingRepairs: number;
    };
    lastCalculated: string;
}

export interface RHIHistory {
    zone: string;
    date: string;
    score: number;
}

class RHIService {
    private readonly STORAGE_KEY = '@crackx_rhi_scores';
    private readonly HISTORY_KEY = '@crackx_rhi_history';

    /**
     * Calculate RHI for a specific zone
     * 
     * Algorithm:
     * RHI = 100 - (
     *   (damageCount × weightDamage) + 
     *   (highSeverityCount × weightHigh) + 
     *   (mediumSeverityCount × weightMedium) + 
     *   (lowSeverityCount × weightLow) + 
     *   (avgAgeInDays × weightAge) +
     *   (pendingRepairs × weightPending)
     * )
     * 
     * Weights are calibrated based on impact to road usability
     */
    async calculateZoneRHI(zone: string, reports: Report[]): Promise<RHIScore> {
        // Filter reports for this zone
        const zoneReports = reports.filter(
            (r) => r.location.zone === zone
        );

        if (zoneReports.length === 0) {
            return this.getDefaultRHI(zone);
        }

        // Calculate metrics
        const metrics = this.calculateMetrics(zoneReports);

        // Weight factors (calibrated for Solapur's road conditions)
        const weights = {
            damageCount: 2,
            highSeverity: 15,
            mediumSeverity: 8,
            lowSeverity: 3,
            age: 0.5,
            pending: 10,
        };

        // Calculate damage score
        const damageScore =
            metrics.totalDamages * weights.damageCount +
            metrics.highSeverity * weights.highSeverity +
            metrics.mediumSeverity * weights.mediumSeverity +
            metrics.lowSeverity * weights.lowSeverity +
            metrics.avgAge * weights.age +
            metrics.pendingRepairs * weights.pending;

        // RHI = 100 - damage score (capped at 0-100)
        const rawScore = 100 - damageScore;
        const score = Math.max(0, Math.min(100, Math.round(rawScore)));

        // Determine grade and color
        const { grade, color } = this.getGradeAndColor(score);

        const rhiScore: RHIScore = {
            zone,
            score,
            grade,
            color,
            metrics,
            lastCalculated: new Date().toISOString(),
        };

        // Save to storage
        await this.saveRHIScore(rhiScore);

        // Add to history
        await this.addToHistory(zone, score);

        return rhiScore;
    }

    /**
     * Calculate all zones RHI
     */
    async calculateAllZonesRHI(reports: Report[]): Promise<RHIScore[]> {
        const zones = ['zone1', 'zone4', 'zone8'];
        const rhiScores: RHIScore[] = [];

        for (const zone of zones) {
            const rhi = await this.calculateZoneRHI(zone, reports);
            rhiScores.push(rhi);
        }

        return rhiScores;
    }

    /**
     * Calculate city-wide RHI (average of all zones)
     */
    async calculateCityRHI(reports: Report[]): Promise<RHIScore> {
        const zoneScores = await this.calculateAllZonesRHI(reports);

        const avgScore = Math.round(
            zoneScores.reduce((sum, z) => sum + z.score, 0) / zoneScores.length
        );

        const totalMetrics = zoneScores.reduce(
            (acc, z) => ({
                totalDamages: acc.totalDamages + z.metrics.totalDamages,
                highSeverity: acc.highSeverity + z.metrics.highSeverity,
                mediumSeverity: acc.mediumSeverity + z.metrics.mediumSeverity,
                lowSeverity: acc.lowSeverity + z.metrics.lowSeverity,
                avgAge: (acc.avgAge + z.metrics.avgAge) / 2,
                pendingRepairs: acc.pendingRepairs + z.metrics.pendingRepairs,
            }),
            {
                totalDamages: 0,
                highSeverity: 0,
                mediumSeverity: 0,
                lowSeverity: 0,
                avgAge: 0,
                pendingRepairs: 0,
            }
        );

        const { grade, color } = this.getGradeAndColor(avgScore);

        return {
            zone: 'city',
            score: avgScore,
            grade,
            color,
            metrics: totalMetrics,
            lastCalculated: new Date().toISOString(),
        };
    }

    /**
     * Get RHI history for a zone (last 30 days)
     */
    async getRHIHistory(zone: string): Promise<RHIHistory[]> {
        try {
            const historyJson = await AsyncStorage.getItem(this.HISTORY_KEY);
            if (!historyJson) return [];

            const allHistory: RHIHistory[] = JSON.parse(historyJson);

            // Filter for this zone and last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            return allHistory.filter(
                (h) =>
                    h.zone === zone &&
                    new Date(h.date) >= thirtyDaysAgo
            );
        } catch (error) {
            console.error('Error loading RHI history:', error);
            return [];
        }
    }

    /**
     * Get trend (improving/declining/stable)
     */
    async getRHITrend(zone: string): Promise<'improving' | 'declining' | 'stable'> {
        const history = await this.getRHIHistory(zone);

        if (history.length < 2) return 'stable';

        // Compare last 7 days vs previous 7 days
        const last7Days = history.slice(-7);
        const previous7Days = history.slice(-14, -7);

        if (previous7Days.length === 0) return 'stable';

        const recentAvg =
            last7Days.reduce((sum, h) => sum + h.score, 0) / last7Days.length;
        const previousAvg =
            previous7Days.reduce((sum, h) => sum + h.score, 0) / previous7Days.length;

        const difference = recentAvg - previousAvg;

        if (difference > 2) return 'improving';
        if (difference < -2) return 'declining';
        return 'stable';
    }

    /**
     * Calculate detailed metrics from reports
     * Only counts ACTIVE (pending/in-progress) reports as damages
     * Completed reports with quality ratings provide partial recovery:
     * - 5 stars: 100% recovery (no damage count)
     * - 4 stars: 80% recovery (20% damage count)
     * - 3 stars: 60% recovery (40% damage count)
     * - 2 stars: 40% recovery (60% damage count)
     * - 1 star: 20% recovery (80% damage count)
     * - No rating: 50% recovery (50% damage count)
     */
    private calculateMetrics(reports: Report[]) {
        const now = new Date().getTime();

        const metrics = {
            totalDamages: 0,
            highSeverity: 0,
            mediumSeverity: 0,
            lowSeverity: 0,
            avgAge: 0,
            pendingRepairs: 0,
        };

        let totalAge = 0;
        let activeReportCount = 0;

        reports.forEach((report) => {
            const isCompleted = report.status === 'completed';
            const rating = report.citizenRating || 0;

            // Calculate quality factor for completed reports
            // 5★ = 0% damage, 4★ = 20%, 3★ = 40%, 2★ = 60%, 1★ = 80%
            let qualityFactor = 1.0; // Default: full damage

            if (isCompleted && rating > 0) {
                // Recovery percentage based on rating
                const recoveryPercent = (rating / 5) * 100; // 5★=100%, 4★=80%, etc.
                qualityFactor = 1 - (recoveryPercent / 100); // Remaining damage factor
            } else if (isCompleted && rating === 0) {
                qualityFactor = 0.5; // No rating = 50% recovery
            }

            // Only count non-completed reports at full weight
            // Completed reports with poor ratings still count partially
            if (!isCompleted || qualityFactor > 0) {
                const severity = report.aiDetection?.severity || 'low';

                // Add fractional damage based on quality
                const damageWeight = isCompleted ? qualityFactor : 1.0;

                metrics.totalDamages += damageWeight;

                if (severity === 'high') {
                    metrics.highSeverity += damageWeight;
                } else if (severity === 'medium') {
                    metrics.mediumSeverity += damageWeight;
                } else {
                    metrics.lowSeverity += damageWeight;
                }

                // Calculate age for reports that still impact RHI
                if (damageWeight > 0) {
                    const reportDate = new Date(report.createdAt).getTime();
                    const ageInDays = (now - reportDate) / (1000 * 60 * 60 * 24);
                    totalAge += ageInDays * damageWeight;
                    activeReportCount += damageWeight;
                }
            }

            // Count pending repairs (pending + in-progress)
            if (report.status === 'pending' || report.status === 'in-progress') {
                metrics.pendingRepairs++;
            }
        });

        metrics.avgAge = activeReportCount > 0 ? totalAge / activeReportCount : 0;

        return metrics;
    }

    /**
     * Determine grade and color based on score
     */
    private getGradeAndColor(score: number): { grade: RHIScore['grade']; color: string } {
        if (score >= 85) {
            return { grade: 'Excellent', color: '#10b981' }; // Green
        } else if (score >= 70) {
            return { grade: 'Good', color: '#3b82f6' }; // Blue
        } else if (score >= 50) {
            return { grade: 'Fair', color: '#f59e0b' }; // Orange
        } else if (score >= 30) {
            return { grade: 'Poor', color: '#f97316' }; // Dark Orange
        } else {
            return { grade: 'Critical', color: '#ef4444' }; // Red
        }
    }

    /**
     * Get default RHI for zones with no reports
     */
    private getDefaultRHI(zone: string): RHIScore {
        return {
            zone,
            score: 100,
            grade: 'Excellent',
            color: '#10b981',
            metrics: {
                totalDamages: 0,
                highSeverity: 0,
                mediumSeverity: 0,
                lowSeverity: 0,
                avgAge: 0,
                pendingRepairs: 0,
            },
            lastCalculated: new Date().toISOString(),
        };
    }

    /**
     * Save RHI score to storage
     */
    private async saveRHIScore(rhiScore: RHIScore): Promise<void> {
        try {
            const scoresJson = await AsyncStorage.getItem(this.STORAGE_KEY);
            const scores: RHIScore[] = scoresJson ? JSON.parse(scoresJson) : [];

            // Update or add score for this zone
            const existingIndex = scores.findIndex((s) => s.zone === rhiScore.zone);
            if (existingIndex >= 0) {
                scores[existingIndex] = rhiScore;
            } else {
                scores.push(rhiScore);
            }

            await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(scores));
        } catch (error) {
            console.error('Error saving RHI score:', error);
        }
    }

    /**
     * Add RHI score to history
     */
    private async addToHistory(zone: string, score: number): Promise<void> {
        try {
            const historyJson = await AsyncStorage.getItem(this.HISTORY_KEY);
            const history: RHIHistory[] = historyJson ? JSON.parse(historyJson) : [];

            const today = new Date().toISOString().split('T')[0];

            // Check if we already have an entry for today
            const existingIndex = history.findIndex(
                (h) => h.zone === zone && h.date === today
            );

            if (existingIndex >= 0) {
                history[existingIndex].score = score;
            } else {
                history.push({ zone, date: today, score });
            }

            // Keep only last 90 days
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            const filteredHistory = history.filter(
                (h) => new Date(h.date) >= ninetyDaysAgo
            );

            await AsyncStorage.setItem(this.HISTORY_KEY, JSON.stringify(filteredHistory));
        } catch (error) {
            console.error('Error saving RHI history:', error);
        }
    }

    /**
     * Get cached RHI scores
     */
    async getCachedRHIScores(): Promise<RHIScore[]> {
        try {
            const scoresJson = await AsyncStorage.getItem(this.STORAGE_KEY);
            return scoresJson ? JSON.parse(scoresJson) : [];
        } catch (error) {
            console.error('Error loading cached RHI scores:', error);
            return [];
        }
    }

    /**
     * Get RHI score for specific zone from cache
     */
    async getCachedZoneRHI(zone: string): Promise<RHIScore | null> {
        const scores = await this.getCachedRHIScores();
        return scores.find((s) => s.zone === zone) || null;
    }
}

export const rhiService = new RHIService();
