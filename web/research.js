// Extractive evidence ranking: split sources into passages and score them with IDF-weighted term overlap.

const stop = new Set(
  "the and for that with from this have are was were will into their they them our not but has can its you your about what how does do did"
    .split(" "),
);

/** Conservative suffix stripping so "limitations" matches "limitation" and "evaluated" matches "evaluate". */
export function stem(word) {
  let w = word.replace(/'s$/, "");
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 3 && /[^su]s$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

const tokens = (text) => (text.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || [])
  .filter((token) => !stop.has(token))
  .map(stem);

/**
 * Rank passages across sources. With a question, only passages sharing a term are returned,
 * weighted by rarity; without one, passages rich in collection-wide terms rank first.
 */
export function rank(sources, question = "", limit = 5) {
  const passages = sources.flatMap((source, index) => source.text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((text) => ({ text: text.trim(), source: index }))
    .filter((p) => p.text.length >= 45 && p.text.length <= 700));

  const docs = passages.map((p) => new Set(tokens(p.text)));
  const query = new Set(tokens(question));
  const frequency = new Map();
  docs.forEach((doc) => doc.forEach((term) => frequency.set(term, (frequency.get(term) || 0) + 1)));

  const ranked = passages
    .map((passage, i) => {
      const terms = docs[i];
      const overlap = [...query].filter((term) => terms.has(term));
      const score = query.size
        ? overlap.reduce((sum, term) => sum + Math.log(1 + passages.length / (frequency.get(term) || 1)), 0)
        : [...terms].reduce((sum, term) => sum + Math.log(1 + (frequency.get(term) || 1)), 0) / Math.sqrt(terms.size || 1);
      return { ...passage, score, overlap: overlap.length };
    })
    .filter((p) => !query.size || p.overlap > 0)
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  return ranked
    .filter((p) => {
      const key = tokens(p.text).join(" ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

/** The scanner only reads U.S. government sites (cancer.gov, nih.gov, cdc.gov, and so on). */
export const isGovHost = (hostname) => /(^|\.)[a-z0-9-]+\.gov$/i.test(hostname);

// Original demo notes written for this project. They summarize general, well-established
// information and are not text from any agency or medical advice.
export const samples = [
  {
    title: "Clinical trial phases, in brief",
    url: "",
    sample: true,
    text: "Clinical trials test new ways to prevent, detect, or treat cancer in people who volunteer to take part. Phase I trials usually enroll a small number of people and focus on safety and finding a suitable dose. Phase II trials look at whether a treatment works against a specific cancer and continue to monitor side effects. Phase III trials compare a new treatment with the current standard of care, usually in hundreds or thousands of participants. Every trial has eligibility criteria, such as cancer type, stage, and prior treatment, that decide who can join. Participants give informed consent and can leave a trial at any time. Publicly and privately funded studies are listed in the registry at ClinicalTrials.gov.",
  },
  {
    title: "Screening: benefits and harms",
    url: "",
    sample: true,
    text: "Cancer screening looks for cancer before a person has any symptoms, when it may be easier to treat. Common screening tests include mammograms for breast cancer, colonoscopy and stool-based tests for colorectal cancer, and Pap and HPV tests for cervical cancer. Low-dose CT scans are used to screen some adults with a heavy smoking history for lung cancer. Screening can also cause harm, including false-positive results that lead to extra tests and anxiety. Overdiagnosis happens when screening finds a cancer that would never have caused symptoms or death. Recommendations depend on age, sex, family history, and other risk factors, so screening decisions are best made with a clinician.",
  },
  {
    title: "Reading cancer statistics",
    url: "",
    sample: true,
    text: "Incidence is the number of new cancer cases diagnosed in a population over a period of time, while mortality counts deaths from cancer. Rates are usually reported per 100,000 people so that populations of different sizes can be compared. Age-adjusted rates account for differences in age structure, which matters because cancer risk rises with age. Five-year relative survival compares people with a cancer to people of the same age and sex in the general population. Survival statistics describe large groups of patients diagnosed years ago and cannot predict what will happen to one person. The National Cancer Institute's SEER program collects population-based data on cancer incidence and survival in the United States.",
  },
];
