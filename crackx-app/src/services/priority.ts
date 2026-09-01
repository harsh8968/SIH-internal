import { SeverityLevel } from '../types';
import { normalizeText } from './classify';

/**
 * Complaint Priority Scoring
 *
 * Severity alone does not decide what an officer should fix first. A medium
 * pothole outside a school gate that eleven people have reported over two weeks
 * outranks a fresh high-severity crack on an empty service road. This turns
 * those competing signals into one 0-100 number, and shows its working.
 *
 *   severity      how bad the defect is           (vision)
 *   + exposure    who is near it and at risk      (text)
 *   + volume      how many people reported it     (duplicates)
 *   + age         how long it has been ignored    (clock)
 *   = priority
 *
 * Every contribution is returned as a labelled factor. An officer who cannot
 * see why a complaint is ranked 87 has no reason to believe the 87.
 */

/** The worst a defect can score on the evidence of the photograph alone. */
const SEVERITY_POINTS: Record<SeverityLevel, number> = {
    high: 35,
    medium: 20,
    low: 8,
};

/**
 * Places and people that raise the cost of leaving a defect unfixed. Matched
 * against the citizen's own words, in any of the supported languages.
 *
 * Indic entries are stems, not dictionary forms: Marathi and Hindi inflect the
 * noun, so "शाळेजवळ" (near the school) contains "शाळ" but never "शाळा".
 */
const EXPOSURE_TERMS: { t: string; points: number; label: string }[] = [
    { t: 'school', points: 10, label: 'near a school' },
    { t: 'शाळ', points: 10, label: 'near a school' },
    { t: 'स्कूल', points: 10, label: 'near a school' },
    { t: 'ಶಾಲ', points: 10, label: 'near a school' },
    { t: 'hospital', points: 10, label: 'near a hospital' },
    { t: 'रुग्णालय', points: 10, label: 'near a hospital' },
    { t: 'अस्पताल', points: 10, label: 'near a hospital' },
    { t: 'ಆಸ್ಪತ್ರ', points: 10, label: 'near a hospital' },
    { t: 'children', points: 8, label: 'children at risk' },
    { t: 'child', points: 8, label: 'children at risk' },
    { t: 'मुल', points: 8, label: 'children at risk' },
    { t: 'बच्च', points: 8, label: 'children at risk' },
    { t: 'accident', points: 10, label: 'accidents reported' },
    { t: 'अपघात', points: 10, label: 'accidents reported' },
    { t: 'दुर्घटना', points: 10, label: 'accidents reported' },
    { t: 'injured', points: 10, label: 'injuries reported' },
    { t: 'जखमी', points: 10, label: 'injuries reported' },
    { t: 'skid', points: 6, label: 'vehicles skidding' },
    { t: 'skidding', points: 6, label: 'vehicles skidding' },
    { t: 'घसरत', points: 6, label: 'vehicles skidding' },
    { t: 'फिसल', points: 6, label: 'vehicles skidding' },
    { t: 'elderly', points: 6, label: 'elderly at risk' },
    { t: 'blind', points: 6, label: 'poor visibility' },
    { t: 'night', points: 4, label: 'hazardous at night' },
    { t: 'bus stop', points: 6, label: 'near a bus stop' },
    { t: 'market', points: 4, label: 'busy area' },
];

/** Exposure is a modifier, not the whole story; it must not swamp severity. */
const MAX_EXPOSURE_POINTS = 25;

/** Each additional citizen reporting the same defect is corroboration. */
const POINTS_PER_DUPLICATE = 5;
const MAX_DUPLICATE_POINTS = 15;

/** A complaint left open slowly escalates, so nothing rots at the bottom. */
const POINTS_PER_DAY = 1.5;
const MAX_AGE_POINTS = 15;

export type PriorityBand = 'critical' | 'high' | 'medium' | 'low';

export interface PriorityFactor {
    label: string;
    points: number;
}

export interface PriorityResult {
    /** 0-100, rounded. */
    score: number;
    band: PriorityBand;
    /** What made up the score, largest contribution first. */
    factors: PriorityFactor[];
}

export interface PriorityInput {
    severity?: SeverityLevel;
    /** The citizen's description; exposure signals are read from it. */
    text?: string;
    /** How many OTHER complaints describe the same defect. */
    duplicateCount?: number;
    /** Whole days since the complaint was filed. */
    ageDays?: number;
}

function bandFor(score: number): PriorityBand {
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
}

/** ASCII terms match whole words; Indic terms match as substrings. */
function containsTerm(haystack: string, term: string): boolean {
    const isAscii = /^[\x00-\x7F]+$/.test(term);
    if (!isAscii) return haystack.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|\\s)' + escaped + '\\w{0,3}(\\s|$)').test(haystack);
}

/**
 * Score a complaint 0-100 and explain the number.
 *
 * Everything is optional: a bare photo-only report still scores, on severity
 * alone, rather than dropping out of the ranking entirely.
 */
export function computePriority(input: PriorityInput): PriorityResult {
    const factors: PriorityFactor[] = [];

    const severity = input.severity || 'low';
    factors.push({
        label: `${severity} severity`,
        points: SEVERITY_POINTS[severity],
    });

    const normalized = normalizeText(input.text || '');
    if (normalized) {
        // One label per distinct risk, so "school" and "children" both count but
        // "skid" and "skidding" in one sentence do not score twice.
        const seen = new Set<string>();
        let exposure = 0;
        for (const { t, points, label } of EXPOSURE_TERMS) {
            if (seen.has(label)) continue;
            if (!containsTerm(normalized, t)) continue;
            seen.add(label);
            exposure += points;
        }
        // One scored line naming every risk found, so the breakdown stays short
        // while still saying exactly what raised the score.
        if (exposure > 0) {
            factors.push({
                label: Array.from(seen).join(', '),
                points: Math.min(exposure, MAX_EXPOSURE_POINTS),
            });
        }
    }

    const duplicates = Math.max(0, input.duplicateCount || 0);
    if (duplicates > 0) {
        factors.push({
            label: `${duplicates} more citizen${duplicates > 1 ? 's' : ''} reported this`,
            points: Math.min(duplicates * POINTS_PER_DUPLICATE, MAX_DUPLICATE_POINTS),
        });
    }

    const ageDays = Math.max(0, Math.floor(input.ageDays || 0));
    if (ageDays > 0) {
        factors.push({
            label: `open ${ageDays} day${ageDays > 1 ? 's' : ''}`,
            points: Math.min(ageDays * POINTS_PER_DAY, MAX_AGE_POINTS),
        });
    }

    const raw = factors.reduce((sum, f) => sum + f.points, 0);
    const score = Math.max(0, Math.min(100, Math.round(raw)));

    return {
        score,
        band: bandFor(score),
        factors: factors.filter((f) => f.points > 0).sort((a, b) => b.points - a.points),
    };
}
