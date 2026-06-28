import { glossFor } from "#vocab/glossary.ts";

import { ACTIVITY, COUNTABLE, MASS, RATE, VOLUME } from "tree-sitter-recipe/grammar/units";

interface HoverInfo {
	title: string;
	detail: string;
}

function hover(title: string, detail: string): HoverInfo {
	return { title, detail };
}

const UNIT_KINDS: ReadonlyArray<{ set: readonly string[]; info: HoverInfo }> = /* dprint-ignore */ [
	{ set: RATE, info: hover("Rate unit", "Recognized as a rate-based dose unit.") },
	{ set: MASS, info: hover("Mass unit", "Recognized as a mass dose unit.") },
	{ set: VOLUME, info: hover("Volume unit", "Recognized as a volume dose unit.") },
	{ set: ACTIVITY, info: hover("Activity unit", "Recognized as a biological activity dose unit.") },
	{ set: COUNTABLE, info: hover("Countable unit", "Recognized as a discrete count-based unit.") },
];

const FALLBACK_UNIT_INFO = hover("Dose unit", "Recognized as a valid recipe dose unit.");

function unitHover(token: string): HoverInfo {
	for (const { set, info } of UNIT_KINDS) {
		if (set.includes(token)) {
			return info;
		}
	}
	return FALLBACK_UNIT_INFO;
}

/* dprint-ignore */
const NODE_HOVER_INFO = new Map<string, HoverInfo>([
	["rx_marker", hover("Recipe marker", "Starts the ingredient section (`R/`).")],
	["dispense_marker", hover("Dispense marker", "Starts the pharmacist dispense section (`Da/` or `D/`).")],
	["signa_marker", hover("Signa marker", "Starts the patient directions section (`S/`).")],
	["frequency", hover("Compact frequency", "Recognized compact dosing frequency like `1 dd` or `3dd`.")],
	["frequency_abbrev", hover("Frequency abbreviation", "Recognized Latin-style frequency abbreviation.")],
	["timing_abbrev", hover("Timing abbreviation", "Recognized timing abbreviation.")],
	["route_abbrev", hover("Route abbreviation", "Recognized administration-route abbreviation.")],
	["dispensing_abbrev", hover("Dispensing abbreviation", "Recognized pharmacist dispensing abbreviation.")],
	["warning_abbrev", hover("Warning abbreviation", "Recognized warning abbreviation.")],
	["form_abbrev", hover("Form abbreviation", "Recognized dosage-form abbreviation.")],
	["compounding_abbrev", hover("Compounding abbreviation", "Recognized compounding abbreviation.")],
	["conditional_abbrev", hover("Conditional abbreviation", "Recognized conditional abbreviation.")],
	["fill_marker", hover("Fill-to marker", "`ad` marker used in fill-to-total directives like `ad 100 g`.")],
	["dtd_keyword", hover("Dispense-count directive", "`dtd` / `d.t.d.` directive for dispense counts.")],
	["dtd_no", hover("Dispense-count literal", "Literal `no` inside a `dtd` directive.")],
	["dose", hover("Dose", "A parsed dose made of a number and a unit.")],
]);

export function hoverInfoForNode(nodeType: string, token: string): HoverInfo | null {
	if (nodeType === "unit") return unitHover(token);

	const base = NODE_HOVER_INFO.get(nodeType);
	if (!base) return null;

	/** When the token has a known meaning, lead with the Latin expansion and the Dutch gloss, keeping the category as a subordinate label. */
	const gloss = glossFor(token);
	if (gloss) return { title: gloss.latin, detail: `${gloss.nl}\n\n*${base.title}*` };

	return base;
}
