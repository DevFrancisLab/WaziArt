; Sample snapshot for the fictional peace exhibition.
; This file is data. The loader parses it and adds atoms; it does not evaluate it.
; Artwork 001 is the original "Paths to Peace" example.

; --- artwork-001: aligned submission, ready for human review ---
(audit audit-101 submitted artwork-001 artwork-001)
(fact fact-101 artwork-001 title "Paths to Peace")
(fact fact-102 artwork-001 description "Figures meet (and listen) beside a paper river.")
(fact fact-103 artwork-001 theme peace)
(fact fact-104 artwork-001 permission confirmed)
(fact fact-105 artwork-001 evidence evidence-101 reconciliation)
(fact fact-106 artwork-001 evidence-note evidence-101 "The boats meet in the middle of the corridor.")

; --- artwork-002: evidence is present, permission was never supplied ---
(audit audit-201 submitted artwork-002 artwork-002)
(fact fact-201 artwork-002 title "Unfinished Bridge")
(fact fact-202 artwork-002 description "Scaffolding remains on a bridge that neither side has agreed to open.")
(fact fact-203 artwork-002 theme peace)
(fact fact-204 artwork-002 evidence evidence-201 dialogue)

; --- artwork-003: permission is explicitly disputed ---
(audit audit-301 submitted artwork-003 artwork-003)
(fact fact-301 artwork-003 title "Disputed Memorial")
(fact fact-302 artwork-003 description "A shared wall lists names that the two communities do not yet agree how to read.")
(fact fact-303 artwork-003 theme peace)
(fact fact-304 artwork-003 permission disputed)
(fact fact-305 artwork-003 evidence evidence-301 memorial)

; --- artwork-004: permission and theme are present, but the evidence concept does not support the theme ---
(audit audit-401 submitted artwork-004 artwork-004)
(fact fact-401 artwork-004 title "Color Without Context")
(fact fact-402 artwork-004 description "The word reconciliation appears here only as prose, which WaziArt does not treat as evidence.")
(fact fact-403 artwork-004 theme peace)
(fact fact-404 artwork-004 permission confirmed)
(fact fact-405 artwork-004 evidence evidence-401 rainbows)
