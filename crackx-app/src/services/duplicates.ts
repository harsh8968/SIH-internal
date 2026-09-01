import { Report, ReportStatus, Location as LocationType } from '../types';
import locationService from './location';
import { normalizeText } from './classify';

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
 *         |
 *         +-- within 150 m AND the two descriptions are semantically alike?
 *         |                              -> duplicate, matchedBy 'semantic'
 *              |
 *              no usable GPS on either side
 *              +-- same road name AND same zone? -> duplicate, matchedBy 'road'
 *
 * Geometry alone is brittle in both directions. GPS drifts indoors and between
 * tall buildings, so one defect can produce complaints 60 m apart; and two
 * genuinely different potholes can sit 20 m apart on the same stretch. Comparing
 * what the citizens actually wrote resolves both cases, so the two signals are
 * used together rather than either alone.
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
 * How far apart two complaints may be and still be argued into one defect by
 * their wording. Three times the GPS radius: enough to absorb positional drift
 * and a citizen standing across the junction, short enough that two distinct
 * defects on one street rarely both fall inside it.
 */
export const SEMANTIC_RADIUS_METERS = 75;

/**
 * Cosine similarity a pair must clear to be called the same defect on wording.
 *
 * Measured against sample complaints, the two classes overlap: genuine
 * duplicates have scored as low as 0.23 when the citizens chose different words
 * ("water collects" against "still not repaired"), while distinct defects have
 * scored as high as 0.55 when only one noun differs ("pothole near the market"
 * against "pothole near the hospital"). No threshold separates them cleanly,
 * because wording alone cannot.
 *
 * So this sits deliberately high. Missing a duplicate costs a redundant work
 * order that an officer can merge by eye. Wrongly merging two defects closes a
 * complaint about a pothole nobody has filled, and the citizen is told it is
 * fixed. The asymmetry decides the direction to err in, and geography is what
 * carries the decision -- this only widens its reach.
 */
export const SEMANTIC_THRESHOLD = 0.5;

/**
 * Words too common to carry meaning. Kept deliberately small: over-pruning
 * strips the very detail that distinguishes two nearby defects.
 */
const STOPWORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 'of', 'to',
    'in', 'on', 'at', 'for', 'with', 'from', 'by', 'this', 'that', 'these', 'it',
    'has', 'have', 'had', 'be', 'been', 'being', 'here', 'there', 'very', 'please',
    'we', 'i', 'my', 'our', 'they', 'their', 'not', 'no', 'so', 'as', 'all', 'can',
    'when', 'where', 'what', 'which', 'who', 'how', 'why', 'will', 'would',
    'should', 'could', 'do', 'does', 'did', 'get', 'got', 'also', 'just', 'now',
    'then', 'than', 'too', 'some', 'any', 'each', 'every', 'other', 'same', 'only',
    'again', 'still', 'after', 'before', 'since', 'while', 'because', 'about',
    'आहे', 'है', 'हैं', 'का', 'की', 'के', 'को', 'में', 'पर', 'और', 'ने', 'से',
    'चा', 'ची', 'चे', 'ला', 'वर', 'आणि', 'हे', 'हा', 'ही',
]);

/**
 * Everything the check actually reads. Narrower than Report so a complaint can
 * be screened before its photo is uploaded; a full Report satisfies it.
 */
export type DuplicateCandidate = Pick<Report, 'id' | 'citizenId' | 'location'> & {
    aiDetection?: Report['aiDetection'];
    description?: Report['description'];
};

export interface DuplicateMatch {
    report: Report;
    /** Metres apart, or null when matched by road name because GPS was unusable. */
    distanceMeters: number | null;
    matchedBy: 'location' | 'road' | 'semantic';
    /**
     * Cosine similarity of the two descriptions, 0-1, or null when either
     * complaint has no text to compare.
     */
    similarity: number | null;
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
 * Crude suffix stripping, applied to ASCII words only.
 *
 * Two people describing one pothole rarely inflect alike -- "skidding" against
 * "skid", "collects" against "collect". Without this they read as different
 * words and the pair scores as unrelated. Indic tokens are left untouched:
 * their morphology does not yield to English suffix rules.
 */
function stem(word: string): string {
    if (!/^[a-z]+$/.test(word) || word.length <= 4) return word;
    for (const suffix of ['ing', 'ed', 'es', 's']) {
        if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
            return word.slice(0, -suffix.length);
        }
    }
    return word;
}

/** Split normalised text into meaningful, stemmed terms. */
function tokenize(text?: string): string[] {
    if (!text) return [];
    return normalizeText(text)
        .split(' ')
        .filter((w) => w.length > 1 && !STOPWORDS.has(w))
        .map(stem);
}

/**
 * Inverse document frequency across the complaints being compared.
 *
 * Without this, every road complaint resembles every other one: "road",
 * "pothole" and "water" are in most of them, and plain term-frequency cosine
 * would score two unrelated potholes as near-identical. Weighting each term by
 * how rare it is means agreement only counts when it is on something specific.
 */
function buildIdf(docs: string[][]): Map<string, number> {
    const docCount = docs.length || 1;
    const seenIn = new Map<string, number>();

    for (const doc of docs) {
        for (const term of new Set(doc)) {
            seenIn.set(term, (seenIn.get(term) || 0) + 1);
        }
    }

    const idf = new Map<string, number>();
    for (const [term, n] of seenIn) {
        // log(1 + N/df) rather than the textbook log(N/df).
        //
        // Duplicate detection often compares a handful of complaints, and with a
        // corpus that small the textbook form drives the weight of any term
        // appearing in both documents to nearly zero -- discarding precisely the
        // shared wording that evidences a duplicate. This form still ranks rare
        // terms above common ones but never lets a shared term stop counting.
        idf.set(term, Math.log(1 + docCount / n));
    }
    return idf;
}

/** TF-IDF weighted vector for one document. */
function vectorize(tokens: string[], idf: Map<string, number>): Map<string, number> {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

    const vec = new Map<string, number>();
    for (const [term, count] of tf) {
        const weight = count * (idf.get(term) ?? Math.log(2));  // log(1 + 1/1)
        if (weight > 0) vec.set(term, weight);
    }
    return vec;
}

/** Cosine similarity, 0 (nothing in common) to 1 (identical wording). */
function cosine(a: Map<string, number>, b: Map<string, number>): number {
    if (a.size === 0 || b.size === 0) return 0;

    let dot = 0;
    // Iterate the smaller vector; the product is zero wherever a term is absent.
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    for (const [term, weight] of small) {
        const other = large.get(term);
        if (other) dot += weight * other;
    }
    if (dot === 0) return 0;

    let magA = 0;
    for (const w of a.values()) magA += w * w;
    let magB = 0;
    for (const w of b.values()) magB += w * w;

    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * How alike two complaints read, 0-1, judged against the surrounding corpus.
 * Exported so a screen can show the score next to a flagged duplicate.
 */
export function textSimilarity(a: string, b: string, corpus: string[] = []): number {
    const tokensA = tokenize(a);
    const tokensB = tokenize(b);
    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    const docs = [tokensA, tokensB, ...corpus.map(tokenize).filter((d) => d.length > 0)];
    const idf = buildIdf(docs);
    return cosine(vectorize(tokensA, idf), vectorize(tokensB, idf));
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

    // IDF is measured across every complaint in play, so "pothole" is correctly
    // treated as unremarkable and "school gate" as distinctive.
    const candidateTokens = tokenize(candidate.description);
    const corpus = existing.map((r) => tokenize(r.description)).filter((d) => d.length > 0);
    const idf = buildIdf(candidateTokens.length > 0 ? [candidateTokens, ...corpus] : corpus);
    const candidateVec = vectorize(candidateTokens, idf);

    const similarityTo = (other: Report): number | null => {
        if (candidateTokens.length === 0) return null;
        const otherTokens = tokenize(other.description);
        if (otherTokens.length === 0) return null;
        return cosine(candidateVec, vectorize(otherTokens, idf));
    };

    for (const other of existing) {
        if (other.id === candidate.id) continue;
        if (!OPEN_STATUSES.includes(other.status)) continue;
        if (!typesMatch(candidateType, other.aiDetection?.damageType)) continue;

        const isSameReporter = other.citizenId === candidate.citizenId;
        const similarity = similarityTo(other);

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
                    similarity,
                });
            } else if (
                meters <= SEMANTIC_RADIUS_METERS &&
                similarity !== null &&
                similarity >= SEMANTIC_THRESHOLD
            ) {
                // Too far apart for geometry to be sure, but the two citizens
                // described the same thing. Proximity still has to hold: identical
                // wording about potholes on opposite sides of the city is not one
                // defect.
                matches.push({
                    report: other,
                    distanceMeters: Math.round(meters),
                    matchedBy: 'semantic',
                    isSameReporter,
                    similarity,
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
                similarity,
            });
        }
    }

    // Closest first, and among equals the most alike first, so the strongest
    // evidence for "this is the same defect" leads.
    return matches.sort((a, b) => {
        const byDistance =
            (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.distanceMeters ?? Number.MAX_SAFE_INTEGER);
        if (byDistance !== 0) return byDistance;
        return (b.similarity ?? 0) - (a.similarity ?? 0);
    });
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
