/** Latin expansion + Dutch gloss for recognized recipe abbreviations.
 *
 * NOTE: this is a meanings layer keyed by the same tokens `tree-sitter-recipe`
 * recognizes. It deliberately duplicates the upstream token spelling (the
 * repo's usual rule is "no parallel lists") because the grammar exports only
 * recognition data, not semantics, and these meanings are wanted in hover now.
 * Keys are matched case-insensitively, so a single entry covers the grammar's
 * upper/lower spelling variants. Tokens whose meaning is uncertain are left
 * out on purpose — hover then falls back to the generic category label. */

export interface Gloss {
	/** The expanded Latin (or Dutch) phrase the abbreviation stands for. */
	latin: string;
	/** A short Dutch explanation of what it instructs. */
	nl: string;
}

interface GlossEntry {
	tokens: readonly string[];
	latin: string;
	nl: string;
}

const ENTRIES: readonly GlossEntry[] = /* dprint-ignore */ [
	// Frequency
	{ tokens: ["b.d.d.", "b.i.d."], latin: "bis de die", nl: "tweemaal daags" },
	{ tokens: ["t.d.d.", "t.i.d."], latin: "ter de die", nl: "driemaal daags" },
	{ tokens: ["q.i.d."], latin: "quater in die", nl: "viermaal daags" },
	{ tokens: ["s.d.d.", "s.i.d."], latin: "semel de die", nl: "eenmaal daags" },
	{ tokens: ["d.d."], latin: "de die", nl: "per dag" },
	{ tokens: ["q.h."], latin: "quaque hora", nl: "elk uur" },
	{ tokens: ["q.2h."], latin: "quaque secunda hora", nl: "elke 2 uur" },
	{ tokens: ["q.3h."], latin: "quaque tertia hora", nl: "elke 3 uur" },
	{ tokens: ["q.4h."], latin: "quaque quarta hora", nl: "elke 4 uur" },
	{ tokens: ["q.6h."], latin: "quaque sexta hora", nl: "elke 6 uur" },
	{ tokens: ["q.8h."], latin: "quaque octava hora", nl: "elke 8 uur" },
	{ tokens: ["q.12h."], latin: "quaque duodecima hora", nl: "elke 12 uur" },
	{ tokens: ["q.d."], latin: "quaque die", nl: "elke dag" },
	{ tokens: ["q.a.d.", "q.o.d."], latin: "quaque alterna die", nl: "om de andere dag" },
	{ tokens: ["q.a.m."], latin: "quaque ante meridiem", nl: "elke ochtend" },
	{ tokens: ["q.p.m."], latin: "quaque post meridiem", nl: "elke avond" },
	{ tokens: ["q.w."], latin: "quaque septimana", nl: "elke week" },
	{ tokens: ["b.i.w."], latin: "bis in septimana", nl: "tweemaal per week" },
	{ tokens: ["t.i.w."], latin: "ter in septimana", nl: "driemaal per week" },
	// Timing
	{ tokens: ["a.c.", "h.a.c."], latin: "ante cibum", nl: "voor de maaltijd" },
	{ tokens: ["p.c.", "h.p.c."], latin: "post cibum", nl: "na de maaltijd" },
	{ tokens: ["a.n."], latin: "ante noctem", nl: "voor de nacht" },
	{ tokens: ["h.s."], latin: "hora somni", nl: "voor het slapengaan" },
	{ tokens: ["i.c."], latin: "inter cibos", nl: "tussen de maaltijden" },
	{ tokens: ["mane"], latin: "mane", nl: "'s ochtends" },
	{ tokens: ["nocte"], latin: "nocte", nl: "'s nachts" },
	{ tokens: ["vesp."], latin: "vespere", nl: "'s avonds" },
	{ tokens: ["matut."], latin: "matutino", nl: "'s ochtends" },
	{ tokens: ["m. et v."], latin: "mane et vespere", nl: "'s ochtends en 's avonds" },
	{ tokens: ["mane et nocte"], latin: "mane et nocte", nl: "'s ochtends en 's nachts" },
	{ tokens: ["inter cibos"], latin: "inter cibos", nl: "tussen de maaltijden" },
	{ tokens: ["ante prandium"], latin: "ante prandium", nl: "voor het middageten" },
	{ tokens: ["post prandium"], latin: "post prandium", nl: "na het middageten" },
	{ tokens: ["hora somni"], latin: "hora somni", nl: "voor het slapengaan" },
	{ tokens: ["in ieiunio"], latin: "in ieiunio", nl: "op de nuchtere maag" },
	// Route
	{ tokens: ["i.m.", "im"], latin: "intramusculair", nl: "in de spier" },
	{ tokens: ["i.v.", "iv"], latin: "intraveneus", nl: "in de ader" },
	{ tokens: ["s.c.", "sc", "sq"], latin: "subcutaan", nl: "onder de huid" },
	{ tokens: ["s.l.", "sl", "subling."], latin: "sublinguaal", nl: "onder de tong" },
	{ tokens: ["p.o.", "po", "per os"], latin: "per os", nl: "oraal, via de mond" },
	{ tokens: ["p.r.", "pr", "rect.", "per rectum"], latin: "per rectum", nl: "rectaal" },
	{ tokens: ["p.v.", "pv", "vag.", "per vaginam"], latin: "per vaginam", nl: "vaginaal" },
	{ tokens: ["i.n.", "nas."], latin: "intranasaal", nl: "in de neus" },
	{ tokens: ["inh.", "per inhalationem"], latin: "per inhalationem", nl: "via inhalatie" },
	{ tokens: ["neb."], latin: "nebula", nl: "via vernevelaar" },
	{ tokens: ["top."], latin: "topicaal", nl: "plaatselijk op de huid" },
	{ tokens: ["buc."], latin: "buccaal", nl: "in de wangzak" },
	{ tokens: ["transd."], latin: "transdermaal", nl: "door de huid" },
	{ tokens: ["i.a."], latin: "intra-arterieel", nl: "in de slagader" },
	{ tokens: ["i.d."], latin: "intradermaal", nl: "in de huid" },
	{ tokens: ["i.t."], latin: "intrathecaal", nl: "in het ruggenmergvocht" },
	{ tokens: ["i.o."], latin: "intraossaal", nl: "in het bot" },
	{ tokens: ["i.p."], latin: "intraperitoneaal", nl: "in de buikholte" },
	{ tokens: ["epid."], latin: "epiduraal", nl: "in de epidurale ruimte" },
	{ tokens: ["o.d."], latin: "oculus dexter", nl: "rechteroog" },
	{ tokens: ["o.s."], latin: "oculus sinister", nl: "linkeroog" },
	{ tokens: ["o.u."], latin: "oculus uterque", nl: "beide ogen" },
	{ tokens: ["u.e.", "ad us. ext."], latin: "usus externus", nl: "uitwendig gebruik" },
	{ tokens: ["ad us. int."], latin: "ad usum internum", nl: "voor inwendig gebruik" },
	{ tokens: ["in ocul."], latin: "in oculo", nl: "in het oog" },
	{ tokens: ["in aur."], latin: "in aure", nl: "in het oor" },
	{ tokens: ["in nar."], latin: "in nare", nl: "in de neus" },
	// Dispensing
	{ tokens: ["d.i.m.m."], latin: "da in mano medici", nl: "in handen van de arts afgeven" },
	{ tokens: ["u.d.", "ut dict."], latin: "ut dictum", nl: "zoals voorgeschreven" },
	{ tokens: ["m.d.u."], latin: "more dicto utendus", nl: "te gebruiken zoals voorgeschreven" },
	{ tokens: ["m. dict."], latin: "more dicto", nl: "zoals voorgeschreven" },
	{ tokens: ["sig."], latin: "signa", nl: "etiketteer met gebruiksaanwijzing" },
	{ tokens: ["rep."], latin: "repetatur", nl: "herhalen" },
	{ tokens: ["n.r.", "non rep."], latin: "non repetatur", nl: "niet herhalen" },
	{ tokens: ["disp."], latin: "dispensatur", nl: "afleveren" },
	{ tokens: ["z.n."], latin: "zo nodig", nl: "zo nodig gebruiken" },
	{ tokens: ["sec. art."], latin: "secundum artem", nl: "volgens de regels van de kunst" },
	// Forms
	{ tokens: ["aq. pur."], latin: "aqua purificata", nl: "gezuiverd water" },
	{ tokens: ["aq. dest."], latin: "aqua destillata", nl: "gedestilleerd water" },
	{ tokens: ["aq. pro inj."], latin: "aqua pro injectione", nl: "water voor injectie" },
	{ tokens: ["collut."], latin: "collutorium", nl: "mondspoeling" },
	{ tokens: ["lin."], latin: "linimentum", nl: "smeersel" },
	{ tokens: ["supp."], latin: "suppositorium", nl: "zetpil" },
	{ tokens: ["pulv."], latin: "pulvis", nl: "poeder" },
	{ tokens: ["pulv. adsp."], latin: "pulvis adspersorius", nl: "strooipoeder" },
	{ tokens: ["ungt.", "ung."], latin: "unguentum", nl: "zalf" },
	{ tokens: ["unguent. opht."], latin: "unguentum ophthalmicum", nl: "oogzalf" },
	{ tokens: ["emp."], latin: "emplastrum", nl: "pleister" },
	{ tokens: ["sol."], latin: "solutio", nl: "oplossing" },
	{ tokens: ["sol. inj."], latin: "solutio iniectabilis", nl: "injectie-oplossing" },
	{ tokens: ["susp."], latin: "suspensio", nl: "suspensie" },
	{ tokens: ["syr."], latin: "syrupus", nl: "siroop" },
	{ tokens: ["inj."], latin: "injectio", nl: "injectievloeistof" },
	{ tokens: ["crm."], latin: "cremor", nl: "crème" },
	{ tokens: ["tinct."], latin: "tinctura", nl: "tinctuur" },
	{ tokens: ["mixt."], latin: "mixtura", nl: "mengsel om in te nemen" },
	{ tokens: ["elix."], latin: "elixir", nl: "elixer" },
	{ tokens: ["troch."], latin: "trochiscus", nl: "zuigtablet" },
	{ tokens: ["past."], latin: "pasta", nl: "pasta" },
	{ tokens: ["aeros."], latin: "aerosolum", nl: "aerosol" },
	{ tokens: ["gel."], latin: "gelatum", nl: "gel" },
	{ tokens: ["gtt aur."], latin: "guttae auriculares", nl: "oordruppels" },
	{ tokens: ["gtt nas."], latin: "guttae nasales", nl: "neusdruppels" },
	{ tokens: ["gtt ophth."], latin: "guttae ophthalmicae", nl: "oogdruppels" },
	// Compounding
	{ tokens: ["mf", "m.f."], latin: "misce fiat", nl: "meng en maak" },
	{ tokens: ["aa", "aa."], latin: "ana", nl: "van elk een gelijk deel" },
	{ tokens: ["q.s."], latin: "quantum satis", nl: "zoveel als nodig is" },
	{ tokens: ["q.p."], latin: "quantum placet", nl: "zoveel als gewenst" },
	{ tokens: ["f.", "ft."], latin: "fiat", nl: "maak" },
	{ tokens: ["div."], latin: "divide", nl: "verdeel" },
	{ tokens: ["solve"], latin: "solve", nl: "los op" },
	{ tokens: ["coq."], latin: "coque", nl: "kook" },
	{ tokens: ["m.f. pulv."], latin: "misce fiat pulvis", nl: "meng en maak een poeder" },
	{ tokens: ["m.f. caps."], latin: "misce fiat capsulae", nl: "meng en maak capsules" },
	{ tokens: ["m.f. ungt."], latin: "misce fiat unguentum", nl: "meng en maak een zalf" },
	{ tokens: ["m.f. sol."], latin: "misce fiat solutio", nl: "meng en maak een oplossing" },
	{ tokens: ["m.f. susp."], latin: "misce fiat suspensio", nl: "meng en maak een suspensie" },
	{ tokens: ["m. et ft."], latin: "misce et fiat", nl: "meng en maak" },
	{ tokens: ["ad lib."], latin: "ad libitum", nl: "naar behoefte" },
	{ tokens: ["div. in p. aeq."], latin: "divide in partes aequales", nl: "verdeel in gelijke delen" },
	{ tokens: ["div. in d."], latin: "divide in doses", nl: "verdeel in doses" },
	// Conditional
	{ tokens: ["s.o.s.", "si opus"], latin: "si opus sit", nl: "zo nodig" },
	{ tokens: ["p.r.n.", "prn"], latin: "pro re nata", nl: "zo nodig, naar behoefte" },
	{ tokens: ["si nec. sit"], latin: "si necesse sit", nl: "indien nodig" },
	// Warning
	{ tokens: ["cito"], latin: "cito", nl: "met spoed" },
	{ tokens: ["stat"], latin: "statim", nl: "onmiddellijk" },
	{ tokens: ["pim", "p.i."], latin: "periculum in mora", nl: "gevaar bij uitstel" },
	// Directives
	{ tokens: ["dtd", "d.t.d."], latin: "da tales doses", nl: "geef zulke doses" },
	{ tokens: ["ad"], latin: "ad", nl: "aanvullen tot het genoemde totaal" },
];

function buildGlossary(): ReadonlyMap<string, Gloss> {
	const pairs: Array<[string, Gloss]> = [];
	for (const entry of ENTRIES) {
		for (const token of entry.tokens) {
			pairs.push([token.toLowerCase(), { latin: entry.latin, nl: entry.nl }]);
		}
	}
	return new Map(pairs);
}

const GLOSSARY = buildGlossary();

/** Look up the Latin expansion and Dutch gloss for an abbreviation token, case-insensitively. */
export function glossFor(token: string): Gloss | null {
	return GLOSSARY.get(token.toLowerCase()) ?? null;
}
