import unittest

from app.extractor import Document
from app.summarizer import extractive_summary, rank_evidence


class SummarizerTests(unittest.TestCase):
    def test_query_terms_raise_relevant_evidence(self):
        documents = [
            Document(
                title="Readiness",
                url="https://example.com/readiness",
                text=(
                    "Forecasting helps teams identify aircraft parts that may face a shortage in the next sixty days. "
                    "The dashboard also reports general inventory totals for each warehouse location. "
                    "Risk scoring combines demand, supply, and lead-time signals so analysts can prioritize parts."
                ),
            )
        ]
        evidence = rank_evidence(documents, "Which parts may face a shortage?", 2)
        self.assertEqual(len(evidence), 2)
        self.assertIn("shortage", evidence[0].sentence.lower())

    def test_summary_includes_source_markers(self):
        documents = [
            Document(
                title="Models",
                url="https://example.com/models",
                text=(
                    "The evaluation compares model precision across three representative datasets. "
                    "Results are reviewed before the selected model is approved for deployment."
                ),
            )
        ]
        summary = extractive_summary(rank_evidence(documents, None, 2))
        self.assertIn("[1]", summary)


if __name__ == "__main__":
    unittest.main()
