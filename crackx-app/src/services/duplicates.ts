import { Report, ReportStatus, Location as LocationType } from '../types';
import locationService from './location';

/**
 * Duplicate Complaint Detection
 *
 * Several citizens reporting the same pothole should produce one work order, not
 * five. This finds complaints that describe the same physical defect so the RSO
 * can fix it once and close them together.
 *
 *   candidate report
 *         |
 *         +-- same damage type?          (unclassified matches anything)
 *         +-- other report still open?   (a repaired defect that returns is a
 *         |                               recurrence, NOT a duplicate)
 *         +-- within 25 m?               -> duplicate, matchedBy 'location'
 *              |
 *              no usable GPS on either side
 *              +-- same road name AND same zone? -> duplicate, matchedBy 'road'
 */

/**
 * Phone GPS lands within roughly 5-15 m of truth, and two people photographing
 * one pothole stand on opposite sides of it. A tighter radius splits a single
 * defect into several complaints; a much wider one merges genuinely separate
 * potholes on the same stretch of road.
 */
export const DUPLICATE_RADIUS_METERS = 25;

/**
 * Only an open complaint can be duplicated. If a defect was repaired and someone
 * reports it again, that is a new issue and very often a signal of bad repair
 * work, so folding it into the closed report would hide exactly what an RSO
 * needs to see.
 */
const OPEN_STATUSES: ReportStatus[] = ['pending', 'in-progress', 'verification-pending'];

/**
 * 'manual' means the citizen reported something the model did not classify, and
 * 'other' means the model found nothing specific. Neither carries a claim about
 * what the defect is, so neither should ever rule a match out.
 */
const UNCLASSIFIED_TYPES = new Set(['manual', 'other']);

/**
 * Everything the check actually reads. Narrower than Report so a complaint can
 * be screened before its photo is uploaded; a full Report satisfies it.
 */
export type DuplicateCandidate = Pick<Report, 'id' | 'citizenId' | 'location'> & {
    aiDetection?: Report['aiDetection'];
};

export interface DuplicateMatch {
    report: Report;
    /** Metres apart, or null when matched by road name because GPS was unusable. */
    distanceMeters: number | null;
    matchedBy: 'location' | 'road';
    /** True when the same citizen filed both, i.e. an accidental double submit. */
    isSameReporter: boolean;
}

/**
 * ReportDamageScreen writes latitude/longitude 0,0 when a citizen picks a zone
 * without ever capturing a position. That is a sentinel, not a place in the Gulf
 * of Guinea, and two such reports are not 0 m apart.
 */
function hasUsableCoords(loc?: LocationType | null): boolean {
    if (!loc) return false;
    const { latitude, longitude } = loc;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    return !(latitude === 0 && longitude === 0);
}

function typesMatch(a?: string, b?: string): boolean {
    if (!a || !b) return true;
    if (UNCLASSIFIED_TYPES.has(a) || UNCLASSIFIED_TYPES.has(b)) return true;
    return a === b;
}

function normalizeRoad(loc?: LocationType | null): string {
    return (loc?.roadName || '').trim().toLowerCase();
}

/**
 * Find open complaints that describe the same defect as `candidate`.
 * Returned closest-first. An empty array means this is a genuinely new issue.
 */
export function findDuplicates(candidate: DuplicateCandidate, existing: Report[]): DuplicateMatch[] {
    const candidateType = candidate.aiDetection?.damageType;
    const candidateHasCoords = hasUsableCoords(candidate.location);
    const candidateRoad = normalizeRoad(candidate.location);

    const matches: DuplicateMatch[] = [];

    for (const other of existing) {
        if (other.id === candidate.id) continue;
        if (!OPEN_STATUSES.includes(other.status)) continue;
        if (!typesMatch(candidateType, other.aiDetection?.damageType)) continue;

        const isSameReporter = other.citizenId === candidate.citizenId;

        if (candidateHasCoords && hasUsableCoords(other.location)) {
            const meters = locationService.calculateDistance(
                candidate.location.latitude,
                candidate.location.longitude,
                other.location.latitude,
                other.location.longitude
            ) * 1000;

            if (meters <= DUPLICATE_RADIUS_METERS) {
                matches.push({
                    report: other,
                    distanceMeters: Math.round(meters),
                    matchedBy: 'location',
                    isSameReporter,
                });
            }
            // Both sides have real coordinates, so distance is the answer either
            // way. A road can run for kilometres; never fall through to a name
            // match that would merge two ends of the same street.
            continue;
        }

        const otherRoad = normalizeRoad(other.location);
        if (
            candidateRoad &&
            otherRoad &&
            candidateRoad === otherRoad &&
            candidate.location.zone === other.location.zone
        ) {
            matches.push({
                report: other,
                distanceMeters: null,
                matchedBy: 'road',
                isSameReporter,
            });
        }
    }

    return matches.sort(
        (a, b) => (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.distanceMeters ?? Number.MAX_SAFE_INTEGER)
    );
}

/**
 * Group a set of reports into clusters of the same underlying defect.
 * Each cluster's first entry is the oldest report, which is the one to keep as
 * the work order. Used to show an RSO how many complaints one repair closes.
 */
export function groupDuplicates(reports: Report[]): Report[][] {
    const byOldest = [...reports].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const clusters: Report[][] = [];
    const claimed = new Set<string>();

    for (const report of byOldest) {
        if (claimed.has(report.id)) continue;

        const cluster = [report];
        claimed.add(report.id);

        for (const match of findDuplicates(report, byOldest)) {
            if (claimed.has(match.report.id)) continue;
            claimed.add(match.report.id);
            cluster.push(match.report);
        }

        clusters.push(cluster);
    }

    return clusters;
}
