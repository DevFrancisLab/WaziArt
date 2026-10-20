; Exhibition knowledge for the WaziArt demo.
; These are trusted symbolic definitions, not artist submissions.
; Artist text is never stored in this file.

; The assistant reviews work for one fictional exhibition.
; It does not rank artistic quality and it does not accept or reject work.
(exhibition-theme peace)

(criterion required-information)
(criterion theme-alignment)
(criterion permission-confirmed)
(criterion contested-information)

; Which rule is responsible for each criterion. Graph queries read these facts.
(evaluated-by required-information rule-required)
(evaluated-by theme-alignment rule-theme-support)
(evaluated-by permission-confirmed rule-permission)
(evaluated-by contested-information rule-dispute)

; Structured evidence concepts that support the peace theme.
; A description may mention these words; that text is not evidence.
; Only an explicit (supports Concept Criterion) fact can support a criterion.
(supports reconciliation theme-alignment)
(supports dialogue theme-alignment)
(supports mediation theme-alignment)
(supports ceasefire theme-alignment)
(supports memorial theme-alignment)
(supports community-repair theme-alignment)
