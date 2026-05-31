/**
 * Generate a unique ID
 */
export const generateId = (): string => {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Format date to readable string
 */
export const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

/**
 * Format confidence score as percentage
 */
export const formatConfidence = (confidence: number): string => {
    return `${(confidence * 100).toFixed(0)}%`;
};

/**
 * Get severity color
 */
export const getSeverityColor = (severity: 'low' | 'medium' | 'high'): string => {
    const colors = {
        low: '#10b981',
        medium: '#f59e0b',
        high: '#ef4444',
    };
    return colors[severity];
};

/**
 * Truncate text
 */
export const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
};

/**
 * Calculate Road Health Index
 * Based on number of damages, their severity, and completion status
 * - Pending/In-Progress damages DECREASE health
 * - Completed repairs INCREASE health
 */
export const calculateRoadHealthIndex = (
    totalDamages: number,
    severityDistribution: { low: number; medium: number; high: number },
    completedRepairs?: number
): number => {
    // Start with base health of 100
    let healthIndex = 100;

    if (totalDamages === 0) return 100;

    // Weight different severities (negative impact)
    const weightedDamageScore =
        severityDistribution.low * 1 +
        severityDistribution.medium * 2 +
        severityDistribution.high * 3;

    // Calculate damage impact (reduces health)
    const maxPossibleDamageScore = totalDamages * 3;
    const damageImpact = (weightedDamageScore / maxPossibleDamageScore) * 100;

    // Subtract damage impact
    healthIndex -= damageImpact;

    // Add bonus for completed repairs (positive impact)
    if (completedRepairs && completedRepairs > 0) {
        // Each completed repair adds back health
        // More severe repairs that are completed add more health
        const repairBonus = Math.min(30, completedRepairs * 5); // Cap at +30
        healthIndex += repairBonus;
    }

    // Ensure health stays within 0-100 range
    healthIndex = Math.max(0, Math.min(100, healthIndex));

    return Math.round(healthIndex);
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Validate phone number (Indian format)
 */
export const isValidPhone = (phone: string): boolean => {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone);
};
