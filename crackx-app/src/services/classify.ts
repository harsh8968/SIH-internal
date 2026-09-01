import { Department, DamageType } from '../types';

/**
 * Complaint Classification & Department Routing
 *
 * A citizen writes what is wrong with the road. Which municipal department owns
 * the fix is not obvious from the words alone: "water collects in the pothole"
 * is Engineering's tarmac problem, while "pipeline burst flooded the road" is
 * Water Supply's. Getting this wrong sends a work order to a department that
 * cannot act on it, and the complaint ages while nobody owns it.
 *
 *   complaint text (any language)
 *         |
 *         +-- normalise      lowercase, strip punctuation, collapse whitespace
 *         +-- score          weighted lexicon match per department
 *         +-- vision prior   a confirmed pothole/crack is Engineering's surface
 *         |
 *         v
 *   department + confidence + the terms that decided it
 *
 * The matched terms come back with the answer so an officer can see WHY a
 * complaint landed on their desk, and override it when the classifier is wrong.
 * A black box that silently misroutes is worse than the dropdown it replaces.
 */

/** A term that argues for one department, and how strongly. */
interface Term {
    /**
     * Matched as a whole word when ASCII, as a substring otherwise: Devanagari
     * and Kannada do not separate words in a way \b understands.
     */
    t: string;
    /** 3 = decisive on its own, 2 = strong, 1 = weak corroboration. */
    w: 1 | 2 | 3;
}

/**
 * Weights matter more than coverage here. "water" appears in most road
 * complaints ("water collects", "water logging") and must never outvote a
 * decisive phrase like "pipeline burst", or every rainy-season pothole would
 * be routed to Water Supply.
 */
const LEXICON: Record<Department, Term[]> = {
    Engineering: [
        { t: 'pothole', w: 3 }, { t: 'potholes', w: 3 }, { t: 'crack', w: 3 },
        { t: 'cracks', w: 3 }, { t: 'cracked', w: 3 }, { t: 'road surface', w: 3 },
        { t: 'resurface', w: 3 }, { t: 'resurfacing', w: 3 }, { t: 'asphalt', w: 3 },
        { t: 'tarmac', w: 3 }, { t: 'speed breaker', w: 3 }, { t: 'speed bump', w: 3 },
        { t: 'footpath', w: 2 }, { t: 'pavement', w: 2 }, { t: 'bridge', w: 2 },
        { t: 'culvert', w: 2 }, { t: 'uneven', w: 2 }, { t: 'sunken', w: 2 },
        { t: 'broken road', w: 2 }, { t: 'damaged road', w: 2 }, { t: 'patch', w: 1 },
        { t: 'road', w: 1 }, { t: 'repair', w: 1 },
        { t: 'गड्ढा', w: 3 }, { t: 'गड्ढे', w: 3 }, { t: 'दरार', w: 3 },
        { t: 'सड़क', w: 1 }, { t: 'मरम्मत', w: 1 }, { t: 'फुटपाथ', w: 2 },
        { t: 'खड्डा', w: 3 }, { t: 'खड्डे', w: 3 }, { t: 'भेग', w: 3 },
        { t: 'रस्ता', w: 1 }, { t: 'रस्त्या', w: 1 }, { t: 'दुरुस्ती', w: 1 },
        { t: 'ಗುಂಡಿ', w: 3 }, { t: 'ಬಿರುಕು', w: 3 }, { t: 'ರಸ್ತೆ', w: 1 },
    ],
    'Water Supply': [
        { t: 'pipeline', w: 3 }, { t: 'pipe burst', w: 3 }, { t: 'water pipe', w: 3 },
        { t: 'water leak', w: 3 }, { t: 'leaking pipe', w: 3 }, { t: 'water main', w: 3 },
        { t: 'drinking water', w: 3 }, { t: 'water supply', w: 3 }, { t: 'borewell', w: 3 },
        { t: 'valve', w: 2 }, { t: 'leakage', w: 2 }, { t: 'leaking', w: 2 },
        { t: 'seepage', w: 2 }, { t: 'tap', w: 2 }, { t: 'pipe', w: 2 },
        { t: 'पाइपलाइन', w: 3 }, { t: 'पाइप', w: 2 }, { t: 'रिसाव', w: 2 },
        { t: 'नल', w: 2 }, { t: 'जलापूर्ति', w: 3 },
        { t: 'पाईपलाईन', w: 3 }, { t: 'पाईप', w: 2 }, { t: 'गळती', w: 2 },
        { t: 'नळ', w: 2 }, { t: 'पाणीपुरवठा', w: 3 },
        { t: 'ಪೈಪ್', w: 2 }, { t: 'ಸೋರಿಕೆ', w: 2 }, { t: 'ನೀರು ಸರಬರಾಜು', w: 3 },
    ],
    Sanitation: [
        { t: 'garbage', w: 3 }, { t: 'trash', w: 3 }, { t: 'rubbish', w: 3 },
        { t: 'sewage', w: 3 }, { t: 'sewer', w: 3 }, { t: 'manhole', w: 3 },
        { t: 'blocked drain', w: 3 }, { t: 'open drain', w: 3 }, { t: 'nala', w: 3 },
        { t: 'dumping', w: 3 }, { t: 'drain', w: 2 }, { t: 'drainage', w: 2 },
        { t: 'gutter', w: 2 }, { t: 'debris', w: 2 }, { t: 'waste', w: 2 },
        { t: 'filth', w: 2 }, { t: 'stink', w: 2 }, { t: 'smell', w: 1 },
        { t: 'कचरा', w: 3 }, { t: 'कूड़ा', w: 3 }, { t: 'नाली', w: 2 },
        { t: 'गटर', w: 2 }, { t: 'सीवर', w: 3 }, { t: 'गंदगी', w: 2 },
        { t: 'गटार', w: 2 }, { t: 'घाण', w: 2 },
        { t: 'ಕಸ', w: 3 }, { t: 'ಚರಂಡಿ', w: 2 }, { t: 'ಒಳಚರಂಡಿ', w: 3 },
    ],
    'Disaster Management': [
        { t: 'landslide', w: 3 }, { t: 'collapsed', w: 3 }, { t: 'collapse', w: 3 },
        { t: 'washed away', w: 3 }, { t: 'subsidence', w: 3 }, { t: 'cave in', w: 3 },
        { t: 'caved in', w: 3 }, { t: 'flooded', w: 3 }, { t: 'flooding', w: 3 },
        { t: 'waterlogged', w: 3 }, { t: 'water logging', w: 3 }, { t: 'flood', w: 2 },
        { t: 'emergency', w: 2 }, { t: 'accident', w: 2 }, { t: 'injured', w: 2 },
        { t: 'storm', w: 2 }, { t: 'danger', w: 1 }, { t: 'dangerous', w: 1 },
        // A falling tree gets described many ways round; match the noun and the
        // participle separately rather than guessing every word order.
        { t: 'fallen tree', w: 3 }, { t: 'tree fell', w: 3 }, { t: 'tree has fallen', w: 3 },
        { t: 'tree fallen', w: 3 }, { t: 'tree collapsed', w: 3 }, { t: 'tree', w: 2 },
        { t: 'fallen', w: 1 },
        { t: 'बाढ़', w: 3 }, { t: 'जलभराव', w: 3 }, { t: 'भूस्खलन', w: 3 },
        { t: 'पेड़ गिर', w: 3 }, { t: 'दुर्घटना', w: 2 }, { t: 'खतरा', w: 1 },
        { t: 'पूर', w: 3 }, { t: 'पाणी साचले', w: 3 }, { t: 'झाड पडले', w: 3 },
        { t: 'कोसळ', w: 3 }, { t: 'अपघात', w: 2 }, { t: 'धोका', w: 1 },
        { t: 'ಪ್ರವಾಹ', w: 3 }, { t: 'ಭೂಕುಸಿತ', w: 3 }, { t: 'ಅಪಘಾತ', w: 2 },
    ],
    Traffic: [
        { t: 'traffic signal', w: 3 }, { t: 'traffic light', w: 3 }, { t: 'signal', w: 3 },
        { t: 'zebra crossing', w: 3 }, { t: 'road marking', w: 3 }, { t: 'divider', w: 3 },
        { t: 'median', w: 3 }, { t: 'sign board', w: 3 }, { t: 'signboard', w: 3 },
        { t: 'street light', w: 3 }, { t: 'streetlight', w: 3 }, { t: 'encroachment', w: 3 },
        { t: 'junction', w: 2 }, { t: 'one way', w: 2 }, { t: 'parking', w: 2 },
        { t: 'traffic', w: 2 }, { t: 'lamp', w: 1 },
        { t: 'सिग्नल', w: 3 }, { t: 'यातायात', w: 2 }, { t: 'डिवाइडर', w: 3 },
        { t: 'स्ट्रीट लाइट', w: 3 }, { t: 'चौराहा', w: 2 },
        { t: 'वाहतूक', w: 2 }, { t: 'दुभाजक', w: 3 }, { t: 'चौक', w: 2 },
        { t: 'ಸಿಗ್ನಲ್', w: 3 }, { t: 'ಸಂಚಾರ', w: 2 }, { t: 'ಜಂಕ್ಷನ್', w: 2 },
    ],
};

const DEPARTMENTS = Object.keys(LEXICON) as Department[];

/**
 * A confirmed pothole or crack in the photograph is direct evidence about the
 * road surface, which is Engineering's. Weighted to match one decisive word so
 * it can settle an otherwise tied complaint without overruling a clear phrase
 * like "pipeline burst".
 */
const VISION_PRIOR_WEIGHT = 3;
const VISION_PRIOR_MIN_CONFIDENCE = 0.4;

/** Where a complaint goes when nothing in it points anywhere. */
export const DEFAULT_DEPARTMENT: Department = 'Engineering';

/** Below this the winner rests on a single weak word: a guess, not a decision. */
const REVIEW_SCORE_THRESHOLD = 2;

export interface ClassificationResult {
    department: Department;
    /** 0-1. How much of the total evidence pointed at the winner. */
    confidence: number;
    /** The terms that decided it, strongest first, for display to an officer. */
    matchedTerms: string[];
    /** Per-department totals, for a breakdown view. */
    scores: Record<Department, number>;
    /** True when the routing is too weakly evidenced to trust unreviewed. */
    needsReview: boolean;
}

/**
 * Lowercase, drop punctuation, collapse whitespace. Indic scripts are left
 * alone beyond this: they have no case, and their characters must survive.
 */
export function normalizeText(raw: string): string {
    return (raw || '')
        .toLowerCase()
        .replace(/[.,!?;:()"`_/\\[\]{}]/g, ' ')
        .replace(/['\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** ASCII terms match whole words; Indic terms match as substrings. */
function containsTerm(haystack: string, term: string): boolean {
    const isAscii = /^[\x00-\x7F]+$/.test(term);
    if (!isAscii) return haystack.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|\\s)' + escaped + '(\\s|$)').test(haystack);
}

/**
 * Decide which department owns a complaint.
 *
 * `text` may be empty: a photo-only report still classifies, on the vision
 * prior alone, rather than refusing to route.
 */
export function classifyComplaint(
    text: string,
    vision?: { damageType?: DamageType; confidence?: number }
): ClassificationResult {
    const normalized = normalizeText(text);

    const scores = DEPARTMENTS.reduce((acc, d) => {
        acc[d] = 0;
        return acc;
    }, {} as Record<Department, number>);

    // Collected with weights so the explanation leads with what mattered most.
    const hits: { term: string; weight: number }[] = [];

    for (const dept of DEPARTMENTS) {
        for (const { t, w } of LEXICON[dept]) {
            if (containsTerm(normalized, t)) {
                scores[dept] += w;
                hits.push({ term: t, weight: w });
            }
        }
    }

    const isSurfaceDefect = vision?.damageType === 'pothole' || vision?.damageType === 'crack';
    const visionConfident = (vision?.confidence ?? 0) >= VISION_PRIOR_MIN_CONFIDENCE;
    if (isSurfaceDefect && visionConfident) {
        scores.Engineering += VISION_PRIOR_WEIGHT;
        hits.push({ term: 'photo: ' + vision!.damageType, weight: VISION_PRIOR_WEIGHT });
    }

    const total = DEPARTMENTS.reduce((sum, d) => sum + scores[d], 0);

    if (total === 0) {
        return {
            department: DEFAULT_DEPARTMENT,
            confidence: 0,
            matchedTerms: [],
            scores,
            needsReview: true,
        };
    }

    // Ties go to the earlier department in LEXICON order, which puts Engineering
    // first: the road surface is the safe default owner for a road complaint.
    let winner: Department = DEFAULT_DEPARTMENT;
    let best = -1;
    for (const dept of DEPARTMENTS) {
        if (scores[dept] > best) {
            best = scores[dept];
            winner = dept;
        }
    }

    const matchedTerms = hits
        .sort((a, b) => b.weight - a.weight)
        .map((h) => h.term)
        .filter((term, i, arr) => arr.indexOf(term) === i)
        .slice(0, 5);

    return {
        department: winner,
        confidence: Math.min(1, best / total),
        matchedTerms,
        needsReview: best < REVIEW_SCORE_THRESHOLD,
        scores,
    };
}
